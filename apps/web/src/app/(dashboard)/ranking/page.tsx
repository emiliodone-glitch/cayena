"use client";

import { useEffect, useState } from "react";
import { Trophy, Medal } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { TableSkeleton } from "@/components/Skeleton";

type Fila = {
  id: string;
  nombre: string;
  role: string;
  secretaria: string | null;
  militantesCaptados: number;
};

type Periodo = "todo" | "semana" | "mes" | "trimestre" | "custom";

const OPCIONES: { valor: Periodo; label: string }[] = [
  { valor: "todo", label: "Todo el tiempo" },
  { valor: "semana", label: "Semana" },
  { valor: "mes", label: "Mes" },
  { valor: "trimestre", label: "Trimestre" },
  { valor: "custom", label: "Rango" },
];

const MEDALLA_COLOR = ["#facc15", "#94a3b8", "#c2703d"];

export default function RankingPage() {
  const [ranking, setRanking] = useState<Fila[] | null>(null);
  const [periodo, setPeriodo] = useState<Periodo>("todo");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  useEffect(() => {
    const params = new URLSearchParams({ periodo });
    if (periodo === "custom" && desde && hasta) {
      params.set("desde", desde);
      params.set("hasta", hasta);
    }
    apiFetch<Fila[]>(`/usuarios/ranking-captacion?${params.toString()}`)
      .then(setRanking)
      .catch(() => setRanking([]));
  }, [periodo, desde, hasta]);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-6 w-6 text-institucional-600" />
          <h1 className="text-xl font-bold text-institucional-900">Ranking de captación</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 bg-white p-1 text-sm">
            {OPCIONES.map((o) => (
              <button
                key={o.valor}
                onClick={() => setPeriodo(o.valor)}
                className={`rounded-md px-3 py-1 ${periodo === o.valor ? "bg-institucional-600 text-white" : "text-gray-500"}`}
              >
                {o.label}
              </button>
            ))}
          </div>
          {periodo === "custom" && (
            <div className="flex items-center gap-1.5">
              <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
              <span className="text-gray-400">–</span>
              <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
            </div>
          )}
        </div>
      </div>
      <p className="mb-6 text-sm text-gray-500">
        Promotores y jefes de secretaría con más militantes registrados desde el back office.
      </p>

      {ranking === null ? (
        <TableSkeleton cols={4} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-2">#</th>
                <th className="px-4 py-2">Nombre</th>
                <th className="px-4 py-2">Secretaría</th>
                <th className="px-4 py-2">Militantes captados</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ranking.map((f, i) => (
                <tr key={f.id}>
                  <td className="px-4 py-2">
                    {i < 3 ? (
                      <Medal className="h-4 w-4" style={{ color: MEDALLA_COLOR[i] }} />
                    ) : (
                      <span className="text-gray-400">{i + 1}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 font-medium">{f.nombre}</td>
                  <td className="px-4 py-2 text-gray-500">{f.secretaria ?? "—"}</td>
                  <td className="px-4 py-2 font-semibold text-institucional-700">
                    {f.militantesCaptados.toLocaleString("es-DO")}
                  </td>
                </tr>
              ))}
              {ranking.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                    Todavía no hay militantes registrados en este período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
