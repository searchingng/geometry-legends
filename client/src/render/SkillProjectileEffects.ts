import {
  AdditiveBlending,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Sprite,
  SpriteMaterial,
} from "three";
import type { Vec2, VisibleProjectile } from "@moba/shared";
import type { PositionLookup } from "./AttackEffects.js";
import { radialGradientTexture } from "./textures.js";

const PROJECTILE_HEIGHT = 26;
const PROJECTILE_SIZE = 34;
const TAIL_LENGTH = 70;
const MAX_EXTRAPOLATION_MS = 120;
const BURST_MS = 260;
const BURST_SIZE = 70;
const MAX_BURSTS = 12;
const TRAIL_FADE_MS = 320;
const TRAIL_HEIGHT = 3;
const MAX_TRAILS = 4;

interface TrackedProjectile {
  core: Sprite;
  tail: Mesh<PlaneGeometry, MeshBasicMaterial>;
  origin: Vec2;
  direction: Vec2;
  speed: number;
  receivedAt: number;
  seen: boolean;
}

interface Burst {
  sprite: Sprite;
  elapsedMs: number;
  size: number;
}

interface Trail {
  mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  casterId: string;
  start: Vec2;
  end: Vec2;
  width: number;
  activeMs: number;
  elapsedMs: number;
}

export class SkillProjectileEffects {
  readonly root = new Group();
  private readonly unitPlane = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0.5, 0, 0);
  private readonly projectiles = new Map<number, TrackedProjectile>();
  private readonly spareProjectiles: TrackedProjectile[] = [];
  private readonly bursts: Burst[] = [];
  private readonly trails: Trail[] = [];

  syncProjectiles(projectiles: readonly VisibleProjectile[], colorOf: (casterId: string) => number, now: number) {
    for (const tracked of this.projectiles.values()) tracked.seen = false;

    for (const projectile of projectiles) {
      let tracked = this.projectiles.get(projectile.id);
      if (!tracked) {
        tracked = this.takeProjectile();
        const color = colorOf(projectile.casterId);
        tracked.core.material.color.setHex(color);
        tracked.tail.material.color.setHex(color);
        tracked.core.visible = true;
        tracked.tail.visible = true;
        this.projectiles.set(projectile.id, tracked);
      }
      tracked.origin = { x: projectile.x, y: projectile.y };
      tracked.direction = { x: projectile.dirX, y: projectile.dirY };
      tracked.speed = projectile.speed;
      tracked.receivedAt = now;
      tracked.seen = true;
    }

    for (const [id, tracked] of this.projectiles) {
      if (tracked.seen) continue;
      tracked.core.visible = false;
      tracked.tail.visible = false;
      this.projectiles.delete(id);
      this.spareProjectiles.push(tracked);
    }
  }

  burst(at: Vec2, color: number, size = BURST_SIZE) {
    const burst = this.bursts.find((candidate) => !candidate.sprite.visible) ?? this.createBurst();
    if (!burst) return;
    burst.sprite.material.color.setHex(color);
    burst.sprite.position.set(at.x, PROJECTILE_HEIGHT, at.y);
    burst.size = size;
    burst.elapsedMs = 0;
    burst.sprite.visible = true;
  }

  trail(casterId: string, start: Vec2, color: number, width: number, activeMs: number) {
    const trail = this.trails.find((candidate) => !candidate.mesh.visible) ?? this.createTrail();
    if (!trail) return;
    trail.mesh.material.color.setHex(color);
    trail.casterId = casterId;
    trail.start = { ...start };
    trail.end = { ...start };
    trail.width = width;
    trail.activeMs = activeMs;
    trail.elapsedMs = 0;
    trail.mesh.visible = true;
  }

  update(frameMs: number, now: number, viewPosition: PositionLookup) {
    for (const tracked of this.projectiles.values()) {
      const elapsed = Math.min(now - tracked.receivedAt, MAX_EXTRAPOLATION_MS) / 1000;
      const x = tracked.origin.x + tracked.direction.x * tracked.speed * elapsed;
      const y = tracked.origin.y + tracked.direction.y * tracked.speed * elapsed;
      tracked.core.position.set(x, PROJECTILE_HEIGHT, y);
      tracked.tail.position.set(x, PROJECTILE_HEIGHT, y);
      tracked.tail.rotation.y = -Math.atan2(-tracked.direction.y, -tracked.direction.x);
    }

    for (const burst of this.bursts) {
      if (!burst.sprite.visible) continue;
      burst.elapsedMs += frameMs;
      const t = burst.elapsedMs / BURST_MS;
      if (t >= 1) {
        burst.sprite.visible = false;
        continue;
      }
      burst.sprite.scale.setScalar(burst.size * (0.4 + 0.8 * t));
      burst.sprite.material.opacity = 1 - t;
    }

    for (const trail of this.trails) {
      if (!trail.mesh.visible) continue;
      trail.elapsedMs += frameMs;
      if (trail.elapsedMs <= trail.activeMs) trail.end = viewPosition(trail.casterId) ?? trail.end;
      const fade = Math.max(0, trail.elapsedMs - trail.activeMs) / TRAIL_FADE_MS;
      if (fade >= 1) {
        trail.mesh.visible = false;
        continue;
      }
      const dx = trail.end.x - trail.start.x;
      const dy = trail.end.y - trail.start.y;
      trail.mesh.position.set(trail.start.x, TRAIL_HEIGHT, trail.start.y);
      trail.mesh.rotation.y = -Math.atan2(dy, dx);
      trail.mesh.scale.set(Math.max(Math.hypot(dx, dy), 0.001), 1, trail.width * (1 - fade * 0.7));
      trail.mesh.material.opacity = 0.55 * (1 - fade);
    }
  }

  private takeProjectile(): TrackedProjectile {
    const spare = this.spareProjectiles.pop();
    if (spare) return spare;

    const core = new Sprite(additiveSprite());
    core.scale.setScalar(PROJECTILE_SIZE);
    const tail = new Mesh(this.unitPlane, additiveMesh(0.5));
    tail.scale.set(TAIL_LENGTH, 1, PROJECTILE_SIZE * 0.35);
    this.root.add(core, tail);
    return { core, tail, origin: { x: 0, y: 0 }, direction: { x: 1, y: 0 }, speed: 0, receivedAt: 0, seen: false };
  }

  private createBurst(): Burst | undefined {
    if (this.bursts.length >= MAX_BURSTS) return undefined;
    const sprite = new Sprite(additiveSprite());
    sprite.visible = false;
    this.root.add(sprite);
    const burst = { sprite, elapsedMs: 0, size: BURST_SIZE };
    this.bursts.push(burst);
    return burst;
  }

  private createTrail(): Trail | undefined {
    if (this.trails.length >= MAX_TRAILS) return undefined;
    const mesh = new Mesh(this.unitPlane, additiveMesh(0.55));
    mesh.visible = false;
    this.root.add(mesh);
    const trail = { mesh, casterId: "", start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, width: 0, activeMs: 0, elapsedMs: 0 };
    this.trails.push(trail);
    return trail;
  }
}

function additiveSprite(): SpriteMaterial {
  return new SpriteMaterial({
    map: radialGradientTexture(),
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
}

function additiveMesh(opacity: number): MeshBasicMaterial {
  return new MeshBasicMaterial({
    map: radialGradientTexture(),
    blending: AdditiveBlending,
    transparent: true,
    opacity,
    depthWrite: false,
    side: DoubleSide,
  });
}
