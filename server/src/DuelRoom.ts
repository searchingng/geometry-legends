import { Room, type Client } from "colyseus";
import {
  ARENA,
  HERO_IDS,
  INPUT_BUFFER_TICKS,
  MAX_QUEUED_INPUTS,
  Message,
  TICK_DT,
  TICK_MS,
  getHero,
  isValidMoveInput,
  stepMovement,
  type HeroId,
  type MoveInput,
  type SnapshotMessage,
  type Vec2,
  type WelcomeMessage,
} from "@moba/shared";
import { allocateRoomCode } from "./roomCode.js";

const LOOP_INTERVAL_MS = 4;
const MAX_CATCH_UP_MS = 250;

interface ServerPlayer {
  id: string;
  slot: 0 | 1;
  heroId: HeroId;
  position: Vec2;
  inputQueue: MoveInput[];
  awaitingInputBuffer: boolean;
  lastQueuedSeq: number;
  lastProcessedSeq: number;
}

export class DuelRoom extends Room {
  maxClients = 2;

  private readonly players = new Map<string, ServerPlayer>();
  private tick = 0;
  private lastLoopAt = performance.now();
  private accumulatorMs = 0;

  onCreate(options: { roomCode?: unknown }) {
    this.roomId = allocateRoomCode(options.roomCode);
    this.onMessage(Message.Input, (client, input: unknown) => this.queueInput(client, input));
    this.onMessage(Message.Ping, (client, sentAt: unknown) => client.send(Message.Pong, sentAt));
    this.setSimulationInterval(() => this.loop(), LOOP_INTERVAL_MS);
  }

  onJoin(client: Client) {
    const slot = this.freeSlot();
    const player: ServerPlayer = {
      id: client.sessionId,
      slot,
      heroId: HERO_IDS[slot % HERO_IDS.length],
      position: { ...ARENA.spawns[slot] },
      inputQueue: [],
      awaitingInputBuffer: true,
      lastQueuedSeq: 0,
      lastProcessedSeq: 0,
    };
    this.players.set(client.sessionId, player);

    const welcome: WelcomeMessage = { playerId: player.id, heroId: player.heroId };
    client.send(Message.Welcome, welcome);
  }

  onLeave(client: Client) {
    this.players.delete(client.sessionId);
  }

  private freeSlot(): 0 | 1 {
    const taken = new Set([...this.players.values()].map((player) => player.slot));
    return taken.has(0) ? 1 : 0;
  }

  private queueInput(client: Client, input: unknown) {
    const player = this.players.get(client.sessionId);
    if (!player || !isValidMoveInput(input) || input.seq <= player.lastQueuedSeq) return;
    if (player.inputQueue.length >= MAX_QUEUED_INPUTS) return;

    player.lastQueuedSeq = input.seq;
    player.inputQueue.push(input);
  }

  private loop() {
    const now = performance.now();
    this.accumulatorMs = Math.min(this.accumulatorMs + now - this.lastLoopAt, MAX_CATCH_UP_MS);
    this.lastLoopAt = now;

    while (this.accumulatorMs >= TICK_MS) {
      this.accumulatorMs -= TICK_MS;
      this.update();
    }
  }

  private update() {
    for (const player of this.players.values()) {
      const hero = getHero(player.heroId);
      for (const input of this.takeInputs(player)) {
        player.position = stepMovement(player.position, input, hero, ARENA, TICK_DT);
        player.lastProcessedSeq = input.seq;
      }
    }

    this.tick++;
    this.broadcast(Message.Snapshot, this.snapshot());
  }

  private takeInputs(player: ServerPlayer): MoveInput[] {
    const queue = player.inputQueue;

    if (player.awaitingInputBuffer) {
      if (queue.length < INPUT_BUFFER_TICKS) return [];
      player.awaitingInputBuffer = false;
    }

    if (queue.length === 0) {
      player.awaitingInputBuffer = true;
      return [];
    }

    const catchingUp = queue.length > INPUT_BUFFER_TICKS + 1;
    return queue.splice(0, catchingUp ? 2 : 1);
  }

  private snapshot(): SnapshotMessage {
    return {
      tick: this.tick,
      players: [...this.players.values()].map((player) => ({
        id: player.id,
        heroId: player.heroId,
        x: player.position.x,
        y: player.position.y,
        lastInputSeq: player.lastProcessedSeq,
      })),
    };
  }
}
