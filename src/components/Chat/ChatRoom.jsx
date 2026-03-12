import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Header from '../Shared/Header';
import UserList from './UserList';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import AddFriendsModal from './AddFriendsModal';

export default function ChatRoom() {
  // 1. Grab 'token' from your AuthContext here
  const { user, token, logout } = useAuth(); 
  const { showToast } = useToast();

  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // 
  const [friends, setFriends] = useState([]);
  const [availableFriends, setAvailableFriends] = useState([]);
  const [showAddFriends, setShowAddFriends] = useState(false);

  // Load friends on mount
  useEffect(() => {
    loadFriends();
    loadAvailableFriends();
  }, [token]);

  // Load messages when user is selected
  useEffect(() => {
    if (selectedUser) {
      loadMessages();
    }
  }, [selectedUser]);

  const loadFriends = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:8000/friends/list', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load friends');
      }

      const data = await response.json();
      setFriends(data.friends || []);
    } catch (error) {
      showToast('Failed to load friends', 'error');
      setFriends([]);
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableFriends = async () => {
    try {
      const response = await fetch('http://localhost:8000/friends/available', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load available friends');
      }

      const data = await response.json();
      setAvailableFriends(data.available_friends || []);
    } catch (error) {
      console.log('Failed to load available friends');
    }
  };

  const loadMessages = async () => {
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

      if (!response.ok) {
        throw new Error('Failed to load messages');
      }

      const data = await response.json();

      const messages = data.items.map((msg) => {
      const senderName = msg.from === user.id ? user.username : selectedUser.username;
      sender_name: senderName
      
      return {
        id: msg.timestamp,
        sender_id: msg.from,
        sender_name: senderName,  // FIXED: Use correct sender
        public_message: msg.body?.public_message || 'Message',
        secret_message: msg.body?.secret_message || '',
        timestamp: new Date(msg.timestamp * 1000).toISOString(),
        status: 'sent',
      };
    });

      setMessages(messages);
    } catch (error) {
      showToast('Failed to load messages', 'error');
      setMessages([]);
    }
  };

  const handleSendMessage = async (publicMsg, secretMsg) => {
    try {
      const response = await fetch('http://localhost:8000/messages/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          receiver_id: selectedUser.id,
          body: {
            public_message: publicMsg,
            secret_message: secretMsg,
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      // Reload messages to show the new message
      await loadMessages();
      showToast('Message sent!', 'success');
    } catch (error) {
      showToast(error.message || 'Failed to send message', 'error');
    }
  };

  const handleAddFriend = async (friendId) => {
    try {
      const response = await fetch(`http://localhost:8000/friends/add/${friendId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to add friend');
      }

      const data = await response.json();
      
      // Reload friends list
      await loadFriends();
      await loadAvailableFriends();
      
      setShowAddFriends(false);
      showToast(`Added ${data.friend.username}!`, 'success');
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
        {/* Friends List */}
        <div
          className={`${
            isMobileMenuOpen ? 'block' : 'hidden'
          } md:block md:w-1/4 bg-white border-r border-gray-200`}
        >
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
              {/* Keys Display */}
              {showKeys && (
                <div className="bg-yellow-50 border-b border-yellow-200 p-4 max-h-32 overflow-y-auto">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="font-semibold text-gray-700 mb-1">
                        Your Keys:
                      </p>
                      <p className="text-xs text-gray-600 break-all font-mono bg-white p-2 rounded">
                        {user.public_key}
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-700 mb-1">
                        {selectedUser.username}'s Public Key:
                      </p>
                      <p className="text-xs text-gray-600 break-all font-mono bg-white p-2 rounded">
                        pk_user_{selectedUser.id}_mock
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Messages */}
              <MessageList
                messages={messages}
                currentUserId={user.id}
                currentUsername={user.username}
              />

              {/* Message Input */}
              <MessageInput
                onSend={handleSendMessage}
                recipientName={selectedUser.username}
                selectedUser={selectedUser}
              />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <p className="text-lg mb-4">👫 No friend selected</p>
                <p className="text-sm mb-6">Add a friend to start chatting!</p>
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