import { HEROES, type HeroDefinition } from "./heroes.js";
import type { SkillDefinition, SkillDelivery, SkillEffect, SkillShape, SkillZone } from "./skillTypes.js";

const MELEE_RANGE_LIMIT = 100;

export interface HeroStatLine {
  label: string;
  value: string;
  ratio: number;
}

export interface SkillZoneInfo {
  area: string;
  effects: string[];
}

export interface SkillInfo {
  name: string;
  description: string;
  cooldown: string;
  usage: string;
  delivery: string;
  range: string;
  zones: SkillZoneInfo[];
}

interface StatSpec {
  label: string;
  measure: (hero: HeroDefinition) => number;
  format: (hero: HeroDefinition) => string;
}

const STATS: readonly StatSpec[] = [
  { label: "Health", measure: (hero) => hero.maxHp, format: (hero) => `${hero.maxHp} HP` },
  { label: "Move speed", measure: (hero) => hero.moveSpeed, format: (hero) => `${hero.moveSpeed}` },
  { label: "Attack damage", measure: (hero) => hero.attackDamage, format: (hero) => `${hero.attackDamage}` },
  {
    label: "Attack speed",
    measure: (hero) => 1000 / hero.attackCooldownMs,
    format: (hero) => `1 hit / ${seconds(hero.attackCooldownMs)}`,
  },
  { label: "Attack DPS", measure: attackDps, format: (hero) => attackDps(hero).toFixed(0) },
  {
    label: "Attack range",
    measure: (hero) => hero.attackRange,
    format: (hero) => `${hero.attackRange} (${hero.attackRange <= MELEE_RANGE_LIMIT ? "melee" : "ranged"})`,
  },
  { label: "Vision", measure: (hero) => hero.visionRange, format: (hero) => `${hero.visionRange}` },
];

export function heroStatLines(hero: HeroDefinition): HeroStatLine[] {
  const roster: HeroDefinition[] = Object.values(HEROES);
  return STATS.map((stat) => {
    const best = Math.max(...roster.map(stat.measure));
    return { label: stat.label, value: stat.format(hero), ratio: best > 0 ? stat.measure(hero) / best : 0 };
  });
}

export function heroRoleLabel(hero: HeroDefinition): string {
  return hero.roles.join(" / ");
}

export function describeSkill(skill: SkillDefinition): SkillInfo {
  return {
    name: skill.name,
    description: skill.description,
    cooldown: seconds(skill.cooldownMs),
    usage: usageText(skill),
    delivery: deliveryText(skill.delivery),
    range: skill.range > 0 ? `${skill.range}` : "self",
    zones: skill.zones.map(describeZone),
  };
}

function attackDps(hero: HeroDefinition): number {
  return hero.attackDamage / (hero.attackCooldownMs / 1000);
}

function usageText(skill: SkillDefinition): string {
  if (skill.aim === "direction") return "Hold key, aim a direction with the mouse, left click to cast";
  if (skill.aim === "point") return "Hold key, pick a point with the mouse, left click to cast";
  return "Hold key, left click to cast around yourself";
}

function deliveryText(delivery: SkillDelivery): string {
  if (delivery.type === "dash") return `Dash ${delivery.distance}${delivery.wallMode === "pass" ? ", passes walls" : ""}`;
  if (delivery.type === "projectile") return `Projectile, speed ${delivery.speed}`;
  return "Instant";
}

function describeZone(zone: SkillZone): SkillZoneInfo {
  const parts = [shapeText(zone.shape), anchorText(zone)];
  if (zone.delayMs) parts.push(`after ${seconds(zone.delayMs)}`);
  return { area: parts.join(" "), effects: zone.effects.map(effectText) };
}

function shapeText(shape: SkillShape): string {
  switch (shape.type) {
    case "line":
      return `Line ${shape.length}×${shape.width}`;
    case "cone":
      return `Cone ${shape.radius}, ${shape.angleDeg}°`;
    case "circle":
      return `Circle r${shape.radius}`;
    case "ring":
      return `Ring r${shape.innerRadius}–${shape.outerRadius}`;
  }
}

function anchorText(zone: SkillZone): string {
  const where =
    zone.anchor === "aimPoint" ? "at the aimed point" : zone.anchor === "dashEnd" ? "at the dash end" : "from you";
  return zone.targets === "self" ? `${where}, on yourself` : `${where}, hits enemies`;
}

function effectText(effect: SkillEffect): string {
  switch (effect.type) {
    case "damage":
      return `${effect.amount} damage`;
    case "stun":
      return `Stun ${seconds(effect.durationMs)}`;
    case "slow":
      return `Slow ${effect.percent}% for ${seconds(effect.durationMs)}`;
    case "knockback":
      return `Knockback ${effect.distance}`;
    case "reveal":
      return `Reveal ${seconds(effect.durationMs)}`;
    case "shield":
      return `Shield ${effect.amount} for ${seconds(effect.durationMs)}`;
    case "heal":
      return `Heal ${effect.amount} HP`;
  }
}

function seconds(ms: number): string {
  return `${Number((ms / 1000).toFixed(2))}s`;
}
