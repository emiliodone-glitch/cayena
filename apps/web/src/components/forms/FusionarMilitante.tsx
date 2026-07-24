"use client";

import { useEffect, useState } from "react";
import { Search, GitMerge } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { useToast } from "@/components/Toast";

type Candidato = {
  id: string;
  nombre: string;
  cedula: string;
  telefono: string | null;
  provincia: { nombre: string };
  municipio: { nombre: string };
};

// Fusiona un registro que resultó ser un duplicado (RF nuevo): mueve su
// historial (asistencias, confirmaciones de voto, insignias, puntos) al
// militante que se elige como el correcto, y borra el duplicado. A
// diferencia de la detección de duplicados al crear (que solo avisa), esto
// corrige los que ya se colaron en el padrón antes de tener esa alerta.
export function FusionarMilitante({
  duplicado,
  onFusionado,
  onCancel,
}: {
  duplicado: { id: string; nombre: string; cedula: string };
  onFusionado: () => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<Candidato[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [seleccionado, setSeleccionado] = useState<Candidato | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fusionando, setFusionando] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResultados(null);
      return;
    }
    setBuscando(true);
    const t = setTimeout(() => {
      apiFetch<Candidato[]>(`/militantes?q=${encodeURIComponent(q.trim())}`)
        .then((filas) => setResultados(filas.filter((f) => f.id !== duplicado.id)))
        .catch(() => setResultados([]))
        .finally(() => setBuscando(false));
    }, 350);
    return () => clearTimeout(t);
  }, [q, duplicado.id]);

  async function confirmarFusion() {
    if (!seleccionado) return;
    setError(null);
    setFusionando(true);
    try {
      await apiFetch("/militantes/fusionar", {
        method: "POST",
        body: JSON.stringify({ canonicoId: seleccionado.id, duplicadoId: duplicado.id }),
      });
      toast("Militantes fusionados");
      onFusionado();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo fusionar");
    } finally {
      setFusionando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        Vas a fusionar <span className="font-semibold">{duplicado.nombre}</span> (cédula {duplicado.cedula}) — busca
        abajo cuál es el registro correcto. Su historial (asistencias, confirmaciones de voto, insignias, puntos) se
        moverá ahí y este registro se eliminará.
      </div>

      {!seleccionado ? (
        <>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Buscar el militante correcto</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Nombre, cédula o teléfono…"
                className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-institucional-600 focus:outline-none"
              />
            </div>
          </label>

          {buscando && <p className="text-xs text-gray-400">Buscando…</p>}

          {resultados && resultados.length === 0 && !buscando && (
            <p className="text-xs text-gray-400">Sin coincidencias.</p>
          )}

          {resultados && resultados.length > 0 && (
            <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200">
              {resultados.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSeleccionado(r)}
                  className="flex w-full flex-col border-b border-gray-100 px-3 py-2 text-left text-sm last:border-0 hover:bg-gray-50"
                >
                  <span className="font-medium text-gray-800">{r.nombre}</span>
                  <span className="text-xs text-gray-400">
                    Cédula {r.cedula}
                    {r.telefono ? ` · tel. ${r.telefono}` : ""} · {r.municipio.nombre}, {r.provincia.nombre}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="rounded-lg border border-institucional-200 bg-institucional-50 p-3">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase text-institucional-700">
            <GitMerge className="h-3.5 w-3.5" /> Se conservará este registro
          </div>
          <div className="font-medium text-institucional-900">{seleccionado.nombre}</div>
          <div className="text-xs text-gray-500">
            Cédula {seleccionado.cedula} · {seleccionado.municipio.nombre}, {seleccionado.provincia.nombre}
          </div>
          <button
            type="button"
            onClick={() => setSeleccionado(null)}
            className="mt-2 text-xs font-medium text-institucional-600 hover:underline"
          >
            Elegir otro
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          disabled={!seleccionado || fusionando}
          onClick={confirmarFusion}
          className="flex-1 rounded-lg bg-institucional-600 px-5 py-2 text-sm font-semibold text-white hover:bg-institucional-700 disabled:opacity-60"
        >
          {fusionando ? "Fusionando…" : "Fusionar"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
