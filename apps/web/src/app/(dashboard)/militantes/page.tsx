"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

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
  createdAt: string;
};

export default function MilitantesPage() {
  const [militantes, setMilitantes] = useState<MilitanteRow[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    const params = q ? `?q=${encodeURIComponent(q)}` : "";
    apiFetch<MilitanteRow[]>(`/militantes${params}`).then(setMilitantes).catch(() => setMilitantes([]));
  }, [q]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-institucional-900">Militantes por provincia</h1>
        <div className="flex gap-2">
          <Link
            href="/militantes/carnet"
            className="rounded-lg border border-institucional-600 px-4 py-2 text-sm font-semibold text-institucional-700 hover:bg-institucional-50"
          >
            Verificar carnet
          </Link>
          <Link
            href="/militantes/nuevo"
            className="rounded-lg bg-institucional-600 px-4 py-2 text-sm font-semibold text-white hover:bg-institucional-700"
          >
            + Registrar militante
          </Link>
        </div>
      </div>

      <MapaMilitantes />

      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Padrón de militantes</h2>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, cédula o teléfono…"
            className="w-72 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-institucional-600 focus:outline-none"
          />
        </div>
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-2">Nombre</th>
                <th className="px-4 py-2">Cédula</th>
                <th className="px-4 py-2">Teléfono</th>
                <th className="px-4 py-2">Provincia</th>
                <th className="px-4 py-2">Municipio</th>
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
                  <td className="px-4 py-2 text-gray-400">
                    {new Date(m.createdAt).toLocaleDateString("es-DO")}
                  </td>
                </tr>
              ))}
              {militantes.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                    Sin resultados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
