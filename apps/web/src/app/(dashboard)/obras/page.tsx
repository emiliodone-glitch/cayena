"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Obra = {
  id: string;
  titulo: string;
  categoria: string;
  publicada: boolean;
  provincia: { nombre: string };
  municipio: { nombre: string };
  createdAt: string;
};

export default function ObrasPage() {
  const [obras, setObras] = useState<Obra[]>([]);

  useEffect(() => {
    apiFetch<Obra[]>("/obras").then(setObras);
  }, []);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-institucional-900">Obras de gobierno</h1>
        <Link
          href="/obras/nueva"
          className="rounded-lg bg-institucional-600 px-4 py-2 text-sm font-semibold text-white hover:bg-institucional-700"
        >
          + Nueva obra
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-400">
            <tr>
              <th className="px-4 py-2">Título</th>
              <th className="px-4 py-2">Categoría</th>
              <th className="px-4 py-2">Provincia / Municipio</th>
              <th className="px-4 py-2">Estado</th>
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
              </tr>
            ))}
            {obras.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                  Sin obras registradas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
