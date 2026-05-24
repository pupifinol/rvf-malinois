/**
 * useTelemetryStore — internal hook (not exported from the index).
 *
 * Returns the module-level singleton TelemetryStore. The other hooks in this
 * folder go through this so a future provider-based override can be slotted
 * in without changing call sites.
 */
import { getTelemetryStore, type TelemetryStore } from '../realtime/telemetryStore';

export const useTelemetryStore = (): TelemetryStore => getTelemetryStore();
