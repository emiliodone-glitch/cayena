export const ROLES = [
  "SUPERADMIN",
  "JEFE_SECRETARIA",
  "PROMOTOR",
  "AUDITOR",
  "DIRIGENCIA",
  "MILITANTE",
] as const;

export type RoleName = (typeof ROLES)[number];

// Roles con acceso al back office web (excluye a militante/dirigencia, propios de la app).
export const BACK_OFFICE_ROLES: RoleName[] = [
  "SUPERADMIN",
  "JEFE_SECRETARIA",
  "PROMOTOR",
  "AUDITOR",
];

// Roles que solo pueden leer, nunca escribir.
export const READ_ONLY_ROLES: RoleName[] = ["AUDITOR", "DIRIGENCIA"];
