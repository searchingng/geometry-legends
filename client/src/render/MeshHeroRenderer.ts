import {
  AdditiveBlending,
  type Blending,
  BoxGeometry,
  type BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  NormalBlending,
  PlaneGeometry,
  RingGeometry,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
} from "three";
import type { HeroDefinition, HeroShape, Vec2 } from "@moba/shared";
import type { HeroRenderer, HeroView } from "./HeroRenderer.js";
import { radialGradientTexture } from "./textures.js";

const ALLY_COLOR = 0x5dffa0;
const ENEMY_COLOR = 0xff5a5a;
const HOVER_HEIGHT = 6;
const BOB_AMPLITUDE = 2.5;
const BOB_SPEED = 0.004;
const TURN_HALF_LIFE_MS = 45;
const MOVE_BLEND_HALF_LIFE_MS = 90;
const MOVING_SPEED_THRESHOLD = 20;
const MIN_FACING_STEP = 0.3;
const LEAN_ANGLE = 0.14;

export class MeshHeroRenderer implements HeroRenderer {
  create(hero: HeroDefinition, isLocal: boolean): HeroView {
    return new MeshHeroView(hero, isLocal);
  }
}

class MeshHeroView implements HeroView {
  readonly root = new Group();
  private readonly pivot = new Group();
  private readonly body = new Group();
  private readonly arrow: Mesh<ShapeGeometry, MeshBasicMaterial>;
  private readonly radius: number;
  private readonly bodyHeight: number;
  private lastPosition: Vec2 | undefined;
  private facing = 0;
  private moveBlend = 0;
  private elapsedMs = Math.random() * 1000;

  constructor(hero: HeroDefinition, isLocal: boolean) {
    const { color, shape } = hero.visual;
    this.radius = hero.radius;
    this.bodyHeight = hero.radius * 1.3;
    const teamColor = isLocal ? ALLY_COLOR : ENEMY_COLOR;

    const geometry = createBodyGeometry(shape, this.radius, this.bodyHeight);
    const mesh = new Mesh(
      geometry,
      new MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.4, flatShading: true }),
    );
    const edges = new LineSegments(
      new EdgesGeometry(geometry),
      new LineBasicMaterial({ color: new Color(color).lerp(new Color(0xffffff), 0.6) }),
    );
    this.body.add(mesh, edges, createHalo(this.radius, color));

    this.arrow = new Mesh(
      createChevronGeometry(),
      new MeshBasicMaterial({ color: teamColor, transparent: true, depthWrite: false, side: DoubleSide }),
    );
    this.arrow.position.y = 1.5;

    this.pivot.add(this.body, this.arrow);
    this.root.add(
      createGroundDecal(this.radius * 2.6, 0x000000, 0.55, NormalBlending, 0.3),
      createGroundDecal(this.radius * 5, color, 0.3, AdditiveBlending, 0.4),
      createTeamRing(this.radius, teamColor),
      this.pivot,
    );
  }

  update(position: Vec2, frameMs: number) {
    this.elapsedMs += frameMs;
    this.updateFacing(position, frameMs);

    this.root.position.set(position.x, 0, position.y);
    this.pivot.rotation.y = -this.facing;

    const bob = Math.sin(this.elapsedMs * BOB_SPEED) * BOB_AMPLITUDE * (1 - this.moveBlend * 0.6);
    this.body.position.y = this.bodyHeight / 2 + HOVER_HEIGHT + bob;
    this.body.rotation.z = -LEAN_ANGLE * this.moveBlend;

    this.arrow.position.x = this.radius + 14 + this.moveBlend * 8;
    this.arrow.material.opacity = 0.3 + 0.7 * this.moveBlend;
  }

  private updateFacing(position: Vec2, frameMs: number) {
    let speed = 0;
    if (this.lastPosition && frameMs > 0) {
      const dx = position.x - this.lastPosition.x;
      const dy = position.y - this.lastPosition.y;
      const step = Math.hypot(dx, dy);
      speed = (step / frameMs) * 1000;

      if (step > MIN_FACING_STEP) {
        const target = Math.atan2(dy, dx);
        const delta = Math.atan2(Math.sin(target - this.facing), Math.cos(target - this.facing));
        this.facing += delta * smoothing(frameMs, TURN_HALF_LIFE_MS);
      }
    }
    this.lastPosition = { ...position };

    const targetBlend = speed > MOVING_SPEED_THRESHOLD ? 1 : 0;
    this.moveBlend += (targetBlend - this.moveBlend) * smoothing(frameMs, MOVE_BLEND_HALF_LIFE_MS);
  }

  destroy() {
    this.root.removeFromParent();
    this.root.traverse((object) => {
      if (object instanceof Sprite) object.material.dispose();
      if (!(object instanceof Mesh || object instanceof LineSegments)) return;
      (object.geometry as BufferGeometry).dispose();
      (object.material as Material).dispose();
    });
  }
}

function smoothing(frameMs: number, halfLifeMs: number): number {
  return 1 - Math.pow(0.5, frameMs / halfLifeMs);
}

function createBodyGeometry(shape: HeroShape, radius: number, height: number): BufferGeometry {
  switch (shape) {
    case "triangle":
      return new CylinderGeometry(radius * 1.1, radius * 1.1, height, 3).rotateY(Math.PI / 2);
    case "hexagon":
      return new CylinderGeometry(radius, radius, height, 6).rotateY(Math.PI / 2);
    case "square":
      return new BoxGeometry(radius * 1.6, height, radius * 1.6);
    case "circle":
      return new SphereGeometry(radius * 0.95, 20, 14);
  }
}

function createChevronGeometry(): ShapeGeometry {
  const chevron = new Shape()
    .moveTo(0, -11)
    .lineTo(15, 0)
    .lineTo(0, 11)
    .lineTo(5, 0)
    .closePath();
  return new ShapeGeometry(chevron).rotateX(-Math.PI / 2);
}

function createHalo(radius: number, color: number): Sprite {
  const halo = new Sprite(
    new SpriteMaterial({
      map: radialGradientTexture(),
      color,
      blending: AdditiveBlending,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    }),
  );
  halo.scale.setScalar(radius * 3.6);
  return halo;
}

function createGroundDecal(
  size: number,
  color: number,
  opacity: number,
  blending: Blending,
  height: number,
): Mesh {
  const decal = new Mesh(
    new PlaneGeometry(size, size).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({
      map: radialGradientTexture(),
      color,
      opacity,
      blending,
      transparent: true,
      depthWrite: false,
    }),
  );
  decal.position.y = height;
  return decal;
}

function createTeamRing(radius: number, color: number): Mesh {
  const ring = new Mesh(
    new RingGeometry(radius + 5, radius + 9, 48).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }),
  );
  ring.position.y = 1;
  return ring;
}
