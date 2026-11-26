import {
  AdditiveBlending,
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
} from "three";
import { TICK_MS, type VisiblePlayer } from "@moba/shared";
import type { PositionLookup } from "./AttackEffects.js";
import { radialGradientTexture } from "./textures.js";

const STUN_COLOR = 0xffe14d;
const SLOW_COLOR = 0x7fd8ff;
const SHIELD_COLOR = 0x9fd6ff;
const STUN_STARS = 3;
const STUN_ORBIT_SPEED = 0.008;
const STAR_SIZE = 22;
const HOVER_HEIGHT = 6;
const SHIELD_FADE_MS = 200;

interface PlayerStatus {
  stunUntil: number;
  slowUntil: number;
  shieldUntil: number;
  shieldStart: number;
}

class StatusView {
  readonly root = new Group();
  private readonly stun = new Group();
  private readonly slow: Mesh<RingGeometry, MeshBasicMaterial>;
  private readonly shield: Mesh<SphereGeometry, MeshBasicMaterial>;
  private readonly bodyHeight: number;

  constructor(radius: number, shieldGeometry: SphereGeometry) {
    this.bodyHeight = radius * 1.3;
    for (let i = 0; i < STUN_STARS; i++) {
      const star = new Sprite(
        new SpriteMaterial({
          map: radialGradientTexture(),
          color: STUN_COLOR,
          blending: AdditiveBlending,
          transparent: true,
          depthWrite: false,
        }),
      );
      star.scale.setScalar(STAR_SIZE);
      const angle = (i / STUN_STARS) * Math.PI * 2;
      star.position.set(Math.cos(angle) * radius * 0.9, 0, Math.sin(angle) * radius * 0.9);
      this.stun.add(star);
    }
    this.stun.position.y = this.bodyHeight + HOVER_HEIGHT + 22;

    this.slow = new Mesh(
      new RingGeometry(radius + 11, radius + 17, 40).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ color: SLOW_COLOR, transparent: true, depthWrite: false, blending: AdditiveBlending }),
    );
    this.slow.position.y = 1.4;

    this.shield = new Mesh(
      shieldGeometry,
      new MeshBasicMaterial({ color: SHIELD_COLOR, transparent: true, depthWrite: false, blending: AdditiveBlending }),
    );
    this.shield.scale.setScalar(radius * 1.55);
    this.shield.position.y = this.bodyHeight / 2 + HOVER_HEIGHT;

    this.root.add(this.stun, this.slow, this.shield);
  }

  update(status: PlayerStatus, now: number) {
    const stunned = now < status.stunUntil;
    this.stun.visible = stunned;
    if (stunned) this.stun.rotation.y = now * STUN_ORBIT_SPEED;

    const slowed = now < status.slowUntil;
    this.slow.visible = slowed;
    if (slowed) this.slow.material.opacity = 0.45 + 0.3 * Math.sin(now * 0.01);

    const shielded = now < status.shieldUntil;
    this.shield.visible = shielded;
    if (shielded) {
      const fadeIn = Math.min(1, (now - status.shieldStart) / SHIELD_FADE_MS);
      const fadeOut = Math.min(1, (status.shieldUntil - now) / SHIELD_FADE_MS);
      this.shield.material.opacity = (0.16 + 0.06 * Math.sin(now * 0.006)) * Math.min(fadeIn, fadeOut);
    }
    this.root.visible = stunned || slowed || shielded;
  }

  dispose() {
    this.root.removeFromParent();
    this.root.traverse((object) => {
      if (object instanceof Sprite) object.material.dispose();
      if (object instanceof Mesh) (object.material as MeshBasicMaterial).dispose();
    });
    this.slow.geometry.dispose();
  }
}

export class StatusIndicators {
  readonly root = new Group();
  private readonly shieldGeometry = new SphereGeometry(1, 18, 12);
  private readonly views = new Map<string, StatusView>();
  private readonly statuses = new Map<string, PlayerStatus>();

  sync(visible: readonly VisiblePlayer[], radiusOf: (id: string) => number | undefined, now: number) {
    for (const player of visible) {
      const statuses = player.statuses;
      const previous = this.statuses.get(player.id);
      const shieldUntil = statuses?.shield ? now + (statuses.shieldTicks ?? 0) * TICK_MS : 0;
      const wasShielded = previous !== undefined && now < previous.shieldUntil;
      this.statuses.set(player.id, {
        stunUntil: statuses?.stunTicks ? now + statuses.stunTicks * TICK_MS : 0,
        slowUntil: statuses?.slowTicks ? now + statuses.slowTicks * TICK_MS : 0,
        shieldUntil,
        shieldStart: wasShielded ? previous.shieldStart : now,
      });

      if (!this.views.has(player.id)) {
        const radius = radiusOf(player.id);
        if (radius === undefined) continue;
        const view = new StatusView(radius, this.shieldGeometry);
        this.views.set(player.id, view);
        this.root.add(view.root);
      }
    }
  }

  prune(present: ReadonlySet<string>) {
    for (const [id, view] of this.views) {
      if (present.has(id)) continue;
      view.dispose();
      this.views.delete(id);
      this.statuses.delete(id);
    }
  }

  update(now: number, viewPosition: PositionLookup) {
    for (const [id, view] of this.views) {
      const position = viewPosition(id);
      const status = this.statuses.get(id);
      if (!position || !status) {
        view.root.visible = false;
        continue;
      }
      view.root.position.set(position.x, 0, position.y);
      view.update(status, now);
    }
  }
}
