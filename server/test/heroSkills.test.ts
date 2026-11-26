import { describe, expect, it } from "vitest";
import {
  HERO_IDS,
  getHero,
  getSkill,
  type CombatEvent,
  type HeroId,
  type SkillDefinition,
  type SkillSlot,
  type SkillZone,
  type Vec2,
} from "@moba/shared";
import { createStatus, isStunned, moveSpeedFactor } from "../src/skills/CombatStatus.js";
import { SkillSystem, dealDamage, type SkillActor, type SkillWorld } from "../src/skills/SkillSystem.js";

interface Actor extends SkillActor {
  dead: boolean;
}

const LANE_Y = 330;
const CASTER_START = { x: 150, y: LANE_Y };
const TARGET_HERO: HeroId = "goliath";
const RUN_TICKS = 60;
const SELF_DAMAGE = 300;

function actor(id: string, heroId: HeroId, position: Vec2): Actor {
  return {
    id,
    heroId,
    position: { ...position },
    hp: getHero(heroId).maxHp,
    status: createStatus(),
    skillReadyTick: [0, 0, 0],
    dead: false,
  };
}

class TestWorld implements SkillWorld<Actor> {
  tick = 0;
  events: CombatEvent[] = [];
  reveals: [string, string, number][] = [];
  constructor(readonly actors: Actor[]) {}
  isAlive(target: Actor) {
    return !target.dead;
  }
  damage(target: Actor, amount: number) {
    const result = dealDamage(target, amount, this.tick);
    if (target.hp === 0) target.dead = true;
    return result;
  }
  reveal(targetId: string, viewerId: string, ticks: number) {
    this.reveals.push([targetId, viewerId, ticks]);
  }
  emit(event: CombatEvent) {
    this.events.push(event);
  }
  hits(skillId: string) {
    return this.events.filter((event) => event.kind === "skillHit" && event.skillId === skillId);
  }
}

interface Observed {
  stunned: boolean;
  slowed: boolean;
  shielded: boolean;
}

function simulate(system: SkillSystem<Actor>, world: TestWorld, watched: Actor, ticks = RUN_TICKS): Observed {
  const observed = { stunned: false, slowed: false, shielded: false };
  for (let i = 0; i < ticks; i++) {
    system.update(world);
    observed.stunned ||= isStunned(watched.status, world.tick);
    observed.slowed ||= moveSpeedFactor(watched.status, world.tick) < 1;
    observed.shielded ||= watched.status.shield > 0;
    world.tick++;
  }
  return observed;
}

function along(distance: number): Vec2 {
  return { x: CASTER_START.x + distance, y: LANE_Y };
}

function aimPointDistance(skill: SkillDefinition): number {
  return skill.aim === "direction" ? skill.range : Math.min(skill.range, 300);
}

function zoneReach(zone: SkillZone): number {
  switch (zone.shape.type) {
    case "line":
      return zone.shape.length * 0.5;
    case "cone":
    case "circle":
      return zone.shape.type === "cone" ? zone.shape.radius * 0.6 : zone.shape.radius * 0.5;
    case "ring":
      return (zone.shape.innerRadius + zone.shape.outerRadius) / 2;
  }
}

function enemyScenario(skill: SkillDefinition, zone: SkillZone): { target: Vec2; aim: Vec2 } {
  const delivery = skill.delivery;
  if (delivery.type === "projectile") return { target: along(300), aim: along(600) };
  if (delivery.type === "dash") {
    const distance = Math.min(delivery.distance, 300);
    const target = along(distance * 0.5);
    return { target, aim: skill.aim === "point" ? target : along(600) };
  }
  if (zone.anchor === "aimPoint") {
    const center = aimPointDistance(skill);
    const offset = zone.shape.type === "ring" ? zoneReach(zone) : 0;
    return { target: along(center + offset), aim: along(center) };
  }
  return { target: along(zoneReach(zone)), aim: along(600) };
}

const cases = HERO_IDS.flatMap((heroId) =>
  getHero(heroId).skills.map((skillId, slot) => ({ heroId, skillId, slot: slot as SkillSlot })),
);

describe("every hero skill resolves", () => {
  for (const { heroId, skillId, slot } of cases) {
    const skill = getSkill(skillId);

    skill.zones.forEach((zone, zoneIndex) => {
      if (zone.targets !== "enemy") return;

      it(`${heroId} ${skillId} zone ${zoneIndex} applies its effects to an enemy`, () => {
        const system = new SkillSystem<Actor>();
        const caster = actor("caster", heroId, CASTER_START);
        const { target: targetPosition, aim } = enemyScenario(skill, zone);
        const target = actor("target", TARGET_HERO, targetPosition);
        const world = new TestWorld([caster, target]);

        expect(system.cast(caster, slot, aim, world)).toBe(true);
        const observed = simulate(system, world, target);

        expect(world.hits(skillId).some((event) => event.kind === "skillHit" && event.targetId === "target")).toBe(true);
        for (const effect of zone.effects) {
          switch (effect.type) {
            case "damage":
              expect(target.hp).toBeLessThan(getHero(TARGET_HERO).maxHp);
              break;
            case "stun":
              expect(observed.stunned).toBe(true);
              break;
            case "slow":
              expect(observed.slowed).toBe(true);
              break;
            case "knockback":
              expect(Math.hypot(target.position.x - targetPosition.x, target.position.y - targetPosition.y)).toBeGreaterThan(
                effect.distance * 0.5,
              );
              break;
            case "reveal":
              expect(world.reveals.some(([t, v]) => t === "target" && v === "caster")).toBe(true);
              break;
            default:
              throw new Error(`${effect.type} on an enemy zone`);
          }
        }
      });
    });

    if (skill.zones.some((zone) => zone.targets === "self")) {
      it(`${heroId} ${skillId} applies its self effects`, () => {
        const system = new SkillSystem<Actor>();
        const caster = actor("caster", heroId, CASTER_START);
        caster.hp -= SELF_DAMAGE;
        const world = new TestWorld([caster]);

        expect(system.cast(caster, slot, along(600), world)).toBe(true);
        const observed = simulate(system, world, caster);

        const effects = skill.zones.filter((zone) => zone.targets === "self").flatMap((zone) => zone.effects);
        for (const effect of effects) {
          if (effect.type === "heal") expect(caster.hp).toBeGreaterThan(getHero(heroId).maxHp - SELF_DAMAGE);
          else if (effect.type === "shield") expect(observed.shielded).toBe(true);
          else throw new Error(`${effect.type} on a self zone`);
        }
      });
    }

    if (skill.delivery.type === "dash") {
      it(`${heroId} ${skillId} moves the caster`, () => {
        const system = new SkillSystem<Actor>();
        const caster = actor("caster", heroId, CASTER_START);
        const world = new TestWorld([caster]);

        system.cast(caster, slot, along(skill.range), world);
        simulate(system, world, caster);

        expect(caster.position.x - CASTER_START.x).toBeGreaterThan(skill.range * 0.9);
        expect(caster.status.motion).toBeNull();
      });
    }
  }
});

describe("new hero skill details", () => {
  it("dashes stop at walls", () => {
    const system = new SkillSystem<Actor>();
    const kael = actor("kael", "kael", { x: 680, y: 450 });
    const world = new TestWorld([kael]);

    system.cast(kael, 0, { x: 1000, y: 450 }, world);
    simulate(system, world, kael);

    expect(kael.position.x).toBeCloseTo(760 - getHero("kael").radius, 0);
    expect(kael.status.motion).toBeNull();
  });

  it("piercing shot hits only the first enemy in line", () => {
    const system = new SkillSystem<Actor>();
    const vesper = actor("vesper", "vesper", CASTER_START);
    const near = actor("near", "goliath", along(250));
    const far = actor("far", "goliath", along(450));
    const world = new TestWorld([vesper, near, far]);

    system.cast(vesper, 0, along(600), world);
    simulate(system, world, near);

    expect(near.hp).toBe(getHero("goliath").maxHp - 120);
    expect(far.hp).toBe(getHero("goliath").maxHp);
  });

  it("phantom rush stops on the first enemy it reaches", () => {
    const system = new SkillSystem<Actor>();
    const wisp = actor("wisp", "wisp", CASTER_START);
    const target = actor("target", "goliath", along(120));
    const world = new TestWorld([wisp, target]);

    system.cast(wisp, 2, along(600), world);
    simulate(system, world, target);

    expect(wisp.position.x).toBeLessThan(target.position.x);
    expect(wisp.status.shield).toBeGreaterThan(0);
  });

  it("cataclysm only lands after its one second telegraph", () => {
    const system = new SkillSystem<Actor>();
    const hex = actor("hex", "hex", CASTER_START);
    const target = actor("target", "goliath", along(300));
    const world = new TestWorld([hex, target]);

    system.cast(hex, 2, target.position, world);
    simulate(system, world, target, 29);
    expect(target.hp).toBe(getHero("goliath").maxHp);
    const observed = simulate(system, world, target, 3);
    expect(target.hp).toBe(getHero("goliath").maxHp - 260);
    expect(observed.stunned).toBe(true);
  });

  it("stasis stuns the center and only slows the edge", () => {
    const system = new SkillSystem<Actor>();
    const mira = actor("mira", "mira", CASTER_START);
    const center = actor("center", "goliath", along(300));
    const edge = actor("edge", "goliath", { x: along(300).x, y: LANE_Y + 150 });
    const world = new TestWorld([mira, center, edge]);

    system.cast(mira, 2, center.position, world);
    const centerSeen = simulate(system, world, center, 25);
    expect(centerSeen.stunned).toBe(true);
    expect(isStunned(edge.status, world.tick)).toBe(false);
    expect(moveSpeedFactor(edge.status, world.tick)).toBeLessThan(1);
  });
});
