"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, FileText } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { Drawer } from "@/components/Drawer";
import { TableSkeleton } from "@/components/Skeleton";

type Secretaria = { id: string; nombre: string; descripcion: string | null };

type Actividad = { id: string; titulo: string; fecha: string; ubicacion: string | null };

type Documento = { id: string; titulo: string; url: string; createdAt: string };

type Historial = { actividades: Actividad[]; documentos: Documento[] };

export default function SecretariaDetallePage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { user } = useAuth();
  const toast = useToast();
  const puedeGestionar = user?.role === "SUPERADMIN" || user?.secretariaId === id;

  const [secretaria, setSecretaria] = useState<Secretaria | null>(null);
  const [tab, setTab] = useState<"historial" | "documentos">("historial");
  const [historial, setHistorial] = useState<Historial | null>(null);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const [drawerAbierto, setDrawerAbierto] = useState(false);
  const [docTitulo, setDocTitulo] = useState("");
  const [docUrl, setDocUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Secretaria>(`/secretarias/${id}`).then(setSecretaria).catch(() => setSecretaria(null));
  }, [id]);

  function cargarHistorial() {
    const params = new URLSearchParams();
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);
    apiFetch<Historial>(`/secretarias/${id}/historial?${params.toString()}`)
      .then(setHistorial)
      .catch(() => setHistorial({ actividades: [], documentos: [] }));
  }

  useEffect(cargarHistorial, [id, desde, hasta]);

  async function agregarDocumento(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch(`/secretarias/${id}/documentos`, {
        method: "POST",
        body: JSON.stringify({ titulo: docTitulo, url: docUrl }),
      });
      toast("Documento agregado");
      setDocTitulo("");
      setDocUrl("");
      setDrawerAbierto(false);
      cargarHistorial();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo agregar el documento");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <Link href="/secretarias" className="mb-4 flex items-center gap-1.5 text-sm text-gray-500 hover:text-institucional-700">
        <ArrowLeft className="h-4 w-4" /> Volver a secretarías
      </Link>

      <h1 className="text-xl font-bold text-institucional-900">{secretaria?.nombre ?? "Cargando…"}</h1>
      {secretaria?.descripcion && <p className="mt-1 text-sm text-gray-500">{secretaria.descripcion}</p>}

      <div className="mb-6 mt-4 flex rounded-lg border border-gray-200 bg-white p-1 text-sm w-fit">
        <button
          onClick={() => setTab("historial")}
          className={`rounded-md px-3 py-1 ${tab === "historial" ? "bg-institucional-600 text-white" : "text-gray-500"}`}
        >
          Historial de actividades
        </button>
        <button
          onClick={() => setTab("documentos")}
          className={`rounded-md px-3 py-1 ${tab === "documentos" ? "bg-institucional-600 text-white" : "text-gray-500"}`}
        >
          Documentos
        </button>
      </div>

      {tab === "historial" && (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              Desde
              <input
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              Hasta
              <input
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
              />
            </label>
            {(desde || hasta) && (
              <button
                onClick={() => { setDesde(""); setHasta(""); }}
                className="text-xs font-medium text-gray-400 hover:text-gray-600"
              >
                Limpiar filtro
              </button>
            )}
          </div>

          {historial === null ? (
            <TableSkeleton cols={3} />
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-400">
                  <tr>
                    <th className="px-4 py-2">Título</th>
                    <th className="px-4 py-2">Fecha</th>
                    <th className="px-4 py-2">Ubicación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {historial.actividades.map((a) => (
                    <tr key={a.id}>
                      <td className="px-4 py-2 font-medium">{a.titulo}</td>
                      <td className="px-4 py-2">{new Date(a.fecha).toLocaleString("es-DO")}</td>
                      <td className="px-4 py-2 text-gray-500">{a.ubicacion ?? "—"}</td>
                    </tr>
                  ))}
                  {historial.actividades.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-6 text-center text-gray-400">
                        Sin actividades en este rango.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "documentos" && (
        <div>
          {puedeGestionar && (
            <div className="mb-4 flex justify-end">
              <button
                onClick={() => setDrawerAbierto(true)}
                className="flex items-center gap-1.5 rounded-lg bg-institucional-600 px-4 py-2 text-sm font-semibold text-white hover:bg-institucional-700"
              >
                <Plus className="h-4 w-4" /> Agregar documento
              </button>
            </div>
          )}

          {historial === null ? (
            <TableSkeleton cols={2} />
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-400">
                  <tr>
                    <th className="px-4 py-2">Documento</th>
                    <th className="px-4 py-2">Agregado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {historial.documentos.map((d) => (
                    <tr key={d.id}>
                      <td className="px-4 py-2">
                        <a
                          href={d.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 font-medium text-institucional-700 hover:underline"
                        >
                          <FileText className="h-4 w-4" /> {d.titulo}
                        </a>
                      </td>
                      <td className="px-4 py-2 text-gray-400">{new Date(d.createdAt).toLocaleDateString("es-DO")}</td>
                    </tr>
                  ))}
                  {historial.documentos.length === 0 && (
                    <tr>
                      <td colSpan={2} className="px-4 py-6 text-center text-gray-400">
                        Sin documentos registrados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Drawer open={drawerAbierto} onClose={() => setDrawerAbierto(false)} title="Agregar documento">
        <form onSubmit={agregarDocumento} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Título</span>
            <input
              required
              value={docTitulo}
              onChange={(e) => setDocTitulo(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Enlace del documento</span>
            <input
              required
              type="url"
              placeholder="https://…"
              value={docUrl}
              onChange={(e) => setDocUrl(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2 pt-2">
            <button
              disabled={submitting}
              className="flex-1 rounded-lg bg-institucional-600 px-4 py-2 text-sm font-semibold text-white hover:bg-institucional-700 disabled:opacity-60"
            >
              {submitting ? "Guardando…" : "Agregar"}
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
