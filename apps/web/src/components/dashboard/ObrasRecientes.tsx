"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ImageOff } from "lucide-react";
import { apiFetch, resolveFileUrl } from "@/lib/api";

type Obra = {
  id: string;
  titulo: string;
  categoria: string;
  fotos: string[];
  provincia: { nombre: string };
  municipio: { nombre: string };
};

export function ObrasRecientes() {
  const [obras, setObras] = useState<Obra[] | null>(null);

  useEffect(() => {
    apiFetch<Obra[]>("/obras/publicas")
      .then((data) => setObras(data.slice(0, 3)))
      .catch(() => setObras([]));
  }, []);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Últimas obras publicadas</h3>
        <Link href="/obras" className="flex items-center gap-1 text-xs font-medium text-institucional-700 hover:underline">
          Ver todas <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {obras?.map((o) => (
          <div key={o.id} className="overflow-hidden rounded-lg border border-gray-100">
            {o.fotos[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={resolveFileUrl(o.fotos[0])} alt="" className="h-24 w-full object-cover" />
            ) : (
              <div className="flex h-24 w-full items-center justify-center bg-institucional-50 text-institucional-300">
                <ImageOff className="h-6 w-6" />
              </div>
            )}
            <div className="p-2">
              <div className="truncate text-xs font-semibold text-institucional-900">{o.titulo}</div>
              <div className="truncate text-[11px] text-gray-400">{o.municipio.nombre}, {o.provincia.nombre}</div>
            </div>
          </div>
        ))}
        {obras?.length === 0 && <p className="text-xs text-gray-400">Aún no hay obras publicadas.</p>}
      </div>
    </div>
  );
}
