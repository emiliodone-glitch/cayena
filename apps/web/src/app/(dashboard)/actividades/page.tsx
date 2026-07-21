"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { Drawer } from "@/components/Drawer";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { TableSkeleton } from "@/components/Skeleton";
import { ActividadForm, type ActividadExistente } from "@/components/forms/ActividadForm";

type Actividad = ActividadExistente & {
  secretaria: { nombre: string };
};

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function ActividadesPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [vista, setVista] = useState<"lista" | "calendario">("lista");
  const [actividades, setActividades] = useState<Actividad[] | null>(null);
  const [q, setQ] = useState("");
  const [mesActual, setMesActual] = useState(() => new Date());
  const [diaSeleccionado, setDiaSeleccionado] = useState<Date | null>(null);
  const [drawerAbierto, setDrawerAbierto] = useState(false);
  const [editando, setEditando] = useState<Actividad | undefined>(undefined);
  const [eliminando, setEliminando] = useState<Actividad | null>(null);
  const [borrando, setBorrando] = useState(false);

  function cargar() {
    apiFetch<Actividad[]>("/actividades").then(setActividades);
  }

  useEffect(cargar, []);

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
    setDrawerAbierto(true);
  }

  function abrirEditar(a: Actividad) {
    setEditando(a);
    setDrawerAbierto(true);
  }

  function onSaved() {
    setDrawerAbierto(false);
    cargar();
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
            <button
              onClick={abrirNueva}
              className="flex items-center gap-1.5 rounded-lg bg-institucional-600 px-4 py-2 text-sm font-semibold text-white hover:bg-institucional-700"
            >
              <Plus className="h-4 w-4" /> Nueva actividad
            </button>
          )}
        </div>
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
                {puedeEditar && <th className="px-4 py-2 text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {actividadesVisibles.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-2 font-medium">{a.titulo}</td>
                  <td className="px-4 py-2">{new Date(a.fecha).toLocaleString("es-DO")}</td>
                  <td className="px-4 py-2">{a.ubicacion ?? "—"}</td>
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
                  {puedeEditar && (
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => abrirEditar(a)}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-institucional-700"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setEliminando(a)}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
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
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                    Sin actividades.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Drawer open={drawerAbierto} onClose={() => setDrawerAbierto(false)} title={editando ? "Editar actividad" : "Nueva actividad"}>
        <ActividadForm actividad={editando} onSaved={onSaved} onCancel={() => setDrawerAbierto(false)} />
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
