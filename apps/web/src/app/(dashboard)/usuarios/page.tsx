"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiError } from "@/lib/api";

type Usuario = {
  id: string;
  nombre: string;
  email: string;
  role: string;
  active: boolean;
  secretaria: { nombre: string } | null;
};

type Secretaria = { id: string; nombre: string };

const ROLES = ["SUPERADMIN", "JEFE_SECRETARIA", "PROMOTOR", "AUDITOR", "DIRIGENCIA", "MILITANTE"];

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [secretarias, setSecretarias] = useState<Secretaria[]>([]);
  const [form, setForm] = useState({ nombre: "", email: "", password: "", role: "PROMOTOR", secretariaId: "" });
  const [error, setError] = useState<string | null>(null);

  function cargar() {
    apiFetch<Usuario[]>("/usuarios").then(setUsuarios);
  }

  useEffect(() => {
    cargar();
    apiFetch<Secretaria[]>("/secretarias").then(setSecretarias);
  }, []);

  async function crear(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/usuarios", {
        method: "POST",
        body: JSON.stringify({ ...form, secretariaId: form.secretariaId || undefined }),
      });
      setForm({ nombre: "", email: "", password: "", role: "PROMOTOR", secretariaId: "" });
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear el usuario");
    }
  }

  async function toggleActivo(u: Usuario) {
    await apiFetch(`/usuarios/${u.id}`, { method: "PATCH", body: JSON.stringify({ active: !u.active }) });
    cargar();
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-institucional-900">Usuarios y permisos</h1>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-400">
            <tr>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2">Correo</th>
              <th className="px-4 py-2">Rol</th>
              <th className="px-4 py-2">Secretaría</th>
              <th className="px-4 py-2">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {usuarios.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-2">{u.nombre}</td>
                <td className="px-4 py-2">{u.email}</td>
                <td className="px-4 py-2">{u.role}</td>
                <td className="px-4 py-2">{u.secretaria?.nombre ?? "—"}</td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => toggleActivo(u)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      u.active ? "bg-institucional-100 text-institucional-700" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {u.active ? "Activo" : "Inactivo"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form onSubmit={crear} className="mt-8 max-w-lg space-y-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700">Nuevo usuario</h2>
        <input
          required
          placeholder="Nombre completo"
          value={form.nombre}
          onChange={(e) => setForm({ ...form, nombre: e.target.value })}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <input
          required
          type="email"
          placeholder="Correo"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <input
          required
          type="password"
          placeholder="Contraseña (mín. 8 caracteres)"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <div className="grid grid-cols-2 gap-3">
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <select
            value={form.secretariaId}
            onChange={(e) => setForm({ ...form, secretariaId: e.target.value })}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Sin secretaría</option>
            {secretarias.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="rounded-lg bg-institucional-600 px-4 py-2 text-sm font-semibold text-white hover:bg-institucional-700">
          Crear usuario
        </button>
      </form>
    </div>
  );
}
