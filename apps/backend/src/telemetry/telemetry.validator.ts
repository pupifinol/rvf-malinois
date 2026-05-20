import { Injectable } from '@nestjs/common';
import { ZodError } from 'zod';

import { type TelemetryEnvelope, TelemetryEnvelopeSchema } from './contracts/envelope';

export interface ValidationOk {
  ok: true;
  envelope: TelemetryEnvelope;
}

export interface ValidationFail {
  ok: false;
  /** Human-readable reason — short, suitable for an audit log entry. */
  reason: string;
  /** Structured Zod issues for programmatic handling. */
  issues: ZodError['issues'];
}

export type ValidationResult = ValidationOk | ValidationFail;

/**
 * TelemetryValidator — single point of entry for inbound telemetry envelopes.
 *
 * Validates SHAPE only (per F1.5 guidance #7 — no transformation at ingest).
 * Returns a discriminated union so the caller can choose its policy:
 *   - on `ok: true`  → adapter explodes the envelope into N hypertable rows.
 *   - on `ok: false` → adapter must quarantine via LateTelemetryQuarantine
 *                      (per F1.5 guidance #1 — never silently drop).
 *
 * The validator is intentionally side-effect-free + dependency-free so it can
 * be reused in scripts, ingest pipelines, and tests.
 */
@Injectable()
export class TelemetryValidator {
  validate(input: unknown): ValidationResult {
    const parsed = TelemetryEnvelopeSchema.safeParse(input);
    if (parsed.success) {
      return { ok: true, envelope: parsed.data };
    }
    const headline = parsed.error.issues[0];
    const reason = headline
      ? `${headline.path.join('.') || '<root>'}: ${headline.message}`
      : 'envelope did not match TelemetryEnvelopeSchema';
    return { ok: false, reason, issues: parsed.error.issues };
  }
}
