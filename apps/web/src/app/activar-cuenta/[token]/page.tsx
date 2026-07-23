"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { apiFetch, ApiError } from "@/lib/api";

type Invitacion = { nombre: string; secretaria: string | null };

export default function ActivarCuentaPage({ params }: { params: { token: string } }) {
  const { activar } = useAuth();
  const { token } = params;

  const [invitacion, setInvitacion] = useState<Invitacion | null | undefined>(undefined);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch<Invitacion>(`/auth/activar/${token}`)
      .then(setInvitacion)
      .catch(() => setInvitacion(null));
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmar) {
      setError("Las contraseñas no coinciden");
      return;
    }
    setSubmitting(true);
    try {
      await activar(token, email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo activar la cuenta");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-institucional-900 to-institucional-600 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-institucional-600 text-2xl text-white">
            ✻
          </div>
          <h1 className="text-lg font-bold text-institucional-900">Cayena</h1>
          <p className="text-sm text-gray-500">Fuerza del Pueblo · Back Office</p>
        </div>

        {invitacion === undefined && <p className="text-center text-sm text-gray-400">Verificando invitación…</p>}

        {invitacion === null && (
          <p className="rounded-lg bg-red-50 p-3 text-center text-sm text-red-700">
            Este enlace de invitación no es válido o ya venció. Pide que te generen uno nuevo.
          </p>
        )}

        {invitacion && (
          <>
            <p className="mb-5 text-center text-sm text-gray-600">
              Hola <span className="font-semibold text-institucional-900">{invitacion.nombre}</span>
              {invitacion.secretaria && (
                <>
                  , vas a activar tu cuenta de la secretaría de{" "}
                  <span className="font-semibold text-institucional-900">{invitacion.secretaria}</span>
                </>
              )}
              . Confirma tu correo real y elige tu contraseña.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Tu correo real</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-institucional-600 focus:outline-none focus:ring-1 focus:ring-institucional-600"
                  placeholder="tucorreo@ejemplo.com"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Contraseña (mín. 8 caracteres)</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-institucional-600 focus:outline-none focus:ring-1 focus:ring-institucional-600"
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Confirmar contraseña</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmar}
                  onChange={(e) => setConfirmar(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-institucional-600 focus:outline-none focus:ring-1 focus:ring-institucional-600"
                  placeholder="••••••••"
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-institucional-600 py-2 text-sm font-semibold text-white transition hover:bg-institucional-700 disabled:opacity-60"
              >
                {submitting ? "Activando…" : "Activar mi cuenta"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
