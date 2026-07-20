# Cayena — Plataforma Integral de Gestión Partidaria

Fuerza del Pueblo · Gestión Leonel Fernández

Monorepo con tres productos conectados por una misma API:

- `apps/api` — API REST (Express + TypeScript + Prisma + PostgreSQL).
- `apps/web` — Back office administrativo (Next.js 14, App Router, Tailwind, Leaflet).
- `apps/mobile` — App móvil pública (Expo / React Native, expo-router).
- `packages/database` — Schema Prisma, seed y capas GeoJSON reales de provincias/municipios.
- `packages/shared` — Tipos y lógica compartida (roles, semáforo de metas).

## Mapa geográfico real (RF-13)

Las 32 demarcaciones (31 provincias + Distrito Nacional) y sus 155 municipios
provienen de **geoBoundaries** (geoBoundaries-DOM-ADM1/ADM2, CC-BY 4.0), no de
una cuadrícula esquemática. Ver `packages/database/geo/*.geojson`. La cantidad
de municipios puede necesitar actualización futura contra cartografía oficial
más reciente de la ONE/JCE (algunos municipios nuevos podrían faltar).

## Requisitos

- Node.js 18+
- PostgreSQL 14+

## Primeros pasos

```bash
npm install

# 1. Configura variables de entorno
cp apps/api/.env.example apps/api/.env
cp apps/api/.env apps/api/.env.local 2>/dev/null || true
cp packages/database/.env 2>/dev/null || cp apps/api/.env packages/database/.env
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env.local

# 2. Base de datos: migra y siembra provincias/municipios reales + datos demo
npm run db:migrate
npm run db:seed

# 3. Levanta todo (API :4000, web :3000, mobile via Expo)
npm run dev
```

Usuario superadmin sembrado por defecto: `admin@fuerzadelpueblo.do` / `Cayena2026!`
(cambiar `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` antes de sembrar en producción).

## Estado

MVP funcional: secretarías, actividades, obras de gobierno, militantes con mapa
real semáforo (drill-down provincia → municipio), gastos, POA con gráficas,
gestión de usuarios/roles, y la app móvil (mapa de obras, feed, registro
público con geolocalización, panel de dirigencia, directorio, perfil).

Pendiente para Fase 2 (ver documento de requerimientos): carnet digital QR,
gamificación, encuestas internas, panel público de transparencia, alertas de
estancamiento de metas, modo offline.
