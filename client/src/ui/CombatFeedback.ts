import { getHero, getSkill, type CombatEvent, type HeroId, type SkillId } from "@moba/shared";
import type { FrameContext, GameServices, SnapshotContext } from "../game/FrameContext.js";
import type { PositionLookup } from "../render/AttackEffects.js";
import { Sfx, type SoundId } from "../audio/Sfx.js";
import { FloatingNumbers } from "./FloatingNumbers.js";
import "./combatFeedback.css";

const MIN_BOLT_RANGE = 150;
const BANNER_MS = 2000;
const LOW_HP_FRACTION = 0.25;
const BIG_HIT_FRACTION = 0.08;
const HIT_SHAKE_SCALE = 3;
const MAX_HIT_SHAKE = 0.6;
const STUN_SHAKE = 0.45;
const KNOCKBACK_SHAKE = 0.5;
const DEATH_SHAKE = 0.7;
const OWN_DASH_WINDOW_MS = 400;

const CAST_SOUNDS = {
  damage: "castDamage",
  control: "castControl",
  utility: "castUtility",
} as const satisfies Record<string, SoundId>;

export class CombatFeedback {
  private readonly sfx = new Sfx();
  private readonly numbers: FloatingNumbers;
  private readonly banner: HTMLDivElement;
  private readonly vignette: HTMLDivElement;
  private readonly muteButton: HTMLDivElement;
  private heroIds: ReadonlyMap<string, HeroId> = new Map();
  private myId = "";
  private lowHp = false;
  private wasStunned = false;
  private hadMotion = false;
  private lastOwnCastAt = -Infinity;
  private exactStatuses = false;
  private bannerAnimation: Animation | undefined;

  constructor(readonly services: GameServices) {
    const layer = createElement("cf-layer");
    this.numbers = new FloatingNumbers(layer, services.scene);
    this.vignette = createElement("cf-vignette");
    this.banner = createElement("cf-banner");
    this.muteButton = createElement("cf-mute");
    this.muteButton.dataset.ui = "";
    this.muteButton.title = "Toggle sound (M)";
    document.body.append(this.vignette, layer, this.banner, this.muteButton);

    this.renderMute(this.sfx.muted);
    this.sfx.onMuteChange((muted) => this.renderMute(muted));
    this.muteButton.addEventListener("click", () => this.sfx.toggleMute());
    window.addEventListener("keydown", (event) => {
      if (event.code !== "KeyM" || event.repeat || isTyping(event.target)) return;
      this.sfx.toggleMute();
    });
  }

  get audio(): Sfx {
    return this.sfx;
  }

  onSnapshot(ctx: SnapshotContext) {
    this.heroIds = ctx.heroIds;
    this.myId = ctx.myId;
    for (const event of ctx.snapshot.events ?? []) this.onEvent(event, ctx.viewPosition);
  }

  frame(ctx: FrameContext) {
    this.numbers.update(ctx.frameMs, ctx.viewPosition);
    if (!ctx.myHeroId) return;

    const me = ctx.me;
    const lowHp = !ctx.dead && me !== undefined && me.hp > 0 && me.hp / getHero(ctx.myHeroId).maxHp < LOW_HP_FRACTION;
    if (lowHp !== this.lowHp) {
      this.lowHp = lowHp;
      this.vignette.classList.toggle("cf-active", lowHp);
    }

    const stunned = (me?.statuses?.stunTicks ?? 0) > 0;
    const moving = me?.statuses?.motion !== undefined;
    if (!this.exactStatuses) {
      if (stunned && !this.wasStunned) this.services.scene.shake(STUN_SHAKE);
      if (moving && !this.hadMotion && ctx.now - this.lastOwnCastAt > OWN_DASH_WINDOW_MS) {
        this.services.scene.shake(KNOCKBACK_SHAKE);
      }
    }
    this.wasStunned = stunned;
    this.hadMotion = moving;
  }

  private onEvent(event: CombatEvent, viewPosition: PositionLookup) {
    switch (event.kind) {
      case "hit":
        this.onDamage(event.attackerId, event.targetId, event.damage, viewPosition);
        if (event.attackerId === this.myId) this.sfx.play(this.attackSound(event.attackerId));
        else if (event.targetId === this.myId) this.sfx.play(this.enemyAttackSound(event.attackerId));
        break;
      case "statusApplied":
        this.exactStatuses = true;
        if (event.targetId !== this.myId) break;
        if (event.status === "stun") this.services.scene.shake(STUN_SHAKE);
        else if (event.status === "knockback") this.services.scene.shake(KNOCKBACK_SHAKE);
        break;
      case "skillHit":
        if (event.absorbed > 0) this.numbers.spawn(event.targetId, `(${Math.round(event.absorbed)})`, "absorb", viewPosition);
        if (event.healed > 0) this.numbers.spawn(event.targetId, `+${Math.round(event.healed)}`, "heal", viewPosition);
        if (event.damage > 0) this.onDamage(event.casterId, event.targetId, event.damage, viewPosition);
        break;
      case "skillCast":
        if (event.casterId === this.myId) this.lastOwnCastAt = performance.now();
        this.sfx.play(castSound(event.skillId));
        break;
      case "death":
        this.onDeath(event.playerId, event.killerId);
        break;
      case "respawn":
        if (event.playerId === this.myId) this.sfx.play("respawn");
        break;
    }
  }

  private onDamage(sourceId: string, targetId: string, damage: number, viewPosition: PositionLookup) {
    if (damage <= 0) return;
    const amount = Math.round(damage);

    if (targetId === this.myId) {
      this.numbers.spawn(targetId, `-${amount}`, "taken", viewPosition);
      this.sfx.play("hitTaken");
      const fraction = damage / this.maxHp(targetId);
      if (fraction >= BIG_HIT_FRACTION) this.services.scene.shake(Math.min(MAX_HIT_SHAKE, fraction * HIT_SHAKE_SCALE));
      return;
    }

    const mine = sourceId === this.myId;
    if (!mine && !this.heroIds.has(sourceId)) return;
    this.numbers.spawn(targetId, `${amount}`, mine ? "dealt" : "neutral", viewPosition);
    if (mine) this.sfx.play("hitLanded");
  }

  private onDeath(playerId: string, killerId: string) {
    if (playerId === this.myId) {
      this.showBanner(`Slain by ${this.heroName(killerId)}`, "cf-banner-death");
      this.sfx.play("death");
      this.services.scene.shake(DEATH_SHAKE);
    } else if (killerId === this.myId) {
      this.showBanner(`You slew ${this.heroName(playerId)}`, "cf-banner-kill");
      this.sfx.play("kill");
    }
  }

  private showBanner(text: string, variant: string) {
    this.banner.textContent = text;
    this.banner.className = `cf-banner ${variant}`;
    this.bannerAnimation?.cancel();
    this.bannerAnimation = this.banner.animate(
      [
        { opacity: 0, transform: "translateX(-50%) scale(1.25)" },
        { opacity: 1, transform: "translateX(-50%) scale(1)", offset: 0.08 },
        { opacity: 1, transform: "translateX(-50%) scale(1)", offset: 0.8 },
        { opacity: 0, transform: "translateX(-50%) scale(1)" },
      ],
      { duration: BANNER_MS, easing: "ease-out" },
    );
  }

  private attackSound(attackerId: string): SoundId {
    const heroId = this.heroIds.get(attackerId);
    return heroId && getHero(heroId).attackRange >= MIN_BOLT_RANGE ? "zap" : "swing";
  }

  private enemyAttackSound(attackerId: string): SoundId {
    return this.attackSound(attackerId) === "zap" ? "enemyZap" : "enemySwing";
  }

  private heroName(playerId: string): string {
    const heroId = this.heroIds.get(playerId);
    if (heroId) return getHero(heroId).name;
    return playerId.startsWith("turret") ? "a turret" : "creeps";
  }

  private maxHp(playerId: string): number {
    const heroId = this.heroIds.get(playerId);
    return heroId ? getHero(heroId).maxHp : 1000;
  }

  private renderMute(muted: boolean) {
    this.muteButton.textContent = muted ? "M: sound off" : "M: sound on";
    this.muteButton.classList.toggle("cf-muted", muted);
  }
}

function castSound(skillId: SkillId): SoundId {
  const zone = getSkill(skillId).zones.find((candidate) => candidate.targets === "enemy") ?? getSkill(skillId).zones[0];
  return zone ? CAST_SOUNDS[zone.kind] : "castUtility";
}

function createElement(className: string): HTMLDivElement {
  const element = document.createElement("div");
  element.className = className;
  return element;
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA");
}
