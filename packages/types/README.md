# @rvf/types

Shared TypeScript contracts used by both frontend and backend.

- **`brand.ts`** — `Brand<T, B>` utility for type-safe IDs.
- **`domain.ts`** — branded identifiers (`JobId`, `WellId`, …) and domain enums (`Quality`, `AlarmState`, …).
- **`telemetry.ts`** — canonical telemetry / alarm / sensor-health message shapes (`rvf.telemetry.v1`).
- **`realtime.ts`** — WebSocket envelope (`RealtimeMessage`, `ConnectionState`, subscription requests).

### What is NOT here

- Validation runtime (Zod / Valibot). Validation lives in the backend ingest module and in the API client — types alone don't validate.
- Database row types. Those come from Prisma in `apps/backend`.
- UI-specific view models. Those live next to the components in `apps/web`.

### Why a shared package?

Because the canonical telemetry contract is exactly that — a contract — between every piece of the system. If the frontend and backend each define their own `TelemetryMessage`, they will drift, and a field rename will silently misinterpret production data. One source, one truth.
