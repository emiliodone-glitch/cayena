"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Plus, Trash2, BarChart3, X } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { Drawer } from "@/components/Drawer";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CardSkeleton } from "@/components/Skeleton";

type Encuesta = {
  id: string;
  titulo: string;
  descripcion: string | null;
  activa: boolean;
  createdAt: string;
  opciones: { id: string; texto: string }[];
  _count: { votos: number };
};

type Resultados = {
  id: string;
  titulo: string;
  totalVotos: number;
  opciones: { id: string; texto: string; votos: number; porcentaje: number }[];
};

export default function EncuestasPage() {
  const { user } = useAuth();
  const toast = useToast();
  const puedeGestionar = user?.role === "SUPERADMIN" || user?.role === "JEFE_SECRETARIA";
  const puedeEliminar = user?.role === "SUPERADMIN";

  const [encuestas, setEncuestas] = useState<Encuesta[] | null>(null);
  const [drawerAbierto, setDrawerAbierto] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [opciones, setOpciones] = useState(["", ""]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [resultados, setResultados] = useState<Resultados | null>(null);
  const [cargandoResultados, setCargandoResultados] = useState(false);
  const [eliminando, setEliminando] = useState<Encuesta | null>(null);
  const [borrando, setBorrando] = useState(false);

  function cargar() {
    apiFetch<Encuesta[]>("/encuestas").then(setEncuestas).catch(() => setEncuestas([]));
  }

  useEffect(cargar, []);

  function abrirNueva() {
    setTitulo("");
    setDescripcion("");
    setOpciones(["", ""]);
    setError(null);
    setDrawerAbierto(true);
  }

  function actualizarOpcion(i: number, valor: string) {
    setOpciones((prev) => prev.map((o, idx) => (idx === i ? valor : o)));
  }

  function agregarOpcion() {
    setOpciones((prev) => [...prev, ""]);
  }

  function quitarOpcion(i: number) {
    setOpciones((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function crear(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const opcionesLimpias = opciones.map((o) => o.trim()).filter(Boolean);
    if (opcionesLimpias.length < 2) {
      setError("Agrega al menos 2 opciones válidas");
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch("/encuestas", {
        method: "POST",
        body: JSON.stringify({ titulo, descripcion: descripcion || undefined, opciones: opcionesLimpias }),
      });
      toast("Encuesta creada");
      setDrawerAbierto(false);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear la encuesta");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActiva(enc: Encuesta) {
    try {
      await apiFetch(`/encuestas/${enc.id}/estado`, {
        method: "PATCH",
        body: JSON.stringify({ activa: !enc.activa }),
      });
      toast(enc.activa ? "Encuesta desactivada" : "Encuesta activada");
      cargar();
    } catch {
      toast("No se pudo cambiar el estado de la encuesta", "error");
    }
  }

  async function verResultados(enc: Encuesta) {
    setCargandoResultados(true);
    setResultados(null);
    try {
      const data = await apiFetch<Resultados>(`/encuestas/${enc.id}/resultados`);
      setResultados(data);
    } catch {
      toast("No se pudieron cargar los resultados", "error");
    } finally {
      setCargandoResultados(false);
    }
  }

  async function confirmarEliminar() {
    if (!eliminando) return;
    setBorrando(true);
    try {
      await apiFetch(`/encuestas/${eliminando.id}`, { method: "DELETE" });
      toast("Encuesta eliminada");
      setEliminando(null);
      cargar();
    } catch {
      toast("No se pudo eliminar la encuesta", "error");
    } finally {
      setBorrando(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-institucional-900">Encuestas internas</h1>
          <p className="mt-1 text-sm text-gray-500">Visibles para votar en la app móvil mientras estén activas.</p>
        </div>
        {puedeGestionar && (
          <button
            onClick={abrirNueva}
            className="flex items-center gap-1.5 rounded-lg bg-institucional-600 px-4 py-2 text-sm font-semibold text-white hover:bg-institucional-700"
          >
            <Plus className="h-4 w-4" /> Nueva encuesta
          </button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {encuestas === null &&
          Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}
        {encuestas?.map((enc) => (
          <div key={enc.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-2 flex items-start justify-between gap-2">
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  enc.activa ? "bg-institucional-100 text-institucional-700" : "bg-gray-100 text-gray-500"
                }`}
              >
                {enc.activa ? "Activa" : "Inactiva"}
              </span>
              {puedeEliminar && (
                <button
                  onClick={() => setEliminando(enc)}
                  className="rounded-lg p-1 text-gray-300 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="font-semibold text-institucional-900">{enc.titulo}</div>
            {enc.descripcion && <div className="mt-1 text-sm text-gray-500">{enc.descripcion}</div>}
            <div className="mt-2 text-xs text-gray-400">
              {enc.opciones.length} opciones · {enc._count.votos} votos
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => verResultados(enc)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-institucional-600 px-3 py-1.5 text-xs font-semibold text-institucional-700 hover:bg-institucional-50"
              >
                <BarChart3 className="h-3.5 w-3.5" /> Resultados
              </button>
              {puedeGestionar && (
                <button
                  onClick={() => toggleActiva(enc)}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  {enc.activa ? "Desactivar" : "Activar"}
                </button>
              )}
            </div>
          </div>
        ))}
        {encuestas?.length === 0 && (
          <p className="col-span-full py-6 text-center text-gray-400">Todavía no hay encuestas creadas.</p>
        )}
      </div>

      <Drawer open={drawerAbierto} onClose={() => setDrawerAbierto(false)} title="Nueva encuesta">
        <form onSubmit={crear} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Título</span>
            <input
              required
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Descripción (opcional)</span>
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>

          <div>
            <span className="mb-1 block text-sm font-medium text-gray-700">Opciones</span>
            <div className="space-y-2">
              {opciones.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={o}
                    onChange={(e) => actualizarOpcion(i, e.target.value)}
                    placeholder={`Opción ${i + 1}`}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  {opciones.length > 2 && (
                    <button type="button" onClick={() => quitarOpcion(i)} className="text-gray-400 hover:text-red-600">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={agregarOpcion}
              className="mt-2 flex items-center gap-1 text-xs font-semibold text-institucional-700 hover:text-institucional-900"
            >
              <Plus className="h-3 w-3" /> Agregar opción
            </button>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button
              disabled={submitting}
              className="flex-1 rounded-lg bg-institucional-600 px-4 py-2 text-sm font-semibold text-white hover:bg-institucional-700 disabled:opacity-60"
            >
              {submitting ? "Creando…" : "Crear encuesta"}
            </button>
            <button
              type="button"
              onClick={() => setDrawerAbierto(false)}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      </Drawer>

      <Drawer open={!!resultados || cargandoResultados} onClose={() => setResultados(null)} title="Resultados">
        {cargandoResultados ? (
          <p className="text-sm text-gray-400">Cargando…</p>
        ) : resultados ? (
          <div>
            <div className="mb-4 font-semibold text-institucional-900">{resultados.titulo}</div>
            <div className="mb-4 text-sm text-gray-500">{resultados.totalVotos} votos totales</div>
            <div className="space-y-3">
              {resultados.opciones.map((o) => (
                <div key={o.id}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-gray-700">{o.texto}</span>
                    <span className="font-semibold text-institucional-700">
                      {o.votos} ({o.porcentaje}%)
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-100">
                    <div
                      className="h-2 rounded-full bg-institucional-600"
                      style={{ width: `${o.porcentaje}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={!!eliminando}
        title="¿Eliminar esta encuesta?"
        mensaje={`"${eliminando?.titulo}" y todos sus votos se eliminarán permanentemente.`}
        onConfirm={confirmarEliminar}
        onCancel={() => setEliminando(null)}
        loading={borrando}
      />
    </div>
  );
}
