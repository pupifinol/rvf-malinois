'use client';

import { useMemo, useState } from 'react';

import {
  RANGE_SPANS,
  VARIABLE_META,
  averageWaterCut,
  buildPortalSnapshot,
  buildProductionHistory,
  sumWellsGas,
  sumWellsOil,
  type ProductionSeriesSpan,
} from './data/clientPortal.mock';
import { ProductionChartCard } from './ProductionChartCard';
import { SelectedWellHeader } from './SelectedWellHeader';
import { WellOverviewCard } from './WellOverviewCard';

/**
 * ProductionOverview — interactive client portal screen.
 *
 * Owns two pieces of view-state:
 *   - `selectedWellId`: which well the three protagonist charts focus on.
 *   - `range`: which time window the chart row shows (1H / 6H / 24H / 7D).
 *
 * Everything else is derived deterministically from the local mock so the
 * page is SSR-safe and renders identically on the first client paint.
 */
export const ProductionOverview = () => {
  const snapshot = useMemo(() => buildPortalSnapshot(), []);
  const firstWellId = snapshot.wells[0]?.id ?? '';
  const [selectedWellId, setSelectedWellId] = useState<string>(firstWellId);
  const [range, setRange] = useState<ProductionSeriesSpan['label']>('6H');

  const DEFAULT_SPAN: ProductionSeriesSpan = RANGE_SPANS[1] ??
    RANGE_SPANS[0] ?? {
      label: '6H',
      samples: 72,
      windowLabel: 'Last 6 hours',
    };
  const activeSpan: ProductionSeriesSpan =
    RANGE_SPANS.find((s) => s.label === range) ?? DEFAULT_SPAN;
  const selectedWell = snapshot.wells.find((w) => w.id === selectedWellId) ?? snapshot.wells[0];

  const samples = activeSpan.samples;
  const wellId = selectedWell?.id ?? '';

  const oilHistory = useMemo(
    () => buildProductionHistory(wellId, 'oil', samples),
    [wellId, samples],
  );
  const gasHistory = useMemo(
    () => buildProductionHistory(wellId, 'gas', samples),
    [wellId, samples],
  );
  const waterCutHistory = useMemo(
    () => buildProductionHistory(wellId, 'waterCut', samples),
    [wellId, samples],
  );

  const xTicks = useMemo(() => buildXTicks(activeSpan.label), [activeSpan.label]);

  if (!selectedWell) {
    return <EmptyState />;
  }

  const oilDelta = computeDeltaPct(oilHistory);
  const gasDelta = computeDeltaPct(gasHistory);
  const waterCutDelta = computeDeltaPct(waterCutHistory);

  return (
    <div className="max-w-[1280px] mx-auto flex flex-col gap-7">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-text-primary">
            Production Overview
          </h1>
          <p className="text-sm text-text-secondary mt-1.5 max-w-[640px]">
            Monitor your active wells and track real-time oil, gas, and water production.
          </p>
        </div>
        <HeroSummary
          activeWells={snapshot.wells.length}
          oilTotal={sumWellsOil(snapshot.wells)}
          gasTotal={sumWellsGas(snapshot.wells)}
          waterCutAvg={averageWaterCut(snapshot.wells)}
          lastUpdateLabel={snapshot.lastUpdateLabel}
        />
      </section>

      <section
        className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
        aria-label="Active wells"
      >
        {snapshot.wells.map((well) => (
          <WellOverviewCard
            key={well.id}
            well={well}
            selected={well.id === selectedWell.id}
            onSelect={setSelectedWellId}
          />
        ))}
      </section>

      <section className="flex flex-col gap-4" aria-label="Production trends">
        <SelectedWellHeader
          well={selectedWell}
          spans={RANGE_SPANS}
          activeSpan={activeSpan.label}
          onSelectSpan={setRange}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ProductionChartCard
            title="Crude Oil Production"
            variant="oil"
            value={selectedWell.oil.value}
            valueLabel={formatNumber(selectedWell.oil.value, 0)}
            unit={selectedWell.oil.unit}
            deltaPct={oilDelta}
            data={oilHistory}
            color={VARIABLE_META.oil.seriesColor}
            areaColor={VARIABLE_META.oil.areaAccent}
            legendLabel="Oil"
            xTicks={xTicks}
          />
          <ProductionChartCard
            title="Gas Production"
            variant="gas"
            value={selectedWell.gas.value}
            valueLabel={formatNumber(selectedWell.gas.value, 2)}
            unit={selectedWell.gas.unit}
            deltaPct={gasDelta}
            data={gasHistory}
            color={VARIABLE_META.gas.seriesColor}
            areaColor={VARIABLE_META.gas.areaAccent}
            legendLabel="Gas"
            xTicks={xTicks}
          />
          <ProductionChartCard
            title="Water Cut"
            variant="waterCut"
            value={selectedWell.waterCut.value}
            valueLabel={formatNumber(selectedWell.waterCut.value, 1)}
            unit={selectedWell.waterCut.unit}
            deltaPct={waterCutDelta}
            data={waterCutHistory}
            color={VARIABLE_META.waterCut.seriesColor}
            areaColor={VARIABLE_META.waterCut.areaAccent}
            legendLabel="Water Cut"
            xTicks={xTicks}
          />
        </div>

        <p className="text-xs text-text-muted text-center pt-1">{snapshot.refreshNote}</p>
      </section>
    </div>
  );
};

const HeroSummary = ({
  activeWells,
  oilTotal,
  gasTotal,
  waterCutAvg,
  lastUpdateLabel,
}: {
  activeWells: number;
  oilTotal: number;
  gasTotal: number;
  waterCutAvg: number;
  lastUpdateLabel: string;
}) => (
  <div className="flex flex-col items-end gap-2">
    <div className="text-xs text-text-muted inline-flex items-center gap-2">
      <span aria-hidden="true" className="inline-block w-1.5 h-1.5 rounded-full bg-status-normal" />
      Last update: {lastUpdateLabel}
    </div>
    <dl className="flex items-center gap-6">
      <SummaryItem label="Active wells" value={String(activeWells)} />
      <Divider />
      <SummaryItem label="Oil" value={`${formatNumber(oilTotal, 0)} bbl/d`} />
      <Divider />
      <SummaryItem label="Gas" value={`${formatNumber(gasTotal, 2)} MMSCFD`} />
      <Divider />
      <SummaryItem label="Avg. water cut" value={`${formatNumber(waterCutAvg, 1)} %`} />
    </dl>
  </div>
);

const SummaryItem = ({ label, value }: { label: string; value: string }) => (
  <div className="flex flex-col items-end">
    <dt className="text-micro uppercase tracking-micro text-text-muted">{label}</dt>
    <dd className="text-sm font-semibold text-text-primary tabular-nums">{value}</dd>
  </div>
);

const Divider = () => <span aria-hidden="true" className="h-6 w-px bg-border-subtle" />;

const computeDeltaPct = (data: readonly number[]): number => {
  if (data.length < 2) return 0;
  const start = data[0] ?? 0;
  const end = data[data.length - 1] ?? 0;
  if (start === 0) return 0;
  return ((end - start) / start) * 100;
};

const EmptyState = () => (
  <div className="max-w-[1280px] mx-auto">
    <header>
      <h1 className="text-xl font-semibold tracking-tight text-text-primary">
        Production Overview
      </h1>
      <p className="text-sm text-text-secondary mt-1.5">
        No active jobs right now. Your wells will appear here once a Well Testing service is in
        progress.
      </p>
    </header>
  </div>
);

const formatNumber = (v: number, digits: number): string =>
  new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(v);

const buildXTicks = (range: ProductionSeriesSpan['label']): readonly string[] => {
  switch (range) {
    case '1H':
      return ['−60 m', '−45 m', '−30 m', '−15 m', 'now'];
    case '6H':
      return ['−6 h', '−4 h 30 m', '−3 h', '−1 h 30 m', 'now'];
    case '24H':
      return ['−24 h', '−18 h', '−12 h', '−6 h', 'now'];
    case '7D':
      return ['−7 d', '−5 d', '−3 d', '−1 d', 'now'];
  }
};
