"use client";

import { useState } from "react";

export type Periodo = "semana" | "mes" | "trimestre" | "custom";
export type RangoPeriodo = { periodo: Periodo; desde?: string; hasta?: string };

const OPCIONES: { valor: Periodo; label: string }[] = [
  { valor: "semana", label: "Semana" },
  { valor: "mes", label: "Mes" },
  { valor: "trimestre", label: "Trimestre" },
  { valor: "custom", label: "Rango" },
];

export function PeriodoSelector({
  value,
  onChange,
}: {
  value: RangoPeriodo;
  onChange: (v: RangoPeriodo) => void;
}) {
  const [desde, setDesde] = useState(value.desde ?? "");
  const [hasta, setHasta] = useState(value.hasta ?? "");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-lg border border-gray-200 bg-white p-1 text-sm">
        {OPCIONES.map((o) => (
          <button
            key={o.valor}
            onClick={() => onChange({ periodo: o.valor, desde, hasta })}
            className={`rounded-md px-3 py-1 ${
              value.periodo === o.valor ? "bg-institucional-600 text-white" : "text-gray-500"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {value.periodo === "custom" && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          />
          <span className="text-gray-400">–</span>
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          />
          <button
            onClick={() => desde && hasta && onChange({ periodo: "custom", desde, hasta })}
            disabled={!desde || !hasta}
            className="rounded-lg bg-institucional-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Aplicar
          </button>
        </div>
      )}
    </div>
  );
}
