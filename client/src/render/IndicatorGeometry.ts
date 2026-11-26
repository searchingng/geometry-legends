import { BufferGeometry, Path, RingGeometry, Shape, ShapeGeometry } from "three";
import type { SkillShape } from "@moba/shared";

const ARC_SEGMENTS = 64;
const FLAT_ON_GROUND = Math.PI / 2;

export interface ShapeGeometries {
  fill: BufferGeometry;
  outlines: BufferGeometry[];
}

export function shapeGeometries(shape: SkillShape, stroke: number): ShapeGeometries {
  switch (shape.type) {
    case "line":
      return {
        fill: flat(new ShapeGeometry(rectangle(0, shape.length, shape.width / 2))),
        outlines: [flat(new ShapeGeometry(withHole(rectangle(0, shape.length, shape.width / 2), insetRectangle(shape, stroke))))],
      };
    case "cone":
      return {
        fill: flat(new ShapeGeometry(sector(shape.radius, shape.angleDeg), ARC_SEGMENTS)),
        outlines: [flat(new ShapeGeometry(withHole(sector(shape.radius, shape.angleDeg), insetSector(shape, stroke)), ARC_SEGMENTS))],
      };
    case "circle":
      return { fill: disc(0, shape.radius), outlines: [disc(shape.radius - stroke, shape.radius)] };
    case "ring":
      return {
        fill: disc(shape.innerRadius, shape.outerRadius),
        outlines: [
          disc(shape.outerRadius - stroke, shape.outerRadius),
          disc(shape.innerRadius, shape.innerRadius + stroke),
        ],
      };
  }
}

export function disc(inner: number, outer: number): BufferGeometry {
  return flat(new RingGeometry(Math.max(inner, 0), outer, ARC_SEGMENTS));
}

export function bar(length: number, halfWidth: number): BufferGeometry {
  return flat(new ShapeGeometry(rectangle(0, length, halfWidth)));
}

export function chevron(size: number, thickness: number): BufferGeometry {
  const shape = new Shape();
  shape.moveTo(0, 0);
  shape.lineTo(-size, size);
  shape.lineTo(-size - thickness, size);
  shape.lineTo(-thickness, 0);
  shape.lineTo(-size - thickness, -size);
  shape.lineTo(-size, -size);
  shape.closePath();
  return flat(new ShapeGeometry(shape));
}

function flat(geometry: BufferGeometry): BufferGeometry {
  return geometry.rotateX(FLAT_ON_GROUND);
}

function rectangle(start: number, end: number, halfWidth: number): Shape {
  const shape = new Shape();
  shape.moveTo(start, -halfWidth);
  shape.lineTo(end, -halfWidth);
  shape.lineTo(end, halfWidth);
  shape.lineTo(start, halfWidth);
  shape.closePath();
  return shape;
}

function insetRectangle(shape: { length: number; width: number }, stroke: number): Path {
  const half = Math.max(shape.width / 2 - stroke, 0.5);
  const path = new Path();
  path.moveTo(stroke, -half);
  path.lineTo(stroke, half);
  path.lineTo(shape.length - stroke, half);
  path.lineTo(shape.length - stroke, -half);
  path.closePath();
  return path;
}

function sector(radius: number, angleDeg: number): Shape {
  const half = (angleDeg * Math.PI) / 360;
  const shape = new Shape();
  shape.moveTo(0, 0);
  shape.lineTo(Math.cos(half) * radius, -Math.sin(half) * radius);
  shape.absarc(0, 0, radius, -half, half, false);
  shape.closePath();
  return shape;
}

function insetSector(shape: { radius: number; angleDeg: number }, stroke: number): Path {
  const half = (shape.angleDeg * Math.PI) / 360;
  const apex = stroke / Math.sin(half);
  const radius = shape.radius - stroke;
  const path = new Path();
  path.moveTo(apex, 0);
  path.lineTo(Math.cos(half) * radius, Math.sin(half) * radius);
  path.absarc(0, 0, radius, half, -half, true);
  path.closePath();
  return path;
}

function withHole(shape: Shape, hole: Path): Shape {
  shape.holes.push(hole);
  return shape;
}
