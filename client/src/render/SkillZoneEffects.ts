import {
  AdditiveBlending,
  type BufferGeometry,
  CircleGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RingGeometry,
} from "three";
import { TICK_MS, getSkill, type SkillId, type SkillShape, type Vec2, type VisibleZone } from "@moba/shared";

const FLASH_MS = 380;
const FLASH_HEIGHT = 2.2;
const TELEGRAPH_HEIGHT = 1.8;
const OUTLINE_WIDTH = 5;
const ARC_SEGMENTS = 48;
const ALLY_TELEGRAPH = 0x5dffa0;
const ENEMY_TELEGRAPH = 0xff4a3d;
const MAX_FLASHES = 16;

interface ZoneGeometry {
  fill: BufferGeometry;
  outline: BufferGeometry | null;
  length: number;
}

interface Flash {
  mesh: Mesh<BufferGeometry, MeshBasicMaterial>;
  elapsedMs: number;
  baseScaleX: number;
}

interface Telegraph {
  group: Group;
  outline: Mesh<BufferGeometry, MeshBasicMaterial>;
  base: Mesh<BufferGeometry, MeshBasicMaterial>;
  progress: Mesh<BufferGeometry, MeshBasicMaterial>;
  fireAt: number;
  delayMs: number;
  seen: boolean;
}

export class SkillZoneEffects {
  readonly root = new Group();
  private readonly geometries = new Map<string, ZoneGeometry>();
  private readonly flashes: Flash[] = [];
  private readonly telegraphs = new Map<number, Telegraph>();
  private readonly spareTelegraphs: Telegraph[] = [];

  flash(skillId: SkillId, zoneIndex: number, origin: Vec2, direction: Vec2, color: number, length?: number) {
    const geometry = this.geometry(skillId, zoneIndex);
    const flash = this.takeFlash();
    if (!flash) return;

    flash.mesh.geometry = geometry.fill;
    flash.mesh.material.color.setHex(color);
    flash.mesh.position.set(origin.x, FLASH_HEIGHT, origin.y);
    flash.mesh.rotation.y = -Math.atan2(direction.y, direction.x);
    flash.baseScaleX = length !== undefined && geometry.length > 0 ? length / geometry.length : 1;
    flash.elapsedMs = 0;
    flash.mesh.visible = true;
  }

  syncTelegraphs(zones: readonly VisibleZone[], myId: string, now: number) {
    for (const telegraph of this.telegraphs.values()) telegraph.seen = false;

    for (const zone of zones) {
      let telegraph = this.telegraphs.get(zone.id);
      if (!telegraph) {
        telegraph = this.takeTelegraph();
        this.placeTelegraph(telegraph, zone, zone.casterId === myId ? ALLY_TELEGRAPH : ENEMY_TELEGRAPH);
        telegraph.fireAt = now + zone.remainingTicks * TICK_MS;
        telegraph.delayMs = zone.delayTicks * TICK_MS;
        this.telegraphs.set(zone.id, telegraph);
      }
      telegraph.seen = true;
    }

    for (const [id, telegraph] of this.telegraphs) {
      if (telegraph.seen) continue;
      telegraph.group.visible = false;
      this.telegraphs.delete(id);
      this.spareTelegraphs.push(telegraph);
    }
  }

  update(frameMs: number, now: number) {
    for (const flash of this.flashes) {
      if (!flash.mesh.visible) continue;
      flash.elapsedMs += frameMs;
      const t = flash.elapsedMs / FLASH_MS;
      if (t >= 1) {
        flash.mesh.visible = false;
        continue;
      }
      const grow = 0.92 + 0.1 * t;
      flash.mesh.scale.set(flash.baseScaleX * grow, 1, grow);
      flash.mesh.material.opacity = 0.75 * (1 - t) * (1 - t);
    }

    for (const telegraph of this.telegraphs.values()) {
      const progress = telegraph.delayMs > 0 ? 1 - Math.max(0, telegraph.fireAt - now) / telegraph.delayMs : 1;
      const p = Math.min(1, Math.max(0.02, progress));
      telegraph.progress.scale.set(p, 1, p);
      telegraph.outline.material.opacity = 0.55 + 0.35 * Math.sin(now * 0.025) ** 2;
    }
  }

  private placeTelegraph(telegraph: Telegraph, zone: VisibleZone, color: number) {
    const geometry = this.geometry(zone.skillId, zone.zoneIndex);
    telegraph.base.geometry = geometry.fill;
    telegraph.progress.geometry = geometry.fill;
    telegraph.outline.geometry = geometry.outline ?? geometry.fill;
    for (const mesh of [telegraph.base, telegraph.progress, telegraph.outline]) mesh.material.color.setHex(color);
    telegraph.group.position.set(zone.x, TELEGRAPH_HEIGHT, zone.y);
    telegraph.group.rotation.y = -Math.atan2(zone.dirY, zone.dirX);
    telegraph.group.visible = true;
  }

  private geometry(skillId: SkillId, zoneIndex: number): ZoneGeometry {
    const key = `${skillId}:${zoneIndex}`;
    let geometry = this.geometries.get(key);
    if (!geometry) {
      geometry = createZoneGeometry(getSkill(skillId).zones[zoneIndex].shape);
      this.geometries.set(key, geometry);
    }
    return geometry;
  }

  private takeFlash(): Flash | undefined {
    const free = this.flashes.find((flash) => !flash.mesh.visible);
    if (free) return free;
    if (this.flashes.length >= MAX_FLASHES) return undefined;
    const mesh = new Mesh<BufferGeometry, MeshBasicMaterial>(undefined, groundMaterial(0.7));
    const flash = { mesh, elapsedMs: 0, baseScaleX: 1 };
    this.flashes.push(flash);
    this.root.add(mesh);
    return flash;
  }

  private takeTelegraph(): Telegraph {
    const spare = this.spareTelegraphs.pop();
    if (spare) return spare;

    const group = new Group();
    const base = new Mesh<BufferGeometry, MeshBasicMaterial>(undefined, groundMaterial(0.12));
    const progress = new Mesh<BufferGeometry, MeshBasicMaterial>(undefined, groundMaterial(0.28));
    const outline = new Mesh<BufferGeometry, MeshBasicMaterial>(undefined, groundMaterial(0.8));
    progress.position.y = 0.2;
    outline.position.y = 0.4;
    group.add(base, progress, outline);
    this.root.add(group);
    return { group, base, progress, outline, fireAt: 0, delayMs: 0, seen: false };
  }
}

function groundMaterial(opacity: number): MeshBasicMaterial {
  return new MeshBasicMaterial({
    transparent: true,
    opacity,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });
}

function createZoneGeometry(shape: SkillShape): ZoneGeometry {
  switch (shape.type) {
    case "circle":
      return {
        fill: flat(new CircleGeometry(shape.radius, ARC_SEGMENTS)),
        outline: flat(new RingGeometry(shape.radius - OUTLINE_WIDTH, shape.radius, ARC_SEGMENTS)),
        length: 0,
      };
    case "ring":
      return {
        fill: flat(new RingGeometry(shape.innerRadius, shape.outerRadius, ARC_SEGMENTS)),
        outline: flat(new RingGeometry(shape.outerRadius - OUTLINE_WIDTH, shape.outerRadius, ARC_SEGMENTS)),
        length: 0,
      };
    case "cone": {
      const angle = (shape.angleDeg * Math.PI) / 180;
      return { fill: flat(new CircleGeometry(shape.radius, 24, -angle / 2, angle)), outline: null, length: 0 };
    }
    case "line":
      return {
        fill: flat(new PlaneGeometry(shape.length, shape.width).translate(shape.length / 2, 0, 0)),
        outline: null,
        length: shape.length,
      };
  }
}

function flat(geometry: BufferGeometry): BufferGeometry {
  return geometry.rotateX(-Math.PI / 2);
}
