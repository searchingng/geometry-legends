export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  allow(key: string, now = Date.now()): boolean {
    const recent = this.recent(key, now);
    if (recent.length >= this.limit) return false;
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }

  blocked(key: string, now = Date.now()): boolean {
    return this.recent(key, now).length >= this.limit;
  }

  record(key: string, now = Date.now()) {
    const recent = this.recent(key, now);
    recent.push(now);
    this.hits.set(key, recent);
  }

  clear(key: string) {
    this.hits.delete(key);
  }

  private recent(key: string, now: number): number[] {
    const recent = (this.hits.get(key) ?? []).filter((at) => now - at < this.windowMs);
    if (recent.length === 0) this.hits.delete(key);
    if (this.hits.size > 10_000) this.prune(now);
    return recent;
  }

  private prune(now: number) {
    for (const [key, times] of this.hits) {
      if (times.every((at) => now - at >= this.windowMs)) this.hits.delete(key);
    }
  }
}
