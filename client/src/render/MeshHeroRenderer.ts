import {
  AdditiveBlending,
  type Blending,
  type BufferGeometry,
  Color,
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
  Sprite,
  SpriteMaterial,
} from "three";
import type { HeroDefinition, Vec2 } from "@moba/shared";
import type { HeroRenderer, HeroView } from "./HeroRenderer.js";
import { createBodyGeometry } from "./HeroShapes.js";
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
const HP_BAR_WIDTH = 56;
const HP_BAR_HEIGHT = 7;
const HP_BAR_BORDER = 3;
const HP_BAR_GAP = 26;
const BASE_EMISSIVE = 0.4;
const FLASH_EMISSIVE = 2.2;
const FLASH_MS = 140;
const CONCEALED_OPACITY = 0.45;

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
  private readonly bodyMaterial: MeshLambertMaterial;
  private readonly edgeMaterial: LineBasicMaterial;
  private readonly hpFill: Sprite;
  private concealed = false;
  private healthFraction = 1;
  private flashRemainingMs = 0;
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
    this.bodyMaterial = new MeshLambertMaterial({
      color,
      emissive: color,
      emissiveIntensity: BASE_EMISSIVE,
      flatShading: true,
    });
    const mesh = new Mesh(geometry, this.bodyMaterial);
    this.edgeMaterial = new LineBasicMaterial({ color: new Color(color).lerp(new Color(0xffffff), 0.6) });
    const edges = new LineSegments(new EdgesGeometry(geometry), this.edgeMaterial);
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

    const barY = this.bodyHeight + HOVER_HEIGHT + HP_BAR_GAP;
    const hpBackground = createBarSprite(0x05070d, 0.85);
    hpBackground.scale.set(HP_BAR_WIDTH + HP_BAR_BORDER, HP_BAR_HEIGHT + HP_BAR_BORDER, 1);
    hpBackground.position.y = barY;
    this.hpFill = createBarSprite(teamColor, 1);
    this.hpFill.center.set(0, 0.5);
    this.hpFill.scale.set(HP_BAR_WIDTH, HP_BAR_HEIGHT, 1);
    this.hpFill.position.set(-HP_BAR_WIDTH / 2, barY, 0);
    this.hpFill.renderOrder = hpBackground.renderOrder + 1;
    this.root.add(hpBackground, this.hpFill);
  }

  setHealth(fraction: number) {
    if (fraction === this.healthFraction) return;
    this.healthFraction = fraction;
    this.hpFill.scale.x = Math.max(HP_BAR_WIDTH * fraction, 0.001);
  }

  flash() {
    this.flashRemainingMs = FLASH_MS;
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

    if (this.flashRemainingMs > 0) {
      this.flashRemainingMs = Math.max(0, this.flashRemainingMs - frameMs);
      const t = this.flashRemainingMs / FLASH_MS;
      this.bodyMaterial.emissiveIntensity = BASE_EMISSIVE + (FLASH_EMISSIVE - BASE_EMISSIVE) * t;
    }
  }

  setConcealed(concealed: boolean) {
    if (concealed === this.concealed) return;
    this.concealed = concealed;
    for (const material of [this.bodyMaterial, this.edgeMaterial]) {
      material.transparent = concealed;
      material.opacity = concealed ? CONCEALED_OPACITY : 1;
      material.needsUpdate = true;
    }
  }

  setVisible(visible: boolean) {
    if (visible && !this.root.visible) this.lastPosition = undefined;
    this.root.visible = visible;
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

function createBarSprite(color: number, opacity: number): Sprite {
  const sprite = new Sprite(
    new SpriteMaterial({
      color,
      opacity,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      fog: false,
    }),
  );
  sprite.renderOrder = 10;
  return sprite;
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
