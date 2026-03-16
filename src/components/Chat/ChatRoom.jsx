import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../Context/AuthContext';
import { useToast } from '../../Context/ToastContext';
import Header from '../Shared/Header';
import UserList from './UserList';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import AddFriendsModal from './AddFriendsModal';
import { getSessionKeys, NormalDecrypt, DoubleDecrypt } from '../../crypto/anamorphicCrypto';
import { jsonRestore } from '../../crypto/cryptoUtils';

export default function ChatRoom() {
  const { user, logout, token, cryptoReady } = useAuth();
  const { showToast } = useToast();

  const [friends, setFriends]                   = useState([]);
  const [availableFriends, setAvailableFriends]  = useState([]);
  const [messages, setMessages]                  = useState([]);
  const [loading, setLoading]                    = useState(false);
  const [showKeys, setShowKeys]                  = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen]  = useState(false);
  const [showAddFriends, setShowAddFriends]       = useState(false);
  const [friendDkey, setFriendDkey]              = useState(null);
  const [fetchingKey, setFetchingKey]            = useState(false);

  const [selectedUser, setSelectedUser] = useState(() => {
    try {
      const saved = sessionStorage.getItem('selectedUser');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });

  const wsRef = useRef(null);

  // ── WebSocket + friends on mount ─────────────────────────────────────────
  useEffect(() => {
    loadFriends();
    loadAvailableFriends();
    connectWebSocket();
    return () => { wsRef.current?.close(); };
  }, [token]);

  // ── Fetch friend dkey when selected user changes ─────────────────────────
  useEffect(() => {
    if (selectedUser && token) fetchFriendDkey(selectedUser.username);
  }, [selectedUser, token]);

  // ── Load history when selected user changes ───────────────────────────────
  useEffect(() => {
    if (selectedUser) loadMessageHistory();
  }, [selectedUser]);

  // ── Re-run history when key file uploaded after reload ────────────────────
  useEffect(() => {
    if (cryptoReady && selectedUser) loadMessageHistory();
  }, [cryptoReady]);

  // ── Fresh onmessage whenever selectedUser or cryptoReady changes ──────────
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
        // Skip echo of own messages — already added optimistically
        if (dataFrom === currentUserId) return;

        const body = jsonRestore(data.body);
        const keys = getSessionKeys();

        let public_message = '[no key loaded]';
        let secret_message = '[no key loaded]';

        if (!body.ct0) {
          // Plain public-only message — no encryption
          public_message = body.public_message ?? '[no content]';
          secret_message = null;
        } else if (keys) {
          try {
            [public_message, secret_message] = await Promise.all([
              NormalDecrypt(keys.aSK,  body),
              DoubleDecrypt(keys.dkey, body),
            ]);
          } catch (e) {
            console.error('[ChatRoom] Decryption failed:', e);
            public_message = '[decryption failed]';
            secret_message = '[decryption failed]';
          }
        }

        setMessages((prev) => [...prev, {
          id:             `msg-${data.from}-${data.timestamp}`,
          sender_id:      dataFrom,
          sender_name:    selectedUser?.username || 'Unknown',
          public_message,
          secret_message,
          timestamp:      new Date(data.timestamp * 1000).toISOString(),
          status:         'received',
        }]);
      } catch (err) {
        console.error('[ChatRoom] WS message error:', err);
      }
    };
  }, [selectedUser, user, cryptoReady]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const fetchFriendDkey = async (username) => {
    setFriendDkey(null);
    setFetchingKey(true);
    try {
      const res = await fetch(`http://localhost:8000/keys/get/${username}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        showToast(`${username} hasn't set up encryption keys yet`, 'error');
        return;
      }
      const data = await res.json();
      setFriendDkey(jsonRestore(data.pubkey));
      console.log(`[ChatRoom] Loaded encryption key for ${username} ✓`);
    } catch {
      showToast('Failed to fetch friend encryption key', 'error');
    } finally {
      setFetchingKey(false);
    }
  };

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
    sessionStorage.setItem('selectedUser', JSON.stringify(u));
    setIsMobileMenuOpen(false);
  };

  const loadFriends = async () => {
    setLoading(true);
    try {
      const res  = await fetch('http://localhost:8000/friends/list', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setFriends(data.friends || []);
    } catch { showToast('Failed to load friends', 'error'); }
    finally   { setLoading(false); }
  };

  const loadAvailableFriends = async () => {
    try {
      const res  = await fetch('http://localhost:8000/friends/available', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setAvailableFriends(data.available_friends || []);
    } catch { /* silent */ }
  };

  const loadMessageHistory = async () => {
    try {
      const res = await fetch('http://localhost:8000/messages/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ with_user: selectedUser.username, limit: 50, before_ts: null }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();

      const currentUserId = Number(user.id);
      const keys          = getSessionKeys();

      const decrypted = await Promise.all(
        data.items.map(async (msg) => {
          const senderIdNum = Number(msg.from);
          const isMine      = senderIdNum === currentUserId;
          const body        = jsonRestore(msg.body);

          let public_message = '[no key loaded]';
          let secret_message = '[no key loaded]';

          try {
            if (isMine) {
              if (body.sender_copy && keys) {
                // Encrypted message — decrypt sender's own copy
                [public_message, secret_message] = await Promise.all([
                  NormalDecrypt(keys.aSK,  body.sender_copy),
                  DoubleDecrypt(keys.dkey, body.sender_copy),
                ]);
              } else if (body.public_message) {
                // Plain public-only message — no encryption was used
                public_message = body.public_message;
                secret_message = null;
              } else {
                // Old messages sent before sender_copy was implemented
                public_message = body.sender_plain?.public_message ?? '[sent]';
                secret_message = body.sender_plain?.secret_message ?? null;
              }
            } else if (!body.ct0) {
              // Plain public-only message
              public_message = body.public_message ?? '[no content]';
              secret_message = null;
            } else if (keys) {
              [public_message, secret_message] = await Promise.all([
                NormalDecrypt(keys.aSK,  body),
                DoubleDecrypt(keys.dkey, body),
              ]);
            }
          } catch (e) {
            console.error('[ChatRoom] History decrypt error:', e);
            public_message = '[decryption failed]';
            secret_message = '[decryption failed]';
          }

          return {
            id:             `msg-${msg.from}-${msg.timestamp}`,
            sender_id:      senderIdNum,
            sender_name:    isMine ? user.username : selectedUser.username,
            public_message,
            secret_message,
            timestamp:      new Date(msg.timestamp * 1000).toISOString(),
            status:         'sent',
          };
        })
      );

      setMessages(decrypted);
    } catch (err) {
      console.error('[ChatRoom] Failed to load history:', err);
      setMessages([]);
    }
  };

  const handleSendMessage = (publicMsg, secretMsg) => {
    setMessages((prev) => [...prev, {
      id:             `msg-${user.id}-${Date.now()}`,
      sender_id:      Number(user.id),
      sender_name:    user.username,
      public_message: publicMsg,
      secret_message: secretMsg || null,  // null for public-only messages
      timestamp:      new Date().toISOString(),
      status:         'sent',
    }]);
  };

  const handleAddFriend = async (friendId) => {
    try {
      const res = await fetch(`http://localhost:8000/friends/add/${friendId}`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to add friend');
      await loadFriends();
      await loadAvailableFriends();
      setShowAddFriends(false);
      showToast('Friend added!', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to add friend', 'error');
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      <Header
        user={user}
        selectedUser={selectedUser}
        onLogout={logout}
        onShowKeys={() => setShowKeys(!showKeys)}
        onMenuToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
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
                <div className="bg-yellow-50 border-b border-yellow-200 p-4 text-sm text-gray-700 space-y-1">
                  <p className="font-bold">💬 Chat with {selectedUser.username}</p>
                  <p className="text-xs">✓ WebSocket connected</p>
                  <p className="text-xs">
                    {!cryptoReady
                      ? '⚠️ Key file not loaded'
                      : fetchingKey
                        ? '⏳ Loading friend encryption key...'
                        : friendDkey
                          ? '🔐 Anamorphic encryption ready'
                          : '⚠️ Friend has no encryption key'}
                  </p>
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
                friendDkey={friendDkey}
                fetchingKey={fetchingKey}
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
          friends={availableFriends}
          onAddFriend={handleAddFriend}
          onClose={() => setShowAddFriends(false)}
        />
      )}
    </div>
  );
}