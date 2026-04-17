import { createContext, useContext, useState, useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';
import {
  AnamorphicKeyGen,
  loadKeysFromFile as egLoadFromFile,
  getPublicKeyForUpload,
  clearSessionKeys,
  setSessionKeys,
} from '../crypto/anamorphicCrypto';
import { jsonSafe } from '../crypto/cryptoUtils';
import {
  drAGen,
  drSerializeKeys,
  drDeserializeKeys,
  drSerializePublicKey,
  getDRPublicKeyForUpload,
  getDRSession,
  clearDRSession,
  setDRSession,
} from '../dualregev';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser]           = useState(null);
  const [token, setToken]         = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError]         = useState(null);
  // 'idle' | 'needs_key_file' | 'ready'
  const [cryptoStatus, setCryptoStatus] = useState('idle');

  // Restore session on page reload — token only, keys need re-upload
  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedUser  = localStorage.getItem('user');
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
      setCryptoStatus('needs_key_file');
    }
    setIsLoading(false);
  }, []);

  // ── Key initialisation ───────────────────────────────────────────────────

  async function _initKeys(accessToken, username) {
    try {
      const check = await fetch(`http://localhost:8000/keys/get/${username}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (check.ok) {
        // Returning user — needs to upload key file
        console.log('[AuthContext] Keys on server — awaiting key file upload');
        setCryptoStatus('needs_key_file');
        return;
      }

      // First login — generate both schemes in parallel
      console.log('[AuthContext] First login — generating keys...');
      const [egKeys, drKeys] = await Promise.all([
        AnamorphicKeyGen(512),   // ElGamal
        drAGen(16),              // Dual Regev λ=16 dev (change to 32/64 for prod)
      ]);

      // Store both in session
      setSessionKeys(egKeys);
      setDRSession(drKeys);

      // Download single combined key file
      _downloadCombinedKeyFile(username, egKeys, drKeys);

      // Upload both pubkeys to server
      await _uploadBothPubkeys(accessToken, egKeys, drKeys);

      console.log('[AuthContext] Both schemes ready ✓');
      setCryptoStatus('ready');
    } catch (err) {
      console.error('[AuthContext] Key init error:', err);
      setCryptoStatus('needs_key_file');
    }
  }

  /**
   * Called by KeyFileModal when user uploads the combined key file.
   * Restores both ElGamal and Dual Regev keys into session.
   * Throws on bad file so KeyFileModal can display the error.
   */
  const onKeyFileLoaded = async (file) => {
    try {
      const text = await file.text();
      const raw  = JSON.parse(text);

      // ── Restore ElGamal ─────────────────────────────────────────────
      if (!raw.elgamal?.aSK || !raw.elgamal?.dkey)
        throw new Error('Key file is missing ElGamal keys');
      const egFile = new File(
        [JSON.stringify({ aSK: raw.elgamal.aSK, dkey: raw.elgamal.dkey })],
        'eg.json',
        { type: 'application/json' },
      );
      await egLoadFromFile(egFile);

      // ── Restore Dual Regev ───────────────────────────────────────────
      if (!raw.dualregev)
        throw new Error('Key file is missing Dual Regev keys — please logout and login again to regenerate');
      const drKeys = drDeserializeKeys(raw.dualregev);
      setDRSession(drKeys);

      // Re-upload pubkeys in case server wiped them
      const egKeys = { aSK: null, dkey: null }; // pubkey comes from getPublicKeyForUpload()
      await _uploadBothPubkeys(token, null, drKeys);

      console.log('[AuthContext] Both schemes restored ✓');
      setCryptoStatus('ready');
    } catch (err) {
      console.error('[AuthContext] Key file load error:', err);
      throw err;
    }
  };

  // ── Login ────────────────────────────────────────────────────────────────

  const login = async (email, password) => {
    setError(null);
    setIsLoading(true);
    try {
      const username = email.split('@')[0];
      const formData = new FormData();
      formData.append('username', username);
      formData.append('password', password);

      const res = await fetch('http://localhost:8000/auth/login', {
        method: 'POST', body: formData,
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Login failed');

      const { access_token: accessToken } = await res.json();
      const decoded = jwtDecode(accessToken);
      const user = {
        id:         parseInt(decoded.user_id, 10),
        email,
        username,
        avatar:     `https://i.pravatar.cc/150?u=${email}`,
        created_at: new Date().toISOString(),
      };

      setUser(user);
      setToken(accessToken);
      localStorage.setItem('token', accessToken);
      localStorage.setItem('user', JSON.stringify(user));

      await _initKeys(accessToken, username);
      return user;
    } catch (err) {
      setError(err.message || 'Login failed');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // ── Register ─────────────────────────────────────────────────────────────

  const register = async (name, email, password) => {
    setError(null);
    setIsLoading(true);
    try {
      const username = email.split('@')[0];
      const res = await fetch(
        `http://localhost:8000/auth/signup?username=${username}&password=${password}`,
        { method: 'POST' },
      );
      if (!res.ok) throw new Error((await res.json()).detail || 'Registration failed');
      return await login(email, password);
    } catch (err) {
      setError(err.message || 'Registration failed');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // ── Logout ───────────────────────────────────────────────────────────────

  const logout = () => {
    setUser(null);
    setToken(null);
    setCryptoStatus('idle');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    clearSessionKeys();
    clearDRSession();
  };

  return (
    <AuthContext.Provider value={{
      user, token, isLoading, error,
      cryptoStatus,
      cryptoReady: cryptoStatus === 'ready',
      onKeyFileLoaded,
      login, register, logout,
      isAuthenticated: !!token,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

// ── Internal helpers ──────────────────────────────────────────────────────

async function _uploadBothPubkeys(accessToken, egKeys, drKeys) {
  const pubkey = {};
  const egPub  = getPublicKeyForUpload();
  if (egPub) pubkey.elgamal = egPub;

  const drPub = getDRPublicKeyForUpload() ?? (drKeys ? drSerializePublicKey(drKeys.apk) : null);
  if (drPub) pubkey.dualregev = drPub;

  if (!Object.keys(pubkey).length) return;

  const res = await fetch('http://localhost:8000/keys/upsert', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body:    JSON.stringify({ pubkey }),
  });
  if (!res.ok) console.warn('[AuthContext] Pubkey upload failed:', await res.text());
  else         console.log('[AuthContext] Both pubkeys uploaded ✓');
}

function _downloadCombinedKeyFile(username, egKeys, drKeys) {
  const content = JSON.stringify({
    username,
    created_at: new Date().toISOString(),
    elgamal:   jsonSafe({ aSK: egKeys.aSK, dkey: egKeys.dkey }),
    dualregev: drSerializeKeys(drKeys),
  }, null, 2);

  const blob = new Blob([content], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href: url, download: `${username}_keys.json`,
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  console.log(`[AuthContext] Combined key file downloaded: ${username}_keys.json`);
}