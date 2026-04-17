import { useState } from 'react';
import { useToast } from '../../Context/ToastContext';

// ElGamal
import { AnamorphicEncrypt, getSessionKeys } from '../../crypto/anamorphicCrypto';
import { jsonSafe } from '../../crypto/cryptoUtils';

// Dual Regev
import { drEncrypt, getDRSession, drDeserializePublicKey } from '../../dualregev';

export default function MessageInput({
  onSend, selectedUser, ws,
  friendPubkey, fetchingKey,
  activeScheme, onSchemeChange, availableSchemes,
}) {
  const [publicMsg, setPublicMsg] = useState('');
  const [secretMsg, setSecretMsg] = useState('');
  const [isSending, setIsSending] = useState(false);
  const { showToast } = useToast();

  const hasSecret = secretMsg.trim().length > 0;
  const isReady   = !fetchingKey && !!friendPubkey;

  const handleSubmit = async (e) => {
    e?.preventDefault();

    if (!publicMsg.trim()) {
      showToast('Public message is required', 'error');
      return;
    }
    if (!selectedUser) {
      showToast('No user selected', 'error');
      return;
    }
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      showToast('Not connected to chat server', 'error');
      return;
    }
    if (!isReady) {
      showToast('Friend encryption key not available', 'error');
      return;
    }

    setIsSending(true);
    try {
      const secret = hasSecret ? secretMsg : null;

      let forRecipient, senderCopy;

      if (activeScheme === 'dualregev') {
        // ── Dual Regev ────────────────────────────────────────────────
        if (!friendPubkey.dualregev)
          throw new Error('Friend has no Dual Regev public key');
        const myDrKeys = getDRSession();
        if (!myDrKeys)
          throw new Error('Your Dual Regev keys are not loaded');

        const friendApk = drDeserializePublicKey(friendPubkey.dualregev);

        [forRecipient, senderCopy] = await Promise.all([
          drEncrypt(friendApk,      publicMsg, secret),   // encrypted with friend's apk
          drEncrypt(myDrKeys.apk,   publicMsg, secret),   // encrypted with own apk (for history)
        ]);
      } else {
        // ── ElGamal (default) ──────────────────────────────────────────
        if (!friendPubkey.elgamal)
          throw new Error('Friend has no ElGamal public key');
        const myEgKeys = getSessionKeys();
        if (!myEgKeys)
          throw new Error('Your ElGamal keys are not loaded');

        [forRecipient, senderCopy] = await Promise.all([
          AnamorphicEncrypt(friendPubkey.elgamal, publicMsg, secret),
          AnamorphicEncrypt(myEgKeys.dkey,        publicMsg, secret),
        ]);
        forRecipient = { scheme: 'elgamal', ...forRecipient };
        senderCopy   = { scheme: 'elgamal', ...senderCopy };
      }

      // jsonSafe serializes ElGamal BigInts; DR bodies are plain numbers (no-op)
      const body = jsonSafe({ ...forRecipient, sender_copy: senderCopy });

      ws.send(JSON.stringify({ type: 'ciphertext', to: selectedUser.username, body }));

      // Optimistic UI update — show plaintext immediately this session
      onSend(publicMsg, secret, activeScheme);
      setPublicMsg('');
      setSecretMsg('');
    } catch (err) {
      console.error('[MessageInput] Send error:', err);
      showToast(err.message || 'Failed to send message', 'error');
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); }
  };

  const bothAvailable = availableSchemes?.elgamal && availableSchemes?.dualregev;

  return (
    <div className="bg-white border-t border-gray-200 p-4">

      {/* Scheme selector — only shown when friend supports both */}
      {bothAvailable && (
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-gray-500 font-medium">Encryption:</span>
          <button
            type="button"
            onClick={() => onSchemeChange('elgamal')}
            className={`text-xs px-3 py-1 rounded-full transition font-medium ${
              activeScheme === 'elgamal'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            🔐 ElGamal
          </button>
          <button
            type="button"
            onClick={() => onSchemeChange('dualregev')}
            className={`text-xs px-3 py-1 rounded-full transition font-medium ${
              activeScheme === 'dualregev'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            🔒 Dual Regev
          </button>
        </div>
      )}

      {/* Not ready warning */}
      {!isReady && (
        <div className="mb-3 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-700">
          {fetchingKey
            ? '⏳ Loading friend encryption key...'
            : "⚠️ Friend hasn't set up encryption keys yet — they need to log in first"}
        </div>
      )}

      <div className="space-y-3">

        {/* Public message */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            💬 Public Message (visible to {selectedUser?.username})
          </label>
          <input
            type="text"
            value={publicMsg}
            onChange={e => setPublicMsg(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={isReady ? 'Type a public message...' : 'Waiting for encryption key...'}
            className="w-full border-2 border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 disabled:bg-gray-50"
            disabled={isSending || !isReady}
          />
        </div>

        {/* Secret message — optional */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            🔐 Secret Message{' '}
            <span className="text-gray-400 font-normal">(optional — anamorphic channel)</span>
          </label>
          <input
            type="text"
            value={secretMsg}
            onChange={e => setSecretMsg(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Leave empty to send public only..."
            className={`w-full border-2 rounded-lg px-3 py-2 focus:outline-none disabled:bg-gray-50 transition ${
              hasSecret
                ? 'border-purple-400 focus:border-purple-600'
                : 'border-gray-200 focus:border-gray-400'
            }`}
            disabled={isSending || !isReady}
          />
          <p className="text-xs text-gray-400 mt-1">
            {hasSecret
              ? `🔒 Encrypted with ${activeScheme === 'dualregev' ? 'Dual Regev (post-quantum)' : 'ElGamal'}`
              : '📤 Public message only — still encrypted'}
          </p>
        </div>

        {/* Send button */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSending || !publicMsg.trim() || !isReady}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSending ? (
            <span className="flex items-center justify-center gap-2">
              <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Encrypting & Sending...
            </span>
          ) : (
            hasSecret ? '🔐 Encrypt & Send' : '📤 Send'
          )}
        </button>
      </div>
    </div>
  );
}