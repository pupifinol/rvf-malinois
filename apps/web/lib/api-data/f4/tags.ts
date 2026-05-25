/**
 * F4.5B — Canonical-tag dictionary adapter.
 *
 * Mirrors the F4.4C endpoint surface:
 *   - `adapterListCanonicalTags(params?)` → `CanonicalTag[]` filtered by
 *     optional `category` / `canonicalUnit` / `deprecated`, ordered by
 *     `(category asc, name asc)`.
 *   - `adapterGetCanonicalTag(name)` → one tag by stable business name
 *     (lowercase snake_case: `p_inlet`, `q_gas`, …) or `RvfApiError(404)`.
 *
 * The dictionary is global (no tenant scope). The F4.5B mock fixtures
 * mirror all 22 entries the F4.3 seed inserts so a consumer in mock mode
 * sees the full dictionary deterministically.
 */

import { MOCK_F4_CANONICAL_TAGS } from './mock-fixtures';

import {
  type CanonicalTag,
  type GetOptions,
  RvfApiError,
  getCanonicalTag,
  isApiSource,
  listCanonicalTags,
} from '@/lib/api/f4';

export interface ListCanonicalTagsParams {
  category?: string;
  canonicalUnit?: string;
  deprecated?: boolean;
}

const filterMock = (params?: ListCanonicalTagsParams): CanonicalTag[] => {
  let rows: CanonicalTag[] = [...MOCK_F4_CANONICAL_TAGS];
  if (params?.category) rows = rows.filter((t) => t.category === params.category);
  if (params?.canonicalUnit) rows = rows.filter((t) => t.canonicalUnit === params.canonicalUnit);
  if (params?.deprecated !== undefined) {
    rows = rows.filter((t) => t.deprecated === params.deprecated);
  }
  return rows;
};

const orderByCategoryThenName = (rows: CanonicalTag[]): CanonicalTag[] =>
  [...rows].sort((a, b) => {
    const categoryCmp = a.category.localeCompare(b.category);
    if (categoryCmp !== 0) return categoryCmp;
    return a.name.localeCompare(b.name);
  });

export const adapterListCanonicalTags = async (
  params?: ListCanonicalTagsParams,
  options?: GetOptions,
): Promise<CanonicalTag[]> => {
  if (isApiSource()) {
    return listCanonicalTags(params, options);
  }
  return Promise.resolve(orderByCategoryThenName(filterMock(params)));
};

export const adapterGetCanonicalTag = async (
  name: string,
  options?: GetOptions,
): Promise<CanonicalTag> => {
  if (isApiSource()) {
    return getCanonicalTag(name, options);
  }
  const row = MOCK_F4_CANONICAL_TAGS.find((t) => t.name === name);
  if (!row) {
    return Promise.reject(
      new RvfApiError(404, `mock:/tags/${name}`, null, `Canonical tag '${name}' not found.`),
    );
  }
  return Promise.resolve(row);
};
