import { describe, expect, it } from "vitest";
import {
  distanceToSegment,
  segmentObstacleEntry,
  segmentRectEntry,
  shapeExtent,
  shapeHits,
  sweepCircle,
  type GameMap,
} from "../src/index.js";

const ORIGIN = { x: 0, y: 0 };
const RIGHT = { x: 1, y: 0 };

describe("shapeHits", () => {
  it("circle counts the body radius", () => {
    const circle = { type: "circle", radius: 100 } as const;
    expect(shapeHits(circle, ORIGIN, RIGHT, { x: 120, y: 0 }, 20)).toBe(true);
    expect(shapeHits(circle, ORIGIN, RIGHT, { x: 121, y: 0 }, 20)).toBe(false);
  });

  it("ring excludes bodies centred inside the inner radius", () => {
    const ring = { type: "ring", innerRadius: 90, outerRadius: 170 } as const;
    expect(shapeHits(ring, ORIGIN, RIGHT, { x: 50, y: 0 }, 22)).toBe(false);
    expect(shapeHits(ring, ORIGIN, RIGHT, { x: 0, y: 120 }, 22)).toBe(true);
    expect(shapeHits(ring, ORIGIN, RIGHT, { x: 190, y: 0 }, 22)).toBe(true);
    expect(shapeHits(ring, ORIGIN, RIGHT, { x: 193, y: 0 }, 22)).toBe(false);
  });

  it("cone respects its angle with a body margin", () => {
    const cone = { type: "cone", radius: 110, angleDeg: 90 } as const;
    expect(shapeHits(cone, ORIGIN, RIGHT, { x: 80, y: 70 }, 0)).toBe(true);
    expect(shapeHits(cone, ORIGIN, RIGHT, { x: 60, y: 80 }, 0)).toBe(false);
    expect(shapeHits(cone, ORIGIN, RIGHT, { x: 60, y: 80 }, 20)).toBe(true);
    expect(shapeHits(cone, ORIGIN, RIGHT, { x: -80, y: 0 }, 20)).toBe(false);
    expect(shapeHits(cone, ORIGIN, RIGHT, { x: -10, y: 0 }, 20)).toBe(true);
  });

  it("line is a rectangle along the direction", () => {
    const line = { type: "line", length: 200, width: 40 } as const;
    const up = { x: 0, y: -1 };
    expect(shapeHits(line, ORIGIN, up, { x: 30, y: -150 }, 15)).toBe(true);
    expect(shapeHits(line, ORIGIN, up, { x: 40, y: -150 }, 15)).toBe(false);
    expect(shapeHits(line, ORIGIN, up, { x: 0, y: 214 }, 15)).toBe(false);
    expect(shapeHits(line, ORIGIN, up, { x: 0, y: -214 }, 15)).toBe(true);
  });

  it("reports the reach of each shape", () => {
    expect(shapeExtent({ type: "ring", innerRadius: 10, outerRadius: 30 })).toBe(30);
    expect(shapeExtent({ type: "line", length: 500, width: 20 })).toBe(500);
  });
});

describe("segment helpers", () => {
  it("finds the first contact time of a moving point and a circle", () => {
    expect(sweepCircle({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 60, y: 0 }, 10)).toBeCloseTo(0.5);
    expect(sweepCircle({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 60, y: 30 }, 10)).toBeNull();
    expect(sweepCircle({ x: 55, y: 0 }, { x: 100, y: 0 }, { x: 60, y: 0 }, 10)).toBe(0);
  });

  it("measures distance to a segment", () => {
    expect(distanceToSegment({ x: 50, y: 10 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toBe(10);
    expect(distanceToSegment({ x: -30, y: 40 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toBe(50);
  });

  it("finds where a segment enters a rectangle", () => {
    const rect = { x: 50, y: -10, width: 20, height: 20 };
    expect(segmentRectEntry({ x: 0, y: 0 }, { x: 100, y: 0 }, rect)).toBeCloseTo(0.5);
    expect(segmentRectEntry({ x: 0, y: 0 }, { x: 100, y: 0 }, rect, 5)).toBeCloseTo(0.45);
    expect(segmentRectEntry({ x: 0, y: 20 }, { x: 100, y: 20 }, rect)).toBeNull();
    expect(segmentRectEntry({ x: 0, y: 0 }, { x: 40, y: 0 }, rect)).toBeNull();
  });

  it("stops at walls or the map edge, whichever comes first", () => {
    const map: GameMap = {
      width: 200,
      height: 100,
      walls: [{ x: 120, y: 0, width: 10, height: 100 }],
      bushes: [],
      spawns: [ORIGIN, ORIGIN],
    };
    expect(segmentObstacleEntry({ x: 100, y: 50 }, { x: 140, y: 50 }, map)).toBeCloseTo(0.5);
    expect(segmentObstacleEntry({ x: 100, y: 50 }, { x: 100, y: 150 }, map)).toBeCloseTo(0.5);
    expect(segmentObstacleEntry({ x: 10, y: 50 }, { x: 50, y: 50 }, map)).toBeNull();
  });
});
