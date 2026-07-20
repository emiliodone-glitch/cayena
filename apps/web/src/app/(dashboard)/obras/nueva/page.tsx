"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { FotoUploader } from "@/components/FotoUploader";

type Lista = { id: string; nombre: string }[];

const CATEGORIAS = [
  "EDUCACION",
  "SALUD",
  "VIALIDAD",
  "VIVIENDA",
  "DEPORTE",
  "AGUA_SANEAMIENTO",
  "ELECTRICIDAD",
  "SEGURIDAD",
  "OTRA",
];

export default function NuevaObraPage() {
  const router = useRouter();
  const [provincias, setProvincias] = useState<Lista>([]);
  const [municipios, setMunicipios] = useState<Lista>([]);
  const [form, setForm] = useState({
    titulo: "",
    resena: "",
    categoria: "EDUCACION",
    provinciaId: "",
    municipioId: "",
    lat: "18.4861",
    lng: "-69.9312",
    publicada: false,
  });
  const [fotos, setFotos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch<Lista>("/geo/lista/provincias").then(setProvincias);
  }, []);

  useEffect(() => {
    if (!form.provinciaId) return setMunicipios([]);
    apiFetch<Lista>(`/geo/lista/municipios?provinciaId=${form.provinciaId}`).then(setMunicipios);
  }, [form.provinciaId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch("/obras", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          lat: Number(form.lat),
          lng: Number(form.lng),
          fotos,
        }),
      });
      router.push("/obras");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar la obra");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="mb-6 text-xl font-bold text-institucional-900">Nueva obra de gobierno</h1>
      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Título</span>
          <input required className="input" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Reseña breve</span>
          <textarea required className="input" value={form.resena} onChange={(e) => setForm({ ...form, resena: e.target.value })} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Categoría</span>
          <select className="input" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>{c.toLowerCase().replace("_", " ")}</option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Provincia</span>
            <select
              required
              className="input"
              value={form.provinciaId}
              onChange={(e) => setForm({ ...form, provinciaId: e.target.value, municipioId: "" })}
            >
              <option value="">Seleccionar…</option>
              {provincias.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Municipio</span>
            <select
              required
              className="input"
              disabled={!form.provinciaId}
              value={form.municipioId}
              onChange={(e) => setForm({ ...form, municipioId: e.target.value })}
            >
              <option value="">Seleccionar…</option>
              {municipios.map((m) => (
                <option key={m.id} value={m.id}>{m.nombre}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Latitud</span>
            <input required className="input" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Longitud</span>
            <input required className="input" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Fotos</span>
          <FotoUploader fotos={fotos} onChange={setFotos} />
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={form.publicada}
            onChange={(e) => setForm({ ...form, publicada: e.target.checked })}
          />
          Publicar de inmediato en la app móvil
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-institucional-600 px-5 py-2 text-sm font-semibold text-white hover:bg-institucional-700 disabled:opacity-60"
        >
          {submitting ? "Guardando…" : "Guardar"}
        </button>
      </form>

      <style jsx global>{`
        .input {
          width: 100%;
          border: 1px solid #d1d5db;
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
        }
        .input:focus {
          outline: none;
          border-color: #1f7a34;
        }
      `}</style>
    </div>
  );
}
