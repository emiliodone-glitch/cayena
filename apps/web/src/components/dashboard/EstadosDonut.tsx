"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { COLOR_ESTADO } from "@cayena/shared";

export function EstadosDonut({ conteo }: { conteo: { rojo: number; amarillo: number; verde: number } }) {
  const data = [
    { name: "Lejos de meta", value: conteo.rojo, color: COLOR_ESTADO.rojo },
    { name: "En curso", value: conteo.amarillo, color: COLOR_ESTADO.amarillo },
    { name: "Meta cumplida", value: conteo.verde, color: COLOR_ESTADO.verde },
  ];
  const total = conteo.rojo + conteo.amarillo + conteo.verde;

  return (
    <div className="relative h-56">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={2}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
          <Tooltip />
          <Legend verticalAlign="bottom" height={24} iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-6">
        <span className="text-2xl font-bold text-institucional-900">{total}</span>
        <span className="text-[11px] text-gray-400">provincias</span>
      </div>
    </div>
  );
}
