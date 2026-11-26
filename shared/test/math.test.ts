import { describe, expect, it } from "vitest";
import { clamp, lerp, normalize } from "../src/math.js";

describe("clamp", () => {
  it("returns the value when inside the range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("clamps to the bounds", () => {
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(42, 0, 10)).toBe(10);
  });

  it("keeps exact bounds", () => {
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });
});

describe("lerp", () => {
  it("returns endpoints at t=0 and t=1", () => {
    expect(lerp(2, 8, 0)).toBe(2);
    expect(lerp(2, 8, 1)).toBe(8);
  });

  it("interpolates and extrapolates linearly", () => {
    expect(lerp(2, 8, 0.5)).toBe(5);
    expect(lerp(2, 8, 2)).toBe(14);
    expect(lerp(10, 0, 0.25)).toBe(7.5);
  });
});

describe("normalize", () => {
  it("returns the zero vector for zero input", () => {
    expect(normalize(0, 0)).toEqual({ x: 0, y: 0 });
  });

  it("returns a unit vector with the same direction", () => {
    expect(normalize(3, 4)).toEqual({ x: 0.6, y: 0.8 });
    expect(normalize(-5, 0)).toEqual({ x: -1, y: 0 });
  });

  it("produces unit length for diagonals", () => {
    const v = normalize(1, -1);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 12);
    expect(v.x).toBeCloseTo(Math.SQRT1_2, 12);
    expect(v.y).toBeCloseTo(-Math.SQRT1_2, 12);
  });
});
