import { useState, useEffect, useCallback, type ReactNode } from "react";
import { authApi } from "@/lib/api/auth";
import { AuthContext } from "./auth-context";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Check authentication on mount.
  // Uses pre-fetched promise from index.html if available (started during HTML parsing).
  useEffect(() => {
    const promise = (window as unknown as { __authPromise?: Promise<{ success: boolean; data?: { authenticated: boolean } }> }).__authPromise;

    const verify = promise
      ? promise.then((data) => data?.data?.authenticated === true)
      : authApi.verify().then((data) => data.data?.authenticated === true);

    verify
      .then(setIsAuthenticated)
      .catch(() => setIsAuthenticated(false))
      .finally(() => setIsCheckingAuth(false));
  }, []);

  const login = useCallback(async (password: string) => {
    try {
      const res = await authApi.login(password);

      if (res.success) {
        setIsAuthenticated(true);
        return { success: true };
      }
      return { success: false, error: res.error || "Login failed." };
    } catch {
      return { success: false, error: "Cannot reach the server." };
    }
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setIsAuthenticated(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, isCheckingAuth, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}
