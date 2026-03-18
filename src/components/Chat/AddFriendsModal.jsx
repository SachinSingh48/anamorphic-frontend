import { useState, useEffect } from 'react';
import { useAuth } from '../../Context/AuthContext';
import { useToast } from '../../Context/ToastContext';

export default function AddFriendsModal({ onAddFriend, onClose }) {
  const { token } = useAuth();
  const { showToast } = useToast();

  const [searchQuery, setSearchQuery]   = useState('');
  const [results, setResults]           = useState([]);
  const [isSearching, setIsSearching]   = useState(false);

  // Fetch available users from server whenever searchQuery changes.
  // Debounced 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchAvailable(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Also fetch on mount so the list is populated immediately on open
  useEffect(() => {
    fetchAvailable('');
  }, []);

  const fetchAvailable = async (query) => {
    setIsSearching(true);
    try {
      const res  = await fetch('http://localhost:8000/friends/available', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const data = await res.json();

      const all = data.available_friends || [];
      setResults(
        query.trim()
          ? all.filter((u) =>
              u.username.toLowerCase().includes(query.toLowerCase())
            )
          : all
      );
    } catch {
      // Silent — toasts are not spammed while typing
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddClick = (friend) => {
    onAddFriend(friend.id);
    // Remove from local results immediately for instant feedback
    setResults((prev) => prev.filter((u) => u.id !== friend.id));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">

        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-800">➕ Add Friends</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl">
              ✕
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            Search and add users to your friend list
          </p>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-gray-200 relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by username..."
            className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 pr-8"
            autoFocus
          />
          {isSearching && (
            <div className="absolute right-7 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto">
          {results.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              <p className="text-lg">
                {isSearching
                  ? '🔍 Searching...'
                  : searchQuery
                    ? '🔍 No matching users'
                    : '✨ No users available'}
              </p>
              <p className="text-sm mt-2">
                {!isSearching && !searchQuery
                  ? 'Everyone is already your friend!'
                  : !isSearching
                    ? 'Try a different username'
                    : ''}
              </p>
            </div>
          ) : (
            <div className="space-y-2 p-4">
              {results.map((friend) => (
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
                      <p className="font-semibold text-gray-800">{friend.username}</p>
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
