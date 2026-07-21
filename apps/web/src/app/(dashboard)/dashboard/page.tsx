"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { KpiCard } from "@/components/KpiCard";
import { CardSkeleton } from "@/components/Skeleton";

const MapaMilitantes = dynamic(
  () => import("@/components/MapaMilitantes").then((m) => m.MapaMilitantes),
  { ssr: false, loading: () => <div className="h-[360px] animate-pulse rounded-xl bg-gray-100" /> },
);

type Resumen = {
  militantesTotales: number;
  metaNacional: number;
  porcentajeNacional: number;
  estadoNacional: "rojo" | "amarillo" | "verde";
  obrasRegistradas: number;
  gastosDelMes: number;
  tendenciaMilitantes: number | null;
  tendenciaGastos: number | null;
  actividadesRecientes: { id: string; titulo: string; fecha: string; ubicacion: string | null }[];
  vistaSecretaria: {
    nombre: string;
    militantesCaptados: number;
    gastosDelMes: number;
    poaResumen: { nombre: string; porcentaje: number }[];
    actividadesRecientes: { id: string; titulo: string; fecha: string; ubicacion: string | null }[];
  } | null;
};

type Alerta = { id: string; titulo: string; cuerpo: string; enviadaAt: string };

const fmtMoney = new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP", maximumFractionDigits: 0 });

function Tendencia({ valor }: { valor: number | null }) {
  if (valor === null) return null;
  const positivo = valor >= 0;
  return (
    <span className={`ml-2 inline-flex items-center gap-0.5 text-xs font-semibold ${positivo ? "text-institucional-600" : "text-red-600"}`}>
      {positivo ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {positivo ? "+" : ""}{valor}%
    </span>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [alertas, setAlertas] = useState<Alerta[]>([]);

  useEffect(() => {
    apiFetch<Resumen>("/dashboard/resumen").then(setResumen).catch(() => setResumen(null));
    apiFetch<Alerta[]>("/dashboard/alertas").then(setAlertas).catch(() => setAlertas([]));
  }, []);

  const vistaSecretaria = resumen?.vistaSecretaria;

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-institucional-900">
        {vistaSecretaria ? `Dashboard · ${vistaSecretaria.nombre}` : "Dashboard general"}
      </h1>

      {vistaSecretaria && (
        <div className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">Tu secretaría</h2>
          <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-3">
            <KpiCard label="Militantes captados por tu equipo" value={vistaSecretaria.militantesCaptados.toLocaleString("es-DO")} />
            <KpiCard label="Gastos del mes" value={fmtMoney.format(vistaSecretaria.gastosDelMes)} />
            <KpiCard label="Metas POA activas" value={String(vistaSecretaria.poaResumen.length)} />
          </div>
          {vistaSecretaria.poaResumen.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-gray-700">Avance de tus metas POA</h3>
              <div className="space-y-3">
                {vistaSecretaria.poaResumen.map((p) => (
                  <div key={p.nombre}>
                    <div className="mb-1 flex justify-between text-xs text-gray-500">
                      <span>{p.nombre}</span>
                      <span>{p.porcentaje}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-gray-100">
                      <div className="h-2 rounded-full bg-institucional-600" style={{ width: `${Math.min(100, p.porcentaje)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <h2 className="mb-3 text-sm font-semibold text-gray-700">
        {vistaSecretaria ? "Contexto nacional" : "Resumen nacional"}
      </h2>
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {resumen === null ? (
          <>
            <CardSkeleton /><CardSkeleton /><CardSkeleton /><CardSkeleton />
          </>
        ) : (
          <>
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-baseline text-2xl font-bold text-institucional-900">
                {resumen.militantesTotales.toLocaleString("es-DO")}
                <Tendencia valor={resumen.tendenciaMilitantes} />
              </div>
              <div className="mt-1 text-sm text-gray-500">Militantes totales</div>
            </div>
            <KpiCard label="Meta nacional" value={`${resumen.porcentajeNacional}%`} />
            <KpiCard label="Obras registradas" value={resumen.obrasRegistradas.toLocaleString("es-DO")} />
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-baseline text-2xl font-bold text-institucional-900">
                {fmtMoney.format(resumen.gastosDelMes)}
                <Tendencia valor={resumen.tendenciaGastos !== null ? -resumen.tendenciaGastos : null} />
              </div>
              <div className="mt-1 text-sm text-gray-500">Gastos del mes</div>
            </div>
          </>
        )}
      </div>

      <div className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Mapa de avance nacional</h2>
        <MapaMilitantes compacto />
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
          {(vistaSecretaria?.actividadesRecientes ?? resumen?.actividadesRecientes ?? []).map((a) => (
            <li key={a.id} className="flex items-center justify-between py-2 text-sm">
              <span>{a.titulo}</span>
              <span className="text-gray-400">
                {new Date(a.fecha).toLocaleDateString("es-DO")} {a.ubicacion ? `· ${a.ubicacion}` : ""}
              </span>
            </li>
          ))}
          {resumen && (vistaSecretaria?.actividadesRecientes ?? resumen.actividadesRecientes).length === 0 && (
            <li className="py-2 text-sm text-gray-400">Sin actividades recientes.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
