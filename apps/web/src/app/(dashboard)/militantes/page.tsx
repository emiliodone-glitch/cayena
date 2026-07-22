"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus, Upload } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Drawer } from "@/components/Drawer";
import { TableSkeleton } from "@/components/Skeleton";
import { MilitanteForm } from "@/components/forms/MilitanteForm";
import { MetasEditor } from "@/components/MetasEditor";
import { ImportarMilitantesCSV } from "@/components/ImportarMilitantesCSV";
import { DistritosMunicipales } from "@/components/DistritosMunicipales";
import type { DemarcacionSeleccionada } from "@/components/MapaMilitantes";

const MapaMilitantes = dynamic(
  () => import("@/components/MapaMilitantes").then((m) => m.MapaMilitantes),
  { ssr: false, loading: () => <div className="h-[520px] animate-pulse rounded-xl bg-gray-100" /> },
);

type MilitanteRow = {
  id: string;
  nombre: string;
  cedula: string;
  telefono: string | null;
  provincia: { nombre: string };
  municipio: { nombre: string };
  localidad: { nombre: string } | null;
  recintoElectoral: { nombre: string } | null;
  colegio: { numero: string } | null;
  createdAt: string;
};

export default function MilitantesPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"mapa" | "metas" | "distritos">("mapa");
  const [militantes, setMilitantes] = useState<MilitanteRow[] | null>(null);
  const [q, setQ] = useState("");
  const [demarcacion, setDemarcacion] = useState<DemarcacionSeleccionada | null>(null);
  const [drawerAbierto, setDrawerAbierto] = useState(false);
  const [importarAbierto, setImportarAbierto] = useState(false);
  // Fuerza al mapa a refrescar sus conteos/colores tras registrar o importar
  // militantes, sin perder el nivel de zoom/demarcación en el que está el mapa.
  const [refreshMapa, setRefreshMapa] = useState(0);

  function cargar() {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (demarcacion) {
      if (demarcacion.tipo === "provincia") params.set("provinciaId", demarcacion.id);
      else if (demarcacion.tipo === "municipio") params.set("municipioId", demarcacion.id);
      else if (demarcacion.tipo === "distrito") params.set("distritoMunicipalId", demarcacion.id);
      else {
        params.set("municipioId", demarcacion.id);
        params.set("sinDistritoMunicipal", "true");
      }
    }
    const qs = params.toString();
    apiFetch<MilitanteRow[]>(`/militantes${qs ? `?${qs}` : ""}`).then(setMilitantes).catch(() => setMilitantes([]));
  }

  function recargarTodo() {
    cargar();
    setRefreshMapa((t) => t + 1);
  }

  useEffect(cargar, [q, demarcacion?.tipo, demarcacion?.id]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-institucional-900">Militantes</h1>
        <div className="flex items-center gap-2">
          {user?.role === "SUPERADMIN" && (
            <div className="flex rounded-lg border border-gray-200 bg-white p-1 text-sm">
              <button
                onClick={() => setTab("mapa")}
                className={`rounded-md px-3 py-1 ${tab === "mapa" ? "bg-institucional-600 text-white" : "text-gray-500"}`}
              >
                Mapa
              </button>
              <button
                onClick={() => setTab("metas")}
                className={`rounded-md px-3 py-1 ${tab === "metas" ? "bg-institucional-600 text-white" : "text-gray-500"}`}
              >
                Definir metas
              </button>
              <button
                onClick={() => setTab("distritos")}
                className={`rounded-md px-3 py-1 ${tab === "distritos" ? "bg-institucional-600 text-white" : "text-gray-500"}`}
              >
                Distritos municipales
              </button>
            </div>
          )}
          <Link
            href="/militantes/carnet"
            className="rounded-lg border border-institucional-600 px-4 py-2 text-sm font-semibold text-institucional-700 hover:bg-institucional-50"
          >
            Verificar carnet
          </Link>
          {user?.role !== "AUDITOR" && (
            <>
              <button
                onClick={() => setImportarAbierto(true)}
                className="flex items-center gap-1.5 rounded-lg border border-institucional-600 px-4 py-2 text-sm font-semibold text-institucional-700 hover:bg-institucional-50"
              >
                <Upload className="h-4 w-4" /> Importar CSV
              </button>
              <button
                onClick={() => setDrawerAbierto(true)}
                className="flex items-center gap-1.5 rounded-lg bg-institucional-600 px-4 py-2 text-sm font-semibold text-white hover:bg-institucional-700"
              >
                <Plus className="h-4 w-4" /> Registrar militante
              </button>
            </>
          )}
        </div>
      </div>

      {tab === "metas" ? (
        <MetasEditor />
      ) : tab === "distritos" ? (
        <DistritosMunicipales />
      ) : (
        <>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mx-auto max-w-[1100px]">
              <MapaMilitantes
                compacto
                aspecto="aspect-[1000/850]"
                onDemarcacionChange={setDemarcacion}
                refreshToken={refreshMapa}
              />
            </div>
          </div>

          <div className="mt-8">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-gray-700">Padrón de militantes</h2>
                {demarcacion && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-institucional-50 px-2.5 py-1 text-xs font-medium text-institucional-700">
                    {demarcacion.nombre}
                    <button
                      onClick={() => setDemarcacion(null)}
                      className="text-institucional-400 hover:text-institucional-700"
                      aria-label="Quitar filtro de demarcación"
                    >
                      ×
                    </button>
                  </span>
                )}
              </div>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por nombre, cédula o teléfono…"
                className="w-72 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-institucional-600 focus:outline-none"
              />
            </div>
            {demarcacion && (
              <p className="mb-2 text-xs text-gray-400">
                Mostrando el padrón de <span className="font-medium text-gray-600">{demarcacion.nombre}</span> —
                pasa el cursor sobre otra demarcación del mapa para cambiarlo.
              </p>
            )}
            {militantes === null ? (
              <TableSkeleton cols={8} />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-400">
                    <tr>
                      <th className="px-4 py-2">Nombre</th>
                      <th className="px-4 py-2">Cédula</th>
                      <th className="px-4 py-2">Teléfono</th>
                      <th className="px-4 py-2">Provincia</th>
                      <th className="px-4 py-2">Municipio</th>
                      <th className="px-4 py-2">Localidad</th>
                      <th className="px-4 py-2">Recinto / Mesa</th>
                      <th className="px-4 py-2">Registrado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {militantes.map((m) => (
                      <tr key={m.id}>
                        <td className="px-4 py-2">{m.nombre}</td>
                        <td className="px-4 py-2">{m.cedula}</td>
                        <td className="px-4 py-2">{m.telefono ?? "—"}</td>
                        <td className="px-4 py-2">{m.provincia.nombre}</td>
                        <td className="px-4 py-2">{m.municipio.nombre}</td>
                        <td className="px-4 py-2">{m.localidad?.nombre ?? "—"}</td>
                        <td className="px-4 py-2">
                          {m.recintoElectoral
                            ? `${m.recintoElectoral.nombre}${m.colegio ? ` · Mesa ${m.colegio.numero}` : ""}`
                            : "—"}
                        </td>
                        <td className="px-4 py-2 text-gray-400">
                          {new Date(m.createdAt).toLocaleDateString("es-DO")}
                        </td>
                      </tr>
                    ))}
                    {militantes.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-6 text-center text-gray-400">
                          Sin resultados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <Drawer open={drawerAbierto} onClose={() => setDrawerAbierto(false)} title="Registrar militante">
        <MilitanteForm
          onSaved={() => {
            setDrawerAbierto(false);
            recargarTodo();
          }}
          onCancel={() => setDrawerAbierto(false)}
        />
      </Drawer>

      <Drawer open={importarAbierto} onClose={() => setImportarAbierto(false)} title="Importar militantes (CSV)">
        <ImportarMilitantesCSV onImportado={recargarTodo} />
      </Drawer>
    </div>
  );
}
