import { createContext, useContext, useState, useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Check if user is already logged in
  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
    }
    
    setIsLoading(false);
  }, []);

  const login = async (email, password) => {
    setError(null);
    setIsLoading(true);
    
    try {
      const username = email.split('@')[0];
      
      // Use FormData for OAuth2PasswordRequestForm
      const formData = new FormData();
      formData.append('username', username);
      formData.append('password', password);
      
      const response = await fetch('http://localhost:8000/auth/login', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Login failed');
      }

      const data = await response.json();
      const accessToken = data.access_token;
      
      // ===== DECODE JWT TO GET REAL USER ID =====
      const decoded = jwtDecode(accessToken);
      const realUserId = parseInt(decoded.user_id, 10);
      console.log('[AuthContext] Decoded JWT - user_id:', realUserId);
      // ==========================================
      
      // Create user object with REAL user ID from JWT
      const user = {
        id: realUserId,  // Use REAL ID from JWT, not Date.now()!
        email,
        username: username,
        avatar: `https://i.pravatar.cc/150?u=${email}`,
        created_at: new Date().toISOString(),
      };
      
      setUser(user);
      setToken(accessToken);
      localStorage.setItem('token', accessToken);
      localStorage.setItem('user', JSON.stringify(user));
      
      console.log('[AuthContext] Login successful - user:', user);
      return user;
    } catch (err) {
      const errorMessage = err.message || 'Login failed';
      setError(errorMessage);
      console.error('[AuthContext] Login error:', errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (name, email, password) => {
    setError(null);
    setIsLoading(true);
    
    try {
      const username = email.split('@')[0];
      
      // Signup uses query parameters
      const response = await fetch(
        `http://localhost:8000/auth/signup?username=${username}&password=${password}`,
        {
          method: 'POST',
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Registration failed');
      }

      console.log('[AuthContext] Registration successful, logging in...');
      
      // After successful registration, automatically login
      return await login(email, password);
    } catch (err) {
      const errorMessage = err.message || 'Registration failed';
      setError(errorMessage);
      console.error('[AuthContext] Register error:', errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        error,
        login,
        register,
        logout,
        isAuthenticated: !!token,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
