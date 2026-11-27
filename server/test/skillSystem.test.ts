import { beforeEach, describe, expect, it } from "vitest";
import { ARENA, getHero, type CombatEvent, type HeroId, type SkillSlot, type Vec2 } from "@moba/shared";
import { createStatus, isStunned, moveSpeedFactor } from "../src/skills/CombatStatus.js";
import { SkillSystem, dealDamage, type SkillActor, type SkillWorld } from "../src/skills/SkillSystem.js";

interface Actor extends SkillActor {
  dead: boolean;
}

function actor(id: string, heroId: HeroId, x: number, y: number): Actor {
  return {
    id,
    heroId,
    position: { x, y },
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

function run(system: SkillSystem<Actor>, world: TestWorld, ticks: number) {
  for (let i = 0; i < ticks; i++) {
    system.update(world);
    world.tick++;
  }
}

function cast(system: SkillSystem<Actor>, world: TestWorld, caster: Actor, slot: SkillSlot, aim: Vec2) {
  return system.cast(caster, slot, aim, world);
}

describe("SkillSystem", () => {
  let system: SkillSystem<Actor>;

  beforeEach(() => {
    system = new SkillSystem<Actor>();
  });

  it("arcane bolt hits only the first enemy on its path", () => {
    const nova = actor("nova", "nova", 250, 450);
    const near = actor("near", "bastion", 400, 450);
    const far = actor("far", "warden", 550, 450);
    const world = new TestWorld([nova, near, far]);

    expect(cast(system, world, nova, 0, { x: 600, y: 450 })).toBe(true);
    run(system, world, 20);

    expect(world.hits("novaArcaneBolt")).toHaveLength(1);
    expect(near.hp).toBe(getHero("bastion").maxHp - 130);
    expect(far.hp).toBe(getHero("warden").maxHp);
  });

  it("enforces cooldowns per slot", () => {
    const nova = actor("nova", "nova", 250, 450);
    const world = new TestWorld([nova]);
    expect(cast(system, world, nova, 0, { x: 600, y: 450 })).toBe(true);
    expect(cast(system, world, nova, 0, { x: 600, y: 450 })).toBe(false);
    expect(cast(system, world, nova, 1, { x: 300, y: 450 })).toBe(true);
    world.tick = nova.skillReadyTick[0];
    expect(cast(system, world, nova, 0, { x: 600, y: 450 })).toBe(true);
  });

  it("shields absorb damage before hp", () => {
    const bastion = actor("bastion", "bastion", 300, 450);
    const world = new TestWorld([bastion]);
    cast(system, world, bastion, 1, bastion.position);
    expect(bastion.status.shield).toBe(200);

    const result = dealDamage(bastion, 250, world.tick);
    expect(result).toEqual({ dealt: 50, absorbed: 200 });
    expect(bastion.hp).toBe(getHero("bastion").maxHp - 50);

    bastion.status.shield = 100;
    expect(dealDamage(bastion, 40, bastion.status.shieldUntilTick)).toEqual({ dealt: 40, absorbed: 0 });
  });

  it("delayed zones resolve only after their telegraph", () => {
    const bastion = actor("bastion", "bastion", 300, 450);
    const nova = actor("nova", "nova", 450, 450);
    const world = new TestWorld([bastion, nova]);

    cast(system, world, bastion, 2, nova.position);
    expect(system.visibleZones(() => true, world.tick)).toHaveLength(2);
    run(system, world, 11);
    expect(isStunned(nova.status, world.tick)).toBe(false);
    run(system, world, 2);
    expect(isStunned(nova.status, world.tick)).toBe(true);
    expect(world.hits("bastionEarthshatter")).toHaveLength(1);
    expect(nova.hp).toBe(getHero("nova").maxHp);
    expect(system.visibleZones(() => true, world.tick)).toHaveLength(0);
  });

  it("earthshatter ring damages without stunning", () => {
    const bastion = actor("bastion", "bastion", 300, 450);
    const nova = actor("nova", "nova", 550, 450);
    const world = new TestWorld([bastion, nova]);

    cast(system, world, bastion, 2, { x: 420, y: 450 });
    run(system, world, 14);
    expect(nova.hp).toBe(getHero("nova").maxHp - 120);
    expect(isStunned(nova.status, world.tick)).toBe(false);
  });

  it("shadow dash moves the caster and cuts enemies along the path once", () => {
    const blade = actor("blade", "blade", 250, 450);
    const warden = actor("warden", "warden", 350, 460);
    const world = new TestWorld([blade, warden]);

    cast(system, world, blade, 0, { x: 600, y: 450 });
    expect(blade.status.motion).not.toBeNull();
    run(system, world, 10);

    expect(blade.position.x).toBeCloseTo(470);
    expect(blade.status.motion).toBeNull();
    expect(world.hits("bladeShadowDash")).toHaveLength(1);
    expect(warden.hp).toBe(getHero("warden").maxHp - 70);
  });

  it("shield charge stops at the first enemy and knocks it back", () => {
    const bastion = actor("bastion", "bastion", 250, 450);
    const nova = actor("nova", "nova", 370, 450);
    const world = new TestWorld([bastion, nova]);

    cast(system, world, bastion, 0, { x: 600, y: 450 });
    run(system, world, 12);

    expect(bastion.position.x).toBeLessThan(330);
    expect(nova.position.x).toBeCloseTo(490, 0);
    expect(nova.hp).toBe(getHero("nova").maxHp - 40);
  });

  it("stun interrupts a dash and blocks casting", () => {
    const blade = actor("blade", "blade", 250, 300);
    const warden = actor("warden", "warden", 250, 520);
    const world = new TestWorld([blade, warden]);

    cast(system, world, blade, 0, { x: 250, y: 900 });
    cast(system, world, warden, 0, blade.position);
    run(system, world, 4);

    expect(isStunned(blade.status, world.tick)).toBe(true);
    expect(blade.status.motion).toBeNull();
    expect(blade.position.y).toBeLessThan(500);
    expect(cast(system, world, blade, 1, warden.position)).toBe(false);
  });

  it("binding chain stuns, damages and reveals the target to the caster", () => {
    const warden = actor("warden", "warden", 250, 450);
    const nova = actor("nova", "nova", 600, 450);
    const world = new TestWorld([warden, nova]);

    cast(system, world, warden, 0, nova.position);
    run(system, world, 15);

    expect(nova.hp).toBe(getHero("nova").maxHp - 50);
    expect(isStunned(nova.status, world.tick)).toBe(true);
    expect(world.reveals).toContainEqual(["nova", "warden", 90]);
  });

  it("frost field slows enemies inside", () => {
    const nova = actor("nova", "nova", 250, 450);
    const blade = actor("blade", "blade", 450, 450);
    const world = new TestWorld([nova, blade]);

    cast(system, world, nova, 1, blade.position);
    expect(moveSpeedFactor(blade.status, world.tick)).toBeCloseTo(0.55);
    expect(blade.hp).toBe(getHero("blade").maxHp - 60);
  });

  it("sanctuary heal is capped at max hp", () => {
    const warden = actor("warden", "warden", 250, 450);
    const world = new TestWorld([warden]);
    warden.hp -= 50;

    cast(system, world, warden, 1, warden.position);
    expect(warden.hp).toBe(getHero("warden").maxHp);
    expect(warden.status.shield).toBe(80);
  });

  it("knockback is stopped by walls", () => {
    const warden = actor("warden", "warden", 500, 400);
    const blade = actor("blade", "blade", 500, 245);
    const world = new TestWorld([warden, blade]);

    cast(system, world, warden, 2, { x: 500, y: 0 });
    run(system, world, 10);
    expect(blade.position.y).toBeCloseTo(222);
    expect(blade.status.motion).toBeNull();
  });

  it("projectiles fly through walls", () => {
    const nova = actor("nova", "nova", 400, 450);
    const blade = actor("blade", "blade", 950, 450);
    const world = new TestWorld([nova, blade]);

    cast(system, world, nova, 0, blade.position);
    run(system, world, 25);
    expect(blade.hp).toBe(getHero("blade").maxHp - 130);
  });

  it("projectiles end at the arena edge", () => {
    const nova = actor("nova", "nova", ARENA.width - 200, 100);
    const world = new TestWorld([nova]);

    cast(system, world, nova, 0, { x: ARENA.width, y: 100 });
    run(system, world, 25);
    const end = world.events.find((event) => event.kind === "projectileEnd");
    expect(end?.kind === "projectileEnd" && end.x).toBeCloseTo(ARENA.width);
  });

  it("a passing dash crosses a wall when its range reaches the far side", () => {
    const blade = actor("blade", "blade", 650, 450);
    const world = new TestWorld([blade]);

    cast(system, world, blade, 0, { x: 1000, y: 450 });
    run(system, world, 15);
    expect(blade.position.x).toBeCloseTo(870);
    expect(blade.status.motion).toBeNull();
  });

  it("a passing dash stops at the wall when it would land inside it", () => {
    const blade = actor("blade", "blade", 400, 610);
    const world = new TestWorld([blade]);

    cast(system, world, blade, 0, { x: 1000, y: 610 });
    run(system, world, 15);
    expect(blade.position.x).toBeCloseTo(600 - getHero("blade").radius, 0);
    expect(blade.status.motion).toBeNull();
  });

  it("a passing dash that ends inside a wall is pushed out of it", () => {
    const blade = actor("blade", "blade", 490, 610);
    const world = new TestWorld([blade]);

    cast(system, world, blade, 0, { x: 1000, y: 610 });
    while (blade.position.x < 620) run(system, world, 1);
    blade.status.motion = { ...blade.status.motion!, remaining: 0.001 };
    run(system, world, 1);
    expect(blade.position.x < 600 - 21 || blade.position.x > 660 + 21).toBe(true);
  });

  it("projectiles stop on the first creep and damage it", () => {
    const nova = actor("nova", "nova", 200, 300);
    const enemy = actor("enemy", "blade", 500, 300);
    const creepDamage: number[] = [];
    const world = Object.assign(new TestWorld([nova, enemy]), {
      creepsHostileTo: () => [{ id: "c1", position: { x: 350, y: 300 }, radius: 13 }],
      damageCreep: (_id: string, amount: number) => {
        creepDamage.push(amount);
        return amount;
      },
    });

    cast(system, world, nova, 0, { x: 600, y: 300 });
    run(system, world, 30);
    expect(creepDamage.length).toBe(1);
    expect(enemy.hp).toBe(getHero("blade").maxHp);
    expect(world.events.some((event) => event.kind === "skillHit" && event.targetId === "c1")).toBe(true);
  });
});
