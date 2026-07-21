"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { Drawer } from "@/components/Drawer";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { TableSkeleton, CardSkeleton } from "@/components/Skeleton";

type Gasto = {
  id: string;
  tipo: "INGRESO" | "GASTO";
  monto: string;
  categoria: string;
  fecha: string;
  secretariaId: string | null;
  secretaria: { nombre: string } | null;
};

type Secretaria = { id: string; nombre: string };

const CATEGORIAS = ["Alquiler", "Publicidad", "Transporte", "Salarios", "Actividades", "Suministros", "Donaciones", "Otro"];

const fmtMoney = new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" });

const FORM_VACIO = { tipo: "GASTO", monto: "", categoria: "", categoriaOtra: "", fecha: "", secretariaId: "" };

export default function GastosPage() {
  const { user } = useAuth();
  const toast = useToast();
  const puedeEditar = user?.role !== "AUDITOR";

  const [data, setData] = useState<{ gastos: Gasto[]; totales: { ingresos: number; gastos: number } } | null>(null);
  const [secretarias, setSecretarias] = useState<Secretaria[]>([]);
  const [filtroSecretaria, setFiltroSecretaria] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const [drawerAbierto, setDrawerAbierto] = useState(false);
  const [editando, setEditando] = useState<Gasto | null>(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState<Gasto | null>(null);
  const [borrando, setBorrando] = useState(false);

  function cargar() {
    const params = new URLSearchParams();
    if (filtroSecretaria) params.set("secretariaId", filtroSecretaria);
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);
    apiFetch<NonNullable<typeof data>>(`/gastos?${params.toString()}`).then(setData).catch(() => setData(null));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroSecretaria, desde, hasta]);

  useEffect(() => {
    apiFetch<Secretaria[]>("/secretarias").then(setSecretarias);
  }, []);

  function abrirNuevo() {
    setEditando(null);
    setForm(FORM_VACIO);
    setError(null);
    setDrawerAbierto(true);
  }

  function abrirEditar(g: Gasto) {
    setEditando(g);
    const esCategoriaConocida = CATEGORIAS.slice(0, -1).includes(g.categoria);
    setForm({
      tipo: g.tipo,
      monto: g.monto,
      categoria: esCategoriaConocida ? g.categoria : "Otro",
      categoriaOtra: esCategoriaConocida ? "" : g.categoria,
      fecha: g.fecha.slice(0, 10),
      secretariaId: g.secretariaId ?? "",
    });
    setError(null);
    setDrawerAbierto(true);
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const categoriaFinal = form.categoria === "Otro" ? form.categoriaOtra.trim() : form.categoria;
    if (!categoriaFinal) {
      setError("Indica una categoría");
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        tipo: form.tipo,
        monto: Number(form.monto),
        categoria: categoriaFinal,
        fecha: form.fecha,
        secretariaId: form.secretariaId || undefined,
      };
      if (editando) {
        await apiFetch(`/gastos/${editando.id}`, { method: "PATCH", body: JSON.stringify(body) });
        toast("Movimiento actualizado");
      } else {
        await apiFetch("/gastos", { method: "POST", body: JSON.stringify(body) });
        toast("Movimiento registrado");
      }
      setDrawerAbierto(false);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar el movimiento");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmarEliminar() {
    if (!eliminando) return;
    setBorrando(true);
    try {
      await apiFetch(`/gastos/${eliminando.id}`, { method: "DELETE" });
      toast("Movimiento eliminado");
      setEliminando(null);
      cargar();
    } catch {
      toast("No se pudo eliminar el movimiento", "error");
    } finally {
      setBorrando(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-institucional-900">Finanzas</h1>
        {puedeEditar && (
          <button
            onClick={abrirNuevo}
            className="flex items-center gap-1.5 rounded-lg bg-institucional-600 px-4 py-2 text-sm font-semibold text-white hover:bg-institucional-700"
          >
            <Plus className="h-4 w-4" /> Nuevo movimiento
          </button>
        )}
      </div>

      <div className="mb-6 flex flex-wrap gap-3">
        <select
          value={filtroSecretaria}
          onChange={(e) => setFiltroSecretaria(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
        >
          <option value="">Todas las secretarías</option>
          {secretarias.map((s) => (
            <option key={s.id} value={s.id}>{s.nombre}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          Desde
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1 text-sm" />
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          Hasta
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1 text-sm" />
        </label>
        {(filtroSecretaria || desde || hasta) && (
          <button
            onClick={() => { setFiltroSecretaria(""); setDesde(""); setHasta(""); }}
            className="text-xs font-medium text-gray-400 hover:text-gray-600"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {data === null ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : (
          <>
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="text-2xl font-bold text-institucional-700">{fmtMoney.format(data.totales.ingresos)}</div>
              <div className="mt-1 text-sm text-gray-500">Ingresos</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="text-2xl font-bold text-red-600">{fmtMoney.format(data.totales.gastos)}</div>
              <div className="mt-1 text-sm text-gray-500">Gastos</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="text-2xl font-bold text-institucional-900">
                {fmtMoney.format(data.totales.ingresos - data.totales.gastos)}
              </div>
              <div className="mt-1 text-sm text-gray-500">Balance</div>
            </div>
          </>
        )}
      </div>

      {data === null ? (
        <TableSkeleton cols={6} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-2">Tipo</th>
                <th className="px-4 py-2">Categoría</th>
                <th className="px-4 py-2">Monto</th>
                <th className="px-4 py-2">Fecha</th>
                <th className="px-4 py-2">Secretaría</th>
                {puedeEditar && <th className="px-4 py-2 text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.gastos.map((g) => (
                <tr key={g.id}>
                  <td className="px-4 py-2">
                    <span className={g.tipo === "INGRESO" ? "text-institucional-700" : "text-red-600"}>{g.tipo}</span>
                  </td>
                  <td className="px-4 py-2">{g.categoria}</td>
                  <td className="px-4 py-2">{fmtMoney.format(Number(g.monto))}</td>
                  <td className="px-4 py-2">{new Date(g.fecha).toLocaleDateString("es-DO")}</td>
                  <td className="px-4 py-2">{g.secretaria?.nombre ?? "General"}</td>
                  {puedeEditar && (
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => abrirEditar(g)}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-institucional-700"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        {user?.role === "SUPERADMIN" && (
                          <button
                            onClick={() => setEliminando(g)}
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {data.gastos.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-400">Sin movimientos.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Drawer open={drawerAbierto} onClose={() => setDrawerAbierto(false)} title={editando ? "Editar movimiento" : "Nuevo movimiento"}>
        <form onSubmit={guardar} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <select
              value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value })}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="GASTO">Gasto</option>
              <option value="INGRESO">Ingreso</option>
            </select>
            <input
              required
              type="number"
              step="0.01"
              placeholder="Monto"
              value={form.monto}
              onChange={(e) => setForm({ ...form, monto: e.target.value })}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <select
            required
            value={form.categoria}
            onChange={(e) => setForm({ ...form, categoria: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Categoría…</option>
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {form.categoria === "Otro" && (
            <input
              required
              placeholder="Especifica la categoría"
              value={form.categoriaOtra}
              onChange={(e) => setForm({ ...form, categoriaOtra: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          )}
          <div className="grid grid-cols-2 gap-3">
            <input
              required
              type="date"
              value={form.fecha}
              onChange={(e) => setForm({ ...form, fecha: e.target.value })}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <select
              value={form.secretariaId}
              onChange={(e) => setForm({ ...form, secretariaId: e.target.value })}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">General (sin secretaría)</option>
              {secretarias.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2 pt-2">
            <button
              disabled={submitting}
              className="flex-1 rounded-lg bg-institucional-600 px-4 py-2 text-sm font-semibold text-white hover:bg-institucional-700 disabled:opacity-60"
            >
              {submitting ? "Guardando…" : editando ? "Guardar cambios" : "Registrar"}
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
        title="¿Eliminar este movimiento?"
        mensaje={`Se eliminará el registro de ${eliminando?.categoria} por ${eliminando ? fmtMoney.format(Number(eliminando.monto)) : ""}.`}
        onConfirm={confirmarEliminar}
        onCancel={() => setEliminando(null)}
        loading={borrando}
      />
    </div>
  );
}
