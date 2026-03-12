import { useState } from 'react';
import { useToast } from '../../Context/ToastContext';

export default function AddFriendsModal({ friends, onAddFriend, onClose }) {
  const [searchQuery, setSearchQuery] = useState('');
  const { showToast } = useToast();

  const filteredFriends = friends.filter((friend) =>
    friend.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddClick = (friend) => {
    onAddFriend(friend.id);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-800">➕ Add Friends</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-2xl"
            >
              ✕
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            Search and add users to your friend list
          </p>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-gray-200">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by username..."
            className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
            autoFocus
          />
        </div>

        {/* Friends List */}
        <div className="max-h-96 overflow-y-auto">
          {filteredFriends.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              <p className="text-lg">
                {friends.length === 0 ? '✨ No users available' : '🔍 No matching users'}
              </p>
              <p className="text-sm mt-2">
                {friends.length === 0
                  ? 'Everyone is already your friend!'
                  : 'Try searching with a different name'}
              </p>
            </div>
          ) : (
            <div className="space-y-2 p-4">
              {filteredFriends.map((friend) => (
                <div
                  key={friend.id}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-100 transition border border-gray-200"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <img
                      src={friend.avatar}
                      alt={friend.username}
                      className="w-10 h-10 rounded-full"
                    />
                    <div>
                      <p className="font-semibold text-gray-800">
                        {friend.username}
                      </p>
                      <p className="text-xs text-gray-500">
                        {friend.status === 'online' ? '🟢 Online' : '⚪ Offline'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleAddClick(friend)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1 rounded text-sm font-semibold transition"
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="w-full bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 rounded-lg transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}