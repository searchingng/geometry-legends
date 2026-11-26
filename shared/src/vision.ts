import { bushIndexAt, type GameMap, type Rect } from "./map.js";
import type { Vec2 } from "./math.js";

export function isWithinVision(viewer: Vec2, visionRange: number, target: Vec2): boolean {
  const dx = target.x - viewer.x;
  const dy = target.y - viewer.y;
  return dx * dx + dy * dy <= visionRange * visionRange;
}

export function rayRectDistance(
  originX: number,
  originY: number,
  dirX: number,
  dirY: number,
  maxDistance: number,
  rect: Rect,
): number {
  let enter = 0;
  let exit = maxDistance;

  if (dirX === 0) {
    if (originX < rect.x || originX > rect.x + rect.width) return Infinity;
  } else {
    let t1 = (rect.x - originX) / dirX;
    let t2 = (rect.x + rect.width - originX) / dirX;
    if (t1 > t2) [t1, t2] = [t2, t1];
    enter = Math.max(enter, t1);
    exit = Math.min(exit, t2);
    if (enter > exit) return Infinity;
  }

  if (dirY === 0) {
    if (originY < rect.y || originY > rect.y + rect.height) return Infinity;
  } else {
    let t1 = (rect.y - originY) / dirY;
    let t2 = (rect.y + rect.height - originY) / dirY;
    if (t1 > t2) [t1, t2] = [t2, t1];
    enter = Math.max(enter, t1);
    exit = Math.min(exit, t2);
    if (enter > exit) return Infinity;
  }

  return enter;
}

export function hasLineOfSight(from: Vec2, to: Vec2, walls: readonly Rect[]): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return walls.every((wall) => rayRectDistance(from.x, from.y, dx, dy, 1, wall) === Infinity);
}

export function isHiddenInBush(map: GameMap, viewer: Vec2, target: Vec2): boolean {
  const targetBush = bushIndexAt(map, target);
  return targetBush !== -1 && targetBush !== bushIndexAt(map, viewer);
}

export function canSeePosition(map: GameMap, viewer: Vec2, visionRange: number, target: Vec2): boolean {
  return (
    isWithinVision(viewer, visionRange, target) &&
    !isHiddenInBush(map, viewer, target) &&
    hasLineOfSight(viewer, target, map.walls)
  );
}

export function castVisibilityRays(map: GameMap, origin: Vec2, radius: number, out: Float32Array): Float32Array {
  const step = (Math.PI * 2) / out.length;
  for (let i = 0; i < out.length; i++) {
    const dirX = Math.cos(i * step);
    const dirY = Math.sin(i * step);
    let nearest = radius;
    for (const wall of map.walls) {
      const distance = rayRectDistance(origin.x, origin.y, dirX, dirY, nearest, wall);
      if (distance < nearest) nearest = distance;
    }
    out[i] = nearest;
  }
  return out;
}
