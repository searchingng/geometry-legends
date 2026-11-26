import { beforeEach, describe, expect, it } from "vitest";
import type { GameMap } from "@moba/shared";
import { VisionSystem, type Target, type Viewer } from "../src/VisionSystem.js";

const RANGE = 100;
const OPEN_MAP: GameMap = {
  width: 2000,
  height: 2000,
  walls: [],
  spawns: [
    { x: 0, y: 0 },
    { x: 2000, y: 2000 },
  ],
};
const COVER_MAP: GameMap = {
  ...OPEN_MAP,
  walls: [{ x: 40, y: -50, width: 20, height: 100 }],
  bushes: [
    { x: -30, y: 70, width: 60, height: 60 },
    { x: 70, y: 70, width: 60, height: 60 },
  ],
};

function viewer(id: string, x: number, y: number): Viewer {
  return { id, position: { x, y }, visionRange: RANGE };
}

function target(id: string, x: number, y: number): Target {
  return { id, position: { x, y } };
}

describe("VisionSystem", () => {
  let vision: VisionSystem;
  const alice = viewer("alice", 0, 0);
  const farBob = target("bob", 500, 0);

  beforeEach(() => {
    vision = new VisionSystem(OPEN_MAP);
  });

  it("always lets a player see themselves", () => {
    const blind = { ...alice, visionRange: 0 };
    expect(vision.canSee(blind, target("alice", 999, 999))).toBe(true);
  });

  it("sees targets within range including the boundary", () => {
    expect(vision.canSee(alice, target("bob", 60, 80))).toBe(true);
    expect(vision.canSee(alice, target("bob", RANGE, 0))).toBe(true);
  });

  it("does not see targets beyond range without a reveal", () => {
    expect(vision.canSee(alice, target("bob", RANGE + 0.01, 0))).toBe(false);
    expect(vision.canSee(alice, farBob)).toBe(false);
  });

  it("keeps a timed reveal until its expiry tick is pruned", () => {
    vision.reveal("bob", "alice", 10, 5);
    expect(vision.canSee(alice, farBob)).toBe(true);

    vision.prune(14);
    expect(vision.canSee(alice, farBob)).toBe(true);

    vision.prune(15);
    expect(vision.canSee(alice, farBob)).toBe(false);
  });

  it("keeps a persistent reveal through pruning", () => {
    vision.reveal("bob", "alice", 0);
    vision.prune(1_000_000);
    expect(vision.canSee(alice, farBob)).toBe(true);
  });

  it("applies reveals in one direction only", () => {
    vision.reveal("bob", "alice", 0);
    expect(vision.canSee(viewer("bob", 500, 0), target("alice", 0, 0))).toBe(false);
  });

  it("applies reveals only to the revealed target", () => {
    vision.reveal("bob", "alice", 0);
    expect(vision.canSee(alice, target("carol", 500, 0))).toBe(false);
  });

  it("keeps the longer of overlapping reveals when pruning", () => {
    vision.reveal("bob", "alice", 0, 5);
    vision.reveal("bob", "alice", 0, 20);
    vision.prune(10);
    expect(vision.canSee(alice, farBob)).toBe(true);
    vision.prune(20);
    expect(vision.canSee(alice, farBob)).toBe(false);
  });

  it("clearRevealsInvolving removes reveals where the player is target or viewer", () => {
    const carol = viewer("carol", 0, 0);
    vision.reveal("bob", "alice", 0);
    vision.reveal("alice", "bob", 0);
    vision.reveal("bob", "carol", 0);
    vision.reveal("dave", "carol", 0);

    vision.clearRevealsInvolving("bob");

    expect(vision.canSee(alice, farBob)).toBe(false);
    expect(vision.canSee(viewer("bob", 500, 0), target("alice", 0, 0))).toBe(false);
    expect(vision.canSee(carol, farBob)).toBe(false);
    expect(vision.canSee(carol, target("dave", 500, 0))).toBe(true);
  });

  describe("with walls and bushes", () => {
    let cover: VisionSystem;

    beforeEach(() => {
      cover = new VisionSystem(COVER_MAP);
    });

    it("does not see through walls even within range", () => {
      expect(cover.canSee(alice, target("bob", 90, 0))).toBe(false);
      expect(cover.canSee(alice, target("bob", 0, 60))).toBe(true);
    });

    it("does not see a hero standing in a bush from outside it", () => {
      expect(cover.canSee(alice, target("bob", 0, 90))).toBe(false);
    });

    it("sees a hero in the same bush", () => {
      expect(cover.canSee(viewer("alice", -10, 80), target("bob", 10, 100))).toBe(true);
    });

    it("does not see a hero in a different bush", () => {
      expect(cover.canSee(viewer("alice", 0, 100), target("bob", 80, 100))).toBe(false);
    });

    it("sees out of a bush", () => {
      expect(cover.canSee(viewer("alice", 0, 100), target("bob", 0, 30))).toBe(true);
    });

    it("lets reveals override walls and bushes", () => {
      cover.reveal("bob", "alice", 0, 30);
      expect(cover.canSee(alice, target("bob", 90, 0))).toBe(true);
      expect(cover.canSee(alice, target("bob", 0, 90))).toBe(true);
    });

    it("always sees self inside a bush or behind a wall", () => {
      expect(cover.canSee(viewer("bob", 0, 90), target("bob", 0, 90))).toBe(true);
    });

    it("uses ARENA walls by default", () => {
      const arena = new VisionSystem();
      expect(arena.canSee({ ...viewer("alice", 700, 450), visionRange: 400 }, target("bob", 900, 450))).toBe(false);
      expect(arena.canSee({ ...viewer("alice", 700, 330), visionRange: 400 }, target("bob", 900, 330))).toBe(true);
    });
  });
});
