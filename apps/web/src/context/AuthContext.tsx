'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  apiClient,
  clearAuthToken,
  getAuthToken,
  setAuthToken,
} from '@/lib/api-client';

export interface AuthUserProfile {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  organizationId: string;
  organizationName: string;
  role: string;
  permissions: string[];
}

interface AuthContextValue {
  user: AuthUserProfile | null;
  isLoading: boolean;
  loginWithToken: (token: string) => Promise<void>;
  logout: () => void;
  refreshMe: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const refreshMe = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const me = await apiClient.get<AuthUserProfile>('/auth/me', {
        skipAuthRedirect: true,
      });
      setUser(me);
    } catch {
      clearAuthToken();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  const loginWithToken = useCallback(
    async (token: string) => {
      setAuthToken(token);
      setIsLoading(true);
      await refreshMe();
    },
    [refreshMe],
  );

  const logout = useCallback(() => {
    clearAuthToken();
    setUser(null);
    router.push('/login');
  }, [router]);

  const hasPermission = useCallback(
    (permission: string) => {
      if (!user) return false;
      return user.permissions.includes(permission);
    },
    [user],
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        loginWithToken,
        logout,
        refreshMe,
        hasPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
