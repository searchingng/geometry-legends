import { normalize, type Vec2 } from "./math.js";
import type { SkillDefinition } from "./skillTypes.js";

export interface ResolvedAim {
  direction: Vec2;
  point: Vec2;
}

const DEFAULT_DIRECTION: Vec2 = { x: 1, y: 0 };

export function resolveSkillAim(skill: SkillDefinition, caster: Vec2, aim: Vec2): ResolvedAim {
  const dx = aim.x - caster.x;
  const dy = aim.y - caster.y;
  const distance = Math.hypot(dx, dy);
  const direction = distance > 0 ? normalize(dx, dy) : DEFAULT_DIRECTION;

  if (skill.aim === "none") return { direction, point: { ...caster } };

  const reach = skill.aim === "direction" ? skill.range : Math.min(distance, skill.range);
  return {
    direction,
    point: { x: caster.x + direction.x * reach, y: caster.y + direction.y * reach },
  };
}
