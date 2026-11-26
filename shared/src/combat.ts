import type { Vec2 } from "./math.js";

export interface Attacker {
  position: Vec2;
  radius: number;
  attackRange: number;
}

export interface Targetable {
  position: Vec2;
  radius: number;
}

export function distanceSq(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function isInAttackRange(attacker: Attacker, target: Targetable): boolean {
  const reach = attacker.attackRange + attacker.radius + target.radius;
  return distanceSq(attacker.position, target.position) <= reach * reach;
}
