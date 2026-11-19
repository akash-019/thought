/**
 * File: src/auth/AuthContext.tsx
 *
 * Who is logged in. Provides `user` plus `login`, `signup` and `logout` to every page.
 * On page load it asks the backend who the saved token belongs to (GET /me).
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, LOGGED_OUT_EVENT, tokens } from '../api/client';
import type { AuthResponse, Role, User } from '../api/types';

export interface SignupInput {
  name: string;
  email: string;
  password: string;
  role: Role;
  timezone: string;
  bio?: string;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (input: SignupInput) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tokens.access()) {
      setLoading(false);
      return;
    }
    api<{ user: User }>('/me')
      .then((res) => setUser(res.user))
      .catch(() => tokens.clear())
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onLoggedOut = () => setUser(null);
    window.addEventListener(LOGGED_OUT_EVENT, onLoggedOut);
    return () => window.removeEventListener(LOGGED_OUT_EVENT, onLoggedOut);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<AuthResponse>('/auth/login', { method: 'POST', body: { email, password } });
    tokens.save(res);
    setUser(res.user);
  }, []);

  const signup = useCallback(async (input: SignupInput) => {
    const res = await api<AuthResponse>('/auth/signup', { method: 'POST', body: input });
    tokens.save(res);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = tokens.refresh();
    if (refreshToken) await api('/auth/logout', { method: 'POST', body: { refreshToken } }).catch(() => {});
    tokens.clear();
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, loading, login, signup, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** For pages that only render when logged in. */
export function useUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error('useUser needs a logged-in user');
  return user;
}
