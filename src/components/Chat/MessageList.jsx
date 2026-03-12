import { useEffect, useRef } from 'react';

export default function MessageList({ messages, currentUserId, currentUsername }) {
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Group messages by date
  const groupedMessages = messages.reduce((groups, message) => {
    const date = new Date(message.timestamp).toLocaleDateString();
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(message);
    return groups;
  }, {});

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 p-4 space-y-4">
      {messages.length === 0 ? (
        <div className="flex items-center justify-center h-full text-gray-400">
          <p>💬 No messages yet. Start the conversation!</p>
        </div>
      ) : (
        <>
          {Object.entries(groupedMessages).map(([date, dateMessages]) => (
            <div key={date}>
              {/* Date Separator */}
              <div className="flex items-center gap-2 my-4">
                <div className="flex-1 h-px bg-gray-300"></div>
                <span className="text-xs text-gray-500 px-2">{date}</span>
                <div className="flex-1 h-px bg-gray-300"></div>
              </div>

              {/* Messages for this date */}
              {dateMessages.map((message, index) => {
                const isCurrentUser = message.sender_id === currentUserId;
                const time = new Date(message.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <div
                    key={`msg-${message.sender_id}-${message.timestamp}-${index}`}
                    className={`flex gap-2 mb-3 ${
                      isCurrentUser ? 'flex-row-reverse' : ''
                    }`}
                  >
                    {/* Avatar */}
                    <div className="flex-shrink-0">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                          isCurrentUser ? 'bg-green-500' : 'bg-blue-500'
                        }`}
                      >
                        {(isCurrentUser ? currentUsername : message.sender_name)?.[0]?.toUpperCase()}
                      </div>
                    </div>

                    {/* Message Bubble */}
                    <div
                      className={`max-w-xs lg:max-w-md ${
                        isCurrentUser ? 'items-end' : 'items-start'
                      }`}
                    >
                      {/* Sender Name */}
                      <p
                        className={`text-xs font-semibold mb-1 ${
                          isCurrentUser
                            ? 'text-green-600 text-right'
                            : 'text-blue-600'
                        }`}
                      >
                        {isCurrentUser ? 'You' : message.sender_name}
                      </p>

                      {/* Public Message */}
                      <div
                        className={`px-4 py-2 rounded-lg mb-2 ${
                          isCurrentUser
                            ? 'bg-green-200 text-green-900 rounded-br-none'
                            : 'bg-blue-200 text-blue-900 rounded-bl-none'
                        }`}
                      >
                        <p className="text-sm font-medium">{message.public_message}</p>
                      </div>

                      {/* Secret Message (visible to both!) */}
                      <div
                        className={`px-4 py-2 rounded-lg mb-1 border-2 ${
                          isCurrentUser
                            ? 'bg-yellow-100 text-yellow-800 border-yellow-300 rounded-br-none'
                            : 'bg-purple-100 text-purple-800 border-purple-300 rounded-bl-none'
                        }`}
                      >
                        <p className="text-xs font-semibold mb-1">
                          🔐 {isCurrentUser ? 'You sent:' : 'They sent:'}
                        </p>
                        <p className="text-sm italic font-medium">{message.secret_message}</p>
                      </div>

                      {/* Timestamp */}
                      <p
                        className={`text-xs text-gray-500 mt-1 ${
                          isCurrentUser ? 'text-right' : 'text-left'
                        }`}
                      >
                        {time}
                        {message.status === 'sent' && isCurrentUser && ' ✓'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </>
      )}
    </div>
  );
}
