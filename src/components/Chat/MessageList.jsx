import { useEffect, useRef } from 'react';

export default function MessageList({ messages, currentUserId, currentUsername }) {
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleDateString();
  };

  // Group messages by date
  const messagesByDate = messages.reduce((acc, msg) => {
    const date = formatDate(msg.timestamp);
    if (!acc[date]) acc[date] = [];
    acc[date].push(msg);
    return acc;
  }, {});

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
      {messages.length === 0 ? (
        <div className="flex items-center justify-center h-full text-gray-400">
          <p className="text-lg">💬 No messages yet. Start the conversation!</p>
        </div>
      ) : (
        Object.entries(messagesByDate).map(([date, dayMessages]) => (
          <div key={date}>
            {/* Date Separator */}
            <div className="flex items-center gap-4 my-4">
              <div className="flex-1 border-t border-gray-300"></div>
              <span className="text-xs text-gray-500 bg-gray-50 px-2">
                {date}
              </span>
              <div className="flex-1 border-t border-gray-300"></div>
            </div>

            {/* Messages for this date */}
            {dayMessages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${
                  msg.sender_id === currentUserId ? 'justify-end' : 'justify-start'
                }`}
              >
                {/* Avatar (for other user) */}
                {msg.sender_id !== currentUserId && (
                  <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {msg.sender_name.charAt(0).toUpperCase()}
                  </div>
                )}

                {/* Message Bubble */}
                <div
                  className={`max-w-xs lg:max-w-md ${
                    msg.sender_id === currentUserId ? 'order-2' : 'order-1'
                  }`}
                >
                  {/* Public Message */}
                  <div
                    className={`p-3 rounded-lg ${
                      msg.sender_id === currentUserId
                        ? 'bg-blue-500 text-white rounded-br-none'
                        : 'bg-gray-200 text-gray-900 rounded-bl-none'
                    }`}
                  >
                    <p className="text-sm">{msg.public_message}</p>
                    <p
                      className={`text-xs mt-1 ${
                        msg.sender_id === currentUserId
                          ? 'text-blue-100'
                          : 'text-gray-600'
                      }`}
                    >
                      {formatTime(msg.timestamp)}
                    </p>
                  </div>

                  {/* Secret Message (if exists) */}
                  {msg.secret_message && msg.sender_id === currentUserId && (
                    <div className="mt-2 p-3 rounded-lg bg-yellow-50 border border-yellow-200 rounded-br-none">
                      <p className="text-xs font-semibold text-yellow-800 mb-1">
                        🔐 Secret (to you only)
                      </p>
                      <p className="text-sm text-yellow-900">{msg.secret_message}</p>
                    </div>
                  )}

                  {/* Status Badge */}
                  {msg.sender_id === currentUserId && (
                    <p className="text-xs text-gray-500 mt-1">
                      {msg.status === 'sending' ? '⏳' : '✓'} {msg.status}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}