import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './Context/AuthContext';
import { ToastProvider } from './Context/ToastContext';
import { ToastContainer } from './components/Toast';
import Login from './components/Auth/Login';
import ChatRoom from './components/Chat/ChatRoom';
import LoadingSpinner from './components/Shared/LoadingSpinner';
import KeyFileModal from './components/Shared/KeyFileModal';
import './App.css';

function AppRoutes() {
  const { isAuthenticated, isLoading, cryptoStatus, user, onKeyFileLoaded, logout } = useAuth();

  if (isLoading) return <LoadingSpinner />;

  return (
    <>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route
          path="/chat"
          element={isAuthenticated ? <ChatRoom /> : <Navigate to="/" />}
        />
        <Route path="*" element={<Navigate to={isAuthenticated ? '/chat' : '/'} />} />
      </Routes>

      {/* Show key upload modal when logged in but key not yet loaded into memory */}
      {isAuthenticated && cryptoStatus === 'needs_key_file' && (
        <KeyFileModal
          username={user?.username}
          onKeysLoaded={onKeyFileLoaded}
          onCancel={logout}
        />
      )}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppRoutes />
        <ToastContainer />
      </ToastProvider>
    </AuthProvider>
  );
}
