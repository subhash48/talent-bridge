/**
 * Remembers what happened recently, so the same thing reported twice in quick succession (a React
 * rerender, Strict Mode running an effect twice, a double click) counts once. The server drops repeats
 * too; this keeps them from being sent at all.
 */
export class RecentKeys {
  private readonly seen = new Map<string, number>();
  private readonly windowMs: number;

  constructor(windowMs: number) {
    this.windowMs = windowMs;
  }

  /** True the first time a key is seen in the window; false for a repeat inside it. */
  claim(key: string, now: number = Date.now()): boolean {
    const last = this.seen.get(key);
    if (last !== undefined && now - last < this.windowMs) return false;
    this.seen.set(key, now);
    if (this.seen.size > 200) {
      for (const [old, at] of this.seen) if (now - at >= this.windowMs) this.seen.delete(old);
    }
    return true;
  }
}
