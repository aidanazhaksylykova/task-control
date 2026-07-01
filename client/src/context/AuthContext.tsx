import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import { demoUser } from '../data/demoData';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  ready: boolean;
}

const AuthContext = createContext<AuthState | null>(null);

// Проект открыт без входа: сервер сам подставляет учётную запись руководителя
// по умолчанию для запросов без токена, клиент просто спрашивает, кто это.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api
      .get('/auth/me')
      .then(({ data }) => setUser(data.user))
      .catch(() => setUser(demoUser))
      .finally(() => setReady(true));
  }, []);

  return <AuthContext.Provider value={{ user, ready }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth должен использоваться внутри AuthProvider');
  return ctx;
}
