import {
  BoxGeometry,
  type BufferGeometry,
  CylinderGeometry,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  OctahedronGeometry,
  RingGeometry,
  Sprite,
  SpriteMaterial,
} from "three";
import { UNIT_STATS, type Team, type UnitKind, type Vec2, type VisibleUnit } from "@moba/shared";

const ALLY_COLOR = 0x5dffa0;
const ENEMY_COLOR = 0xff5a5a;
const BAR_BACKGROUND = 0x05070d;
const BAR_BORDER = 3;
const FLASH_MS = 120;
const BASE_EMISSIVE = 0.35;
const FLASH_EMISSIVE = 1.8;
const RANGE_RING_WIDTH = 3;
const RANGE_RING_SEGMENTS = 64;
const RANGE_RING_IDLE_OPACITY = 0.1;
const RANGE_RING_ALERT_OPACITY = 0.45;
const RANGE_ALERT_HOLD_MS = 1500;
const RANGE_ALERT_FADE_MS = 500;
const RANGE_RING_HEIGHT = 0.8;

interface KindStyle {
  geometry: BufferGeometry;
  edges: EdgesGeometry;
  height: number;
  barWidth: number;
  barHeight: number;
  rangeRing?: BufferGeometry;
}

function style(geometry: BufferGeometry, height: number, barWidth: number, barHeight: number): KindStyle {
  return { geometry, edges: new EdgesGeometry(geometry), height, barWidth, barHeight };
}

function createStyles(): Record<UnitKind, KindStyle> {
  const base = UNIT_STATS.base.radius;
  const turret = UNIT_STATS.turret.radius;
  const small = UNIT_STATS.creepSmall.radius;
  const big = UNIT_STATS.creepBig.radius;
  return {
    base: {
      ...style(new CylinderGeometry(base * 0.8, base, 90, 6).translate(0, 45, 0), 90, 90, 9),
      rangeRing: rangeRingGeometry("base"),
    },
    turret: {
      ...style(new CylinderGeometry(turret * 0.55, turret, 110, 8).translate(0, 55, 0), 110, 64, 7),
      rangeRing: rangeRingGeometry("turret"),
    },
    creepSmall: style(new OctahedronGeometry(small).translate(0, small + 2, 0), small * 2 + 2, 26, 4),
    creepBig: style(new BoxGeometry(big * 1.5, big * 1.5, big * 1.5).translate(0, big * 0.75 + 2, 0), big * 1.5 + 2, 36, 5),
  };
}

function rangeRingGeometry(kind: UnitKind): BufferGeometry {
  const reach = UNIT_STATS[kind].attackRange + UNIT_STATS[kind].radius;
  return new RingGeometry(reach - RANGE_RING_WIDTH, reach, RANGE_RING_SEGMENTS)
    .rotateX(-Math.PI / 2)
    .translate(0, RANGE_RING_HEIGHT, 0);
}

function rangeRingMaterial(color: number): MeshBasicMaterial {
  return new MeshBasicMaterial({ color, transparent: true, opacity: RANGE_RING_IDLE_OPACITY, depthWrite: false });
}

export class UnitViews {
  readonly root = new Group();
  private readonly styles = createStyles();
  private readonly views = new Map<string, UnitView>();
  private readonly barBackground = new SpriteMaterial({ color: BAR_BACKGROUND, transparent: true, opacity: 0.85, depthTest: false });
  private readonly barFills: Record<"ally" | "enemy", SpriteMaterial> = {
    ally: new SpriteMaterial({ color: ALLY_COLOR, depthTest: false }),
    enemy: new SpriteMaterial({ color: ENEMY_COLOR, depthTest: false }),
  };
  private readonly edgeMaterials: Record<"ally" | "enemy", LineBasicMaterial> = {
    ally: new LineBasicMaterial({ color: ALLY_COLOR }),
    enemy: new LineBasicMaterial({ color: ENEMY_COLOR }),
  };

  sync(units: readonly VisibleUnit[], isAlly: (team: Team) => boolean) {
    for (const view of this.views.values()) view.seen = false;
    for (const unit of units) {
      let view = this.views.get(unit.id);
      if (!view) {
        const side = isAlly(unit.team) ? "ally" : "enemy";
        view = new UnitView(
          unit,
          this.styles[unit.kind],
          side,
          this.barBackground,
          this.barFills[side],
          this.edgeMaterials[side],
        );
        this.views.set(unit.id, view);
        this.root.add(view.root);
      }
      view.seen = true;
      view.setHealth(unit.hp / UNIT_STATS[unit.kind].maxHp);
    }
    for (const [id, view] of this.views) {
      if (view.seen) continue;
      this.root.remove(view.root);
      view.dispose();
      this.views.delete(id);
    }
  }

  ids(): IterableIterator<string> {
    return this.views.keys();
  }

  update(id: string, position: Vec2 | undefined, frameMs: number) {
    this.views.get(id)?.update(position, frameMs);
  }

  position(id: string): Vec2 | undefined {
    const view = this.views.get(id);
    return view?.root.visible ? { x: view.root.position.x, y: view.root.position.z } : undefined;
  }

  flash(id: string) {
    this.views.get(id)?.flash();
  }

  alertRange(id: string) {
    this.views.get(id)?.alertRange();
  }
}

class UnitView {
  readonly root = new Group();
  seen = true;
  private readonly material: MeshLambertMaterial;
  private readonly fill: Sprite;
  private readonly barWidth: number;
  private flashRemainingMs = 0;
  private readonly rangeMaterial: MeshBasicMaterial | undefined;
  private alertRemainingMs = 0;

  constructor(
    unit: VisibleUnit,
    style: KindStyle,
    side: "ally" | "enemy",
    barBackground: SpriteMaterial,
    barFill: SpriteMaterial,
    edgeMaterial: LineBasicMaterial,
  ) {
    const color = side === "ally" ? 0x2f9e68 : 0xa63a3a;
    this.material = new MeshLambertMaterial({ color, emissive: color, emissiveIntensity: BASE_EMISSIVE, flatShading: true });
    this.root.add(new Mesh(style.geometry, this.material), new LineSegments(style.edges, edgeMaterial));
    if (style.rangeRing) {
      this.rangeMaterial = rangeRingMaterial(side === "ally" ? ALLY_COLOR : ENEMY_COLOR);
      this.root.add(new Mesh(style.rangeRing, this.rangeMaterial));
    }

    const barY = style.height + 14;
    const background = new Sprite(barBackground);
    background.scale.set(style.barWidth + BAR_BORDER, style.barHeight + BAR_BORDER, 1);
    background.position.y = barY;
    this.fill = new Sprite(barFill);
    this.fill.center.set(0, 0.5);
    this.fill.scale.set(style.barWidth, style.barHeight, 1);
    this.fill.position.set(-style.barWidth / 2, barY, 0);
    this.fill.renderOrder = background.renderOrder + 1;
    this.root.add(background, this.fill);
    this.barWidth = style.barWidth;
    this.root.position.set(unit.x, 0, unit.y);
    this.root.visible = false;
  }

  setHealth(fraction: number) {
    this.fill.scale.x = Math.max(0, Math.min(1, fraction)) * this.barWidth;
  }

  update(position: Vec2 | undefined, frameMs: number) {
    this.root.visible = position !== undefined;
    if (!position) return;
    this.root.position.x = position.x;
    this.root.position.z = position.y;
    if (this.flashRemainingMs > 0) {
      this.flashRemainingMs = Math.max(0, this.flashRemainingMs - frameMs);
      const t = this.flashRemainingMs / FLASH_MS;
      this.material.emissiveIntensity = BASE_EMISSIVE + (FLASH_EMISSIVE - BASE_EMISSIVE) * t;
    }
    if (this.rangeMaterial && this.alertRemainingMs > 0) {
      this.alertRemainingMs = Math.max(0, this.alertRemainingMs - frameMs);
      const t = Math.min(1, this.alertRemainingMs / RANGE_ALERT_FADE_MS);
      this.rangeMaterial.opacity = RANGE_RING_IDLE_OPACITY + (RANGE_RING_ALERT_OPACITY - RANGE_RING_IDLE_OPACITY) * t;
    }
  }

  alertRange() {
    if (!this.rangeMaterial) return;
    this.alertRemainingMs = RANGE_ALERT_HOLD_MS + RANGE_ALERT_FADE_MS;
    this.rangeMaterial.opacity = RANGE_RING_ALERT_OPACITY;
  }

  flash() {
    this.flashRemainingMs = FLASH_MS;
  }

  dispose() {
    this.material.dispose();
    this.rangeMaterial?.dispose();
  }
}
