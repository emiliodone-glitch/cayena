"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, Plus, Check, X } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { useToast } from "@/components/Toast";

type Lista = { id: string; nombre: string }[];
type Recinto = { id: string; nombre: string; direccion: string | null };
type Colegio = { id: string; numero: string };
type Duplicado = { id: string; nombre: string; cedula: string; telefono: string | null };

export type MilitanteAEditar = {
  id: string;
  nombre: string;
  cedula: string;
  telefono: string | null;
  direccion: string | null;
  provinciaId: string;
  municipioId: string;
  distritoMunicipalId: string | null;
  localidadId: string | null;
  recintoElectoralId: string | null;
  colegioId: string | null;
};

function formDesdeMilitante(m?: MilitanteAEditar) {
  return {
    nombre: m?.nombre ?? "",
    cedula: m?.cedula ?? "",
    telefono: m?.telefono ?? "",
    direccion: m?.direccion ?? "",
    provinciaId: m?.provinciaId ?? "",
    municipioId: m?.municipioId ?? "",
    distritoMunicipalId: m?.distritoMunicipalId ?? "",
    localidadId: m?.localidadId ?? "",
    recintoElectoralId: m?.recintoElectoralId ?? "",
    colegioId: m?.colegioId ?? "",
  };
}

export function MilitanteForm({
  militante,
  onSaved,
  onCancel,
}: {
  militante?: MilitanteAEditar;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const editando = !!militante;
  const [provincias, setProvincias] = useState<Lista>([]);
  const [municipios, setMunicipios] = useState<Lista>([]);
  const [distritos, setDistritos] = useState<Lista>([]);
  const [localidades, setLocalidades] = useState<Lista>([]);
  const [recintos, setRecintos] = useState<Recinto[]>([]);
  const [colegios, setColegios] = useState<Colegio[]>([]);
  const [form, setForm] = useState(() => formDesdeMilitante(militante));
  const [duplicados, setDuplicados] = useState<Duplicado[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [agregandoLocalidad, setAgregandoLocalidad] = useState(false);
  const [nuevaLocalidad, setNuevaLocalidad] = useState("");
  const [creandoLocalidad, setCreandoLocalidad] = useState(false);
  const [agregandoRecinto, setAgregandoRecinto] = useState(false);
  const [nuevoRecinto, setNuevoRecinto] = useState("");
  const [creandoRecinto, setCreandoRecinto] = useState(false);
  const [agregandoColegio, setAgregandoColegio] = useState(false);
  const [nuevoColegio, setNuevoColegio] = useState("");
  const [creandoColegio, setCreandoColegio] = useState(false);

  useEffect(() => {
    apiFetch<Lista>("/geo/lista/provincias").then(setProvincias);
  }, []);

  useEffect(() => {
    if (!form.provinciaId) {
      setMunicipios([]);
      return;
    }
    apiFetch<Lista>(`/geo/lista/municipios?provinciaId=${form.provinciaId}`).then(setMunicipios);
  }, [form.provinciaId]);

  useEffect(() => {
    if (!form.municipioId) {
      setDistritos([]);
      return;
    }
    apiFetch<{ id: string; nombre: string }[]>(`/distritos?municipioId=${form.municipioId}`)
      .then((filas) => setDistritos(filas.map((f) => ({ id: f.id, nombre: f.nombre }))))
      .catch(() => setDistritos([]));
  }, [form.municipioId]);

  useEffect(() => {
    if (!form.municipioId) {
      setLocalidades([]);
      return;
    }
    apiFetch<Lista>(`/localidades?municipioId=${form.municipioId}`)
      .then(setLocalidades)
      .catch(() => setLocalidades([]));
  }, [form.municipioId]);

  useEffect(() => {
    if (!form.localidadId) {
      setRecintos([]);
      return;
    }
    apiFetch<Recinto[]>(`/recintos?localidadId=${form.localidadId}`)
      .then(setRecintos)
      .catch(() => setRecintos([]));
  }, [form.localidadId]);

  useEffect(() => {
    if (!form.recintoElectoralId) {
      setColegios([]);
      return;
    }
    apiFetch<Colegio[]>(`/colegios?recintoElectoralId=${form.recintoElectoralId}`)
      .then(setColegios)
      .catch(() => setColegios([]));
  }, [form.recintoElectoralId]);

  const recintoSeleccionado = recintos.find((r) => r.id === form.recintoElectoralId);

  // RF-15: detectar posibles duplicados mientras se escribe cédula/teléfono.
  // Al editar, el propio registro no cuenta como "duplicado de sí mismo".
  useEffect(() => {
    if (form.cedula.length < 5 && form.telefono.length < 6) {
      setDuplicados([]);
      return;
    }
    const t = setTimeout(() => {
      const params = new URLSearchParams();
      if (form.cedula.length >= 5) params.set("cedula", form.cedula);
      if (form.telefono.length >= 6) params.set("telefono", form.telefono);
      apiFetch<Duplicado[]>(`/militantes/duplicados?${params.toString()}`)
        .then((resultados) => setDuplicados(resultados.filter((d) => d.id !== militante?.id)))
        .catch(() => setDuplicados([]));
    }, 400);
    return () => clearTimeout(t);
  }, [form.cedula, form.telefono]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        telefono: form.telefono || null,
        direccion: form.direccion || null,
        distritoMunicipalId: form.distritoMunicipalId || null,
        localidadId: form.localidadId || null,
        recintoElectoralId: form.recintoElectoralId || null,
        colegioId: form.colegioId || null,
      };
      if (militante) {
        await apiFetch(`/militantes/${militante.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        toast("Militante actualizado");
      } else {
        await apiFetch("/militantes", {
          method: "POST",
          body: JSON.stringify({ ...payload, consentimientoDatos: true }),
        });
        toast("Militante registrado");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar el militante");
    } finally {
      setSubmitting(false);
    }
  }

  async function crearLocalidad() {
    if (!nuevaLocalidad.trim() || !form.municipioId) return;
    setCreandoLocalidad(true);
    try {
      const creada = await apiFetch<{ id: string; nombre: string }>("/localidades", {
        method: "POST",
        body: JSON.stringify({ municipioId: form.municipioId, nombre: nuevaLocalidad.trim() }),
      });
      setLocalidades((prev) => [...prev, creada].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setForm((f) => ({ ...f, localidadId: creada.id, recintoElectoralId: "" }));
      setNuevaLocalidad("");
      setAgregandoLocalidad(false);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "No se pudo agregar la localidad", "error");
    } finally {
      setCreandoLocalidad(false);
    }
  }

  async function crearRecinto() {
    if (!nuevoRecinto.trim() || !form.localidadId) return;
    setCreandoRecinto(true);
    try {
      const creado = await apiFetch<Recinto>("/recintos", {
        method: "POST",
        body: JSON.stringify({ localidadId: form.localidadId, nombre: nuevoRecinto.trim() }),
      });
      setRecintos((prev) => [...prev, creado].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setForm((f) => ({ ...f, recintoElectoralId: creado.id, colegioId: "" }));
      setNuevoRecinto("");
      setAgregandoRecinto(false);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "No se pudo agregar el recinto electoral", "error");
    } finally {
      setCreandoRecinto(false);
    }
  }

  async function crearColegio() {
    if (!nuevoColegio.trim() || !form.recintoElectoralId) return;
    setCreandoColegio(true);
    try {
      const creado = await apiFetch<Colegio>("/colegios", {
        method: "POST",
        body: JSON.stringify({ recintoElectoralId: form.recintoElectoralId, numero: nuevoColegio.trim() }),
      });
      setColegios((prev) => [...prev, creado].sort((a, b) => a.numero.localeCompare(b.numero)));
      setForm((f) => ({ ...f, colegioId: creado.id }));
      setNuevoColegio("");
      setAgregandoColegio(false);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "No se pudo agregar el colegio", "error");
    } finally {
      setCreandoColegio(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Nombre completo">
        <input required className="input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Cédula">
          <input required className="input" value={form.cedula} onChange={(e) => setForm({ ...form, cedula: e.target.value })} />
        </Field>
        <Field label="Teléfono">
          <input className="input" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
        </Field>
      </div>

      {duplicados.length > 0 && (
        <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-600" />
          <div className="text-xs text-amber-800">
            <p className="font-semibold">Posible registro duplicado:</p>
            {duplicados.map((d, i) => (
              <p key={i}>{d.nombre} · cédula {d.cedula} {d.telefono ? `· tel. ${d.telefono}` : ""}</p>
            ))}
          </div>
        </div>
      )}

      <Field label="Dirección">
        <input className="input" value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Provincia">
          <select
            required
            className="input"
            value={form.provinciaId}
            onChange={(e) => setForm({ ...form, provinciaId: e.target.value, municipioId: "", distritoMunicipalId: "" })}
          >
            <option value="">Seleccionar…</option>
            {provincias.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        </Field>
        <Field label="Municipio">
          <select
            required
            className="input"
            value={form.municipioId}
            disabled={!form.provinciaId}
            onChange={(e) =>
              setForm({ ...form, municipioId: e.target.value, distritoMunicipalId: "", localidadId: "", recintoElectoralId: "" })
            }
          >
            <option value="">Seleccionar…</option>
            {municipios.map((m) => (
              <option key={m.id} value={m.id}>{m.nombre}</option>
            ))}
          </select>
        </Field>
      </div>
      {distritos.length > 0 && (
        <Field label="Distrito municipal (opcional)">
          <select
            className="input"
            value={form.distritoMunicipalId}
            onChange={(e) => setForm({ ...form, distritoMunicipalId: e.target.value })}
          >
            <option value="">Sin distrito municipal / no aplica</option>
            {distritos.map((d) => (
              <option key={d.id} value={d.id}>{d.nombre}</option>
            ))}
          </select>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Localidad (opcional)">
          {!agregandoLocalidad ? (
            <div className="flex gap-1.5">
              <select
                className="input"
                value={form.localidadId}
                disabled={!form.municipioId}
                onChange={(e) => setForm({ ...form, localidadId: e.target.value, recintoElectoralId: "" })}
              >
                <option value="">{form.municipioId ? "Sin localidad / no aplica" : "Selecciona un municipio"}</option>
                {localidades.map((l) => (
                  <option key={l.id} value={l.id}>{l.nombre}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={!form.municipioId}
                onClick={() => setAgregandoLocalidad(true)}
                title="Agregar localidad"
                className="flex shrink-0 items-center justify-center rounded-lg border border-institucional-600 px-2 text-institucional-700 hover:bg-institucional-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-300"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex gap-1.5">
              <input
                autoFocus
                className="input"
                placeholder="Nombre de la localidad"
                value={nuevaLocalidad}
                onChange={(e) => setNuevaLocalidad(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    crearLocalidad();
                  }
                }}
              />
              <button
                type="button"
                onClick={crearLocalidad}
                disabled={creandoLocalidad || !nuevaLocalidad.trim()}
                className="flex shrink-0 items-center justify-center rounded-lg bg-institucional-600 px-2 text-white hover:bg-institucional-700 disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setAgregandoLocalidad(false);
                  setNuevaLocalidad("");
                }}
                className="flex shrink-0 items-center justify-center rounded-lg border border-gray-200 px-2 text-gray-500 hover:bg-gray-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </Field>
        <Field label="Mesa / recinto electoral (opcional)">
          {!agregandoRecinto ? (
            <div className="flex gap-1.5">
              <select
                className="input"
                value={form.recintoElectoralId}
                disabled={!form.localidadId}
                onChange={(e) => setForm({ ...form, recintoElectoralId: e.target.value, colegioId: "" })}
              >
                <option value="">{form.localidadId ? "Sin recinto / no aplica" : "Selecciona una localidad"}</option>
                {recintos.map((r) => (
                  <option key={r.id} value={r.id}>{r.nombre}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={!form.localidadId}
                onClick={() => setAgregandoRecinto(true)}
                title="Agregar recinto electoral"
                className="flex shrink-0 items-center justify-center rounded-lg border border-institucional-600 px-2 text-institucional-700 hover:bg-institucional-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-300"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex gap-1.5">
              <input
                autoFocus
                className="input"
                placeholder="Nombre del recinto electoral"
                value={nuevoRecinto}
                onChange={(e) => setNuevoRecinto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    crearRecinto();
                  }
                }}
              />
              <button
                type="button"
                onClick={crearRecinto}
                disabled={creandoRecinto || !nuevoRecinto.trim()}
                className="flex shrink-0 items-center justify-center rounded-lg bg-institucional-600 px-2 text-white hover:bg-institucional-700 disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setAgregandoRecinto(false);
                  setNuevoRecinto("");
                }}
                className="flex shrink-0 items-center justify-center rounded-lg border border-gray-200 px-2 text-gray-500 hover:bg-gray-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </Field>
      </div>

      {recintoSeleccionado?.direccion && (
        <p className="-mt-2 text-xs text-gray-500">
          Dirección del recinto: {recintoSeleccionado.direccion}
        </p>
      )}

      <Field label="Colegio electoral (opcional, el número impreso en la cédula)">
        {!agregandoColegio ? (
          <div className="flex gap-1.5">
            <select
              className="input"
              value={form.colegioId}
              disabled={!form.recintoElectoralId}
              onChange={(e) => setForm({ ...form, colegioId: e.target.value })}
            >
              <option value="">{form.recintoElectoralId ? "Sin colegio / no aplica" : "Selecciona un recinto"}</option>
              {colegios.map((c) => (
                <option key={c.id} value={c.id}>{c.numero}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={!form.recintoElectoralId}
              onClick={() => setAgregandoColegio(true)}
              title="Agregar colegio"
              className="flex shrink-0 items-center justify-center rounded-lg border border-institucional-600 px-2 text-institucional-700 hover:bg-institucional-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-300"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex gap-1.5">
            <input
              autoFocus
              className="input"
              placeholder="Número de colegio, ej. 0621A"
              value={nuevoColegio}
              onChange={(e) => setNuevoColegio(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  crearColegio();
                }
              }}
            />
            <button
              type="button"
              onClick={crearColegio}
              disabled={creandoColegio || !nuevoColegio.trim()}
              className="flex shrink-0 items-center justify-center rounded-lg bg-institucional-600 px-2 text-white hover:bg-institucional-700 disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setAgregandoColegio(false);
                setNuevoColegio("");
              }}
              className="flex shrink-0 items-center justify-center rounded-lg border border-gray-200 px-2 text-gray-500 hover:bg-gray-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </Field>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 rounded-lg bg-institucional-600 px-5 py-2 text-sm font-semibold text-white hover:bg-institucional-700 disabled:opacity-60"
        >
          {submitting ? "Guardando…" : editando ? "Guardar cambios" : "Registrar militante"}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      {children}
    </label>
  );
}
