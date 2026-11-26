import { TICK_MS, lerp, type SnapshotMessage, type Vec2 } from "@moba/shared";

const MAX_BUFFERED = 60;
const CLOCK_SMOOTHING = 0.05;
const CLOCK_RESYNC_MS = 250;

export class SnapshotBuffer {
  private snapshots: SnapshotMessage[] = [];
  private clockOffsetMs: number | null = null;

  push(snapshot: SnapshotMessage, receivedAt: number) {
    const sample = snapshot.tick * TICK_MS - receivedAt;
    if (this.clockOffsetMs === null || Math.abs(sample - this.clockOffsetMs) > CLOCK_RESYNC_MS) {
      this.clockOffsetMs = sample;
    } else {
      this.clockOffsetMs += (sample - this.clockOffsetMs) * CLOCK_SMOOTHING;
    }

    this.snapshots.push(snapshot);
    if (this.snapshots.length > MAX_BUFFERED) this.snapshots.shift();
  }

  latest(): SnapshotMessage | undefined {
    return this.snapshots.at(-1);
  }

  positionAt(playerId: string, now: number, delayMs: number): Vec2 | undefined {
    if (this.clockOffsetMs === null) return undefined;
    const renderTick = (now + this.clockOffsetMs - delayMs) / TICK_MS;

    let older: Vec2 | undefined;
    let olderTick = 0;
    for (const snapshot of this.snapshots) {
      const player = snapshot.players.find((candidate) => candidate.id === playerId);
      if (!player) continue;

      if (snapshot.tick <= renderTick) {
        older = player;
        olderTick = snapshot.tick;
        continue;
      }

      if (!older) return { x: player.x, y: player.y };
      const t = (renderTick - olderTick) / (snapshot.tick - olderTick);
      return { x: lerp(older.x, player.x, t), y: lerp(older.y, player.y, t) };
    }

    return older && { x: older.x, y: older.y };
  }
}
