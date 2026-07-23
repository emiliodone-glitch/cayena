"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, clearTokens, setTokens } from "./api";

export type Usuario = {
  id: string;
  nombre: string;
  email: string;
  role:
    | "SUPERADMIN"
    | "JEFE_SECRETARIA"
    | "PROMOTOR"
    | "AUDITOR"
    | "DIRIGENCIA"
    | "MILITANTE";
  secretariaId: string | null;
  // Territorio asignado (coordinador de zona), ya resuelto con toda la
  // cadena de ancestros (provincia → municipio → distrito) sin importar cuál
  // de los tres es el que el usuario tiene asignado directamente — así el
  // mapa puede ubicarse en un solo paso. Todo en null = ve el país completo.
  alcanceProvinciaId: string | null;
  alcanceProvinciaNombre: string | null;
  alcanceMunicipioId: string | null;
  alcanceMunicipioNombre: string | null;
  alcanceDistritoId: string | null;
  alcanceDistritoNombre: string | null;
};

type AuthContextValue = {
  user: Usuario | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    apiFetch<Usuario>("/auth/me")
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const data = await apiFetch<{ accessToken: string; refreshToken: string; user: Usuario }>(
      "/auth/login",
      { method: "POST", body: JSON.stringify({ email, password }) },
    );
    setTokens(data.accessToken, data.refreshToken);
    setUser(data.user);
    router.push("/dashboard");
  }

  function logout() {
    clearTokens();
    setUser(null);
    router.push("/login");
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
