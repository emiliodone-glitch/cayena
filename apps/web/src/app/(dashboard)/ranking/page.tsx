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

const MEDALLA_COLOR = ["#facc15", "#94a3b8", "#c2703d"];

export default function RankingPage() {
  const [ranking, setRanking] = useState<Fila[] | null>(null);

  useEffect(() => {
    apiFetch<Fila[]>("/usuarios/ranking-captacion").then(setRanking).catch(() => setRanking([]));
  }, []);

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Trophy className="h-6 w-6 text-institucional-600" />
        <h1 className="text-xl font-bold text-institucional-900">Ranking de captación</h1>
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
                    Todavía no hay militantes registrados desde el back office.
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
