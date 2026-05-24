import { describe, expect, it } from 'vitest';

import { RingBuffer } from './ringBuffer';

describe('RingBuffer', () => {
  it('throws on non-positive capacity', () => {
    expect(() => new RingBuffer<number>(0)).toThrow();
    expect(() => new RingBuffer<number>(-3)).toThrow();
  });

  it('starts empty', () => {
    const r = new RingBuffer<number>(3);
    expect(r.length()).toBe(0);
    expect(r.latest()).toBeUndefined();
    expect(r.toArray()).toEqual([]);
  });

  it('returns the most recent pushed value', () => {
    const r = new RingBuffer<number>(3);
    r.push(1);
    r.push(2);
    expect(r.latest()).toBe(2);
    expect(r.length()).toBe(2);
  });

  it('overwrites oldest entries beyond capacity', () => {
    const r = new RingBuffer<number>(3);
    [1, 2, 3, 4, 5].forEach((n) => {
      r.push(n);
    });
    expect(r.toArray()).toEqual([3, 4, 5]);
    expect(r.latest()).toBe(5);
    expect(r.length()).toBe(3);
  });

  it('clear resets the buffer', () => {
    const r = new RingBuffer<number>(3);
    r.push(1);
    r.clear();
    expect(r.length()).toBe(0);
    expect(r.toArray()).toEqual([]);
    expect(r.latest()).toBeUndefined();
  });
});
