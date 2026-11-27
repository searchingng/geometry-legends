import type { GameMap, Rect } from "./map.js";
import { clamp, normalize, type Vec2 } from "./math.js";

export interface MoveInput {
  seq: number;
  x: number;
  y: number;
}

export interface MoverStats {
  radius: number;
  moveSpeed: number;
}

const AXIS_VALUES = new Set([-1, 0, 1]);

export function isValidMoveInput(value: unknown): value is MoveInput {
  if (typeof value !== "object" || value === null) return false;
  const input = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(input.seq) &&
    AXIS_VALUES.has(input.x as number) &&
    AXIS_VALUES.has(input.y as number)
  );
}

export function stepMovement(
  position: Vec2,
  input: MoveInput,
  stats: MoverStats,
  map: GameMap,
  dt: number,
): Vec2 {
  const direction = normalize(input.x, input.y);
  const distance = stats.moveSpeed * dt;

  let next = {
    x: position.x + direction.x * distance,
    y: position.y + direction.y * distance,
  };

  return settleOutOfWalls(next, stats.radius, map);
}

export function settleOutOfWalls(position: Vec2, radius: number, map: GameMap): Vec2 {
  let next = position;
  for (const wall of map.walls) {
    next = pushOutOfRect(next, radius, wall);
  }
  return {
    x: clamp(next.x, radius, map.width - radius),
    y: clamp(next.y, radius, map.height - radius),
  };
}

export function overlapsWall(position: Vec2, radius: number, map: GameMap): boolean {
  return map.walls.some((wall) => {
    const dx = position.x - clamp(position.x, wall.x, wall.x + wall.width);
    const dy = position.y - clamp(position.y, wall.y, wall.y + wall.height);
    return dx * dx + dy * dy < radius * radius;
  });
}

function pushOutOfRect(center: Vec2, radius: number, rect: Rect): Vec2 {
  const closestX = clamp(center.x, rect.x, rect.x + rect.width);
  const closestY = clamp(center.y, rect.y, rect.y + rect.height);
  const dx = center.x - closestX;
  const dy = center.y - closestY;
  const distanceSq = dx * dx + dy * dy;

  if (distanceSq >= radius * radius) return center;

  if (distanceSq > 0) {
    const distance = Math.sqrt(distanceSq);
    const push = radius - distance;
    return { x: center.x + (dx / distance) * push, y: center.y + (dy / distance) * push };
  }

  const toLeft = center.x - rect.x;
  const toRight = rect.x + rect.width - center.x;
  const toTop = center.y - rect.y;
  const toBottom = rect.y + rect.height - center.y;
  const nearest = Math.min(toLeft, toRight, toTop, toBottom);

  if (nearest === toLeft) return { x: rect.x - radius, y: center.y };
  if (nearest === toRight) return { x: rect.x + rect.width + radius, y: center.y };
  if (nearest === toTop) return { x: center.x, y: rect.y - radius };
  return { x: center.x, y: rect.y + rect.height + radius };
}
