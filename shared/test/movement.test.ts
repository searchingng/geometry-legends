import { describe, expect, it } from "vitest";
import { ARENA, type GameMap } from "../src/map.js";
import type { Vec2 } from "../src/math.js";
import { isValidMoveInput, stepMovement, type MoveInput, type MoverStats } from "../src/movement.js";

const STATS: MoverStats = { radius: 20, moveSpeed: 100 };
const DT = 0.1;
const STEP = STATS.moveSpeed * DT;
const WALL = { x: 400, y: 400, width: 200, height: 200 };
const MAP: GameMap = {
  width: 1000,
  height: 1000,
  walls: [WALL],
  spawns: [
    { x: 100, y: 100 },
    { x: 900, y: 900 },
  ],
};
const OPEN_MAP: GameMap = { ...MAP, walls: [] };

function move(position: Vec2, x: number, y: number, map: GameMap = MAP): Vec2 {
  return stepMovement(position, { seq: 0, x, y }, STATS, map, DT);
}

describe("stepMovement free movement", () => {
  it.each([
    [1, 0, 110, 100],
    [-1, 0, 90, 100],
    [0, 1, 100, 110],
    [0, -1, 100, 90],
  ])("moves along axis input (%i, %i)", (x, y, expectedX, expectedY) => {
    expect(move({ x: 100, y: 100 }, x, y)).toEqual({ x: expectedX, y: expectedY });
  });

  it("stays put with zero input", () => {
    expect(move({ x: 100, y: 100 }, 0, 0)).toEqual({ x: 100, y: 100 });
  });

  it("normalizes diagonal input so speed matches axis movement", () => {
    const next = move({ x: 100, y: 100 }, 1, 1);
    expect(Math.hypot(next.x - 100, next.y - 100)).toBeCloseTo(STEP, 10);
    expect(next.x - 100).toBeCloseTo(STEP / Math.SQRT2, 10);
    expect(next.y - 100).toBeCloseTo(STEP / Math.SQRT2, 10);
  });

  it("scales distance with dt", () => {
    const next = stepMovement({ x: 100, y: 100 }, { seq: 0, x: 1, y: 0 }, STATS, MAP, 0.5);
    expect(next).toEqual({ x: 150, y: 100 });
  });

  it("does not mutate the input position", () => {
    const position = { x: 100, y: 100 };
    move(position, 1, 1);
    expect(position).toEqual({ x: 100, y: 100 });
  });
});

describe("stepMovement wall push-out", () => {
  it.each([
    ["left", { x: 375, y: 500 }, 1, 0, { x: WALL.x - STATS.radius, y: 500 }],
    ["right", { x: 625, y: 500 }, -1, 0, { x: WALL.x + WALL.width + STATS.radius, y: 500 }],
    ["top", { x: 500, y: 375 }, 0, 1, { x: 500, y: WALL.y - STATS.radius }],
    ["bottom", { x: 500, y: 625 }, 0, -1, { x: 500, y: WALL.y + WALL.height + STATS.radius }],
  ])("stops a circle moving into the %s face", (_side, start, x, y, expected) => {
    const next = move(start, x, y);
    expect(next.x).toBeCloseTo(expected.x, 10);
    expect(next.y).toBeCloseTo(expected.y, 10);
  });

  it.each([
    ["left", { x: 410, y: 500 }, { x: WALL.x - STATS.radius, y: 500 }],
    ["right", { x: 590, y: 500 }, { x: WALL.x + WALL.width + STATS.radius, y: 500 }],
    ["top", { x: 500, y: 410 }, { x: 500, y: WALL.y - STATS.radius }],
    ["bottom", { x: 500, y: 590 }, { x: 500, y: WALL.y + WALL.height + STATS.radius }],
  ])("ejects a center inside the wall through the nearest (%s) face", (_side, start, expected) => {
    expect(move(start, 0, 0)).toEqual(expected);
  });

  it("pushes radially away from a corner", () => {
    const next = move({ x: 390, y: 390 }, 0, 0);
    expect(Math.hypot(next.x - WALL.x, next.y - WALL.y)).toBeCloseTo(STATS.radius, 10);
    expect(next.x).toBeCloseTo(next.y, 10);
    expect(next.x).toBeLessThan(WALL.x);
  });

  it("leaves a circle that only touches the wall untouched", () => {
    const touching = { x: WALL.x - STATS.radius, y: 500 };
    expect(move(touching, 0, 0)).toEqual(touching);
  });

  it("slides along a vertical face when moving diagonally into it", () => {
    const start = { x: WALL.x - STATS.radius, y: 500 };
    const next = move(start, 1, 1);
    expect(next.x).toBeCloseTo(WALL.x - STATS.radius, 10);
    expect(next.y - start.y).toBeCloseTo(STEP / Math.SQRT2, 10);
  });

  it("slides along a horizontal face when moving diagonally into it", () => {
    const start = { x: 500, y: WALL.y + WALL.height + STATS.radius };
    const next = move(start, -1, -1);
    expect(next.y).toBeCloseTo(WALL.y + WALL.height + STATS.radius, 10);
    expect(start.x - next.x).toBeCloseTo(STEP / Math.SQRT2, 10);
  });
});

describe("stepMovement map clamp", () => {
  it.each([
    ["left", { x: 25, y: 500 }, -1, 0, { x: STATS.radius, y: 500 }],
    ["right", { x: 975, y: 500 }, 1, 0, { x: 1000 - STATS.radius, y: 500 }],
    ["top", { x: 500, y: 25 }, 0, -1, { x: 500, y: STATS.radius }],
    ["bottom", { x: 500, y: 975 }, 0, 1, { x: 500, y: 1000 - STATS.radius }],
  ])("keeps the circle inside the %s edge", (_side, start, x, y, expected) => {
    expect(move(start, x, y, OPEN_MAP)).toEqual(expected);
  });

  it("clamps both axes in a map corner", () => {
    expect(move({ x: 22, y: 22 }, -1, -1, OPEN_MAP)).toEqual({ x: STATS.radius, y: STATS.radius });
  });
});

describe("stepMovement determinism", () => {
  function inputSequence(length: number, seed: number): MoveInput[] {
    let state = seed;
    const nextAxis = () => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return (state % 3) - 1;
    };
    return Array.from({ length }, (_, seq) => ({ seq, x: nextAxis(), y: nextAxis() }));
  }

  function replay(inputs: MoveInput[]): Vec2[] {
    let position = ARENA.spawns[0];
    return inputs.map((input) => {
      position = stepMovement(position, input, STATS, ARENA, 1 / 30);
      return position;
    });
  }

  it("produces bit-identical positions when replaying the same inputs", () => {
    const inputs = inputSequence(2000, 42);
    const first = replay(inputs);
    const second = replay(inputs);
    expect(second).toEqual(first);
    first.forEach((position, i) => {
      expect(Object.is(position.x, second[i].x)).toBe(true);
      expect(Object.is(position.y, second[i].y)).toBe(true);
    });
  });

  it("never leaves the map or overlaps an arena wall", () => {
    const epsilon = 1e-9;
    for (const position of replay(inputSequence(2000, 7))) {
      expect(position.x).toBeGreaterThanOrEqual(STATS.radius);
      expect(position.x).toBeLessThanOrEqual(ARENA.width - STATS.radius);
      expect(position.y).toBeGreaterThanOrEqual(STATS.radius);
      expect(position.y).toBeLessThanOrEqual(ARENA.height - STATS.radius);
      for (const wall of ARENA.walls) {
        const closestX = Math.max(wall.x, Math.min(wall.x + wall.width, position.x));
        const closestY = Math.max(wall.y, Math.min(wall.y + wall.height, position.y));
        expect(Math.hypot(position.x - closestX, position.y - closestY)).toBeGreaterThanOrEqual(
          STATS.radius - epsilon,
        );
      }
    }
  });
});

describe("isValidMoveInput", () => {
  it.each([
    { seq: 0, x: 0, y: 0 },
    { seq: 17, x: 1, y: -1 },
    { seq: Number.MAX_SAFE_INTEGER, x: -1, y: 1 },
    { seq: 3, x: 1, y: 0, extra: "ignored" },
  ])("accepts %o", (input) => {
    expect(isValidMoveInput(input)).toBe(true);
  });

  it.each<[string, unknown]>([
    ["null", null],
    ["undefined", undefined],
    ["a number", 5],
    ["a string", "1,0"],
    ["missing seq", { x: 1, y: 0 }],
    ["fractional seq", { seq: 1.5, x: 1, y: 0 }],
    ["unsafe seq", { seq: Number.MAX_SAFE_INTEGER + 1, x: 1, y: 0 }],
    ["string seq", { seq: "1", x: 1, y: 0 }],
    ["NaN seq", { seq: NaN, x: 1, y: 0 }],
    ["fractional x", { seq: 1, x: 0.5, y: 0 }],
    ["out of range y", { seq: 1, x: 0, y: 2 }],
    ["string x", { seq: 1, x: "1", y: 0 }],
    ["NaN y", { seq: 1, x: 0, y: NaN }],
    ["missing y", { seq: 1, x: 0 }],
  ])("rejects %s", (_label, input) => {
    expect(isValidMoveInput(input)).toBe(false);
  });
});
