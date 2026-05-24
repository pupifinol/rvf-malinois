/**
 * Local acknowledge store — F2C.
 *
 * Holds the set of LiveAlarmEvent ids the operator has acknowledged in the
 * current browser session. No persistence, no backend call, no side effect
 * on the underlying telemetry: acknowledging is purely a UI lifecycle
 * affordance per F2 doc §9.5 ("Alarms (F2C). Permite reconocer localmente
 * en F2; en backend real lo reconocerá vía API.")
 *
 * Identity discipline: an event id is bound to (jobId, tag, evaluatedState,
 * firstSeenAt). If the same tag re-enters the same band after clearing,
 * `derive` produces a new id with a fresh firstSeenAt — and this store
 * therefore treats it as a brand-new event, exactly as required by F2C.
 *
 * Snapshot identity for `useSyncExternalStore`: subscribers receive the
 * acked set as a frozen `ReadonlySet` whose reference changes on every
 * mutation. The derive function reads `isAcknowledged(id)` per event, so
 * we expose that as a stable function reference too.
 */
type Listener = () => void;

let acked: ReadonlySet<string> = new Set<string>();
const listeners = new Set<Listener>();

const notify = (): void => {
  for (const l of listeners) l();
};

export const acknowledgeAlarm = (id: string): void => {
  if (acked.has(id)) return;
  const next = new Set(acked);
  next.add(id);
  acked = next;
  notify();
};

export const acknowledgeManyAlarms = (ids: readonly string[]): void => {
  let changed = false;
  const next = new Set(acked);
  for (const id of ids) {
    if (!next.has(id)) {
      next.add(id);
      changed = true;
    }
  }
  if (!changed) return;
  acked = next;
  notify();
};

export const isAlarmAcknowledged = (id: string): boolean => acked.has(id);

export const getAcknowledgedIds = (): ReadonlySet<string> => acked;

export const subscribeAckedIds = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Test-only — clears the in-memory set without notifying. */
export const _resetAckStore = (): void => {
  acked = new Set<string>();
};
