"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2, ImageDown } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { Drawer } from "@/components/Drawer";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { TableSkeleton } from "@/components/Skeleton";
import { ObraForm, type ObraExistente } from "@/components/forms/ObraForm";
import { generarTarjetaObra, descargarBlob } from "@/lib/tarjetaObra";

type Obra = ObraExistente & {
  provincia: { nombre: string };
  municipio: { nombre: string };
  createdAt: string;
};

type Lista = { id: string; nombre: string }[];

const CATEGORIAS = ["EDUCACION", "SALUD", "VIALIDAD", "VIVIENDA", "DEPORTE", "AGUA_SANEAMIENTO", "ELECTRICIDAD", "SEGURIDAD", "OTRA"];

const fmtMoney = new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP", maximumFractionDigits: 0 });

// Últimos años + el actual, para no obligar a escribir un número a mano.
const ANIO_ACTUAL = new Date().getFullYear();
const ANIOS = Array.from({ length: 8 }, (_, i) => ANIO_ACTUAL - i);

export default function ObrasPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [obras, setObras] = useState<Obra[] | null>(null);
  const [provincias, setProvincias] = useState<Lista>([]);
  const [q, setQ] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState("");
  const [provinciaFiltro, setProvinciaFiltro] = useState("");
  const [anioFiltro, setAnioFiltro] = useState("");
  const [drawerAbierto, setDrawerAbierto] = useState(false);
  const [editando, setEditando] = useState<Obra | undefined>(undefined);
  const [eliminando, setEliminando] = useState<Obra | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [generandoTarjeta, setGenerandoTarjeta] = useState<string | null>(null);

  function cargar() {
    const params = new URLSearchParams();
    if (categoriaFiltro) params.set("categoria", categoriaFiltro);
    if (provinciaFiltro) params.set("provinciaId", provinciaFiltro);
    if (anioFiltro) params.set("anio", anioFiltro);
    const qs = params.toString();
    apiFetch<Obra[]>(`/obras${qs ? `?${qs}` : ""}`).then(setObras);
  }

  useEffect(cargar, [categoriaFiltro, provinciaFiltro, anioFiltro]);
  useEffect(() => {
    apiFetch<Lista>("/geo/lista/provincias").then(setProvincias).catch(() => setProvincias([]));
  }, []);

  async function generarTarjeta(o: Obra) {
    setGenerandoTarjeta(o.id);
    try {
      const blob = await generarTarjetaObra(o);
      descargarBlob(blob, `obra-${o.titulo.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`);
    } catch {
      toast("No se pudo generar la tarjeta", "error");
    } finally {
      setGenerandoTarjeta(null);
    }
  }

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

  async function togglePublicar(o: Obra) {
    try {
      await apiFetch(`/obras/${o.id}`, { method: "PATCH", body: JSON.stringify({ publicada: !o.publicada }) });
      toast(o.publicada ? "Obra despublicada" : "Obra publicada en la app");
      cargar();
    } catch {
      toast("No se pudo cambiar el estado de la obra", "error");
    }
  }

  const puedeEditar = user?.role !== "AUDITOR";
  const obrasVisibles = obras?.filter((o) => o.titulo.toLowerCase().includes(q.trim().toLowerCase())) ?? [];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-institucional-900">Obras de gobierno</h1>
        <div className="flex items-center gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por título…"
            className="w-64 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-institucional-600 focus:outline-none"
          />
          {puedeEditar && (
            <button
              onClick={abrirNueva}
              className="flex items-center gap-1.5 rounded-lg bg-institucional-600 px-4 py-2 text-sm font-semibold text-white hover:bg-institucional-700"
            >
              <Plus className="h-4 w-4" /> Nueva obra
            </button>
          )}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={categoriaFiltro}
          onChange={(e) => setCategoriaFiltro(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-institucional-600 focus:outline-none"
        >
          <option value="">Todas las categorías</option>
          {CATEGORIAS.map((c) => (
            <option key={c} value={c}>{c.toLowerCase().replace("_", " ")}</option>
          ))}
        </select>
        <select
          value={provinciaFiltro}
          onChange={(e) => setProvinciaFiltro(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-institucional-600 focus:outline-none"
        >
          <option value="">Todas las provincias</option>
          {provincias.map((p) => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </select>
        <select
          value={anioFiltro}
          onChange={(e) => setAnioFiltro(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-institucional-600 focus:outline-none"
        >
          <option value="">Todos los años</option>
          {ANIOS.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        {(categoriaFiltro || provinciaFiltro || anioFiltro) && (
          <button
            onClick={() => {
              setCategoriaFiltro("");
              setProvinciaFiltro("");
              setAnioFiltro("");
            }}
            className="text-xs font-medium text-institucional-600 hover:underline"
          >
            Limpiar filtros
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
                <th className="px-4 py-2">Inauguración</th>
                <th className="px-4 py-2">Inversión</th>
                <th className="px-4 py-2">Estado</th>
                {puedeEditar && <th className="px-4 py-2 text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {obrasVisibles.map((o) => (
                <tr key={o.id}>
                  <td className="px-4 py-2 font-medium">{o.titulo}</td>
                  <td className="px-4 py-2 capitalize">{o.categoria.toLowerCase().replace("_", " ")}</td>
                  <td className="px-4 py-2">
                    {o.provincia.nombre} / {o.municipio.nombre}
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${o.lat},${o.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1.5 text-xs text-institucional-600 hover:underline"
                    >
                      Cómo llegar
                    </a>
                  </td>
                  <td className="px-4 py-2 text-gray-500">
                    {o.fechaInauguracion ? new Date(o.fechaInauguracion).toLocaleDateString("es-DO") : "—"}
                  </td>
                  <td className="px-4 py-2 text-gray-500">
                    {o.inversion != null ? fmtMoney.format(Number(o.inversion)) : "—"}
                  </td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => togglePublicar(o)}
                      disabled={!puedeEditar}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        o.publicada ? "bg-institucional-100 text-institucional-700" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {o.publicada ? "Publicada" : "Borrador"}
                    </button>
                  </td>
                  {puedeEditar && (
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => generarTarjeta(o)}
                          disabled={generandoTarjeta === o.id}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-institucional-700 disabled:opacity-50"
                          title="Generar tarjeta para redes sociales"
                        >
                          <ImageDown className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => abrirEditar(o)}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-institucional-700"
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        {user?.role === "SUPERADMIN" && (
                          <button
                            onClick={() => setEliminando(o)}
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                            title="Eliminar"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {obrasVisibles.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
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
