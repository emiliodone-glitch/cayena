"use client";

import { useEffect, useState } from "react";
import { API_URL } from "@/lib/api";

type Resumen = {
  militantesTotales: number;
  metaNacional: number;
  porcentajeNacional: number;
  estadoNacional: "rojo" | "amarillo" | "verde";
  obrasPorCategoria: { categoria: string; total: number }[];
  actividadesRealizadas: number;
  finanzas: { categoria: string; tipo: "INGRESO" | "GASTO"; total: number }[];
};

type ProvinciaResumen = {
  id: string;
  nombre: string;
  militantesCaptados: number;
  meta: number;
  porcentaje: number;
  estado: "rojo" | "amarillo" | "verde";
};

const ESTADO_COLOR: Record<string, string> = { rojo: "#dc2626", amarillo: "#f59e0b", verde: "#16a34a" };
const fmtMoney = new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP", maximumFractionDigits: 0 });

export default function TransparenciaPage() {
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [provincias, setProvincias] = useState<ProvinciaResumen[]>([]);

  useEffect(() => {
    fetch(`${API_URL}/transparencia/resumen`).then((r) => r.json()).then(setResumen);
    fetch(`${API_URL}/transparencia/provincias`).then((r) => r.json()).then(setProvincias);
  }, []);

  const gastoTotal = resumen?.finanzas.filter((f) => f.tipo === "GASTO").reduce((s, f) => s + f.total, 0) ?? 0;
  const ingresoTotal = resumen?.finanzas.filter((f) => f.tipo === "INGRESO").reduce((s, f) => s + f.total, 0) ?? 0;

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-institucional-600 text-2xl text-white">
            ✻
          </div>
          <h1 className="text-2xl font-bold text-institucional-900">Panel de transparencia</h1>
          <p className="text-sm text-gray-500">Fuerza del Pueblo · Datos públicos, actualizados en tiempo real</p>
        </div>

        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          <Kpi label="Militantes captados" value={resumen?.militantesTotales.toLocaleString("es-DO") ?? "—"} />
          <Kpi label="Avance meta nacional" value={resumen ? `${resumen.porcentajeNacional}%` : "—"} />
          <Kpi label="Actividades realizadas" value={resumen?.actividadesRealizadas.toLocaleString("es-DO") ?? "—"} />
          <Kpi label="Obras registradas" value={resumen?.obrasPorCategoria.reduce((s, o) => s + o.total, 0).toString() ?? "—"} />
        </div>

        <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">Avance por provincia</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {provincias.map((p) => (
              <div key={p.id} className="rounded-lg border border-gray-100 p-3 text-center">
                <div className="text-xs text-gray-500">{p.nombre}</div>
                <div className="mt-1 text-lg font-bold" style={{ color: ESTADO_COLOR[p.estado] }}>
                  {p.porcentaje}%
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">Obras por categoría</h2>
          <div className="space-y-2">
            {resumen?.obrasPorCategoria.map((o) => (
              <div key={o.categoria} className="flex items-center justify-between text-sm">
                <span className="capitalize text-gray-600">{o.categoria.toLowerCase().replace("_", " ")}</span>
                <span className="font-semibold text-institucional-900">{o.total}</span>
              </div>
            ))}
            {resumen && resumen.obrasPorCategoria.length === 0 && (
              <p className="text-sm text-gray-400">Aún no hay obras publicadas.</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">Finanzas agregadas</h2>
          <div className="grid grid-cols-2 gap-4 text-center sm:grid-cols-3">
            <div>
              <div className="text-lg font-bold text-institucional-700">{fmtMoney.format(ingresoTotal)}</div>
              <div className="text-xs text-gray-500">Ingresos totales</div>
            </div>
            <div>
              <div className="text-lg font-bold text-red-600">{fmtMoney.format(gastoTotal)}</div>
              <div className="text-xs text-gray-500">Gastos totales</div>
            </div>
            <div>
              <div className="text-lg font-bold text-institucional-900">{fmtMoney.format(ingresoTotal - gastoTotal)}</div>
              <div className="text-xs text-gray-500">Balance</div>
            </div>
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-gray-400">
          Cifras agregadas sin datos personales, conforme a la Ley 172-13 de Protección de Datos Personales.
        </p>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 text-center shadow-sm">
      <div className="text-2xl font-bold text-institucional-900">{value}</div>
      <div className="mt-1 text-xs text-gray-500">{label}</div>
    </div>
  );
}
