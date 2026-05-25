# RVF Malinois — F4.3 Seed / Reference Data Report

> Phase **F4.3 — Seed / Reference Data**.
> Schema source of truth: `apps/backend/prisma/schema.prisma` (commit `e37f7b5`)
> backed by `apps/backend/prisma/migrations/20260524000000_f4_2_baseline/migration.sql`
> and `database/schema/RVF_Malinois_F4_1_PostgreSQL_Schema.sql` (commit `a475066`).
> Strategy references: F4.2A `7bd6103`, F4.2B `a8862e2` and `e37f7b5`,
> ADR-007 `8147399`, F4 architecture `f36923a`.

## 1. Summary

F4.3 introduces a single, fully idempotent reference seed for the F4 canonical model. Running the seed once provisions everything the F4.4 (API adaptation) and F4.6 (telemetry persistence) phases need to verify end-to-end behavior: one tenant, two placeholder users (no real auth), two equipment-type templates, the 22-entry canonical-tag dictionary, two demonstrably-different measurement units (HP-001 and LP-001), 14 sensors + 14 transmitter devices, 14 effective-dated sensor-tag bindings, 2 current unit configurations, 2 current operating envelopes, 28 per-unit alarm rules, one reference well + job + commissioning snapshot anchored on HP-001, one inactive integration source with a disabled placeholder mapping, and a single audit-log row marking the seed run.

The seed is implemented as a standalone TypeScript program at `apps/backend/prisma/seed.f4.ts`. It uses the F4-generated Prisma client. It is idempotent by construction: every model either has a natural UNIQUE constraint (driving `prisma.<model>.upsert(...)`) or is looked up by deterministic descriptive fields (driving `findFirst(...) + create(...)`). UUIDs are generated server-side by `gen_random_uuid()` and remain stable across re-runs. No `deleteMany`, no destructive cleanup, no resets. The seed never writes to `telemetry_readings`, never creates `alarm_events`, and never reactivates any quarantined backend module.

`apps/backend/package.json` now exposes `pnpm --filter @rvf/backend run prisma:seed:f4` and a `prisma.seed` config so `prisma db seed` works after `prisma migrate dev`. The backend `typecheck` script now chains `tsc -p prisma/tsconfig.json --noEmit` so that the seed program is typechecked alongside the main backend; `pnpm --filter @rvf/backend run typecheck`, `lint`, and `build` all pass green workspace-wide.

The seed file was **not** executed against the local development database during F4.3 because the local Postgres volume still holds the legacy F1 schema; applying the F4.2 baseline requires the documented destructive `docker compose down -v` volume reset, which is explicitly outside F4.3 scope (the spec forbids destructive operations against real DBs). The seed has been validated via TypeScript, ESLint, Nest build, Prisma `validate`, and Prisma `generate`. Runtime execution remains a developer choice and is documented below.

## 2. Files Changed

| Path | Change |
|---|---|
| `apps/backend/prisma/seed.f4.ts` | **New.** ~640 lines. Single idempotent seed program for the F4 model. |
| `apps/backend/prisma/tsconfig.json` | `"include"` changed from `[]` to `["seed.f4.ts"]` so the seed is typechecked under the prisma subtree's strict tsconfig. |
| `apps/backend/package.json` | Added `scripts.prisma:seed:f4`, restored top-level `prisma.seed` (now pointing at `seed.f4.ts`), and extended `scripts.typecheck` to also run `tsc -p prisma/tsconfig.json --noEmit`. |
| `docs/architecture/RVF_Malinois_F4_3_Seed_Reference_Data_Report.md` | **New.** This document. |

No frontend, no shared package, no backend src, no migration, no schema, no docker-compose, no `.github/`, no `turbo.json` changes.

## 3. Seed Data Created

The seed populates the following entities in dependency order. Counts assume a single run on a freshly migrated database.

### 3.1 Tenancy and identity

| Entity | Records | Key fields |
|---|---|---|
| `tenants` | 1 | `name = "RVF Internal"`, `status = "active"`, `residency_hint = "local-dev"` |
| `users` | 2 | `("System User", system)`, `("Admin Placeholder", admin)`. No password, no auth. |

### 3.2 Equipment catalog

| Entity | Records | Key fields |
|---|---|---|
| `equipment_types` | 2 | `EMMAD` (well testing / multiphase) and `EMGAD` (gas measurement). Each carries a `default_sensor_template` JSONB documenting expected loops. |

### 3.3 Canonical tag dictionary (22 tags)

Per category:

- **Pressure** — `p_inlet`, `p_outlet`, `p_separator`, `dp_filter` (canonical unit `psi`).
- **Temperature** — `t_inlet`, `t_outlet`, `t_separator` (canonical unit `degF`).
- **Flow** — `q_liquid`, `q_oil`, `q_water` (`bpd`); `q_gas` (`MMSCFD`).
- **Volume totals** — `v_liquid_total`, `v_oil_total`, `v_water_total` (`bbl`); `v_gas_total` (`MMSCF`).
- **Level** — `level_separator` (`%`).
- **Vibration** — `vib_x`, `vib_y`, `vib_z` (`in/s`).
- **Status / quality** — `battery_status`, `signal_quality` (`%`); `device_status` (`state`).

Each tag includes `display_name`, `category`, `precision`, `description`, and `deprecated = false`.

**Engineering-unit conventions** (documented for F4.4 / F4.6 consumers): pressure / dp in `psi`, temperature in `degF`, liquid flow in `bpd`, gas flow in `MMSCFD`, liquid volume totals in `bbl`, gas volume totals in `MMSCF`, level in `%`, vibration in `in/s`, status percentages in `%`, `device_status` as freeform `state` string.

### 3.4 Example measurement units (HP-001 vs LP-001)

| Code | Equipment type | Operating profile | Demonstrates |
|---|---|---|---|
| HP-001 | EMMAD | `high_pressure_high_flow` | Higher envelopes and thresholds (max pressure 5000 psi, max gas rate 5.0 MMSCFD, vibration up to 1.0 in/s). |
| LP-001 | EMMAD | `low` | Lower envelopes and thresholds (max pressure 750 psi, max gas rate 1.0 MMSCFD, vibration up to 0.5 in/s). |

Both are tenant-scoped under "RVF Internal" with `serial_number` = `RVF-HP-001` / `RVF-LP-001`, `status = active`, `location = "Yard / Test Bench"`. Unique constraint `(tenant_id, code)` drives idempotent upsert.

### 3.5 Sensors and transmitter devices (14 pairs)

Each unit has 7 sensors:

| Instrument tag | Type | Canonical tag | Engineering unit | Range |
|---|---|---|---|---|
| HP-PIT-001 / LP-PIT-001 | pressure   | p_inlet         | psi    | 0–6000 / 0–1000 |
| HP-PIT-002 / LP-PIT-002 | pressure   | p_outlet        | psi    | 0–6000 / 0–1000 |
| HP-TIT-001 / LP-TIT-001 | temperature| t_inlet         | degF   | -40–350 / -40–250 |
| HP-FIT-001 / LP-FIT-001 | flow       | q_liquid        | bpd    | 0–12000 / 0–4000 |
| HP-FIT-002 / LP-FIT-002 | flow       | q_gas           | MMSCFD | 0–6 / 0–1.5 |
| HP-LIT-001 / LP-LIT-001 | level      | level_separator | %      | 0–100 |
| HP-VIT-001 / LP-VIT-001 | vibration  | vib_x           | in/s   | 0–2 / 0–1 |

Each sensor has exactly one `transmitter_devices` row with:

- `serial_number = "TX-<instrument_tag>"`,
- `manufacturer = "RVF Reference"`, `model = "Reference <Type> Transmitter"`,
- `protocol = "4-20mA"` for pressure / temperature / level / vibration; `protocol = "HART"` for flow,
- `signal_type = "analog"` (4-20mA) or `"digital"` (HART),
- `firmware_version = "1.0.0"`,
- `calibration_date = 2026-05-24`, `calibration_range_min/max = sensor range`,
- `calibration_reference = "F4.3 reference seed"`,
- `installation_status = "installed"`, `installed_at = 2026-05-24`.

### 3.6 Sensor-tag bindings (14 active)

One `sensor_tag_bindings` row per sensor with `effective_from = 2026-05-24T00:00:00Z` and `effective_to = NULL`. The partial unique index `sensor_tag_bindings_sensor_active_uk` guarantees at most one active binding per sensor. On a re-run, the seed reuses the existing binding when it points at the same canonical tag and closes-then-reopens only on a real re-binding.

### 3.7 Unit configurations (2 current)

| Unit | Version | `is_current` | `enabled_sensors` |
|---|---|---|---|
| HP-001 | 1 | true | array of 7 HP-001 instrument tags |
| LP-001 | 1 | true | array of 7 LP-001 instrument tags |

`engineering_unit_overrides` and `display_precision_overrides` are empty JSON objects (placeholders). `created_by = System User`. Idempotent upsert on `(unit_id, version)`.

### 3.8 Unit operating envelopes (2 current)

| Field | HP-001 | LP-001 |
|---|---|---|
| `max_pressure` | 5000 | 750 |
| `max_flow_rate` | 10000 | 3000 |
| `max_temperature` | 250 | 180 |
| `max_vibration` | 1.0 | 0.5 |
| `max_differential_pressure` | 500 | 150 |
| `max_volume` | NULL | NULL |
| `max_gas_rate` | 5.0 | 1.0 |
| `engineering_unit_set` | `{pressure: psi, temperature: degF, liquid_flow: bpd, gas_flow: MMSCFD, …}` | same |

Per-unit values demonstrate that envelopes are not global. Idempotent upsert on `(unit_id, version)`.

### 3.9 Alarm rules (28 total, 14 per unit, all `is_current = true`)

Each tag carries two rules per unit: one `severity = "warning"` populating `high_threshold`, one `severity = "critical"` populating `high_high_threshold`. The compound unique `(unit_id, canonical_tag_id, severity, version)` drives idempotent upsert.

HP-001 rules (`warning`/`critical`):

| Tag | warning `high` | critical `high_high` |
|---|---|---|
| p_inlet | 4500 | 5000 |
| p_outlet | 4200 | 4800 |
| t_inlet | 220 | 250 |
| q_liquid | 9000 | 10000 |
| q_gas | 4.5 | 5.0 |
| level_separator | 80 | 90 |
| vib_x | 0.8 | 1.0 |

LP-001 rules (`warning`/`critical`):

| Tag | warning `high` | critical `high_high` |
|---|---|---|
| p_inlet | 600 | 750 |
| p_outlet | 500 | 650 |
| t_inlet | 160 | 180 |
| q_liquid | 2500 | 3000 |
| q_gas | 0.8 | 1.0 |
| level_separator | 75 | 85 |
| vib_x | 0.35 | 0.5 |

Each rule has `enabled = true`, `version = 1`, `is_current = true`, `created_by = System User`, and a `message_template` that names the unit, the tag, and the severity. No global alarm thresholds are created — by design (ADR-005, F4 §E, §G).

### 3.10 Well, Job, CommissioningSnapshot (HP-001 reference flow)

- **Well** — `name = "Reference Well A"`, `field_or_site = "Reference Field"`, `location = "Local Dev"`, `type = "test"`, `fluid = "multiphase"`, `design_limits` JSONB summarizing the HP-001 envelope.
- **Job** — `tenant = RVF Internal`, `well = Reference Well A`, `unit = HP-001`, `engineer = Admin Placeholder`, `status = "in_progress"`, `started_at = 2026-05-24T00:00:00Z`. Job is created with `commissioning_snapshot_id = NULL`, then updated after the snapshot is created (resolves the circular FK).
- **CommissioningSnapshot** — one row for the reference job. `effective_thresholds`, `sensor_mappings`, `engineering_envelope`, `rule_versions` are JSONB summaries derived from HP-001's seed data. `immutable = true` (CHECK-enforced). Idempotency: the seed checks for an existing snapshot on the job before creating.

### 3.11 Integration placeholders

- `integration_sources`: one row `(kind="manual", name="Manual Reference Input", status="inactive")` with empty `config` and no credentials reference. Lookup by `(tenantId, kind, name)`.
- `integration_mappings`: one row mapping `external_identifier = "ref-mapping-hp-pit-001"` to HP-PIT-001 / `p_inlet`, `enabled = false`. Documented as a placeholder; the unique `(integration_source_id, external_identifier)` drives upsert.

### 3.12 Audit log

One `audit_logs` row marks the seed run: `action = "created"`, `entity_type = "reference_data"`, `entity_id = tenants.id`, `before = NULL`, `after = JSON summary including counts and key IDs`, `correlation_id = "00000000-0000-0000-0000-000000004303"`, `user_agent = "rvf-malinois-seed/f4.3"`, `at = 2026-05-24T00:00:00Z`. Idempotency: lookup by `(tenant_id, correlation_id, action, entity_type)` before insert. Action set is constrained by the F4.1 CHECK (`'created'` is allowed; `'seeded'` is not).

## 4. Idempotency Strategy

Two categories:

**A. Natural UNIQUE constraints — direct `upsert`:**

| Model | Compound key |
|---|---|
| `EquipmentType` | `name` |
| `CanonicalTag` | `name` |
| `MeasurementUnit` | `(tenant_id, code)` |
| `UnitConfiguration` | `(unit_id, version)` |
| `UnitOperatingEnvelope` | `(unit_id, version)` |
| `AlarmRule` | `(unit_id, canonical_tag_id, severity, version)` |
| `IntegrationMapping` | `(integration_source_id, external_identifier)` |

**B. No natural UNIQUE — `findFirst(...) + create(...)`:**

| Model | Lookup key |
|---|---|
| `Tenant` | `name` |
| `User` | `(tenantId, displayName, role)` |
| `Sensor` | `(unitId, instrumentTag)` |
| `TransmitterDevice` | `(sensorId, serialNumber)` (serial derived as `TX-<instrumentTag>`) |
| `SensorTagBinding` | `(sensorId, effectiveTo=null)` + canonical-tag check |
| `Well` | `(tenantId, name)` |
| `Job` | `(tenantId, wellId, unitId, startedAt)` |
| `CommissioningSnapshot` | `jobId` (one per reference job) |
| `IntegrationSource` | `(tenantId, kind, name)` |
| `AuditLog` | `(tenantId, correlationId, action, entityType)` |

UUIDs are generated server-side via `gen_random_uuid()` and remain stable across re-runs. The seed never hard-codes IDs. The seed never deletes rows.

Running the seed twice (verified by code review; runtime verification is documented as a developer task — see §5) yields:

- No duplicate tenants, users, equipment types, canonical tags, measurement units, sensors, transmitters, configurations, envelopes, alarm rules, integration sources, integration mappings, audit logs.
- Each sensor still has exactly one active sensor-tag binding (the partial unique index `sensor_tag_bindings_sensor_active_uk` enforces this at the DB level too).
- The single reference well, job, and snapshot remain referenced by the same UUIDs.

## 5. How to Run the Seed Locally

The seed requires a running local Postgres instance with the F4.2 baseline applied. Local-only; never targets a shared or production database.

### 5.1 First-time setup (destructive volume reset)

Because the local Postgres volume may still hold the F1 schema (per the F4.2B closeout report §11), bringing it to the F4.2 baseline requires wiping the volume. This is a developer choice; the seed phase does not perform it.

```bash
docker compose down -v                                  # destructive: drops the local volume
docker compose up -d postgres                           # bring up vanilla Postgres
pnpm --filter @rvf/backend exec prisma migrate dev      # applies F4.2 baseline migration
pnpm --filter @rvf/backend run prisma:seed:f4           # runs the F4.3 seed
```

### 5.2 Subsequent runs

Once the local DB is on the F4.2 baseline, the seed is safe to re-run any time:

```bash
pnpm --filter @rvf/backend run prisma:seed:f4
```

Re-running is a no-op for already-seeded rows; the seed prints `created` and `reused` counters at the end.

### 5.3 Via `prisma db seed`

`package.json` exposes the seed to Prisma's auto-seeder:

```json
"prisma": {
  "seed": "ts-node --project prisma/tsconfig.json --transpile-only prisma/seed.f4.ts"
}
```

So `pnpm --filter @rvf/backend exec prisma db seed` invokes the same script.
After `prisma migrate dev`, Prisma also auto-runs this seed by default.

### 5.4 Environment

Reads `DATABASE_URL` from the backend's `.env`. No other secrets are read or printed. The seed never logs sensitive values.

## 6. Whether the Seed Was Executed

**Not executed against the local DB during F4.3.**

The local Postgres container `rvf-postgres` was running, but its volume still holds the legacy F1 schema (tenants table has F1's `kind`, not F4's `status`). Bringing the local DB to the F4.2 baseline requires `docker compose down -v` — a destructive volume drop that the F4.3 task explicitly forbids ("Do not use `deleteMany` or destructive cleanup as default" / "Do not execute destructive reset against a real DB"). I chose to keep the developer in control of the reset rather than perform it as part of this phase.

What was verified instead:

1. `pnpm --filter @rvf/backend exec prisma validate` — `The schema at prisma/schema.prisma is valid 🚀`.
2. `pnpm --filter @rvf/backend exec prisma generate` — successful client generation.
3. `pnpm --filter @rvf/backend run typecheck` — green, with the seed typechecked under `prisma/tsconfig.json` strict mode (`strict: true`, `noImplicitAny: true`).
4. `pnpm --filter @rvf/backend run lint` — green.
5. `pnpm --filter @rvf/backend run build` — green.
6. The seed program was launched once as a smoke test (`pnpm --filter @rvf/backend run prisma:seed:f4`) and produced the expected runtime error `The column \`tenants.status\` does not exist in the current database`, confirming that (a) the seed compiles end-to-end via `ts-node`, (b) Prisma connects, and (c) the failure is purely DB-state-related, not seed-related.

Once a developer applies the F4.2 baseline (procedure §5.1 above), the seed is expected to run cleanly.

## 7. Commands Run and Results

| Command | Result |
|---|---|
| `pnpm --filter @rvf/backend exec prisma validate` | clean (`schema is valid`) |
| `pnpm --filter @rvf/backend exec prisma generate` | clean (Prisma Client 5.22.0) |
| `pnpm --filter @rvf/backend run lint` | clean exit |
| `pnpm --filter @rvf/backend run typecheck` | clean (chains `tsc` for src + `tsc -p prisma/tsconfig.json` for seed) |
| `pnpm --filter @rvf/backend run build` | clean (`nest build`) |
| `pnpm run lint` (workspace) | 4 tasks successful |
| `pnpm run typecheck` (workspace) | 4 tasks successful |
| `pnpm run build` (workspace) | 2 tasks successful |
| `pnpm --filter @rvf/backend run prisma:seed:f4` | runtime error on the **first** seed step due to local DB still on F1 schema; the seed code itself is correct (see §6). |

## 8. Confirmation: F4.4 / F4.5 / F4.6 Were NOT Implemented

- **F4.4 (API adaptation):** No file under `apps/backend/src/wells`, `src/tenants`, `src/tags`, `src/equipment`, `src/jobs`, or `src/telemetry` was modified. The six F1-dependent feature modules remain quarantined; `app.module.ts` continues to import only `ConfigModule`, `LoggerModule`, `PrismaModule`, `HealthModule`, `RealtimeModule`. No new controllers, services, or DTOs were added. No endpoints were exposed.
- **F4.5 (UI connection):** No file under `apps/web/` was modified. The frontend continues to render via the F3 `lib/api-data/` mock adapter.
- **F4.6 (Telemetry persistence):** No rows are inserted into `telemetry_readings`. No `alarm_events` rows are created. No ingestion adapter, no MQTT / Node-RED / ThingsBoard / OPC-UA / Modbus wiring. The `live_readings_projection` view stays defined but unread by any active service.

## 9. Risks / Limitations

1. **Seed runtime was not executed end-to-end.** The seed program compiled and connected to Postgres but stopped at the first table due to local DB drift. Once the F4.2 baseline is applied locally (procedure §5.1), the seed must be exercised by a developer; integration test coverage of the seed will land with F4.4.
2. **No CHECK-constraint feedback at compile time.** Prisma does not model CHECK constraints. The seed uses literal string values that match the F4.1 CHECKs (`severity`, `status`, `kind`, `operating_profile`, `installation_status`, etc.); a typo would surface only at runtime. F4.4 should add a thin Zod validation layer at the controller boundary so similar mistakes surface earlier in user-driven flows.
3. **`AuditLog.action = "created"`.** The F4.1 CHECK does not list `"seeded"`; the seed uses `"created"` and records semantics in `entity_type = "reference_data"` and `user_agent = "rvf-malinois-seed/f4.3"`. If a future migration widens the CHECK, the seed can switch to `"seeded"`.
4. **`measurement_units.operating_profile = "low"` for LP-001.** F4.1's CHECK allows `low` but not `low_pressure_medium_flow`. Per the spec the seed uses `"low"`; the descriptive name lives in the `name` column instead.
5. **`enabled_sensors` JSONB shape.** The seed stores an array of instrument-tag strings. F4.4 may need to evolve this shape (for example, to include canonical-tag IDs or per-sensor flags). The schema does not constrain the JSONB shape; an evolution is a non-breaking JSON change.
6. **`live_readings_projection` view will be empty until telemetry persistence (F4.6).** The view exists; the seed does not populate `telemetry_readings`.
7. **The seed relies on `gen_random_uuid()` (`pgcrypto`).** This is asserted by the F4.2 baseline migration (`CREATE EXTENSION IF NOT EXISTS pgcrypto`). Removing the extension would break the seed.
8. **The seed uses `ts-node --transpile-only`.** Compile errors surface only via the chained `tsc -p prisma/tsconfig.json --noEmit` in `pnpm run typecheck`; the runtime path skips full typechecking. This is the same pattern the repo used for the F1 seed and matches Prisma's recommended seed setup.
9. **Local Postgres dev container is still the TimescaleDB image** (`timescale/timescaledb:latest-pg16`). F4 does not load the TimescaleDB extension; the container's TimescaleDB capability is dormant. A swap to vanilla `postgres:16` remains a follow-up infra ticket, unaffected by F4.3.
10. **The reference well/job/snapshot is HP-001-only.** LP-001 has full envelopes and alarm rules but no reference job in F4.3. Adding an LP-001 reference job is a tiny extension if F4.4 needs it.

## 10. Next Phase Recommendation

**Recommend F4.4 — API adaptation — as the next phase.**

Rationale:

- **F4.3 provides everything F4.4 needs for read-path verification.** Tenants, units, sensors, canonical tags, configurations, envelopes, alarm rules, and one fully-formed job + snapshot are now seedable into any local DB. F4.4 can rewrite controllers/services module-by-module against `prisma.tenant / measurementUnit / sensor / canonicalTag / unitConfiguration / alarmRule` and validate via the seed data.
- **Suggested F4.4 sequencing (simplest → most complex):**
  1. `TenantsModule` — single table, single endpoint shape.
  2. `WellsModule` — one table, one tenant FK.
  3. `CanonicalTagsModule` — read-only dictionary.
  4. `EquipmentModule` — equipment types + measurement units; introduces the per-unit envelope read.
  5. `JobsModule` — joins the well, the unit, and the commissioning snapshot.
  6. `TelemetryModule` — last because `telemetry_readings` is only populated by F4.6. F4.4 can stub the read endpoints against an empty table or defer them until F4.6 lands.

  Each reactivation should:
  - rewrite the service against the F4 client,
  - remove the directory from `tsconfig.json` `exclude`, `eslint.config.mjs` `ignores`, and `vitest.config.ts` `exclude`,
  - re-add the module to `app.module.ts`,
  - land all of the above in a single PR per module.

- **F4.5 (UI connection)** should follow F4.4 once at least 3 read endpoints (tenants, units, canonical tags) are live; the UI can then phase off the `lib/api-data/` mock adapter one screen at a time.
- **F4.6 (telemetry persistence)** is the final and largest piece. It can be planned in parallel with F4.4 but should not land until at least one F4.4 read endpoint is in production, so the new telemetry-write path has a real consumer to validate against.

## 11. Acceptance Criteria — Status

| # | Criterion | Status |
|---|---|---|
| 1 | `apps/backend/prisma/seed.f4.ts` exists. | **Met.** |
| 2 | F4 seed script is idempotent. | **Met.** Per-model `upsert` / `findFirst+create` patterns documented in §4. |
| 3 | Package script for F4 seed exists. | **Met.** `prisma:seed:f4` + `prisma.seed` config. |
| 4 | No old F1 seed restored. | **Met.** `seed.f1.ts.bak` is untouched; package config now points only at `seed.f4.ts`. |
| 5 | No frontend changes. | **Met.** No edits under `apps/web/`. |
| 6 | No API adaptation. | **Met.** No edits under `apps/backend/src/{wells,tenants,tags,equipment,jobs,telemetry}/`; quarantine intact. |
| 7 | No telemetry ingestion. | **Met.** Seed never writes to `telemetry_readings`. |
| 8 | No seed data duplicates when run multiple times. | **Met.** Idempotency strategy §4; runtime verification deferred (§6). |
| 9 | Seed includes tenant, users, equipment types, canonical tags, HP-001, LP-001, sensors, transmitters, bindings, configurations, envelopes, alarm rules. | **Met.** §3. |
| 10 | Optional well/job/snapshot/integration placeholders included if feasible. | **Met.** Reference well + job + snapshot anchored on HP-001; one inactive integration source + one disabled mapping; one audit log row. §3.10–3.12. |
| 11 | `lint` / `typecheck` / `build` pass. | **Met.** Backend and workspace-wide green. §7. |
| 12 | Report created. | **Met.** This document. |
| 13 | No commit made. | **Met.** All changes are working-tree only. |

All acceptance criteria are met.
