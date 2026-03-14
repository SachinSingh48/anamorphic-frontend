import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../Context/AuthContext';
import { useToast } from '../../Context/ToastContext';
import Header from '../Shared/Header';
import UserList from './UserList';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import AddFriendsModal from './AddFriendsModal';

export default function ChatRoom() {
  const { user, logout, token } = useAuth();
  const { showToast } = useToast();
  const [friends, setFriends] = useState([]);
  const [availableFriends, setAvailableFriends] = useState([]);

  // FIX: Restore selectedUser from sessionStorage so a page reload doesn't
  // kick you back to the "no friend selected" screen.
  const [selectedUser, setSelectedUser] = useState(() => {
    try {
      const saved = sessionStorage.getItem('selectedUser');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showAddFriends, setShowAddFriends] = useState(false);

  // WebSocket
  const wsRef = useRef(null);
  // Ref so the WS onmessage callback always sees the latest selectedUser
  // without re-registering the handler on every selection change.
  const selectedUserRef = useRef(selectedUser);

  // Load friends and establish WebSocket on mount
  useEffect(() => {
    loadFriends();
    loadAvailableFriends();
    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [token]);

  // Load message history when user is selected
  useEffect(() => {
    if (selectedUser) {
      loadMessageHistory();
    }
  }, [selectedUser]);

  const connectWebSocket = () => {
    const wsUrl = `ws://localhost:8000/ws?token=${token}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('✓ WebSocket connected');
      showToast('Connected to chat server ✓', 'success');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'message') {
          handleIncomingMessage(data);
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      showToast('Connection error', 'error');
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
    };

    wsRef.current = ws;
  };

  const handleIncomingMessage = (data) => {
    const dataFrom = Number(data.from);
    const dataTo = Number(data.to);
    const currentUserId = Number(user.id);
    // Read from ref — state would be stale inside the WS onmessage closure
    const currentSelectedUser = selectedUserRef.current;
    const selectedUserId = Number(currentSelectedUser?.id);

    const isFromCurrentChat =
      (dataFrom === selectedUserId && dataTo === currentUserId) ||
      (dataFrom === currentUserId && dataTo === selectedUserId);

    if (isFromCurrentChat) {
      const newMessage = {
        id: `msg-${data.from}-${data.timestamp}`,
        sender_id: dataFrom,
        sender_name: dataFrom === currentUserId ? user.username : currentSelectedUser.username,
        public_message: data.body?.public_message || data.body || 'Message',
        secret_message: data.body?.secret_message || data.body || 'Message',
        timestamp: new Date(data.timestamp * 1000).toISOString(),
        status: 'sent',
      };

      setMessages((prev) => [...prev, newMessage]);
    }
  };

  const handleSelectUser = (user) => {
    setSelectedUser(user);
    selectedUserRef.current = user;  // keep ref in sync with state
    sessionStorage.setItem('selectedUser', JSON.stringify(user));
    setIsMobileMenuOpen(false);
  };

  const loadFriends = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:8000/friends/list', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to load friends');
      const data = await response.json();
      setFriends(data.friends || []);
    } catch (error) {
      showToast('Failed to load friends', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableFriends = async () => {
    try {
      const response = await fetch('http://localhost:8000/friends/available', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to load available friends');
      const data = await response.json();
      setAvailableFriends(data.available_friends || []);
    } catch (error) {
      console.log('Failed to load available friends');
    }
  };

  const loadMessageHistory = async () => {
    try {
      const response = await fetch('http://localhost:8000/messages/history', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          with_user: selectedUser.username,
          limit: 50,
          before_ts: null,
        }),
      });

      if (!response.ok) throw new Error('Failed to load messages');
      const data = await response.json();

      const currentUserId = Number(user.id);
      const selectedUserId = Number(selectedUser.id);

      const formattedMessages = data.items.map((msg) => {
        const senderIdNum = Number(msg.from);
        const senderName = senderIdNum === currentUserId ? user.username : selectedUser.username;

        return {
          id: `msg-${msg.from}-${msg.timestamp}`,
          sender_id: senderIdNum,
          sender_name: senderName,
          public_message: msg.body?.public_message || msg.body || 'Message',
          secret_message: msg.body?.secret_message || msg.body || 'Message',
          timestamp: new Date(msg.timestamp * 1000).toISOString(),
          status: 'sent',
        };
      });

      setMessages(formattedMessages);
    } catch (error) {
      console.error('Failed to load message history:', error);
      setMessages([]);
    }
  };

  const handleSendMessage = () => {
    // Messages appear via the WebSocket echo — no extra action needed here.
  };

  const handleAddFriend = async (friendId) => {
    try {
      const response = await fetch(`http://localhost:8000/friends/add/${friendId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to add friend');
      await loadFriends();
      await loadAvailableFriends();
      setShowAddFriends(false);
      showToast('Friend added!', 'success');
    } catch (error) {
      showToast(error.message || 'Failed to add friend', 'error');
    }
  };

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
        {/* Friends Sidebar */}
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

        {/* Chat Area */}
        <div className="flex-1 flex flex-col">
          {selectedUser ? (
            <>
              {showKeys && (
                <div className="bg-yellow-50 border-b border-yellow-200 p-4">
                  <div className="text-sm text-gray-700">
                    <p className="font-bold mb-2">💬 Chat with {selectedUser.username}</p>
                    <p className="text-xs">✓ WebSocket connected</p>
                  </div>
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
