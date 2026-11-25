import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { PaginatedResponse, WarehouseDto } from '@opstrace/shared-types';
import {
  apiClient,
  clearAuthToken,
  getAuthToken,
  isNetworkError,
  setAuthToken,
  setOnUnauthorized,
} from '@/lib/api-client';

export interface MobileUserProfile {
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
  user: MobileUserProfile | null;
  warehouses: WarehouseDto[];
  activeWarehouse: WarehouseDto | null;
  setActiveWarehouse: (wh: WarehouseDto | null) => void;
  isOnline: boolean;
  setIsOnline: (online: boolean) => void;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<MobileUserProfile | null>(null);
  const [warehouses, setWarehouses] = useState<WarehouseDto[]>([]);
  const [activeWarehouse, setActiveWarehouse] = useState<WarehouseDto | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  const hydrateSession = useCallback(async () => {
    const token = await getAuthToken();
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const [me, whRes] = await Promise.all([
        apiClient.get<MobileUserProfile>('/auth/me', { skipAuthRedirect: true }),
        apiClient.get<PaginatedResponse<WarehouseDto>>('/warehouses?limit=50', {
          skipAuthRedirect: true,
        }),
      ]);
      setUser(me);
      setWarehouses(whRes.data);
      if (whRes.data[0]) {
        setActiveWarehouse((prev) => prev ?? whRes.data[0] ?? null);
      }
      setIsOnline(true);
    } catch (err) {
      if (isNetworkError(err)) {
        setIsOnline(false);
      } else {
        await clearAuthToken();
        setUser(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    setOnUnauthorized(() => {
      setUser(null);
    });
    void hydrateSession();
    return () => setOnUnauthorized(null);
  }, [hydrateSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await apiClient.post<{ accessToken: string }>(
        '/auth/login',
        { email, password },
        { skipAuthRedirect: true },
      );
      await setAuthToken(res.accessToken);
      setIsLoading(true);
      await hydrateSession();
    },
    [hydrateSession],
  );

  const logout = useCallback(async () => {
    await clearAuthToken();
    setUser(null);
    setWarehouses([]);
    setActiveWarehouse(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        warehouses,
        activeWarehouse,
        setActiveWarehouse,
        isOnline,
        setIsOnline,
        isLoading,
        login,
        logout,
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
