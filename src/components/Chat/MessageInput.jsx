import { useState } from 'react';
import { useToast } from '../../Context/ToastContext';
import { AnamorphicEncrypt } from '../../crypto/anamorphicCrypto';
import { jsonSafe } from '../../crypto/cryptoUtils';

export default function MessageInput({ onSend, selectedUser, ws, friendDkey, fetchingKey }) {
  const [publicMsg, setPublicMsg] = useState('');
  const [secretMsg, setSecretMsg] = useState('');
  const [isSending, setIsSending] = useState(false);
  const { showToast } = useToast();

  const handleSubmit = async (e) => {
    e?.preventDefault();

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
    if (!friendDkey) {
      showToast('Friend encryption key not available', 'error');
      return;
    }

    setIsSending(true);

    try {
      // Encrypt both messages with friend's dkey (pk0, pk1, sk1, aux)
      // AnamorphicEncrypt(friendDkey, publicMsg, secretMsg)
      //   → ct0 = ElGamal(pk0, publicMsg)   ← recipient decrypts with sk0 (aSK)
      //   → ct1 = ElGamal(pk1, secretMsg)   ← recipient decrypts with sk1 (in dkey)
      const encrypted = await AnamorphicEncrypt(friendDkey, publicMsg, secretMsg);

      // sender_plain stores the plaintext so the sender can read their own
      // message history. public_message is public by design; secret_message
      // is stored here only because ElGamal encrypts with the FRIEND's key
      // so the sender cannot decrypt it from the ciphertext later.
      const body = jsonSafe({
        ...encrypted,
        sender_plain: {
          public_message: publicMsg,
          secret_message: secretMsg,
        },
      });

      ws.send(JSON.stringify({
        type: 'ciphertext',
        to:   selectedUser.username,
        body,
      }));

      // Optimistic update — tell ChatRoom to add this message to state now
      // with plaintext. The server echo is skipped in ChatRoom since the
      // sender cannot decrypt a message encrypted with the friend's keys.
      onSend(publicMsg, secretMsg);

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
      {/* Encryption status banner */}
      {!isReady && (
        <div className="mb-3 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-700">
          {fetchingKey
            ? '⏳ Loading friend encryption key...'
            : "⚠️ Friend hasn't set up encryption keys yet — they need to log in first"}
        </div>
      )}

      <div className="space-y-3">
        {/* Public Message */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            💬 Public Message (visible to {selectedUser?.username})
          </label>
          <input
            type="text"
            value={publicMsg}
            onChange={(e) => setPublicMsg(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={isReady ? 'Type a public message...' : 'Waiting for encryption key...'}
            className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 disabled:bg-gray-50"
            disabled={isSending || !isReady}
          />
        </div>

        {/* Secret Message */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            🔐 Secret Message (anamorphic ElGamal encryption)
          </label>
          <input
            type="text"
            value={secretMsg}
            onChange={(e) => setSecretMsg(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={isReady ? 'Type a secret message...' : 'Waiting for encryption key...'}
            className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 disabled:bg-gray-50"
            disabled={isSending || !isReady}
          />
          <p className="text-xs text-gray-500 mt-1">
            Encrypted with ElGamal. Only the recipient can decrypt with their private key.
          </p>
        </div>

        {/* Send Button */}
        <button
          onClick={handleSubmit}
          disabled={isSending || !publicMsg.trim() || !secretMsg.trim() || !isReady}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSending ? (
            <span className="flex items-center justify-center gap-2">
              <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Encrypting & Sending...
            </span>
          ) : (
            '🔐 Encrypt & Send'
          )}
        </button>
      </div>
    </div>
  );
}
