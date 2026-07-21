"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Medal, ArrowRight } from "lucide-react";
import { apiFetch } from "@/lib/api";

type Fila = { id: string; nombre: string; militantesCaptados: number };

const MEDALLA_COLOR = ["#facc15", "#94a3b8", "#c2703d"];

export function TopPromotores() {
  const [filas, setFilas] = useState<Fila[] | null>(null);

  useEffect(() => {
    apiFetch<Fila[]>("/usuarios/ranking-captacion")
      .then((data) => setFilas(data.slice(0, 3)))
      .catch(() => setFilas([]));
  }, []);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Top promotores</h3>
        <Link href="/ranking" className="flex items-center gap-1 text-xs font-medium text-institucional-700 hover:underline">
          Ver todos <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="space-y-2">
        {filas?.map((f, i) => (
          <div key={f.id} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <Medal className="h-4 w-4" style={{ color: MEDALLA_COLOR[i] }} />
              {f.nombre}
            </span>
            <span className="font-semibold text-institucional-700">{f.militantesCaptados}</span>
          </div>
        ))}
        {filas?.length === 0 && <p className="text-xs text-gray-400">Aún no hay registros de captación.</p>}
        {filas === null && <p className="text-xs text-gray-400">Cargando…</p>}
      </div>
    </div>
  );
}
