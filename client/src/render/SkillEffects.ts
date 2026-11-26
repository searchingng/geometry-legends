import { Group } from "three";
import { INTERPOLATION_DELAY_MS, getHero, getSkill, type CombatEvent, type HeroId } from "@moba/shared";
import type { SnapshotContext } from "../game/FrameContext.js";
import type { PositionLookup } from "./AttackEffects.js";
import { SkillProjectileEffects } from "./SkillProjectileEffects.js";
import { SkillZoneEffects } from "./SkillZoneEffects.js";
import { StatusIndicators } from "./StatusIndicators.js";

const FALLBACK_COLOR = 0xffffff;
const HEAL_COLOR = 0x6dff8a;
const SHIELD_HIT_COLOR = 0x9fd6ff;
const HIT_BURST_SIZE = 64;
const HEAL_BURST_SIZE = 96;
const FIZZLE_BURST_SIZE = 46;
const TRAIL_TAIL_MS = 60;

export class SkillEffects {
  readonly root = new Group();
  private readonly zones = new SkillZoneEffects();
  private readonly projectiles = new SkillProjectileEffects();
  private readonly statuses = new StatusIndicators();

  constructor() {
    this.root.add(this.zones.root, this.projectiles.root, this.statuses.root);
  }

  onSnapshot(ctx: SnapshotContext) {
    const now = performance.now();
    const { snapshot, heroIds } = ctx;
    const colorOf = (id: string) => heroColor(heroIds, id);

    this.statuses.prune(new Set(snapshot.roster.map((entry) => entry.id)));
    this.statuses.sync(snapshot.visible, (id) => heroRadius(heroIds, id), now);
    this.projectiles.syncProjectiles(snapshot.projectiles ?? [], colorOf, now);
    this.zones.syncTelegraphs(snapshot.zones ?? [], ctx.myId, now);

    for (const event of snapshot.events ?? []) this.onEvent(event, ctx);
  }

  update(frameMs: number, viewPosition: PositionLookup) {
    const now = performance.now();
    this.zones.update(frameMs, now);
    this.projectiles.update(frameMs, now, viewPosition);
    this.statuses.update(now, viewPosition);
  }

  private onEvent(event: CombatEvent, ctx: SnapshotContext) {
    const { heroIds, viewPosition } = ctx;
    switch (event.kind) {
      case "skillCast": {
        const delivery = getSkill(event.skillId).delivery;
        if (delivery.type !== "dash") return;
        const dashMs = (delivery.distance / delivery.speed) * 1000 + TRAIL_TAIL_MS;
        const delay = event.casterId === ctx.myId ? 0 : INTERPOLATION_DELAY_MS;
        const width = (heroRadius(heroIds, event.casterId) ?? 24) * 1.6;
        this.projectiles.trail(event.casterId, event, heroColor(heroIds, event.casterId), width, dashMs + delay);
        return;
      }
      case "skillZone": {
        const zone = getSkill(event.skillId).zones[event.zoneIndex];
        const followCaster = zone.anchor === "caster" && event.length === undefined;
        const origin = (followCaster ? viewPosition(event.casterId) : undefined) ?? event;
        const direction = { x: event.dirX, y: event.dirY };
        this.zones.flash(event.skillId, event.zoneIndex, origin, direction, heroColor(heroIds, event.casterId), event.length);
        return;
      }
      case "skillHit": {
        const at = viewPosition(event.targetId);
        if (!at) return;
        if (event.damage > 0) this.projectiles.burst(at, heroColor(heroIds, event.casterId), HIT_BURST_SIZE);
        if (event.absorbed > 0) this.projectiles.burst(at, SHIELD_HIT_COLOR, HIT_BURST_SIZE);
        if (event.healed > 0) this.projectiles.burst(at, HEAL_COLOR, HEAL_BURST_SIZE);
        return;
      }
      case "projectileEnd":
        if (event.targetId === undefined) {
          this.projectiles.burst(event, heroColor(heroIds, event.casterId), FIZZLE_BURST_SIZE);
        }
        return;
      default:
        return;
    }
  }
}

function heroColor(heroIds: ReadonlyMap<string, HeroId>, id: string): number {
  const heroId = heroIds.get(id);
  return heroId ? getHero(heroId).visual.color : FALLBACK_COLOR;
}

function heroRadius(heroIds: ReadonlyMap<string, HeroId>, id: string): number | undefined {
  const heroId = heroIds.get(id);
  return heroId ? getHero(heroId).radius : undefined;
}
