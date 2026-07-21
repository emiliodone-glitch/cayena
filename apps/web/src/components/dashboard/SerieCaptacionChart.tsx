"use client";

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export function SerieCaptacionChart({ serie }: { serie: { fecha: string; total: number }[] }) {
  const data = serie.map((s) => ({
    fecha: new Date(s.fecha + "T00:00:00").toLocaleDateString("es-DO", { day: "numeric", month: "short" }),
    total: s.total,
  }));

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ left: -20, right: 10, top: 10 }}>
          <defs>
            <linearGradient id="colorCaptacion" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#1f7a34" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#1f7a34" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="fecha" fontSize={11} interval="preserveStartEnd" />
          <YAxis fontSize={11} allowDecimals={false} />
          <Tooltip formatter={(v: number) => [v, "Militantes"]} />
          <Area type="monotone" dataKey="total" stroke="#1f7a34" strokeWidth={2} fill="url(#colorCaptacion)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
