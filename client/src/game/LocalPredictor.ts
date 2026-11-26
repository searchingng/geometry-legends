import {
  ARENA,
  TICK_DT,
  lerp,
  stepMovement,
  type MoveInput,
  type MoverStats,
  type Vec2,
} from "@moba/shared";

const SNAP_DISTANCE = 120;
const CORRECTION_HALF_LIFE_MS = 60;

export class LocalPredictor {
  private pending: MoveInput[] = [];
  private nextSeq = 1;
  private previous: Vec2;
  private current: Vec2;
  private visualError: Vec2 = { x: 0, y: 0 };

  constructor(
    spawn: Vec2,
    private readonly stats: MoverStats,
  ) {
    this.previous = { ...spawn };
    this.current = { ...spawn };
  }

  predict(direction: { x: number; y: number }): MoveInput {
    const input: MoveInput = { seq: this.nextSeq++, x: direction.x, y: direction.y };
    this.previous = this.current;
    this.current = stepMovement(this.current, input, this.stats, ARENA, TICK_DT);
    this.pending.push(input);
    return input;
  }

  reconcile(serverPosition: Vec2, lastProcessedSeq: number) {
    this.pending = this.pending.filter((input) => input.seq > lastProcessedSeq);

    let replayed = { ...serverPosition };
    for (const input of this.pending) {
      replayed = stepMovement(replayed, input, this.stats, ARENA, TICK_DT);
    }

    const dx = replayed.x - this.current.x;
    const dy = replayed.y - this.current.y;
    if (dx === 0 && dy === 0) return;

    this.current = replayed;
    this.previous = { x: this.previous.x + dx, y: this.previous.y + dy };

    if (Math.hypot(dx, dy) > SNAP_DISTANCE) {
      this.visualError = { x: 0, y: 0 };
    } else {
      this.visualError = { x: this.visualError.x - dx, y: this.visualError.y - dy };
    }
  }

  renderPosition(tickAlpha: number, frameMs: number): Vec2 {
    const decay = Math.pow(0.5, frameMs / CORRECTION_HALF_LIFE_MS);
    this.visualError = { x: this.visualError.x * decay, y: this.visualError.y * decay };

    return {
      x: lerp(this.previous.x, this.current.x, tickAlpha) + this.visualError.x,
      y: lerp(this.previous.y, this.current.y, tickAlpha) + this.visualError.y,
    };
  }

  get pendingCount(): number {
    return this.pending.length;
  }
}
