import {
  BoxGeometry,
  type BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  OctahedronGeometry,
  Shape,
  SphereGeometry,
  TorusGeometry,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { HeroShape } from "@moba/shared";

const STAR_POINTS = 5;
const STAR_INNER_RATIO = 0.45;

export function createBodyGeometry(shape: HeroShape, radius: number, height: number): BufferGeometry {
  switch (shape) {
    case "triangle":
      return new CylinderGeometry(radius * 1.1, radius * 1.1, height, 3).rotateY(Math.PI / 2);
    case "hexagon":
      return new CylinderGeometry(radius, radius, height, 6).rotateY(Math.PI / 2);
    case "square":
      return new BoxGeometry(radius * 1.6, height, radius * 1.6);
    case "circle":
      return new SphereGeometry(radius * 0.95, 20, 14);
    case "pentagon":
      return new CylinderGeometry(radius * 1.05, radius * 1.05, height, 5).rotateY(Math.PI / 2);
    case "diamond":
      return new OctahedronGeometry(radius).scale(0.95, (height * 0.75) / radius, 0.95);
    case "spike":
      return new ConeGeometry(radius, height * 1.5, 6).rotateY(Math.PI / 2);
    case "ring":
      return new TorusGeometry(radius * 0.68, radius * 0.3, 6, 14).rotateX(Math.PI / 2);
    case "cross":
      return createCross(radius, height);
    case "star":
      return createStar(radius, height);
  }
}

function createCross(radius: number, height: number): BufferGeometry {
  const arm = radius * 0.5;
  const span = radius * 2.4;
  const thickness = height * 0.7;
  return mergeGeometries([
    new BoxGeometry(span, thickness, arm).toNonIndexed(),
    new BoxGeometry(arm, thickness, span).toNonIndexed(),
  ]);
}

function createStar(radius: number, height: number): BufferGeometry {
  const outline = new Shape();
  for (let i = 0; i < STAR_POINTS * 2; i++) {
    const angle = (i / (STAR_POINTS * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? radius * 1.15 : radius * 1.15 * STAR_INNER_RATIO;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (i === 0) outline.moveTo(x, y);
    else outline.lineTo(x, y);
  }
  outline.closePath();
  return new ExtrudeGeometry(outline, { depth: height, bevelEnabled: false })
    .translate(0, 0, -height / 2)
    .rotateX(-Math.PI / 2);
}
