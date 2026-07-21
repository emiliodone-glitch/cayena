"use client";

import { COLOR_ESTADO, type EstadoAvance } from "@cayena/shared";

type Fila = { id: string; nombre: string; porcentaje: number; estado: EstadoAvance };

function Lista({ titulo, filas }: { titulo: string; filas: Fila[] }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase text-gray-400">{titulo}</h3>
      <div className="space-y-2">
        {filas.map((f) => (
          <div key={f.id}>
            <div className="mb-0.5 flex justify-between text-xs text-gray-600">
              <span>{f.nombre}</span>
              <span className="font-semibold" style={{ color: COLOR_ESTADO[f.estado] }}>{f.porcentaje}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-gray-100">
              <div
                className="h-1.5 rounded-full"
                style={{ width: `${Math.min(100, f.porcentaje)}%`, background: COLOR_ESTADO[f.estado] }}
              />
            </div>
          </div>
        ))}
        {filas.length === 0 && <p className="text-xs text-gray-400">Sin datos suficientes.</p>}
      </div>
    </div>
  );
}

export function TopBottomProvincias({ top, bottom }: { top: Fila[]; bottom: Fila[] }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <Lista titulo="Mejor avance" filas={top} />
      <Lista titulo="Requieren atención" filas={bottom} />
    </div>
  );
}
