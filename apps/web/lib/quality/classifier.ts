/**
 * Data-quality classifier — F2A pure logic.
 *
 * The wire-level `DataQuality` enum is granular ('good' | 'estimated' |
 * 'uncertain' | 'bad'). UIs and downstream logic usually only need a coarser
 * decision: "is this usable, derated, or unusable?".
 */
import type { DataQuality } from '../telemetry/models';

export type QualityBand = 'usable' | 'derated' | 'unusable';

const TABLE: Record<DataQuality, QualityBand> = {
  good: 'usable',
  estimated: 'derated',
  uncertain: 'derated',
  bad: 'unusable',
};

export const classifyQuality = (q: DataQuality): QualityBand => TABLE[q];

export const isUsable = (q: DataQuality): boolean => classifyQuality(q) === 'usable';
