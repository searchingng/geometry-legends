import type { GameMap } from "./map.js";
import type { Vec2 } from "./math.js";
import { stepMovement } from "./movement.js";

export interface ForcedMotion {
  dirX: number;
  dirY: number;
  step: number;
  remaining: number;
}

export interface MotionStep {
  position: Vec2;
  motion: ForcedMotion | null;
  moved: number;
}

const SUBSTEP = 8;
const BLOCKED_FRACTION = 0.5;
const MIN_REMAINING = 0.01;
const MAX_SLOW_PERCENT = 90;

export function displace(
  position: Vec2,
  dirX: number,
  dirY: number,
  distance: number,
  radius: number,
  map: GameMap,
): Vec2 {
  let current = position;
  let left = distance;
  while (left > 0) {
    const step = Math.min(SUBSTEP, left);
    current = stepMovement(current, { seq: 0, x: dirX, y: dirY }, { radius, moveSpeed: step }, map, 1);
    left -= step;
  }
  return current;
}

export function advanceMotion(position: Vec2, motion: ForcedMotion, radius: number, map: GameMap): MotionStep {
  const distance = Math.min(motion.step, motion.remaining);
  const next = displace(position, motion.dirX, motion.dirY, distance, radius, map);
  const moved = Math.hypot(next.x - position.x, next.y - position.y);
  const remaining = motion.remaining - distance;
  const blocked = moved < distance * BLOCKED_FRACTION;
  return {
    position: next,
    motion: blocked || remaining < MIN_REMAINING ? null : { ...motion, remaining },
    moved,
  };
}

export function slowFactor(percent: number): number {
  return 1 - Math.max(0, Math.min(MAX_SLOW_PERCENT, percent)) / 100;
}
