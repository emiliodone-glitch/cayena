"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

const PALETA = ["#1f7a34", "#4cae5c", "#f59e0b", "#0891b2", "#7c3aed", "#dc2626", "#ca8a04", "#4b5563"];

const fmtMoney = new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP", maximumFractionDigits: 0 });

export function GastosDonut({ datos }: { datos: { categoria: string; total: number }[] }) {
  if (datos.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-gray-400">
        Sin gastos registrados en este período.
      </div>
    );
  }

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={datos} dataKey="total" nameKey="categoria" innerRadius={45} outerRadius={80} paddingAngle={2}>
            {datos.map((d, i) => (
              <Cell key={d.categoria} fill={PALETA[i % PALETA.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v: number) => fmtMoney.format(v)} />
          <Legend verticalAlign="bottom" height={24} iconSize={8} wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
