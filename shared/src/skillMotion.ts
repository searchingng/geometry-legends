import type { GameMap } from "./map.js";
import type { Vec2 } from "./math.js";
import { overlapsWall, settleOutOfWalls, stepMovement } from "./movement.js";
import type { DashWallMode } from "./skillTypes.js";

export interface ForcedMotion {
  dirX: number;
  dirY: number;
  step: number;
  remaining: number;
  passWalls?: true;
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

export function planDash(
  start: Vec2,
  direction: Vec2,
  distance: number,
  step: number,
  wallMode: DashWallMode,
  radius: number,
  map: GameMap,
): ForcedMotion {
  const motion: ForcedMotion = { dirX: direction.x, dirY: direction.y, step, remaining: distance };
  if (wallMode === "block") return motion;

  const reach = Math.min(distance, distanceToBounds(start, direction, radius, map));
  const end = { x: start.x + direction.x * reach, y: start.y + direction.y * reach };
  if (overlapsWall(end, radius, map)) return motion;
  return { ...motion, remaining: reach, passWalls: true };
}

export function advanceMotion(position: Vec2, motion: ForcedMotion, radius: number, map: GameMap): MotionStep {
  const distance = Math.min(motion.step, motion.remaining);
  const remaining = motion.remaining - distance;

  if (motion.passWalls) {
    const finished = remaining < MIN_REMAINING;
    const straight = { x: position.x + motion.dirX * distance, y: position.y + motion.dirY * distance };
    const next = finished ? settleOutOfWalls(straight, radius, map) : straight;
    return {
      position: next,
      motion: finished ? null : { ...motion, remaining },
      moved: Math.hypot(next.x - position.x, next.y - position.y),
    };
  }

  const next = displace(position, motion.dirX, motion.dirY, distance, radius, map);
  const moved = Math.hypot(next.x - position.x, next.y - position.y);
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

function distanceToBounds(start: Vec2, direction: Vec2, radius: number, map: GameMap): number {
  let reach = Infinity;
  if (direction.x > 0) reach = Math.min(reach, (map.width - radius - start.x) / direction.x);
  if (direction.x < 0) reach = Math.min(reach, (radius - start.x) / direction.x);
  if (direction.y > 0) reach = Math.min(reach, (map.height - radius - start.y) / direction.y);
  if (direction.y < 0) reach = Math.min(reach, (radius - start.y) / direction.y);
  return Math.max(0, reach);
}
