import type { Vec2 } from "./math.js";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GameMap {
  width: number;
  height: number;
  walls: Rect[];
  spawns: [Vec2, Vec2];
}

export const ARENA: GameMap = {
  width: 1600,
  height: 900,
  walls: [
    { x: 760, y: 360, width: 80, height: 180 },
    { x: 420, y: 160, width: 160, height: 40 },
    { x: 1020, y: 700, width: 160, height: 40 },
    { x: 420, y: 700, width: 40, height: 120 },
    { x: 1140, y: 80, width: 40, height: 120 },
  ],
  spawns: [
    { x: 160, y: 450 },
    { x: 1440, y: 450 },
  ],
};
