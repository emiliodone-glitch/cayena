"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Vote, ScanLine, Download, CalendarPlus, Plus, Search, Maximize2 } from "lucide-react";
import { apiFetch, API_URL, getAccessToken, refreshAccessToken, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { Drawer } from "@/components/Drawer";
import type { DemarcacionElectoral } from "@/components/MapaDiaElectoral";
import { ComparacionJornadas } from "@/components/ComparacionJornadas";

const MapaDiaElectoral = dynamic(() => import("@/components/MapaDiaElectoral").then((m) => m.MapaDiaElectoral), {
  ssr: false,
  loading: () => <div className="aspect-[1000/850] w-full animate-pulse rounded-xl bg-gray-100" />,
});

type Evento = { id: string; nombre: string; fecha: string; activo: boolean };

type Resumen = {
  evento: Evento;
  militantesRegistrados: number;
  votosConfirmados: number;
  porcentajePropia: number;
  electoresNacional: number;
  porcentajePadron: number | null;
  proyeccionFinal: number | null;
};

type Mesa = {
  id: string;
  numero: string;
  militantesRegistrados: number;
  votosConfirmados: number;
  porcentajePropia: number;
  responsableId: string | null;
  responsableNombre: string | null;
  incidenciasAbiertas: number;
};
type Recinto = { id: string; nombre: string; direccion: string | null; mesas: Mesa[] };
type Dirigente = { id: string; nombre: string; role: string };
type Incidencia = {
  id: string;
  tipo: string;
  descripcion: string;
  resuelta: boolean;
  createdAt: string;
  reportadoPor: string;
  mesaNumero: string;
  recintoNombre: string;
};

const TIPOS_INCIDENCIA: { value: string; label: string }[] = [
  { value: "PADRON_INCOMPLETO", label: "Padrón incompleto" },
  { value: "MESA_CERRADA_TEMPRANO", label: "Mesa cerrada temprano" },
  { value: "PROBLEMA_TECNICO", label: "Problema técnico" },
  { value: "OTRA", label: "Otra" },
];

const fmtNum = new Intl.NumberFormat("es-DO");

export default function DiaElectoralPage() {
  const { user } = useAuth();
  const toast = useToast();
  const esSuperadmin = user?.role === "SUPERADMIN";
  const puedeAsignarResponsable = user?.role === "SUPERADMIN" || user?.role === "JEFE_SECRETARIA" || user?.role === "PROMOTOR";
  // Cada jornada creada queda guardada — este selector permite seguir
  // monitoreando cualquier proceso anterior sin perderle acceso al crear uno
  // nuevo (crear una jornada solo cambia cuál es la "activa" para marcar
  // votos/autoreporte, no borra ni oculta las demás).
  const [eventos, setEventos] = useState<Evento[] | null>(null);
  const [eventoId, setEventoId] = useState<string | null>(null);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [demarcacion, setDemarcacion] = useState<DemarcacionElectoral | null>(null);
  const [recintos, setRecintos] = useState<Recinto[] | null>(null);
  const [directorio, setDirectorio] = useState<Dirigente[]>([]);
  const [incidencias, setIncidencias] = useState<Incidencia[] | null>(null);
  const [reportando, setReportando] = useState<string | null>(null);
  const [tipoNuevo, setTipoNuevo] = useState(TIPOS_INCIDENCIA[0].value);
  const [descripcionNuevo, setDescripcionNuevo] = useState("");
  const [enviandoIncidencia, setEnviandoIncidencia] = useState(false);
  const [refreshTicker, setRefreshTicker] = useState(0);
  const [drawerAbierto, setDrawerAbierto] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState("Elecciones Generales");
  const [fechaNueva, setFechaNueva] = useState("");
  const [creando, setCreando] = useState(false);

  function cargarEventos(seleccionar?: string) {
    apiFetch<Evento[]>("/dia-electoral/eventos").then((lista) => {
      setEventos(lista);
      if (seleccionar) {
        setEventoId(seleccionar);
      } else if (!eventoId && lista.length > 0) {
        setEventoId(lista.find((e) => e.activo)?.id ?? lista[0].id);
      }
    });
  }

  useEffect(cargarEventos, []);
  useEffect(() => {
    apiFetch<Dirigente[]>("/usuarios/directorio").then(setDirectorio);
  }, []);

  const evento = eventos?.find((e) => e.id === eventoId) ?? null;

  async function asignarResponsable(colegioId: string, responsableId: string) {
    const { responsableNombre } = await apiFetch<{ responsableId: string | null; responsableNombre: string | null }>(
      `/dia-electoral/mesas/${colegioId}/responsable`,
      { method: "PATCH", body: JSON.stringify({ responsableId: responsableId || null }) },
    );
    setRecintos((prev) =>
      prev
        ? prev.map((r) => ({
            ...r,
            mesas: r.mesas.map((m) => (m.id === colegioId ? { ...m, responsableId: responsableId || null, responsableNombre } : m)),
          }))
        : prev,
    );
  }

  useEffect(() => {
    if (!eventoId) return;
    apiFetch<Resumen>(`/dia-electoral/resumen/${eventoId}`).then(setResumen);
  }, [eventoId, refreshTicker]);

  // Guarda "tipo:id" (p. ej. "municipio:xyz" o "provincia:abc") — con clave
  // compuesta en vez de solo el id, un municipio y una provincia con el mismo
  // id (no debería pasar, pero por las dudas) no se confunden entre sí.
  const demarcacionMesasRef = useRef<string | null>(null);
  // Descarta respuestas de peticiones ya abandonadas (por cambio de
  // municipio/provincia o por una petición más nueva), sin importar si la
  // disparó el debounce del hover o el refresco en vivo de abajo. Además de
  // ignorar la respuesta, se CANCELA de verdad la petición anterior
  // (AbortController) en vez de dejarla completarse en segundo plano — al
  // pasar el cursor por varias demarcaciones seguidas antes de que cada una
  // termine de responder, esto evita ir acumulando peticiones abandonadas
  // todavía en vuelo.
  const peticionMesasRef = useRef(0);
  const abortMesasRef = useRef<AbortController | null>(null);

  function cargarMesasEIncidencias(filtro: { tipo: "municipio" | "provincia"; id: string }, eventoIdActual: string) {
    abortMesasRef.current?.abort();
    const controller = new AbortController();
    abortMesasRef.current = controller;
    const idPeticion = ++peticionMesasRef.current;
    const parametro = filtro.tipo === "municipio" ? "municipioId" : "provinciaId";
    apiFetch<Recinto[]>(`/dia-electoral/mesas?${parametro}=${filtro.id}&eventoId=${eventoIdActual}`, {
      signal: controller.signal,
    })
      .then((data) => {
        if (peticionMesasRef.current === idPeticion) setRecintos(data);
      })
      .catch(() => {
        if (peticionMesasRef.current === idPeticion) setRecintos([]);
      });
    apiFetch<Incidencia[]>(`/dia-electoral/incidencias?${parametro}=${filtro.id}&eventoId=${eventoIdActual}`, {
      signal: controller.signal,
    })
      .then((data) => {
        if (peticionMesasRef.current === idPeticion) setIncidencias(data);
      })
      .catch(() => {
        if (peticionMesasRef.current === idPeticion) setIncidencias([]);
      });
  }

  // El mapa dispara onDemarcacionChange en cada hover real (no solo al hacer
  // clic) — igual que el padrón de Militantes, se pide de inmediato, sin
  // esperar ningún tiempo artificial: las peticiones en sí son rápidas
  // (~200ms), así que el retraso que sí se sentía era un debounce de 300ms
  // que había acá antes, no la red. Pasar el cursor por varias demarcaciones
  // seguidas ya no acumula peticiones porque cada una cancela la anterior
  // (ver AbortController en cargarMesasEIncidencias) — el mismo patrón que
  // ya usa Militantes, solo que ahí no hacía falta el abort porque su propio
  // fetch es más liviano. También reacciona al refresco en vivo (SSE
  // "cambio-votos", nacional) para traer los conteos actualizados sin que el
  // usuario tenga que mover el cursor de nuevo.
  //
  // Se dispara tanto para "municipio" como para "provincia" (RF nuevo): el
  // mapa ya avisa tipo:"provincia" al pasar el mouse o hacer clic a nivel
  // nacional, y también al volver de distritos a municipios por el
  // breadcrumb — antes esta pantalla solo reaccionaba a "municipio", así que
  // esos casos se quedaban sin cargar nada.
  useEffect(() => {
    if ((demarcacion?.tipo !== "municipio" && demarcacion?.tipo !== "provincia") || !eventoId) {
      demarcacionMesasRef.current = null;
      setRecintos(null);
      setIncidencias(null);
      return;
    }
    const clave = `${demarcacion.tipo}:${demarcacion.id}`;
    if (demarcacionMesasRef.current !== clave) {
      demarcacionMesasRef.current = clave;
      setRecintos(null);
      setIncidencias(null);
    }
    cargarMesasEIncidencias({ tipo: demarcacion.tipo, id: demarcacion.id }, eventoId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demarcacion, eventoId, refreshTicker]);

  async function reportarIncidencia(colegioId: string) {
    if (!eventoId || !descripcionNuevo.trim()) return;
    setEnviandoIncidencia(true);
    try {
      await apiFetch("/dia-electoral/incidencias", {
        method: "POST",
        body: JSON.stringify({ eventoId, colegioId, tipo: tipoNuevo, descripcion: descripcionNuevo.trim() }),
      });
      setRecintos((prev) =>
        prev
          ? prev.map((r) => ({
              ...r,
              mesas: r.mesas.map((m) => (m.id === colegioId ? { ...m, incidenciasAbiertas: m.incidenciasAbiertas + 1 } : m)),
            }))
          : prev,
      );
      setReportando(null);
      setDescripcionNuevo("");
      setRefreshTicker((t) => t + 1);
    } finally {
      setEnviandoIncidencia(false);
    }
  }

  async function resolverIncidencia(id: string) {
    await apiFetch(`/dia-electoral/incidencias/${id}`, { method: "PATCH", body: JSON.stringify({ resuelta: true }) });
    setIncidencias((prev) => (prev ? prev.map((i) => (i.id === id ? { ...i, resuelta: true } : i)) : prev));
  }

  // Ticker nacional en vivo: mismo canal SSE que el mapa, evento "cambio-votos".
  // Reconecta con backoff y refresca el token en cada intento (RF nuevo):
  // antes esta conexión se abría una sola vez con el token del momento y sin
  // ningún manejo de error — si el access token vencía mientras la pantalla
  // seguía abierta (normal en una jornada de todo el día), el navegador
  // reintentaba solo, con su propio retry corto y sin backoff, contra el
  // mismo token ya vencido: eso era el bucle de 401 repetidos en consola.
  useEffect(() => {
    let cerrado = false;
    let fuente: EventSource | null = null;
    let reintentoTimer: ReturnType<typeof setTimeout> | null = null;
    let intentos = 0;

    async function conectar() {
      if (cerrado) return;
      const token = (await refreshAccessToken()) ?? getAccessToken();
      if (!token || cerrado) return;
      fuente = new EventSource(`${API_URL}/eventos/stream?token=${encodeURIComponent(token)}`);
      fuente.addEventListener("cambio-votos", () => setRefreshTicker((t) => t + 1));
      fuente.onopen = () => {
        intentos = 0;
      };
      fuente.onerror = () => {
        fuente?.close();
        if (cerrado) return;
        const espera = Math.min(2000 * 2 ** intentos, 30000);
        intentos++;
        reintentoTimer = setTimeout(conectar, espera);
      };
    }
    conectar();
    return () => {
      cerrado = true;
      if (reintentoTimer) clearTimeout(reintentoTimer);
      fuente?.close();
    };
  }, []);

  async function crearEvento(e: FormEvent) {
    e.preventDefault();
    if (!fechaNueva) return;
    setCreando(true);
    try {
      const nuevo = await apiFetch<Evento>("/dia-electoral/eventos", {
        method: "POST",
        body: JSON.stringify({ nombre: nombreNuevo, fecha: fechaNueva }),
      });
      cargarEventos(nuevo.id);
      setDrawerAbierto(false);
      setNombreNuevo("Elecciones Generales");
      setFechaNueva("");
      toast("Jornada electoral creada y activada");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "No se pudo crear la jornada", "error");
    } finally {
      setCreando(false);
    }
  }

  function exportarReporte() {
    if (!resumen) return;
    import("jspdf").then(({ jsPDF }) => {
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const M = 40;
      let y = M;
      doc.setFontSize(16);
      doc.setTextColor(30, 27, 75);
      doc.text(`Día Electoral — ${resumen.evento.nombre}`, M, y);
      y += 20;
      doc.setFontSize(10);
      doc.setTextColor(107, 114, 128);
      doc.text(`Generado el ${new Date().toLocaleString("es-DO")}`, M, y);
      y += 30;
      doc.setFontSize(12);
      doc.setTextColor(31, 41, 55);
      doc.text(`Militantes registrados: ${fmtNum.format(resumen.militantesRegistrados)}`, M, y);
      y += 18;
      doc.text(`Votos confirmados: ${fmtNum.format(resumen.votosConfirmados)} (${resumen.porcentajePropia}% de la propia base)`, M, y);
      y += 18;
      if (resumen.porcentajePadron != null) {
        doc.text(`Equivalente a ${resumen.porcentajePadron}% del padrón electoral (${fmtNum.format(resumen.electoresNacional)} electores)`, M, y);
        y += 18;
      }
      doc.save(`dia-electoral-${resumen.evento.nombre.toLowerCase().replace(/\s+/g, "-")}.pdf`);
    });
  }

  const formularioNuevaJornada = (
    <form onSubmit={crearEvento} className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">Nombre</span>
        <input required value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">Fecha</span>
        <input required type="date" value={fechaNueva} onChange={(e) => setFechaNueva(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
      </label>
      <p className="text-xs text-gray-400">
        Esta pasará a ser la jornada activa (la que usan el autoreporte y el marcado por mesa). Las jornadas anteriores
        se conservan y se pueden seguir consultando desde el selector de arriba.
      </p>
      <button disabled={creando} className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
        <CalendarPlus className="h-4 w-4" /> {creando ? "Creando…" : "Crear jornada electoral"}
      </button>
    </form>
  );

  if (eventos === null) return null;

  if (eventos.length === 0) {
    return (
      <div className="mx-auto max-w-md">
        <div className="mb-6 flex items-center gap-2">
          <Vote className="h-6 w-6 text-indigo-600" />
          <h1 className="text-xl font-bold text-institucional-900">Día Electoral</h1>
        </div>
        {esSuperadmin ? (
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="mb-3 text-sm text-gray-500">No hay ninguna jornada electoral todavía. Crea una para empezar a trackear la participación.</p>
            {formularioNuevaJornada}
          </div>
        ) : (
          <p className="text-sm text-gray-400">No hay ninguna jornada electoral registrada todavía.</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Vote className="h-6 w-6 text-indigo-600 shrink-0" />
          <div>
            <select
              value={eventoId ?? ""}
              onChange={(e) => setEventoId(e.target.value)}
              className="rounded-lg border border-gray-200 bg-transparent px-1 py-1 text-xl font-bold text-institucional-900 focus:border-institucional-600 focus:outline-none"
            >
              {eventos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre} {e.activo ? "· activa" : ""}
                </option>
              ))}
            </select>
            {evento && (
              <p className="text-xs text-gray-400">{new Date(evento.fecha).toLocaleDateString("es-DO", { day: "numeric", month: "long", year: "numeric" })}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {esSuperadmin && (
            <button onClick={() => setDrawerAbierto(true)} className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">
              <Plus className="h-4 w-4" /> Nueva jornada
            </button>
          )}
          <Link href="/dia-electoral/buscar" className="flex items-center gap-1.5 rounded-lg border border-indigo-200 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">
            <Search className="h-4 w-4" /> Buscar militante
          </Link>
          <Link href="/dia-electoral/marcar" className="flex items-center gap-1.5 rounded-lg border border-indigo-200 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">
            <ScanLine className="h-4 w-4" /> Registrar votos
          </Link>
          <button onClick={exportarReporte} className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
            <Download className="h-4 w-4" /> Exportar reporte
          </button>
          <Link href="/sala-situacion" className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">
            <Maximize2 className="h-4 w-4" /> Pantalla completa
          </Link>
        </div>
      </div>

      {resumen && (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <Kpi label="Militantes registrados" value={fmtNum.format(resumen.militantesRegistrados)} />
          <Kpi label="Votos confirmados" value={fmtNum.format(resumen.votosConfirmados)} destacado />
          <Kpi label="% de la propia base" value={`${resumen.porcentajePropia}%`} />
          <Kpi label="% del padrón electoral" value={resumen.porcentajePadron != null ? `${resumen.porcentajePadron}%` : "—"} />
          {resumen.proyeccionFinal != null && (
            <Kpi label="Proyección al cierre" value={`${resumen.proyeccionFinal}%`} />
          )}
        </div>
      )}

      {eventoId && eventos && <ComparacionJornadas eventos={eventos} eventoIdActual={eventoId} />}

      {eventoId && <MapaDiaElectoral eventoId={eventoId} onDemarcacionChange={setDemarcacion} />}

      {(demarcacion?.tipo === "municipio" || demarcacion?.tipo === "provincia") && recintos === null && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-institucional-900">Mesas de {demarcacion.nombre}</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />
            ))}
          </div>
        </div>
      )}

      {(demarcacion?.tipo === "municipio" || demarcacion?.tipo === "provincia") && recintos && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-institucional-900">Mesas de {demarcacion.nombre}</h2>
          {recintos.length === 0 ? (
            <p className="text-sm text-gray-400">
              Sin recintos electorales registrados en {demarcacion.tipo === "provincia" ? "esta provincia" : "este municipio"}.
            </p>
          ) : (
            <div className="space-y-3">
              {recintos.map((r) => (
                <div key={r.id}>
                  <div className="text-xs font-semibold uppercase text-gray-400">{r.nombre}</div>
                  <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {r.mesas.map((m) => (
                      <div key={m.id} className="rounded-lg border border-gray-100 px-3 py-2 text-xs">
                        <div className="flex items-center justify-between">
                          <div className="font-semibold text-institucional-900">Mesa {m.numero}</div>
                          {m.incidenciasAbiertas > 0 && (
                            <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                              {m.incidenciasAbiertas} inc.
                            </span>
                          )}
                        </div>
                        <div className="text-gray-500">{m.votosConfirmados} de {m.militantesRegistrados} — {m.porcentajePropia}%</div>
                        {puedeAsignarResponsable ? (
                          <select
                            value={m.responsableId ?? ""}
                            onChange={(e) => asignarResponsable(m.id, e.target.value)}
                            className="mt-1 w-full rounded border border-gray-200 bg-white px-1 py-0.5 text-[11px] text-gray-600"
                          >
                            <option value="">Sin fiscal asignado</option>
                            {directorio.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.nombre}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="mt-1 text-[11px] text-gray-400">
                            {m.responsableNombre ? `Fiscal: ${m.responsableNombre}` : "Sin fiscal asignado"}
                          </div>
                        )}

                        {reportando === m.id ? (
                          <div className="mt-1.5 space-y-1 border-t border-gray-100 pt-1.5">
                            <select
                              value={tipoNuevo}
                              onChange={(e) => setTipoNuevo(e.target.value)}
                              className="w-full rounded border border-gray-200 px-1 py-0.5 text-[11px]"
                            >
                              {TIPOS_INCIDENCIA.map((t) => (
                                <option key={t.value} value={t.value}>
                                  {t.label}
                                </option>
                              ))}
                            </select>
                            <textarea
                              value={descripcionNuevo}
                              onChange={(e) => setDescripcionNuevo(e.target.value)}
                              placeholder="Describe lo que pasó…"
                              rows={2}
                              className="w-full rounded border border-gray-200 px-1 py-0.5 text-[11px]"
                            />
                            <div className="flex gap-1">
                              <button
                                onClick={() => reportarIncidencia(m.id)}
                                disabled={enviandoIncidencia || !descripcionNuevo.trim()}
                                className="rounded bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white disabled:opacity-60"
                              >
                                Reportar
                              </button>
                              <button onClick={() => setReportando(null)} className="text-[11px] text-gray-400 hover:text-gray-600">
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setReportando(m.id);
                              setDescripcionNuevo("");
                              setTipoNuevo(TIPOS_INCIDENCIA[0].value);
                            }}
                            className="mt-1 text-[11px] text-red-600 hover:underline"
                          >
                            + Reportar incidencia
                          </button>
                        )}
                      </div>
                    ))}
                    {r.mesas.length === 0 && <span className="text-xs text-gray-400">Sin mesas registradas</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {incidencias && incidencias.length > 0 && (
            <div className="mt-4 border-t border-gray-100 pt-3">
              <h3 className="mb-2 text-xs font-semibold uppercase text-gray-400">Incidencias reportadas</h3>
              <div className="space-y-1.5">
                {incidencias.map((i) => (
                  <div key={i.id} className={`flex items-start justify-between gap-2 rounded-lg border px-3 py-2 text-xs ${i.resuelta ? "border-gray-100 bg-gray-50 text-gray-400" : "border-red-100 bg-red-50 text-red-700"}`}>
                    <div>
                      <div className="font-semibold">
                        Mesa {i.mesaNumero} ({i.recintoNombre}) — {TIPOS_INCIDENCIA.find((t) => t.value === i.tipo)?.label ?? i.tipo}
                      </div>
                      <div>{i.descripcion}</div>
                      <div className="mt-0.5 text-[10px] opacity-70">Reportado por {i.reportadoPor}</div>
                    </div>
                    {!i.resuelta && (
                      <button onClick={() => resolverIncidencia(i.id)} className="shrink-0 whitespace-nowrap rounded border border-red-200 px-2 py-0.5 text-[11px] font-semibold hover:bg-red-100">
                        Marcar resuelta
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Drawer open={drawerAbierto} onClose={() => setDrawerAbierto(false)} title="Nueva jornada electoral">
        {formularioNuevaJornada}
      </Drawer>
    </div>
  );
}

function Kpi({ label, value, destacado }: { label: string; value: string; destacado?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 text-center shadow-sm ${destacado ? "border-indigo-200 bg-indigo-50" : "border-gray-200 bg-white"}`}>
      <div className={`text-2xl font-bold ${destacado ? "text-indigo-700" : "text-institucional-900"}`}>{value}</div>
      <div className="mt-1 text-xs text-gray-500">{label}</div>
    </div>
  );
}
