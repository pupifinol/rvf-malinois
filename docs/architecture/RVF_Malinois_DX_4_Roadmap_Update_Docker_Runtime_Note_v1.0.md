# RVF Malinois — DX-4 Roadmap Update + Docker Runtime Note

> Developer-experience checkpoint (DX-4). Documentation-only artifact.
> Authored after the F4 / F4.5 / F4.6 progression and after DX-1 (master roadmap, commit `b19e77a`), DX-2 (local DB migration validation procedure, commit `e3ccb52`), and DX-3 (definition of done, commit `65cb736`) shipped.
> Last known head at authoring time: commit `49a8349` (F4.6C — live readings projection updater).
>
> Upstream references (most recent):
> - Master Roadmap (DX-1): `docs/architecture/RVF_Malinois_Master_Roadmap.md` (commit `b19e77a`).
> - Local DB Migration Validation Procedure (DX-2): `docs/operations/RVF_Malinois_Local_DB_Migration_Validation_Procedure.md` (commit `e3ccb52`).
> - Definition of Done (DX-3): `docs/operations/RVF_Malinois_Definition_of_Done.md` (commit `65cb736`).
> - F4.6C.1 closeout: `docs/architecture/RVF_Malinois_F4_6C_1_Live_Readings_Projection_Updater_Closeout_Report_v1.0.md` (commit `49a8349`).
> - F4.5 closeout: `docs/architecture/RVF_Malinois_F4_5_UI_API_Wiring_Foundation_Closeout_Report.md` (commit `c1d24cc`).
> - Backend health controller: `apps/backend/src/health/health.controller.ts`.
> - Compose runtime: `docker-compose.yml`.
> - Backend dev image: `apps/backend/Dockerfile.dev`.

## 1. Purpose

DX-4 is a **documentation and developer-experience checkpoint** placed after the F4 / F4.5 UI-API wiring milestone and after the first three F4.6 sub-phases (schema hardening, ingestion boundary, live-readings projection updater) closed. It is **not** an implementation phase. No backend, frontend, or runtime code is modified by DX-4.

Its goals are narrow:

1. Restate the current platform direction and the milestones the repository evidence shows as closed.
2. Document the **expected local Docker runtime** — which services come up, in what order, and how to verify them.
3. Document the **backend health endpoint** as it actually exists today, and the realistic reasons the backend container may report unhealthy.
4. Provide a concise **local-runtime troubleshooting** runbook (read-only and reversible commands first; destructive commands flagged).
5. State the **recommended next implementation phase** so it is unambiguous which work follows DX-4.

DX-4 sits next to DX-1 / DX-2 / DX-3 as another standing documentation artifact. It is updated when the local runtime, the health endpoint, or the recommended-next-phase order changes — not on every code commit.

## 2. Current Platform Direction

RVF Malinois remains a **platform-owned architecture**, as recorded by ADR-006 (system of record), ADR-007 (database foundation), and ADR-008 (telemetry persistence / ingestion, status **Proposed**).

| Concern | Owned by |
|---|---|
| RVF backend (NestJS) | RVF Malinois |
| RVF database (PostgreSQL; TimescaleDB optional per ADR-007 §4) | RVF Malinois |
| RVF read APIs (`/api/v1/{tenants,wells,tags,equipment,jobs,telemetry/trends}`) | RVF Malinois |
| RVF telemetry ingestion boundary (`POST /api/v1/telemetry/ingest`, gated by `RVF_INGEST_ENABLED`) | RVF Malinois |
| RVF dashboards / console (Next.js) | RVF Malinois |
| RVF alarms / business logic | RVF Malinois (engine deferred to F4.6D) |
| ThingsBoard / Node-RED / MQTT / Modbus / OPC-UA / PLC / historian | **Optional inbound integrations only.** Each requires its own future plan / ADR / sub-phase. None has been introduced into the codebase. |

External tools may feed drafts **through** the ingestion boundary in the future. They are never the source of truth, never write canonical tables directly, and never appear as dependencies of RVF dashboards or alarms.

## 3. Completed Milestone Status

Drawn from `git log`, the master roadmap (DX-1), and the closeout reports under `docs/architecture/`. Each status below reflects what the repository actually shows — phases without a closeout file or with partial coverage are flagged explicitly.

| Milestone | Status (repo evidence) | Anchor |
|---|---|---|
| **F0 — Foundations / project shell** | Repository indicates closed: README §"Phase status" labels F0 as "Foundations"; baseline `pnpm` workspace, `turbo.json`, `tsconfig.base.json`, Docker compose stack, `.husky` hooks, and ADR / docs scaffolding all present. **No dedicated F0 closeout report under `docs/architecture/`**; treat F0 as the implicit foundation captured by the initial repo skeleton. | `README.md`; root manifests. |
| **F1 — Backend skeleton / health endpoint** | Repository indicates closed via subsequent phases referencing F1 artifacts (HealthController, `/health/ready` deferred to F1.5, telemetry-foundation API prefix). **No dedicated F1 closeout report.** | `apps/backend/src/health/health.controller.ts`; `apps/backend/src/main.ts`. |
| **ADR-001 → ADR-005** — Foundational ADRs | Closed (per DX-1 §3). | `docs/adr/RVF_Malinois_Adenda_Arquitectura_ADR_001_006_v1.4.md`. |
| **F2 (and F2A → F2D)** — Telemetry Runtime / Normalized Stream Foundation | Closed. | `docs/architecture/RVF_Malinois_F2_Closeout_Report_v1.0.md`; `RVF_Malinois_F2D_RESULT.md`; `RVF_Malinois_F2_Final_QA_Result.md`. |
| **ADR-006** — RVF as primary platform / system of record | Closed. | `docs/adr/ADR-006_RVF_Malinois_Primary_Platform_System_of_Record.md`. |
| **F3** — Backend API Foundation | Closed. | `docs/architecture/RVF_Malinois_F3_Closeout_Report_v1.0.md`; `RVF_Malinois_F3_Backend_API_Foundation.md`. |
| **F3.1** — Units Live Instrument Readings (frontend) | Closed. | `docs/architecture/RVF_Malinois_F3_1_Units_Live_Readings_Closeout_Report_v1.0.md`. |
| **F4 (architecture)** — Database Foundation Architecture | Closed. | `docs/architecture/RVF_Malinois_F4_Database_Foundation_Architecture.md`. |
| **ADR-007** — RVF Malinois Database Foundation | Closed. | `docs/adr/ADR-007_RVF_Malinois_Database_Foundation.md`. |
| **F4.1** — PostgreSQL Schema Foundation | Closed. | `database/schema/RVF_Malinois_F4_1_PostgreSQL_Schema.sql`; `RVF_Malinois_F4_1_Schema_Implementation_Report.md`. |
| **F4.2A** — Prisma Reconciliation Plan | Closed. | `RVF_Malinois_F4_2A_Prisma_Reconciliation_Plan.md`. |
| **F4.2B** — Prisma Baseline Migration + Backend Insulation | Closed. | `RVF_Malinois_F4_2B_Insulation_Strategy_Confirmation.md`; `RVF_Malinois_F4_2B_Prisma_Baseline_Migration_Report.md`. |
| **F4.3** — Seed / Reference Data | Closed. | `RVF_Malinois_F4_3_Seed_Reference_Data_Report.md`. |
| **F4.4A → F4.4F** — API reactivation on F4 Prisma client (tenants, wells, canonical-tags, equipment, jobs, telemetry/trends) | Closed. | `RVF_Malinois_F4_4{A,B,C,D,E,F}_*_Report.md`. |
| **F4.4 closeout** — API Reactivation Closeout | Closed. | `RVF_Malinois_F4_4_API_Reactivation_Closeout_Report.md`. |
| **F4.5A** — Frontend F4 API client foundation | Closed. | `RVF_Malinois_F4_5A_Frontend_API_Client_Foundation_Report.md`. |
| **F4.5B** — Tenants / Wells / Tags API wiring | Closed. | `RVF_Malinois_F4_5B_Tenants_Wells_Tags_API_Wiring_Report.md`. |
| **F4.5C** — Equipment / Units API wiring | Closed. | `RVF_Malinois_F4_5C_Equipment_Units_API_Wiring_Report.md`. |
| **F4.5D** — Jobs API wiring | Closed. | `RVF_Malinois_F4_5D_Jobs_API_Wiring_Report.md`. |
| **F4.5E** — Telemetry Trends API wiring | Closed. | `RVF_Malinois_F4_5E_Telemetry_Trends_API_Wiring_Report.md`. |
| **F4.5 closeout** — UI / API Wiring Foundation Closeout | Closed. | `RVF_Malinois_F4_5_UI_API_Wiring_Foundation_Closeout_Report.md`. |
| **F4.5F** — First screen migration: Units selector wired to F4 adapter | Closed. | `RVF_Malinois_F4_5F_First_Screen_Migration_Units_Report.md`. |
| **F4.6 (architecture)** + **ADR-008 (Proposed)** — Telemetry Persistence / Ingestion Architecture | Closed (architecture); ADR-008 remains **Proposed** until further sub-phases validate it. | `RVF_Malinois_F4_6_Telemetry_Persistence_Architecture.md`; `docs/adr/ADR-008_*.md`. |
| **F4.6 closeout** — Architecture closeout | Closed. | `RVF_Malinois_F4_6_Telemetry_Persistence_Closeout_Report_v1.0.md`. |
| **F4.6A.0** — Schema Hardening Plan | Closed. | `RVF_Malinois_F4_6A_Schema_Hardening_Plan.md`. |
| **F4.6A.1** — Prisma Schema + Migration implementation | Closed. | `RVF_Malinois_F4_6A_1_Schema_Hardening_Migration_Closeout_Report_v1.0.md`. |
| **F4.6B-0** — Ingestion Boundary Plan | Closed. | `RVF_Malinois_F4_6B_Ingestion_Boundary_Plan.md`. |
| **F4.6B.1** — Telemetry Ingestion Boundary runtime skeleton | Closed. | `RVF_Malinois_F4_6B_1_Ingestion_Boundary_Skeleton_Closeout_Report_v1.0.md`. |
| **F4.6C-0** — Live Readings Projection Updater Plan | Closed. | `RVF_Malinois_F4_6C_Live_Readings_Projection_Updater_Plan.md`. |
| **F4.6C.1** — Live Readings Projection Updater implementation | Closed (most recent commit, `49a8349`). | `RVF_Malinois_F4_6C_1_Live_Readings_Projection_Updater_Closeout_Report_v1.0.md`. |
| **DX-1** — Master Roadmap | Closed (commit `b19e77a`). | `docs/architecture/RVF_Malinois_Master_Roadmap.md`. |
| **DX-2** — Local DB Migration Validation Procedure | Closed (commit `e3ccb52`). | `docs/operations/RVF_Malinois_Local_DB_Migration_Validation_Procedure.md`. |
| **DX-3** — Definition of Done | Closed (commit `65cb736`). | `docs/operations/RVF_Malinois_Definition_of_Done.md`. |
| **DX-4** — Roadmap Update + Docker Runtime Note | **This document.** | `docs/architecture/RVF_Malinois_DX_4_Roadmap_Update_Docker_Runtime_Note_v1.0.md`. |

Specifically called out for the milestone summary the original DX-4 brief requested:

- **F4 Database Foundation** — closed across architecture (`f36923a`), ADR-007 (`8147399`), F4.1 schema (`a475066`), F4.2A/B (`7bd6103` / `a8862e2` / `e37f7b5`), F4.3 seed (`91e17aa`), and F4.4A–F (`2f5c108` … `5e92a13`). Hardened further by F4.6A.1 (`6be7842`) with the telemetry `integration_source_id` column, two partial unique dedup indexes, the `telemetry_ingestion_errors` table, and the `live_readings` projection table.
- **F4.5 UI API wiring** — closed end-to-end: foundation (F4.5A), tenants/wells/tags wiring (F4.5B), equipment/units wiring (F4.5C), jobs wiring (F4.5D), telemetry trends wiring (F4.5E), and the first per-screen migration (F4.5F — Units fleet selector reading from the F4 adapter via `useUnitsFleet`). Operations screen is operating against the existing adapter surface; the Operations chart cutover from the F2 simulator is explicitly deferred to F4.6F (per DX-1 §6).

## 4. Current Docker Runtime Note

The local development runtime is defined in `docker-compose.yml` at the repo root and is the canonical local stack for RVF Malinois development.

### 4.1 Services

| Service | Image | Container name | Host port | Purpose |
|---|---|---|---|---|
| `postgres` | `timescale/timescaledb:latest-pg16` | `rvf-postgres` | `${POSTGRES_PORT:-5432}` | Canonical database. PostgreSQL 16 base; TimescaleDB extension is present but the F4 schema does not depend on any TimescaleDB-specific feature (ADR-007 §4). |
| `redis` | `redis:7-alpine` | `rvf-redis` | `${REDIS_PORT:-6379}` | Cache / pub-sub. No application data; safe to wipe. |
| `backend` | Built from `apps/backend/Dockerfile.dev` (Node 22 bookworm-slim + pnpm 9.12.0 + Prisma generate at build) | `rvf-backend` | `${BACKEND_PORT:-4000}` | NestJS API + WebSocket gateway scaffolding. |
| `web` | Built from `apps/web/Dockerfile.dev` | `rvf-web` | `${WEB_PORT:-3000}` | Next.js dev server (RVF console). |

The volumes `postgres_data` and `redis_data` are named Docker volumes and **persist** across `docker compose up` / `docker compose down`. They are removed only by `docker compose down -v` (see §6).

### 4.2 Service start ordering

The compose file declares:

- `backend` `depends_on` `postgres: service_healthy` AND `redis: service_healthy`.
- `web` `depends_on` `backend` (presence only, not `service_healthy`).

This means: when you run `docker compose up -d`, Docker will not start `backend` until both `postgres` and `redis` report **healthy** (via their healthchecks: `pg_isready` for Postgres, `redis-cli ping` for Redis). The web container then starts after the backend container is created (it does not wait for backend health).

### 4.3 Expected command

```bash
docker compose up -d
```

Equivalent shortcut defined in the root `package.json`:

```bash
pnpm docker:up
```

### 4.4 Verification commands

```bash
# Status snapshot (state + healthcheck column)
docker compose ps

# Backend container logs (most recent 100 lines)
docker compose logs backend --tail=100

# Postgres container logs
docker compose logs postgres --tail=100

# Redis container logs
docker compose logs redis --tail=100
```

`docker compose ps` is the single source of truth for healthcheck state. The `STATUS` column reports `(healthy)`, `(unhealthy)`, or `(health: starting)` for each service that has a healthcheck.

Service health expectations on a clean stack startup:

1. `postgres` becomes `healthy` first (5-second interval, 10 retries → up to ~50 s ceiling; typically a few seconds).
2. `redis` becomes `healthy` independently (5-second interval, 10 retries → up to ~50 s ceiling; typically immediate).
3. `backend` enters the **30-second `start_period`** as soon as its dependencies are healthy. During `start_period`, healthcheck failures are not counted against the unhealthy threshold.
4. After `start_period`, `backend` is polled every 10 seconds (5-second timeout, 10 retries) until it succeeds — and at that point reports `healthy`.

Backend should be treated as **stable** only after `docker compose ps` shows it as `(healthy)`, not merely as `(running)`.

## 5. Backend Healthcheck Note

### 5.1 What the healthcheck calls

The compose healthcheck for the backend is:

```yaml
test:
  - CMD-SHELL
  - >
    node -e "fetch('http://localhost:4000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
interval: 10s
timeout: 5s
retries: 10
start_period: 30s
```

It runs **inside the backend container** and hits the container's own `http://localhost:4000/health`. It exits 0 on `2xx`, 1 otherwise.

### 5.2 What `/health` actually returns

Implementation: `apps/backend/src/health/health.controller.ts`.

```ts
@Controller('health')
export class HealthController {
  @Get()
  check(): { status: 'ok'; service: string; timestamp: string } {
    return {
      status: 'ok',
      service: 'rvf-malinois-backend',
      timestamp: new Date().toISOString(),
    };
  }
}
```

Key properties — these are **the truth** about what "healthy" means today:

- The endpoint is **liveness-only**. It does **not** check the database, Prisma, Redis, environment variables, or downstream services. By design (see the file's docstring): "a brief DB blip would mark the whole service as unhealthy and trigger a restart cascade." A future `/health/ready` (readiness, checks DB + Redis) is noted as deferred to F1 / later.
- The endpoint is mounted **outside** the global API prefix: `main.ts` calls `app.setGlobalPrefix('api/v1', { exclude: ['health'] });`. The path is therefore `/health`, **not** `/api/v1/health`. The Docker healthcheck's hard-coded URL matches this.
- "Healthy" in `docker compose ps` means: from inside the backend container, `fetch('http://localhost:4000/health')` returned a `2xx` response within 5 seconds — i.e., the Nest HTTP server is up and listening on the configured port and host.

### 5.3 Realistic reasons the backend may show unhealthy

Drawn from the actual code and compose configuration. Listed in roughly the order they tend to occur in practice:

1. **Boot is still inside `start_period`.** A `(health: starting)` status during the first ~30 seconds is normal — Nest needs to compile (in dev), run `prisma generate` if not cached, register every module (`HealthModule`, `TenantsModule`, `WellsModule`, …, `TelemetryModule`, conditionally `TelemetryIngestionModule`), bind Helmet/CORS/Pino, and start listening on `0.0.0.0:4000`. Wait out the `start_period` before assuming a real failure.
2. **Backend process failed to start at all.** No HTTP server is listening, so `fetch` rejects (caught by the `.catch(...)` → exit 1). Almost always visible in `docker compose logs backend --tail=200`. Common root causes:
   - **Postgres / Redis not yet ready when backend started.** Mitigated by `depends_on: service_healthy`, but `ConfigModule` / Prisma client construction at boot can still throw before the listener starts if env vars are missing (see #3).
   - **Migrations or startup checks fail.** `Dockerfile.dev` runs `pnpm prisma generate` at image-build time, not at container-start time; `prisma migrate deploy` is **not** invoked automatically by the compose stack. If you have not applied migrations (`pnpm --filter @rvf/backend prisma:migrate` per the README), the backend will still start (it is `/health` is independent of the DB), but any DB-dependent test/use will fail later — and the container will still report `(healthy)` here. This is by design but is a frequent source of confusion.
   - **Environment variables missing.** `main.ts` reads `env.BACKEND_PORT`, `env.BACKEND_HOST`, `env.ALLOWED_ORIGINS`, etc. via the typed `ENV_TOKEN`. A missing or invalid env that the env-validation layer rejects will throw at boot and Nest will exit before the listener binds.
3. **Port mismatch between healthcheck and listener.** The healthcheck URL is hard-coded to port `4000`. The container's `BACKEND_PORT` env (set to `4000` in the compose file) drives `app.listen(env.BACKEND_PORT, env.BACKEND_HOST)`. If `BACKEND_PORT` is overridden in `.env` to a value other than `4000`, the listener moves but the healthcheck still pings `4000` — every probe fails and the container reports unhealthy. **Do not override `BACKEND_PORT` inside the backend service unless you also rewrite the healthcheck command.**
4. **API health endpoint path mismatch.** The healthcheck hits `/health`; the controller is `@Controller('health')` excluded from the `api/v1` prefix. Any future change that brings `/health` under the `api/v1` prefix would break the healthcheck. (Today's code is consistent — this is a "don't regress this" note.)
5. **Container running but Node process can't reach itself.** Rare. If something blocks the loopback interface inside the container (e.g., a custom Helmet config that misroutes localhost — not the current state), the healthcheck fetch will hang past the 5-second `timeout` and count as a failure.

If none of #1–#5 apply, `docker compose logs backend --tail=200` is the next stop — Nest's bootstrap errors are printed by the `console.error('[boot] Fatal error:', err)` block in `main.ts` and by the Pino logger once it is wired in.

### 5.4 What the healthcheck does *not* tell you

- **Database connectivity.** A backend reporting `(healthy)` may still have a broken `DATABASE_URL` — you would discover this only on the first DB-touching request.
- **Migration state.** A backend reporting `(healthy)` is not a statement that `prisma migrate status` is up-to-date. Use the DX-2 procedure to validate that separately.
- **Redis connectivity.** Same reasoning. Redis is not currently exercised by the read API surface; reaching `(healthy)` does not prove Redis is consumable from the backend.

If you need any of those, run them as separate checks (`pnpm --filter @rvf/backend exec prisma migrate status`, an integration smoke test, etc.) — do not infer them from the container health column.

## 6. Local Runtime Troubleshooting

Read-only commands first; mutating commands grouped after; the one destructive command is flagged.

```bash
# Check service status (state + healthcheck)
docker compose ps

# View backend logs (recent)
docker compose logs backend --tail=200

# View postgres logs
docker compose logs postgres --tail=100

# View redis logs
docker compose logs redis --tail=100

# Restart only the backend container (keeps DB / Redis state)
docker compose restart backend

# Rebuild the backend image and recreate the container
# (use when Dockerfile.dev, lockfile, or backend package.json changed)
docker compose up -d --build backend

# Stop the whole stack — preserves the postgres_data and redis_data volumes
docker compose down
```

**Destructive — read this first:**

```bash
# Stop the stack AND DELETE the named volumes (postgres_data, redis_data).
# This wipes the local database, including any migrations applied and any
# seed / canonical reference data inserted by F4.3 (`apps/backend/prisma/seed.f4.ts`).
# You will need to re-run `pnpm --filter @rvf/backend prisma:migrate` and the
# seed afterwards, and any local test data you authored by hand will be lost.
# Use only when a fresh-DB validation is required (DX-2) or the DB is provably
# corrupt. Never as a generic "restart" shortcut.
docker compose down -v
```

Other tips:

- `docker compose ps` is the right place to read healthcheck state — `docker ps` (without `compose`) does not show the compose-managed health column as clearly.
- Backend healthcheck failures in the first ~30 seconds of boot are expected (`start_period: 30s`); do not panic-restart during that window.
- If only `web` is misbehaving, `docker compose restart web` (or `docker compose up -d --build web`) is sufficient — no need to touch backend / postgres / redis.

## 7. Recommended Next Step

**Recommended next step: F4.6D — Alarm Evaluation Boundary** (per the existing master roadmap §7).

This recommendation supersedes the description in DX-4's original brief (which named "F4.6 — Database Runtime Hardening / Seed Data / Migration Verification / Adapter Consistency" as the next step). Repository evidence shows F4.6 is already an established multi-sub-phase track owning **Telemetry Persistence / Ingestion**, not database-runtime hardening, and that F4.6 / F4.6A.1 / F4.6B.1 / F4.6C.1 have already shipped. The runbook concerns the brief raised (seed verification, migration repeatability, healthcheck stability, adapter consistency, runtime validation) are largely owned by **DX-2** (migration validation procedure) and **DX-3** (definition of done), both of which are already in the repo.

What F4.6D is, at a glance:

- **Type.** Plan-first (F4.6D-0 plan, then F4.6D.1 implementation), consistent with the F4.2A→F4.2B, F4.6A.0→F4.6A.1, F4.6B-0→F4.6B.1, F4.6C-0→F4.6C.1 pattern codified in DX-3.
- **Scope.** Backend alarm evaluation engine writing `alarm_events`. Operational-context lookup design (which `CommissioningSnapshot` applies to a given reading?). Threshold-resolution and lifecycle-transition rules. Frontend F2 evaluator switches its data source to persisted `alarm_events` here.
- **Out of scope for F4.6D.** WebSocket / SSE fan-out of alarm events (F4.6E). Historical-trend bucketing and the Operations chart cutover from the F2 simulator (F4.6F). External protocol bridges (separate future phases).
- **Will not be implemented in DX-4.** DX-4 is documentation only.

A separate small initiative — call it (for example) **DX-5: Local Runtime Validation Snapshot** — could be useful later to formally capture: a "stack is up and consistent" verification script (running the compose stack, applying migrations, replaying the F4.3 seed, hitting `/health`, hitting at least one read-API endpoint per F4.4 module, and confirming the F4.5F Units selector serves data). DX-4 does **not** create that initiative; it only notes that such a script does not exist yet and is not required for F4.6D to proceed. DX-2 + DX-3 + the existing test suites already cover the equivalent ground for the runtime that exists today.

Parallel work allowed at any time without unblocking F4.6D (per DX-1 §7):

- **F4.5G+** — per-screen migrations of non-telemetry screens (Wells, Equipment, Catalog, Tags, Settings) from the F3 mock adapter to the F4.5B / F4.5C adapter.

## 8. Acceptance Criteria

DX-4 is complete when **all** of the following are true:

- [x] This roadmap / status document exists at `docs/architecture/RVF_Malinois_DX_4_Roadmap_Update_Docker_Runtime_Note_v1.0.md`.
- [x] Docker runtime expectations are documented (services, start ordering, expected command, verification commands — §4).
- [x] Backend healthcheck behavior is documented from the actual code (`apps/backend/src/health/health.controller.ts`) and compose config — §5.
- [x] Local-runtime troubleshooting commands are documented, with the one destructive command (`docker compose down -v`) clearly flagged — §6.
- [x] The next recommended implementation phase is clearly stated (**F4.6D — Alarm Evaluation Boundary**) with reasoning — §7.
- [x] A pointer to this document is added to the `README.md`.
- [x] No unrelated functional changes were made: no edits under `apps/backend/src/`, `apps/web/`, `apps/backend/prisma/`, `packages/`, `database/schema/`, `docker-compose.yml`, `package.json`, lockfile, `turbo.json`, `.env*`, or CI config.

## 9. Files Changed by DX-4

| Path | Action |
|---|---|
| `docs/architecture/RVF_Malinois_DX_4_Roadmap_Update_Docker_Runtime_Note_v1.0.md` | **New.** This document. |
| `README.md` | **Modified.** One-line pointer added to the "Phase status" section so developers landing on the README find DX-4 immediately. |

No other file modified, created, or deleted.

---

*DX-4, authored at HEAD `49a8349` (F4.6C — live readings projection updater). Update when the local Docker runtime, the `/health` endpoint behavior, or the recommended-next-phase ordering changes.*
