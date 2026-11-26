import {
  ARENA,
  TICK_DT,
  advanceMotion,
  lerp,
  resolveSkillAim,
  slowFactor,
  stepMovement,
  type ForcedMotion,
  type MoveInput,
  type MoverStats,
  type PlayerStatuses,
  type SkillDefinition,
  type Vec2,
} from "@moba/shared";

const SNAP_DISTANCE = 120;
const MOTION_SNAP_DISTANCE = 400;
const CORRECTION_HALF_LIFE_MS = 60;

interface StatusTimeline {
  stunUntilSeq: number;
  slowUntilSeq: number;
  slowFactor: number;
}

interface LocalDash {
  startSeq: number;
  motion: ForcedMotion;
}

interface PredictedStep {
  position: Vec2;
  motion: ForcedMotion | null;
}

export class LocalPredictor {
  private pending: MoveInput[] = [];
  private nextSeq = 1;
  private previous: Vec2;
  private current: Vec2;
  private visualError: Vec2 = { x: 0, y: 0 };
  private motion: ForcedMotion | null = null;
  private localDash: LocalDash | null = null;
  private timeline: StatusTimeline = { stunUntilSeq: 0, slowUntilSeq: 0, slowFactor: 1 };

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
    const step = this.step(this.current, input, this.motion);
    this.current = step.position;
    this.motion = step.motion;
    this.pending.push(input);
    return input;
  }

  predictCast(skill: SkillDefinition, aim: Vec2) {
    const delivery = skill.delivery;
    if (delivery.type !== "dash" || this.motion || this.nextSeq <= this.timeline.stunUntilSeq) return;

    const { direction, point } = resolveSkillAim(skill, this.current, aim);
    const reach = Math.hypot(point.x - this.current.x, point.y - this.current.y);
    const distance = skill.aim === "direction" ? delivery.distance : Math.min(delivery.distance, reach);
    if (distance <= 0) return;

    const motion = { dirX: direction.x, dirY: direction.y, step: delivery.speed * TICK_DT, remaining: distance };
    this.localDash = { startSeq: this.nextSeq, motion };
    this.motion = motion;
  }

  reconcile(serverPosition: Vec2, lastProcessedSeq: number, statuses?: PlayerStatuses) {
    this.pending = this.pending.filter((input) => input.seq > lastProcessedSeq);
    this.timeline = {
      stunUntilSeq: lastProcessedSeq + (statuses?.stunTicks ?? 0),
      slowUntilSeq: lastProcessedSeq + (statuses?.slowTicks ?? 0),
      slowFactor: slowFactor(statuses?.slowPercent ?? 0),
    };

    const serverMotion = statuses?.motion ?? null;
    if (this.localDash && (serverMotion || lastProcessedSeq >= this.localDash.startSeq)) this.localDash = null;

    let replayed: PredictedStep = { position: { ...serverPosition }, motion: serverMotion };
    for (const input of this.pending) {
      if (this.localDash?.startSeq === input.seq && !replayed.motion) replayed.motion = this.localDash.motion;
      replayed = this.step(replayed.position, input, replayed.motion);
    }
    if (this.localDash && this.localDash.startSeq >= this.nextSeq) replayed.motion = this.localDash.motion;

    const moving = serverMotion !== null || this.motion !== null || replayed.motion !== null;
    this.motion = replayed.motion;

    const dx = replayed.position.x - this.current.x;
    const dy = replayed.position.y - this.current.y;
    if (dx === 0 && dy === 0) return;

    this.current = replayed.position;
    this.previous = { x: this.previous.x + dx, y: this.previous.y + dy };

    if (Math.hypot(dx, dy) > (moving ? MOTION_SNAP_DISTANCE : SNAP_DISTANCE)) {
      this.visualError = { x: 0, y: 0 };
    } else {
      this.visualError = { x: this.visualError.x - dx, y: this.visualError.y - dy };
    }
  }

  teleport(position: Vec2) {
    this.pending = [];
    this.previous = { ...position };
    this.current = { ...position };
    this.visualError = { x: 0, y: 0 };
    this.motion = null;
    this.localDash = null;
    this.timeline = { stunUntilSeq: 0, slowUntilSeq: 0, slowFactor: 1 };
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

  private step(position: Vec2, input: MoveInput, motion: ForcedMotion | null): PredictedStep {
    if (motion) {
      const result = advanceMotion(position, motion, this.stats.radius, ARENA);
      return { position: result.position, motion: result.motion };
    }
    if (input.seq <= this.timeline.stunUntilSeq) return { position, motion: null };

    const factor = input.seq <= this.timeline.slowUntilSeq ? this.timeline.slowFactor : 1;
    const stats = { radius: this.stats.radius, moveSpeed: this.stats.moveSpeed * factor };
    return { position: stepMovement(position, input, stats, ARENA, TICK_DT), motion: null };
  }
}
