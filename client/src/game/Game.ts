import {
  ARENA,
  INTERPOLATION_DELAY_MS,
  Message,
  TICK_MS,
  UNIT_STATS,
  bushIndexAt,
  getHero,
  getSkill,
  type CombatEvent,
  type HeroId,
  type MatchPhase,
  type PickHeroMessage,
  type SkillSlot,
  type SnapshotMessage,
  type TargetCandidate,
  type Team,
  type Vec2,
  type VisiblePlayer,
  type VisibleUnit,
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
import { UnitViews } from "../render/UnitViews.js";
import { AttackTargeting } from "./AttackTargeting.js";
import { SkillCasting } from "./SkillCasting.js";
import type { FrameContext, GameServices, VisibleEnemy } from "./FrameContext.js";
import { LocalPredictor } from "./LocalPredictor.js";
import { SnapshotBuffer } from "./SnapshotBuffer.js";
import type { Hud } from "../ui/Hud.js";
import { CombatFeedback } from "../ui/CombatFeedback.js";
import { GameInfo } from "../ui/GameInfo.js";
import { HeroInfoButton } from "../ui/HeroInfoButton.js";
import { Minimap, type MinimapUnit } from "../ui/Minimap.js";
import { MatchHud } from "../ui/MatchHud.js";
import { QuitButton } from "../ui/QuitButton.js";
import { SpectatorHud } from "../ui/SpectatorHud.js";
import { SpectatorCamera } from "./SpectatorCamera.js";

const MAX_TICKS_PER_FRAME = 5;
const PING_INTERVAL_MS = 1000;
const HUD_UPDATE_MS = 250;
const MIN_BOLT_RANGE = 150;
const IDLE_DIRECTION = { x: 0, y: 0 };
const SEAT_COLORS = ["#5dffa0", "#ff5a5a"];
const UNIT_ALLY_COLOR = 0x5dffa0;
const UNIT_ENEMY_COLOR = 0xff5a5a;

export class Game {
  private readonly views = new Map<string, HeroView>();
  private readonly snapshots = new SnapshotBuffer();
  private readonly visionFog = new VisionFog(ARENA);
  private readonly arena: ArenaView;
  private readonly minimap = new Minimap(ARENA);
  private readonly effects = new AttackEffects();
  private readonly skillEffects = new SkillEffects();
  private readonly unitViews = new UnitViews();
  private readonly heroIds = new Map<string, HeroId>();
  private readonly viewPosition: PositionLookup = (id) => {
    const view = this.views.get(id);
    if (!view) return this.unitViews.position(id);
    return view.root.visible ? { x: view.root.position.x, y: view.root.position.z } : undefined;
  };
  private readonly isAllyTeam = (team: Team) => (this.spectating ? team === 0 : team === this.myTeam);
  private myTeam: Team | undefined;
  private units: readonly VisibleUnit[] = [];
  private readonly services: GameServices;
  private readonly attackTargeting: AttackTargeting;
  private readonly skillCasting: SkillCasting;
  private readonly combatFeedback: CombatFeedback;
  private readonly matchHud: MatchHud;
  private readonly gameInfo = new GameInfo();
  private readonly heroInfoButton = new HeroInfoButton();
  private readonly isAllySide = (playerId: string) =>
    this.spectating ? this.seatIds.indexOf(playerId) === 0 : playerId === this.connection.sessionId;
  private matchPhase: MatchPhase | undefined;
  private spectating = false;
  private spectatorHud: SpectatorHud | undefined;
  private readonly spectatorCamera: SpectatorCamera;
  private seatIds: string[] = [];
  private resyncPending = false;
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
    this.matchHud = new MatchHud(
      () => connection.send(Message.Rematch, {}),
      () => void this.backToMenu(),
    );
    new QuitButton(
      () => void this.backToMenu(),
      () => !this.spectating && (this.matchPhase === "countdown" || this.matchPhase === "playing"),
    );
    this.spectatorCamera = new SpectatorCamera(scene, keyboard, ARENA);
    connection.onStatus((status) => {
      if (status === "connected") this.resyncPending = true;
    });

    this.arena = createArenaView(ARENA, this.visionFog);
    scene.add(this.arena.root);
    scene.add(this.effects.root);
    scene.add(this.skillEffects.root);
    scene.add(this.unitViews.root);

    connection.on<SnapshotMessage>(Message.Snapshot, (snapshot) => this.onSnapshot(snapshot));
    connection.on<number>(Message.Pong, (sentAt) => (this.pingMs = performance.now() - sentAt));
    connection.onLeave(() => hud.setStatus("Disconnected from server. Refresh to rejoin."));

    setInterval(() => connection.send(Message.Ping, performance.now()), PING_INTERVAL_MS);

    scene.onFrame((frameMs) => this.frame(frameMs));
  }

  private predictLocalCast(slot: SkillSlot, aim: Vec2) {
    if (!this.predictor || !this.myHeroId || this.inputLocked) return;
    this.predictor.predictCast(getSkill(getHero(this.myHeroId).skills[slot]), aim);
  }

  private async backToMenu() {
    await this.connection.leave();
    location.assign(location.pathname);
  }

  pickHero(heroId: HeroId) {
    const message: PickHeroMessage = { heroId };
    this.connection.send(Message.PickHero, message);
  }

  private onSnapshot(snapshot: SnapshotMessage) {
    if (snapshot.spectating && !this.spectating) this.enterSpectatorMode();
    this.seatIds = snapshot.roster.map((entry) => entry.id);
    this.snapshots.push(snapshot, performance.now());
    this.syncViews(snapshot);
    this.myTeam = snapshot.roster.find((entry) => entry.id === this.connection.sessionId)?.team;
    this.units = snapshot.units ?? [];
    if (this.spectating || this.myTeam !== undefined) this.unitViews.sync(this.units, this.isAllyTeam);

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
    this.matchHud.update(snapshot.match, {
      myId: this.connection.sessionId,
      spectating: this.spectating,
      playersInRoom: snapshot.playersInRoom,
      heroName: (id) => {
        const heroId = this.heroIds.get(id);
        return heroId ? getHero(heroId).name : "";
      },
    });
    this.gameInfo.update(snapshot.match, snapshot.roster, this.isAllySide);
    const previousPhase = this.matchPhase;
    this.matchPhase = snapshot.match?.phase;
    const matchRestarted = this.matchPhase === "countdown" && previousPhase !== "countdown";
    if (this.spectating) {
      this.updateSpectatorHud(snapshot);
      return;
    }

    const me = snapshot.visible.find((player) => player.id === this.connection.sessionId);
    const myEntry = snapshot.roster.find((entry) => entry.id === this.connection.sessionId);
    if (!me || !myEntry) return;
    this.me = me;
    this.hud.setHealth(me.hp, getHero(myEntry.heroId).maxHp);

    const position = { x: me.x, y: me.y };
    if (!this.predictor) {
      this.myHeroId = myEntry.heroId;
      this.heroInfoButton.setHero(myEntry.heroId);
      this.predictor = new LocalPredictor(position, getHero(myEntry.heroId));
      this.visionFog.setRadius(getHero(myEntry.heroId).visionRange);
    } else if (me.hp === 0) {
      if (!this.dead) this.visionFog.setRadius(0);
      this.dead = true;
    } else if (this.dead) {
      this.dead = false;
      this.predictor.teleport(position);
      this.visionFog.setRadius(getHero(myEntry.heroId).visionRange);
    } else if (matchRestarted || this.resyncPending) {
      this.resyncPending = false;
      this.accumulatorMs = 0;
      this.predictor.teleport(position);
    } else {
      this.predictor.reconcile(position, me.lastInputSeq, me.statuses);
    }
  }

  private syncHealth(visible: VisiblePlayer[]) {
    for (const player of visible) {
      const heroId = this.heroIds.get(player.id);
      const view = this.views.get(player.id);
      if (heroId) view?.setHealth(player.hp / getHero(heroId).maxHp);
      view?.setProtected((player.statuses?.protectedTicks ?? 0) > 0);
    }
  }

  private onCombatEvent(event: CombatEvent) {
    if (event.kind === "skillHit" && event.damage > 0) this.flash(event.targetId);
    if (event.kind !== "hit") return;
    const heroId = this.heroIds.get(event.attackerId);
    if (heroId) {
      const hero = getHero(heroId);
      const style = hero.attackRange >= MIN_BOLT_RANGE ? "bolt" : "slash";
      this.effects.spawn(style, event.attackerId, event.targetId, hero.visual.color, this.viewPosition);
    } else {
      const unit = this.units.find((candidate) => candidate.id === event.attackerId);
      if (!unit) return;
      const color = this.isAllyTeam(unit.team) ? UNIT_ALLY_COLOR : UNIT_ENEMY_COLOR;
      this.effects.spawn(unit.kind === "turret" || unit.kind === "base" ? "bolt" : "slash", event.attackerId, event.targetId, color, this.viewPosition);
    }
    this.flash(event.targetId);
    this.alertStructureRange(event.attackerId, event.targetId);
  }

  private alertStructureRange(attackerId: string, targetId: string) {
    if (this.isStructure(targetId)) this.unitViews.alertRange(targetId);
    if (this.isStructure(attackerId) && this.heroIds.has(targetId)) this.unitViews.alertRange(attackerId);
  }

  private isStructure(id: string): boolean {
    const kind = this.units.find((unit) => unit.id === id)?.kind;
    return kind === "turret" || kind === "base";
  }

  private flash(targetId: string) {
    const view = this.views.get(targetId);
    if (view) view.flash();
    else this.unitViews.flash(targetId);
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
      const view = this.heroRenderer.create(getHero(entry.heroId), this.isAllySide(entry.id), entry.name);
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

    for (const id of this.unitViews.ids()) {
      this.unitViews.update(id, this.snapshots.positionAt(id, now, INTERPOLATION_DELAY_MS), frameMs);
    }

    const ctx: FrameContext = {
      now,
      frameMs,
      myId: this.connection.sessionId,
      myHeroId: this.myHeroId,
      myPosition,
      me: this.me,
      dead: this.dead,
      spectating: this.spectating,
      inputLocked: this.inputLocked || this.spectating,
      enemies,
      unitTargets: this.unitTargets(),
      viewPosition: this.viewPosition,
    };
    if (this.spectating) {
      this.updateSpectatorView(ctx);
    } else {
      this.updateConcealment(ctx);
      this.attackTargeting.frame(ctx);
      this.skillCasting.frame(ctx);
    }
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
      units: this.minimapUnits(),
      visibleArea: ctx.dead ? undefined : this.visionFog.visibleArea(),
    });
  }

  private unitTargets(): TargetCandidate[] {
    const targets: TargetCandidate[] = [];
    for (const unit of this.units) {
      if (this.isAllyTeam(unit.team)) continue;
      if (unit.kind === "base" && this.units.some((other) => other.kind === "turret" && other.team === unit.team)) continue;
      const position = this.unitViews.position(unit.id);
      if (position) targets.push({ id: unit.id, position, radius: UNIT_STATS[unit.kind].radius });
    }
    return targets;
  }

  private minimapUnits(): MinimapUnit[] {
    return this.units.map((unit) => ({
      position: unit,
      ally: this.isAllyTeam(unit.team),
      structure: unit.kind === "base" || unit.kind === "turret",
    }));
  }

  private enterSpectatorMode() {
    this.spectating = true;
    this.visionFog.disable();
    this.arena.bushes.setSeeThrough(true);
    this.spectatorCamera.activate();
    this.spectatorHud = new SpectatorHud();
  }

  private updateSpectatorView(ctx: FrameContext) {
    const positions = new Map(ctx.enemies.map((player) => [player.id, player.position]));
    this.spectatorCamera.update(ctx.frameMs, this.seatIds.map((id) => positions.get(id)));

    for (const player of ctx.enemies) {
      this.views.get(player.id)?.setConcealed(bushIndexAt(ARENA, player.position) !== -1);
    }
    this.minimap.update({
      now: ctx.now,
      myPosition: undefined,
      hiddenInBush: false,
      enemies: ctx.enemies.map((player) => ({
        position: player.position,
        color: this.seatColor(player.id),
        hiddenInBush: bushIndexAt(ARENA, player.position) !== -1,
      })),
      units: this.minimapUnits(),
      visibleArea: undefined,
      fullView: true,
    });
  }

  private updateSpectatorHud(snapshot: SnapshotMessage) {
    const players = this.seatIds.map((id) => {
      const heroId = this.heroIds.get(id);
      const player = snapshot.visible.find((visible) => visible.id === id);
      if (!heroId) return undefined;
      const hero = getHero(heroId);
      return { name: hero.name, color: this.seatColor(id), hp: player?.hp ?? 0, maxHp: hero.maxHp, down: !player };
    });
    this.spectatorHud?.update({
      spectators: snapshot.spectators ?? 1,
      players: [players[0], players[1]],
      followed: this.spectatorCamera.followedIndex,
    });
  }

  private seatColor(id: string): string {
    return SEAT_COLORS[this.seatIds.indexOf(id)] ?? SEAT_COLORS[1];
  }

  private localPosition(tickAlpha: number, frameMs: number): Vec2 | undefined {
    return this.dead ? undefined : this.predictor?.renderPosition(tickAlpha, frameMs);
  }

  private get gameplayFrozen(): boolean {
    return this.matchPhase === "countdown" || this.matchPhase === "ended";
  }

  private get inputLocked(): boolean {
    return this.dead || this.gameplayFrozen || this.connection.connectionStatus !== "connected";
  }

  private stepSimulation(frameMs: number) {
    if (!this.predictor) return;

    if (this.dead || this.connection.connectionStatus !== "connected") {
      this.accumulatorMs = 0;
      return;
    }

    this.accumulatorMs += frameMs;
    let ticks = 0;
    while (this.accumulatorMs >= TICK_MS && ticks < MAX_TICKS_PER_FRAME) {
      const input = this.predictor.predict(this.gameplayFrozen ? IDLE_DIRECTION : this.keyboard.moveDirection());
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
    if (this.spectating) {
      const latest = this.snapshots.latest();
      if (!latest || latest.playersInRoom < 2) return "Spectating — waiting for a second player…";
      if (latest.roster.length < latest.playersInRoom) return "Spectating — players are choosing heroes…";
      return "Spectating the match.";
    }
    if (!this.myHeroId) return "Choose your hero.";

    const you = `You are ${getHero(this.myHeroId).name}.`;
    const latest = this.snapshots.latest();
    if (!latest || latest.playersInRoom < 2) return `${you} Waiting for opponent… share the room code or link.`;
    if (latest.roster.length < 2) return `${you} Opponent is choosing a hero…`;
    if (this.connection.connectionStatus !== "connected") return `${you} Connection lost — reconnecting…`;
    if (this.matchPhase === "countdown") return `${you} Get ready…`;
    if (this.matchPhase === "ended") return `${you} Match over.`;
    return `${you} WASD move · Space / left click attack · hold Z/X/C + left click to cast · hold right click to aim skill 1, release to cast · hold Tab for game info.`;
  }
}
