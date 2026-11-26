import { describe, expect, it } from "vitest";
import { chooseAttackTarget, isAimInsideAttackRange } from "../src/targeting.js";

const attacker = { position: { x: 0, y: 0 }, radius: 20, attackRange: 80 };
const reach = attacker.attackRange + attacker.radius;

function enemy(id: string, x: number, y: number, radius = 20) {
  return { id, position: { x, y }, radius };
}

describe("isAimInsideAttackRange", () => {
  it("includes the boundary of attackRange + radius", () => {
    expect(isAimInsideAttackRange(attacker, { x: reach, y: 0 })).toBe(true);
    expect(isAimInsideAttackRange(attacker, { x: reach + 0.01, y: 0 })).toBe(false);
  });
});

describe("chooseAttackTarget", () => {
  it("returns undefined without candidates", () => {
    expect(chooseAttackTarget(attacker, [])).toBeUndefined();
  });

  it("picks the enemy nearest to the attacker by default", () => {
    const near = enemy("near", 60, 0);
    const far = enemy("far", 0, -100);
    expect(chooseAttackTarget(attacker, [far, near])).toBe(near);
  });

  it("picks the enemy nearest to the aim when the aim is inside the range", () => {
    const near = enemy("near", 50, 0);
    const aimed = enemy("aimed", -100, 0);
    expect(chooseAttackTarget(attacker, [near, aimed], { x: -90, y: 0 })).toBe(aimed);
  });

  it("ignores an aim outside the range and falls back to nearest to self", () => {
    const near = enemy("near", 50, 0);
    const other = enemy("other", -110, 0);
    expect(chooseAttackTarget(attacker, [near, other], { x: -500, y: 0 })).toBe(near);
  });

  it("never picks an out-of-range enemy, even right under the aim", () => {
    const outOfRange = enemy("out", 0, 200);
    expect(chooseAttackTarget(attacker, [outOfRange], { x: 0, y: 95 })).toBeUndefined();

    const inRange = enemy("in", 100, 0);
    expect(chooseAttackTarget(attacker, [outOfRange, inRange], { x: 0, y: 95 })).toBe(inRange);
  });

  it("counts the target radius toward the range", () => {
    expect(chooseAttackTarget(attacker, [enemy("big", 135, 0, 35)])?.id).toBe("big");
    expect(chooseAttackTarget(attacker, [enemy("small", 135, 0, 10)])).toBeUndefined();
  });
});
