"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Secretaria = { id: string; nombre: string; descripcion: string | null };

export default function SecretariasPage() {
  const { user } = useAuth();
  const [secretarias, setSecretarias] = useState<Secretaria[]>([]);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");

  function cargar() {
    apiFetch<Secretaria[]>("/secretarias").then(setSecretarias);
  }

  useEffect(cargar, []);

  async function crear(e: FormEvent) {
    e.preventDefault();
    await apiFetch("/secretarias", { method: "POST", body: JSON.stringify({ nombre, descripcion }) });
    setNombre("");
    setDescripcion("");
    cargar();
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-institucional-900">Secretarías</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {secretarias.map((s) => (
          <div key={s.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="font-semibold text-institucional-900">{s.nombre}</div>
            <div className="mt-1 text-sm text-gray-500">{s.descripcion ?? "Sin descripción"}</div>
          </div>
        ))}
      </div>

      {user?.role === "SUPERADMIN" && (
        <form onSubmit={crear} className="mt-8 max-w-md space-y-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700">Nueva secretaría</h2>
          <input
            required
            placeholder="Nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="Descripción"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <button className="rounded-lg bg-institucional-600 px-4 py-2 text-sm font-semibold text-white hover:bg-institucional-700">
            Crear
          </button>
        </form>
      )}
    </div>
  );
}
