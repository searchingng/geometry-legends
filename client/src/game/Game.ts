import {
  ARENA,
  INTERPOLATION_DELAY_MS,
  Message,
  TICK_MS,
  getHero,
  type SnapshotMessage,
  type WelcomeMessage,
} from "@moba/shared";
import type { Connection } from "../net/Connection.js";
import type { Keyboard } from "../input/keyboard.js";
import type { HeroRenderer, HeroView } from "../render/HeroRenderer.js";
import type { SceneRenderer } from "../render/SceneRenderer.js";
import { createArenaView } from "../render/ArenaView.js";
import { LocalPredictor } from "./LocalPredictor.js";
import { SnapshotBuffer } from "./SnapshotBuffer.js";
import type { Hud } from "../ui/Hud.js";

const MAX_TICKS_PER_FRAME = 5;
const PING_INTERVAL_MS = 1000;
const HUD_UPDATE_MS = 250;

export class Game {
  private readonly views = new Map<string, HeroView>();
  private readonly snapshots = new SnapshotBuffer();
  private predictor: LocalPredictor | undefined;
  private welcome: WelcomeMessage | undefined;
  private accumulatorMs = 0;
  private pingMs: number | undefined;
  private fps = 0;
  private lastHudUpdate = 0;

  constructor(
    private readonly scene: SceneRenderer,
    private readonly connection: Connection,
    private readonly keyboard: Keyboard,
    private readonly heroRenderer: HeroRenderer,
    private readonly hud: Hud,
  ) {
    scene.add(createArenaView(ARENA));

    connection.on<WelcomeMessage>(Message.Welcome, (welcome) => (this.welcome = welcome));
    connection.on<SnapshotMessage>(Message.Snapshot, (snapshot) => this.onSnapshot(snapshot));
    connection.on<number>(Message.Pong, (sentAt) => (this.pingMs = performance.now() - sentAt));
    connection.onLeave(() => hud.setStatus("Disconnected from server. Refresh to rejoin."));

    setInterval(() => connection.send(Message.Ping, performance.now()), PING_INTERVAL_MS);

    scene.onFrame((frameMs) => this.frame(frameMs));
  }

  private onSnapshot(snapshot: SnapshotMessage) {
    this.snapshots.push(snapshot, performance.now());
    this.syncViews(snapshot);

    const me = snapshot.players.find((player) => player.id === this.connection.sessionId);
    if (!me) return;

    if (!this.predictor) {
      this.predictor = new LocalPredictor({ x: me.x, y: me.y }, getHero(me.heroId));
    } else {
      this.predictor.reconcile({ x: me.x, y: me.y }, me.lastInputSeq);
    }
  }

  private syncViews(snapshot: SnapshotMessage) {
    const present = new Set(snapshot.players.map((player) => player.id));

    for (const [id, view] of this.views) {
      if (present.has(id)) continue;
      view.destroy();
      this.views.delete(id);
    }

    for (const player of snapshot.players) {
      if (this.views.has(player.id)) continue;
      const view = this.heroRenderer.create(getHero(player.heroId), player.id === this.connection.sessionId);
      this.views.set(player.id, view);
      this.scene.add(view.root);
    }
  }

  private frame(frameMs: number) {
    this.stepSimulation(frameMs);

    const now = performance.now();
    const tickAlpha = this.accumulatorMs / TICK_MS;

    for (const [id, view] of this.views) {
      const isLocal = id === this.connection.sessionId;
      const position = isLocal
        ? this.predictor?.renderPosition(tickAlpha, frameMs)
        : this.snapshots.positionAt(id, now, INTERPOLATION_DELAY_MS);
      if (!position) continue;

      view.update(position, frameMs);
      if (isLocal) this.scene.follow(position);
    }

    this.scene.render();

    this.fps += (1000 / Math.max(frameMs, 1) - this.fps) * 0.05;
    if (now - this.lastHudUpdate >= HUD_UPDATE_MS) {
      this.lastHudUpdate = now;
      this.updateHud();
    }
  }

  private stepSimulation(frameMs: number) {
    if (!this.predictor) return;

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
    const playerCount = this.snapshots.latest()?.players.length ?? 0;
    const heroName = this.welcome ? getHero(this.welcome.heroId).name : "…";

    this.hud.setStatus(
      playerCount < 2
        ? `You are ${heroName}. Waiting for opponent… share the room code or link.`
        : `You are ${heroName}. Move with WASD / arrow keys.`,
    );
    this.hud.setStats(
      `ping ${this.pingMs === undefined ? "–" : Math.round(this.pingMs)} ms · ` +
        `fps ${Math.round(this.fps)} · ` +
        `unacked ${this.predictor?.pendingCount ?? 0} · ` +
        this.scene.graphicsLabel,
    );
  }
}
