/**
 * RVF canonical tag dictionary — F2A foundation.
 *
 * Per ADR-003/004, the dictionary of canonical tags is FIXED and governed by
 * RVF (e.g. `p_inlet` always means the same thing across the platform). What
 * *is* configurable per job is the mapping from each physical sensor to one
 * of these canonical names — captured in `CommissioningSnapshot.sensors`.
 *
 * This list seeds F2A. It can grow over time; what cannot happen is two
 * different things sharing the same canonical name.
 */
import { brand } from '@rvf/types';

import type { CanonicalTag } from '@rvf/types';

/** Construct a CanonicalTag at a boundary. The brand has no runtime cost. */
export const asCanonicalTag = (s: string): CanonicalTag => brand<string, 'CanonicalTag'>(s);

export const CANONICAL_TAGS = {
  // Inlet (multiphase)
  PInlet: asCanonicalTag('p_inlet'),
  TInlet: asCanonicalTag('t_inlet'),
  QTotalIn: asCanonicalTag('q_total_in'),

  // Separator internals
  PSep: asCanonicalTag('p_sep'),
  TSep: asCanonicalTag('t_sep'),
  DpWeir: asCanonicalTag('dp_weir'),
  LvlVessel: asCanonicalTag('lvl_vessel'),

  // Gas outlet
  PGasOut: asCanonicalTag('p_gas_out'),
  TGasOut: asCanonicalTag('t_gas_out'),
  QGas: asCanonicalTag('q_gas'),

  // Liquid outlet
  PLiquidOut: asCanonicalTag('p_liquid_out'),
  TLiquidOut: asCanonicalTag('t_liquid_out'),
  QLiquid: asCanonicalTag('q_liquid'),
  WaterCut: asCanonicalTag('water_cut'),

  // Rotating equipment
  VibPump: asCanonicalTag('vib_pump'),
} as const;

export type CanonicalTagKey = keyof typeof CANONICAL_TAGS;
