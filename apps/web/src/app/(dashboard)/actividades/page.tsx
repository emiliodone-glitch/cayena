"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Pencil, Plus, Trash2, Copy, Images, UserCheck, ScanLine } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { Drawer } from "@/components/Drawer";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { TableSkeleton } from "@/components/Skeleton";
import { FotoUploader } from "@/components/FotoUploader";
import { ActividadForm, type ActividadExistente } from "@/components/forms/ActividadForm";

type Actividad = ActividadExistente & {
  secretaria: { nombre: string };
  confirmados: number;
  checkIns: number;
};

type Secretaria = { id: string; nombre: string };

type Asistencia = {
  id: string;
  confirmado: boolean;
  checkInAt: string | null;
  militante: { nombre: string; cedula: string };
};

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function ActividadesPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [vista, setVista] = useState<"lista" | "calendario">("lista");
  const [actividades, setActividades] = useState<Actividad[] | null>(null);
  const [secretarias, setSecretarias] = useState<Secretaria[]>([]);
  const [q, setQ] = useState("");
  const [secretariaFiltro, setSecretariaFiltro] = useState("");
  const [desdeFiltro, setDesdeFiltro] = useState("");
  const [hastaFiltro, setHastaFiltro] = useState("");
  const [mesActual, setMesActual] = useState(() => new Date());
  const [diaSeleccionado, setDiaSeleccionado] = useState<Date | null>(null);
  const [drawerAbierto, setDrawerAbierto] = useState(false);
  const [editando, setEditando] = useState<Actividad | undefined>(undefined);
  const [duplicando, setDuplicando] = useState<Actividad | undefined>(undefined);
  const [eliminando, setEliminando] = useState<Actividad | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [galeriaDe, setGaleriaDe] = useState<Actividad | null>(null);
  const [fotosGaleria, setFotosGaleria] = useState<string[]>([]);
  const [guardandoGaleria, setGuardandoGaleria] = useState(false);
  const [asistentesDe, setAsistentesDe] = useState<Actividad | null>(null);
  const [asistencias, setAsistencias] = useState<Asistencia[] | null>(null);

  function cargar() {
    const params = new URLSearchParams();
    if (secretariaFiltro) params.set("secretariaId", secretariaFiltro);
    if (desdeFiltro) params.set("desde", new Date(desdeFiltro).toISOString());
    if (hastaFiltro) params.set("hasta", new Date(hastaFiltro).toISOString());
    const qs = params.toString();
    apiFetch<Actividad[]>(`/actividades${qs ? `?${qs}` : ""}`).then(setActividades);
  }

  useEffect(cargar, [secretariaFiltro, desdeFiltro, hastaFiltro]);
  useEffect(() => {
    apiFetch<Secretaria[]>("/secretarias").then(setSecretarias).catch(() => setSecretarias([]));
  }, []);

  const diasDelMes = useMemo(() => {
    const year = mesActual.getFullYear();
    const month = mesActual.getMonth();
    const primerDia = new Date(year, month, 1);
    const inicioOffset = primerDia.getDay();
    const dias: (Date | null)[] = Array(inicioOffset).fill(null);
    const totalDias = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= totalDias; d++) dias.push(new Date(year, month, d));
    return dias;
  }, [mesActual]);

  const actividadesVisibles = (
    diaSeleccionado
      ? (actividades ?? []).filter((a) => sameDay(new Date(a.fecha), diaSeleccionado))
      : actividades ?? []
  ).filter((a) => a.titulo.toLowerCase().includes(q.trim().toLowerCase()));

  function abrirNueva() {
    setEditando(undefined);
    setDuplicando(undefined);
    setDrawerAbierto(true);
  }

  function abrirEditar(a: Actividad) {
    setEditando(a);
    setDuplicando(undefined);
    setDrawerAbierto(true);
  }

  function abrirDuplicar(a: Actividad) {
    // Corre la fecha una semana para el caso de uso típico (reunión/asamblea
    // recurrente); el usuario la ajusta en el formulario antes de guardar.
    const nuevaFecha = new Date(a.fecha);
    nuevaFecha.setDate(nuevaFecha.getDate() + 7);
    setEditando(undefined);
    setDuplicando({ ...a, titulo: `${a.titulo} (copia)`, fecha: nuevaFecha.toISOString(), fotos: [] });
    setDrawerAbierto(true);
  }

  function onSaved() {
    setDrawerAbierto(false);
    cargar();
  }

  function abrirGaleria(a: Actividad) {
    setGaleriaDe(a);
    setFotosGaleria(a.fotos);
  }

  async function guardarGaleria() {
    if (!galeriaDe) return;
    setGuardandoGaleria(true);
    try {
      await apiFetch(`/actividades/${galeriaDe.id}`, { method: "PATCH", body: JSON.stringify({ fotos: fotosGaleria }) });
      toast("Galería actualizada");
      setGaleriaDe(null);
      cargar();
    } catch {
      toast("No se pudo guardar la galería", "error");
    } finally {
      setGuardandoGaleria(false);
    }
  }

  function abrirAsistentes(a: Actividad) {
    setAsistentesDe(a);
    setAsistencias(null);
    apiFetch<Asistencia[]>(`/actividades/${a.id}/asistencia`)
      .then(setAsistencias)
      .catch(() => setAsistencias([]));
  }

  async function togglePublicar(a: Actividad) {
    await apiFetch(`/actividades/${a.id}/publicar`, {
      method: "PATCH",
      body: JSON.stringify({ publicadaApp: !a.publicadaApp }),
    });
    toast(a.publicadaApp ? "Actividad despublicada" : "Actividad publicada en la app");
    cargar();
  }

  async function confirmarEliminar() {
    if (!eliminando) return;
    setBorrando(true);
    try {
      await apiFetch(`/actividades/${eliminando.id}`, { method: "DELETE" });
      toast("Actividad eliminada");
      setEliminando(null);
      cargar();
    } catch {
      toast("No se pudo eliminar la actividad", "error");
    } finally {
      setBorrando(false);
    }
  }

  const puedeEditar = user?.role !== "AUDITOR";

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-institucional-900">Actividades</h1>
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por título…"
            className="w-56 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-institucional-600 focus:outline-none"
          />
          <div className="flex rounded-lg border border-gray-200 bg-white p-1 text-sm">
            <button
              onClick={() => setVista("lista")}
              className={`rounded-md px-3 py-1 ${vista === "lista" ? "bg-institucional-600 text-white" : "text-gray-500"}`}
            >
              Lista
            </button>
            <button
              onClick={() => setVista("calendario")}
              className={`rounded-md px-3 py-1 ${vista === "calendario" ? "bg-institucional-600 text-white" : "text-gray-500"}`}
            >
              Calendario
            </button>
          </div>
          {puedeEditar && (
            <Link
              href="/actividades/checkin"
              className="flex items-center gap-1.5 rounded-lg border border-institucional-200 px-4 py-2 text-sm font-semibold text-institucional-700 hover:bg-institucional-50"
            >
              <ScanLine className="h-4 w-4" /> Registrar asistencia
            </Link>
          )}
          {puedeEditar && (
            <button
              onClick={abrirNueva}
              className="flex items-center gap-1.5 rounded-lg bg-institucional-600 px-4 py-2 text-sm font-semibold text-white hover:bg-institucional-700"
            >
              <Plus className="h-4 w-4" /> Nueva actividad
            </button>
          )}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={secretariaFiltro}
          onChange={(e) => setSecretariaFiltro(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-institucional-600 focus:outline-none"
        >
          <option value="">Todas las secretarías</option>
          {secretarias.map((s) => (
            <option key={s.id} value={s.id}>{s.nombre}</option>
          ))}
        </select>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400">Desde</span>
          <input
            type="date"
            value={desdeFiltro}
            onChange={(e) => setDesdeFiltro(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          />
          <span className="text-xs text-gray-400">Hasta</span>
          <input
            type="date"
            value={hastaFiltro}
            onChange={(e) => setHastaFiltro(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          />
        </div>
        {(secretariaFiltro || desdeFiltro || hastaFiltro) && (
          <button
            onClick={() => {
              setSecretariaFiltro("");
              setDesdeFiltro("");
              setHastaFiltro("");
            }}
            className="text-xs font-medium text-institucional-600 hover:underline"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {vista === "calendario" && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between text-sm font-semibold">
            <button onClick={() => setMesActual(new Date(mesActual.getFullYear(), mesActual.getMonth() - 1, 1))}>‹</button>
            <span>{mesActual.toLocaleDateString("es-DO", { month: "long", year: "numeric" })}</span>
            <button onClick={() => setMesActual(new Date(mesActual.getFullYear(), mesActual.getMonth() + 1, 1))}>›</button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-400">
            {["D", "L", "M", "M", "J", "V", "S"].map((d, i) => (
              <div key={i}>{d}</div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {diasDelMes.map((d, i) => {
              const tieneActividad = d && (actividades ?? []).some((a) => sameDay(new Date(a.fecha), d));
              const seleccionado = d && diaSeleccionado && sameDay(d, diaSeleccionado);
              return (
                <button
                  key={i}
                  disabled={!d}
                  onClick={() => d && setDiaSeleccionado(seleccionado ? null : d)}
                  className={`h-14 rounded-lg border text-sm ${
                    !d
                      ? "border-transparent"
                      : seleccionado
                        ? "border-institucional-600 bg-institucional-600 text-white"
                        : "border-gray-100 hover:bg-gray-50"
                  }`}
                >
                  {d?.getDate()}
                  {tieneActividad && !seleccionado && (
                    <div className="mx-auto mt-0.5 h-1.5 w-1.5 rounded-full bg-institucional-600" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {actividades === null ? (
        <TableSkeleton cols={5} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-2">Título</th>
                <th className="px-4 py-2">Fecha</th>
                <th className="px-4 py-2">Ubicación</th>
                <th className="px-4 py-2">Secretaría</th>
                <th className="px-4 py-2">Publicada</th>
                <th className="px-4 py-2">Asistencia</th>
                {puedeEditar && <th className="px-4 py-2 text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {actividadesVisibles.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-2 font-medium">{a.titulo}</td>
                  <td className="px-4 py-2">{new Date(a.fecha).toLocaleString("es-DO")}</td>
                  <td className="px-4 py-2">
                    {a.ubicacion ?? "—"}
                    {a.lat != null && a.lng != null && (
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${a.lat},${a.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-1.5 text-xs text-institucional-600 hover:underline"
                      >
                        Cómo llegar
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-2">{a.secretaria.nombre}</td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => togglePublicar(a)}
                      disabled={!puedeEditar}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        a.publicadaApp ? "bg-institucional-100 text-institucional-700" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {a.publicadaApp ? "Publicada" : "No publicada"}
                    </button>
                  </td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => abrirAsistentes(a)}
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-institucional-700 hover:underline"
                      title="Ver asistentes"
                    >
                      <UserCheck className="h-3.5 w-3.5" />
                      {a.confirmados} confirmados · {a.checkIns} check-in
                    </button>
                  </td>
                  {puedeEditar && (
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => abrirGaleria(a)}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-institucional-700"
                          title="Galería de fotos"
                        >
                          <Images className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => abrirDuplicar(a)}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-institucional-700"
                          title="Duplicar actividad"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => abrirEditar(a)}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-institucional-700"
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setEliminando(a)}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {actividadesVisibles.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                    Sin actividades.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Drawer
        open={drawerAbierto}
        onClose={() => setDrawerAbierto(false)}
        title={editando ? "Editar actividad" : duplicando ? "Duplicar actividad" : "Nueva actividad"}
      >
        <ActividadForm actividad={editando} duplicarDe={duplicando} onSaved={onSaved} onCancel={() => setDrawerAbierto(false)} />
      </Drawer>

      <Drawer open={!!galeriaDe} onClose={() => setGaleriaDe(null)} title={`Galería — ${galeriaDe?.titulo ?? ""}`}>
        <p className="mb-3 text-sm text-gray-500">
          Sube fotos de evidencia después de que ocurrió la actividad (asambleas, entregas, encuentros).
        </p>
        <FotoUploader fotos={fotosGaleria} onChange={setFotosGaleria} />
        <button
          onClick={guardarGaleria}
          disabled={guardandoGaleria}
          className="mt-4 w-full rounded-lg bg-institucional-600 px-4 py-2 text-sm font-semibold text-white hover:bg-institucional-700 disabled:opacity-60"
        >
          {guardandoGaleria ? "Guardando…" : "Guardar galería"}
        </button>
      </Drawer>

      <Drawer open={!!asistentesDe} onClose={() => setAsistentesDe(null)} title={`Asistentes — ${asistentesDe?.titulo ?? ""}`}>
        {asistencias === null ? (
          <p className="text-sm text-gray-400">Cargando…</p>
        ) : asistencias.length === 0 ? (
          <p className="text-sm text-gray-400">Nadie ha confirmado ni registrado asistencia todavía.</p>
        ) : (
          <div className="space-y-2">
            {asistencias.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-sm">
                <div>
                  <div className="font-medium text-gray-800">{a.militante.nombre}</div>
                  <div className="text-xs text-gray-400">{a.militante.cedula}</div>
                </div>
                <div className="text-right text-xs">
                  {a.checkInAt ? (
                    <span className="font-semibold text-institucional-700">
                      Check-in {new Date(a.checkInAt).toLocaleString("es-DO")}
                    </span>
                  ) : a.confirmado ? (
                    <span className="text-amber-600">Confirmó, sin check-in</span>
                  ) : (
                    <span className="text-gray-400">Canceló su confirmación</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={!!eliminando}
        title="¿Eliminar esta actividad?"
        mensaje={`"${eliminando?.titulo}" se eliminará permanentemente.`}
        onConfirm={confirmarEliminar}
        onCancel={() => setEliminando(null)}
        loading={borrando}
      />
    </div>
  );
}
