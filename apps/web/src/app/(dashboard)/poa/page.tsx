"use client";

import { useEffect, useState, type FormEvent } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { Drawer } from "@/components/Drawer";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CardSkeleton } from "@/components/Skeleton";

type MetaPoa = {
  id: string;
  nombre: string;
  descripcion: string | null;
  indicadorObjetivo: number;
  fechaLimite: string;
  totalAvance: number;
  porcentaje: number;
  secretariaId: string;
  secretaria: { nombre: string };
};

type Secretaria = { id: string; nombre: string };

const FORM_VACIO = { secretariaId: "", nombre: "", descripcion: "", indicadorObjetivo: "", fechaLimite: "" };

export default function PoaPage() {
  const { user } = useAuth();
  const toast = useToast();
  const puedeEditar = user?.role !== "AUDITOR";

  const [metas, setMetas] = useState<MetaPoa[] | null>(null);
  const [secretarias, setSecretarias] = useState<Secretaria[]>([]);
  const [avance, setAvance] = useState<Record<string, string>>({});

  const [drawerAbierto, setDrawerAbierto] = useState(false);
  const [editando, setEditando] = useState<MetaPoa | null>(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState<MetaPoa | null>(null);
  const [borrando, setBorrando] = useState(false);

  function cargar() {
    apiFetch<MetaPoa[]>("/poa").then(setMetas).catch(() => setMetas([]));
  }

  useEffect(() => {
    cargar();
    apiFetch<Secretaria[]>("/secretarias").then(setSecretarias);
  }, []);

  function abrirNueva() {
    setEditando(null);
    setForm(FORM_VACIO);
    setError(null);
    setDrawerAbierto(true);
  }

  function abrirEditar(m: MetaPoa) {
    setEditando(m);
    setForm({
      secretariaId: m.secretariaId,
      nombre: m.nombre,
      descripcion: m.descripcion ?? "",
      indicadorObjetivo: String(m.indicadorObjetivo),
      fechaLimite: m.fechaLimite.slice(0, 10),
    });
    setError(null);
    setDrawerAbierto(true);
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const body = { ...form, indicadorObjetivo: Number(form.indicadorObjetivo) };
      if (editando) {
        await apiFetch(`/poa/${editando.id}`, { method: "PATCH", body: JSON.stringify(body) });
        toast("Meta actualizada");
      } else {
        await apiFetch("/poa", { method: "POST", body: JSON.stringify(body) });
        toast("Meta creada");
      }
      setDrawerAbierto(false);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar la meta");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmarEliminar() {
    if (!eliminando) return;
    setBorrando(true);
    try {
      await apiFetch(`/poa/${eliminando.id}`, { method: "DELETE" });
      toast("Meta eliminada");
      setEliminando(null);
      cargar();
    } catch {
      toast("No se pudo eliminar la meta", "error");
    } finally {
      setBorrando(false);
    }
  }

  async function registrarAvance(id: string) {
    const valor = Number(avance[id] ?? 0);
    if (!valor) return;
    try {
      await apiFetch(`/poa/${id}/avances`, { method: "POST", body: JSON.stringify({ valor }) });
      toast("Avance registrado");
      setAvance({ ...avance, [id]: "" });
      cargar();
    } catch {
      toast("No se pudo registrar el avance", "error");
    }
  }

  const chartData = (metas ?? []).map((m) => ({
    nombre: m.nombre.length > 18 ? `${m.nombre.slice(0, 18)}…` : m.nombre,
    logrado: m.totalAvance,
    objetivo: m.indicadorObjetivo,
  }));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-institucional-900">POA — Plan Operativo Anual</h1>
        {puedeEditar && (
          <button
            onClick={abrirNueva}
            className="flex items-center gap-1.5 rounded-lg bg-institucional-600 px-4 py-2 text-sm font-semibold text-white hover:bg-institucional-700"
          >
            <Plus className="h-4 w-4" /> Nueva meta
          </button>
        )}
      </div>

      {chartData.length > 0 && (
        <div className="mb-8 h-72 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="nombre" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Bar dataKey="objetivo" fill="#d6f5dd" name="Objetivo" />
              <Bar dataKey="logrado" fill="#1f7a34" name="Logrado" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {metas === null &&
          Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}
        {metas?.map((m) => (
          <div key={m.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="text-xs uppercase text-gray-400">{m.secretaria.nombre}</div>
              {puedeEditar && (
                <div className="flex gap-1">
                  <button onClick={() => abrirEditar(m)} className="text-gray-300 hover:text-institucional-700">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => setEliminando(m)} className="text-gray-300 hover:text-red-600">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
            <div className="mt-1 font-semibold text-institucional-900">{m.nombre}</div>
            {m.descripcion && <div className="mt-1 text-xs text-gray-500">{m.descripcion}</div>}
            <div className="mt-2 h-2 w-full rounded-full bg-gray-100">
              <div
                className="h-2 rounded-full bg-institucional-600"
                style={{ width: `${Math.min(100, m.porcentaje)}%` }}
              />
            </div>
            <div className="mt-1 text-xs text-gray-500">
              {m.totalAvance} / {m.indicadorObjetivo} ({m.porcentaje}%) · límite{" "}
              {new Date(m.fechaLimite).toLocaleDateString("es-DO")}
            </div>
            {puedeEditar && (
              <div className="mt-3 flex gap-2">
                <input
                  type="number"
                  placeholder="Avance"
                  value={avance[m.id] ?? ""}
                  onChange={(e) => setAvance({ ...avance, [m.id]: e.target.value })}
                  className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-sm"
                />
                <button
                  onClick={() => registrarAvance(m.id)}
                  className="rounded-lg bg-institucional-600 px-3 py-1 text-xs font-semibold text-white hover:bg-institucional-700"
                >
                  Registrar
                </button>
              </div>
            )}
          </div>
        ))}
        {metas?.length === 0 && <p className="col-span-full py-6 text-center text-gray-400">Sin metas registradas.</p>}
      </div>

      <Drawer open={drawerAbierto} onClose={() => setDrawerAbierto(false)} title={editando ? "Editar meta POA" : "Nueva meta POA"}>
        <form onSubmit={guardar} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Secretaría</span>
            <select
              required
              value={form.secretariaId}
              onChange={(e) => setForm({ ...form, secretariaId: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Secretaría…</option>
              {secretarias.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Nombre de la meta</span>
            <input
              required
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Descripción</span>
            <textarea
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Indicador objetivo</span>
              <input
                required
                type="number"
                value={form.indicadorObjetivo}
                onChange={(e) => setForm({ ...form, indicadorObjetivo: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Fecha límite</span>
              <input
                required
                type="date"
                value={form.fechaLimite}
                onChange={(e) => setForm({ ...form, fechaLimite: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2 pt-2">
            <button
              disabled={submitting}
              className="flex-1 rounded-lg bg-institucional-600 px-4 py-2 text-sm font-semibold text-white hover:bg-institucional-700 disabled:opacity-60"
            >
              {submitting ? "Guardando…" : editando ? "Guardar cambios" : "Crear meta"}
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

      <ConfirmDialog
        open={!!eliminando}
        title="¿Eliminar esta meta?"
        mensaje={`"${eliminando?.nombre}" y todo su historial de avance se eliminará permanentemente.`}
        onConfirm={confirmarEliminar}
        onCancel={() => setEliminando(null)}
        loading={borrando}
      />
    </div>
  );
}
