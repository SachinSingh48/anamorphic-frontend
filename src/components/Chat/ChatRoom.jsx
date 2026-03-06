import { useState, useEffect } from 'react';
import { useAuth } from '../../Context/AuthContext';
import { useToast } from '../../Context/ToastContext';
import Header from '../Shared/Header';
import UserList from './UserList';
import MessageList from './MessageList';
import MessageInput from './MessageInput';

export default function ChatRoom() {
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const [selectedUser, setSelectedUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Load users on mount
  useEffect(() => {
    loadUsers();
  }, []);

  // Load messages when user is selected
  useEffect(() => {
    if (selectedUser) {
      loadMessages();
    }
  }, [selectedUser]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      // TODO: Replace with real API call
      // const response = await usersAPI.getAll();
      
     const response = await fetch('http://localhost:8000/users/list', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to load users');
    }

    const data = await response.json();
    setUsers(data.users.filter((u) => u.id !== user.id));
  } catch (error) {
    showToast('Failed to load users', 'error');
    // Fallback to mock data if backend doesn't have users endpoint
    const mockUsers = [
      {
        id: 1,
        username: 'alice',
        email: 'alice@example.com',
        avatar: 'https://i.pravatar.cc/150?img=1',
        status: 'online',
      },
      {
        id: 2,
        username: 'bob',
        email: 'bob@example.com',
        avatar: 'https://i.pravatar.cc/150?img=2',
        status: 'online',
      },
    ];
    setUsers(mockUsers);
  } finally {
    setLoading(false);
  }
};

  const loadMessages = async () => {
    try {
      // TODO: Replace with real API call
      // const response = await messagesAPI.history(selectedUser.id);
      
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
    
    // Transform backend messages to frontend format
    const messages = data.items.map((msg) => ({
      id: msg.timestamp,
      sender_id: msg.from,
      sender_name: selectedUser.username,
      public_message: msg.body?.public_message || 'Message',
      secret_message: msg.body?.secret_message || '',
      timestamp: new Date(msg.timestamp * 1000).toISOString(),
      status: 'sent',
    }));
    
    setMessages(messages);
  } catch (error) {
    showToast('Failed to load messages', 'error');
  }
};

  const handleSendMessage = async (publicMsg, secretMsg) => {
    try {
      // TODO: Replace with real API call
      // await messagesAPI.send(selectedUser.id, publicMsg, secretMsg);
      
      const newMessage = {
        id: messages.length + 1,
        sender_id: user.id,
        sender_name: user.username,
        public_message: publicMsg,
        secret_message: secretMsg,
        is_public: false,
        timestamp: new Date().toISOString(),
        status: 'sending',
      };
      
      setMessages((prev) => [...prev, newMessage]);
      
      // Simulate sending
      setTimeout(() => {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === newMessage.id ? { ...msg, status: 'sent' } : msg
          )
        );
        showToast('Message sent!', 'success');
      }, 500);
    } catch (error) {
      showToast('Failed to send message', 'error');
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Header */}
      <Header
        user={user}
        selectedUser={selectedUser}
        onLogout={logout}
        onShowKeys={() => setShowKeys(!showKeys)}
        onMenuToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
      />

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* User List - Hidden on mobile unless menu is open */}
        <div
          className={`${
            isMobileMenuOpen ? 'block' : 'hidden'
          } md:block md:w-1/4 bg-white border-r border-gray-200`}
        >
          <UserList
            users={users}
            selectedUser={selectedUser}
            onSelectUser={setSelectedUser}
            loading={loading}
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
                      <p className="font-semibold text-gray-700 mb-1">Your Keys:</p>
                      <p className="text-xs text-gray-600 break-all font-mono bg-white p-2 rounded">
                        {user.public_key}
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-700 mb-1">{selectedUser.username}'s Public Key:</p>
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
              />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <p className="text-lg">👈 Select a user to start chatting</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}