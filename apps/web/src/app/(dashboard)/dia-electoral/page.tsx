"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Vote, ScanLine, Download, CalendarPlus, Plus } from "lucide-react";
import { apiFetch, API_URL, getAccessToken, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { Drawer } from "@/components/Drawer";
import type { DemarcacionElectoral } from "@/components/MapaDiaElectoral";

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
};

type Mesa = { id: string; numero: string; militantesRegistrados: number; votosConfirmados: number; porcentajePropia: number };
type Recinto = { id: string; nombre: string; direccion: string | null; mesas: Mesa[] };

const fmtNum = new Intl.NumberFormat("es-DO");

export default function DiaElectoralPage() {
  const { user } = useAuth();
  const toast = useToast();
  const esSuperadmin = user?.role === "SUPERADMIN";
  // Cada jornada creada queda guardada — este selector permite seguir
  // monitoreando cualquier proceso anterior sin perderle acceso al crear uno
  // nuevo (crear una jornada solo cambia cuál es la "activa" para marcar
  // votos/autoreporte, no borra ni oculta las demás).
  const [eventos, setEventos] = useState<Evento[] | null>(null);
  const [eventoId, setEventoId] = useState<string | null>(null);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [demarcacion, setDemarcacion] = useState<DemarcacionElectoral | null>(null);
  const [recintos, setRecintos] = useState<Recinto[] | null>(null);
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

  const evento = eventos?.find((e) => e.id === eventoId) ?? null;

  useEffect(() => {
    if (!eventoId) return;
    apiFetch<Resumen>(`/dia-electoral/resumen/${eventoId}`).then(setResumen);
  }, [eventoId, refreshTicker]);

  const municipioMesasRef = useRef<string | null>(null);

  useEffect(() => {
    if (demarcacion?.tipo !== "municipio" || !eventoId) {
      municipioMesasRef.current = null;
      setRecintos(null);
      return;
    }
    // El mapa dispara onDemarcacionChange en cada hover real (no solo al
    // hacer clic), así que mover el cursor por varios municipios seguidos
    // podía disparar una llamada de red por cada uno — de ahí la sensación
    // de demora, además de que una respuesta vieja podía llegar después de
    // una más nueva y pisarla. Se espera un momento a que el cursor se
    // "asiente" en un municipio antes de pedir sus mesas, y se descarta
    // cualquier respuesta que llegue después de haber cambiado de selección.
    // Al cambiar de municipio (no en cada refresco en vivo del mismo) se
    // limpian los recintos de inmediato para no dejar viendo, ni por un
    // instante, las mesas del municipio anterior.
    if (municipioMesasRef.current !== demarcacion.id) {
      municipioMesasRef.current = demarcacion.id;
      setRecintos(null);
    }
    let cancelado = false;
    const demarcacionId = demarcacion.id;
    const timer = setTimeout(() => {
      apiFetch<Recinto[]>(`/dia-electoral/mesas?municipioId=${demarcacionId}&eventoId=${eventoId}`)
        .then((data) => {
          if (!cancelado) setRecintos(data);
        })
        .catch(() => {
          if (!cancelado) setRecintos([]);
        });
    }, 300);
    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [demarcacion, eventoId, refreshTicker]);

  // Ticker nacional en vivo: mismo canal SSE que el mapa, evento "cambio-votos".
  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    const fuente = new EventSource(`${API_URL}/eventos/stream?token=${encodeURIComponent(token)}`);
    fuente.addEventListener("cambio-votos", () => setRefreshTicker((t) => t + 1));
    return () => fuente.close();
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
          <Link href="/dia-electoral/marcar" className="flex items-center gap-1.5 rounded-lg border border-indigo-200 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">
            <ScanLine className="h-4 w-4" /> Registrar votos
          </Link>
          <button onClick={exportarReporte} className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
            <Download className="h-4 w-4" /> Exportar reporte
          </button>
        </div>
      </div>

      {resumen && (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <Kpi label="Militantes registrados" value={fmtNum.format(resumen.militantesRegistrados)} />
          <Kpi label="Votos confirmados" value={fmtNum.format(resumen.votosConfirmados)} destacado />
          <Kpi label="% de la propia base" value={`${resumen.porcentajePropia}%`} />
          <Kpi label="% del padrón electoral" value={resumen.porcentajePadron != null ? `${resumen.porcentajePadron}%` : "—"} />
        </div>
      )}

      {eventoId && <MapaDiaElectoral eventoId={eventoId} onDemarcacionChange={setDemarcacion} />}

      {demarcacion?.tipo === "municipio" && recintos === null && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-institucional-900">Mesas de {demarcacion.nombre}</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />
            ))}
          </div>
        </div>
      )}

      {demarcacion?.tipo === "municipio" && recintos && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-institucional-900">Mesas de {demarcacion.nombre}</h2>
          {recintos.length === 0 ? (
            <p className="text-sm text-gray-400">Sin recintos electorales registrados en este municipio.</p>
          ) : (
            <div className="space-y-3">
              {recintos.map((r) => (
                <div key={r.id}>
                  <div className="text-xs font-semibold uppercase text-gray-400">{r.nombre}</div>
                  <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {r.mesas.map((m) => (
                      <div key={m.id} className="rounded-lg border border-gray-100 px-3 py-2 text-xs">
                        <div className="font-semibold text-institucional-900">Mesa {m.numero}</div>
                        <div className="text-gray-500">{m.votosConfirmados} de {m.militantesRegistrados} — {m.porcentajePropia}%</div>
                      </div>
                    ))}
                    {r.mesas.length === 0 && <span className="text-xs text-gray-400">Sin mesas registradas</span>}
                  </div>
                </div>
              ))}
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
