import { ProductionOverview } from '@/components/portal/ProductionOverview';

/**
 * Client Portal — Production Overview.
 *
 * Customer-facing surface that lets the client follow the wells RVF is
 * currently testing for them. Read-only by design (UI/UX §5): no alarms,
 * no diagnostics, no internal telemetry health — just production, the
 * three protagonist charts (oil, gas, water cut), and a per-well summary.
 *
 * Data today is mocked in `components/portal/data/clientPortal.mock.ts`.
 * F6 swaps that for the tenant-scoped read-model API; the page composition
 * is the API the back-end has to match.
 */
export default function ClientPortalHome() {
  return <ProductionOverview />;
}
