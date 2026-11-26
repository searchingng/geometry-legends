import { TICK_MS, slowFactor, type ForcedMotion, type PlayerStatuses } from "@moba/shared";

export type MotionKind = "dash" | "knockback";

export interface CombatStatus {
  stunUntilTick: number;
  slowPercent: number;
  slowUntilTick: number;
  shield: number;
  shieldUntilTick: number;
  motion: ForcedMotion | null;
  motionKind: MotionKind | null;
  protectedUntilTick: number;
}

export function msToTicks(ms: number): number {
  return Math.max(1, Math.round(ms / TICK_MS));
}

export function createStatus(): CombatStatus {
  return {
    stunUntilTick: 0,
    slowPercent: 0,
    slowUntilTick: 0,
    shield: 0,
    shieldUntilTick: 0,
    motion: null,
    motionKind: null,
    protectedUntilTick: 0,
  };
}

export function resetStatus(status: CombatStatus) {
  Object.assign(status, createStatus());
}

export function isStunned(status: CombatStatus, tick: number): boolean {
  return tick < status.stunUntilTick;
}

export function isProtected(status: CombatStatus, tick: number): boolean {
  return tick < status.protectedUntilTick;
}

export function canAct(status: CombatStatus, tick: number): boolean {
  return !isStunned(status, tick) && status.motion === null;
}

export function moveSpeedFactor(status: CombatStatus, tick: number): number {
  return tick < status.slowUntilTick ? slowFactor(status.slowPercent) : 1;
}

export function applyStun(status: CombatStatus, ticks: number, tick: number) {
  status.stunUntilTick = Math.max(status.stunUntilTick, tick + ticks);
  if (status.motionKind === "dash") setMotion(status, null, null);
}

export function applySlow(status: CombatStatus, percent: number, ticks: number, tick: number) {
  const active = tick < status.slowUntilTick;
  if (!active || percent > status.slowPercent) {
    status.slowPercent = percent;
    status.slowUntilTick = tick + ticks;
  } else if (percent === status.slowPercent) {
    status.slowUntilTick = Math.max(status.slowUntilTick, tick + ticks);
  }
}

export function addShield(status: CombatStatus, amount: number, ticks: number, tick: number) {
  if (tick >= status.shieldUntilTick) status.shield = 0;
  status.shield += amount;
  status.shieldUntilTick = Math.max(status.shieldUntilTick, tick + ticks);
}

export function absorbDamage(status: CombatStatus, amount: number, tick: number): number {
  if (tick >= status.shieldUntilTick) return 0;
  const absorbed = Math.min(status.shield, amount);
  status.shield -= absorbed;
  return absorbed;
}

export function setMotion(status: CombatStatus, motion: ForcedMotion | null, kind: MotionKind | null) {
  status.motion = motion;
  status.motionKind = motion ? kind : null;
}

export function visibleStatuses(status: CombatStatus, tick: number): PlayerStatuses | undefined {
  const statuses: PlayerStatuses = {};
  let any = false;
  if (tick < status.stunUntilTick) {
    statuses.stunTicks = status.stunUntilTick - tick;
    any = true;
  }
  if (tick < status.slowUntilTick) {
    statuses.slowPercent = status.slowPercent;
    statuses.slowTicks = status.slowUntilTick - tick;
    any = true;
  }
  if (tick < status.shieldUntilTick && status.shield > 0) {
    statuses.shield = Math.round(status.shield);
    statuses.shieldTicks = status.shieldUntilTick - tick;
    any = true;
  }
  if (tick < status.protectedUntilTick) {
    statuses.protectedTicks = status.protectedUntilTick - tick;
    any = true;
  }
  if (status.motion) {
    statuses.motion = { ...status.motion };
    any = true;
  }
  return any ? statuses : undefined;
}
