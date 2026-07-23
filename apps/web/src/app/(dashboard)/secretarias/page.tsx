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
  type LucideIcon,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
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
  const [presupuestoAsignado, setPresupuestoAsignado] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const esSuperadmin = user?.role === "SUPERADMIN";

  function cargar() {
    apiFetch<Secretaria[]>("/secretarias").then(setSecretarias);
  }

  useEffect(() => {
    cargar();
    if (esSuperadmin) {
      apiFetch<Usuario[]>("/usuarios").then(setUsuarios).catch(() => setUsuarios([]));
    }
  }, [esSuperadmin]);

  function abrirNueva() {
    setEditando(null);
    setNombre("");
    setDescripcion("");
    setTitularId("");
    setPresupuestoAsignado("");
    setDrawerAbierto(true);
  }

  function abrirEditar(s: Secretaria) {
    setEditando(s);
    setNombre(s.nombre);
    setDescripcion(s.descripcion ?? "");
    setTitularId(s.titularId ?? "");
    setPresupuestoAsignado(s.presupuestoAsignado ?? "");
    setDrawerAbierto(true);
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const body = {
        nombre,
        descripcion,
        ...(esSuperadmin
          ? {
              titularId: titularId || null,
              presupuestoAsignado: presupuestoAsignado ? Number(presupuestoAsignado) : null,
            }
          : {}),
      };
      if (editando) {
        await apiFetch(`/secretarias/${editando.id}`, { method: "PATCH", body: JSON.stringify(body) });
        toast("Secretaría actualizada");
      } else {
        await apiFetch("/secretarias", { method: "POST", body: JSON.stringify(body) });
        toast("Secretaría creada");
      }
      setDrawerAbierto(false);
      cargar();
    } catch {
      toast("No se pudo guardar la secretaría", "error");
    } finally {
      setSubmitting(false);
    }
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
    </div>
  );
}
