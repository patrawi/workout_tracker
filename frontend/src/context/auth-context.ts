import { createContext } from "react";

export interface AuthContextType {
  isAuthenticated: boolean;
  isCheckingAuth: boolean;
  login: (password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | null>(null);
