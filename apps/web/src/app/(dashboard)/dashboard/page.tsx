"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { KpiCard } from "@/components/KpiCard";

type Resumen = {
  militantesTotales: number;
  metaNacional: number;
  porcentajeNacional: number;
  estadoNacional: "rojo" | "amarillo" | "verde";
  obrasRegistradas: number;
  gastosDelMes: number;
  actividadesRecientes: { id: string; titulo: string; fecha: string; ubicacion: string | null }[];
};

const fmtMoney = new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP", maximumFractionDigits: 0 });

type Alerta = { id: string; titulo: string; cuerpo: string; enviadaAt: string };

export default function DashboardPage() {
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [alertas, setAlertas] = useState<Alerta[]>([]);

  useEffect(() => {
    apiFetch<Resumen>("/dashboard/resumen").then(setResumen).catch(() => setResumen(null));
    apiFetch<Alerta[]>("/dashboard/alertas").then(setAlertas).catch(() => setAlertas([]));
  }, []);

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-institucional-900">Dashboard general</h1>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard label="Militantes totales" value={resumen ? resumen.militantesTotales.toLocaleString("es-DO") : "—"} />
        <KpiCard label="Meta nacional" value={resumen ? `${resumen.porcentajeNacional}%` : "—"} />
        <KpiCard label="Obras registradas" value={resumen ? resumen.obrasRegistradas.toLocaleString("es-DO") : "—"} />
        <KpiCard label="Gastos del mes" value={resumen ? fmtMoney.format(resumen.gastosDelMes) : "—"} />
      </div>

      {alertas.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="mb-3 text-sm font-semibold text-amber-800">⚠ Alertas de estancamiento de metas</h2>
          <ul className="space-y-2">
            {alertas.map((a) => (
              <li key={a.id} className="text-sm">
                <span className="font-semibold text-amber-900">{a.titulo}</span>
                <span className="ml-2 text-amber-700">{a.cuerpo}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Actividades recientes</h2>
        <ul className="divide-y divide-gray-100">
          {resumen?.actividadesRecientes.map((a) => (
            <li key={a.id} className="flex items-center justify-between py-2 text-sm">
              <span>{a.titulo}</span>
              <span className="text-gray-400">
                {new Date(a.fecha).toLocaleDateString("es-DO")} {a.ubicacion ? `· ${a.ubicacion}` : ""}
              </span>
            </li>
          ))}
          {resumen && resumen.actividadesRecientes.length === 0 && (
            <li className="py-2 text-sm text-gray-400">Sin actividades recientes.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
