/**
 * Fixed-capacity circular buffer — F2A.
 *
 * Used by the telemetry store to retain the last N readings per (jobId, tag).
 * Pure data structure — no React, no IO, no globals.
 */
export class RingBuffer<T> {
  private readonly data: (T | undefined)[];
  private head = 0;
  private size = 0;

  constructor(public readonly capacity: number) {
    if (capacity <= 0 || !Number.isFinite(capacity)) {
      throw new Error(`RingBuffer capacity must be a positive integer, got ${capacity}`);
    }
    this.data = new Array<T | undefined>(capacity).fill(undefined);
  }

  push(value: T): void {
    this.data[this.head] = value;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) this.size += 1;
  }

  /** Most-recently-pushed value, or undefined if the buffer is empty. */
  latest(): T | undefined {
    if (this.size === 0) return undefined;
    const idx = (this.head - 1 + this.capacity) % this.capacity;
    return this.data[idx];
  }

  /** All retained values in insertion order (oldest first). */
  toArray(): T[] {
    if (this.size === 0) return [];
    const out: T[] = new Array<T>(this.size);
    const start = (this.head - this.size + this.capacity) % this.capacity;
    for (let i = 0; i < this.size; i += 1) {
      const v = this.data[(start + i) % this.capacity];
      if (v !== undefined) out[i] = v;
    }
    return out;
  }

  length(): number {
    return this.size;
  }

  clear(): void {
    this.head = 0;
    this.size = 0;
    for (let i = 0; i < this.capacity; i += 1) this.data[i] = undefined;
  }
}
