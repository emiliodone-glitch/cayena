"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";

type Evento = { id: string; nombre: string; fecha: string; activo: boolean };

type ResumenComparado = {
  militantesRegistrados: number;
  votosConfirmados: number;
  porcentajePropia: number;
  porcentajePadron: number | null;
};

type ProvinciaProps = { nombre: string; porcentajePropia: number; porcentajePadron: number | null };

// Comparar participación entre dos jornadas electorales distintas (RF nuevo)
// — a diferencia del "comparar dos períodos" del mapa de militantes (mismo
// filtro, rango de fechas distinto), acá cada EventoElectoral ya es un
// recorte propio, así que alcanza con pedir el mismo resumen/provincias con
// un eventoId distinto, sin necesitar un endpoint nuevo en el backend.
export function ComparacionJornadas({ eventos, eventoIdActual }: { eventos: Evento[]; eventoIdActual: string }) {
  const [abierto, setAbierto] = useState(false);
  const [eventoIdB, setEventoIdB] = useState("");
  const [resumenA, setResumenA] = useState<ResumenComparado | null>(null);
  const [resumenB, setResumenB] = useState<ResumenComparado | null>(null);
  const [provinciasA, setProvinciasA] = useState<ProvinciaProps[]>([]);
  const [provinciasB, setProvinciasB] = useState<ProvinciaProps[]>([]);
  const [cargando, setCargando] = useState(false);

  const otrosEventos = eventos.filter((e) => e.id !== eventoIdActual);

  async function comparar(id: string) {
    setEventoIdB(id);
    if (!id) {
      setResumenB(null);
      setProvinciasB([]);
      return;
    }
    setCargando(true);
    try {
      const [rA, rB, pA, pB] = await Promise.all([
        apiFetch<ResumenComparado>(`/dia-electoral/resumen/${eventoIdActual}`),
        apiFetch<ResumenComparado>(`/dia-electoral/resumen/${id}`),
        apiFetch<{ features: { properties: ProvinciaProps }[] }>(`/dia-electoral/provincias?eventoId=${eventoIdActual}`),
        apiFetch<{ features: { properties: ProvinciaProps }[] }>(`/dia-electoral/provincias?eventoId=${id}`),
      ]);
      setResumenA(rA);
      setResumenB(rB);
      setProvinciasA(pA.features.map((f) => f.properties));
      setProvinciasB(pB.features.map((f) => f.properties));
    } finally {
      setCargando(false);
    }
  }

  if (otrosEventos.length === 0) return null;

  return (
    <div className="mb-4">
      <button onClick={() => setAbierto((v) => !v)} className="text-sm font-semibold text-institucional-700 hover:underline">
        {abierto ? "Ocultar comparación de jornadas" : "⇄ Comparar con otra jornada"}
      </button>
      {abierto && (
        <div className="mt-2 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Comparar con</span>
            <select
              value={eventoIdB}
              onChange={(e) => comparar(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="">Elige una jornada…</option>
              {otrosEventos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </select>
          </label>

          {cargando && <p className="mt-3 text-sm text-gray-400">Cargando…</p>}

          {resumenA && resumenB && !cargando && (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ColumnaComparacion titulo="Esta jornada" resumen={resumenA} provincias={provinciasA} />
              <ColumnaComparacion
                titulo={otrosEventos.find((e) => e.id === eventoIdB)?.nombre ?? "Comparación"}
                resumen={resumenB}
                provincias={provinciasB}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ColumnaComparacion({
  titulo,
  resumen,
  provincias,
}: {
  titulo: string;
  resumen: ResumenComparado;
  provincias: ProvinciaProps[];
}) {
  const top5 = [...provincias].sort((a, b) => b.porcentajePropia - a.porcentajePropia).slice(0, 5);
  return (
    <div className="rounded-lg border border-gray-100 p-3">
      <div className="mb-2 truncate text-xs font-semibold uppercase text-gray-400">{titulo}</div>
      <div className="text-2xl font-bold text-institucional-900">{resumen.porcentajePropia}%</div>
      <div className="mb-3 text-xs text-gray-500">
        {resumen.votosConfirmados} de {resumen.militantesRegistrados} militantes confirmaron
        {resumen.porcentajePadron != null && ` · ${resumen.porcentajePadron}% del padrón`}
      </div>
      <div className="mb-1 text-xs font-semibold uppercase text-gray-400">Top 5 provincias</div>
      {top5.map((p) => (
        <div key={p.nombre} className="flex justify-between text-xs text-gray-600">
          <span>{p.nombre}</span>
          <span className="font-semibold">{p.porcentajePropia}%</span>
        </div>
      ))}
      {top5.length === 0 && <p className="text-xs text-gray-400">Sin datos</p>}
    </div>
  );
}
