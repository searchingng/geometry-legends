import { distanceSq, isInAttackRange, type Attacker } from "./combat.js";
import type { Vec2 } from "./math.js";

export interface TargetCandidate {
  id: string;
  position: Vec2;
  radius: number;
}

export function isAimInsideAttackRange(attacker: Attacker, aim: Vec2): boolean {
  const reach = attacker.attackRange + attacker.radius;
  return distanceSq(attacker.position, aim) <= reach * reach;
}

export function chooseAttackTarget<T extends TargetCandidate>(
  attacker: Attacker,
  candidates: readonly T[],
  aim?: Vec2,
): T | undefined {
  const reference = aim && isAimInsideAttackRange(attacker, aim) ? aim : attacker.position;

  let best: T | undefined;
  let bestDistanceSq = Infinity;
  for (const candidate of candidates) {
    if (!isInAttackRange(attacker, candidate)) continue;
    const candidateDistanceSq = distanceSq(reference, candidate.position);
    if (candidateDistanceSq < bestDistanceSq) {
      best = candidate;
      bestDistanceSq = candidateDistanceSq;
    }
  }
  return best;
}
