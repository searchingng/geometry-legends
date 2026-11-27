import {
  Message,
  chooseAttackTarget,
  distanceSq,
  getHero,
  isAimInsideAttackRange,
  type AttackMessage,
  type Attacker,
  type TargetCandidate,
  type Vec2,
} from "@moba/shared";
import { TargetingView } from "../render/TargetingView.js";
import type { FrameContext, GameServices } from "./FrameContext.js";

const AIM_RESEND_MS = 100;
const AIM_RESEND_MIN_DISTANCE_SQ = 6 * 6;

export class AttackTargeting {
  private readonly view = new TargetingView();
  private readonly candidates: TargetCandidate[] = [];
  private readonly attacker: Attacker = { position: { x: 0, y: 0 }, radius: 0, attackRange: 0 };
  private heldSent = false;
  private sentAim: Vec2 | undefined;
  private lastSentAt = -Infinity;

  constructor(readonly services: GameServices) {
    services.scene.add(this.view.root);
  }

  frame(ctx: FrameContext) {
    if (!ctx.myHeroId) return;
    const { keyboard, pointer } = this.services;
    const aim = pointer.worldPoint();
    const tapped = keyboard.consumeAttackTap() || pointer.consumeLeftClick();
    const held = keyboard.attackHeld() || pointer.leftHeld();
    this.syncAttack(tapped, held, aim, ctx.now);

    if (ctx.dead || !ctx.myPosition) {
      this.view.hide();
      return;
    }

    const hero = getHero(ctx.myHeroId);
    this.attacker.position = ctx.myPosition;
    this.attacker.radius = hero.radius;
    this.attacker.attackRange = hero.attackRange;

    this.candidates.length = 0;
    for (const enemy of ctx.enemies) {
      this.candidates.push({ id: enemy.id, position: enemy.position, radius: getHero(enemy.heroId).radius });
    }
    this.candidates.push(...ctx.unitTargets);

    const aimInside = aim !== undefined && isAimInsideAttackRange(this.attacker, aim);
    this.view.showRange(ctx.myPosition, hero.attackRange + hero.radius, this.heldSent, aimInside);
    this.view.showTarget(chooseAttackTarget(this.attacker, this.candidates, aim), ctx.frameMs);
  }

  private syncAttack(tapped: boolean, held: boolean, aim: Vec2 | undefined, now: number) {
    if (tapped && !held && !this.heldSent) this.send(true, aim, now);
    if (held !== this.heldSent) this.send(held, aim, now);
    else if (held && this.aimMoved(aim, now)) this.send(true, aim, now);
  }

  private aimMoved(aim: Vec2 | undefined, now: number): boolean {
    if (!aim || now - this.lastSentAt < AIM_RESEND_MS) return false;
    return !this.sentAim || distanceSq(aim, this.sentAim) >= AIM_RESEND_MIN_DISTANCE_SQ;
  }

  private send(held: boolean, aim: Vec2 | undefined, now: number) {
    this.heldSent = held;
    this.sentAim = aim;
    this.lastSentAt = now;
    const message: AttackMessage = aim ? { held, aim } : { held };
    this.services.connection.send(Message.Attack, message);
  }
}
