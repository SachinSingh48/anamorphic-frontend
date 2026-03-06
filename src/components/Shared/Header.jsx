import { useState } from 'react';

export default function Header({
  user,
  selectedUser,
  onLogout,
  onShowKeys,
  onMenuToggle,
}) {
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  return (
    <div className="bg-white border-b border-gray-200 shadow-sm">
      <div className="p-4 flex items-center justify-between">
        {/* Left Side */}
        <div className="flex items-center gap-4">
          {/* Mobile Menu Toggle */}
          <button
            onClick={onMenuToggle}
            className="md:hidden text-gray-600 hover:text-gray-800"
          >
            ☰
          </button>

          {/* Logo */}
          <h1 className="text-xl font-bold text-blue-600">🔐 Anamorphic Chat</h1>
        </div>

        {/* Center - Selected User */}
        {selectedUser && (
          <div className="hidden md:flex items-center gap-3">
            <img
              src={selectedUser.avatar}
              alt={selectedUser.username}
              className="w-10 h-10 rounded-full"
            />
            <div>
              <p className="font-semibold text-gray-800">
                {selectedUser.username}
              </p>
              <p className="text-xs text-gray-500">
                {selectedUser.status === 'online' ? '🟢 Online' : '⚪ Offline'}
              </p>
            </div>
          </div>
        )}

        {/* Right Side */}
        <div className="flex items-center gap-4">
          {/* Keys Button */}
          {selectedUser && (
            <button
              onClick={onShowKeys}
              className="hidden sm:flex items-center gap-2 px-3 py-1 bg-yellow-100 text-yellow-800 rounded-lg hover:bg-yellow-200 transition text-sm font-semibold"
            >
              🔑 Keys
            </button>
          )}

          {/* Profile Menu */}
          <div className="relative">
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="flex items-center gap-2 hover:bg-gray-100 px-3 py-2 rounded-lg transition"
            >
              <img
                src={user.avatar}
                alt={user.username}
                className="w-8 h-8 rounded-full"
              />
              <span className="hidden sm:inline font-medium text-gray-800">
                {user.username}
              </span>
              <span className="text-gray-600">▼</span>
            </button>

            {/* Dropdown Menu */}
            {showProfileMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                <button
                  onClick={() => {
                    onLogout();
                    setShowProfileMenu(false);
                  }}
                  className="w-full text-left px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg font-semibold"
                >
                  🚪 Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}