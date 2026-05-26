# RVF Malinois — Local DB Migration Validation Procedure

> Developer / operator runbook (DX-2). Documentation-only artifact.
> Anchors the standardized procedure that every future schema / migration phase (starting with F4.6C) will reference in its closeout report.
>
> Upstream references:
> - Master roadmap: `docs/architecture/RVF_Malinois_Master_Roadmap.md` (DX-1).
> - F4.6A.1 schema-hardening migration closeout: `docs/architecture/RVF_Malinois_F4_6A_1_Schema_Hardening_Migration_Closeout_Report_v1.0.md` (commit `6be7842`). This procedure formalizes the lessons learned during that validation.
> - F4.2B baseline migration: `apps/backend/prisma/migrations/20260524000000_f4_2_baseline/migration.sql` (commit `e37f7b5`).
> - F4.6A.1 telemetry-hardening migration: `apps/backend/prisma/migrations/20260526000000_f4_6a_telemetry_hardening/migration.sql` (commit `6be7842`).

## 1. Purpose

This procedure validates that **committed Prisma migrations apply cleanly against a fresh local PostgreSQL database** (the `postgres` service in `docker-compose.yml`, currently the `timescale/timescaledb:latest-pg16` image — TimescaleDB ships PostgreSQL 16, but the F4 schema does **not** use any TimescaleDB-specific feature; ADR-007 §4 keeps that optional).

It is a **developer / operator validation runbook**, not an application feature. It does not replace:

- Application unit tests (`pnpm --filter @rvf/backend run test`).
- Integration tests against a real database (a separate future deliverable; out of scope for DX-2).
- CI pipelines (none today; deferred).

What it does:

- Confirms that a fresh clone of the repo, plus the committed migration files, plus a fresh Postgres volume, produces a working schema with `prisma migrate status` reporting *"Database schema is up to date"*.
- Standardizes the commands and the order so every future schema / migration phase closeout reports the same artifact set.

## 2. When to Use This Procedure

Use this procedure:

- **After adding or modifying a committed migration.** Validates the migration applies from zero against a fresh DB.
- **Before implementing runtime code that depends on a new migration.** Catches schema gaps before the service code is written.
- **Before major DB-dependent phases** such as **F4.6C — Live Readings Projection Updater** (the next phase scheduled to write to a schema artifact F4.6A.1 introduced).
- **When reviewing a PR that touches Prisma migrations.** The reviewer should be able to replay the procedure verbatim and observe identical results.
- **When validating that a fresh clone can replay all migrations** to baseline+latest without operator intervention.

Do **not** use this procedure as a replacement for application tests. It validates schema correctness, not application behavior.

## 3. Important Rule — `migrate deploy` vs `migrate dev`

This is the single most important rule in the runbook.

### Use this for validation

```
pnpm --filter @rvf/backend exec prisma migrate deploy
```

Applies all committed migration files in `apps/backend/prisma/migrations/` in chronological order. Does **not** prompt for input. Does **not** create new migrations. Idempotent: re-running against an already-up-to-date database is a no-op.

### Use this only for authoring

```
pnpm --filter @rvf/backend exec prisma migrate dev
```

This is a **migration-authoring tool**, not a validation tool. It can prompt:

```
? Enter a name for the new migration: ›
```

when it detects schema drift, hand-authored SQL that Prisma cannot fully derive from `schema.prisma` (partial unique indexes, CHECK constraints, `COMMENT ON …`, views, raw SQL bodies), or any other condition Prisma classifies as "the schema has changed beyond what the migrations describe". In those cases, `migrate dev` *helpfully* offers to author a new corrective migration. **That is not what we want during validation.**

### Why this matters for RVF Malinois

The F4 migrations are deliberately hand-authored. They include:

- **Partial unique indexes** — `unit_configurations_unit_current_uk WHERE is_current = TRUE`, `sensor_tag_bindings_sensor_active_uk WHERE effective_to IS NULL`, `telemetry_readings_dedup_seq_uk WHERE sequence IS NOT NULL AND integration_source_id IS NOT NULL`, etc.
- **CHECK constraints** — quality / source / status / kind / reason enums on multiple tables.
- **`COMMENT ON TABLE`** documenting architectural intent.
- **A view** (`live_readings_projection`) defined in raw SQL inside the F4.2B baseline migration.
- **A reverse-migration SQL sibling** at `apps/backend/prisma/migrations/20260526000000_f4_6a_telemetry_hardening/down.sql`.

Prisma's introspection cannot reverse-derive every one of these from `schema.prisma`. `migrate dev` is therefore likely to detect "drift" and propose a corrective migration — even when the database is in fact correct. This was the exact scenario observed during F4.6A.1 validation (commit `6be7842`): the migrations applied cleanly, then `migrate dev` proposed a new migration name. The migrations were correct; `migrate dev` was the wrong tool.

### Rule

> **For validating that committed migrations apply cleanly, use `prisma migrate deploy`. Use `prisma migrate dev` only when the current phase explicitly authorizes authoring a new migration.**

If you ever see the prompt:

```
? Enter a name for the new migration: ›
```

during a validation run, **stop with `Ctrl+C`** and switch to `migrate deploy` / `migrate status`. See §7.

## 4. Prerequisites

Before running this procedure, confirm:

- **Docker Desktop is running** (or another Docker engine that the project's `docker-compose.yml` can target).
- **Project is checked out locally**, on the branch you intend to validate.
- **Terminal is at the repository root** (`/Users/<you>/.../RVF_Malinois_Code`).
- **`.env` is configured for local Postgres.** The default credentials in `docker-compose.yml` are `POSTGRES_USER=rvf`, `POSTGRES_PASSWORD=rvf_dev_password`, `POSTGRES_DB=rvf_malinois`; `DATABASE_URL` must point at `postgresql://rvf:rvf_dev_password@localhost:5432/rvf_malinois?schema=public` (or the equivalent for your override).
- **`pnpm` is installed** (the project's package manager).
- **Dependencies are installed**: `pnpm install` has been run since the last `package.json` change.
- **No uncommitted unrelated work** that would be lost if the destructive variant of this procedure (§5) is used. Stash or commit beforehand.
- **You understand that `docker compose down -v` deletes the local DB volume.** Local DB state is lost; the F4.3 seed (and any ad-hoc rows) is gone after a reset. The repository contains no production data; local DB recreation from migrations is cheap.

## 5. Clean Local DB Validation Procedure

This is the **destructive** variant — it deletes the local Postgres volume and replays every committed migration from zero. Use this for the strongest correctness signal: "a fresh clone can land here."

### 5.1 Command sequence

Run these from the repository root, in order:

```
docker compose down -v
docker compose up -d postgres
sleep 8
docker compose ps
docker compose logs postgres --tail=80
pnpm --filter @rvf/backend exec prisma migrate deploy
pnpm --filter @rvf/backend exec prisma migrate status
pnpm --filter @rvf/backend exec prisma validate
pnpm --filter @rvf/backend exec prisma generate
git status
```

`sleep 8` is a pragmatic wait for the Postgres / TimescaleDB image to finish initializing. The container has a `pg_isready` healthcheck (5s interval, retries 10), but Prisma can race ahead of it; see §6.

### 5.2 Expected results

| Step | Expected output |
|---|---|
| `docker compose down -v` | Container `rvf-postgres` removed; volume removed. |
| `docker compose up -d postgres` | Container starts in the background. |
| `docker compose ps` | `rvf-postgres` listed; `STATUS` shows `Up … (health: starting)` initially, then `Up … (healthy)`. |
| `docker compose logs postgres --tail=80` | The line `database system is ready to accept connections` appears near the bottom. TimescaleDB log lines about extension loading are normal. |
| `prisma migrate deploy` | Applies migrations in order: `20260524000000_f4_2_baseline` then `20260526000000_f4_6a_telemetry_hardening`. Last line: `All migrations have been successfully applied.` Re-running is a no-op: `No pending migrations to apply.` |
| `prisma migrate status` | `Database schema is up to date!` |
| `prisma validate` | `The schema at prisma/schema.prisma is valid 🚀` |
| `prisma generate` | `✔ Generated Prisma Client (v5.22.0) to ./../../node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/@prisma/client` |
| `git status` | **Working tree clean** unless the validation legitimately changed a file you intended to change. The generated Prisma client is under `node_modules/` and never appears in `git status`. If `git status` is dirty, stop and review. |

### 5.3 What this proves

- The baseline migration applies cleanly to an empty database.
- Every later migration (today: F4.6A.1) applies cleanly on top of the baseline.
- `schema.prisma` is consistent with the latest committed migration (`migrate status` would surface drift otherwise).
- Prisma can generate the client from the current schema without errors.
- The repository does not contain accidental untracked / modified files that the validation surfaces.

### 5.4 What this does **not** prove

- Application behavior. Run `pnpm --filter @rvf/backend run test` for that.
- Compatibility with shared / production environments. This is local-only.
- Performance characteristics. Real load testing is its own future deliverable.
- That `prisma migrate dev` is happy. It might not be (see §3 and §7).

## 6. Handling Postgres Startup Timing

A common transient failure observed during F4.6A.1 validation:

```
Error: P1001: Can't reach database server at `localhost`:`5432`
```

This happens because Prisma can race the database. Immediately after `docker compose up -d postgres`:

- The container is up, but the Postgres process may still be initializing.
- The TimescaleDB extension may still be loading (the image preloads it).
- The container's healthcheck may report `(health: starting)` for several seconds.

**P1001 in this window does not mean the migration is broken.** It means the database is not yet listening.

### Troubleshooting commands

```
docker compose ps
docker compose logs postgres --tail=80
```

Wait until the log shows:

```
database system is ready to accept connections
```

`docker compose ps` should report `(healthy)` (not `(health: starting)`).

Then retry:

```
pnpm --filter @rvf/backend exec prisma migrate deploy
```

If after ~30 seconds the container is still `(health: starting)`, inspect the logs for genuine errors — extension failures, port conflicts, permission errors on the volume mount, etc. A `sleep 8` after `docker compose up -d postgres` is usually enough; on slower machines a longer wait may be needed. Do **not** treat P1001 as a migration failure until you have confirmed the database is actually accepting connections.

## 7. What to Do If `migrate dev` Prompts for a New Migration

You should not normally see this prompt during validation (because you should be running `migrate deploy`, per §3). If you do see it — typically because muscle-memory typed `migrate dev` — do this:

If you see:

```
? Enter a name for the new migration: ›
```

**Do not enter a name.** Press `Ctrl+C` to abort.

Then run the validation commands:

```
pnpm --filter @rvf/backend exec prisma migrate status
pnpm --filter @rvf/backend exec prisma validate
pnpm --filter @rvf/backend exec prisma generate
```

If you are validating committed migrations, re-run with the correct command:

```
pnpm --filter @rvf/backend exec prisma migrate deploy
```

### Why this matters

Entering a name at the `migrate dev` prompt **creates a new migration file** in `apps/backend/prisma/migrations/`. That file would represent Prisma's best-guess corrective DDL based on whatever it perceived as drift (often partial-index reproductions, CHECK constraint re-emissions, or COMMENT reissues that the existing migrations already contain). Committing it would pollute the migration history with a redundant or incorrect migration — and once shared, retracting it is painful.

The rule: **only create a new migration when the current phase explicitly requires authoring one** (e.g. F4.6A.1 by design, future F4.6C if its plan authorizes schema changes). At all other times, prompt + `Ctrl+C` + `migrate deploy`.

## 8. Migration Failure Troubleshooting

### A. P1001 — Cannot reach database server

- Run `docker compose ps`. Status should be `Up (healthy)`. If it's `(health: starting)`, wait.
- Run `docker compose logs postgres --tail=80`. Look for `database system is ready to accept connections`.
- Wait `sleep 8` to `sleep 20` and retry.
- Verify port `5432` is not blocked by another local Postgres or a firewall.
- Verify your `.env` `DATABASE_URL` points at `localhost:5432` (not a remote host) and the credentials match `docker-compose.yml`.
- See §6.

### B. Drift / schema mismatch

If `migrate status` reports drift:

- **Do not auto-generate a corrective migration** unless the current phase explicitly authorizes it.
- Inspect the latest migration's `migration.sql` and compare against `apps/backend/prisma/schema.prisma`. Drift is often a clue that hand-authored SQL (partial indexes, CHECKs, comments) is doing more than the schema declares.
- Run `git status` and `git diff`. If you have local edits, that's the drift source.
- Re-read the relevant phase plan (e.g. F4.6A.0 §5 if drift is reported on `telemetry_readings_dedup_*_uk`). The plan describes which DB objects the migration introduces and why Prisma may not perceive them as schema-modeled.

### C. Failed SQL inside a migration

If `migrate deploy` aborts with a SQL error:

- Inspect the exact failing statement (the error message includes the SQL).
- Confirm table / column names match the schema (typos in hand-authored migration text are the usual cause).
- Confirm the required extension is present (`pgcrypto` for `gen_random_uuid()`; TimescaleDB is preloaded by the image but not used by the F4 schema).
- Confirm earlier migrations applied (`migrate status` will list them).
- **If the failing migration is not yet committed**, fix the file in place, then re-run from §5.
- **If the failing migration is already committed and shared**, do **not** rewrite history. Author a **new corrective migration** with `migrate dev` (this is the legitimate use of `migrate dev`) and document it in the phase closeout.

### D. `prisma generate` changed files

- Inspect `git status`. The generated Prisma client lives under `node_modules/.pnpm/@prisma+client@*/node_modules/@prisma/client` and is **never** tracked by git in this repo.
- If `git status` shows tracked files modified by `prisma generate`, **stop and review.** Typical culprits: a stray `prisma generate --output <repo-path>` invocation pointing into the repo, or an unrelated edit you made earlier in the session. Do not commit changes you cannot account for.

## 9. Reverse Migration / `down.sql` Policy

The convention established in F4.6A.1 (commit `6be7842`):

- **Prisma does not auto-execute `down.sql`.** Prisma's migration runtime is forward-only; reverse SQL is operator-applied via `psql`.
- **`down.sql` may be provided** as an operational rollback companion for hand-authored migrations whose forward DDL is non-trivial. F4.6A.1 ships one at `apps/backend/prisma/migrations/20260526000000_f4_6a_telemetry_hardening/down.sql`.
- **`down.sql` should be safe, explicit, and documented.** Each DDL statement should use `IF EXISTS` to be idempotent against partial-rollback states. Comments at the top should explain order, data-loss implications, and what objects are preserved.
- **Preserve canonical data whenever possible.** A `down.sql` that drops a column on `telemetry_readings` is safe today only because F4.6B.1 has not yet populated `integration_source_id`. If a downstream phase has populated the column with data the operator wants to keep, a different rollback strategy (export → drop → restore) is the right approach.
- **Do not apply `down.sql` casually against shared environments.** Local dev: `psql $DATABASE_URL -f .../down.sql` is acceptable. Production-shaped or shared-staging: never apply without explicit review and a backup.
- **`down.sql` must be reviewed before use.** Read every statement; confirm the order; confirm the data impact.

Reference: [`apps/backend/prisma/migrations/20260526000000_f4_6a_telemetry_hardening/down.sql`](../../apps/backend/prisma/migrations/20260526000000_f4_6a_telemetry_hardening/down.sql).

The operational rollback for an applied migration is, in dev environments, usually preferred via the destructive reset path:

```
docker compose down -v && docker compose up -d postgres && pnpm --filter @rvf/backend exec prisma migrate deploy
```

This replays from baseline and skips the migration you wanted to roll back only if you also remove its directory (do this in a feature branch, never on `main`).

## 10. Non-Destructive Validation Procedure

For developers who want to validate the *current pending* migration without losing their local DB state (seed data, ad-hoc rows from manual testing), use this variant.

### 10.1 Command sequence

```
docker compose up -d postgres
docker compose ps
pnpm --filter @rvf/backend exec prisma migrate status
pnpm --filter @rvf/backend exec prisma migrate deploy
pnpm --filter @rvf/backend exec prisma migrate status
pnpm --filter @rvf/backend exec prisma validate
pnpm --filter @rvf/backend exec prisma generate
git status
```

### 10.2 Expected results

- First `migrate status` shows which migrations are pending (one or more new files added since the last apply).
- `migrate deploy` applies them.
- Second `migrate status` reports `Database schema is up to date!`.
- `prisma validate` / `generate` succeed.
- `git status` remains clean.

### 10.3 What this proves and does not prove

- **Proves**: the new migration applies on top of the current local state without errors. Useful for fast feedback during authoring.
- **Does not prove**: that the baseline + every migration applies cleanly from zero. Drift from a previously-applied migration that was later edited (a development sin we should avoid) is invisible here.

For phase closeouts, prefer the destructive variant (§5). For day-to-day development, the non-destructive variant is the right pragmatic check.

## 11. Phase Closeout Expectations

Any future schema / migration phase closeout (next: F4.6C if it introduces schema; otherwise the rule still applies to F4.6F, hypothetical F4.6G, future operational migrations, etc.) **should report**:

- **Whether clean local DB validation was run.** Yes / No.
- **Exact commands used.** Copy-paste from §5 or §10, with any deviations called out.
- **Migrations applied.** List the migration directory names (e.g. `20260524000000_f4_2_baseline`, `20260526000000_f4_6a_telemetry_hardening`).
- **`migrate status` result.** The literal `Database schema is up to date!` or the equivalent.
- **`prisma validate` result.** `The schema at prisma/schema.prisma is valid 🚀`.
- **`prisma generate` result.** Success line.
- **`git status` result.** Working tree clean / dirty.
- **If not run, why not.** Pure-documentation phases (DX-1, DX-2, DX-3, and any future plan documents) are explicitly exempt — they touch no schema. Pure-runtime phases that depend on existing migrations (e.g. F4.6B.1) should still run validation to confirm the runtime tests are running against the same schema state the migrations claim.

This expectation will be codified in DX-3 (Definition of Done) as part of the per-phase-type checklist.

## 12. Safety Warnings

Read these before running any command in this runbook.

- **`docker compose down -v` deletes local volumes.** Anything you wrote to the local DB (F4.3 seed, ad-hoc rows from manual testing, custom data) is gone. Local DB state is cheap to recreate from the migrations + F4.3 seed; this is by design.
- **Never run destructive reset against production or a shared DB.** The destructive variant in §5 assumes a local-only Postgres reachable at `localhost:5432`. Before running anything in §5, verify `DATABASE_URL` points at `localhost`. If it points anywhere else, **stop**.
- **Verify `DATABASE_URL` before running any migration command.** `cat .env | grep DATABASE_URL`. If the URL is unfamiliar or unexpected, do not proceed.
- **Never create a migration from a validation prompt** unless the current phase explicitly requires a new migration. See §7.
- **Do not apply reverse SQL (`down.sql`) without review.** See §9.
- **Do not commit a migration that was authored under unclear circumstances.** If you don't remember why a migration file is in your `git status`, delete it (it's not yet committed) and start over with `migrate deploy`. A polluted migration history is hard to clean.

## 13. Recommended Usage for Upcoming F4.6C

Before **F4.6C.1 — Live Readings Projection Updater Implementation** begins, developers should run the **clean local DB validation procedure (§5)** to confirm:

- The F4.2B baseline migration applies cleanly to an empty local Postgres.
- The F4.6A.1 telemetry-hardening migration applies cleanly on top of the baseline.
- `prisma validate` and `prisma generate` both succeed against the current `schema.prisma`.
- The local DB is in a known-good state from which to start writing F4.6C runtime code.

This matters specifically for F4.6C because the projection-update logic will:

- Read `telemetry_readings` (via the `integration_source_id` column F4.6A.1 added).
- Write `live_readings` (the table F4.6A.1 added, currently empty).
- Optionally read or supersede `live_readings_projection` (the F4.2 VIEW F4.6A.1 preserved).

Each of these is something the validation procedure confirms is present and consistent before the F4.6C code is written.

F4.6C-0 (the plan) does not require a database — it is documentation-only — but **F4.6C.1 (the implementation)** does. The plan should mention this runbook and reference it as a precondition.

## 14. Acceptance Criteria

DX-2 is considered complete when:

1. Local DB migration validation procedure created at `docs/operations/RVF_Malinois_Local_DB_Migration_Validation_Procedure.md`.
2. Clear `migrate deploy` vs `migrate dev` guidance included (§3 + §7).
3. P1001 startup-timing troubleshooting included (§6).
4. `migrate dev` prompt handling included (§7).
5. `down.sql` policy included (§9).
6. Clean (destructive) and non-destructive procedures both included (§5 + §10).
7. F4.6C readiness guidance included (§13).
8. Closeout reporting expectations defined (§11).
9. Safety warnings included (§12).
10. **Documentation-only**; no code, Prisma schema, migration, test, config, CI, frontend, or runtime file changed.
11. No commit made yet.

---

*DX-2 runbook. F4.6C and every subsequent schema / migration phase reference this procedure in their closeout report.*
