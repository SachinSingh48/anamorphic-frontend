import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../Context/AuthContext';
import { useToast } from '../../Context/ToastContext';
import Header from '../Shared/Header';
import UserList from './UserList';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import AddFriendsModal from './AddFriendsModal';

// ElGamal
import { getSessionKeys, NormalDecrypt, DoubleDecrypt } from '../../crypto/anamorphicCrypto';
import { jsonRestore } from '../../crypto/cryptoUtils';

// Dual Regev
import {
  getDRSession,
  drDecryptPublic,
  drDecryptSecret,
  drDeserializePublicKey,
} from '../../dualregev';

export default function ChatRoom() {
  const { user, logout, token, cryptoReady } = useAuth();
  const { showToast } = useToast();

  const [friends, setFriends]                 = useState([]);
  const [messages, setMessages]               = useState([]);
  const [loading, setLoading]                 = useState(false);
  const [showKeys, setShowKeys]               = useState(false);
  const [isMobileMenuOpen, setMobileMenu]     = useState(false);
  const [showAddFriends, setShowAddFriends]   = useState(false);

  // Combined pubkey from server: { elgamal: rawDkey, dualregev: rawApk }
  const [friendPubkey, setFriendPubkey]       = useState(null);
  const [fetchingKey, setFetchingKey]         = useState(false);

  // Active scheme for this conversation — auto-selects best available
  const [activeScheme, setActiveScheme]       = useState('elgamal');

  const [selectedUser, setSelectedUser] = useState(() => {
    try {
      const s = sessionStorage.getItem('selectedUser');
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  });

  const wsRef = useRef(null);

  // ── Mount ────────────────────────────────────────────────────────────────
  useEffect(() => {
    loadFriends();
    connectWebSocket();
    return () => wsRef.current?.close();
  }, [token]);

  // ── Selected user changed ─────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedUser || !token) return;
    fetchFriendPubkey(selectedUser.username);
    loadMessageHistory();
  }, [selectedUser]);

  // ── Re-decrypt history after key file upload on reload ────────────────────
  useEffect(() => {
    if (cryptoReady && selectedUser) loadMessageHistory();
  }, [cryptoReady]);

  // ── Fresh onmessage — reassigned when selectedUser/cryptoReady changes ────
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws) return;

    ws.onmessage = async (event) => {
      try {
        const data        = JSON.parse(event.data);
        if (data.type !== 'message') return;

        const dataFrom       = Number(data.from);
        const dataTo         = Number(data.to);
        const currentUserId  = Number(user.id);
        const selectedUserId = Number(selectedUser?.id);

        const isFromCurrentChat =
          (dataFrom === selectedUserId && dataTo === currentUserId) ||
          (dataFrom === currentUserId  && dataTo === selectedUserId);

        if (!isFromCurrentChat) return;
        if (dataFrom === currentUserId) return; // own echo — added optimistically

        // jsonRestore handles ElGamal BigInt tags; DR bodies are plain numbers (no-op)
        const body   = jsonRestore(data.body);
        const scheme = body.scheme ?? 'elgamal';

        const { public_message, secret_message } = await _decrypt(scheme, body);

        setMessages(prev => [...prev, {
          id:             `msg-${data.from}-${data.timestamp}`,
          sender_id:      dataFrom,
          sender_name:    selectedUser?.username || 'Unknown',
          public_message,
          secret_message,
          scheme,
          timestamp:      new Date(data.timestamp * 1000).toISOString(),
          status:         'received',
        }]);
      } catch (err) {
        console.error('[ChatRoom] WS error:', err);
      }
    };
  }, [selectedUser, user, cryptoReady]);

  // ── Friend pubkey (session-cached) ───────────────────────────────────────

  const fetchFriendPubkey = async (username) => {
    setFriendPubkey(null);
    setFetchingKey(true);
    try {
      const cacheKey = `friendPubkey_${username}`;
      const cached   = sessionStorage.getItem(cacheKey);
      let   raw;

      if (cached) {
        raw = JSON.parse(cached);
      } else {
        const res = await fetch(`http://localhost:8000/keys/get/${username}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          showToast(`${username} hasn't set up encryption keys yet`, 'error');
          return;
        }
        raw = (await res.json()).pubkey;
        sessionStorage.setItem(cacheKey, JSON.stringify(raw));
      }

      setFriendPubkey(raw);

      // Auto-select best scheme: prefer DR (post-quantum) when available
      if (raw.dualregev) {
        setActiveScheme('dualregev');
      } else {
        setActiveScheme('elgamal');
      }

      console.log(`[ChatRoom] Key loaded for ${username} — scheme: ${raw.dualregev ? 'dualregev' : 'elgamal'}`);
    } catch {
      showToast('Failed to fetch friend encryption key', 'error');
    } finally {
      setFetchingKey(false);
    }
  };

  // ── Decrypt helper (routes by scheme) ────────────────────────────────────

  const _decrypt = async (scheme, body) => {
    if (scheme === 'dualregev') {
      const drKeys = getDRSession();
      if (!drKeys) return { public_message: '[no DR key loaded]', secret_message: null };
      try {
        const [pub, sec] = await Promise.all([
          drDecryptPublic(drKeys.apk, drKeys.ask, body),
          drDecryptSecret(drKeys.apk, drKeys.tk,  body),
        ]);
        return { public_message: pub, secret_message: sec };
      } catch (e) {
        console.error('[ChatRoom] DR decrypt error:', e);
        return { public_message: '[decryption failed]', secret_message: null };
      }
    }

    // ElGamal (default)
    const egKeys = getSessionKeys();
    if (!egKeys) return { public_message: '[no EG key loaded]', secret_message: null };

    // Legacy unencrypted messages
    if (!body.ct0) {
      return {
        public_message: body.public_message ?? '[no content]',
        secret_message: null,
      };
    }
    try {
      const [pub, sec] = await Promise.all([
        NormalDecrypt(egKeys.aSK,  body),
        DoubleDecrypt(egKeys.dkey, body),
      ]);
      return { public_message: pub, secret_message: sec };
    } catch (e) {
      console.error('[ChatRoom] EG decrypt error:', e);
      return { public_message: '[decryption failed]', secret_message: null };
    }
  };

  // ── Message history ───────────────────────────────────────────────────────

  const loadMessageHistory = async () => {
    try {
      const res = await fetch('http://localhost:8000/messages/history', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ with_user: selectedUser.username, limit: 50, before_ts: null }),
      });
      if (!res.ok) throw new Error();
      const { items } = await res.json();
      const currentUserId = Number(user.id);

      const decrypted = await Promise.all(items.map(async (msg) => {
        const senderIdNum = Number(msg.from);
        const isMine      = senderIdNum === currentUserId;
        const body        = jsonRestore(msg.body);
        const scheme      = body.scheme ?? 'elgamal';

        let result;
        try {
          if (isMine) {
            result = await _decryptSenderCopy(body, scheme);
          } else {
            result = await _decrypt(scheme, body);
          }
        } catch (e) {
          console.error('[ChatRoom] History decrypt error:', e);
          result = { public_message: '[decryption failed]', secret_message: null };
        }

        return {
          id:             `msg-${msg.from}-${msg.timestamp}`,
          sender_id:      senderIdNum,
          sender_name:    isMine ? user.username : selectedUser.username,
          public_message: result.public_message,
          secret_message: result.secret_message,
          scheme,
          timestamp:      new Date(msg.timestamp * 1000).toISOString(),
          status:         'sent',
        };
      }));

      setMessages(decrypted);
    } catch (err) {
      console.error('[ChatRoom] History load error:', err);
      setMessages([]);
    }
  };

  // Decrypt sender_copy — messages sent by the current user
  const _decryptSenderCopy = async (body, scheme) => {
    // Legacy: old messages with sender_plain plaintext
    if (!body.sender_copy) {
      return {
        public_message: body.sender_plain?.public_message ?? '[sent]',
        secret_message: body.sender_plain?.secret_message ?? null,
      };
    }

    const copy       = body.sender_copy;
    const copyScheme = copy.scheme ?? (copy.ct0 ? 'elgamal' : 'dualregev');
    return _decrypt(copyScheme, copy);
  };

  // ── Handlers ─────────────────────────────────────────────────────────────

  const connectWebSocket = () => {
    const ws = new WebSocket(`ws://localhost:8000/ws?token=${token}`);
    ws.onopen  = () => showToast('Connected to chat server ✓', 'success');
    ws.onerror = () => showToast('Connection error', 'error');
    ws.onclose = () => console.log('[ChatRoom] WS disconnected');
    wsRef.current = ws;
  };

  const handleSelectUser = (u) => {
    setSelectedUser(u);
    setMessages([]);
    setFriendPubkey(null);
    sessionStorage.setItem('selectedUser', JSON.stringify(u));
    setMobileMenu(false);
  };

  const handleSendMessage = (publicMsg, secretMsg, scheme) => {
    setMessages(prev => [...prev, {
      id:             `msg-${user.id}-${Date.now()}`,
      sender_id:      Number(user.id),
      sender_name:    user.username,
      public_message: publicMsg,
      secret_message: secretMsg ?? null,
      scheme:         scheme ?? 'elgamal',
      timestamp:      new Date().toISOString(),
      status:         'sent',
    }]);
  };

  const loadFriends = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:8000/friends/list', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      setFriends((await res.json()).friends || []);
    } catch { showToast('Failed to load friends', 'error'); }
    finally   { setLoading(false); }
  };

  const handleAddFriend = async (friendId) => {
    try {
      const res = await fetch(`http://localhost:8000/friends/add/${friendId}`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to add friend');
      await loadFriends();
      // Invalidate friend key cache
      Object.keys(sessionStorage)
        .filter(k => k.startsWith('friendPubkey_'))
        .forEach(k => sessionStorage.removeItem(k));
      setShowAddFriends(false);
      showToast('Friend added!', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to add friend', 'error');
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const schemes = {
    elgamal:   !!friendPubkey?.elgamal,
    dualregev: !!friendPubkey?.dualregev,
  };

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      <Header
        user={user}
        selectedUser={selectedUser}
        onLogout={logout}
        onShowKeys={() => setShowKeys(!showKeys)}
        onMenuToggle={() => setMobileMenu(!isMobileMenuOpen)}
        onAddFriends={() => setShowAddFriends(true)}
      />

      <div className="flex flex-1 overflow-hidden">
        <div className={`${isMobileMenuOpen ? 'block' : 'hidden'} md:block md:w-1/4 bg-white border-r border-gray-200`}>
          <UserList
            users={friends}
            selectedUser={selectedUser}
            onSelectUser={handleSelectUser}
            loading={loading}
            onAddFriends={() => setShowAddFriends(true)}
            title="👥 Friends"
          />
        </div>

        <div className="flex-1 flex flex-col">
          {selectedUser ? (
            <>
              {showKeys && (
                <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-3 text-xs text-gray-700 space-y-1">
                  <p className="font-bold text-sm">💬 Chat with {selectedUser.username}</p>
                  <p>✓ WebSocket connected</p>
                  {!cryptoReady ? (
                    <p>⚠️ Key file not loaded</p>
                  ) : fetchingKey ? (
                    <p>⏳ Fetching encryption key...</p>
                  ) : friendPubkey ? (
                    <>
                      {schemes.dualregev && <p>🔒 Dual Regev (post-quantum) available</p>}
                      {schemes.elgamal   && <p>🔐 ElGamal (classical) available</p>}
                      <p>Active: <strong>{activeScheme}</strong></p>
                    </>
                  ) : (
                    <p>⚠️ Friend has no encryption keys yet</p>
                  )}
                </div>
              )}

              <MessageList
                messages={messages}
                currentUserId={Number(user.id)}
                currentUsername={user.username}
              />

              <MessageInput
                onSend={handleSendMessage}
                selectedUser={selectedUser}
                ws={wsRef.current}
                friendPubkey={friendPubkey}
                fetchingKey={fetchingKey}
                activeScheme={activeScheme}
                onSchemeChange={setActiveScheme}
                availableSchemes={schemes}
              />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <p className="text-lg mb-4">👫 No friend selected</p>
                <p className="text-sm mb-6">Select a friend to start chatting!</p>
                <button
                  onClick={() => setShowAddFriends(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-semibold"
                >
                  ➕ Add Friend
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showAddFriends && (
        <AddFriendsModal
          onAddFriend={handleAddFriend}
          onClose={() => setShowAddFriends(false)}
        />
      )}
    </div>
  );
}