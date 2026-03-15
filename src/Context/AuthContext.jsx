import { createContext, useContext, useState, useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';
import {
  generateAndDownloadKeys,
  getPublicKeyForUpload,
  clearSessionKeys,
} from '../crypto/anamorphicCrypto';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser]           = useState(null);
  const [token, setToken]         = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError]         = useState(null);

  // 'idle' | 'needs_key_file' | 'ready'
  const [cryptoStatus, setCryptoStatus] = useState('idle');

  // Restore session on page reload (token only — keys must be re-uploaded)
  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedUser  = localStorage.getItem('user');
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
      // Keys are NOT in localStorage — user must upload file again
      setCryptoStatus('needs_key_file');
    }
    setIsLoading(false);
  }, []);

  // ── Key initialisation ───────────────────────────────────────────────────

  /**
   * Check if the server already has a key for this user.
   * If yes  → they have a key file → show upload modal
   * If no   → first time → generate keys + download file + upload to server
   */
  async function _initKeys(accessToken, username) {
    try {
      // Check if key already exists on server
      const checkRes = await fetch(
        `http://localhost:8000/keys/get/${username}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (checkRes.ok) {
        // Returning user — they need to upload their key file
        console.log('[AuthContext] Key found on server — waiting for key file upload');
        setCryptoStatus('needs_key_file');
      } else {
        // First time — generate, download, upload
        console.log('[AuthContext] No key on server — generating new keys...');
        await generateAndDownloadKeys(username, 512); // use 2048 in production

        const pubkey = getPublicKeyForUpload();
        if (pubkey) {
          await fetch('http://localhost:8000/keys/upsert', {
            method:  'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization:  `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ pubkey }),
          });
          console.log('[AuthContext] New public key uploaded to server ✓');
        }

        setCryptoStatus('ready');
      }
    } catch (err) {
      console.error('[AuthContext] Key init error:', err);
      setCryptoStatus('needs_key_file');
    }
  }

  /**
   * Called by KeyFileModal after the user successfully uploads their file.
   * Also re-uploads dkey to server in case it was wiped.
   */
  const onKeyFileLoaded = async () => {
    try {
      const pubkey = getPublicKeyForUpload();
      if (pubkey && token) {
        await fetch('http://localhost:8000/keys/upsert', {
          method:  'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization:  `Bearer ${token}`,
          },
          body: JSON.stringify({ pubkey }),
        });
      }
    } catch (err) {
      console.error('[AuthContext] Re-upload after file load failed:', err);
    }
    setCryptoStatus('ready');
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

      const response = await fetch('http://localhost:8000/auth/login', {
        method: 'POST',
        body:   formData,
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Login failed');
      }

      const data        = await response.json();
      const accessToken = data.access_token;
      const decoded     = jwtDecode(accessToken);
      const realUserId  = parseInt(decoded.user_id, 10);

      const user = {
        id:         realUserId,
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

      console.log('[AuthContext] Login successful:', username);
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
      const response = await fetch(
        `http://localhost:8000/auth/signup?username=${username}&password=${password}`,
        { method: 'POST' }
      );
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Registration failed');
      }
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
    clearSessionKeys(); // wipe in-memory keys
  };

  return (
    <AuthContext.Provider value={{
      user,
      token,
      isLoading,
      error,
      cryptoStatus,          // 'idle' | 'needs_key_file' | 'ready'
      cryptoReady: cryptoStatus === 'ready',
      onKeyFileLoaded,       // called by KeyFileModal on success
      login,
      register,
      logout,
      isAuthenticated: !!token,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
