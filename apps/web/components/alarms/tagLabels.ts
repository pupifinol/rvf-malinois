/**
 * Canonical-tag → human label resolver for the Alarm Center — F2C.
 *
 * The Operations screen already publishes labels for its six headline
 * tiles. The Alarm Center has to surface a slightly wider set (separator
 * internals, gas/liquid outlets, vibration) because a snapshot's enabled
 * sensors can produce alarms on any of them. We extend the existing
 * Operations labels with the rest of the dictionary in `lib/telemetry/tags`
 * so every canonical tag the F2A simulator can emit has a friendly name.
 *
 * If a future canonical tag is added without a label here, we fall back
 * to its canonical string — the UI stays readable rather than blank.
 */
import type { CanonicalTag } from '@rvf/types';

import { CANONICAL_TAGS } from '@/lib/telemetry/tags';

const ALARM_TAG_LABELS: Record<string, string> = {
  [String(CANONICAL_TAGS.PInlet)]: 'Inlet Pressure',
  [String(CANONICAL_TAGS.TInlet)]: 'Inlet Temperature',
  [String(CANONICAL_TAGS.QTotalIn)]: 'Inlet Flow',
  [String(CANONICAL_TAGS.PSep)]: 'Separator Pressure',
  [String(CANONICAL_TAGS.TSep)]: 'Separator Temperature',
  [String(CANONICAL_TAGS.DpWeir)]: 'Weir Differential P.',
  [String(CANONICAL_TAGS.LvlVessel)]: 'Vessel Level',
  [String(CANONICAL_TAGS.PGasOut)]: 'Gas Outlet Pressure',
  [String(CANONICAL_TAGS.TGasOut)]: 'Gas Outlet Temperature',
  [String(CANONICAL_TAGS.QGas)]: 'Gas Rate',
  [String(CANONICAL_TAGS.PLiquidOut)]: 'Liquid Outlet Pressure',
  [String(CANONICAL_TAGS.TLiquidOut)]: 'Liquid Outlet Temperature',
  [String(CANONICAL_TAGS.QLiquid)]: 'Oil Rate',
  [String(CANONICAL_TAGS.WaterCut)]: 'Water Cut',
  [String(CANONICAL_TAGS.VibPump)]: 'Pump Vibration',
};

export const labelForTag = (tag: CanonicalTag): string =>
  ALARM_TAG_LABELS[String(tag)] ?? String(tag);
