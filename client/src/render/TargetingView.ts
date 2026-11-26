import { DoubleSide, Group, Mesh, MeshBasicMaterial, RingGeometry, Shape, ShapeGeometry } from "three";
import type { Vec2 } from "@moba/shared";

const RANGE_COLOR = 0xffffff;
const RANGE_LINE_WIDTH = 2.5;
const RANGE_SEGMENTS = 96;
const RANGE_IDLE_OPACITY = 0.14;
const RANGE_AIM_OPACITY = 0.24;
const RANGE_ATTACK_OPACITY = 0.45;
const RANGE_HEIGHT = 0.6;
const TARGET_COLOR = 0xffb020;
const RETICLE_GAP = 14;
const RETICLE_WIDTH = 4;
const RETICLE_HEIGHT = 1.8;
const RETICLE_ARCS = 4;
const RETICLE_ARC_FILL = 0.62;
const RETICLE_SPIN_PER_MS = 0.0015;
const ARROW_SIZE = 20;
const ARROW_GAP_ABOVE_BAR = 22;
const HP_BAR_CLEARANCE = 32;
const BODY_HEIGHT_RATIO = 1.3;
const ARROW_BOB_AMPLITUDE = 4;
const ARROW_BOB_PER_MS = 0.008;
const PULSE_PER_MS = 0.006;

export interface TargetMarker {
  position: Vec2;
  radius: number;
}

export class TargetingView {
  readonly root = new Group();
  private readonly rangeMaterial = new MeshBasicMaterial({
    color: RANGE_COLOR,
    transparent: true,
    opacity: RANGE_IDLE_OPACITY,
    depthWrite: false,
  });
  private readonly rangeRing = new Mesh(new RingGeometry(0, 1, 3), this.rangeMaterial);
  private readonly marker = new Group();
  private readonly reticle = new Group();
  private readonly markerMaterial = new MeshBasicMaterial({
    color: TARGET_COLOR,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
  private reticleGeometry = new RingGeometry(0, 1, 3);
  private readonly arrow: Mesh<ShapeGeometry, MeshBasicMaterial>;
  private rangeReach = 0;
  private reticleRadius = 0;
  private elapsedMs = 0;

  constructor() {
    this.rangeRing.position.y = RANGE_HEIGHT;
    this.rangeRing.renderOrder = 1;

    this.reticle.position.y = RETICLE_HEIGHT;
    for (let i = 0; i < RETICLE_ARCS; i++) {
      const arc = new Mesh(this.reticleGeometry, this.markerMaterial);
      arc.rotation.y = (i * Math.PI * 2) / RETICLE_ARCS;
      arc.renderOrder = 2;
      this.reticle.add(arc);
    }
    this.arrow = new Mesh(createArrowGeometry(), this.markerMaterial);
    this.arrow.renderOrder = 11;

    this.marker.add(this.reticle, this.arrow);
    this.marker.visible = false;
    this.rangeRing.visible = false;
    this.root.add(this.rangeRing, this.marker);
  }

  showRange(center: Vec2, reach: number, attacking: boolean, aimInside: boolean) {
    if (reach !== this.rangeReach) {
      this.rangeReach = reach;
      this.rangeRing.geometry.dispose();
      this.rangeRing.geometry = new RingGeometry(reach - RANGE_LINE_WIDTH, reach, RANGE_SEGMENTS).rotateX(
        -Math.PI / 2,
      );
    }
    this.rangeRing.position.x = center.x;
    this.rangeRing.position.z = center.y;
    this.rangeMaterial.opacity = attacking
      ? RANGE_ATTACK_OPACITY
      : aimInside
        ? RANGE_AIM_OPACITY
        : RANGE_IDLE_OPACITY;
    this.rangeRing.visible = true;
  }

  showTarget(target: TargetMarker | undefined, frameMs: number) {
    if (!target) {
      this.marker.visible = false;
      return;
    }
    this.elapsedMs += frameMs;
    if (target.radius !== this.reticleRadius) this.rebuildReticle(target.radius);

    const pulse = 0.5 + 0.5 * Math.sin(this.elapsedMs * PULSE_PER_MS);
    this.marker.position.set(target.position.x, 0, target.position.y);
    this.reticle.rotation.y = this.elapsedMs * RETICLE_SPIN_PER_MS;
    this.markerMaterial.opacity = 0.65 + 0.35 * pulse;
    this.arrow.position.y =
      target.radius * BODY_HEIGHT_RATIO +
      HP_BAR_CLEARANCE +
      ARROW_GAP_ABOVE_BAR +
      ARROW_BOB_AMPLITUDE * Math.sin(this.elapsedMs * ARROW_BOB_PER_MS);
    this.marker.visible = true;
  }

  hide() {
    this.rangeRing.visible = false;
    this.marker.visible = false;
  }

  private rebuildReticle(radius: number) {
    this.reticleRadius = radius;
    this.reticleGeometry.dispose();
    const inner = radius + RETICLE_GAP;
    const arcLength = ((Math.PI * 2) / RETICLE_ARCS) * RETICLE_ARC_FILL;
    this.reticleGeometry = new RingGeometry(inner, inner + RETICLE_WIDTH, 12, 1, 0, arcLength).rotateX(-Math.PI / 2);
    for (const arc of this.reticle.children) (arc as Mesh).geometry = this.reticleGeometry;
  }
}

function createArrowGeometry(): ShapeGeometry {
  const half = ARROW_SIZE / 2;
  const shape = new Shape();
  shape.moveTo(-half, ARROW_SIZE);
  shape.lineTo(half, ARROW_SIZE);
  shape.lineTo(0, 0);
  shape.closePath();
  return new ShapeGeometry(shape);
}
