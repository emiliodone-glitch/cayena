"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import {
  Users,
  Target,
  Landmark,
  Wallet,
  TrendingUp,
  TrendingDown,
  Plus,
  RefreshCw,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { CardSkeleton } from "@/components/Skeleton";
import { Drawer } from "@/components/Drawer";
import { ObraForm } from "@/components/forms/ObraForm";
import { ActividadForm } from "@/components/forms/ActividadForm";
import { MilitanteForm } from "@/components/forms/MilitanteForm";
import { Saludo } from "@/components/dashboard/Saludo";
import { PeriodoSelector, type RangoPeriodo } from "@/components/dashboard/PeriodoSelector";
import { SerieCaptacionChart } from "@/components/dashboard/SerieCaptacionChart";
import { EstadosDonut } from "@/components/dashboard/EstadosDonut";
import { GastosDonut } from "@/components/dashboard/GastosDonut";
import { TopBottomProvincias } from "@/components/dashboard/TopBottomProvincias";
import { TopPromotores } from "@/components/dashboard/TopPromotores";
import { ObrasRecientes } from "@/components/dashboard/ObrasRecientes";
import { COLOR_ESTADO, type EstadoAvance } from "@cayena/shared";

const MapaMilitantes = dynamic(
  () => import("@/components/MapaMilitantes").then((m) => m.MapaMilitantes),
  { ssr: false, loading: () => <div className="h-[300px] animate-pulse rounded-xl bg-gray-100" /> },
);

type Fila = { id: string; nombre: string; militantesCaptados: number; meta: number; porcentaje: number; estado: EstadoAvance };

type Resumen = {
  militantesTotales: number;
  metaNacional: number;
  porcentajeNacional: number;
  estadoNacional: EstadoAvance;
  obrasRegistradas: number;
  gastosPeriodo: number;
  tendenciaMilitantes: number | null;
  tendenciaGastos: number | null;
  proyeccionMeses: number | null;
  serieDiaria: { fecha: string; total: number }[];
  gastosPorCategoria: { categoria: string; total: number }[];
  provinciasPorEstado: { rojo: number; amarillo: number; verde: number };
  topProvincias: Fila[];
  bottomProvincias: Fila[];
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

function Tendencia({ valor, invertido = false }: { valor: number | null; invertido?: boolean }) {
  if (valor === null) return null;
  const positivo = invertido ? valor <= 0 : valor >= 0;
  return (
    <span className={`ml-2 inline-flex items-center gap-0.5 text-xs font-semibold ${positivo ? "text-institucional-600" : "text-red-600"}`}>
      {valor >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {valor >= 0 ? "+" : ""}{valor}%
    </span>
  );
}

function segundosATexto(segundos: number): string {
  if (segundos < 5) return "justo ahora";
  if (segundos < 60) return `hace ${segundos} s`;
  return `hace ${Math.floor(segundos / 60)} min`;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [rango, setRango] = useState<RangoPeriodo>({ periodo: "mes" });
  const [ultimaActualizacion, setUltimaActualizacion] = useState<Date | null>(null);
  const [segundosTranscurridos, setSegundosTranscurridos] = useState(0);

  const [drawerObra, setDrawerObra] = useState(false);
  const [drawerActividad, setDrawerActividad] = useState(false);
  const [drawerMilitante, setDrawerMilitante] = useState(false);

  const cargar = useCallback(() => {
    const params = new URLSearchParams({ periodo: rango.periodo });
    if (rango.periodo === "custom" && rango.desde && rango.hasta) {
      params.set("desde", rango.desde);
      params.set("hasta", rango.hasta);
    }
    apiFetch<Resumen>(`/dashboard/resumen?${params.toString()}`)
      .then((data) => {
        setResumen(data);
        setUltimaActualizacion(new Date());
      })
      .catch(() => setResumen(null));
  }, [rango]);

  useEffect(() => {
    cargar();
    apiFetch<Alerta[]>("/dashboard/alertas").then(setAlertas).catch(() => setAlertas([]));
  }, [cargar]);

  // Auto-refresh cada 60s + reloj de "hace X segundos".
  useEffect(() => {
    const refresco = setInterval(cargar, 60_000);
    const reloj = setInterval(() => {
      setSegundosTranscurridos((s) => s + 1);
    }, 1000);
    return () => {
      clearInterval(refresco);
      clearInterval(reloj);
    };
  }, [cargar]);

  useEffect(() => {
    setSegundosTranscurridos(0);
  }, [ultimaActualizacion]);

  const vistaSecretaria = resumen?.vistaSecretaria;
  const puedeCrear = user?.role !== "AUDITOR" && user?.role !== "DIRIGENCIA" && user?.role !== "MILITANTE";

  function onGuardadoRapido(mensaje: string) {
    toast(mensaje);
    setDrawerObra(false);
    setDrawerActividad(false);
    setDrawerMilitante(false);
    cargar();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Saludo nombre={user?.nombre} />
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <RefreshCw className="h-3 w-3" />
            {ultimaActualizacion ? `Actualizado ${segundosATexto(segundosTranscurridos)}` : "Cargando…"}
          </span>
          <PeriodoSelector value={rango} onChange={setRango} />
        </div>
      </div>

      {puedeCrear && (
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            onClick={() => setDrawerMilitante(true)}
            className="flex items-center gap-1.5 rounded-lg bg-institucional-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-institucional-700"
          >
            <Plus className="h-4 w-4" /> Militante
          </button>
          <button
            onClick={() => setDrawerActividad(true)}
            className="flex items-center gap-1.5 rounded-lg border border-institucional-600 px-3 py-1.5 text-sm font-semibold text-institucional-700 hover:bg-institucional-50"
          >
            <Plus className="h-4 w-4" /> Actividad
          </button>
          <button
            onClick={() => setDrawerObra(true)}
            className="flex items-center gap-1.5 rounded-lg border border-institucional-600 px-3 py-1.5 text-sm font-semibold text-institucional-700 hover:bg-institucional-50"
          >
            <Plus className="h-4 w-4" /> Obra
          </button>
        </div>
      )}

      {vistaSecretaria && (
        <div className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">Tu secretaría · {vistaSecretaria.nombre}</h2>
          <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="text-2xl font-bold text-institucional-900">{vistaSecretaria.militantesCaptados.toLocaleString("es-DO")}</div>
              <div className="mt-1 text-sm text-gray-500">Militantes captados por tu equipo</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="text-2xl font-bold text-institucional-900">{fmtMoney.format(vistaSecretaria.gastosDelMes)}</div>
              <div className="mt-1 text-sm text-gray-500">Gastos del mes</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="text-2xl font-bold text-institucional-900">{vistaSecretaria.poaResumen.length}</div>
              <div className="mt-1 text-sm text-gray-500">Metas POA activas</div>
            </div>
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
            <div
              className="rounded-xl border border-gray-200 border-l-4 bg-white p-5 shadow-sm"
              style={{ borderLeftColor: COLOR_ESTADO[resumen.estadoNacional] }}
            >
              <div className="mb-1 flex items-center justify-between">
                <Users className="h-4 w-4 text-gray-300" />
                <Tendencia valor={resumen.tendenciaMilitantes} />
              </div>
              <div className="text-2xl font-bold text-institucional-900">{resumen.militantesTotales.toLocaleString("es-DO")}</div>
              <div className="mt-1 text-sm text-gray-500">Militantes totales</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <Target className="mb-1 h-4 w-4 text-gray-300" />
              <div className="text-2xl font-bold text-institucional-900">{resumen.porcentajeNacional}%</div>
              <div className="mt-1 text-sm text-gray-500">Meta nacional</div>
              {resumen.proyeccionMeses !== null && (
                <div className="mt-1 text-[11px] text-gray-400">
                  {resumen.proyeccionMeses === 0
                    ? "¡Meta ya cumplida!"
                    : `~${resumen.proyeccionMeses} meses al ritmo actual`}
                </div>
              )}
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <Landmark className="mb-1 h-4 w-4 text-gray-300" />
              <div className="text-2xl font-bold text-institucional-900">{resumen.obrasRegistradas.toLocaleString("es-DO")}</div>
              <div className="mt-1 text-sm text-gray-500">Obras registradas</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="mb-1 flex items-center justify-between">
                <Wallet className="h-4 w-4 text-gray-300" />
                <Tendencia valor={resumen.tendenciaGastos} invertido />
              </div>
              <div className="text-2xl font-bold text-institucional-900">{fmtMoney.format(resumen.gastosPeriodo)}</div>
              <div className="mt-1 text-sm text-gray-500">Gastos del período</div>
            </div>
          </>
        )}
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <div>
            <h2 className="mb-3 text-sm font-semibold text-gray-700">Mapa de avance nacional</h2>
            <MapaMilitantes compacto />
          </div>

          {alertas.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
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
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="mb-2 text-sm font-semibold text-gray-700">Captación en el período</h3>
            {resumen ? <SerieCaptacionChart serie={resumen.serieDiaria} /> : <div className="h-64 animate-pulse rounded-lg bg-gray-100" />}
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="mb-2 text-sm font-semibold text-gray-700">Provincias por estado</h3>
              {resumen ? <EstadosDonut conteo={resumen.provinciasPorEstado} /> : <div className="h-56 animate-pulse rounded-lg bg-gray-100" />}
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="mb-2 text-sm font-semibold text-gray-700">Gastos por categoría</h3>
              {resumen ? <GastosDonut datos={resumen.gastosPorCategoria} /> : <div className="h-56 animate-pulse rounded-lg bg-gray-100" />}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            {resumen ? (
              <TopBottomProvincias top={resumen.topProvincias} bottom={resumen.bottomProvincias} />
            ) : (
              <div className="h-40 animate-pulse rounded-lg bg-gray-100" />
            )}
          </div>
        </div>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <TopPromotores />
        <ObrasRecientes />
      </div>

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

      <Drawer open={drawerMilitante} onClose={() => setDrawerMilitante(false)} title="Registrar militante">
        <MilitanteForm onSaved={() => onGuardadoRapido("Militante registrado")} onCancel={() => setDrawerMilitante(false)} />
      </Drawer>
      <Drawer open={drawerActividad} onClose={() => setDrawerActividad(false)} title="Nueva actividad">
        <ActividadForm onSaved={() => onGuardadoRapido("Actividad creada")} onCancel={() => setDrawerActividad(false)} />
      </Drawer>
      <Drawer open={drawerObra} onClose={() => setDrawerObra(false)} title="Nueva obra de gobierno">
        <ObraForm onSaved={() => onGuardadoRapido("Obra registrada")} onCancel={() => setDrawerObra(false)} />
      </Drawer>
    </div>
  );
}
