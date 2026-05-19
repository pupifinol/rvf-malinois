import { create, type StateCreator } from 'zustand';
import { devtools } from 'zustand/middleware';

/**
 * Thin Zustand factory used across the app.
 *
 * The convention is: one focused store per concern, NOT a single mega-store.
 * The engineering doc §16 is explicit that mixing state kinds is the #1
 * cause of real-time UI bugs.
 *
 *   lib/store/uiStore.ts        — UI prefs (sidebar collapsed, theme)
 *   lib/realtime/telemetryStore — ring-buffer-backed live telemetry (F2)
 *   lib/realtime/alarmStore     — active alarms derived from the stream
 */
export const createStore = <T>(initializer: StateCreator<T>, name: string) =>
  create<T>()(
    devtools(initializer, {
      name,
      enabled: process.env.NODE_ENV !== 'production',
    }),
  );
