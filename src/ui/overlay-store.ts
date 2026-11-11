// The optimistic overlay: what the person asked for, held until Home Assistant agrees, and the pure rule that reads it.
// Pattern: optimistic UI (the pending state of a write is shown before its confirmation) over a plain observable, so
// two elements of one panel share one map (ADR 0023). `overlay` is the legacy `pend` rule, string comparison kept.
// A known copy: the twenty seconds and `String(a) !== String(b)` are the legacy `pend`'s; #263 deletes that one.
// Must not: import Lit, the shell or a feature, read an entity, or be shared by two panels (the shell makes one each).

/** One held value and the instant (ms) it stops being held. */
export interface Held {
  value: unknown;
  until: number;
}

/** How long a value is held when its command says nothing else: twenty seconds, as the legacy `pend` did. */
export const TTL_MS = 20_000;

/**
 * What to show for `key`: the held value while it differs from `current` and has not expired, else `current`. A key that
 * Home Assistant confirmed or that ran out is dropped from `held`, so the answer is `current` from then on.
 */
export function overlay(held: Map<string, Held>, key: string, current: unknown, now: number): unknown {
  const entry = held.get(key);
  if (!entry) return current;
  if (entry.until > now && String(entry.value) !== String(current)) return entry.value;
  held.delete(key);
  return current;
}

export interface OverlayStoreOptions {
  /** The clock, in ms; a test's fake one, else the platform's. */
  now?: () => number;
}

export class OverlayStore {
  private readonly held = new Map<string, Held>();
  private readonly listeners = new Set<() => void>();
  /** The clock this store and the controllers that schedule against it read. */
  readonly now: () => number;

  constructor(options: OverlayStoreOptions = {}) {
    this.now = options.now ?? Date.now;
  }

  /** How many values are held (an expired one counts until it is read or swept). */
  get size(): number {
    return this.held.size;
  }

  /** Holds `value` under `key` for `ttlMs`, replacing what was held there, and tells the subscribers. */
  hold(key: string, value: unknown, ttlMs: number = TTL_MS): void {
    this.held.set(key, {value, until: this.now() + ttlMs});
    this.notify();
  }

  /** The value to show now; a read that finds the key confirmed or expired drops it, silently (it runs inside a render). */
  read<T>(key: string, current: T): T {
    return overlay(this.held, key, current, this.now()) as T;
  }

  /** Drops the keys, and tells the subscribers if any was held. */
  release(...keys: string[]): void {
    let changed = false;
    for (const key of keys) changed = this.held.delete(key) || changed;
    if (changed) this.notify();
  }

  /** The earliest instant a held value expires, or undefined when none is held. */
  nextExpiry(): number | undefined {
    let earliest: number | undefined;
    for (const {until} of this.held.values()) if (earliest === undefined || until < earliest) earliest = until;
    return earliest;
  }

  /** Drops every value that has expired, without telling anyone: the caller updates its host itself. */
  sweep(): void {
    const now = this.now();
    for (const [key, {until}] of this.held) if (until <= now) this.held.delete(key);
  }

  /** The returned function unsubscribes. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
