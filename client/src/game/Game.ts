import {
  ARENA,
  INTERPOLATION_DELAY_MS,
  Message,
  TICK_MS,
  bushIndexAt,
  getHero,
  getSkill,
  type CombatEvent,
  type HeroId,
  type PickHeroMessage,
  type SkillSlot,
  type SnapshotMessage,
  type Vec2,
  type VisiblePlayer,
} from "@moba/shared";
import type { Connection } from "../net/Connection.js";
import type { Keyboard } from "../input/keyboard.js";
import type { Pointer } from "../input/Pointer.js";
import type { HeroRenderer, HeroView } from "../render/HeroRenderer.js";
import type { SceneRenderer } from "../render/SceneRenderer.js";
import { createArenaView, type ArenaView } from "../render/ArenaView.js";
import { VisionFog } from "../render/VisionFog.js";
import { AttackEffects, type PositionLookup } from "../render/AttackEffects.js";
import { SkillEffects } from "../render/SkillEffects.js";
import { AttackTargeting } from "./AttackTargeting.js";
import { SkillCasting } from "./SkillCasting.js";
import type { FrameContext, GameServices, VisibleEnemy } from "./FrameContext.js";
import { LocalPredictor } from "./LocalPredictor.js";
import { SnapshotBuffer } from "./SnapshotBuffer.js";
import type { Hud } from "../ui/Hud.js";
import { CombatFeedback } from "../ui/CombatFeedback.js";
import { Minimap } from "../ui/Minimap.js";

const MAX_TICKS_PER_FRAME = 5;
const PING_INTERVAL_MS = 1000;
const HUD_UPDATE_MS = 250;
const MIN_BOLT_RANGE = 150;

export class Game {
  private readonly views = new Map<string, HeroView>();
  private readonly snapshots = new SnapshotBuffer();
  private readonly visionFog = new VisionFog(ARENA);
  private readonly arena: ArenaView;
  private readonly minimap = new Minimap(ARENA);
  private readonly effects = new AttackEffects();
  private readonly skillEffects = new SkillEffects();
  private readonly heroIds = new Map<string, HeroId>();
  private readonly viewPosition: PositionLookup = (id) => {
    const view = this.views.get(id);
    return view?.root.visible ? { x: view.root.position.x, y: view.root.position.z } : undefined;
  };
  private readonly services: GameServices;
  private readonly attackTargeting: AttackTargeting;
  private readonly skillCasting: SkillCasting;
  private readonly combatFeedback: CombatFeedback;
  private predictor: LocalPredictor | undefined;
  private myHeroId: HeroId | undefined;
  private me: VisiblePlayer | undefined;
  private dead = false;
  private accumulatorMs = 0;
  private pingMs: number | undefined;
  private fps = 0;
  private lastHudUpdate = 0;

  constructor(
    private readonly scene: SceneRenderer,
    private readonly connection: Connection,
    private readonly keyboard: Keyboard,
    pointer: Pointer,
    private readonly heroRenderer: HeroRenderer,
    private readonly hud: Hud,
  ) {
    this.services = {
      connection,
      keyboard,
      pointer,
      scene,
      hud,
      predictLocalCast: (slot, aim) => this.predictLocalCast(slot, aim),
    };
    this.attackTargeting = new AttackTargeting(this.services);
    this.skillCasting = new SkillCasting(this.services);
    this.combatFeedback = new CombatFeedback(this.services);

    this.arena = createArenaView(ARENA, this.visionFog);
    scene.add(this.arena.root);
    scene.add(this.effects.root);
    scene.add(this.skillEffects.root);

    connection.on<SnapshotMessage>(Message.Snapshot, (snapshot) => this.onSnapshot(snapshot));
    connection.on<number>(Message.Pong, (sentAt) => (this.pingMs = performance.now() - sentAt));
    connection.onLeave(() => hud.setStatus("Disconnected from server. Refresh to rejoin."));

    setInterval(() => connection.send(Message.Ping, performance.now()), PING_INTERVAL_MS);

    scene.onFrame((frameMs) => this.frame(frameMs));
  }

  private predictLocalCast(slot: SkillSlot, aim: Vec2) {
    if (!this.predictor || !this.myHeroId || this.dead) return;
    this.predictor.predictCast(getSkill(getHero(this.myHeroId).skills[slot]), aim);
  }

  pickHero(heroId: HeroId) {
    const message: PickHeroMessage = { heroId };
    this.connection.send(Message.PickHero, message);
  }

  private onSnapshot(snapshot: SnapshotMessage) {
    this.snapshots.push(snapshot, performance.now());
    this.syncViews(snapshot);

    this.syncHealth(snapshot.visible);
    for (const event of snapshot.events ?? []) this.onCombatEvent(event);
    const snapshotContext = {
      myId: this.connection.sessionId,
      heroIds: this.heroIds,
      snapshot,
      viewPosition: this.viewPosition,
    };
    this.skillEffects.onSnapshot(snapshotContext);
    this.combatFeedback.onSnapshot(snapshotContext);

    const me = snapshot.visible.find((player) => player.id === this.connection.sessionId);
    const myEntry = snapshot.roster.find((entry) => entry.id === this.connection.sessionId);
    if (!me || !myEntry) return;
    this.me = me;
    this.hud.setHealth(me.hp, getHero(myEntry.heroId).maxHp);

    const position = { x: me.x, y: me.y };
    if (!this.predictor) {
      this.myHeroId = myEntry.heroId;
      this.predictor = new LocalPredictor(position, getHero(myEntry.heroId));
      this.visionFog.setRadius(getHero(myEntry.heroId).visionRange);
    } else if (me.hp === 0) {
      if (!this.dead) this.visionFog.setRadius(0);
      this.dead = true;
    } else if (this.dead) {
      this.dead = false;
      this.predictor.teleport(position);
      this.visionFog.setRadius(getHero(myEntry.heroId).visionRange);
    } else {
      this.predictor.reconcile(position, me.lastInputSeq, me.statuses);
    }
  }

  private syncHealth(visible: VisiblePlayer[]) {
    for (const player of visible) {
      const heroId = this.heroIds.get(player.id);
      if (heroId) this.views.get(player.id)?.setHealth(player.hp / getHero(heroId).maxHp);
    }
  }

  private onCombatEvent(event: CombatEvent) {
    if (event.kind === "skillHit" && event.damage > 0) this.views.get(event.targetId)?.flash();
    if (event.kind !== "hit") return;
    const heroId = this.heroIds.get(event.attackerId);
    if (!heroId) return;

    const hero = getHero(heroId);
    const style = hero.attackRange >= MIN_BOLT_RANGE ? "bolt" : "slash";
    this.effects.spawn(style, event.attackerId, event.targetId, hero.visual.color, this.viewPosition);
    this.views.get(event.targetId)?.flash();
  }

  private syncViews(snapshot: SnapshotMessage) {
    const present = new Set(snapshot.roster.map((entry) => entry.id));

    for (const [id, view] of this.views) {
      if (present.has(id)) continue;
      view.destroy();
      this.views.delete(id);
      this.heroIds.delete(id);
    }

    for (const entry of snapshot.roster) {
      this.heroIds.set(entry.id, entry.heroId);
      if (this.views.has(entry.id)) continue;
      const view = this.heroRenderer.create(getHero(entry.heroId), entry.id === this.connection.sessionId);
      view.setVisible(false);
      this.views.set(entry.id, view);
      this.scene.add(view.root);
    }
  }

  private frame(frameMs: number) {
    this.stepSimulation(frameMs);

    const now = performance.now();
    const tickAlpha = this.accumulatorMs / TICK_MS;
    let myPosition: Vec2 | undefined;
    const enemies: VisibleEnemy[] = [];

    for (const [id, view] of this.views) {
      const isLocal = id === this.connection.sessionId;
      const position = isLocal
        ? this.localPosition(tickAlpha, frameMs)
        : this.snapshots.positionAt(id, now, INTERPOLATION_DELAY_MS);
      view.setVisible(position !== undefined);
      if (!position) continue;

      view.update(position, frameMs);
      if (isLocal) {
        myPosition = position;
        this.scene.follow(position);
        this.visionFog.setCenter(position);
      } else {
        const heroId = this.heroIds.get(id);
        if (heroId) enemies.push({ id, heroId, position });
      }
    }

    const ctx: FrameContext = {
      now,
      frameMs,
      myId: this.connection.sessionId,
      myHeroId: this.myHeroId,
      myPosition,
      me: this.me,
      dead: this.dead,
      enemies,
      viewPosition: this.viewPosition,
    };
    this.updateConcealment(ctx);
    this.attackTargeting.frame(ctx);
    this.skillCasting.frame(ctx);
    this.combatFeedback.frame(ctx);

    this.effects.update(frameMs, this.viewPosition);
    this.skillEffects.update(frameMs, this.viewPosition);
    this.scene.render();

    this.fps += (1000 / Math.max(frameMs, 1) - this.fps) * 0.05;
    if (now - this.lastHudUpdate >= HUD_UPDATE_MS) {
      this.lastHudUpdate = now;
      this.updateHud();
    }
  }

  private updateConcealment(ctx: FrameContext) {
    const bush = ctx.myPosition ? bushIndexAt(ARENA, ctx.myPosition) : -1;
    this.arena.bushes.setOccupiedBush(bush);
    this.views.get(ctx.myId)?.setConcealed(bush !== -1);
    this.minimap.update({
      now: ctx.now,
      myPosition: ctx.myPosition,
      hiddenInBush: bush !== -1,
      enemies: ctx.enemies,
      visibleArea: ctx.dead ? undefined : this.visionFog.visibleArea(),
    });
  }

  private localPosition(tickAlpha: number, frameMs: number): Vec2 | undefined {
    return this.dead ? undefined : this.predictor?.renderPosition(tickAlpha, frameMs);
  }

  private stepSimulation(frameMs: number) {
    if (!this.predictor) return;

    if (this.dead) {
      this.accumulatorMs = 0;
      return;
    }

    this.accumulatorMs += frameMs;
    let ticks = 0;
    while (this.accumulatorMs >= TICK_MS && ticks < MAX_TICKS_PER_FRAME) {
      const input = this.predictor.predict(this.keyboard.moveDirection());
      this.connection.send(Message.Input, input);
      this.accumulatorMs -= TICK_MS;
      ticks++;
    }
    if (ticks === MAX_TICKS_PER_FRAME) this.accumulatorMs = 0;
  }

  private updateHud() {
    this.hud.setStatus(this.statusText());
    if (this.me) {
      this.hud.setRespawnCountdown(
        this.me.respawnTicks === undefined ? null : Math.ceil((this.me.respawnTicks * TICK_MS) / 1000),
      );
    }
    this.hud.setStats(
      `ping ${this.pingMs === undefined ? "–" : Math.round(this.pingMs)} ms · ` +
        `fps ${Math.round(this.fps)} · ` +
        `unacked ${this.predictor?.pendingCount ?? 0} · ` +
        this.scene.graphicsLabel,
    );
  }

  private statusText(): string {
    if (!this.myHeroId) return "Choose your hero.";

    const you = `You are ${getHero(this.myHeroId).name}.`;
    const latest = this.snapshots.latest();
    if (!latest || latest.playersInRoom < 2) return `${you} Waiting for opponent… share the room code or link.`;
    if (latest.roster.length < 2) return `${you} Opponent is choosing a hero…`;
    return `${you} WASD move · Space/J attack · hold Q/E/R + left click to cast.`;
  }
}
