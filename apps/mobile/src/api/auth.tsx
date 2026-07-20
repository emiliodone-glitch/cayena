import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiFetch, clearTokens, getTokens, setTokens } from "./client";

export type Usuario = {
  id: string;
  nombre: string;
  email: string;
  role: "SUPERADMIN" | "JEFE_SECRETARIA" | "PROMOTOR" | "AUDITOR" | "DIRIGENCIA" | "MILITANTE";
  secretariaId: string | null;
};

type AuthContextValue = {
  user: Usuario | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTokens().then(({ accessToken }) => {
      if (!accessToken) {
        setLoading(false);
        return;
      }
      apiFetch<Usuario>("/auth/me")
        .then(setUser)
        .catch(() => setUser(null))
        .finally(() => setLoading(false));
    });
  }, []);

  async function login(email: string, password: string) {
    const data = await apiFetch<{ accessToken: string; refreshToken: string; user: Usuario }>(
      "/auth/login",
      { method: "POST", body: JSON.stringify({ email, password }) },
      false,
    );
    await setTokens(data.accessToken, data.refreshToken);
    setUser(data.user);
  }

  async function logout() {
    await clearTokens();
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
