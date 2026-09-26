import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User } from '../types/index.js';
import { authApi } from './api.js';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  error: Error | null;
  isAuthenticated: boolean;
  logout: () => Promise<void>;
  refetchUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchUser = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const currentUser = await authApi.getCurrentUser();
      setUser(currentUser);
    } catch (err: any) {
      setUser(null);
      // 401 Unauthorized is expected when user is not logged in
      if (err?.response?.status !== 401) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
  }, []);

  const logout = async () => {
    try {
      await authApi.logout();
    } catch (err) {
      console.warn('Logout API call failed:', err);
    } finally {
      setUser(null);
      window.location.href = '/login';
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        error,
        isAuthenticated: !!user,
        logout,
        refetchUser: fetchUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
