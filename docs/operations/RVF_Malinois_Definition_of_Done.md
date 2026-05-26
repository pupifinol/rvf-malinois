# RVF Malinois — Definition of Done

> Project-level Definition of Done (DX-3). Documentation-only artifact.
> Codifies the working rules already validated across F4.6 / F4.6A / F4.6B / DX-1 / DX-2 so every future phase closes against the same shared baseline.
>
> Upstream references:
> - Master roadmap: `docs/architecture/RVF_Malinois_Master_Roadmap.md` (DX-1, commit `b19e77a`).
> - Local DB migration validation procedure: `docs/operations/RVF_Malinois_Local_DB_Migration_Validation_Procedure.md` (DX-2, commit `e3ccb52`).
> - Most recent runtime closeout: `docs/architecture/RVF_Malinois_F4_6B_1_Ingestion_Boundary_Skeleton_Closeout_Report_v1.0.md` (F4.6B.1, commit `1495457`).
> - Most recent schema/migration closeout: `docs/architecture/RVF_Malinois_F4_6A_1_Schema_Hardening_Migration_Closeout_Report_v1.0.md` (F4.6A.1, commit `6be7842`).
> - Most recent architecture/ADR closeout: `docs/architecture/RVF_Malinois_F4_6_Telemetry_Persistence_Closeout_Report_v1.0.md` (F4.6, commit `334bfc5`) — companion to ADR-008 (Proposed).

## 1. Purpose

This document defines what **"done"** means for an RVF Malinois work phase. It applies to:

- Architecture documents and ADRs.
- Schema and migration work.
- Backend runtime work (services, controllers, modules).
- Frontend / UI adapter work.
- Operations / runbook docs.
- Closeout reports.
- Full-stack phases that intentionally span backend + frontend.

It does **not** replace phase-specific acceptance criteria written into the phase's plan or brief. The phase plan is always authoritative for that phase's exact scope; this document provides the **common baseline** every phase shares.

A phase may have additional acceptance criteria beyond this Definition of Done. It may **not** have fewer.

## 2. General Done Criteria for Every Phase

Regardless of phase type, a phase is not done until **all** of the following are true:

1. **Scope matches the approved prompt / plan.** No drift from what was authorized. If the work expanded mid-phase, the scope change is documented or split into a follow-up phase.
2. **No unrelated files were modified.** `git status` and `git diff --stat` show only files the phase legitimately touches.
3. **Forbidden areas were explicitly checked.** See the forbidden-area checklist in §12.
4. **Validation appropriate to the phase was run.** See the validation matrix in §13. Failures were either fixed or surfaced explicitly in the closeout.
5. **`git status` was reviewed.** A working tree that's dirty in ways the author cannot account for is a stop condition.
6. **Changes were committed with a clear commit message.** See §14. One phase per commit when possible.
7. **Commit was pushed to `origin/main`.** No long-lived feature branches in the current model; phases land on `main`.
8. **Final `git status` is clean.** `nothing to commit, working tree clean` is the literal expected output after push.
9. **Next phase is identified** in the closeout report (when a closeout exists) **or explicitly deferred**. The master roadmap §3 reflects the new status.

These nine criteria are non-negotiable. Phase-specific sections below add type-specific criteria on top of them.

## 3. Phase Types

The following phase types are recognized by this project. Every phase belongs to one (or, rarely, to "full-stack" which combines two).

| Type | What it usually changes | What it must not change by default |
|---|---|---|
| **Documentation-only** | Files under `docs/` (architecture, operations, ADRs, roadmaps, closeouts). | Code, Prisma schema, migrations, tests, configs, CI. |
| **Architecture / ADR** | A new architecture doc and/or an ADR file under `docs/adr/`. May update the master roadmap. | Code, Prisma schema, migrations, tests, configs, CI. |
| **Plan-only** | A new plan doc under `docs/architecture/` (e.g. `*_Plan.md`). May update the master roadmap. | Code, Prisma schema, migrations, tests, configs, CI. |
| **Schema / migration** | `apps/backend/prisma/schema.prisma`; a new directory under `apps/backend/prisma/migrations/` with `migration.sql` (and optionally `down.sql`). | Backend src, frontend, tests, configs, CI, seed (unless the phase explicitly authorizes seed changes). |
| **Backend runtime** | Files under `apps/backend/src/` (modules, services, controllers, contracts, specs). May minimally touch `apps/backend/src/app.module.ts` for module registration. | Frontend, Prisma schema, migrations, seed, package files, configs, CI. |
| **Frontend / UI adapter** | Files under `apps/web/` (components, hooks, adapters, types, tests). | Backend, Prisma schema, migrations, seed, package files, configs, CI. |
| **Full-stack** | Backend + frontend together. Requires an explicit plan listing both surfaces. | Anything not in the plan. |
| **Operations / runbook** | Files under `docs/operations/`. May reference scripts in `package.json` for documentation purposes but never modifies them. | Code, Prisma schema, migrations, tests, configs, CI. |
| **Closeout** | A new closeout report under `docs/architecture/` (and/or `docs/operations/` for operations milestones). May update the master roadmap. | Code, Prisma schema, migrations, tests, configs, CI. |

Phase-type framing: the brief at the start of each phase already names the type ("plan-only", "runtime skeleton", "closeout", etc.). When in doubt, the more restrictive set wins — choose the type whose "must not change" list is hardest to cross.

## 4. Documentation-Only / Operations Docs Definition of Done

Applies to: DX-1 (master roadmap), DX-2 (migration validation procedure), DX-3 (this document), future operations / governance / FAQ docs, any pure-prose deliverable.

### Required

- **Only docs files changed.** `git diff --stat` shows only paths under `docs/`.
- **No backend / frontend / Prisma / migration / config / test / CI changes.**
- **Document title and purpose are clear.** Top of file: title (with H1), one-paragraph purpose, references to upstream / related artifacts.
- **Document references relevant prior docs.** Plans, closeouts, ADRs, and the master roadmap are cross-linked rather than restated.
- **Document includes acceptance criteria or maintenance guidance** where useful (DX-1 §12, DX-2 §14, this document §17 are the validated templates).
- **`git status` reviewed** before commit.
- **Commit and push** completed per §14.

### Recommended validation

- Inspect `git diff` / `git status` and confirm the paths are limited to `docs/`.
- **No need to run backend tests** unless the document references generated artifacts (e.g. quoting `pnpm` script outputs) that may have changed since the last test run.
- Spot-check rendered Markdown if the doc has tables / code fences / nested headers.

## 5. Architecture / ADR Definition of Done

Applies to: F4 architecture, F4.6 architecture + ADR-008, future ADR-009 / 010 / 011 / 012 candidates, future architecture documents.

### Required

- **Architecture decision documented.** The doc states the decision, the reasoning, the alternatives considered, and the consequences.
- **Status clearly stated when an ADR is involved.** Use `Proposed`, `Accepted`, `Superseded`, or `Rejected`. Default for a brand-new decision is `Proposed`.
- **Non-goals and out-of-scope items listed.** Future readers should know what the document does NOT decide.
- **Future implementation boundaries are clear.** Anyone implementing the decision later should know where their phase ends.
- **No runtime code changed** unless the phase explicitly approves it (architecture phases rarely do).
- **No migrations** unless the phase explicitly approves them.
- **Related docs / roadmap updated** when appropriate (e.g. a new ADR usually warrants a master roadmap §4 entry).
- **Closeout report created** if the phase is a major architecture milestone (F4.6 architecture + ADR-008 is the canonical example, commit `334bfc5`).

### Special rule — ADR status transitions

> An ADR does **not** move from `Proposed` to `Accepted` until at least one implementation sub-phase has shipped against its principles and validated them, unless the project explicitly decides otherwise in writing.

ADR-008 is currently **Proposed**. It will graduate after at least F4.6C (and ideally a live-DB integration suite verifying dedup / projection / conflict semantics) confirms the boundary semantics. This rule is repeated in the master roadmap §8 (Phase Control Rules §10).

## 6. Plan-Only Definition of Done

Applies to: F4.2A, F4.6A.0, F4.6B-0, future F4.6C-0 / D-0 / E-0 / F-0.

### Required

- **Implementation direction decided.** The plan picks names, paths, predicates, columns, behaviors — the decisions ADR-008 deliberately left as "candidates" graduate to "fixed" here.
- **Exact scope for the next implementation phase defined.** A reader should be able to implement the next sub-phase mechanically from the plan, with no architectural questions left to resolve.
- **Out-of-scope items listed.** What the implementation phase explicitly does NOT do.
- **Forbidden areas listed.** Restating §12's checklist with phase-specific concrete examples is welcome (F4.6B-0 §14.2 / §17 are the canonical templates).
- **Risks and mitigations documented.** A risks table is the validated format.
- **Acceptance criteria for the implementation phase defined.** The plan's §N "Acceptance Criteria" becomes the implementation phase's gate.
- **No runtime / schema / frontend changes** in the plan phase itself.

### Outcome

A plan is "done" when the implementation phase can begin **without further architectural review**. Schema names are decided, service shapes are decided, env flags are named, dedup keys are pinned down. The implementation phase is then a mechanical translation.

## 7. Schema / Migration Definition of Done

Applies to: F4.1, F4.2B, F4.6A.1, and any future phase that adds/modifies a Prisma migration (e.g. future F4.6C.1 if it edits schema, future operational migrations).

### Required

- **`schema.prisma` changes are intentional and reviewed.** Every field add / remove / type change is justified in the migration's report.
- **Migration directory created with a clear name.** Convention: `<UTC-timestamp>_<phase>_<short>` (e.g. `20260526000000_f4_6a_telemetry_hardening`).
- **`migration.sql` reviewed.** Hand-authored SQL is the project's pattern (F4.2B baseline, F4.6A.1); CHECK constraints, partial indexes, COMMENT statements, and views all live in raw SQL.
- **Hand-authored SQL documented when used.** A leading comment block in `migration.sql` explains intent and references the phase plan (F4.6A.1's migration is the validated template).
- **`down.sql` provided when useful for operational rollback.** Required when the forward migration is non-trivial; optional when the migration is a single trivial DDL. See DX-2 §9 for the policy.
- **Existing views / tables are preserved unless destructive changes are explicitly approved.** F4.6A.1 §5 / §6 preserved `live_readings_projection` (VIEW) as a non-destructive coexistence — that's the validated default.
- **Prisma schema validates.** `prisma validate` returns `The schema at prisma/schema.prisma is valid 🚀`.
- **Prisma client generates cleanly.** `prisma generate` succeeds; the regenerated client has the expected new model accessors.
- **Local DB migration validation is run** per `docs/operations/RVF_Malinois_Local_DB_Migration_Validation_Procedure.md` (DX-2). The destructive variant (§5 of DX-2) is preferred for closeout reporting; the non-destructive variant (§10) is acceptable for day-to-day work.
- **Backend lint / typecheck / build / test pass** when the Prisma client affects runtime types (e.g. new models exposed to existing services).
- **Workspace lint / typecheck / build pass** when web build cache may be affected. Frontend is normally cached and untouched in schema phases.
- **Closeout report created** referencing the validation outputs.
- **No unrelated runtime / frontend changes** unless explicitly part of the phase.

### Recommended commands

```
pnpm --filter @rvf/backend exec prisma validate
pnpm --filter @rvf/backend exec prisma generate
pnpm --filter @rvf/backend run lint
pnpm --filter @rvf/backend run typecheck
pnpm --filter @rvf/backend run build
pnpm --filter @rvf/backend run test
pnpm run lint
pnpm run typecheck
pnpm run build
```

For the clean-local-DB validation (recommended for the phase closeout), see DX-2 §5 in `docs/operations/RVF_Malinois_Local_DB_Migration_Validation_Procedure.md`. The DX-2 procedure uses **`prisma migrate deploy`**, not `migrate dev`, to avoid the "Enter a name for the new migration" trap on hand-authored SQL.

## 8. Backend Runtime Definition of Done

Applies to: F4.4A → F4.4F, F4.6B.1, future F4.6C.1 / D.1 / E.1, future runtime modules.

### Required

- **Scope matches the approved plan.** The phase's plan (or brief, for phases without a separate plan) is the authoritative scope.
- **Files changed are limited to the intended backend domain.** A telemetry-ingestion phase modifies `apps/backend/src/telemetry/` (and minimally `app.module.ts`). It does not modify Wells, Tenants, or Equipment without explicit authorization.
- **No frontend changes** unless explicitly approved.
- **No Prisma schema / migration changes** unless the phase is also a schema phase (rare; usually split).
- **Validation contracts are tested.** Every Zod schema / DTO surface is exercised by at least one test.
- **Service behavior is tested.** Happy paths, every failure / quarantine reason, every outcome category.
- **Negative / isolation tests added for forbidden areas.** F4.6B.1 §16.2 tests #17 / #18 / #19 / #20 are the validated template — "service does not call `prisma.liveReading.*` / `prisma.alarmEvent.*` / Jobs / WebSocket".
- **Backend lint / typecheck / build / test pass.** Lint with `--max-warnings 0`.
- **Workspace lint / typecheck / build pass** when appropriate. Web build cache should hit (FULL TURBO) when frontend is untouched.
- **Closeout report created.** Including a "What this phase explicitly did NOT do" section (F4.6B.1 §9 is the canonical template).
- **Forbidden integrations are explicitly confirmed absent.** State in the closeout: no MQTT / Modbus / OPC-UA / ThingsBoard / Node-RED / PLC / edge-gateway / historian library added, no `apps/backend/package.json` change, etc.

### Special checks for telemetry backend phases

These are project-specific rules, not generic backend rules:

- **No `live_readings` writes** unless the phase is **F4.6C or later** and explicitly approved. Verified by isolation test asserting `prisma.liveReading.*` is never called.
- **No `alarm_events` writes** unless the phase is **F4.6D or later** and explicitly approved. Verified by isolation test asserting `prisma.alarmEvent.*` is never called.
- **No WebSocket / SSE emit** unless the phase is **F4.6E or later** and explicitly approved. `apps/backend/src/realtime/` is untouched until F4.6E owns its first emit.
- **No external protocol integration** (MQTT, Modbus, OPC-UA, ThingsBoard, Node-RED, PLC, edge-gateway, historian) unless a **dedicated adapter phase** approves it. Each bridge gets its own plan / ADR / sub-phase.
- **No Jobs behavior** unless a dedicated **Jobs phase** exists. `closed_job` is not in any CHECK enum; inserted rows carry `job_id = null` until a Jobs phase is authorized.

These rules are restated in the master roadmap §8 (Phase Control Rules §7–§9).

### Recommended commands

```
pnpm --filter @rvf/backend exec prisma validate
pnpm --filter @rvf/backend exec prisma generate
pnpm --filter @rvf/backend run lint
pnpm --filter @rvf/backend run typecheck
pnpm --filter @rvf/backend run build
pnpm --filter @rvf/backend run test
pnpm run lint
pnpm run typecheck
pnpm run build
```

`prisma validate` / `generate` are included even for runtime-only phases because the generated client is used for type-checking the new service.

## 9. Frontend / UI Adapter Definition of Done

Applies to: F4.5A → F4.5E (adapter foundation), F4.5F (first screen migration), future F4.5G+ (Wells / Equipment / Catalog screen migrations).

### Required

- **UI changes match approved screen / adapter scope.** Per-screen migration phases touch one screen at a time; adapter foundation phases touch the adapter layer only.
- **No backend / schema changes** unless explicitly approved.
- **Mock data replaced only where adapter / API wiring is approved.** The F4.5 environment-variable switch (`NEXT_PUBLIC_RVF_DATA_SOURCE`) is the seam; mock-default remains the standing rule until the phase explicitly cuts a screen to `api`.
- **Visual behavior is preserved or intentionally changed.** Any layout / typography / spacing change is called out in the closeout. F4.5F preserved the layout verbatim — that's the validated default.
- **Loading / error / empty states considered.** The F4.5F closeout documents degraded states (api-mode units screen with no live readings) as known limitations rather than letting them surface as silent UI regressions.
- **Frontend lint / typecheck / build pass.**
- **Workspace validation run** if appropriate (workspace `lint` / `typecheck` / `build`).
- **Closeout report created** for meaningful UI milestones (F4.5F has one, commit `9e861ce`). Trivial per-component cleanups may skip the closeout if the phase plan permits.

### Recommended commands

```
pnpm --filter @rvf/web run lint
pnpm --filter @rvf/web run typecheck
pnpm --filter @rvf/web run build
pnpm run lint
pnpm run typecheck
pnpm run build
```

For frontend-only phases, the backend target should remain cached in workspace runs (FULL TURBO).

## 10. Full-Stack Phase Definition of Done

Applies to: any future phase that intentionally spans backend + frontend in one commit. None has been needed in the F4 arc; F4.6C+ may or may not need one.

### Required

- **Explicit plan required before implementation.** No "let's do backend + frontend together" without a plan that pre-decides the API contract.
- **API contract documented.** The wire shape / endpoint path / status codes / error envelope are pinned down in the plan.
- **Backend tests and frontend validation both run.**
- **Database changes separated or clearly documented.** A schema change inside a full-stack phase is acceptable only if the plan explicitly authorizes it and the migration is reviewable in the same PR.
- **UI state behavior documented.** Loading / error / empty / partial-success states; race conditions; how the UI responds to backend errors.
- **No external integration creep.** Full-stack does not become a back door for "while we're at it, add MQTT".
- **Closeout report created** with sections for both backend and frontend deltas.
- **Deployment / migration implications documented.** If the schema change requires a migration order before the frontend change ships, say so.

## 11. Closeout Report Definition of Done

Applies to: every major implementation or architecture milestone. Plan-only and small-doc phases may skip closeouts if the phase plan permits.

A closeout should include:

- **Executive summary.** What changed, in 2–4 paragraphs. F4.6B.1 §1 is the validated template.
- **Commit context.** The intended or completed commit hash, prior-phase commits, branch. Real hashes only — never invented.
- **Files changed.** Tabular list with path + change-type ("New" / "Modified") + one-line description.
- **Scope completed.** Bulleted list of what landed.
- **Validation performed.** Tabular list of commands run + observed results.
- **Explicit non-implementation confirmation.** A "What this phase explicitly did NOT do" section listing every forbidden area (live_readings / alarm_events / WebSocket / Jobs / external integrations / Prisma schema / frontend / package files / CI). F4.6B.1 §9 is the canonical template.
- **Deferred work.** What was deliberately left for future phases, with the owning phase named (e.g. "`live_readings` updater — F4.6C").
- **Risks or follow-up notes.** Open questions or risks the next phase should attend to.
- **Recommended next phase.** Named explicitly, with any constraints (e.g. "F4.6C should focus on populating `live_readings` and exposing the latest-value endpoint; it must not introduce external protocols").

### Timing

A closeout should be **created before commit when possible**, so the commit lands with the closeout in it. F4.6B.1 followed this pattern. When the closeout cannot be ready at commit time (e.g. validation outputs need overnight runs), it ships as a separate immediate follow-up commit; never as a long-tail backfill.

## 12. Forbidden-Area Checklist

Before committing, review the following questions. The answer should be **"no"** unless the phase explicitly approved it.

1. Did this phase touch backend source (`apps/backend/src/**`)?
2. Did this phase touch frontend source (`apps/web/**`)?
3. Did this phase touch the Prisma schema (`apps/backend/prisma/schema.prisma`)?
4. Did this phase create or modify a migration (`apps/backend/prisma/migrations/**`)?
5. Did this phase touch package / config / CI files (`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig*.json`, `vitest.config.ts`, `eslint.config.mjs`, `docker-compose.yml`, `.github/**`)?
6. Did this phase touch seed data (`apps/backend/prisma/seed.f4.ts`)?
7. Did this phase introduce Jobs (any `prisma.job.*` lookup or write, any Jobs UI, any `closed_job` reason, any active-job state machine)?
8. Did this phase introduce external integrations (MQTT, Modbus, OPC-UA, ThingsBoard, Node-RED, PLC, edge-gateway, historian)?
9. Did this phase write `live_readings` (`prisma.liveReading.*`)?
10. Did this phase write `alarm_events` (`prisma.alarmEvent.*`)?
11. Did this phase emit WebSocket / SSE (anything under `apps/backend/src/realtime/`, any `socket.io` emit, any SSE response)?
12. Did this phase change auth / security behavior (new tokens, new headers, new middleware, new role checks)?
13. Did this phase change runtime flags (new `process.env.*` reads in code, new env flags in `app.module.ts`)?

> An answer of **"yes"** is allowed **only if** the phase's brief or plan explicitly approves it. If a "yes" appears unexpectedly, stop and review before committing. Closeout reports should explicitly state, in the non-implementation confirmation section, that each of these checks was performed and what the answer was.

Walk through the list in order before every commit. It takes one minute and catches the failure modes that hurt most.

## 13. Standard Validation Command Matrix

The validation surface depends on the phase type. The table below codifies the expected commands.

| Phase type | `prisma validate` | `prisma generate` | DX-2 local DB validation | backend lint | backend typecheck | backend build | backend test | workspace lint | workspace typecheck | workspace build | frontend lint/typecheck/build |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Documentation-only** | — | — | — | — | — | — | — | — | — | — | — |
| **Architecture / ADR** | — | — | — | — | — | — | — | — | — | — | — |
| **Plan-only** | — | — | — | — | — | — | — | — | — | — | — |
| **Schema / migration** | **required** | **required** | **required** (clean variant for closeout) | required | required | required | required (if client affects runtime types) | required | required | required (web cached if untouched) | — |
| **Backend runtime** | required (client used for types) | required | — (unless schema also changed) | **required** | **required** | **required** | **required** | required | required | required (web cached if untouched) | — |
| **Frontend / UI adapter** | — | — | — | — | — | — | — | required | required | required | **required** |
| **Full-stack** | required if schema changed | required if schema changed | required if schema changed | required | required | required | required | required | required | required | required |
| **Operations / runbook** | — | — | — | — | — | — | — | — | — | — | — |
| **Closeout** | — | — | — | — | — | — | — | — | — | — | — |

For every phase: `git status` and `git diff --stat` are always run; they are not in the table because they are universal.

### Command reference

Backend (run from repo root):

```
pnpm --filter @rvf/backend exec prisma validate
pnpm --filter @rvf/backend exec prisma generate
pnpm --filter @rvf/backend run lint
pnpm --filter @rvf/backend run typecheck
pnpm --filter @rvf/backend run build
pnpm --filter @rvf/backend run test
```

Frontend:

```
pnpm --filter @rvf/web run lint
pnpm --filter @rvf/web run typecheck
pnpm --filter @rvf/web run build
```

Workspace (turbo):

```
pnpm run lint
pnpm run typecheck
pnpm run build
```

Local DB clean-validation (DX-2 §5):

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

## 14. Commit and Push Definition of Done

Every phase ends with the same six-step sequence:

```
git status
git add <specific files>
git status
git commit -m "<clear message>"
git push origin main
git status
```

### Why this exact sequence

1. **First `git status`** confirms the working tree state matches expectations before staging.
2. **`git add <specific files>`** — name files explicitly. `git add .` and `git add -A` are discouraged because they can sweep up files that the phase did not authorize.
3. **Second `git status`** confirms staging matches expectations.
4. **`git commit -m "..."`** with a clear message (see commit message rules below).
5. **`git push origin main`** lands the phase on the shared branch.
6. **Final `git status`** confirms `nothing to commit, working tree clean`.

### Commit message rules

- **Short and clear.** Under 70 characters when possible. The first line is the subject; a longer body is optional but rarely needed for one-phase commits.
- **Phase-aware.** The phase identifier appears at or near the start of the message.
- **Use a verb.** `Add`, `Implement`, `Wire`, `Document`, `Update`, `Fix`. Avoid vague openers like `Updates`, `Changes`, `Fixes`, `Tweaks`.
- **Avoid noise.** No emoji unless the user explicitly requests them. No "WIP". No `[skip ci]` games.
- **One phase per commit when possible.** A phase that delivers a plan + a closeout in one go can use one commit. A phase that delivers schema + runtime is usually two phases (split per §3 phase-type rules).

Validated examples from the project's actual log:

| Commit | Message |
|---|---|
| `c12a29c` | `Add F4.6 telemetry persistence architecture ADR` |
| `334bfc5` | `Add F4.6 telemetry persistence closeout report` |
| `014df37` | `Add F4.6A schema hardening plan` |
| `6be7842` | `Add F4.6A telemetry schema hardening migration` |
| `c4ea18a` | `Add F4.6B ingestion boundary plan` |
| `1495457` | `Add F4.6B telemetry ingestion boundary skeleton` |
| `b19e77a` | `Add RVF Malinois master roadmap` |
| `e3ccb52` | `Add local DB migration validation procedure` |

Every project commit since the F4.6 arc started follows the **`Add <phase-id> <short title>`** pattern. Maintain it.

### One-phase-per-commit guidance

A phase is one logical change. When the phase is small (plan + closeout in one shot), a single commit is correct. When the phase is large (schema + closeout, runtime + closeout, or rare full-stack work), prefer separate commits where each step closes against this DoD. The most common pattern in the F4.6 arc is **one commit per phase** because each phase deliberately scopes to one concern.

Never amend a published commit. If a fix is needed after push, ship a follow-up commit (`Update F4.6B ingestion boundary skeleton — typo in service comment`). Amending shared history is forbidden.

### Pre-push checklist

Before `git push origin main`:

- Have you read the diff of every staged file?
- Does the commit message accurately describe the change?
- Did `pnpm run lint` / `typecheck` / `build` (and `test` if applicable) pass within the last few minutes?
- Is the closeout report present in the commit (or scheduled as the immediate follow-up commit)?
- Is the answer to every §12 forbidden-area question what the phase plan expected?

## 15. Roadmap Update Rule

The master roadmap (`docs/architecture/RVF_Malinois_Master_Roadmap.md`) should be updated:

- **After major phases close.** Move the phase from "Current" / "Upcoming" / "Deferred" to "Closed". Append the closing commit hash.
- **When a phase changes status.** Upcoming → Current, Current → Closed, Deferred → Upcoming.
- **When roadmap order changes.** Update §7 (Recommended Execution Order).
- **When deferred items become active.** Reflect the change in §3 and §7.
- **When new ADRs are added.** Reference them in §4 (Architecture Decision Summary).

Most closeout reports will trigger a roadmap update. Ship the roadmap update **in the same commit as the closeout when possible** so the master document and the phase's own deliverable stay in lockstep.

> **For DX-3 itself:** do not update the master roadmap unless judged essential. This document is a DoD — it codifies existing practice rather than altering the phase plan. The roadmap already lists DX-3 as a "Next" phase in §3 and §7; closing DX-3 will warrant a roadmap update, but that update belongs to the next closeout commit, not to this DX-3 commit.

## 16. Applying This DoD to Upcoming F4.6C

F4.6C will land as two sub-phases. Each gets its own DoD application:

### F4.6C-0 — Live Readings Projection Updater Plan (Plan-only DoD)

Apply §6 (Plan-Only Definition of Done).

- **No runtime code.** The plan decides; F4.6C.1 implements.
- **Define `live_readings` updater behavior.** Concrete decisions:
  - Where does the upsert run (transactional with `telemetry_readings.create`? post-commit hook? separate Nest provider injected into `TelemetryIngestionService`?).
  - When does the upsert run (only on `quality === 'good'` per ADR-008 §3 decision 5? always, with quality stored?).
  - What is the upsert key (`(unit_id, sensor_id, canonical_tag_id)` from the F4.6A.1 `live_readings_unit_sensor_tag_uk` constraint).
  - Stale-detection rule (`new.timestamp > stored.timestamp` overwrite, else skip).
  - Fate of the F4.2 `live_readings_projection` VIEW.
  - Latest-value read endpoint shape (path, query params, response).
- **Out-of-scope items listed.** Alarm evaluation (F4.6D), WebSocket fan-out (F4.6E), external bridges, simulator, Jobs.
- **Forbidden areas listed** (full §12 checklist with concrete phase examples).
- **Acceptance criteria for F4.6C.1** spelled out.

### F4.6C.1 — Live Readings Projection Updater Implementation (Backend runtime DoD)

Apply §8 (Backend Runtime Definition of Done).

- **May write `live_readings`** — and only because F4.6C explicitly owns that scope. This is the first phase authorized to call `prisma.liveReading.*`. The §12 forbidden-area answer to "Did this phase write `live_readings`?" is **"yes — F4.6C scope authorizes it."**
- **Must not write `alarm_events`.** F4.6D owns alarm evaluation. The isolation test asserting `prisma.alarmEvent.*` is never called must be carried over from F4.6B.1.
- **Must not emit WebSocket / SSE.** F4.6E owns realtime fan-out. `apps/backend/src/realtime/` stays untouched.
- **Must not introduce external integrations.** No MQTT / Modbus / OPC-UA / ThingsBoard / Node-RED / PLC / edge-gateway / historian.
- **Must not introduce Jobs.** Inserted projection rows carry no operational-context fields beyond what F4.6A.1's schema provides (no `job_id` on `live_readings` — verified by the F4.6A.1 schema).
- **Must include tests proving projection behavior.** New tests covering: identical late-arrival reading does not overwrite stored projection (timestamp gate); newer `good` reading overwrites; `uncertain` / `bad` quality readings do or do not update per the plan's decision; partial-success batch where some samples accept and update projection while others quarantine.
- **Must include isolation boundary tests.** Carry forward F4.6B.1's pattern: `prisma.alarmEvent.*` never called, `apps/backend/src/realtime/` untouched, no Jobs lookup, no external libs.
- **DX-2 local DB validation** if F4.6C.1 also adds schema (likely not; F4.6A.1 already added the `live_readings` table). If F4.6C.1 modifies schema, DX-2 §5 procedure is run.
- **Closeout report** following F4.6B.1's template, with a section explicitly noting that F4.6C is the first authorized writer of `live_readings`.

## 17. Acceptance Criteria for DX-3

DX-3 is considered complete when:

1. Definition of Done document created at `docs/operations/RVF_Malinois_Definition_of_Done.md`.
2. Phase types defined (§3).
3. Per-phase-type DoD sections present (§4–§11).
4. Validation command matrix included (§13).
5. Forbidden-area checklist included (§12) with the 13 questions and the "no unless explicitly approved" rule.
6. Commit / push rules included (§14) with the six-step sequence and commit message conventions.
7. Closeout report expectations included (§11) with the canonical structure.
8. Roadmap update rule included (§15) — including the explicit decision NOT to update the master roadmap inside DX-3.
9. F4.6C usage guidance included (§16) covering both F4.6C-0 (plan-only DoD) and F4.6C.1 (backend runtime DoD).
10. **Documentation-only.** No code, Prisma schema, migration, test, config, CI, frontend, or runtime file changed.
11. No commit made yet.

---

*DX-3. The shared baseline every future RVF Malinois phase closes against. Update when phase types change or when practice diverges enough to warrant a new section.*
