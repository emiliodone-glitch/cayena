"use client";

import { useEffect, useState } from "react";
import { Search, Phone, CheckCircle2 } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";

type Evento = { id: string; nombre: string; activo: boolean };

type Resultado = {
  id: string;
  nombre: string;
  cedula: string;
  telefono: string | null;
  provincia: string;
  municipio: string;
  confirmado: boolean;
  metodo: string | null;
  confirmadoEn: string | null;
};

// Buscador rápido de militante (RF nuevo): para quien está haciendo llamadas
// de seguimiento y solo necesita saber "¿fulano ya votó?" — sin navegar el
// mapa ni saber a qué provincia/municipio pertenece.
export default function BuscarMilitantePage() {
  const [eventos, setEventos] = useState<Evento[] | null>(null);
  const [eventoId, setEventoId] = useState("");
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<Resultado[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [marcando, setMarcando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Evento[]>("/dia-electoral/eventos").then((lista) => {
      setEventos(lista);
      setEventoId(lista.find((e) => e.activo)?.id ?? lista[0]?.id ?? "");
    });
  }, []);

  useEffect(() => {
    if (query.trim().length < 2 || !eventoId) {
      setResultados(null);
      return;
    }
    let cancelado = false;
    const timer = setTimeout(() => {
      setBuscando(true);
      apiFetch<Resultado[]>(`/dia-electoral/buscar?query=${encodeURIComponent(query.trim())}&eventoId=${eventoId}`)
        .then((data) => !cancelado && setResultados(data))
        .catch(() => !cancelado && setResultados([]))
        .finally(() => !cancelado && setBuscando(false));
    }, 300);
    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [query, eventoId]);

  async function marcarVotado(r: Resultado) {
    setMarcando(r.id);
    setError(null);
    try {
      await apiFetch("/dia-electoral/confirmar-mesa", {
        method: "POST",
        body: JSON.stringify({ eventoId, codigo: r.cedula }),
      });
      setResultados((prev) => (prev ? prev.map((x) => (x.id === r.id ? { ...x, confirmado: true } : x)) : prev));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo marcar el voto");
    } finally {
      setMarcando(null);
    }
  }

  if (eventos === null) return null;

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-4 flex items-center gap-2">
        <Search className="h-6 w-6 text-indigo-600" />
        <h1 className="text-xl font-bold text-institucional-900">Buscar militante</h1>
      </div>

      {eventos.length === 0 ? (
        <p className="text-sm text-gray-400">No hay ninguna jornada electoral registrada todavía.</p>
      ) : (
        <>
          <label className="mb-3 block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Jornada electoral</span>
            <select value={eventoId} onChange={(e) => setEventoId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              {eventos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre} {e.activo ? "· activa" : ""}
                </option>
              ))}
            </select>
          </label>

          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cédula o nombre…"
            className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />

          {buscando && <p className="text-sm text-gray-400">Buscando…</p>}
          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

          {resultados && !buscando && (
            <div className="space-y-2">
              {resultados.length === 0 && <p className="text-sm text-gray-400">Sin resultados.</p>}
              {resultados.map((r) => (
                <div key={r.id} className="rounded-lg border border-gray-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-institucional-900">{r.nombre}</div>
                      <div className="text-xs text-gray-500">
                        {r.cedula} · {r.municipio}, {r.provincia}
                      </div>
                    </div>
                    {r.confirmado ? (
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-institucional-50 px-2 py-1 text-xs font-semibold text-institucional-700">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Ya votó
                      </span>
                    ) : (
                      <button
                        onClick={() => marcarVotado(r)}
                        disabled={marcando === r.id}
                        className="shrink-0 rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                      >
                        {marcando === r.id ? "…" : "Marcar voto"}
                      </button>
                    )}
                  </div>
                  {r.telefono && (
                    <a href={`tel:${r.telefono}`} className="mt-2 flex items-center gap-1 text-xs text-indigo-600 hover:underline">
                      <Phone className="h-3 w-3" /> {r.telefono}
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
