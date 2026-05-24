import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  _resetAckStore,
  acknowledgeAlarm,
  acknowledgeManyAlarms,
  getAcknowledgedIds,
  isAlarmAcknowledged,
  subscribeAckedIds,
} from './ackStore';

describe('alarm center — ack store', () => {
  afterEach(() => {
    _resetAckStore();
  });

  it('starts empty', () => {
    expect(getAcknowledgedIds().size).toBe(0);
    expect(isAlarmAcknowledged('x')).toBe(false);
  });

  it('records an acknowledgement and notifies subscribers', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAckedIds(listener);
    acknowledgeAlarm('evt-1');
    expect(isAlarmAcknowledged('evt-1')).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('is idempotent: acknowledging the same id twice fires the listener once', () => {
    const listener = vi.fn();
    subscribeAckedIds(listener);
    acknowledgeAlarm('evt-1');
    acknowledgeAlarm('evt-1');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('updates the set reference on mutation (snapshot identity)', () => {
    const before = getAcknowledgedIds();
    acknowledgeAlarm('evt-1');
    const after = getAcknowledgedIds();
    expect(after).not.toBe(before);
    expect(before.has('evt-1')).toBe(false);
    expect(after.has('evt-1')).toBe(true);
  });

  it('acknowledgeManyAlarms adds all ids and notifies once', () => {
    const listener = vi.fn();
    subscribeAckedIds(listener);
    acknowledgeManyAlarms(['a', 'b', 'c']);
    expect(getAcknowledgedIds().size).toBe(3);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('acknowledgeManyAlarms is a no-op when nothing is new', () => {
    acknowledgeAlarm('a');
    const listener = vi.fn();
    subscribeAckedIds(listener);
    acknowledgeManyAlarms(['a']);
    expect(listener).not.toHaveBeenCalled();
  });

  it('unsubscribe removes the listener', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAckedIds(listener);
    unsubscribe();
    acknowledgeAlarm('a');
    expect(listener).not.toHaveBeenCalled();
  });
});
