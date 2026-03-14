// src/components/Chat/ChatRoom_DEBUG.jsx
/**
 * DEBUG VERSION - Check currentUserId vs message sender_id
 */

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
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showAddFriends, setShowAddFriends] = useState(false);
  
  // WebSocket
  const wsRef = useRef(null);

  // ===== DEBUG =====
  useEffect(() => {
    console.log('===== CURRENT USER =====');
    console.log('user.id:', user?.id);
    console.log('user.username:', user?.username);
    console.log('typeof user.id:', typeof user?.id);
  }, [user]);

  useEffect(() => {
    if (messages.length > 0) {
      console.log('===== CURRENT MESSAGES =====');
      messages.forEach((msg, idx) => {
        console.log(`Message ${idx}:`);
        console.log('  sender_id:', msg.sender_id, 'type:', typeof msg.sender_id);
        console.log('  currentUserId:', user?.id, 'type:', typeof user?.id);
        console.log('  MATCH?:', msg.sender_id === user?.id);
        console.log('  String match?:', String(msg.sender_id) === String(user?.id));
        console.log('  Full msg:', msg);
      });
    }
  }, [messages, user?.id]);
  // ==================

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
        
        console.log('===== WS RECEIVED =====');
        console.log('Raw data:', data);
        console.log('Type:', data.type);
        console.log('From:', data.from, 'type:', typeof data.from);
        console.log('To:', data.to);
        
        // Handle incoming message
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
    // Add message to list if it's from current chat partner
    const isFromCurrentChat =
      (data.from === selectedUser?.id && data.to === user.id) ||
      (data.from === user.id && data.to === selectedUser?.id);

    console.log('===== MESSAGE CHECK =====');
    console.log('selectedUser?.id:', selectedUser?.id);
    console.log('user.id:', user.id);
    console.log('data.from:', data.from);
    console.log('data.to:', data.to);
    console.log('isFromCurrentChat:', isFromCurrentChat);

    if (isFromCurrentChat) {
      // Format message for display
      const newMessage = {
        id: `msg-${data.from}-${data.timestamp}`,
        sender_id: data.from,
        sender_name: data.from === user.id ? user.username : selectedUser.username,
        public_message: data.body?.public_message || data.body || 'Message',
        secret_message: data.body?.secret_message || data.body || 'Message',
        timestamp: new Date(data.timestamp * 1000).toISOString(),
        status: 'sent',
      };

      console.log('Adding message:', newMessage);
      setMessages((prev) => {
        console.log('Previous messages count:', prev.length);
        console.log('New messages count:', prev.length + 1);
        return [...prev, newMessage];
      });
    }
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

      console.log('===== HISTORY LOADED =====');
      console.log('Raw history items:', data.items);

      // Format messages for display
      const formattedMessages = data.items.map((msg) => {
        const senderName = msg.from === user.id ? user.username : selectedUser.username;

        return {
          id: `msg-${msg.from}-${msg.timestamp}`,
          sender_id: msg.from,
          sender_name: senderName,
          public_message: msg.body?.public_message || msg.body || 'Message',
          secret_message: msg.body?.secret_message || msg.body || 'Message',
          timestamp: new Date(msg.timestamp * 1000).toISOString(),
          status: 'sent',
        };
      });

      console.log('Formatted messages:', formattedMessages);
      setMessages(formattedMessages);
    } catch (error) {
      console.error('Failed to load message history:', error);
      setMessages([]);
    }
  };

  const handleSendMessage = (publicMsg, secretMsg) => {
    // Message will be added via WebSocket onmessage callback
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
            onSelectUser={setSelectedUser}
            loading={loading}
            onAddFriends={() => setShowAddFriends(true)}
            title="👥 Friends"
          />
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col">
          {selectedUser ? (
            <>
              {/* Debug Info */}
              {showKeys && (
                <div className="bg-yellow-50 border-b border-yellow-200 p-4">
                  <div className="text-sm text-gray-700 font-mono text-xs">
                    <p className="font-bold mb-2">🐛 DEBUG INFO</p>
                    <p>Your ID: {user?.id}</p>
                    <p>Your Username: {user?.username}</p>
                    <p>Chat with: {selectedUser?.username} (ID: {selectedUser?.id})</p>
                    <p>Total messages: {messages.length}</p>
                  </div>
                </div>
              )}

              {/* Messages Display */}
              <MessageList
                messages={messages}
                currentUserId={user.id}
                currentUsername={user.username}
              />

              {/* Message Input */}
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

      {/* Add Friends Modal */}
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
