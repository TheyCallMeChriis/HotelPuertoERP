import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, getAuthToken, setAuthToken, removeAuthToken } from '../api/client';

export interface User {
  id: string;
  username: string;
  nombre: string;
  email: string;
  roles: string[];
  permisos: string[];
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, pass: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  hasRole: (role: string) => boolean;
  hasPermission: (modulo: string, accion: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('pos_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const token = getAuthToken();
      if (token) {
        const res = await api.auth.getMe();
        if (res.success && res.data) {
          setUser(res.data);
          localStorage.setItem('pos_user', JSON.stringify(res.data));
        } else {
          removeAuthToken();
          setUser(null);
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  const login = async (username: string, pass: string) => {
    const res = await api.auth.login({ username, password: pass });
    if (res.success && res.data) {
      setAuthToken(res.data.token);
      setUser(res.data.user);
      localStorage.setItem('pos_user', JSON.stringify(res.data.user));
      return { success: true };
    }
    return { success: false, message: res.message || 'Error al iniciar sesión' };
  };

  const logout = () => {
    removeAuthToken();
    setUser(null);
  };

  const hasRole = (role: string): boolean => {
    if (!user) return false;
    return user.roles.includes('ADMINISTRADOR') || user.roles.includes(role);
  };

  const hasPermission = (modulo: string, accion: string): boolean => {
    if (!user) return false;
    if (user.roles.includes('ADMINISTRADOR')) return true;
    return user.permisos.includes(`${modulo}:${accion}`);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasRole, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe ser usado dentro de un AuthProvider');
  return ctx;
};
