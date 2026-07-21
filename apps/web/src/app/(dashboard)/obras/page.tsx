"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { Drawer } from "@/components/Drawer";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { TableSkeleton } from "@/components/Skeleton";
import { ObraForm, type ObraExistente } from "@/components/forms/ObraForm";

type Obra = ObraExistente & {
  provincia: { nombre: string };
  municipio: { nombre: string };
  createdAt: string;
};

export default function ObrasPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [obras, setObras] = useState<Obra[] | null>(null);
  const [drawerAbierto, setDrawerAbierto] = useState(false);
  const [editando, setEditando] = useState<Obra | undefined>(undefined);
  const [eliminando, setEliminando] = useState<Obra | null>(null);
  const [borrando, setBorrando] = useState(false);

  function cargar() {
    apiFetch<Obra[]>("/obras").then(setObras);
  }

  useEffect(cargar, []);

  function abrirNueva() {
    setEditando(undefined);
    setDrawerAbierto(true);
  }

  function abrirEditar(o: Obra) {
    setEditando(o);
    setDrawerAbierto(true);
  }

  function onSaved() {
    setDrawerAbierto(false);
    cargar();
  }

  async function confirmarEliminar() {
    if (!eliminando) return;
    setBorrando(true);
    try {
      await apiFetch(`/obras/${eliminando.id}`, { method: "DELETE" });
      toast("Obra eliminada");
      setEliminando(null);
      cargar();
    } catch {
      toast("No se pudo eliminar la obra", "error");
    } finally {
      setBorrando(false);
    }
  }

  const puedeEditar = user?.role !== "AUDITOR";

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-institucional-900">Obras de gobierno</h1>
        {puedeEditar && (
          <button
            onClick={abrirNueva}
            className="flex items-center gap-1.5 rounded-lg bg-institucional-600 px-4 py-2 text-sm font-semibold text-white hover:bg-institucional-700"
          >
            <Plus className="h-4 w-4" /> Nueva obra
          </button>
        )}
      </div>

      {obras === null ? (
        <TableSkeleton cols={5} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-2">Título</th>
                <th className="px-4 py-2">Categoría</th>
                <th className="px-4 py-2">Provincia / Municipio</th>
                <th className="px-4 py-2">Estado</th>
                {puedeEditar && <th className="px-4 py-2 text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {obras.map((o) => (
                <tr key={o.id}>
                  <td className="px-4 py-2 font-medium">{o.titulo}</td>
                  <td className="px-4 py-2 capitalize">{o.categoria.toLowerCase().replace("_", " ")}</td>
                  <td className="px-4 py-2">{o.provincia.nombre} / {o.municipio.nombre}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        o.publicada ? "bg-institucional-100 text-institucional-700" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {o.publicada ? "Publicada" : "Borrador"}
                    </span>
                  </td>
                  {puedeEditar && (
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => abrirEditar(o)}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-institucional-700"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        {user?.role === "SUPERADMIN" && (
                          <button
                            onClick={() => setEliminando(o)}
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
              {obras.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                    Sin obras registradas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Drawer open={drawerAbierto} onClose={() => setDrawerAbierto(false)} title={editando ? "Editar obra" : "Nueva obra de gobierno"}>
        <ObraForm obra={editando} onSaved={onSaved} onCancel={() => setDrawerAbierto(false)} />
      </Drawer>

      <ConfirmDialog
        open={!!eliminando}
        title="¿Eliminar esta obra?"
        mensaje={`"${eliminando?.titulo}" se eliminará permanentemente y dejará de verse en la app.`}
        onConfirm={confirmarEliminar}
        onCancel={() => setEliminando(null)}
        loading={borrando}
      />
    </div>
  );
}
