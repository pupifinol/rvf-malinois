/**
 * F4.5B — barrel for the F4 data-source-aware adapter layer.
 *
 * Consumers import from `@/lib/api-data/f4` rather than reaching into
 * individual files. Each function delegates to either the F4.5B mock
 * fixtures (default) or the F4 backend endpoint wrappers based on
 * `NEXT_PUBLIC_RVF_DATA_SOURCE`. See `@/lib/api/f4/config.ts`.
 *
 * Scope (F4.5B): tenants + wells + canonical tags. Equipment / jobs /
 * telemetry adapters land in F4.5C / D / E.
 */

export { type ListTenantsParams, adapterListTenants, adapterGetTenant } from './tenants';
export { type ListWellsParams, adapterListWells, adapterGetWell } from './wells';
export {
  type ListCanonicalTagsParams,
  adapterListCanonicalTags,
  adapterGetCanonicalTag,
} from './tags';

// Re-export the deterministic mock fixtures so tests / Storybook / dev
// tooling can reference them without reaching into the implementation.
export { MOCK_F4_TENANTS, MOCK_F4_WELLS, MOCK_F4_CANONICAL_TAGS } from './mock-fixtures';
