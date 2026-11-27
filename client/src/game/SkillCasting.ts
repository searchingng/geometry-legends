import { Message, type CastSkillMessage, type SkillSlot, type Vec2 } from "@moba/shared";
import { SkillIndicators } from "../render/SkillIndicators.js";
import { SkillBar } from "../ui/SkillBar.js";
import type { FrameContext, GameServices } from "./FrameContext.js";

const SLOT_KEYS: Record<string, SkillSlot> = { KeyZ: 0, KeyX: 1, KeyC: 2 };
const RIGHT_BUTTON_SLOT: SkillSlot = 0;

export class SkillCasting {
  private readonly indicators = new SkillIndicators();
  private readonly bar = new SkillBar();
  private aiming: SkillSlot | undefined;
  private aimingByRightButton = false;
  private caster: Vec2 | undefined;
  private cooldowns: readonly number[] | undefined;

  constructor(readonly services: GameServices) {
    services.scene.add(this.indicators.root);
    window.addEventListener("keydown", (event) => this.onKey(event, true));
    window.addEventListener("keyup", (event) => this.onKey(event, false));
    window.addEventListener("blur", () => this.stopAiming());
    services.pointer.onLeftClick(() => this.castAimed());
    services.pointer.onRightButton((down) => this.onRightButton(down));
  }

  frame(ctx: FrameContext) {
    if (!ctx.myHeroId) return;
    this.indicators.setHero(ctx.myHeroId);
    this.bar.setHero(ctx.myHeroId);
    this.cooldowns = ctx.me?.skillCooldownTicks;
    this.bar.setCooldowns(this.cooldowns);
    this.caster = ctx.dead ? undefined : ctx.myPosition;

    if (this.aiming === undefined || !this.caster) {
      this.indicators.hide();
      this.bar.setAiming(undefined);
      return;
    }
    const aim = this.services.pointer.worldPoint() ?? this.caster;
    this.indicators.show(this.aiming, this.caster, aim, !this.ready(this.aiming), ctx.frameMs);
    this.bar.setAiming(this.aiming);
  }

  private onKey(event: KeyboardEvent, down: boolean) {
    const slot = SLOT_KEYS[event.code];
    if (slot === undefined || isTyping(event.target)) return;
    event.preventDefault();
    if (down) {
      if (event.repeat) return;
      this.aiming = slot;
      this.aimingByRightButton = false;
    } else if (this.aiming === slot) {
      this.stopAiming();
    }
  }

  private onRightButton(down: boolean) {
    if (down) {
      this.aiming = RIGHT_BUTTON_SLOT;
      this.aimingByRightButton = true;
      return;
    }
    if (!this.aimingByRightButton) return;
    if (this.aiming === RIGHT_BUTTON_SLOT) this.cast(RIGHT_BUTTON_SLOT);
    this.stopAiming();
  }

  private castAimed(): boolean {
    if (this.aiming === undefined) return false;
    this.cast(this.aiming);
    return true;
  }

  private cast(slot: SkillSlot) {
    if (!this.caster) return;
    if (!this.ready(slot)) {
      this.bar.flashDenied(slot);
      return;
    }
    const message: CastSkillMessage = { slot, aim: this.services.pointer.worldPoint() ?? this.caster };
    this.services.connection.send(Message.CastSkill, message);
    this.services.predictLocalCast(slot, message.aim);
    this.stopAiming();
  }

  private ready(slot: SkillSlot): boolean {
    return (this.cooldowns?.[slot] ?? 0) <= 0;
  }

  private stopAiming() {
    this.aiming = undefined;
    this.aimingByRightButton = false;
    this.indicators.hide();
    this.bar.setAiming(undefined);
  }
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}
