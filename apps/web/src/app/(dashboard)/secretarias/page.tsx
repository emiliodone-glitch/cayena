"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Pencil, Plus } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { Drawer } from "@/components/Drawer";
import { CardSkeleton } from "@/components/Skeleton";

type Secretaria = { id: string; nombre: string; descripcion: string | null };

export default function SecretariasPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [secretarias, setSecretarias] = useState<Secretaria[] | null>(null);
  const [drawerAbierto, setDrawerAbierto] = useState(false);
  const [editando, setEditando] = useState<Secretaria | null>(null);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function cargar() {
    apiFetch<Secretaria[]>("/secretarias").then(setSecretarias);
  }

  useEffect(cargar, []);

  function abrirNueva() {
    setEditando(null);
    setNombre("");
    setDescripcion("");
    setDrawerAbierto(true);
  }

  function abrirEditar(s: Secretaria) {
    setEditando(s);
    setNombre(s.nombre);
    setDescripcion(s.descripcion ?? "");
    setDrawerAbierto(true);
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editando) {
        await apiFetch(`/secretarias/${editando.id}`, {
          method: "PATCH",
          body: JSON.stringify({ nombre, descripcion }),
        });
        toast("Secretaría actualizada");
      } else {
        await apiFetch("/secretarias", { method: "POST", body: JSON.stringify({ nombre, descripcion }) });
        toast("Secretaría creada");
      }
      setDrawerAbierto(false);
      cargar();
    } catch {
      toast("No se pudo guardar la secretaría", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-institucional-900">Secretarías</h1>
        {user?.role === "SUPERADMIN" && (
          <button
            onClick={abrirNueva}
            className="flex items-center gap-1.5 rounded-lg bg-institucional-600 px-4 py-2 text-sm font-semibold text-white hover:bg-institucional-700"
          >
            <Plus className="h-4 w-4" /> Nueva secretaría
          </button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {secretarias === null &&
          Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
        {secretarias?.map((s) => (
          <div key={s.id} className="relative rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            {user?.role === "SUPERADMIN" && (
              <button
                onClick={() => abrirEditar(s)}
                className="absolute right-3 top-3 rounded-lg p-1.5 text-gray-300 hover:bg-gray-100 hover:text-institucional-700"
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
            <div className="font-semibold text-institucional-900">{s.nombre}</div>
            <div className="mt-1 text-sm text-gray-500">{s.descripcion ?? "Sin descripción"}</div>
          </div>
        ))}
      </div>

      <Drawer open={drawerAbierto} onClose={() => setDrawerAbierto(false)} title={editando ? "Editar secretaría" : "Nueva secretaría"}>
        <form onSubmit={guardar} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Nombre</span>
            <input
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Descripción</span>
            <input
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <div className="flex gap-2 pt-2">
            <button
              disabled={submitting}
              className="flex-1 rounded-lg bg-institucional-600 px-4 py-2 text-sm font-semibold text-white hover:bg-institucional-700 disabled:opacity-60"
            >
              {submitting ? "Guardando…" : editando ? "Guardar cambios" : "Crear"}
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
    </div>
  );
}
