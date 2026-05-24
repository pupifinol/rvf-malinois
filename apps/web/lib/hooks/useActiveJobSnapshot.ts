/**
 * useActiveJobSnapshot — F2A.
 *
 * Returns the currently active job snapshot for the session. F2A is
 * mock-backed: it reads from `getActiveJobSnapshot()`. F2B/D will replace
 * this with a TanStack-Query call to the backend; the public shape stays
 * the same.
 *
 * Hooks must be safe in client components. This one keeps a stable
 * reference until the underlying snapshot pointer changes.
 */
'use client';

import { useSyncExternalStore } from 'react';

import { getActiveJobSnapshot } from '../jobs/activeJob';

import type { ActiveJobSnapshot } from '../jobs/types';

const unsubscribeNoop = (): void => undefined;

const subscribe = (_listener: () => void): (() => void) => {
  // F2A: mock data does not change at runtime. The unused listener is
  // accepted for the useSyncExternalStore contract. F2B will swap in a real
  // subscription (e.g. snapshot-update event from the store).
  return unsubscribeNoop;
};

const getSnapshot = (): ActiveJobSnapshot => getActiveJobSnapshot();

export const useActiveJobSnapshot = (): ActiveJobSnapshot =>
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
