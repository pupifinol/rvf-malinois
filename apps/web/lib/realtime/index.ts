// Existing F0 exports — left untouched, F2A piggybacks alongside them.
export { createSocketClient, type SocketClient } from './socket';
export { RealtimeProvider, useConnectionState, useRealtime } from './RealtimeProvider';

// F2A additions.
export { RingBuffer } from './ringBuffer';
export {
  TelemetryStore,
  getTelemetryStore,
  setTelemetryStore,
  connectAdapter,
  type TelemetryStoreOptions,
} from './telemetryStore';
export {
  selectAlarmState,
  selectLiveValue,
  selectStaleState,
  selectUnitTelemetrySnapshot,
} from './telemetrySelectors';
