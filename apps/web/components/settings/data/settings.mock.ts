/**
 * Settings — mock data.
 *
 * Console Configuration is the platform's admin surface: operator
 * preferences, telemetry infrastructure, integration endpoints, and the
 * audit ledger that proves changes were made deliberately. The mocks
 * here feed every panel on /settings — left-column configuration
 * sections and the right-rail status panels — without backend
 * persistence (F2 is display-only).
 */

export type SettingsSectionId =
  | 'general'
  | 'display'
  | 'units'
  | 'profiles'
  | 'alarms'
  | 'notifications'
  | 'integrations'
  | 'security'
  | 'system';

/* ----- equipment profiles --------------------------------------------- */

/**
 * EquipmentProfile — one operating envelope for a multiphase unit.
 *
 * A profile bundles the pressure, flow, and instrumentation defaults
 * that map to a recognizable physical package (heavy-duty test trailer,
 * portable low-rate skid, etc.). One profile is ACTIVE at a time; the
 * rest are AVAILABLE templates. CUSTOM_PROFILE represents a per-unit
 * engineered configuration that does not inherit from any class
 * default — its state is ENGINEERED rather than ACTIVE/AVAILABLE.
 */
export type EquipmentProfileId = 'high-pressure' | 'medium-pressure' | 'low-pressure' | 'custom';

/**
 * Equipment profile classes live in /settings as a *catalog* — the set
 * of unit shapes a deployed asset can be tagged with. The class itself
 * does not carry alarm setpoints; per-unit thresholds are configured on
 * each unit. The `kind` field surfaces this distinction in the UI:
 * STANDARD profiles are catalog templates, PER-UNIT means each unit
 * gets a bespoke engineered envelope.
 */
export type EquipmentProfileKind = 'STANDARD' | 'PER-UNIT';

export interface EquipmentProfile {
  id: EquipmentProfileId;
  label: string;
  description: string;
  kind: EquipmentProfileKind;
}

export const equipmentProfiles: readonly EquipmentProfile[] = [
  {
    id: 'high-pressure',
    label: 'High Pressure / High Flow',
    description: 'Heavy-duty well test package',
    kind: 'STANDARD',
  },
  {
    id: 'medium-pressure',
    label: 'Medium Pressure',
    description: 'Standard production test package',
    kind: 'STANDARD',
  },
  {
    id: 'low-pressure',
    label: 'Low Pressure / Low Flow',
    description: 'Portable low-rate separator package',
    kind: 'STANDARD',
  },
  {
    id: 'custom',
    label: 'Custom Profile',
    description: 'Per-unit engineered configuration',
    kind: 'PER-UNIT',
  },
];

export interface SettingsNavItem {
  id: SettingsSectionId;
  label: string;
  /** Count badge surfaced in the mini-nav (rows configured under this section). */
  count: number;
}

export const SETTINGS_NAV: readonly SettingsNavItem[] = [
  { id: 'general', label: 'General', count: 6 },
  { id: 'display', label: 'Display', count: 6 },
  { id: 'units', label: 'Global Units', count: 7 },
  { id: 'profiles', label: 'Profiles', count: 4 },
  { id: 'alarms', label: 'Alarm Behavior', count: 6 },
  { id: 'notifications', label: 'Notifications', count: 5 },
  { id: 'integrations', label: 'Integrations', count: 6 },
  { id: 'security', label: 'Security', count: 6 },
  { id: 'system', label: 'System', count: 4 },
];

/* ----- right rail: operator session ------------------------------------ */

export interface OperatorSession {
  user: string;
  role: string;
  tenant: string;
  session: 'ACTIVE' | 'IDLE' | 'EXPIRED';
  lastLoginUtc: string;
  ipAddress: string;
}

export const operatorSession: OperatorSession = {
  user: 'RVF Operator',
  role: 'Platform Admin',
  tenant: 'RVF Internal',
  session: 'ACTIVE',
  lastLoginUtc: '2026-05-22 14:08 UTC',
  ipAddress: '10.12.4.118',
};

/* ----- right rail: platform health ------------------------------------- */

export type ServiceState = 'ONLINE' | 'DEGRADED' | 'OFFLINE';

export interface PlatformService {
  id: string;
  label: string;
  state: ServiceState;
  /** Latency in ms; `null` for surfaces with no measurable round-trip. */
  latencyMs: number | null;
}

export const platformHealth: readonly PlatformService[] = [
  { id: 'console', label: 'Console', state: 'ONLINE', latencyMs: 12 },
  { id: 'api', label: 'Backend API', state: 'ONLINE', latencyMs: 24 },
  { id: 'realtime', label: 'Realtime Stream', state: 'ONLINE', latencyMs: 18 },
  { id: 'historian', label: 'Historian', state: 'ONLINE', latencyMs: 31 },
  { id: 'object-storage', label: 'Object Storage', state: 'ONLINE', latencyMs: 42 },
  { id: 'reports', label: 'Report Service', state: 'ONLINE', latencyMs: 58 },
];

/* ----- right rail: edge nodes ------------------------------------------ */

export interface EdgeNode {
  id: string;
  label: string;
  state: ServiceState;
  latencyMs: number;
  /** Logical site / equipment the node lives on. */
  site: string;
}

export const edgeNodes: readonly EdgeNode[] = [
  { id: 'gw-1', label: 'Gateway #1', site: 'MU #1', state: 'ONLINE', latencyMs: 22 },
  { id: 'gw-2', label: 'Gateway #2', site: 'MU #2', state: 'ONLINE', latencyMs: 31 },
  { id: 'nodered', label: 'Node-RED Edge', site: 'edge-01', state: 'ONLINE', latencyMs: 28 },
  {
    id: 'signalfire',
    label: 'SignalFire Gateway',
    site: 'wellpad-A',
    state: 'ONLINE',
    latencyMs: 34,
  },
];

/* ----- right rail: release / build info -------------------------------- */

export interface BuildField {
  label: string;
  value: string;
}

export const buildInfo: readonly BuildField[] = [
  { label: 'Console', value: 'v0.5.0' },
  { label: 'Backend', value: 'v0.2.0' },
  { label: 'Telemetry API', value: 'v1.5' },
  { label: 'Schema', value: '2026-05' },
  { label: 'Last Deploy', value: '2026-05-21' },
  { label: 'Build Channel', value: 'Staging' },
];

/* ----- right rail: configuration audit --------------------------------- */

export type AuditTone = 'info' | 'normal' | 'warn' | 'stale';

export interface AuditEntry {
  id: string;
  /** `HH:MM` UTC timestamp; aligns with /reports activity feed format. */
  at: string;
  action: string;
  /** Section or scope the change touched (e.g. "units", "alarms"). */
  scope: string;
  user: string;
  tone: AuditTone;
}

export const configAudit: readonly AuditEntry[] = [
  {
    id: 'a-008',
    at: '14:06',
    action: 'Units of measure updated',
    scope: 'units',
    user: 'h.finol',
    tone: 'info',
  },
  {
    id: 'a-007',
    at: '13:42',
    action: 'Alarm policy reviewed',
    scope: 'alarms',
    user: 'h.finol',
    tone: 'normal',
  },
  {
    id: 'a-006',
    at: '12:18',
    action: 'Reports pipeline configured',
    scope: 'integrations',
    user: 'd.rivera',
    tone: 'info',
  },
  {
    id: 'a-005',
    at: '11:55',
    action: 'SMS notifications enabled',
    scope: 'notifications',
    user: 'h.finol',
    tone: 'normal',
  },
  {
    id: 'a-004',
    at: '10:31',
    action: 'Session timeout extended',
    scope: 'security',
    user: 'platform.admin',
    tone: 'warn',
  },
  {
    id: 'a-003',
    at: '09:08',
    action: 'Settings baseline frozen',
    scope: 'system',
    user: 'h.finol',
    tone: 'stale',
  },
];

/* ----- summary strip counters ------------------------------------------ */

export interface SettingsSummary {
  configuredSections: number;
  activeOperators: number;
  integrationsOnline: number;
  integrationsTotal: number;
  edgeNodesOnline: number;
  edgeNodesTotal: number;
  pendingChanges: number;
  lastAuditAgo: string;
}

export const settingsSummary: SettingsSummary = {
  configuredSections: SETTINGS_NAV.length,
  activeOperators: 3,
  integrationsOnline: 6,
  integrationsTotal: 6,
  edgeNodesOnline: edgeNodes.filter((n) => n.state === 'ONLINE').length,
  edgeNodesTotal: edgeNodes.length,
  pendingChanges: 0,
  lastAuditAgo: '2 min',
};
