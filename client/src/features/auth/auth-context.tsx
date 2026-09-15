import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Role, UserSummary } from "@sms/shared";
import { authApi, setAuthFailureHandler } from "@/api/auth";
import { tokenStore } from "@/api/client";

interface AuthState {
  user: UserSummary | null;
  /** True until the initial session-restore attempt resolves. */
  isBooting: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<UserSummary>;
  register: (input: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }) => Promise<UserSummary>;
  logout: () => Promise<void>;
  updateUser: (u: UserSummary) => void;
  hasRole: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserSummary | null>(null);
  const [isBooting, setIsBooting] = useState(true);

  // On mount, try to restore a session from the refresh cookie.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await authApi.restore();
      if (!cancelled && result) setUser(result.user);
      if (!cancelled) setIsBooting(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // If a refresh ever fails mid-session, drop the user.
  useEffect(() => {
    setAuthFailureHandler(() => setUser(null));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await authApi.login(email, password);
    tokenStore.set(result.accessToken);
    setUser(result.user);
    return result.user;
  }, []);

  const register = useCallback(
    async (input: { email: string; password: string; firstName: string; lastName: string }) => {
      const result = await authApi.register(input);
      tokenStore.set(result.accessToken);
      setUser(result.user);
      return result.user;
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      tokenStore.clear();
      setUser(null);
    }
  }, []);

  const updateUser = useCallback((u: UserSummary) => setUser(u), []);

  const hasRole = useCallback(
    (...roles: Role[]) => (user ? roles.includes(user.role) : false),
    [user],
  );

  const value = useMemo<AuthState>(
    () => ({
      user,
      isBooting,
      isAuthenticated: user !== null,
      login,
      register,
      logout,
      updateUser,
      hasRole,
    }),
    [user, isBooting, login, register, logout, updateUser, hasRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
