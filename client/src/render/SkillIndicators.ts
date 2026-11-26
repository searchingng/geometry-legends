import { DoubleSide, Group, Mesh, MeshBasicMaterial, type BufferGeometry } from "three";
import {
  getHero,
  type SkillShape,
  type SkillZone,
  getSkill,
  resolveSkillAim,
  type HeroId,
  type SkillDefinition,
  type SkillSlot,
  type Vec2,
  type ZoneKind,
} from "@moba/shared";
import { bar, chevron, disc, shapeGeometries } from "./IndicatorGeometry.js";

export const ZONE_COLORS: Record<ZoneKind, number> = {
  damage: 0xff5533,
  control: 0x9b6bff,
  utility: 0x3fe08f,
};

const NEUTRAL_COLOR = 0xdde6ff;
const BLOCKED_COLOR = 0x9a3344;
const STROKE = 3;
const FILL_OPACITY = 0.2;
const FILL_PULSE = 0.08;
const OUTLINE_OPACITY = 0.9;
const NEUTRAL_FILL_OPACITY = 0.07;
const NEUTRAL_LINE_OPACITY = 0.4;
const BLOCKED_DIM = 0.55;
const PULSE_PER_MS = 0.006;
const GUIDE_HALF_WIDTH = 2;
const SELF_ZONE_MIN_RADIUS_RATIO = 1.8;
const CHEVRON_SIZE = 12;
const CHEVRON_THICKNESS = 5;
const HEIGHT = { neutral: 0.8, fill: 1, outline: 1.2 } as const;
const ORDER = { neutral: 3, fill: 4, outline: 5 } as const;

type Layer = keyof typeof HEIGHT;

interface Paint {
  material: MeshBasicMaterial;
  color: number;
  opacity: number;
  pulses: boolean;
}

class IndicatorPalette {
  readonly fill = new Map<ZoneKind, MeshBasicMaterial>();
  readonly outline = new Map<ZoneKind, MeshBasicMaterial>();
  readonly neutralFill: MeshBasicMaterial;
  readonly neutralLine: MeshBasicMaterial;
  private readonly paints: Paint[] = [];
  private blocked = false;
  private elapsedMs = 0;

  constructor() {
    for (const kind of Object.keys(ZONE_COLORS) as ZoneKind[]) {
      this.fill.set(kind, this.create(ZONE_COLORS[kind], FILL_OPACITY, true));
      this.outline.set(kind, this.create(ZONE_COLORS[kind], OUTLINE_OPACITY, false));
    }
    this.neutralFill = this.create(NEUTRAL_COLOR, NEUTRAL_FILL_OPACITY, false);
    this.neutralLine = this.create(NEUTRAL_COLOR, NEUTRAL_LINE_OPACITY, false);
  }

  setBlocked(blocked: boolean) {
    if (blocked === this.blocked) return;
    this.blocked = blocked;
    for (const paint of this.paints) {
      paint.material.color.setHex(blocked ? BLOCKED_COLOR : paint.color);
      paint.material.opacity = paint.opacity * (blocked ? BLOCKED_DIM : 1);
    }
  }

  animate(frameMs: number) {
    if (this.blocked) return;
    this.elapsedMs += frameMs;
    const pulse = FILL_PULSE * Math.sin(this.elapsedMs * PULSE_PER_MS);
    for (const paint of this.paints) if (paint.pulses) paint.material.opacity = paint.opacity + pulse;
  }

  private create(color: number, opacity: number, pulses: boolean): MeshBasicMaterial {
    const material = new MeshBasicMaterial({
      color,
      opacity,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    });
    this.paints.push({ material, color, opacity, pulses });
    return material;
  }
}

class SlotIndicator {
  readonly root = new Group();
  private readonly casterLayer = new Group();
  private readonly aimLayer = new Group();
  private readonly dashEndLayer = new Group();
  private readonly rangeLayer = new Group();
  private readonly guide: Mesh | undefined;
  private readonly dashDistance: number | undefined;

  constructor(
    private readonly skill: SkillDefinition,
    heroRadius: number,
    palette: IndicatorPalette,
  ) {
    const layers = { caster: this.casterLayer, aimPoint: this.aimLayer, dashEnd: this.dashEndLayer };

    for (const zone of skill.zones) {
      const geometries = shapeGeometries(displayShape(zone, heroRadius), STROKE);
      layers[zone.anchor].add(mesh(geometries.fill, palette.fill.get(zone.kind)!, "fill"));
      for (const outline of geometries.outlines) {
        layers[zone.anchor].add(mesh(outline, palette.outline.get(zone.kind)!, "outline"));
      }
    }

    if (skill.delivery.type === "dash") {
      this.dashDistance = skill.delivery.distance;
      this.casterLayer.add(mesh(bar(this.dashDistance, heroRadius), palette.neutralFill, "neutral"));
      this.dashEndLayer.add(mesh(disc(heroRadius - STROKE, heroRadius), palette.neutralLine, "outline"));
    }

    if (skill.aim === "direction") {
      const tip = mesh(chevron(CHEVRON_SIZE, CHEVRON_THICKNESS), palette.neutralLine, "outline");
      tip.position.x = this.reach();
      this.casterLayer.add(tip);
    }

    if (skill.aim === "point") {
      this.rangeLayer.add(
        mesh(disc(0, skill.range), palette.neutralFill, "neutral"),
        mesh(disc(skill.range - STROKE, skill.range), palette.neutralLine, "neutral"),
      );
      this.guide = mesh(bar(1, GUIDE_HALF_WIDTH), palette.neutralLine, "neutral");
      this.casterLayer.add(this.guide);
    }

    for (const layer of [this.rangeLayer, this.casterLayer, this.aimLayer, this.dashEndLayer]) {
      if (layer.children.length > 0) this.root.add(layer);
    }
    this.root.visible = false;
  }

  update(caster: Vec2, aim: Vec2) {
    const { direction, point } = resolveSkillAim(this.skill, caster, aim);
    const angle = Math.atan2(-direction.y, direction.x);

    this.rangeLayer.position.set(caster.x, 0, caster.y);
    place(this.casterLayer, caster, angle);
    place(this.aimLayer, point, angle);
    if (this.dashDistance !== undefined) {
      this.dashEndLayer.position.set(
        caster.x + direction.x * this.dashDistance,
        0,
        caster.y + direction.y * this.dashDistance,
      );
      this.dashEndLayer.rotation.y = angle;
    }
    if (this.guide) this.guide.scale.x = Math.max(Math.hypot(point.x - caster.x, point.y - caster.y), 0.01);
  }

  private reach(): number {
    if (this.dashDistance !== undefined) return this.dashDistance;
    let reach = this.skill.range;
    for (const zone of this.skill.zones) {
      if (zone.anchor !== "caster") continue;
      if (zone.shape.type === "line") reach = Math.max(reach, zone.shape.length);
      if (zone.shape.type === "cone") reach = Math.max(reach, zone.shape.radius);
    }
    return reach;
  }
}

export class SkillIndicators {
  readonly root = new Group();
  private readonly palette = new IndicatorPalette();
  private readonly kits = new Map<HeroId, SlotIndicator[]>();
  private kit: SlotIndicator[] = [];
  private active: SlotIndicator | undefined;

  setHero(heroId: HeroId) {
    let kit = this.kits.get(heroId);
    if (!kit) {
      const hero = getHero(heroId);
      kit = hero.skills.map((id) => new SlotIndicator(getSkill(id), hero.radius, this.palette));
      for (const indicator of kit) this.root.add(indicator.root);
      this.kits.set(heroId, kit);
    }
    if (kit !== this.kit) {
      this.hide();
      this.kit = kit;
    }
  }

  show(slot: SkillSlot, caster: Vec2, aim: Vec2, blocked: boolean, frameMs: number) {
    const indicator = this.kit[slot];
    if (!indicator) return;
    if (indicator !== this.active) {
      this.hide();
      this.active = indicator;
      indicator.root.visible = true;
    }
    this.palette.setBlocked(blocked);
    this.palette.animate(frameMs);
    indicator.update(caster, aim);
  }

  hide() {
    if (!this.active) return;
    this.active.root.visible = false;
    this.active = undefined;
  }
}

function mesh(geometry: BufferGeometry, material: MeshBasicMaterial, layer: Layer): Mesh {
  const result = new Mesh(geometry, material);
  result.position.y = HEIGHT[layer];
  result.renderOrder = ORDER[layer];
  return result;
}

function displayShape(zone: SkillZone, heroRadius: number): SkillShape {
  if (zone.targets !== "self" || zone.shape.type !== "circle") return zone.shape;
  return { type: "circle", radius: Math.max(zone.shape.radius, heroRadius * SELF_ZONE_MIN_RADIUS_RATIO) };
}

function place(layer: Group, position: Vec2, angle: number) {
  layer.position.set(position.x, 0, position.y);
  layer.rotation.y = angle;
}
