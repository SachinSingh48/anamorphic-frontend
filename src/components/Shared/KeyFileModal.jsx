import { useState, useRef } from 'react';
import { useAuth } from '../../Context/AuthContext';

/**
 * Shown on page reload when keys are not in session.
 * User uploads their combined username_keys.json file.
 * Handles both ElGamal and Dual Regev restoration via AuthContext.onKeyFileLoaded.
 */
export default function KeyFileModal({ username, onCancel }) {
  const { onKeyFileLoaded } = useAuth();
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef                = useRef(null);

  const processFile = async (file) => {
    if (!file) return;
    if (!file.name.endsWith('.json')) {
      setError('Please select a .json file');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await onKeyFileLoaded(file);
      // AuthContext sets cryptoStatus = 'ready' — App re-renders automatically
    } catch (err) {
      setError(err.message || 'Failed to load key file');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => processFile(e.target.files?.[0]);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    processFile(e.dataTransfer.files?.[0]);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">

        {/* Header */}
        <div className="text-center mb-6">
          <div className="text-5xl mb-3">🔑</div>
          <h2 className="text-2xl font-bold text-gray-800">Upload Your Key File</h2>
          <p className="text-sm text-gray-500 mt-2">
            Welcome back, <span className="font-semibold">{username}</span>!
            Upload your{' '}
            <code className="bg-gray-100 px-1 rounded">{username}_keys.json</code>{' '}
            file to restore your ElGamal and Dual Regev keys.
          </p>
        </div>

        {/* Drop Zone */}
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition
            ${dragging
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'}`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".json"
            onChange={handleFileChange}
            className="hidden"
          />
          {loading ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-blue-600 font-medium">Loading keys...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-gray-500">
              <span className="text-4xl">📂</span>
              <p className="font-medium text-gray-700">Click to browse or drag & drop</p>
              <p className="text-xs">{username}_keys.json</p>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            ⚠️ {error}
          </div>
        )}

        {/* Info */}
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-700 space-y-1">
          <p>🔒 Your private keys never leave your device — read locally in your browser.</p>
          <p>📦 This file contains both ElGamal and Dual Regev keys.</p>
        </div>

        {/* Cancel */}
        <button
          onClick={onCancel}
          className="mt-4 w-full text-sm text-gray-500 hover:text-gray-700 py-2 transition"
        >
          Cancel (logout)
        </button>
      </div>
    </div>
  );
}