import { describe, expect, it } from "vitest";
import { advanceMotion, displace, planDash, slowFactor, type GameMap } from "../src/index.js";

const MAP: GameMap = {
  width: 1000,
  height: 1000,
  walls: [{ x: 500, y: 0, width: 40, height: 1000 }],
  bushes: [],
  spawns: [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ],
};

describe("forced motion", () => {
  it("moves by one step per tick until the distance is used up", () => {
    let position = { x: 100, y: 500 };
    let motion = advanceMotion(position, { dirX: 1, dirY: 0, step: 40, remaining: 100 }, 20, MAP);
    expect(motion.position.x).toBeCloseTo(140);
    expect(motion.motion?.remaining).toBeCloseTo(60);

    position = motion.position;
    motion = advanceMotion(position, motion.motion!, 20, MAP);
    motion = advanceMotion(motion.position, motion.motion!, 20, MAP);
    expect(motion.position.x).toBeCloseTo(200);
    expect(motion.motion).toBeNull();
  });

  it("stops against a wall instead of tunnelling through it", () => {
    const step = advanceMotion({ x: 470, y: 500 }, { dirX: 1, dirY: 0, step: 60, remaining: 300 }, 20, MAP);
    expect(step.position.x).toBeCloseTo(480);
    expect(step.motion).toBeNull();
  });

  it("never passes through a thin wall even with a large displacement", () => {
    const end = displace({ x: 400, y: 500 }, 1, 0, 400, 10, MAP);
    expect(end.x).toBeLessThanOrEqual(490);
  });

  it("plans a passing dash through a wall when the landing spot is clear", () => {
    const motion = planDash({ x: 450, y: 500 }, { x: 1, y: 0 }, 200, 50, "pass", 20, MAP);
    expect(motion.passWalls).toBe(true);
    let step = advanceMotion({ x: 450, y: 500 }, motion, 20, MAP);
    while (step.motion) step = advanceMotion(step.position, step.motion, 20, MAP);
    expect(step.position.x).toBeCloseTo(650);
  });

  it("falls back to a blocked dash when the landing spot is inside a wall", () => {
    const motion = planDash({ x: 450, y: 500 }, { x: 1, y: 0 }, 80, 50, "pass", 20, MAP);
    expect(motion.passWalls).toBeUndefined();
    expect(motion.remaining).toBe(80);
  });

  it("shortens a passing dash at the arena edge", () => {
    const motion = planDash({ x: 900, y: 500 }, { x: 1, y: 0 }, 200, 50, "pass", 20, MAP);
    expect(motion.passWalls).toBe(true);
    expect(motion.remaining).toBeCloseTo(80);
  });

  it("never lets a blocking dash pass a wall", () => {
    expect(planDash({ x: 450, y: 500 }, { x: 1, y: 0 }, 200, 50, "block", 20, MAP).passWalls).toBeUndefined();
  });

  it("clamps slow percentages", () => {
    expect(slowFactor(45)).toBeCloseTo(0.55);
    expect(slowFactor(150)).toBeCloseTo(0.1);
    expect(slowFactor(-5)).toBe(1);
  });
});
