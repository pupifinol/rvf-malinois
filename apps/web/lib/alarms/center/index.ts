/**
 * Alarm Center barrel — F2C.
 *
 * Public surface of the Alarm Center view-model. Components in
 * `app/(rvf-console)/alarms` import only from this barrel; they never
 * reach into individual files.
 */
export type {
  AlarmCenterEvaluatedState,
  AlarmCenterLifecycle,
  AlarmCenterSeverity,
  AlarmCenterSourceType,
  AlarmCenterSnapshot,
  AlarmCenterSummary,
  LiveAlarmEvent,
} from './types';
export { EMPTY_ALARM_CENTER_SNAPSHOT, EMPTY_ALARM_CENTER_SUMMARY } from './types';
export { deriveAlarmCenterSnapshot, type DeriveAlarmCenterInput, type TagLabeller } from './derive';
export { severityFor, sourceFor, titleFor } from './severity';
export {
  acknowledgeAlarm,
  acknowledgeManyAlarms,
  getAcknowledgedIds,
  isAlarmAcknowledged,
  subscribeAckedIds,
  _resetAckStore,
} from './ackStore';
