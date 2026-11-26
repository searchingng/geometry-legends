export type SkillSlot = 0 | 1 | 2;
export const SKILL_SLOTS: readonly SkillSlot[] = [0, 1, 2];

export type ZoneKind = "damage" | "control" | "utility";

export type SkillShape =
  | { type: "line"; length: number; width: number }
  | { type: "cone"; radius: number; angleDeg: number }
  | { type: "circle"; radius: number }
  | { type: "ring"; innerRadius: number; outerRadius: number };

export type ZoneAnchor = "caster" | "aimPoint" | "dashEnd";

export type SkillEffect =
  | { type: "damage"; amount: number }
  | { type: "stun"; durationMs: number }
  | { type: "slow"; percent: number; durationMs: number }
  | { type: "knockback"; distance: number }
  | { type: "reveal"; durationMs: number }
  | { type: "shield"; amount: number; durationMs: number }
  | { type: "heal"; amount: number };

export interface SkillZone {
  kind: ZoneKind;
  anchor: ZoneAnchor;
  shape: SkillShape;
  targets: "enemy" | "self";
  effects: SkillEffect[];
  delayMs?: number;
}

export type SkillDelivery =
  | { type: "instant" }
  | { type: "projectile"; speed: number }
  | { type: "dash"; distance: number; speed: number };

export type SkillAim = "direction" | "point" | "none";

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  cooldownMs: number;
  aim: SkillAim;
  range: number;
  delivery: SkillDelivery;
  zones: SkillZone[];
}
