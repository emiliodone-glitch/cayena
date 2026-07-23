"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Plus, Pencil } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { Drawer } from "@/components/Drawer";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { TableSkeleton } from "@/components/Skeleton";

type Usuario = {
  id: string;
  nombre: string;
  email: string;
  telefono: string | null;
  role: string;
  active: boolean;
  secretariaId: string | null;
  secretaria: { nombre: string } | null;
  provinciaId: string | null;
  provincia: { nombre: string } | null;
  municipioId: string | null;
  municipio: { nombre: string; provinciaId: string } | null;
  distritoMunicipalId: string | null;
  distritoMunicipal: { nombre: string; municipioId: string; municipio: { provinciaId: string } } | null;
};

type Secretaria = { id: string; nombre: string };
type Lista = { id: string; nombre: string }[];

const ROLES = ["SUPERADMIN", "JEFE_SECRETARIA", "PROMOTOR", "AUDITOR", "DIRIGENCIA", "MILITANTE"];

type NivelTerritorio = "nacional" | "provincia" | "municipio" | "distrito";

const FORM_VACIO = {
  nombre: "",
  email: "",
  password: "",
  telefono: "",
  role: "PROMOTOR",
  secretariaId: "",
  nivelTerritorio: "nacional" as NivelTerritorio,
  territorioProvinciaId: "",
  territorioMunicipioId: "",
  territorioDistritoId: "",
};

// Traduce el nivel + los tres ids del formulario a lo que espera la API
// (a lo sumo uno de los tres con valor, los otros dos explícitamente null).
function territorioAEnviar(form: typeof FORM_VACIO) {
  switch (form.nivelTerritorio) {
    case "provincia":
      return { provinciaId: form.territorioProvinciaId || null, municipioId: null, distritoMunicipalId: null };
    case "municipio":
      return { provinciaId: null, municipioId: form.territorioMunicipioId || null, distritoMunicipalId: null };
    case "distrito":
      return { provinciaId: null, municipioId: null, distritoMunicipalId: form.territorioDistritoId || null };
    default:
      return { provinciaId: null, municipioId: null, distritoMunicipalId: null };
  }
}

function nombreTerritorio(u: Usuario): string {
  if (u.distritoMunicipal) return `${u.distritoMunicipal.nombre} (distrito)`;
  if (u.municipio) return `${u.municipio.nombre} (municipio)`;
  if (u.provincia) return `${u.provincia.nombre} (provincia)`;
  return "Nacional";
}

export default function UsuariosPage() {
  const toast = useToast();
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null);
  const [secretarias, setSecretarias] = useState<Secretaria[]>([]);
  const [q, setQ] = useState("");

  const [drawerAbierto, setDrawerAbierto] = useState(false);
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [desactivando, setDesactivando] = useState<Usuario | null>(null);

  // Listas para las cascadas de territorio (provincia → municipio → distrito).
  const [provincias, setProvincias] = useState<Lista>([]);
  const [municipiosTerritorio, setMunicipiosTerritorio] = useState<Lista>([]);
  const [distritosTerritorio, setDistritosTerritorio] = useState<Lista>([]);

  function cargar() {
    apiFetch<Usuario[]>("/usuarios").then(setUsuarios).catch(() => setUsuarios([]));
  }

  useEffect(() => {
    cargar();
    apiFetch<Secretaria[]>("/secretarias").then(setSecretarias);
    apiFetch<Lista>("/geo/lista/provincias").then(setProvincias);
  }, []);

  // Municipios de la provincia elegida para el territorio (niveles municipio/distrito).
  useEffect(() => {
    if (!form.territorioProvinciaId || form.nivelTerritorio === "provincia") {
      setMunicipiosTerritorio([]);
      return;
    }
    apiFetch<Lista>(`/geo/lista/municipios?provinciaId=${form.territorioProvinciaId}`).then(setMunicipiosTerritorio);
  }, [form.territorioProvinciaId, form.nivelTerritorio]);

  // Distritos municipales del municipio elegido (solo nivel distrito) — se
  // reutiliza el mismo endpoint que ya usa el editor de metas, filtrando la
  // "cabecera" (no es un distrito real asignable).
  useEffect(() => {
    if (!form.territorioMunicipioId || form.nivelTerritorio !== "distrito") {
      setDistritosTerritorio([]);
      return;
    }
    apiFetch<{ features: { properties: { id: string; nombre: string; esCabecera?: boolean } }[] }>(
      `/geo/municipios/${form.territorioMunicipioId}/distritos-municipales`,
    ).then((geo) =>
      setDistritosTerritorio(
        geo.features.map((f) => f.properties).filter((p) => !p.esCabecera).map((p) => ({ id: p.id, nombre: p.nombre })),
      ),
    );
  }, [form.territorioMunicipioId, form.nivelTerritorio]);

  function abrirNuevo() {
    setEditando(null);
    setForm(FORM_VACIO);
    setError(null);
    setDrawerAbierto(true);
  }

  function abrirEditar(u: Usuario) {
    setEditando(u);
    const nivelTerritorio: NivelTerritorio = u.distritoMunicipalId
      ? "distrito"
      : u.municipioId
        ? "municipio"
        : u.provinciaId
          ? "provincia"
          : "nacional";
    setForm({
      nombre: u.nombre,
      email: u.email,
      password: "",
      telefono: u.telefono ?? "",
      role: u.role,
      secretariaId: u.secretariaId ?? "",
      nivelTerritorio,
      territorioProvinciaId:
        u.provinciaId ?? u.municipio?.provinciaId ?? u.distritoMunicipal?.municipio.provinciaId ?? "",
      territorioMunicipioId: u.municipioId ?? u.distritoMunicipal?.municipioId ?? "",
      territorioDistritoId: u.distritoMunicipalId ?? "",
    });
    setError(null);
    setDrawerAbierto(true);
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { nivelTerritorio: _nt, territorioProvinciaId: _tp, territorioMunicipioId: _tm, territorioDistritoId: _td, ...campos } = form;
      const territorio = territorioAEnviar(form);
      if (editando) {
        const { password, ...resto } = campos;
        await apiFetch(`/usuarios/${editando.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            ...resto,
            secretariaId: resto.secretariaId || null,
            ...territorio,
            ...(password ? { password } : {}),
          }),
        });
        toast("Usuario actualizado");
      } else {
        await apiFetch("/usuarios", {
          method: "POST",
          body: JSON.stringify({ ...campos, secretariaId: campos.secretariaId || undefined, ...territorio }),
        });
        toast("Usuario creado");
      }
      setDrawerAbierto(false);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar el usuario");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActivo(u: Usuario) {
    try {
      await apiFetch(`/usuarios/${u.id}`, { method: "PATCH", body: JSON.stringify({ active: !u.active }) });
      toast(u.active ? "Usuario desactivado" : "Usuario activado");
      cargar();
    } catch {
      toast("No se pudo cambiar el estado del usuario", "error");
    } finally {
      setDesactivando(null);
    }
  }

  const filtrados = (usuarios ?? []).filter((u) => {
    const texto = q.trim().toLowerCase();
    if (!texto) return true;
    return u.nombre.toLowerCase().includes(texto) || u.email.toLowerCase().includes(texto);
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-institucional-900">Usuarios y permisos</h1>
        <div className="flex items-center gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre o correo…"
            className="w-64 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-institucional-600 focus:outline-none"
          />
          <button
            onClick={abrirNuevo}
            className="flex items-center gap-1.5 rounded-lg bg-institucional-600 px-4 py-2 text-sm font-semibold text-white hover:bg-institucional-700"
          >
            <Plus className="h-4 w-4" /> Nuevo usuario
          </button>
        </div>
      </div>

      {usuarios === null ? (
        <TableSkeleton cols={7} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-2">Nombre</th>
                <th className="px-4 py-2">Correo</th>
                <th className="px-4 py-2">Rol</th>
                <th className="px-4 py-2">Secretaría</th>
                <th className="px-4 py-2">Territorio</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtrados.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-2">{u.nombre}</td>
                  <td className="px-4 py-2">{u.email}</td>
                  <td className="px-4 py-2">{u.role}</td>
                  <td className="px-4 py-2">{u.secretaria?.nombre ?? "—"}</td>
                  <td className="px-4 py-2">
                    {nombreTerritorio(u) === "Nacional" ? (
                      <span className="text-gray-400">Nacional</span>
                    ) : (
                      nombreTerritorio(u)
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => (u.active ? setDesactivando(u) : toggleActivo(u))}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        u.active ? "bg-institucional-100 text-institucional-700" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {u.active ? "Activo" : "Inactivo"}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => abrirEditar(u)}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-institucional-700"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                    Sin resultados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Drawer open={drawerAbierto} onClose={() => setDrawerAbierto(false)} title={editando ? "Editar usuario" : "Nuevo usuario"}>
        <form onSubmit={guardar} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Nombre completo</span>
            <input
              required
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Correo</span>
            <input
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Teléfono</span>
            <input
              value={form.telefono}
              onChange={(e) => setForm({ ...form, telefono: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">
              {editando ? "Nueva contraseña (dejar en blanco para no cambiarla)" : "Contraseña (mín. 8 caracteres)"}
            </span>
            <input
              required={!editando}
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Rol</span>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Secretaría</span>
              <select
                value={form.secretariaId}
                onChange={(e) => setForm({ ...form, secretariaId: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Sin secretaría</option>
                {secretarias.map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="rounded-lg border border-gray-200 p-3">
            <span className="mb-2 block text-sm font-medium text-gray-700">
              Territorio asignado
              <span className="ml-1 font-normal text-gray-400">(coordinador de zona)</span>
            </span>
            <p className="mb-2 text-xs text-gray-500">
              Restringe el mapa y el padrón de militantes a una sola demarcación. Déjalo en &quot;Nacional&quot; para
              que este usuario siga viendo todo el país.
            </p>
            <select
              value={form.nivelTerritorio}
              onChange={(e) =>
                setForm({
                  ...form,
                  nivelTerritorio: e.target.value as NivelTerritorio,
                  territorioProvinciaId: "",
                  territorioMunicipioId: "",
                  territorioDistritoId: "",
                })
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="nacional">Nacional (todo el país)</option>
              <option value="provincia">Una provincia completa</option>
              <option value="municipio">Un municipio</option>
              <option value="distrito">Un distrito municipal</option>
            </select>

            {form.nivelTerritorio !== "nacional" && (
              <select
                required
                value={form.territorioProvinciaId}
                onChange={(e) =>
                  setForm({ ...form, territorioProvinciaId: e.target.value, territorioMunicipioId: "", territorioDistritoId: "" })
                }
                className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Selecciona una provincia…</option>
                {provincias.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            )}

            {(form.nivelTerritorio === "municipio" || form.nivelTerritorio === "distrito") &&
              form.territorioProvinciaId && (
                <select
                  required
                  value={form.territorioMunicipioId}
                  onChange={(e) => setForm({ ...form, territorioMunicipioId: e.target.value, territorioDistritoId: "" })}
                  className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Selecciona un municipio…</option>
                  {municipiosTerritorio.map((m) => (
                    <option key={m.id} value={m.id}>{m.nombre}</option>
                  ))}
                </select>
              )}

            {form.nivelTerritorio === "distrito" && form.territorioMunicipioId && (
              <select
                required
                value={form.territorioDistritoId}
                onChange={(e) => setForm({ ...form, territorioDistritoId: e.target.value })}
                className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Selecciona un distrito municipal…</option>
                {distritosTerritorio.map((d) => (
                  <option key={d.id} value={d.id}>{d.nombre}</option>
                ))}
              </select>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2 pt-2">
            <button
              disabled={submitting}
              className="flex-1 rounded-lg bg-institucional-600 px-4 py-2 text-sm font-semibold text-white hover:bg-institucional-700 disabled:opacity-60"
            >
              {submitting ? "Guardando…" : editando ? "Guardar cambios" : "Crear usuario"}
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

      <ConfirmDialog
        open={!!desactivando}
        title="¿Desactivar este usuario?"
        mensaje={`"${desactivando?.nombre}" ya no podrá iniciar sesión en el back office hasta que se reactive.`}
        confirmLabel="Desactivar"
        onConfirm={() => desactivando && toggleActivo(desactivando)}
        onCancel={() => setDesactivando(null)}
      />
    </div>
  );
}
