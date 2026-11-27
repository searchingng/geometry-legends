import { describe, expect, it } from "vitest";
import {
  ARENA,
  CREEP_WAVE,
  FIRST_CREEP_WAVE_MS,
  STRUCTURES,
  TICK_MS,
  UNIT_STATS,
  type CombatEvent,
  type Team,
  type Vec2,
} from "@moba/shared";
import { UnitSystem, type UnitHero, type UnitWorld } from "../src/units/UnitSystem.js";

class TestWorld implements UnitWorld {
  tick = 0;
  events: CombatEvent[] = [];
  heroDamage = new Map<string, number>();
  constructor(public heroes: UnitHero[] = []) {}
  damageHero(heroId: string, amount: number) {
    this.heroDamage.set(heroId, (this.heroDamage.get(heroId) ?? 0) + amount);
  }
  emit(event: CombatEvent) {
    this.events.push(event);
  }
}

function setup() {
  const destroyed: Team[] = [];
  const units = new UnitSystem({ baseDestroyed: (team) => destroyed.push(team) });
  return { units, destroyed };
}

function run(units: UnitSystem, world: TestWorld, ticks: number) {
  for (let i = 0; i < ticks; i++) {
    units.update(world);
    world.tick++;
  }
}

function structurePosition(kind: "base" | "turret", team: Team): Vec2 {
  return STRUCTURES.find((structure) => structure.kind === kind && structure.team === team)!.position;
}

function hero(id: string, team: Team, position: Vec2): UnitHero {
  return { id, team, position, radius: 22 };
}

const FIRST_WAVE_TICKS = Math.round(FIRST_CREEP_WAVE_MS / TICK_MS);

describe("UnitSystem", () => {
  it("starts with a base and a turret per team", () => {
    const { units } = setup();
    expect(units.all().map((unit) => unit.id).sort()).toEqual(["base0", "base1", "turret0", "turret1"]);
  });

  it("protects the base until its turret falls", () => {
    const { units, destroyed } = setup();
    expect(units.damage("base1", 100, "hero")).toBe(0);
    units.damage("turret1", UNIT_STATS.turret.maxHp, "hero");
    expect(units.get("turret1")).toBeUndefined();
    expect(units.damage("base1", UNIT_STATS.base.maxHp, "hero")).toBe(UNIT_STATS.base.maxHp);
    expect(destroyed).toEqual([1]);
  });

  it("spawns a creep pack for both teams on schedule", () => {
    const { units } = setup();
    const world = new TestWorld();
    units.startWaves(0);
    run(units, world, FIRST_WAVE_TICKS);
    expect(units.all()).toHaveLength(4);
    run(units, world, 1);
    const creeps = units.all().filter((unit) => unit.kind.startsWith("creep"));
    expect(creeps).toHaveLength(CREEP_WAVE.length * 2);
    expect(creeps.filter((unit) => unit.kind === "creepBig")).toHaveLength(2);
  });

  it("marches creeps toward the enemy base", () => {
    const { units } = setup();
    const world = new TestWorld();
    units.startWaves(0);
    run(units, world, FIRST_WAVE_TICKS + 1);
    const creep = units.all().find((unit) => unit.team === 0 && unit.kind === "creepBig")!;
    const startX = creep.position.x;
    run(units, world, 30);
    expect(creep.position.x).toBeGreaterThan(startX + 100);
  });

  it("turret shoots an enemy hero in range", () => {
    const { units } = setup();
    const turret = structurePosition("turret", 1);
    const intruder = hero("intruder", 0, { x: turret.x - 120, y: turret.y + 70 });
    const world = new TestWorld([intruder]);
    run(units, world, 1);
    expect(world.heroDamage.get("intruder")).toBe(UNIT_STATS.turret.attackDamage);
  });

  it("turret prefers creeps until called for help", () => {
    const { units } = setup();
    const world = new TestWorld();
    units.startWaves(0);
    const turret = structurePosition("turret", 1);
    run(units, world, FIRST_WAVE_TICKS + 1);
    for (const creep of units.all().filter((unit) => unit.team === 0 && unit.kind.startsWith("creep"))) {
      creep.position = { x: turret.x - 150, y: turret.y };
    }
    const attacker = hero("attacker", 0, { x: turret.x - 150, y: turret.y + 60 });
    world.heroes = [attacker];
    run(units, world, 1);
    expect(world.heroDamage.get("attacker")).toBeUndefined();

    units.callForHelp(attacker, { x: turret.x, y: turret.y + 100 }, world.tick);
    run(units, world, 40);
    expect(world.heroDamage.get("attacker")).toBeGreaterThan(0);
  });

  it("keeps the middle of the lane out of turret reach", () => {
    const reach = UNIT_STATS.turret.attackRange + UNIT_STATS.turret.radius + UNIT_STATS.creepBig.radius;
    const middle = ARENA.width / 2;
    for (const team of [0, 1] as const) {
      expect(Math.abs(structurePosition("turret", team).x - middle)).toBeGreaterThan(reach + 60);
    }
  });

  it("reset restores structures and removes creeps", () => {
    const { units } = setup();
    const world = new TestWorld();
    units.startWaves(0);
    run(units, world, FIRST_WAVE_TICKS + 1);
    units.damage("turret0", 500, "x");
    units.reset();
    expect(units.all()).toHaveLength(4);
    expect(units.get("turret0")?.hp).toBe(UNIT_STATS.turret.maxHp);
  });
});
