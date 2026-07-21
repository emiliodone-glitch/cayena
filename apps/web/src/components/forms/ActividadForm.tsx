"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { FotoUploader } from "@/components/FotoUploader";
import { useAuth } from "@/lib/auth";

type Secretaria = { id: string; nombre: string };

export type ActividadExistente = {
  id: string;
  titulo: string;
  descripcion: string | null;
  fecha: string;
  ubicacion: string | null;
  secretariaId: string;
  publicadaApp: boolean;
  fotos: string[];
};

function aDatetimeLocal(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ActividadForm({
  actividad,
  onSaved,
  onCancel,
}: {
  actividad?: ActividadExistente;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const { user } = useAuth();
  const [secretarias, setSecretarias] = useState<Secretaria[]>([]);
  const [form, setForm] = useState({
    titulo: actividad?.titulo ?? "",
    descripcion: actividad?.descripcion ?? "",
    fecha: actividad ? aDatetimeLocal(actividad.fecha) : "",
    ubicacion: actividad?.ubicacion ?? "",
    secretariaId: actividad?.secretariaId ?? user?.secretariaId ?? "",
    publicadaApp: actividad?.publicadaApp ?? false,
  });
  const [fotos, setFotos] = useState<string[]>(actividad?.fotos ?? []);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch<Secretaria[]>("/secretarias").then(setSecretarias);
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const body = { ...form, fotos };
      if (actividad) {
        await apiFetch(`/actividades/${actividad.id}`, { method: "PATCH", body: JSON.stringify(body) });
        toast("Actividad actualizada");
      } else {
        await apiFetch("/actividades", { method: "POST", body: JSON.stringify(body) });
        toast("Actividad creada");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar la actividad");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">Título</span>
        <input
          required
          className="input"
          value={form.titulo}
          onChange={(e) => setForm({ ...form, titulo: e.target.value })}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">Descripción</span>
        <textarea
          className="input"
          value={form.descripcion}
          onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Fecha</span>
          <input
            required
            type="datetime-local"
            className="input"
            value={form.fecha}
            onChange={(e) => setForm({ ...form, fecha: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Ubicación</span>
          <input
            className="input"
            value={form.ubicacion}
            onChange={(e) => setForm({ ...form, ubicacion: e.target.value })}
          />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">Secretaría responsable</span>
        <select
          required
          className="input"
          value={form.secretariaId}
          onChange={(e) => setForm({ ...form, secretariaId: e.target.value })}
        >
          <option value="">Seleccionar…</option>
          {secretarias.map((s) => (
            <option key={s.id} value={s.id}>{s.nombre}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">Fotos</span>
        <FotoUploader fotos={fotos} onChange={setFotos} />
      </label>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={form.publicadaApp}
          onChange={(e) => setForm({ ...form, publicadaApp: e.target.checked })}
        />
        Publicar en la app móvil
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 rounded-lg bg-institucional-600 px-5 py-2 text-sm font-semibold text-white hover:bg-institucional-700 disabled:opacity-60"
        >
          {submitting ? "Guardando…" : actividad ? "Guardar cambios" : "Crear actividad"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          Cancelar
        </button>
      </div>

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
    </form>
  );
}
