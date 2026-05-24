import { describe, expect, it } from 'vitest';

import {
  findTileByLabel,
  findTileByTag,
  OPERATIONS_TILES,
  rollUpUnitStatus,
  type UnitBadgeByTag,
} from './viewModel';

import type { AlarmState } from '@/lib/alarms/types';
import type { TelemetryStatus } from '@/lib/telemetry/models';

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

// ---------------------------------------------------------------------------
// rollUpUnitStatus — unit-card badge derivation
// ---------------------------------------------------------------------------

const DISPLAYED_TAGS = OPERATIONS_TILES.map((t) => t.tag);

const tile = (
  alarm: AlarmState,
  stale: TelemetryStatus,
): { alarm: AlarmState; stale: TelemetryStatus } => ({
  alarm,
  stale,
});

const allLive = (): UnitBadgeByTag => ({
  [String(CANONICAL_TAGS.QLiquid)]: tile('normal', 'live'),
  [String(CANONICAL_TAGS.QGas)]: tile('normal', 'live'),
  [String(CANONICAL_TAGS.WaterCut)]: tile('normal', 'live'),
  [String(CANONICAL_TAGS.PInlet)]: tile('normal', 'live'),
  [String(CANONICAL_TAGS.TInlet)]: tile('normal', 'live'),
  [String(CANONICAL_TAGS.DpWeir)]: tile('normal', 'live'),
});

describe('rollUpUnitStatus — unit card badge logic', () => {
  it('returns TESTING when every displayed tile is reporting live, no alarm', () => {
    const r = rollUpUnitStatus(allLive(), DISPLAYED_TAGS);
    expect(r.status).toBe('TESTING');
    expect(r.liveCount).toBe(6);
    expect(r.staleCount).toBe(0);
    expect(r.enabledCount).toBe(6);
  });

  it('returns ALARM when at least one tile reports a process alarm band', () => {
    const byTag = allLive() as Record<string, { alarm: AlarmState; stale: TelemetryStatus }>;
    byTag[String(CANONICAL_TAGS.PInlet)] = tile('alarm_high', 'live');
    const r = rollUpUnitStatus(byTag, DISPLAYED_TAGS);
    expect(r.status).toBe('ALARM');
    expect(r.worstAlarm).toBe('alarm_high');
  });

  it('returns DEGRADED when some tiles are live and some are stale/offline', () => {
    const byTag = allLive() as Record<string, { alarm: AlarmState; stale: TelemetryStatus }>;
    byTag[String(CANONICAL_TAGS.DpWeir)] = tile('no_data', 'offline');
    byTag[String(CANONICAL_TAGS.TInlet)] = tile('no_data', 'stale');
    const r = rollUpUnitStatus(byTag, DISPLAYED_TAGS);
    expect(r.status).toBe('DEGRADED');
    expect(r.liveCount).toBe(4);
    expect(r.staleCount).toBe(2);
  });

  it('returns OFFLINE when every displayed tile is offline / no-data (Unit #3 case)', () => {
    const offlineByTag: UnitBadgeByTag = {
      [String(CANONICAL_TAGS.QLiquid)]: tile('no_data', 'offline'),
      [String(CANONICAL_TAGS.QGas)]: tile('no_data', 'offline'),
      [String(CANONICAL_TAGS.WaterCut)]: tile('disabled', 'offline'), // disabled mapping
      [String(CANONICAL_TAGS.PInlet)]: tile('no_data', 'stale'),
      [String(CANONICAL_TAGS.TInlet)]: tile('no_data', 'offline'),
      [String(CANONICAL_TAGS.DpWeir)]: tile('no_data', 'offline'),
    };
    const r = rollUpUnitStatus(offlineByTag, DISPLAYED_TAGS);
    expect(r.status).toBe('OFFLINE');
    expect(r.liveCount).toBe(0);
    // 5 enabled (water_cut is disabled and excluded), all stale/offline.
    expect(r.enabledCount).toBe(5);
    expect(r.staleCount).toBe(5);
  });

  it('treats a missing snapshot entry as enabled-but-offline (Unit #3 scenario)', () => {
    // Simulates the real defect: the snapshot only knows q_total_in, but
    // every DISPLAYED tile is missing from byTag. The badge must NOT say
    // TESTING just because some non-displayed tag happens to be flowing.
    const partial: UnitBadgeByTag = {};
    const r = rollUpUnitStatus(partial, DISPLAYED_TAGS);
    expect(r.status).toBe('OFFLINE');
    expect(r.liveCount).toBe(0);
    expect(r.enabledCount).toBe(6);
  });

  it('ignores `disabled` mappings — they neither count toward live nor stale', () => {
    const allDisabled: UnitBadgeByTag = {
      [String(CANONICAL_TAGS.QLiquid)]: tile('disabled', 'offline'),
      [String(CANONICAL_TAGS.QGas)]: tile('disabled', 'offline'),
      [String(CANONICAL_TAGS.WaterCut)]: tile('disabled', 'offline'),
      [String(CANONICAL_TAGS.PInlet)]: tile('disabled', 'offline'),
      [String(CANONICAL_TAGS.TInlet)]: tile('disabled', 'offline'),
      [String(CANONICAL_TAGS.DpWeir)]: tile('disabled', 'offline'),
    };
    const r = rollUpUnitStatus(allDisabled, DISPLAYED_TAGS);
    // No enabled channels at all → OFFLINE per the rule.
    expect(r.status).toBe('OFFLINE');
    expect(r.enabledCount).toBe(0);
  });

  it('does NOT downgrade TESTING to DEGRADED for warning-band live data', () => {
    const byTag = allLive() as Record<string, { alarm: AlarmState; stale: TelemetryStatus }>;
    byTag[String(CANONICAL_TAGS.PInlet)] = tile('warning_high', 'live');
    const r = rollUpUnitStatus(byTag, DISPLAYED_TAGS);
    expect(r.status).toBe('TESTING');
    expect(r.worstAlarm).toBe('warning_high');
  });

  it('ALARM beats stale/offline: a process alarm + degraded comms is still ALARM', () => {
    const byTag: UnitBadgeByTag = {
      [String(CANONICAL_TAGS.QLiquid)]: tile('alarm_high', 'live'),
      [String(CANONICAL_TAGS.QGas)]: tile('no_data', 'offline'),
      [String(CANONICAL_TAGS.WaterCut)]: tile('no_data', 'stale'),
      [String(CANONICAL_TAGS.PInlet)]: tile('no_data', 'offline'),
      [String(CANONICAL_TAGS.TInlet)]: tile('no_data', 'offline'),
      [String(CANONICAL_TAGS.DpWeir)]: tile('no_data', 'offline'),
    };
    const r = rollUpUnitStatus(byTag, DISPLAYED_TAGS);
    expect(r.status).toBe('ALARM');
  });
});
