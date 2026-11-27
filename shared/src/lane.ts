import { ARENA } from "./map.js";
import type { Vec2 } from "./math.js";

export type Team = 0 | 1;
export type StructureKind = "base" | "turret";
export type CreepKind = "creepSmall" | "creepBig";
export type UnitKind = StructureKind | CreepKind;

export interface UnitStats {
  maxHp: number;
  radius: number;
  attackDamage: number;
  attackRange: number;
  attackCooldownMs: number;
  moveSpeed: number;
  visionRange: number;
}

export const UNIT_STATS: Record<UnitKind, UnitStats> = {
  base: { maxHp: 2200, radius: 48, attackDamage: 75, attackRange: 220, attackCooldownMs: 1000, moveSpeed: 0, visionRange: 320 },
  turret: { maxHp: 1500, radius: 30, attackDamage: 90, attackRange: 250, attackCooldownMs: 1000, moveSpeed: 0, visionRange: 380 },
  creepSmall: { maxHp: 280, radius: 13, attackDamage: 18, attackRange: 28, attackCooldownMs: 1000, moveSpeed: 150, visionRange: 300 },
  creepBig: { maxHp: 520, radius: 18, attackDamage: 30, attackRange: 32, attackCooldownMs: 1200, moveSpeed: 140, visionRange: 300 },
};

export const LANE_Y = 450;
export const CREEP_WAVE: readonly CreepKind[] = ["creepSmall", "creepBig", "creepSmall"];
export const CREEP_WAVE_INTERVAL_MS = 30_000;
export const FIRST_CREEP_WAVE_MS = 5_000;
export const CREEP_WAVE_SPACING = 34;
export const FOUNTAIN_RADIUS = 100;
export const FOUNTAIN_HEAL_FRACTION_PER_SECOND = 0.15;

export interface StructurePlacement {
  kind: StructureKind;
  team: Team;
  position: Vec2;
}

const BASE_X = 150;
const TURRET_X = 520;
const ARENA_WIDTH = ARENA.width;

export const STRUCTURES: readonly StructurePlacement[] = [
  { kind: "base", team: 0, position: { x: BASE_X, y: LANE_Y } },
  { kind: "turret", team: 0, position: { x: TURRET_X, y: LANE_Y } },
  { kind: "base", team: 1, position: { x: ARENA_WIDTH - BASE_X, y: LANE_Y } },
  { kind: "turret", team: 1, position: { x: ARENA_WIDTH - TURRET_X, y: LANE_Y } },
];

export function isStructureKind(kind: UnitKind): kind is StructureKind {
  return kind === "base" || kind === "turret";
}

export function opposingTeam(team: Team): Team {
  return team === 0 ? 1 : 0;
}

export function laneDirection(team: Team): number {
  return team === 0 ? 1 : -1;
}

export function creepSpawnPoint(team: Team): Vec2 {
  const base = STRUCTURES.find((structure) => structure.kind === "base" && structure.team === team)!;
  return { x: base.position.x + laneDirection(team) * (UNIT_STATS.base.radius + 30), y: LANE_Y };
}
