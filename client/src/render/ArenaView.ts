import {
  BoxGeometry,
  BufferGeometry,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { GameMap, Rect } from "@moba/shared";

const GRID_SIZE = 50;
const WALL_HEIGHT = 70;
const BORDER_HEIGHT = 18;
const BORDER_THICKNESS = 12;
const NEON_BLUE = 0x6f86ff;
const SHADOW_SHIFT_PER_HEIGHT = { x: 0.42, z: -0.33 };

interface Block {
  rect: Rect;
  height: number;
}

export function createArenaView(map: GameMap): Group {
  const blocks: Block[] = [
    ...map.walls.map((rect) => ({ rect, height: WALL_HEIGHT })),
    ...borderRects(map).map((rect) => ({ rect, height: BORDER_HEIGHT })),
  ];

  const arena = new Group();
  arena.add(createFloor(map), createGrid(map), createFakeShadows(blocks), ...createBlocks(blocks));
  return arena;
}

function createFloor(map: GameMap): Mesh {
  const floor = new Mesh(
    new PlaneGeometry(map.width, map.height).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({ color: 0x111a2e }),
  );
  floor.position.set(map.width / 2, 0, map.height / 2);
  return floor;
}

function createGrid(map: GameMap): LineSegments {
  const vertices: number[] = [];
  for (let x = GRID_SIZE; x < map.width; x += GRID_SIZE) vertices.push(x, 0.5, 0, x, 0.5, map.height);
  for (let z = GRID_SIZE; z < map.height; z += GRID_SIZE) vertices.push(0, 0.5, z, map.width, 0.5, z);

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  return new LineSegments(geometry, new LineBasicMaterial({ color: 0x1f2c4c }));
}

function createBlocks(blocks: Block[]): [Mesh, LineSegments] {
  const boxes = blocks.map(({ rect, height }) =>
    new BoxGeometry(rect.width, height, rect.height).translate(
      rect.x + rect.width / 2,
      height / 2,
      rect.y + rect.height / 2,
    ),
  );
  const edges = boxes.map((box) => new EdgesGeometry(box));

  const solid = new Mesh(
    mergeGeometries(boxes),
    new MeshLambertMaterial({ color: 0x34437a, emissive: 0x111a3a }),
  );
  const outline = new LineSegments(mergeGeometries(edges), new LineBasicMaterial({ color: NEON_BLUE }));

  for (const geometry of [...boxes, ...edges]) geometry.dispose();
  return [solid, outline];
}

function createFakeShadows(blocks: Block[]): Mesh {
  const planes = blocks.map(({ rect, height }) =>
    new PlaneGeometry(rect.width, rect.height)
      .rotateX(-Math.PI / 2)
      .translate(
        rect.x + rect.width / 2 + height * SHADOW_SHIFT_PER_HEIGHT.x,
        0.3,
        rect.y + rect.height / 2 + height * SHADOW_SHIFT_PER_HEIGHT.z,
      ),
  );
  const shadows = new Mesh(
    mergeGeometries(planes),
    new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  for (const plane of planes) plane.dispose();
  return shadows;
}

function borderRects(map: GameMap): Rect[] {
  const t = BORDER_THICKNESS;
  return [
    { x: -t, y: -t, width: map.width + 2 * t, height: t },
    { x: -t, y: map.height, width: map.width + 2 * t, height: t },
    { x: -t, y: 0, width: t, height: map.height },
    { x: map.width, y: 0, width: t, height: map.height },
  ];
}
