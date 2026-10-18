import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { User, TenantMembership } from '../types/api.types';
import { apiClient } from '../api/client';

interface AuthContextType {
  user: User | null;
  token: string | null;
  memberships: TenantMembership[];
  activeTenant: TenantMembership | null;
  activeRole: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (mobileNumber: string, password: string) => Promise<void>;
  logout: () => void;
  switchTenant: (tenantId: string) => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEYS = {
  TOKEN: 'waste_platform_token',
  USER: 'waste_platform_user',
  MEMBERSHIPS: 'waste_platform_memberships',
  ACTIVE_TENANT_ID: 'waste_platform_active_tenant_id',
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<TenantMembership[]>([]);
  const [activeTenant, setActiveTenant] = useState<TenantMembership | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize session from sessionStorage on app load
  useEffect(() => {
    try {
      const storedToken = sessionStorage.getItem(STORAGE_KEYS.TOKEN);
      const storedUser = sessionStorage.getItem(STORAGE_KEYS.USER);
      const storedMemberships = sessionStorage.getItem(STORAGE_KEYS.MEMBERSHIPS);
      const storedTenantId = sessionStorage.getItem(STORAGE_KEYS.ACTIVE_TENANT_ID);

      if (storedToken && storedUser && storedMemberships) {
        const parsedUser: User = JSON.parse(storedUser);
        const parsedMemberships: TenantMembership[] = JSON.parse(storedMemberships);

        setToken(storedToken);
        setUser(parsedUser);
        setMemberships(parsedMemberships);
        apiClient.setToken(storedToken);

        const current =
          parsedMemberships.find((m) => m.tenantId === storedTenantId) ||
          parsedMemberships.find((m) => m.isDefault) ||
          parsedMemberships[0] ||
          null;

        if (current) {
          setActiveTenant(current);
          apiClient.setTenantId(current.tenantId);
        }
      }
    } catch {
      // Clear corrupt sessionStorage safely
      sessionStorage.clear();
    } finally {
      setIsLoading(false);
    }

    // Attach unauthorized handler to auto-logout on session expiration
    apiClient.setOnUnauthorized(() => {
      logout();
      setError('Your session has expired. Please sign in again.');
    });
  }, []);

  const login = async (mobileNumber: string, password: string): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiClient.login(mobileNumber, password);

      setToken(res.token);
      setUser(res.user);
      setMemberships(res.memberships);
      apiClient.setToken(res.token);

      sessionStorage.setItem(STORAGE_KEYS.TOKEN, res.token);
      sessionStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(res.user));
      sessionStorage.setItem(STORAGE_KEYS.MEMBERSHIPS, JSON.stringify(res.memberships));

      const defaultTenant = res.memberships.find((m) => m.isDefault) || res.memberships[0] || null;
      if (defaultTenant) {
        setActiveTenant(defaultTenant);
        apiClient.setTenantId(defaultTenant.tenantId);
        sessionStorage.setItem(STORAGE_KEYS.ACTIVE_TENANT_ID, defaultTenant.tenantId);
      }
    } catch (err: any) {
      setError(err.message || 'Login failed. Please verify credentials.');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const switchTenant = (tenantId: string): void => {
    const target = memberships.find((m) => m.tenantId === tenantId);
    if (target) {
      setActiveTenant(target);
      apiClient.setTenantId(target.tenantId);
      sessionStorage.setItem(STORAGE_KEYS.ACTIVE_TENANT_ID, target.tenantId);
    }
  };

  const logout = (): void => {
    setUser(null);
    setToken(null);
    setMemberships([]);
    setActiveTenant(null);
    apiClient.setToken(null);
    apiClient.setTenantId(null);
    sessionStorage.removeItem(STORAGE_KEYS.TOKEN);
    sessionStorage.removeItem(STORAGE_KEYS.USER);
    sessionStorage.removeItem(STORAGE_KEYS.MEMBERSHIPS);
    sessionStorage.removeItem(STORAGE_KEYS.ACTIVE_TENANT_ID);
  };

  const clearError = (): void => setError(null);

  const activeRole = activeTenant ? activeTenant.roleName : null;
  const isAuthenticated = Boolean(token && user && activeTenant);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        memberships,
        activeTenant,
        activeRole,
        isAuthenticated,
        isLoading,
        error,
        login,
        logout,
        switchTenant,
        clearError,
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
