/**
 * Reports — mock data.
 *
 * End-of-job well-test reports, daily-ops summaries, and archived
 * deliverables. State reflects the build pipeline (queued → generating →
 * ready → delivered).
 */
export type ReportKind = 'WELL TEST' | 'DAILY OPS' | 'BUILDUP' | 'AUDIT';
export type ReportState = 'QUEUED' | 'GENERATING' | 'READY' | 'DELIVERED';

export interface ReportRecord {
  id: string;
  kind: ReportKind;
  job: string;
  well: string;
  unit: string;
  generatedAt: string;
  sizeKb: number;
  state: ReportState;
}

export const reports: ReportRecord[] = [
  {
    id: 'r-1054',
    kind: 'WELL TEST',
    job: 'J-0421',
    well: 'PZ-1023',
    unit: 'MU #1',
    generatedAt: '2026-05-22 10:14',
    sizeKb: 1820,
    state: 'READY',
  },
  {
    id: 'r-1053',
    kind: 'DAILY OPS',
    job: '—',
    well: 'fleet',
    unit: 'fleet',
    generatedAt: '2026-05-22 06:00',
    sizeKb: 412,
    state: 'DELIVERED',
  },
  {
    id: 'r-1052',
    kind: 'BUILDUP',
    job: 'J-0418',
    well: 'PZ-1045',
    unit: 'MU #2',
    generatedAt: '2026-05-21 22:31',
    sizeKb: 2104,
    state: 'DELIVERED',
  },
  {
    id: 'r-1051',
    kind: 'WELL TEST',
    job: 'J-0417',
    well: 'PZ-0998',
    unit: 'MU #3',
    generatedAt: '2026-05-21 18:02',
    sizeKb: 1644,
    state: 'DELIVERED',
  },
  {
    id: 'r-1050',
    kind: 'AUDIT',
    job: '—',
    well: '—',
    unit: 'MU #4',
    generatedAt: '2026-05-20 09:45',
    sizeKb: 84,
    state: 'DELIVERED',
  },
];

export const queue = [
  { id: 'q-3', label: 'Well Test · J-0422 · MU #1', etaMin: 4, state: 'GENERATING' as const },
  { id: 'q-4', label: 'Daily Ops · 2026-05-22', etaMin: 18, state: 'QUEUED' as const },
];

export const templates = [
  { id: 't-1', name: 'Well Test Report v3', kind: 'WELL TEST', updated: '2026-04-30' },
  { id: 't-2', name: 'Buildup Report v2', kind: 'BUILDUP', updated: '2026-04-12' },
  { id: 't-3', name: 'Daily Ops Summary', kind: 'DAILY OPS', updated: '2026-03-22' },
  { id: 't-4', name: 'Calibration Audit', kind: 'AUDIT', updated: '2026-02-08' },
];

export const formatKb = (kb: number): string => {
  if (kb < 1000) return `${kb} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
};
