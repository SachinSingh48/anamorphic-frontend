import { useState } from 'react';
import { useToast } from '../../Context/ToastContext';
import { AnamorphicEncrypt, getSessionKeys } from '../../crypto/anamorphicCrypto';
import { jsonSafe } from '../../crypto/cryptoUtils';

export default function MessageInput({ onSend, selectedUser, ws, friendDkey, fetchingKey }) {
  const [publicMsg, setPublicMsg] = useState('');
  const [secretMsg, setSecretMsg] = useState('');
  const [isSending, setIsSending] = useState(false);
  const { showToast } = useToast();

  const hasSecret = secretMsg.trim().length > 0;

  const handleSubmit = async (e) => {
    e?.preventDefault();

    if (!publicMsg.trim()) {
      showToast('Public message is required', 'error');
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
    if (hasSecret && !friendDkey) {
      showToast('Friend encryption key not available', 'error');
      return;
    }

    setIsSending(true);

    try {
      let body;

      if (hasSecret) {
        // Anamorphic mode — encrypt both messages
        const myKeys = getSessionKeys();
        if (!myKeys) {
          showToast('Your encryption keys are not loaded', 'error');
          return;
        }
        const forRecipient = await AnamorphicEncrypt(friendDkey, publicMsg, secretMsg);
        const senderCopy   = await AnamorphicEncrypt(myKeys.dkey, publicMsg, secretMsg);
        body = jsonSafe({ ...forRecipient, sender_copy: senderCopy });
      } else {
        // Public only — no encryption
        body = { public_message: publicMsg };
      }

      ws.send(JSON.stringify({
        type: 'ciphertext',
        to:   selectedUser.username,
        body,
      }));

      onSend(publicMsg, hasSecret ? secretMsg : null);

      setPublicMsg('');
      setSecretMsg('');
    } catch (err) {
      console.error('[MessageInput] Encrypt/send failed:', err);
      showToast(err.message || 'Failed to send message', 'error');
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

  const isReady = !fetchingKey && !!friendDkey;

  return (
    <div className="bg-white border-t border-gray-200 p-4">
      <div className="space-y-3">

        {/* Public Message — always required */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            💬 Public Message (visible to {selectedUser?.username})
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

        {/* Secret Message — optional */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            🔐 Secret Message{' '}
            <span className="text-gray-400 font-normal">(optional — anamorphic ElGamal)</span>
          </label>
          <input
            type="text"
            value={secretMsg}
            onChange={(e) => setSecretMsg(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Leave empty to send public only..."
            className={`w-full border-2 rounded-lg px-3 py-2 focus:outline-none disabled:bg-gray-50 transition
              ${hasSecret
                ? 'border-purple-400 focus:border-purple-600'
                : 'border-gray-200 focus:border-gray-400'}`}
            disabled={isSending}
          />
          <p className="text-xs text-gray-400 mt-1">
            {hasSecret
              ? '🔒 Will be encrypted — only recipient can decrypt'
              : 'No secret message — only public message will be sent'}
          </p>
        </div>

        {/* Warning only shown if secret typed but key not ready */}
        {hasSecret && !isReady && (
          <div className="px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-700">
            {fetchingKey
              ? '⏳ Loading friend encryption key...'
              : "⚠️ Friend hasn't set up encryption keys yet"}
          </div>
        )}

        {/* Send Button */}
        <button
          onClick={handleSubmit}
          disabled={isSending || !publicMsg.trim() || (hasSecret && !isReady)}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSending ? (
            <span className="flex items-center justify-center gap-2">
              <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              {hasSecret ? 'Encrypting & Sending...' : 'Sending...'}
            </span>
          ) : (
            hasSecret ? '🔐 Encrypt & Send' : '📤 Send'
          )}
        </button>
      </div>
    </div>
  );
}