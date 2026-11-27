import type { SkillId } from "./skills.js";

export type HeroShape =
  | "triangle"
  | "square"
  | "circle"
  | "hexagon"
  | "diamond"
  | "cross"
  | "ring"
  | "pentagon"
  | "star"
  | "spike";

export const HERO_ROLES = ["Mage", "Assassin", "Fighter", "Tank", "Support", "Marksman"] as const;

export type HeroRole = (typeof HERO_ROLES)[number];

export interface HeroVisual {
  shape: HeroShape;
  color: number;
}

export interface HeroDefinition {
  id: string;
  name: string;
  roles: readonly [HeroRole] | readonly [HeroRole, HeroRole];
  description: string;
  radius: number;
  moveSpeed: number;
  visionRange: number;
  maxHp: number;
  attackDamage: number;
  attackRange: number;
  attackCooldownMs: number;
  skills: readonly [SkillId, SkillId, SkillId];
  visual: HeroVisual;
}

export const HEROES = {
  blade: {
    id: "blade",
    name: "Blade",
    roles: ["Assassin"],
    description: "Fastest hero. Small and slippery.",
    radius: 22,
    moveSpeed: 240,
    visionRange: 420,
    maxHp: 520,
    attackDamage: 70,
    attackRange: 60,
    attackCooldownMs: 700,
    skills: ["bladeShadowDash", "bladeTwinStrike", "bladeReapingSpin"],
    visual: { shape: "triangle", color: 0xff3d6e },
  },
  bastion: {
    id: "bastion",
    name: "Bastion",
    roles: ["Tank"],
    description: "Big and slow, built to hold ground.",
    radius: 26,
    moveSpeed: 192,
    visionRange: 380,
    maxHp: 900,
    attackDamage: 55,
    attackRange: 80,
    attackCooldownMs: 1000,
    skills: ["bastionShieldCharge", "bastionBulwark", "bastionEarthshatter"],
    visual: { shape: "square", color: 0x3dc8ff },
  },
  nova: {
    id: "nova",
    name: "Nova",
    roles: ["Mage"],
    description: "Balanced caster with a light frame.",
    radius: 22,
    moveSpeed: 216,
    visionRange: 460,
    maxHp: 560,
    attackDamage: 60,
    attackRange: 300,
    attackCooldownMs: 1100,
    skills: ["novaArcaneBolt", "novaFrostField", "novaStarfall"],
    visual: { shape: "circle", color: 0xb36bff },
  },
  warden: {
    id: "warden",
    name: "Warden",
    roles: ["Support", "Tank"],
    description: "Steady protector, solid all-rounder.",
    radius: 24,
    moveSpeed: 204,
    visionRange: 500,
    maxHp: 680,
    attackDamage: 50,
    attackRange: 170,
    attackCooldownMs: 850,
    skills: ["wardenBindingChain", "wardenSanctuary", "wardenShockwave"],
    visual: { shape: "hexagon", color: 0xffc23d },
  },
  vesper: {
    id: "vesper",
    name: "Vesper",
    roles: ["Marksman"],
    description: "Fragile sharpshooter with the longest reach.",
    radius: 21,
    moveSpeed: 212,
    visionRange: 520,
    maxHp: 480,
    attackDamage: 62,
    attackRange: 380,
    attackCooldownMs: 900,
    skills: ["vesperPiercingShot", "vesperTumble", "vesperArrowStorm"],
    visual: { shape: "diamond", color: 0xff8a3d },
  },
  kael: {
    id: "kael",
    name: "Kael",
    roles: ["Fighter"],
    description: "Relentless duelist who wins long brawls.",
    radius: 23,
    moveSpeed: 224,
    visionRange: 420,
    maxHp: 720,
    attackDamage: 68,
    attackRange: 75,
    attackCooldownMs: 800,
    skills: ["kaelLunge", "kaelCleave", "kaelUnbroken"],
    visual: { shape: "cross", color: 0xdce2ff },
  },
  mira: {
    id: "mira",
    name: "Mira",
    roles: ["Mage", "Support"],
    description: "Locks down space with rings and stasis.",
    radius: 22,
    moveSpeed: 208,
    visionRange: 480,
    maxHp: 580,
    attackDamage: 55,
    attackRange: 280,
    attackCooldownMs: 1000,
    skills: ["miraSnareOrb", "miraGravityRing", "miraStasis"],
    visual: { shape: "ring", color: 0xff5fd2 },
  },
  goliath: {
    id: "goliath",
    name: "Goliath",
    roles: ["Tank", "Fighter"],
    description: "Huge and stubborn; hard to kill, hard to escape.",
    radius: 27,
    moveSpeed: 184,
    visionRange: 380,
    maxHp: 1000,
    attackDamage: 58,
    attackRange: 85,
    attackCooldownMs: 1100,
    skills: ["goliathIronSkin", "goliathGroundPound", "goliathAvalanche"],
    visual: { shape: "pentagon", color: 0xc98d55 },
  },
  wisp: {
    id: "wisp",
    name: "Wisp",
    roles: ["Assassin", "Support"],
    description: "Blinks in and out, exposing hidden enemies.",
    radius: 21,
    moveSpeed: 232,
    visionRange: 460,
    maxHp: 540,
    attackDamage: 66,
    attackRange: 70,
    attackCooldownMs: 750,
    skills: ["wispBlinkStrike", "wispFlareBomb", "wispPhantomRush"],
    visual: { shape: "star", color: 0xc6ff4d },
  },
  hex: {
    id: "hex",
    name: "Hex",
    roles: ["Mage", "Assassin"],
    description: "Slow, delayed spells that hit very hard.",
    radius: 22,
    moveSpeed: 208,
    visionRange: 480,
    maxHp: 500,
    attackDamage: 58,
    attackRange: 320,
    attackCooldownMs: 1150,
    skills: ["hexRuneSpark", "hexMark", "hexCataclysm"],
    visual: { shape: "spike", color: 0x7a5cff },
  },
} as const satisfies Record<string, HeroDefinition>;

export type HeroId = keyof typeof HEROES;

export const HERO_IDS = Object.keys(HEROES) as HeroId[];

export function getHero(id: HeroId): HeroDefinition {
  return HEROES[id];
}

export function isHeroId(value: unknown): value is HeroId {
  return typeof value === "string" && Object.hasOwn(HEROES, value);
}
