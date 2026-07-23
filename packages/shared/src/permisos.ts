import type { RoleName } from "./roles";

// Módulos del back office (RF nuevo: control de accesos por usuario) — cada
// clave corresponde 1:1 a un ítem del Sidebar. "dashboard" no necesita
// permiso propio: es la pantalla de aterrizaje y siempre está disponible.
export const MODULOS = [
  "secretarias",
  "actividades",
  "obras",
  "militantes",
  "dia-electoral",
  "ranking",
  "gastos",
  "poa",
  "encuestas",
  "convocatorias",
  "usuarios",
] as const;

export type Modulo = (typeof MODULOS)[number];

export const MODULO_LABEL: Record<Modulo, string> = {
  secretarias: "Secretarías",
  actividades: "Actividades",
  obras: "Obras",
  militantes: "Militantes",
  "dia-electoral": "Día Electoral",
  ranking: "Ranking",
  gastos: "Gastos",
  poa: "POA / Metas",
  encuestas: "Encuestas",
  convocatorias: "Convocatorias",
  usuarios: "Usuarios",
};

// Módulos que ve cada rol cuando NO se le ha personalizado nada — calcado
// exactamente de las reglas que ya tenía el Sidebar (roles: null = todos,
// o la lista explícita por ítem), para que activar este sistema de permisos
// no le cambie el acceso a nadie que no se le toque nada a propósito.
export const MODULOS_POR_DEFECTO_ROL: Record<RoleName, Modulo[]> = {
  SUPERADMIN: [...MODULOS],
  JEFE_SECRETARIA: [
    "secretarias",
    "actividades",
    "obras",
    "militantes",
    "dia-electoral",
    "ranking",
    "gastos",
    "poa",
    "encuestas",
    "convocatorias",
  ],
  PROMOTOR: ["secretarias", "actividades", "obras", "militantes", "dia-electoral", "gastos", "poa"],
  AUDITOR: ["secretarias", "actividades", "obras", "militantes", "dia-electoral", "ranking", "gastos", "poa"],
  DIRIGENCIA: ["secretarias", "actividades", "obras", "militantes", "gastos", "poa"],
  MILITANTE: ["secretarias", "actividades", "obras", "militantes", "gastos", "poa"],
};

// SUPERADMIN nunca se restringe a sí mismo — es la red de seguridad para que
// una configuración de permisos mal armada no pueda dejar a todo el equipo
// sin nadie que pueda entrar a corregirla.
export function puedeVerModulo(
  user: { role: RoleName; modulosVisibles?: string[] | null },
  modulo: Modulo,
): boolean {
  if (user.role === "SUPERADMIN") return true;
  const personalizado = user.modulosVisibles && user.modulosVisibles.length > 0;
  const lista = personalizado ? (user.modulosVisibles as string[]) : MODULOS_POR_DEFECTO_ROL[user.role];
  return lista.includes(modulo);
}
