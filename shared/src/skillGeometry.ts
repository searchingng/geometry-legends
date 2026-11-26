import type { GameMap, Rect } from "./map.js";
import type { Vec2 } from "./math.js";
import type { SkillShape } from "./skillTypes.js";

export function shapeHits(
  shape: SkillShape,
  origin: Vec2,
  direction: Vec2,
  target: Vec2,
  bodyRadius: number,
): boolean {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const distance = Math.hypot(dx, dy);

  switch (shape.type) {
    case "circle":
      return distance <= shape.radius + bodyRadius;
    case "ring":
      return distance >= shape.innerRadius && distance <= shape.outerRadius + bodyRadius;
    case "cone": {
      if (distance <= bodyRadius) return true;
      if (distance > shape.radius + bodyRadius) return false;
      const cos = (dx * direction.x + dy * direction.y) / distance;
      const angle = Math.acos(Math.max(-1, Math.min(1, cos)));
      const margin = Math.asin(Math.min(1, bodyRadius / distance));
      return angle <= (shape.angleDeg * Math.PI) / 360 + margin;
    }
    case "line": {
      const along = dx * direction.x + dy * direction.y;
      const across = Math.abs(dx * direction.y - dy * direction.x);
      return along >= -bodyRadius && along <= shape.length + bodyRadius && across <= shape.width / 2 + bodyRadius;
    }
  }
}

export function shapeExtent(shape: SkillShape): number {
  switch (shape.type) {
    case "circle":
      return shape.radius;
    case "ring":
      return shape.outerRadius;
    case "cone":
      return shape.radius;
    case "line":
      return shape.length;
  }
}

export function distanceToSegment(point: Vec2, from: Vec2, to: Vec2): number {
  const sx = to.x - from.x;
  const sy = to.y - from.y;
  const lengthSq = sx * sx + sy * sy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - from.x) * sx + (point.y - from.y) * sy) / lengthSq));
  return Math.hypot(point.x - (from.x + sx * t), point.y - (from.y + sy * t));
}

export function sweepCircle(from: Vec2, to: Vec2, center: Vec2, radius: number): number | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const fx = from.x - center.x;
  const fy = from.y - center.y;
  const c = fx * fx + fy * fy - radius * radius;
  if (c <= 0) return 0;

  const a = dx * dx + dy * dy;
  if (a === 0) return null;
  const b = 2 * (fx * dx + fy * dy);
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;

  const t = (-b - Math.sqrt(discriminant)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}

export function segmentRectEntry(from: Vec2, to: Vec2, rect: Rect, inflate = 0): number | null {
  const minX = rect.x - inflate;
  const maxX = rect.x + rect.width + inflate;
  const minY = rect.y - inflate;
  const maxY = rect.y + rect.height + inflate;
  let enter = 0;
  let exit = 1;

  for (const [start, delta, min, max] of [
    [from.x, to.x - from.x, minX, maxX],
    [from.y, to.y - from.y, minY, maxY],
  ] as const) {
    if (delta === 0) {
      if (start < min || start > max) return null;
      continue;
    }
    let t1 = (min - start) / delta;
    let t2 = (max - start) / delta;
    if (t1 > t2) [t1, t2] = [t2, t1];
    enter = Math.max(enter, t1);
    exit = Math.min(exit, t2);
    if (enter > exit) return null;
  }
  return enter;
}

export function segmentObstacleEntry(from: Vec2, to: Vec2, map: GameMap, inflate = 0): number | null {
  let earliest: number | null = null;
  for (const wall of map.walls) {
    const t = segmentRectEntry(from, to, wall, inflate);
    if (t !== null && (earliest === null || t < earliest)) earliest = t;
  }

  const outside = (point: Vec2) => point.x < 0 || point.y < 0 || point.x > map.width || point.y > map.height;
  if (outside(to)) {
    const exitT = boundsExit(from, to, map);
    if (earliest === null || exitT < earliest) earliest = exitT;
  }
  return earliest;
}

function boundsExit(from: Vec2, to: Vec2, map: GameMap): number {
  let t = 1;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx < 0) t = Math.min(t, -from.x / dx);
  if (dx > 0) t = Math.min(t, (map.width - from.x) / dx);
  if (dy < 0) t = Math.min(t, -from.y / dy);
  if (dy > 0) t = Math.min(t, (map.height - from.y) / dy);
  return Math.max(0, t);
}
