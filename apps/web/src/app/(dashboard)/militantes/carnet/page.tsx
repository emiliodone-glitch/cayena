"use client";

import { useState, type FormEvent } from "react";
import { apiFetch, ApiError } from "@/lib/api";

type Carnet = {
  id: string;
  nombre: string;
  cedula: string;
  estado: string;
  provincia: { nombre: string };
  municipio: { nombre: string };
  createdAt: string;
};

export default function VerificarCarnetPage() {
  const [codigo, setCodigo] = useState("");
  const [resultado, setResultado] = useState<Carnet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);

  async function verificar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResultado(null);
    setBuscando(true);
    try {
      const carnet = await apiFetch<Carnet>(`/militantes/carnet/${codigo.trim()}`);
      setResultado(carnet);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo verificar el carnet");
    } finally {
      setBuscando(false);
    }
  }

  return (
    <div className="max-w-lg">
      <h1 className="mb-6 text-xl font-bold text-institucional-900">Verificar carnet digital</h1>
      <form onSubmit={verificar} className="space-y-3 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">
            Código del QR (o pégalo tras escanearlo con cualquier lector)
          </span>
          <input
            required
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="cmrttx58v0003htmztbo22e9t"
          />
        </label>
        <button
          disabled={buscando}
          className="rounded-lg bg-institucional-600 px-4 py-2 text-sm font-semibold text-white hover:bg-institucional-700 disabled:opacity-60"
        >
          {buscando ? "Verificando…" : "Verificar"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      {resultado && (
        <div className="mt-6 rounded-xl border border-institucional-600 bg-institucional-50 p-6 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-institucional-600" />
            <span className="text-xs font-semibold uppercase text-institucional-700">Carnet válido</span>
          </div>
          <div className="text-lg font-bold text-institucional-900">{resultado.nombre}</div>
          <div className="mt-1 text-sm text-gray-600">Cédula: {resultado.cedula}</div>
          <div className="text-sm text-gray-600">
            {resultado.municipio.nombre}, {resultado.provincia.nombre}
          </div>
          <div className="mt-2 text-xs text-gray-400">
            Militante desde {new Date(resultado.createdAt).toLocaleDateString("es-DO")}
          </div>
        </div>
      )}
    </div>
  );
}
