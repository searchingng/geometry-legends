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
import type { Vec2 } from "@moba/shared";
import { radialGradientTexture } from "./textures.js";

const EFFECT_HEIGHT = 24;
const BOLT_SPEED = 2400;
const MIN_BOLT_MS = 60;
const BOLT_SIZE = 26;
const SLASH_MS = 160;
const SLASH_WIDTH = 10;
const POOL_SIZE = 8;

export type AttackStyle = "bolt" | "slash";
export type PositionLookup = (playerId: string) => Vec2 | undefined;

interface Effect {
  style: AttackStyle;
  attackerId: string;
  targetId: string;
  from: Vec2;
  to: Vec2;
  elapsedMs: number;
  durationMs: number;
}

export class AttackEffects {
  readonly root = new Group();
  private readonly slashGeometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0.5, 0, 0);
  private readonly bolts: Sprite[] = [];
  private readonly slashes: Mesh<PlaneGeometry, MeshBasicMaterial>[] = [];
  private readonly active: { effect: Effect; object: Sprite | Mesh }[] = [];

  spawn(style: AttackStyle, attackerId: string, targetId: string, color: number, lookup: PositionLookup) {
    const from = lookup(attackerId);
    const to = lookup(targetId);
    if (!from || !to || this.active.length >= POOL_SIZE) return;

    const durationMs =
      style === "bolt" ? Math.max(MIN_BOLT_MS, (distance(from, to) / BOLT_SPEED) * 1000) : SLASH_MS;
    const object = style === "bolt" ? this.takeBolt() : this.takeSlash();
    (object.material as MeshBasicMaterial | SpriteMaterial).color.setHex(color);
    object.visible = true;
    this.active.push({ effect: { style, attackerId, targetId, from, to, elapsedMs: 0, durationMs }, object });
  }

  update(frameMs: number, lookup: PositionLookup) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const { effect, object } = this.active[i];
      effect.elapsedMs += frameMs;
      effect.from = lookup(effect.attackerId) ?? effect.from;
      effect.to = lookup(effect.targetId) ?? effect.to;

      const t = Math.min(effect.elapsedMs / effect.durationMs, 1);
      if (effect.style === "bolt") placeBolt(object as Sprite, effect, t);
      else placeSlash(object as Mesh<PlaneGeometry, MeshBasicMaterial>, effect, t);

      if (t >= 1) {
        object.visible = false;
        this.active.splice(i, 1);
      }
    }
  }

  private takeBolt(): Sprite {
    const free = this.bolts.find((bolt) => !bolt.visible);
    if (free) return free;
    const bolt = new Sprite(
      new SpriteMaterial({
        map: radialGradientTexture(),
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    );
    bolt.scale.setScalar(BOLT_SIZE);
    this.bolts.push(bolt);
    this.root.add(bolt);
    return bolt;
  }

  private takeSlash(): Mesh<PlaneGeometry, MeshBasicMaterial> {
    const free = this.slashes.find((slash) => !slash.visible);
    if (free) return free;
    const slash = new Mesh(
      this.slashGeometry,
      new MeshBasicMaterial({
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    this.slashes.push(slash);
    this.root.add(slash);
    return slash;
  }
}

function placeBolt(bolt: Sprite, effect: Effect, t: number) {
  bolt.position.set(
    effect.from.x + (effect.to.x - effect.from.x) * t,
    EFFECT_HEIGHT,
    effect.from.y + (effect.to.y - effect.from.y) * t,
  );
}

function placeSlash(slash: Mesh<PlaneGeometry, MeshBasicMaterial>, effect: Effect, t: number) {
  const dx = effect.to.x - effect.from.x;
  const dy = effect.to.y - effect.from.y;
  slash.position.set(effect.from.x, EFFECT_HEIGHT, effect.from.y);
  slash.rotation.y = -Math.atan2(dy, dx);
  slash.scale.set(Math.hypot(dx, dy), 1, SLASH_WIDTH * (1 - t * 0.6));
  slash.material.opacity = 1 - t;
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
