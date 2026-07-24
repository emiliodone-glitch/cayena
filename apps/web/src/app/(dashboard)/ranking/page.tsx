"use client";

import { useEffect, useState } from "react";
import { Trophy, Medal, Building2, TrendingUp, TrendingDown, Minus, Download, Info, Star, Sparkles } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { TableSkeleton } from "@/components/Skeleton";

type Fila = {
  id: string;
  nombre: string;
  role: string;
  secretaria: string | null;
  militantesCaptados: number;
  puntosGenerados: number;
  posicionActual: number;
  posicionAnterior: number | null;
};

type FilaSecretaria = {
  id: string;
  nombre: string;
  titular: string | null;
  titularActivo: boolean;
  avancePromedioObjetivos: number | null;
  informesSubidos: number;
  informesTope: number;
  diasSinActividad: number | null;
  puntaje: number;
  posicionActual: number;
  posicionAnterior: number | null;
};

type RegistroReconocimiento = {
  id: string;
  rango: number;
  nombre: string;
  valor: number;
  cicloId: string;
  periodo: string;
  otorgadoAt: string;
};
type Reconocimientos = Partial<
  Record<"PROMOTOR" | "SECRETARIA", Partial<Record<"semana" | "mes" | "trimestre", RegistroReconocimiento[]>>>
>;

type Periodo = "todo" | "semana" | "mes" | "trimestre" | "custom";

const OPCIONES: { valor: Periodo; label: string }[] = [
  { valor: "todo", label: "Todo el tiempo" },
  { valor: "semana", label: "Semana" },
  { valor: "mes", label: "Mes" },
  { valor: "trimestre", label: "Trimestre" },
  { valor: "custom", label: "Rango" },
];

const MEDALLA_COLOR = ["#facc15", "#94a3b8", "#c2703d"];

const ROL_LABEL: Record<string, string> = {
  SUPERADMIN: "Superadmin",
  JEFE_SECRETARIA: "Jefe de secretaría",
  PROMOTOR: "Promotor",
  AUDITOR: "Auditor",
  DIRIGENCIA: "Dirigencia",
  MILITANTE: "Militante",
};

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

function etiquetaCiclo(periodo: string, cicloId: string): string {
  if (periodo === "semana") {
    const [anio, semana] = cicloId.split("-W");
    return `Semana ${Number(semana)} de ${anio}`;
  }
  if (periodo === "mes") {
    const [anio, mes] = cicloId.split("-");
    return `${MESES[Number(mes) - 1] ?? mes} ${anio}`;
  }
  const [anio, trimestre] = cicloId.split("-Q");
  return `Trimestre ${trimestre} de ${anio}`;
}

const ETIQUETA_PERIODO_CORTA: Record<string, string> = { semana: "Semanal", mes: "Mensual", trimestre: "Trimestral" };

// Descarga cualquier tabla (encabezados + filas de texto) como CSV — mismo
// patrón que ya usa Militantes (BOM para que Excel abra bien los acentos).
function descargarCSV(nombreArchivo: string, encabezados: string[], filas: string[][]) {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const csv = "﻿" + [encabezados, ...filas].map((f) => f.map(esc).join(";")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(a.href);
}

// Barra horizontal simple, proporcional al mayor valor de la columna en la
// tabla actual — para poder comparar de un vistazo sin tener que leer cada
// número (RF nuevo).
function BarraComparativa({ valor, max, color }: { valor: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((valor / max) * 100)) : 0;
  return (
    <div className="mt-1 h-1.5 w-20 overflow-hidden rounded-full bg-gray-100">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

// Flecha de tendencia vs. el período anterior de igual duración (RF nuevo)
// — no tiene sentido para "todo el tiempo" ni para la primera vez que
// alguien aparece en el ranking (sin período anterior con qué comparar).
function Tendencia({ actual, anterior }: { actual: number; anterior: number | null }) {
  if (anterior == null) return <span className="text-xs text-gray-300">—</span>;
  const diferencia = anterior - actual; // posición menor = mejor lugar
  if (diferencia > 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-600">
        <TrendingUp className="h-3.5 w-3.5" />
        {diferencia}
      </span>
    );
  if (diferencia < 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-red-500">
        <TrendingDown className="h-3.5 w-3.5" />
        {Math.abs(diferencia)}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-gray-400">
      <Minus className="h-3.5 w-3.5" />
    </span>
  );
}

export default function RankingPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"promotores" | "secretarias">("promotores");

  const [ranking, setRanking] = useState<Fila[] | null>(null);
  const [periodo, setPeriodo] = useState<Periodo>("todo");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const [rankingSecretarias, setRankingSecretarias] = useState<FilaSecretaria[] | null>(null);
  const [periodoSec, setPeriodoSec] = useState<Periodo>("todo");
  const [desdeSec, setDesdeSec] = useState("");
  const [hastaSec, setHastaSec] = useState("");

  const [reconocimientos, setReconocimientos] = useState<Reconocimientos | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ periodo });
    if (periodo === "custom" && desde && hasta) {
      params.set("desde", desde);
      params.set("hasta", hasta);
    }
    apiFetch<Fila[]>(`/usuarios/ranking-captacion?${params.toString()}`)
      .then(setRanking)
      .catch(() => setRanking([]));
  }, [periodo, desde, hasta]);

  useEffect(() => {
    const params = new URLSearchParams({ periodo: periodoSec });
    if (periodoSec === "custom" && desdeSec && hastaSec) {
      params.set("desde", desdeSec);
      params.set("hasta", hastaSec);
    }
    apiFetch<FilaSecretaria[]>(`/secretarias/ranking?${params.toString()}`)
      .then(setRankingSecretarias)
      .catch(() => setRankingSecretarias([]));
  }, [periodoSec, desdeSec, hastaSec]);

  useEffect(() => {
    apiFetch<Reconocimientos>("/usuarios/reconocimientos")
      .then(setReconocimientos)
      .catch(() => setReconocimientos({}));
  }, []);

  function exportarCSVPromotores() {
    if (!ranking || ranking.length === 0) return;
    descargarCSV(
      `ranking-promotores-${periodo}.csv`,
      ["#", "Nombre", "Rol", "Secretaría", "Militantes captados", "Puntos generados"],
      ranking.map((f) => [
        String(f.posicionActual),
        f.nombre,
        ROL_LABEL[f.role] ?? f.role,
        f.secretaria ?? "—",
        String(f.militantesCaptados),
        String(f.puntosGenerados),
      ]),
    );
  }

  function exportarCSVSecretarias() {
    if (!rankingSecretarias || rankingSecretarias.length === 0) return;
    descargarCSV(
      `ranking-secretarias-${periodoSec}.csv`,
      ["#", "Secretaría", "Titular", "Objetivos %", "Informes subidos", "Días sin actividad", "Puntaje"],
      rankingSecretarias.map((f) => [
        String(f.posicionActual),
        f.nombre,
        f.titular ?? "Vacante",
        f.avancePromedioObjetivos != null ? String(f.avancePromedioObjetivos) : "—",
        String(f.informesSubidos),
        f.diasSinActividad != null ? String(f.diasSinActividad) : "sin datos",
        String(f.puntaje),
      ]),
    );
  }

  const maxMilitantes = ranking ? Math.max(1, ...ranking.map((f) => f.militantesCaptados)) : 1;
  const maxPuntaje = rankingSecretarias ? Math.max(1, ...rankingSecretarias.map((f) => f.puntaje)) : 1;

  const seccionesReconocimientos = (["PROMOTOR", "SECRETARIA"] as const).flatMap((tipo) =>
    (["semana", "mes", "trimestre"] as const).map((periodoCiclo) => {
      const filas = reconocimientos?.[tipo]?.[periodoCiclo];
      if (!filas || filas.length === 0) return null;
      return { tipo, periodoCiclo, filas };
    }),
  ).filter((x): x is { tipo: "PROMOTOR" | "SECRETARIA"; periodoCiclo: "semana" | "mes" | "trimestre"; filas: RegistroReconocimiento[] } => x !== null);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-6 w-6 text-institucional-600" />
          <h1 className="text-xl font-bold text-institucional-900">Ranking</h1>
        </div>
        <div className="flex rounded-lg border border-gray-200 bg-white p-1 text-sm">
          <button
            onClick={() => setTab("promotores")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 ${tab === "promotores" ? "bg-institucional-600 text-white" : "text-gray-500"}`}
          >
            <Trophy className="h-3.5 w-3.5" /> Promotores
          </button>
          <button
            onClick={() => setTab("secretarias")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 ${tab === "secretarias" ? "bg-institucional-600 text-white" : "text-gray-500"}`}
          >
            <Building2 className="h-3.5 w-3.5" /> Secretarías
          </button>
        </div>
      </div>

      {/* Salón de la fama (RF nuevo): últimos ganadores de cada ciclo ya
          cerrado — "premiar el trabajo de los más rankeados" con algo que
          sobreviva más allá de la foto del momento actual. Si todavía no se
          ha cerrado ningún ciclo (app recién desplegada), no se muestra
          nada acá en vez de una sección vacía. */}
      {seccionesReconocimientos.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <div className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-amber-900">
            <Sparkles className="h-4 w-4" /> Reconocimientos recientes
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {seccionesReconocimientos.map(({ tipo, periodoCiclo, filas }) => (
              <div key={`${tipo}-${periodoCiclo}`} className="rounded-lg border border-amber-100 bg-white p-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase text-amber-700">
                    {tipo === "PROMOTOR" ? "Promotores" : "Secretarías"} · {ETIQUETA_PERIODO_CORTA[periodoCiclo]}
                  </span>
                </div>
                <div className="mb-2 text-[11px] text-gray-400">{etiquetaCiclo(periodoCiclo, filas[0].cicloId)}</div>
                <div className="space-y-1">
                  {filas.map((f) => (
                    <div key={f.id} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5">
                        <Medal className="h-3.5 w-3.5" style={{ color: MEDALLA_COLOR[f.rango - 1] }} />
                        {f.nombre}
                      </span>
                      <span className="font-semibold text-institucional-700">
                        {tipo === "PROMOTOR" ? `${f.valor} militantes` : `${f.valor} pts`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "promotores" && (
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <button
              onClick={exportarCSVPromotores}
              disabled={!ranking || ranking.length === 0}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" /> Exportar CSV
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border border-gray-200 bg-white p-1 text-sm">
                {OPCIONES.map((o) => (
                  <button
                    key={o.valor}
                    onClick={() => setPeriodo(o.valor)}
                    className={`rounded-md px-3 py-1 ${periodo === o.valor ? "bg-institucional-600 text-white" : "text-gray-500"}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              {periodo === "custom" && (
                <div className="flex items-center gap-1.5">
                  <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
                  <span className="text-gray-400">–</span>
                  <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
                </div>
              )}
            </div>
          </div>
          <p className="mb-6 text-sm text-gray-500">
            Promotores y jefes de secretaría con más militantes registrados desde el back office.
          </p>

          {ranking === null ? (
            <TableSkeleton cols={7} />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-400">
                  <tr>
                    <th className="px-4 py-2">#</th>
                    <th className="px-4 py-2">Nombre</th>
                    <th className="px-4 py-2">Rol</th>
                    <th className="px-4 py-2">Secretaría</th>
                    <th className="px-4 py-2">Militantes captados</th>
                    <th className="px-4 py-2">
                      <span className="inline-flex items-center gap-1">
                        Puntos generados
                        <span title="Suma de los puntos de gamificación que acumularon los militantes que trajo — mide si de verdad se quedan activos, no solo si se registraron.">
                          <Info className="h-3 w-3 text-gray-300" />
                        </span>
                      </span>
                    </th>
                    <th className="px-4 py-2">Tendencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {ranking.map((f) => {
                    const esUsuarioActual = f.id === user?.id;
                    return (
                      <tr key={f.id} className={esUsuarioActual ? "bg-institucional-50/70" : undefined}>
                        <td className="px-4 py-2">
                          {f.posicionActual <= 3 ? (
                            <Medal className="h-4 w-4" style={{ color: MEDALLA_COLOR[f.posicionActual - 1] }} />
                          ) : (
                            <span className="text-gray-400">{f.posicionActual}</span>
                          )}
                        </td>
                        <td className="px-4 py-2 font-medium">
                          {f.nombre}
                          {esUsuarioActual && <span className="ml-1.5 text-xs font-normal text-institucional-500">(tú)</span>}
                        </td>
                        <td className="px-4 py-2 text-gray-500">{ROL_LABEL[f.role] ?? f.role}</td>
                        <td className="px-4 py-2 text-gray-500">{f.secretaria ?? "—"}</td>
                        <td className="px-4 py-2">
                          <span className="font-semibold text-institucional-700">{f.militantesCaptados.toLocaleString("es-DO")}</span>
                          <BarraComparativa valor={f.militantesCaptados} max={maxMilitantes} color="#1f7a34" />
                        </td>
                        <td className="px-4 py-2 text-gray-500">
                          <span className="inline-flex items-center gap-1">
                            <Star className="h-3.5 w-3.5 text-amber-400" />
                            {f.puntosGenerados.toLocaleString("es-DO")}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <Tendencia actual={f.posicionActual} anterior={f.posicionAnterior} />
                        </td>
                      </tr>
                    );
                  })}
                  {ranking.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                        Todavía no hay militantes registrados en este período.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "secretarias" && (
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <button
              onClick={exportarCSVSecretarias}
              disabled={!rankingSecretarias || rankingSecretarias.length === 0}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" /> Exportar CSV
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border border-gray-200 bg-white p-1 text-sm">
                {OPCIONES.map((o) => (
                  <button
                    key={o.valor}
                    onClick={() => setPeriodoSec(o.valor)}
                    className={`rounded-md px-3 py-1 ${periodoSec === o.valor ? "bg-institucional-600 text-white" : "text-gray-500"}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              {periodoSec === "custom" && (
                <div className="flex items-center gap-1.5">
                  <input type="date" value={desdeSec} onChange={(e) => setDesdeSec(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
                  <span className="text-gray-400">–</span>
                  <input type="date" value={hastaSec} onChange={(e) => setHastaSec(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
                </div>
              )}
            </div>
          </div>
          <p className="mb-1 text-sm text-gray-500">
            Combina avance de objetivos, informes de gestión y actividad reciente en un solo puntaje (0-100).
          </p>
          <p className="mb-6 text-xs text-gray-400">
            El período elegido solo acota los <strong>informes subidos</strong> — el avance de objetivos y la actividad
            reciente reflejan siempre el estado vigente, no se puede reconstruir una foto fiel de esos dos para una fecha
            pasada.
          </p>

          {rankingSecretarias === null ? (
            <TableSkeleton cols={7} />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-400">
                  <tr>
                    <th className="px-4 py-2">#</th>
                    <th className="px-4 py-2">Secretaría</th>
                    <th className="px-4 py-2">Titular</th>
                    <th className="px-4 py-2">Objetivos</th>
                    <th className="px-4 py-2">Informes subidos</th>
                    <th className="px-4 py-2">Última actividad</th>
                    <th className="px-4 py-2">
                      <span className="inline-flex items-center gap-1">
                        Puntaje
                        <span title="50% avance de objetivos + 25% informes subidos (tope 5) + 25% actividad reciente (gradiente hasta 30 días sin actividad).">
                          <Info className="h-3 w-3 text-gray-300" />
                        </span>
                      </span>
                    </th>
                    <th className="px-4 py-2">Tendencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rankingSecretarias.map((f) => {
                    const esSecretariaPropia = user?.secretariaId === f.id;
                    return (
                      <tr key={f.id} className={esSecretariaPropia ? "bg-institucional-50/70" : undefined}>
                        <td className="px-4 py-2">
                          {f.posicionActual <= 3 ? (
                            <Medal className="h-4 w-4" style={{ color: MEDALLA_COLOR[f.posicionActual - 1] }} />
                          ) : (
                            <span className="text-gray-400">{f.posicionActual}</span>
                          )}
                        </td>
                        <td className="px-4 py-2 font-medium">
                          {f.nombre}
                          {esSecretariaPropia && <span className="ml-1.5 text-xs font-normal text-institucional-500">(la tuya)</span>}
                        </td>
                        <td className="px-4 py-2 text-gray-500">
                          {f.titular ? (
                            <>
                              {f.titular}
                              {!f.titularActivo && <span className="ml-1 text-xs text-amber-600">(pendiente de activar)</span>}
                            </>
                          ) : (
                            "Vacante"
                          )}
                        </td>
                        <td className="px-4 py-2 text-gray-500">
                          {f.avancePromedioObjetivos != null ? `${f.avancePromedioObjetivos}%` : "—"}
                        </td>
                        <td className="px-4 py-2 text-gray-500">
                          {f.informesSubidos} / {f.informesTope}
                        </td>
                        <td className="px-4 py-2 text-gray-500">
                          {f.diasSinActividad != null ? `hace ${f.diasSinActividad} d` : "sin datos"}
                        </td>
                        <td className="px-4 py-2">
                          <span className="font-semibold text-institucional-700">{f.puntaje}</span>
                          <BarraComparativa valor={f.puntaje} max={maxPuntaje} color="#1d4ed8" />
                        </td>
                        <td className="px-4 py-2">
                          <Tendencia actual={f.posicionActual} anterior={f.posicionAnterior} />
                        </td>
                      </tr>
                    );
                  })}
                  {rankingSecretarias.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                        Sin secretarías registradas.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
