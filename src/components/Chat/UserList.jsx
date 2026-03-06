import { useState } from 'react';

export default function UserList({
  users,
  selectedUser,
  onSelectUser,
  loading,
}) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredUsers = users.filter((user) =>
    user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-white">
        <h2 className="text-lg font-bold text-gray-800 mb-3">👥 Users</h2>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search users..."
          className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Users List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-400">Loading users...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-400 text-sm">No users found</p>
          </div>
        ) : (
          <div className="space-y-2 p-2">
            {filteredUsers.map((user) => (
              <button
                key={user.id}
                onClick={() => onSelectUser(user)}
                className={`w-full text-left p-3 rounded-lg transition ${
                  selectedUser?.id === user.id
                    ? 'bg-blue-100 border-l-4 border-blue-500'
                    : 'bg-gray-50 hover:bg-gray-100'
                }`}
              >
                {/* User Card */}
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  <img
                    src={user.avatar}
                    alt={user.username}
                    className="w-10 h-10 rounded-full"
                  />

                  {/* User Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 truncate">
                      {user.username}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {user.email}
                    </p>
                  </div>

                  {/* Status Badge */}
                  <div className="flex flex-col items-end gap-1">
                    <div
                      className={`w-3 h-3 rounded-full ${
                        user.status === 'online'
                          ? 'bg-green-500'
                          : 'bg-gray-400'
                      }`}
                    ></div>
                    <p className="text-xs text-gray-500">
                      {user.status === 'online' ? 'Online' : 'Offline'}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}