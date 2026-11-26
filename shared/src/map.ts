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
  bushes?: Rect[];
  spawns: [Vec2, Vec2];
}

const WIDTH = 1600;
const HEIGHT = 900;

function withMirror(rects: Rect[]): Rect[] {
  return rects.flatMap((rect) => [
    rect,
    { x: WIDTH - rect.x - rect.width, y: HEIGHT - rect.y - rect.height, width: rect.width, height: rect.height },
  ]);
}

export const ARENA: GameMap = {
  width: WIDTH,
  height: HEIGHT,
  walls: [
    { x: 760, y: 360, width: 80, height: 180 },
    ...withMirror([
      { x: 420, y: 160, width: 160, height: 40 },
      { x: 420, y: 700, width: 40, height: 120 },
      { x: 600, y: 580, width: 60, height: 60 },
    ]),
  ],
  bushes: withMirror([
    { x: 410, y: 200, width: 180, height: 80 },
    { x: 290, y: 690, width: 130, height: 130 },
    { x: 650, y: 220, width: 150, height: 90 },
    { x: 560, y: 400, width: 90, height: 120 },
  ]),
  spawns: [
    { x: 160, y: 450 },
    { x: 1440, y: 450 },
  ],
};

export function pointInRect(point: Vec2, rect: Rect): boolean {
  return (
    point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height
  );
}

export function bushIndexAt(map: GameMap, point: Vec2): number {
  return (map.bushes ?? []).findIndex((bush) => pointInRect(point, bush));
}
