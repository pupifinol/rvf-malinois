# RVF Malinois

Industrial operational monitoring platform for portable multiphase Well Testing equipment.
Property of **RVF Soluciones Energéticas C.A.**

> **Scope.** Monitoring only. No remote control of field equipment.

This repository contains the engineering foundation of the platform. For the
architecture, design system, and product context, see [`docs/`](./docs).

## Stack

| Layer            | Choice                                       |
| ---------------- | -------------------------------------------- |
| Monorepo         | pnpm workspaces + Turborepo                  |
| Frontend         | Next.js (App Router) + TypeScript + Tailwind |
| Backend          | NestJS + TypeScript + Socket.IO              |
| Database         | PostgreSQL + TimescaleDB extension           |
| ORM              | Prisma                                       |
| Cache / pub-sub  | Redis                                        |
| Realtime         | Socket.IO (browser never speaks MQTT)        |
| Live charts      | uPlot                                        |
| Static charts    | Recharts                                     |
| State (server)   | TanStack Query                               |
| State (realtime) | Zustand + ring buffer outside React          |
| Tests            | Vitest, Playwright                           |
| Dev runtime      | Docker Compose                               |

## Repository layout

```
apps/
  web/        Next.js — RVF console + client portal
  backend/    NestJS — business API and WebSocket gateway
packages/
  ui/         design tokens, Tailwind preset, foundation primitives
  types/      shared TypeScript types (branded IDs, telemetry contract)
  config/     shared ESLint, Prettier, tsconfig presets
docs/         architecture, product, UI/UX, ADRs
```

## Getting started

```bash
# 1. Install dependencies
pnpm install

# 2. Bring up local Postgres + Redis
cp .env.example .env
pnpm docker:up

# 3. Apply the initial Prisma migration (enables TimescaleDB)
pnpm --filter @rvf/backend prisma:migrate

# 4. Run the dev servers
pnpm dev
```

Once running:

- Frontend: <http://localhost:3000>
- Backend health: <http://localhost:4000/health>

## Development commands

```bash
pnpm dev          # run all dev servers in parallel (Turborepo)
pnpm build        # build everything
pnpm lint         # lint everything
pnpm typecheck    # type-check everything
pnpm test         # unit tests (Vitest)
pnpm test:e2e     # end-to-end tests (Playwright)
pnpm format       # Prettier
```

## Phase status

This is **Phase F0 — Foundations**. No business features yet.
See [`docs/product/roadmap.md`](./docs/product/roadmap.md) for the full plan.

For the current F4 / F4.5 / F4.6 roadmap status and Docker runtime notes, see:
[`docs/architecture/RVF_Malinois_DX_4_Roadmap_Update_Docker_Runtime_Note_v1.0.md`](./docs/architecture/RVF_Malinois_DX_4_Roadmap_Update_Docker_Runtime_Note_v1.0.md)
