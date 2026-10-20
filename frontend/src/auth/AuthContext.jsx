import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import { setAccessTokenProvider, setUnauthorizedHandler } from '../api';
import { login as loginRequest } from '../services/auth.service';
import { clearStoredSession, loadStoredSession, persistSession } from './session';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(loadStoredSession);

  const logout = useCallback(() => {
    clearStoredSession();
    setAccessTokenProvider(null);
    setSession(null);
  }, []);

  useLayoutEffect(() => {
    setAccessTokenProvider(() => session?.accessToken ?? null);
    setUnauthorizedHandler(logout);

    return () => {
      setAccessTokenProvider(null);
      setUnauthorizedHandler(null);
    };
  }, [logout, session]);

  const login = useCallback(async (credentials, { remember = false } = {}) => {
    const responseSession = await loginRequest(credentials);
    const nextSession = persistSession(responseSession, remember);
    setAccessTokenProvider(() => nextSession.accessToken);
    setSession(nextSession);
    return nextSession;
  }, []);

  const value = useMemo(() => ({
    isAuthenticated: Boolean(session),
    login,
    logout,
    session,
    user: session?.user ?? null,
  }), [login, logout, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
