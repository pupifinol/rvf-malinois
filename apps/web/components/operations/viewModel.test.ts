import { describe, expect, it } from 'vitest';

import { findTileByLabel, findTileByTag, OPERATIONS_TILES } from './viewModel';

import { CANONICAL_TAGS } from '@/lib/telemetry/tags';

describe('Operations view-model', () => {
  it('exposes exactly the six Operations tiles in display order', () => {
    expect(OPERATIONS_TILES.map((t) => t.label)).toEqual([
      'Oil Rate',
      'Gas Rate',
      'Water Cut',
      'Pressure',
      'Temperature',
      'Differential P.',
    ]);
  });

  it('maps each tile to a canonical tag and to a fallback unit', () => {
    for (const t of OPERATIONS_TILES) {
      expect(typeof String(t.tag)).toBe('string');
      expect(t.fallbackUnit.length).toBeGreaterThan(0);
      expect(t.id.length).toBeGreaterThan(0);
    }
  });

  it('uses the canonical pressure/flow tags rather than ad-hoc strings', () => {
    expect(findTileByLabel('Pressure')?.tag).toBe(CANONICAL_TAGS.PInlet);
    expect(findTileByLabel('Oil Rate')?.tag).toBe(CANONICAL_TAGS.QLiquid);
    expect(findTileByLabel('Gas Rate')?.tag).toBe(CANONICAL_TAGS.QGas);
    expect(findTileByLabel('Water Cut')?.tag).toBe(CANONICAL_TAGS.WaterCut);
    expect(findTileByLabel('Temperature')?.tag).toBe(CANONICAL_TAGS.TInlet);
    expect(findTileByLabel('Differential P.')?.tag).toBe(CANONICAL_TAGS.DpWeir);
  });

  it('reverse lookup by tag round-trips for every defined tile', () => {
    for (const t of OPERATIONS_TILES) {
      expect(findTileByTag(t.tag)?.id).toBe(t.id);
    }
  });

  it('returns undefined for an unknown label / tag (graceful failure for UI lookups)', () => {
    expect(findTileByLabel('Nonexistent')).toBeUndefined();
    expect(findTileByTag(CANONICAL_TAGS.VibPump)).toBeUndefined();
  });
});
