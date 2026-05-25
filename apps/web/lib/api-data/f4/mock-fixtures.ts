/**
 * F4.5B — deterministic mock fixtures aligned with the F4.3 seed.
 *
 * These fixtures are intentionally a thin, F4-shaped subset of the data
 * `apps/backend/prisma/seed.f4.ts` produces. The frontend mock adapter
 * branch under `apps/web/lib/api-data/f4/` returns these objects so a
 * screen consuming the adapter sees the **same response shapes** in mock
 * mode and in API mode — only the transport differs.
 *
 * Two scopes are intentional:
 *
 *   1. The F3 mock files (`mockUnits` / `mockSensors` / `mockAlarms` /
 *      `mockTelemetry`) stay byte-for-byte untouched. They feed the
 *      existing UI through `apps/web/lib/api-data/index.ts`. The F4
 *      domain entities (tenants / wells / canonical tags) had no F3 mock
 *      yet because no existing screen consumed them — F4.5B introduces
 *      them now without disturbing F3.
 *
 *   2. The fixtures here are NOT a 1:1 copy of every seed row. Only the
 *      reference tenant, the reference well, and the canonical-tag
 *      dictionary are mirrored — that is the surface F4.5B exposes
 *      through the adapter. Wider seed coverage (equipment / jobs /
 *      telemetry) is intentionally deferred to F4.5C / D / E.
 *
 * All UUID values are deterministic placeholders shaped like
 * `00000000-0000-0000-0000-XXXXXXXXXXXX`; they do NOT match the real
 * `gen_random_uuid()` ids that the seed generates at runtime. Consumers
 * that need a real id must run the seed and query the API.
 */

import type { CanonicalTag, Tenant, Well } from '@/lib/api/f4';

const MOCK_TIMESTAMP = '2026-05-24T00:00:00.000Z';

const RVF_INTERNAL_TENANT_ID = '00000000-0000-0000-0000-000000000001';

export const MOCK_F4_TENANTS: readonly Tenant[] = Object.freeze([
  {
    id: RVF_INTERNAL_TENANT_ID,
    name: 'RVF Internal',
    status: 'active',
    residencyHint: 'local-dev',
    createdAt: MOCK_TIMESTAMP,
    updatedAt: MOCK_TIMESTAMP,
  },
]);

export const MOCK_F4_WELLS: readonly Well[] = Object.freeze([
  {
    id: '00000000-0000-0000-0000-000000004400',
    tenantId: RVF_INTERNAL_TENANT_ID,
    clientId: null,
    name: 'Reference Well A',
    fieldOrSite: 'Reference Field',
    location: 'Local Dev',
    type: 'test',
    fluid: 'multiphase',
    designLimits: {
      max_pressure_psi: 5000,
      max_temperature_degF: 250,
      max_liquid_flow_bpd: 10000,
      max_gas_flow_MMSCFD: 5,
    },
    createdAt: MOCK_TIMESTAMP,
    updatedAt: MOCK_TIMESTAMP,
    tenant: {
      id: RVF_INTERNAL_TENANT_ID,
      name: 'RVF Internal',
      status: 'active',
    },
  },
]);

/**
 * Canonical-tag dictionary — mirrors the 22 entries seeded by F4.3
 * (`apps/backend/prisma/seed.f4.ts`). Field values match the seed exactly.
 */
export const MOCK_F4_CANONICAL_TAGS: readonly CanonicalTag[] = Object.freeze([
  // Pressure
  tag(
    'p_inlet',
    'Inlet pressure',
    'psi',
    'pressure',
    1,
    'Process pressure measured at the unit inlet manifold.',
  ),
  tag(
    'p_outlet',
    'Outlet pressure',
    'psi',
    'pressure',
    1,
    'Process pressure measured at the unit outlet manifold.',
  ),
  tag(
    'p_separator',
    'Separator pressure',
    'psi',
    'pressure',
    1,
    'Static pressure inside the three-phase separator vessel.',
  ),
  tag(
    'dp_filter',
    'Filter differential P',
    'psi',
    'pressure',
    2,
    'Differential pressure across the inlet filter / strainer.',
  ),
  // Temperature
  tag(
    't_inlet',
    'Inlet temperature',
    'degF',
    'temperature',
    1,
    'Process temperature at the unit inlet.',
  ),
  tag(
    't_outlet',
    'Outlet temperature',
    'degF',
    'temperature',
    1,
    'Process temperature at the unit outlet.',
  ),
  tag(
    't_separator',
    'Separator temperature',
    'degF',
    'temperature',
    1,
    'Internal separator temperature.',
  ),
  // Flow
  tag('q_liquid', 'Total liquid flow rate', 'bpd', 'flow', 1, 'Aggregate liquid flow rate.'),
  tag(
    'q_gas',
    'Total gas flow rate',
    'MMSCFD',
    'flow',
    3,
    'Aggregate gas flow rate, normalised to MMSCFD.',
  ),
  tag('q_oil', 'Oil flow rate', 'bpd', 'flow', 1, 'Oil-phase flow rate.'),
  tag('q_water', 'Water flow rate', 'bpd', 'flow', 1, 'Water-phase flow rate.'),
  // Volume / totals
  tag(
    'v_liquid_total',
    'Cumulative liquid volume',
    'bbl',
    'volume',
    1,
    'Cumulative liquid volume since job start.',
  ),
  tag(
    'v_gas_total',
    'Cumulative gas volume',
    'MMSCF',
    'volume',
    3,
    'Cumulative gas volume since job start.',
  ),
  tag(
    'v_oil_total',
    'Cumulative oil volume',
    'bbl',
    'volume',
    1,
    'Cumulative oil volume since job start.',
  ),
  tag(
    'v_water_total',
    'Cumulative water volume',
    'bbl',
    'volume',
    1,
    'Cumulative water volume since job start.',
  ),
  // Level
  tag(
    'level_separator',
    'Separator liquid level',
    '%',
    'level',
    1,
    'Liquid level inside the separator as a percentage of full range.',
  ),
  // Vibration
  tag('vib_x', 'Vibration X-axis', 'in/s', 'vibration', 3, 'RMS vibration on the X axis (radial).'),
  tag('vib_y', 'Vibration Y-axis', 'in/s', 'vibration', 3, 'RMS vibration on the Y axis (radial).'),
  tag('vib_z', 'Vibration Z-axis', 'in/s', 'vibration', 3, 'RMS vibration on the Z axis (axial).'),
  // Status / quality
  tag(
    'battery_status',
    'Transmitter battery %',
    '%',
    'status',
    0,
    'Remaining battery on the wireless transmitter, percent.',
  ),
  tag(
    'signal_quality',
    'Wireless signal RSSI',
    '%',
    'status',
    0,
    'Normalised signal-quality indicator (0-100).',
  ),
  tag(
    'device_status',
    'Device status code',
    'state',
    'status',
    0,
    'Device-reported state machine value (string).',
  ),
]);

function tag(
  name: string,
  displayName: string,
  canonicalUnit: string,
  category: string,
  precision: number,
  description: string,
): CanonicalTag {
  return {
    id: `00000000-0000-0000-0000-${hashSuffix(name)}`,
    name,
    displayName,
    canonicalUnit,
    category,
    precision,
    description,
    deprecated: false,
    createdAt: MOCK_TIMESTAMP,
    updatedAt: MOCK_TIMESTAMP,
  };
}

/** Deterministic 12-hex-digit suffix derived from the canonical-tag name. */
function hashSuffix(name: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h = Math.imul(h ^ name.charCodeAt(i), 0x01000193) >>> 0;
  }
  // Spread the 32-bit hash across 12 hex digits by interleaving the same
  // value with its inverse. Plenty of room for the 22-tag dictionary; this
  // is for display determinism only — fixtures never collide with backend
  // UUIDs because the leading 28 bits are always zero.
  const hex = h.toString(16).padStart(8, '0');
  return `0000${hex}`;
}
