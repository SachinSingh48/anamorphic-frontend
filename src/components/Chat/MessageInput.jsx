import { useState } from 'react';
import { useToast } from '../../Context/ToastContext';

export default function MessageInput({ onSend, recipientName, selectedUser, ws }) {
  const [publicMsg, setPublicMsg] = useState('');
  const [secretMsg, setSecretMsg] = useState('');
  const [isSending, setIsSending] = useState(false);
  const { showToast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!publicMsg.trim() || !secretMsg.trim()) {
      showToast('Both messages are required', 'error');
      return;
    }

    if (!selectedUser) {
      showToast('Please select a user to message', 'error');
      return;
    }

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      showToast('Not connected to chat server', 'error');
      return;
    }

    setIsSending(true);

    try {
      // Send entirely over WebSocket — the server now always persists the
      // message to DB and echoes it back to both sender and recipient.
      ws.send(JSON.stringify({
        type: 'ciphertext',
        to: selectedUser.username,
        body: {
          public_message: publicMsg,
          secret_message: secretMsg,
        },
      }));

      setPublicMsg('');
      setSecretMsg('');
      onSend();
    } catch (error) {
      showToast(error.message || 'Failed to send message', 'error');
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="bg-white border-t border-gray-200 p-4">
      <div className="space-y-3">
        {/* Public Message */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            💬 Public Message (visible to {recipientName || selectedUser?.username})
          </label>
          <input
            type="text"
            value={publicMsg}
            onChange={(e) => setPublicMsg(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type a public message..."
            className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 disabled:bg-gray-50"
            disabled={isSending}
          />
        </div>

        {/* Secret Message */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            🔐 Secret Message (encrypted, only you see it)
          </label>
          <input
            type="text"
            value={secretMsg}
            onChange={(e) => setSecretMsg(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type a secret message..."
            className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 disabled:bg-gray-50"
            disabled={isSending}
          />
          <p className="text-xs text-gray-500 mt-1">
            This message uses anamorphic encryption. Different recipients see different messages.
          </p>
        </div>

        {/* Send Button */}
        <button
          onClick={handleSubmit}
          disabled={isSending || !publicMsg.trim() || !secretMsg.trim()}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSending ? (
            <span className="flex items-center justify-center gap-2">
              <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              Sending...
            </span>
          ) : (
            '📤 Send Message'
          )}
        </button>
      </div>
    </div>
  );
}
