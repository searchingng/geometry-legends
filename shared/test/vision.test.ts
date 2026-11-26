import { describe, expect, it } from "vitest";
import { ARENA, bushIndexAt, type GameMap } from "../src/map.js";
import { canSeePosition, castVisibilityRays, hasLineOfSight, isHiddenInBush, isWithinVision } from "../src/vision.js";

describe("isWithinVision", () => {
  const viewer = { x: 100, y: 100 };

  it("sees targets inside the range", () => {
    expect(isWithinVision(viewer, 50, { x: 120, y: 130 })).toBe(true);
  });

  it("sees targets exactly on the range boundary", () => {
    expect(isWithinVision(viewer, 50, { x: 130, y: 140 })).toBe(true);
    expect(isWithinVision(viewer, 50, { x: 50, y: 100 })).toBe(true);
  });

  it("does not see targets just beyond the range", () => {
    expect(isWithinVision(viewer, 50, { x: 150.001, y: 100 })).toBe(false);
    expect(isWithinVision(viewer, 50, { x: 131, y: 140 })).toBe(false);
  });

  it("is symmetric in direction", () => {
    expect(isWithinVision(viewer, 50, { x: 70, y: 60 })).toBe(true);
    expect(isWithinVision(viewer, 50, { x: 69, y: 60 })).toBe(false);
  });

  it("with zero range only sees the same point", () => {
    expect(isWithinVision(viewer, 0, { x: 100, y: 100 })).toBe(true);
    expect(isWithinVision(viewer, 0, { x: 100, y: 100.5 })).toBe(false);
  });
});

const WALL = { x: 200, y: 0, width: 50, height: 300 };
const BUSH_A = { x: 400, y: 0, width: 100, height: 100 };
const BUSH_B = { x: 600, y: 0, width: 100, height: 100 };
const MAP: GameMap = {
  width: 1000,
  height: 1000,
  walls: [WALL],
  bushes: [BUSH_A, BUSH_B],
  spawns: [
    { x: 0, y: 0 },
    { x: 1000, y: 1000 },
  ],
};

describe("hasLineOfSight", () => {
  it("is clear when no wall is between the points", () => {
    expect(hasLineOfSight({ x: 100, y: 400 }, { x: 400, y: 400 }, MAP.walls)).toBe(true);
  });

  it("is blocked by a wall crossing the segment", () => {
    expect(hasLineOfSight({ x: 100, y: 150 }, { x: 400, y: 150 }, MAP.walls)).toBe(false);
  });

  it("is blocked when the segment clips a wall corner", () => {
    expect(hasLineOfSight({ x: 150, y: 330 }, { x: 300, y: 280 }, MAP.walls)).toBe(false);
  });

  it("is clear when the segment passes just past a corner", () => {
    expect(hasLineOfSight({ x: 150, y: 350 }, { x: 300, y: 301 }, MAP.walls)).toBe(true);
  });

  it("is symmetric", () => {
    const a = { x: 100, y: 150 };
    const b = { x: 400, y: 150 };
    expect(hasLineOfSight(b, a, MAP.walls)).toBe(hasLineOfSight(a, b, MAP.walls));
  });
});

describe("isHiddenInBush", () => {
  it("does not hide targets outside bushes", () => {
    expect(isHiddenInBush(MAP, { x: 450, y: 50 }, { x: 450, y: 200 })).toBe(false);
  });

  it("hides a target in a bush from a viewer outside it", () => {
    expect(isHiddenInBush(MAP, { x: 450, y: 200 }, { x: 450, y: 50 })).toBe(true);
  });

  it("does not hide a target from a viewer in the same bush", () => {
    expect(isHiddenInBush(MAP, { x: 410, y: 10 }, { x: 490, y: 90 })).toBe(false);
  });

  it("hides a target from a viewer in a different bush", () => {
    expect(isHiddenInBush(MAP, { x: 650, y: 50 }, { x: 450, y: 50 })).toBe(true);
  });
});

describe("canSeePosition", () => {
  it("requires range, line of sight and no bush cover", () => {
    expect(canSeePosition(MAP, { x: 300, y: 400 }, 200, { x: 450, y: 400 })).toBe(true);
    expect(canSeePosition(MAP, { x: 300, y: 400 }, 100, { x: 450, y: 400 })).toBe(false);
    expect(canSeePosition(MAP, { x: 100, y: 150 }, 500, { x: 350, y: 150 })).toBe(false);
    expect(canSeePosition(MAP, { x: 450, y: 200 }, 500, { x: 450, y: 50 })).toBe(false);
  });
});

describe("castVisibilityRays", () => {
  it("stops rays at walls and caps the rest at the radius", () => {
    const rays = castVisibilityRays(MAP, { x: 100, y: 150 }, 300, new Float32Array(4));
    expect(rays[0]).toBeCloseTo(100);
    expect(rays[1]).toBeCloseTo(300);
    expect(rays[2]).toBeCloseTo(300);
    expect(rays[3]).toBeCloseTo(300);
  });
});

describe("ARENA", () => {
  const bushes = ARENA.bushes ?? [];

  it("keeps bushes clear of walls and spawns", () => {
    expect(bushes.length).toBeGreaterThan(0);
    for (const bush of bushes) {
      for (const wall of ARENA.walls) {
        const overlaps =
          bush.x < wall.x + wall.width &&
          wall.x < bush.x + bush.width &&
          bush.y < wall.y + wall.height &&
          wall.y < bush.y + bush.height;
        expect(overlaps).toBe(false);
      }
      for (const spawn of ARENA.spawns) expect(bushIndexAt({ ...ARENA, bushes: [bush] }, spawn)).toBe(-1);
    }
  });

  it("is point-symmetric for fairness", () => {
    const key = (r: { x: number; y: number; width: number; height: number }) => `${r.x},${r.y},${r.width},${r.height}`;
    const mirror = (r: { x: number; y: number; width: number; height: number }) => ({
      ...r,
      x: ARENA.width - r.x - r.width,
      y: ARENA.height - r.y - r.height,
    });
    for (const rects of [ARENA.walls, bushes]) {
      const keys = new Set(rects.map(key));
      for (const rect of rects) expect(keys.has(key(mirror(rect)))).toBe(true);
    }
  });
});
