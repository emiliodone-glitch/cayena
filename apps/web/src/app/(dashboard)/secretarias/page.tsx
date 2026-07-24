"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  Pencil,
  Plus,
  Building2,
  Network,
  Megaphone,
  Rocket,
  Monitor,
  PartyPopper,
  Car,
  ClipboardCheck,
  Vote,
  Wallet,
  Radio,
  Scale,
  Briefcase,
  HardHat,
  Flower,
  Handshake,
  Users,
  Baby,
  GraduationCap,
  Church,
  Dumbbell,
  Copy,
  Check,
  type LucideIcon,
} from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { Drawer } from "@/components/Drawer";
import { CardSkeleton } from "@/components/Skeleton";

// Ícono + color por palabra clave del nombre — genérico y consistente,
// sin necesitar logos reales por secretaría.
const ICONOS_SECRETARIA: { match: RegExp; icon: LucideIcon; color: string }[] = [
  { match: /organizaci/i, icon: Network, color: "bg-indigo-50 text-indigo-600" },
  { match: /propaganda/i, icon: Megaphone, color: "bg-rose-50 text-rose-600" },
  { match: /juventud/i, icon: Rocket, color: "bg-sky-50 text-sky-600" },
  { match: /inform[aá]tica/i, icon: Monitor, color: "bg-slate-100 text-slate-600" },
  { match: /gesti[oó]n operativa|eventos/i, icon: PartyPopper, color: "bg-fuchsia-50 text-fuchsia-600" },
  { match: /movilidad|transporte/i, icon: Car, color: "bg-cyan-50 text-cyan-600" },
  { match: /fiscalizaci[oó]n|evaluaci[oó]n|control/i, icon: ClipboardCheck, color: "bg-amber-50 text-amber-600" },
  { match: /electoral/i, icon: Vote, color: "bg-violet-50 text-violet-600" },
  { match: /finanzas/i, icon: Wallet, color: "bg-emerald-50 text-emerald-600" },
  { match: /comunicaci[oó]n/i, icon: Radio, color: "bg-orange-50 text-orange-600" },
  { match: /[ée]tica|transparencia|rendici[oó]n/i, icon: Scale, color: "bg-teal-50 text-teal-600" },
  { match: /profesionales|gremiales/i, icon: Briefcase, color: "bg-blue-50 text-blue-600" },
  { match: /laborales/i, icon: HardHat, color: "bg-yellow-50 text-yellow-700" },
  { match: /mujer/i, icon: Flower, color: "bg-pink-50 text-pink-600" },
  { match: /partidos pol[ií]ticos|sociedad civil/i, icon: Handshake, color: "bg-lime-50 text-lime-700" },
  { match: /comunitari/i, icon: Users, color: "bg-green-50 text-green-600" },
  { match: /ni[ñn]os|adolescentes/i, icon: Baby, color: "bg-purple-50 text-purple-600" },
  { match: /formaci[oó]n pol[ií]tica/i, icon: GraduationCap, color: "bg-institucional-50 text-institucional-700" },
  { match: /cultos/i, icon: Church, color: "bg-stone-100 text-stone-600" },
  { match: /deportes/i, icon: Dumbbell, color: "bg-red-50 text-red-600" },
];
const ICONO_DEFECTO = { icon: Building2, color: "bg-gray-100 text-gray-500" };

function iconoSecretaria(nombre: string) {
  return ICONOS_SECRETARIA.find((i) => i.match.test(nombre)) ?? ICONO_DEFECTO;
}

type Titular = { id: string; nombre: string; email: string; active: boolean };
type Secretaria = {
  id: string;
  nombre: string;
  descripcion: string | null;
  titularId: string | null;
  titular: Titular | null;
  presupuestoAsignado: string | null;
};
type Usuario = { id: string; nombre: string; email: string; role: string };

const fmtMoney = new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP", maximumFractionDigits: 0 });

// Sentinel del <select> de Titular para "registrar una persona nueva" en vez
// de elegir entre las que ya existen — no puede chocar con un cid real.
const NUEVO_TITULAR = "__nuevo__";
const ROLES_TITULAR = ["JEFE_SECRETARIA", "PROMOTOR", "AUDITOR", "DIRIGENCIA"];
const NUEVO_TITULAR_VACIO = { nombre: "", email: "", telefono: "", role: "JEFE_SECRETARIA" };

export default function SecretariasPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [secretarias, setSecretarias] = useState<Secretaria[] | null>(null);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [drawerAbierto, setDrawerAbierto] = useState(false);
  const [editando, setEditando] = useState<Secretaria | null>(null);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [titularId, setTitularId] = useState("");
  const [nuevoTitular, setNuevoTitular] = useState(NUEVO_TITULAR_VACIO);
  const [presupuestoAsignado, setPresupuestoAsignado] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [invitacionLink, setInvitacionLink] = useState<string | null>(null);
  const [invitacionCopiado, setInvitacionCopiado] = useState(false);

  const esSuperadmin = user?.role === "SUPERADMIN";

  function cargar() {
    apiFetch<Secretaria[]>("/secretarias").then(setSecretarias);
  }

  function cargarUsuarios() {
    if (esSuperadmin) apiFetch<Usuario[]>("/usuarios").then(setUsuarios).catch(() => setUsuarios([]));
  }

  useEffect(() => {
    cargar();
    cargarUsuarios();
  }, [esSuperadmin]);

  function abrirNueva() {
    setEditando(null);
    setNombre("");
    setDescripcion("");
    setTitularId("");
    setNuevoTitular(NUEVO_TITULAR_VACIO);
    setPresupuestoAsignado("");
    setDrawerAbierto(true);
  }

  function abrirEditar(s: Secretaria) {
    setEditando(s);
    setNombre(s.nombre);
    setDescripcion(s.descripcion ?? "");
    setTitularId(s.titularId ?? "");
    setNuevoTitular(NUEVO_TITULAR_VACIO);
    setPresupuestoAsignado(s.presupuestoAsignado ?? "");
    setDrawerAbierto(true);
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      let titularIdFinal = titularId && titularId !== NUEVO_TITULAR ? titularId : null;
      let nuevoUsuarioId: string | null = null;

      // Registrar una persona nueva como titular (en vez de elegir entre las
      // que ya existen): se crea la cuenta con una contraseña provisional —
      // no importa cuál, se sobrescribe cuando la persona activa su cuenta
      // con el link de invitación que se genera más abajo.
      if (esSuperadmin && titularId === NUEVO_TITULAR) {
        const nuevo = await apiFetch<{ id: string }>("/usuarios", {
          method: "POST",
          body: JSON.stringify({
            nombre: nuevoTitular.nombre,
            email: nuevoTitular.email,
            telefono: nuevoTitular.telefono || undefined,
            password: crypto.randomUUID(),
            role: nuevoTitular.role,
            secretariaId: editando?.id,
            cargoSecretaria: editando?.id ? "Titular" : undefined,
          }),
        });
        nuevoUsuarioId = nuevo.id;
        titularIdFinal = nuevo.id;
      }

      const body = {
        nombre,
        descripcion,
        ...(esSuperadmin
          ? {
              titularId: titularIdFinal,
              presupuestoAsignado: presupuestoAsignado ? Number(presupuestoAsignado) : null,
            }
          : {}),
      };

      let secretariaId = editando?.id ?? null;
      if (editando) {
        await apiFetch(`/secretarias/${editando.id}`, { method: "PATCH", body: JSON.stringify(body) });
        toast("Secretaría actualizada");
      } else {
        const creada = await apiFetch<{ id: string }>("/secretarias", { method: "POST", body: JSON.stringify(body) });
        secretariaId = creada.id;
        toast("Secretaría creada");
      }

      // La secretaría recién creada no existía todavía cuando se creó la
      // persona nueva, así que solo ahora se puede ligar como miembro del equipo.
      if (nuevoUsuarioId && !editando && secretariaId) {
        await apiFetch(`/usuarios/${nuevoUsuarioId}`, {
          method: "PATCH",
          body: JSON.stringify({ secretariaId, cargoSecretaria: "Titular" }),
        });
      }

      if (nuevoUsuarioId) {
        const { token } = await apiFetch<{ token: string }>(`/usuarios/${nuevoUsuarioId}/invitacion`, { method: "POST" });
        setInvitacionLink(`${window.location.origin}/activar-cuenta/${token}`);
        setInvitacionCopiado(false);
        cargarUsuarios();
      }

      setDrawerAbierto(false);
      cargar();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "No se pudo guardar la secretaría", "error");
    } finally {
      setSubmitting(false);
    }
  }

  function copiarInvitacion() {
    if (!invitacionLink) return;
    navigator.clipboard.writeText(invitacionLink).then(() => {
      setInvitacionCopiado(true);
      setTimeout(() => setInvitacionCopiado(false), 2000);
    });
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-institucional-900">Secretarías</h1>
        {esSuperadmin && (
          <button
            onClick={abrirNueva}
            className="flex items-center gap-1.5 rounded-lg bg-institucional-600 px-4 py-2 text-sm font-semibold text-white hover:bg-institucional-700"
          >
            <Plus className="h-4 w-4" /> Nueva secretaría
          </button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {secretarias === null &&
          Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
        {secretarias?.map((s) => {
          const { icon: Icono, color } = iconoSecretaria(s.nombre);
          return (
          <Link
            key={s.id}
            href={`/secretarias/${s.id}`}
            className="relative block rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:border-institucional-300 hover:shadow-md"
          >
            {esSuperadmin && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  abrirEditar(s);
                }}
                className="absolute right-3 top-3 rounded-lg p-1.5 text-gray-300 hover:bg-gray-100 hover:text-institucional-700"
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${color}`}>
                <Icono className="h-5 w-5" />
              </div>
              <div className="font-semibold text-institucional-900">{s.nombre}</div>
            </div>
            <div className="mt-1 text-sm">
              {s.titular ? (
                <span className={s.titular.active ? "text-gray-700" : "text-amber-600"}>
                  Titular: {s.titular.nombre}
                  {!s.titular.active && <span className="ml-1 text-xs">(pendiente de activar)</span>}
                </span>
              ) : (
                <span className="text-gray-400">Vacante / sin titular</span>
              )}
            </div>
            {s.descripcion && <div className="mt-1 text-xs text-gray-400">{s.descripcion}</div>}
            {s.presupuestoAsignado != null && (
              <div className="mt-2 text-xs text-gray-500">
                Presupuesto: <span className="font-medium text-gray-700">{fmtMoney.format(Number(s.presupuestoAsignado))}</span>
              </div>
            )}
            <div className="mt-3 text-xs font-medium text-institucional-600">Ver gestión completa →</div>
          </Link>
          );
        })}
      </div>

      <Drawer open={drawerAbierto} onClose={() => setDrawerAbierto(false)} title={editando ? "Editar secretaría" : "Nueva secretaría"}>
        <form onSubmit={guardar} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Nombre</span>
            <input
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Descripción</span>
            <input
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          {esSuperadmin && (
            <>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">Titular</span>
                <select
                  value={titularId}
                  onChange={(e) => setTitularId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Vacante / sin titular</option>
                  <option value={NUEVO_TITULAR}>+ Registrar una persona nueva…</option>
                  {usuarios
                    .slice()
                    .sort((a, b) => a.nombre.localeCompare(b.nombre))
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre} ({u.role})
                      </option>
                    ))}
                </select>
                <span className="mt-1 block text-xs text-gray-400">
                  Cambiar el titular queda registrado en el historial de la secretaría.
                </span>
              </label>

              {titularId === NUEVO_TITULAR && (
                <div className="space-y-2 rounded-lg border border-institucional-200 bg-institucional-50/40 p-3">
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-gray-700">Nombre completo</span>
                    <input
                      required
                      value={nuevoTitular.nombre}
                      onChange={(e) => setNuevoTitular({ ...nuevoTitular, nombre: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-gray-700">Correo</span>
                    <input
                      required
                      type="email"
                      value={nuevoTitular.email}
                      onChange={(e) => setNuevoTitular({ ...nuevoTitular, email: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-gray-700">Teléfono</span>
                      <input
                        value={nuevoTitular.telefono}
                        onChange={(e) => setNuevoTitular({ ...nuevoTitular, telefono: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-gray-700">Rol</span>
                      <select
                        value={nuevoTitular.role}
                        onChange={(e) => setNuevoTitular({ ...nuevoTitular, role: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      >
                        {ROLES_TITULAR.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <p className="text-xs text-gray-500">
                    Se crea la cuenta y se genera un link de invitación de un solo uso para que active su acceso con
                    su propia contraseña.
                  </p>
                </div>
              )}
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">Presupuesto asignado (RD$)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={presupuestoAsignado}
                  onChange={(e) => setPresupuestoAsignado(e.target.value)}
                  placeholder="Sin definir"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
            </>
          )}
          <div className="flex gap-2 pt-2">
            <button
              disabled={submitting}
              className="flex-1 rounded-lg bg-institucional-600 px-4 py-2 text-sm font-semibold text-white hover:bg-institucional-700 disabled:opacity-60"
            >
              {submitting ? "Guardando…" : editando ? "Guardar cambios" : "Crear"}
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

      <Drawer open={!!invitacionLink} onClose={() => setInvitacionLink(null)} title="Invitación generada">
        <p className="mb-3 text-sm text-gray-600">
          Copia este enlace y envíaselo al nuevo titular por el canal que sea (WhatsApp, correo personal). Es de un
          solo uso y vence en 7 días — al entrar, confirma su correo real y crea su propia contraseña.
        </p>
        <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-xs text-gray-700">
          <span className="flex-1 truncate">{invitacionLink}</span>
          <button
            onClick={copiarInvitacion}
            className="flex flex-shrink-0 items-center gap-1 rounded-md bg-institucional-600 px-2 py-1 text-xs font-semibold text-white hover:bg-institucional-700"
          >
            {invitacionCopiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {invitacionCopiado ? "Copiado" : "Copiar"}
          </button>
        </div>
      </Drawer>
    </div>
  );
}
