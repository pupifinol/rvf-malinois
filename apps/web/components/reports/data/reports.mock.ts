/**
 * Reports — mock data.
 *
 * End-of-job well-test reports, daily-ops summaries, audit closeouts,
 * and other client deliverables. State reflects the build pipeline
 * (queued → generating → ready → pending approval → delivered, with
 * failed as the exception path).
 *
 * Each record carries enough operational context (run duration, alarm
 * count, average line pressure, average water cut, who approved it,
 * which sections the PDF actually contains) to drive every panel on
 * the /reports screen: status strip, archive table, detail preview,
 * generation queue, templates, audit-log activity, and the actions rail.
 */

export type ReportKind = 'WELL_TEST' | 'DAILY_OPS' | 'BUILDUP' | 'AUDIT' | 'INCIDENT';
export type ReportState =
  | 'QUEUED'
  | 'GENERATING'
  | 'READY'
  | 'PENDING_APPROVAL'
  | 'DELIVERED'
  | 'FAILED';

/** Pipeline stages used by both archive history (last stage reached)
 *  and the generation-queue progress bar. */
export type ReportStage =
  | 'COLLECTING_TELEMETRY'
  | 'VALIDATING_DATA'
  | 'BUILDING_CHARTS'
  | 'RENDERING_PDF'
  | 'READY_FOR_REVIEW';

export interface ReportRecord {
  id: string;
  kind: ReportKind;
  /** Job reference, e.g. "J-0421". `null` for fleet-wide deliverables. */
  job: string | null;
  /** Well reference, e.g. "PZ-1023". `null` for fleet-wide deliverables. */
  well: string | null;
  /** Owning unit, e.g. "MU #1". */
  unit: string;
  /** Generation timestamp in `YYYY-MM-DD HH:MM` UTC. */
  generatedAt: string;
  /** Operator who triggered generation. */
  generatedBy: string;
  /** Approver initials. `null` when not yet approved. */
  approvedBy: string | null;
  /** Run duration in seconds (job runtime, not generation time).
   *  `null` for fleet-wide deliverables that don't have a single run. */
  durationSec: number | null;
  /** Total alarms encountered during the run. */
  alarmCount: number;
  /** Average line pressure across the run, in psi. */
  avgPressurePsi: number;
  /** Average water cut across the run, in %. */
  avgWaterCutPct: number;
  /** Output PDF size in KB. */
  sizeKb: number;
  state: ReportState;
  /** Sections included in the rendered PDF, ordered as in the document. */
  sections: readonly string[];
}

/* ----- archive ---------------------------------------------------------- */

export const reports: readonly ReportRecord[] = [
  {
    id: 'r-1054',
    kind: 'WELL_TEST',
    job: 'J-0421',
    well: 'PZ-1023',
    unit: 'MU #1',
    generatedAt: '2026-05-22 10:14',
    generatedBy: 'h.finol',
    approvedBy: null,
    durationSec: 26 * 3600,
    alarmCount: 12,
    avgPressurePsi: 1648,
    avgWaterCutPct: 32.4,
    sizeKb: 1820,
    state: 'READY',
    sections: [
      'Production Summary',
      'Separator Trends',
      'Alarm Summary',
      'Sensor Health',
      'Calibration Notes',
      'Operator Comments',
    ],
  },
  {
    id: 'r-1053',
    kind: 'DAILY_OPS',
    job: null,
    well: null,
    unit: 'Fleet',
    generatedAt: '2026-05-22 06:00',
    generatedBy: 'auto.scheduler',
    approvedBy: 'd.rivera',
    durationSec: null,
    alarmCount: 28,
    avgPressurePsi: 1574,
    avgWaterCutPct: 36.2,
    sizeKb: 412,
    state: 'DELIVERED',
    sections: [
      'Fleet Summary',
      'Active Units',
      'Alarm Summary',
      'Comms Health',
      'Operator Handover',
    ],
  },
  {
    id: 'r-1052',
    kind: 'BUILDUP',
    job: 'J-0418',
    well: 'PZ-1045',
    unit: 'MU #2',
    generatedAt: '2026-05-21 22:31',
    generatedBy: 'd.rivera',
    approvedBy: 'h.finol',
    durationSec: 18 * 3600,
    alarmCount: 6,
    avgPressurePsi: 2842,
    avgWaterCutPct: 38.1,
    sizeKb: 2104,
    state: 'DELIVERED',
    sections: [
      'Buildup Curve',
      'Reservoir Pressure',
      'Sensor Health',
      'Calibration Notes',
      'Operator Comments',
    ],
  },
  {
    id: 'r-1051',
    kind: 'WELL_TEST',
    job: 'J-0417',
    well: 'PZ-0998',
    unit: 'MU #1',
    generatedAt: '2026-05-21 18:02',
    generatedBy: 'h.finol',
    approvedBy: 'd.rivera',
    durationSec: 32 * 3600,
    alarmCount: 9,
    avgPressurePsi: 1712,
    avgWaterCutPct: 28.7,
    sizeKb: 1644,
    state: 'DELIVERED',
    sections: [
      'Production Summary',
      'Separator Trends',
      'Alarm Summary',
      'Sensor Health',
      'Operator Comments',
    ],
  },
  {
    id: 'r-1050',
    kind: 'AUDIT',
    job: null,
    well: null,
    unit: 'MU #1',
    generatedAt: '2026-05-20 09:45',
    generatedBy: 'h.finol',
    approvedBy: 'd.rivera',
    durationSec: null,
    alarmCount: 0,
    avgPressurePsi: 0,
    avgWaterCutPct: 0,
    sizeKb: 84,
    state: 'DELIVERED',
    sections: ['Calibration Log', 'Drift Analysis', 'Sign-Off'],
  },
  {
    id: 'r-1049',
    kind: 'INCIDENT',
    job: 'J-0415',
    well: 'PZ-1023',
    unit: 'MU #1',
    generatedAt: '2026-05-19 14:28',
    generatedBy: 'd.rivera',
    approvedBy: 'h.finol',
    durationSec: 4 * 3600 + 12 * 60,
    alarmCount: 47,
    avgPressurePsi: 1962,
    avgWaterCutPct: 41.0,
    sizeKb: 1280,
    state: 'DELIVERED',
    sections: [
      'Incident Timeline',
      'Process Snapshot',
      'Alarm Sequence',
      'Operator Actions',
      'Root Cause Notes',
    ],
  },
  {
    id: 'r-1048',
    kind: 'WELL_TEST',
    job: 'J-0414',
    well: 'PZ-2041',
    unit: 'MU #2',
    generatedAt: '2026-05-19 09:12',
    generatedBy: 'h.finol',
    approvedBy: null,
    durationSec: 22 * 3600,
    alarmCount: 4,
    avgPressurePsi: 1488,
    avgWaterCutPct: 41.8,
    sizeKb: 1572,
    state: 'PENDING_APPROVAL',
    sections: ['Production Summary', 'Separator Trends', 'Alarm Summary', 'Sensor Health'],
  },
  {
    id: 'r-1047',
    kind: 'DAILY_OPS',
    job: null,
    well: null,
    unit: 'Fleet',
    generatedAt: '2026-05-18 06:00',
    generatedBy: 'auto.scheduler',
    approvedBy: 'h.finol',
    durationSec: null,
    alarmCount: 19,
    avgPressurePsi: 1602,
    avgWaterCutPct: 34.9,
    sizeKb: 398,
    state: 'DELIVERED',
    sections: ['Fleet Summary', 'Active Units', 'Alarm Summary', 'Comms Health'],
  },
  {
    id: 'r-1046',
    kind: 'BUILDUP',
    job: 'J-0412',
    well: 'PZ-1045',
    unit: 'MU #2',
    generatedAt: '2026-05-17 21:50',
    generatedBy: 'd.rivera',
    approvedBy: null,
    durationSec: 12 * 3600,
    alarmCount: 0,
    avgPressurePsi: 0,
    avgWaterCutPct: 0,
    sizeKb: 0,
    state: 'FAILED',
    sections: [],
  },
];

/* ----- generation queue ------------------------------------------------- */

export interface QueueItem {
  id: string;
  label: string;
  kind: ReportKind;
  state: 'QUEUED' | 'GENERATING';
  stage: ReportStage;
  /** Progress 0–100. */
  progressPct: number;
  etaMin: number;
}

export const queue: readonly QueueItem[] = [
  {
    id: 'q-1',
    label: 'Well Test · J-0422 · MU #1',
    kind: 'WELL_TEST',
    state: 'GENERATING',
    stage: 'BUILDING_CHARTS',
    progressPct: 62,
    etaMin: 4,
  },
  {
    id: 'q-2',
    label: 'Daily Ops · 2026-05-22',
    kind: 'DAILY_OPS',
    state: 'GENERATING',
    stage: 'COLLECTING_TELEMETRY',
    progressPct: 18,
    etaMin: 9,
  },
  {
    id: 'q-3',
    label: 'Buildup · J-0420 · MU #2',
    kind: 'BUILDUP',
    state: 'QUEUED',
    stage: 'COLLECTING_TELEMETRY',
    progressPct: 0,
    etaMin: 18,
  },
];

/* ----- templates -------------------------------------------------------- */

export interface ReportTemplate {
  id: string;
  name: string;
  version: string;
  owner: string;
  kind: ReportKind;
  /** Last template edit. */
  lastUpdated: string;
  /** Last time a report was generated from this template. */
  lastUsed: string;
}

export const templates: readonly ReportTemplate[] = [
  {
    id: 't-1',
    name: 'Well Test Report',
    version: 'v3.2',
    owner: 'h.finol',
    kind: 'WELL_TEST',
    lastUpdated: '2026-04-30',
    lastUsed: '2026-05-22',
  },
  {
    id: 't-2',
    name: 'Buildup Report',
    version: 'v2.1',
    owner: 'd.rivera',
    kind: 'BUILDUP',
    lastUpdated: '2026-04-12',
    lastUsed: '2026-05-21',
  },
  {
    id: 't-3',
    name: 'Daily Ops Summary',
    version: 'v1.4',
    owner: 'auto',
    kind: 'DAILY_OPS',
    lastUpdated: '2026-03-22',
    lastUsed: '2026-05-22',
  },
  {
    id: 't-4',
    name: 'Calibration Audit',
    version: 'v1.0',
    owner: 'h.finol',
    kind: 'AUDIT',
    lastUpdated: '2026-02-08',
    lastUsed: '2026-05-20',
  },
  {
    id: 't-5',
    name: 'Incident Summary',
    version: 'v2.0',
    owner: 'd.rivera',
    kind: 'INCIDENT',
    lastUpdated: '2026-03-15',
    lastUsed: '2026-05-19',
  },
];

/* ----- audit-log activity ---------------------------------------------- */

export type ActivityTone = 'info' | 'normal' | 'warn' | 'alarm' | 'stale';

export interface ActivityEntry {
  id: string;
  at: string;
  action: string;
  reportId: string;
  user: string;
  tone: ActivityTone;
}

export const activity: readonly ActivityEntry[] = [
  {
    id: 'a1',
    at: '08m ago',
    action: 'marked READY',
    reportId: 'r-1054',
    user: 'h.finol',
    tone: 'info',
  },
  {
    id: 'a2',
    at: '32m ago',
    action: 'sections updated',
    reportId: 'r-1054',
    user: 'h.finol',
    tone: 'normal',
  },
  {
    id: 'a3',
    at: '01h ago',
    action: 'awaiting approval',
    reportId: 'r-1048',
    user: '—',
    tone: 'warn',
  },
  {
    id: 'a4',
    at: '02h ago',
    action: 'generation failed',
    reportId: 'r-1046',
    user: 'd.rivera',
    tone: 'alarm',
  },
  {
    id: 'a5',
    at: '04h ago',
    action: 'delivered to client portal',
    reportId: 'r-1053',
    user: 'd.rivera',
    tone: 'normal',
  },
  {
    id: 'a6',
    at: '06h ago',
    action: 'audit closed',
    reportId: 'r-1050',
    user: 'h.finol',
    tone: 'normal',
  },
  {
    id: 'a7',
    at: '14h ago',
    action: 'template v3.2 published',
    reportId: 't-1',
    user: 'h.finol',
    tone: 'info',
  },
  {
    id: 'a8',
    at: '1 d ago',
    action: 'incident report sealed',
    reportId: 'r-1049',
    user: 'd.rivera',
    tone: 'stale',
  },
];

/* ----- helpers --------------------------------------------------------- */

export const formatKb = (kb: number): string => {
  if (kb <= 0) return '—';
  if (kb < 1000) return `${kb} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
};

export const formatDuration = (sec: number | null): string => {
  if (sec === null) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
};

export const kindLabel = (k: ReportKind): string => {
  switch (k) {
    case 'WELL_TEST':
      return 'Well Test';
    case 'DAILY_OPS':
      return 'Daily Ops';
    case 'BUILDUP':
      return 'Buildup';
    case 'AUDIT':
      return 'Audit';
    case 'INCIDENT':
      return 'Incident';
  }
};

export const stageLabel = (s: ReportStage): string => {
  switch (s) {
    case 'COLLECTING_TELEMETRY':
      return 'Collecting telemetry';
    case 'VALIDATING_DATA':
      return 'Validating data';
    case 'BUILDING_CHARTS':
      return 'Building charts';
    case 'RENDERING_PDF':
      return 'Rendering PDF';
    case 'READY_FOR_REVIEW':
      return 'Ready for review';
  }
};
