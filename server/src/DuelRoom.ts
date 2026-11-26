import { Room, type AuthContext, type Client } from "colyseus";
import {
  ALREADY_IN_ROOM,
  ARENA,
  INPUT_BUFFER_TICKS,
  MAX_PLAYERS,
  MAX_QUEUED_INPUTS,
  MAX_SPECTATORS,
  Message,
  PICK_HERO_TIMEOUT_MS,
  PICK_TIMEOUT_CLOSE_CODE,
  RECONNECT_WINDOW_SECONDS,
  RESPAWN_MS,
  USERNAME_TAKEN,
  SPAWN_PROTECTION_MS,
  TICK_DT,
  TICK_MS,
  canSeePosition,
  chooseAttackTarget,
  getHero,
  getSkill,
  isAttackMessage,
  isCastSkillMessage,
  isHeroId,
  isUserKey,
  isValidMoveInput,
  normalizeUsername,
  sameUsername,
  shapeHits,
  stepMovement,
  type CastSkillMessage,
  type CombatEvent,
  type HeroId,
  type JoinOptions,
  type RoomSummary,
  type MoveInput,
  type SkillShape,
  type SnapshotMessage,
  type Vec2,
  type VisiblePlayer,
} from "@moba/shared";
import { allocateRoomCode } from "./roomCode.js";
import { VisionSystem } from "./VisionSystem.js";
import {
  canAct,
  createStatus,
  isProtected,
  isStunned,
  moveSpeedFactor,
  resetStatus,
  visibleStatuses,
  type CombatStatus,
} from "./skills/CombatStatus.js";
import {
  SkillSystem,
  dealDamage,
  type DamageResult,
  type PointVisibility,
  type SkillWorld,
  type ZoneVisibility,
} from "./skills/SkillSystem.js";
import { MatchController, type MatchTransition } from "./match/MatchController.js";
import { recordMatch, services } from "./db/services.js";
import { clientIp } from "./http/json.js";

const LOOP_INTERVAL_MS = 4;
const MAX_CATCH_UP_MS = 250;
const RESPAWN_TICKS = Math.round(RESPAWN_MS / TICK_MS);
const PROTECTION_TICKS = Math.round(SPAWN_PROTECTION_MS / TICK_MS);
const ATTACKER_REVEAL_TICKS = 30;
const SEQUENCE_RESTART_GAP = 90;
const PICK_TIMEOUT_TICKS = Math.round(PICK_HERO_TIMEOUT_MS / TICK_MS);

export const ROOM_FULL = "Room is full";
export const ROOM_EMPTY = "Room has no players";
export const USERNAME_REQUIRED = "Username is required";

interface PlayerAuth {
  username: string;
}

interface ServerPlayer {
  id: string;
  name: string;
  slot: 0 | 1;
  heroId: HeroId | null;
  connected: boolean;
  position: Vec2;
  hp: number;
  respawnAtTick: number | null;
  nextAttackTick: number;
  attackHeld: boolean;
  attackLatched: boolean;
  attackAim: Vec2 | null;
  inputQueue: MoveInput[];
  awaitingInputBuffer: boolean;
  lastQueuedSeq: number;
  lastProcessedSeq: number;
  status: CombatStatus;
  skillReadyTick: [number, number, number];
  pendingCast: CastSkillMessage | null;
  joinedAtTick: number;
}

type SpawnedPlayer = ServerPlayer & { heroId: HeroId };

interface MatchLineup {
  startedAt: Date;
  players: { id: string; slot: 0 | 1; name: string; heroId: HeroId }[];
}

export class DuelRoom extends Room {
  maxClients = MAX_PLAYERS + MAX_SPECTATORS;

  private readonly players = new Map<string, ServerPlayer>();
  private readonly spectators = new Set<string>();
  private closing = false;
  private metadataKey = "";
  private readonly vision = new VisionSystem();
  private readonly skills = new SkillSystem<SpawnedPlayer>();
  private readonly match = new MatchController();
  private events: CombatEvent[] = [];
  private lineup: MatchLineup | null = null;
  private tick = 0;
  private lastLoopAt = performance.now();
  private accumulatorMs = 0;

  onCreate(options: { roomCode?: unknown }) {
    this.roomId = allocateRoomCode(options.roomCode);
    this.onMessage(Message.PickHero, (client, message: unknown) => this.pickHero(client, message));
    this.onMessage(Message.Input, (client, input: unknown) => this.queueInput(client, input));
    this.onMessage(Message.Attack, (client, message: unknown) => this.setAttack(client, message));
    this.onMessage(Message.CastSkill, (client, message: unknown) => this.queueCast(client, message));
    this.onMessage(Message.Rematch, (client) => this.voteRematch(client));
    this.onMessage(Message.Ping, (client, sentAt: unknown) => client.send(Message.Pong, sentAt));
    this.setSimulationInterval(() => this.loop(), LOOP_INTERVAL_MS);
    this.syncMetadata();
  }

  onAuth(_client: Client, options: JoinOptions | undefined, context: AuthContext): PlayerAuth {
    const username = normalizeUsername(options?.name);
    if (this.joinsAsSpectator(options)) return { username: username ?? "spectator" };
    if (!username) throw new Error(USERNAME_REQUIRED);

    const users = services()?.users;
    if (!users) return { username };
    if (!isUserKey(options?.userKey)) throw new Error(USERNAME_TAKEN);
    const socketIp = Array.isArray(context.ip) ? context.ip[0] : context.ip;
    const result = users.authenticate(username, options.userKey, clientIp(context.headers, socketIp));
    if (!result.ok) throw new Error(USERNAME_TAKEN);
    return { username: result.username };
  }

  onJoin(client: Client<unknown, PlayerAuth>, options?: JoinOptions) {
    if (this.joinsAsSpectator(options)) {
      if (this.players.size === 0) throw new Error(ROOM_EMPTY);
      if (this.spectators.size >= MAX_SPECTATORS) throw new Error(ROOM_FULL);
      this.spectators.add(client.sessionId);
      this.syncMetadata();
      return;
    }

    const name = client.auth?.username ?? "player";
    if ([...this.players.values()].some((player) => sameUsername(player.name, name))) throw new Error(ALREADY_IN_ROOM);

    const slot = this.freeSlot();
    this.players.set(client.sessionId, {
      id: client.sessionId,
      name,
      slot,
      heroId: null,
      connected: true,
      position: { ...ARENA.spawns[slot] },
      hp: 0,
      respawnAtTick: null,
      nextAttackTick: 0,
      attackHeld: false,
      attackLatched: false,
      attackAim: null,
      inputQueue: [],
      awaitingInputBuffer: true,
      lastQueuedSeq: 0,
      lastProcessedSeq: 0,
      status: createStatus(),
      skillReadyTick: [0, 0, 0],
      pendingCast: null,
      joinedAtTick: this.tick,
    });
    this.syncMetadata();
  }

  private joinsAsSpectator(options: JoinOptions | undefined): boolean {
    return options?.spectate === true || this.players.size >= MAX_PLAYERS;
  }

  async onLeave(client: Client, consented?: boolean) {
    if (this.spectators.delete(client.sessionId)) {
      this.syncMetadata();
      return;
    }
    const player = this.players.get(client.sessionId);
    if (!player) return;
    if (consented) {
      this.removePlayer(player.id);
      return;
    }

    player.connected = false;
    player.inputQueue = [];
    player.awaitingInputBuffer = true;
    player.attackHeld = false;
    player.attackLatched = false;
    player.pendingCast = null;
    try {
      await this.allowReconnection(client, RECONNECT_WINDOW_SECONDS);
      player.connected = true;
    } catch {
      this.removePlayer(player.id);
    }
  }

  private removePlayer(playerId: string) {
    this.players.delete(playerId);
    this.vision.clearRevealsInvolving(playerId);
    this.skills.removeActor(playerId);
    this.applyTransition(this.match.forfeit(playerId), this.spawnedPlayers());
    if (this.players.size === 0) this.closeEmptyRoom();
    else this.syncMetadata();
  }

  private removeIdlePickers() {
    for (const player of [...this.players.values()]) {
      if (player.heroId !== null || this.tick - player.joinedAtTick < PICK_TIMEOUT_TICKS) continue;
      const client = this.clients.find((candidate) => candidate.sessionId === player.id);
      this.removePlayer(player.id);
      client?.leave(PICK_TIMEOUT_CLOSE_CODE);
    }
  }

  private closeEmptyRoom() {
    if (this.closing) return;
    this.closing = true;
    void this.disconnect();
  }

  private syncMetadata() {
    const spawned = this.spawnedPlayers();
    const metadata: Omit<RoomSummary, "code" | "maxPlayers"> = {
      players: this.players.size,
      spectators: this.spectators.size,
      phase: this.match.phase,
      heroes: spawned.map((player) => player.heroId),
    };
    const key = JSON.stringify(metadata);
    if (key === this.metadataKey) return;
    this.metadataKey = key;
    void this.setMetadata(metadata);
  }

  private freeSlot(): 0 | 1 {
    const taken = new Set([...this.players.values()].map((player) => player.slot));
    return taken.has(0) ? 1 : 0;
  }

  private pickHero(client: Client, message: unknown) {
    const player = this.players.get(client.sessionId);
    const heroId = (message as { heroId?: unknown } | null)?.heroId;
    if (!player || player.heroId !== null || !isHeroId(heroId)) return;

    player.heroId = heroId;
    player.position = { ...ARENA.spawns[player.slot] };
    player.hp = getHero(heroId).maxHp;
  }

  private queueInput(client: Client, input: unknown) {
    const player = this.players.get(client.sessionId);
    if (!player || player.heroId === null || !isAlive(player) || !isValidMoveInput(input)) return;
    if (input.seq + SEQUENCE_RESTART_GAP < player.lastQueuedSeq || (input.seq === 1 && player.lastQueuedSeq > 1)) {
      restartInputSequence(player);
    }
    if (input.seq <= player.lastQueuedSeq) return;
    if (player.inputQueue.length >= MAX_QUEUED_INPUTS) return;

    player.lastQueuedSeq = input.seq;
    player.inputQueue.push(input);
  }

  private setAttack(client: Client, message: unknown) {
    const player = this.players.get(client.sessionId);
    if (!player || !isAttackMessage(message)) return;

    player.attackHeld = message.held;
    player.attackAim = message.aim ?? null;
    if (message.held) player.attackLatched = true;
  }

  private queueCast(client: Client, message: unknown) {
    const player = this.players.get(client.sessionId);
    if (!player || player.heroId === null || !isCastSkillMessage(message)) return;
    player.pendingCast = { slot: message.slot, aim: { x: message.aim.x, y: message.aim.y } };
  }

  private voteRematch(client: Client) {
    const spawned = this.spawnedPlayers();
    const transition = this.match.voteRematch(client.sessionId, this.tick, spawned.map((player) => player.id));
    this.applyTransition(transition, spawned);
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
    this.removeIdlePickers();
    const spawned = this.spawnedPlayers();
    this.applyTransition(this.match.update(this.tick, spawned.map((player) => player.id)), spawned);

    if (this.match.allowsGameplay) {
      for (const player of spawned) {
        if (player.respawnAtTick !== null && this.tick >= player.respawnAtTick) this.respawn(player);
      }
    }

    for (const player of spawned) {
      if (!isAlive(player)) continue;
      const hero = getHero(player.heroId);
      for (const input of this.takeInputs(player)) {
        player.lastProcessedSeq = input.seq;
        if (!this.match.allowsGameplay || isStunned(player.status, this.tick) || player.status.motion) continue;
        const stats = { radius: hero.radius, moveSpeed: hero.moveSpeed * moveSpeedFactor(player.status, this.tick) };
        player.position = stepMovement(player.position, input, stats, ARENA, TICK_DT);
      }
    }

    if (this.match.allowsGameplay) {
      const world = this.skillWorld(spawned);
      for (const player of spawned) {
        const cast = player.pendingCast;
        player.pendingCast = null;
        if (cast) this.skills.cast(player, cast.slot, cast.aim, world);
      }
      this.skills.update(world);
    }

    for (const player of spawned) {
      if (!player.attackHeld && !player.attackLatched) continue;
      player.attackLatched = false;
      if (this.match.allowsGameplay && isAlive(player) && canAct(player.status, this.tick)) {
        this.tryAttack(player, spawned);
      }
    }
    if (!this.match.allowsGameplay) for (const player of spawned) player.pendingCast = null;

    this.tick++;
    this.vision.prune(this.tick);

    let spectatorSnapshot: SnapshotMessage | undefined;
    for (const client of this.clients) {
      if (this.spectators.has(client.sessionId)) {
        spectatorSnapshot ??= this.spectatorSnapshot(spawned);
        client.send(Message.Snapshot, spectatorSnapshot);
      } else {
        client.send(Message.Snapshot, this.snapshotFor(client.sessionId, spawned));
      }
    }
    this.events = [];
    this.syncMetadata();
  }

  private applyTransition(transition: MatchTransition | null, spawned: SpawnedPlayer[]) {
    if (!transition) return;
    if (transition === "countdown") {
      this.lineup = null;
      this.resetForMatch(spawned);
    }
    if (transition === "playing") {
      this.lineup = {
        startedAt: new Date(),
        players: spawned.map(({ id, slot, name, heroId }) => ({ id, slot, name, heroId })),
      };
      for (const player of spawned) this.protect(player);
    }
    if (transition === "ended") {
      for (const player of spawned) {
        player.pendingCast = null;
        player.attackLatched = false;
      }
      this.saveFinishedMatch();
    }
    this.events.push({ kind: "matchPhase", phase: this.match.phase });
  }

  private saveFinishedMatch() {
    const lineup = this.lineup;
    this.lineup = null;
    if (!lineup || !this.match.endReason) return;
    const scores = this.match.view(this.tick, []).scores;
    recordMatch({
      roomCode: this.roomId,
      startedAt: lineup.startedAt,
      endedAt: new Date(),
      endReason: this.match.endReason,
      players: lineup.players.map((player) => ({
        slot: player.slot,
        username: player.name,
        heroId: player.heroId,
        kills: scores.find((score) => score.id === player.id)?.kills ?? 0,
        won: this.match.winnerId === player.id,
      })),
    });
  }

  private resetForMatch(spawned: SpawnedPlayer[]) {
    this.skills.reset();
    for (const player of spawned) {
      const hero = getHero(player.heroId);
      player.hp = hero.maxHp;
      player.position = { ...ARENA.spawns[player.slot] };
      player.respawnAtTick = null;
      player.nextAttackTick = 0;
      player.attackHeld = false;
      player.attackLatched = false;
      player.pendingCast = null;
      player.skillReadyTick = [0, 0, 0];
      resetStatus(player.status);
      this.vision.clearRevealsInvolving(player.id);
    }
  }

  private protect(player: SpawnedPlayer) {
    player.status.protectedUntilTick = this.tick + PROTECTION_TICKS;
    this.events.push({
      kind: "statusApplied",
      targetId: player.id,
      sourceId: player.id,
      status: "protection",
      durationTicks: PROTECTION_TICKS,
    });
  }

  private tryAttack(attacker: SpawnedPlayer, spawned: SpawnedPlayer[]) {
    if (this.tick < attacker.nextAttackTick) return;

    const hero = getHero(attacker.heroId);
    const reach = {
      position: attacker.position,
      radius: hero.radius,
      attackRange: hero.attackRange,
    };
    const viewer = { ...attacker, visionRange: hero.visionRange };

    const candidates = spawned
      .filter((candidate) => candidate.id !== attacker.id && isAlive(candidate))
      .filter((candidate) => !isProtected(candidate.status, this.tick))
      .filter((candidate) => this.vision.canSee(viewer, candidate))
      .map((candidate) => ({
        id: candidate.id,
        position: candidate.position,
        radius: getHero(candidate.heroId).radius,
        player: candidate,
      }));
    const target = chooseAttackTarget(reach, candidates, attacker.attackAim ?? undefined)?.player;
    if (!target) return;

    attacker.nextAttackTick = this.tick + Math.ceil(hero.attackCooldownMs / TICK_MS);
    attacker.status.protectedUntilTick = 0;
    this.events.push({ kind: "hit", attackerId: attacker.id, targetId: target.id, damage: hero.attackDamage });
    this.damage(target, hero.attackDamage, attacker);
  }

  private damage(target: SpawnedPlayer, amount: number, source: SpawnedPlayer): DamageResult {
    if (isProtected(target.status, this.tick)) return { dealt: 0, absorbed: 0 };
    const result = dealDamage(target, amount, this.tick);
    this.vision.reveal(source.id, target.id, this.tick, ATTACKER_REVEAL_TICKS);
    if (target.hp === 0) this.kill(target, source);
    return result;
  }

  private skillWorld(spawned: SpawnedPlayer[]): SkillWorld<SpawnedPlayer> {
    return {
      tick: this.tick,
      actors: spawned,
      isAlive,
      damage: (target, amount, source) => this.damage(target, amount, source),
      reveal: (targetId, viewerId, ticks) => this.vision.reveal(targetId, viewerId, this.tick, ticks),
      emit: (event) => this.events.push(event),
    };
  }

  private kill(player: SpawnedPlayer, killer: SpawnedPlayer) {
    player.respawnAtTick = this.tick + RESPAWN_TICKS;
    player.inputQueue = [];
    player.awaitingInputBuffer = true;
    player.pendingCast = null;
    resetStatus(player.status);
    this.skills.cancelDash(player.id);
    this.vision.clearRevealsInvolving(player.id);
    this.events.push({ kind: "death", playerId: player.id, killerId: killer.id });
    this.applyTransition(this.match.recordKill(killer.id), this.spawnedPlayers());
  }

  private respawn(player: SpawnedPlayer) {
    player.respawnAtTick = null;
    player.hp = getHero(player.heroId).maxHp;
    player.position = { ...ARENA.spawns[player.slot] };
    player.nextAttackTick = this.tick;
    resetStatus(player.status);
    this.events.push({ kind: "respawn", playerId: player.id });
    this.protect(player);
  }

  private spawnedPlayers(): SpawnedPlayer[] {
    return [...this.players.values()].filter((player): player is SpawnedPlayer => player.heroId !== null);
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

  private snapshotFor(viewerId: string, spawned: SpawnedPlayer[]): SnapshotMessage {
    const viewer = spawned.find((player) => player.id === viewerId);
    const sighted = viewer !== undefined && isAlive(viewer) ? viewer : undefined;
    const canSee = (target: SpawnedPlayer) =>
      target.id === viewerId ||
      (sighted !== undefined &&
        isAlive(target) &&
        this.vision.canSee({ ...sighted, visionRange: getHero(sighted.heroId).visionRange }, target));

    const visible = spawned.filter(canSee);
    const visibleIds = new Set(visible.map((player) => player.id));

    const pointVisible = (point: Vec2) =>
      sighted !== undefined && canSeePosition(ARENA, sighted.position, getHero(sighted.heroId).visionRange, point);
    const landsOnViewer = (shape: SkillShape, origin: Vec2, direction: Vec2) =>
      sighted !== undefined && shapeHits(shape, origin, direction, sighted.position, getHero(sighted.heroId).radius);
    const projectileVisible: PointVisibility = (point, casterId) => casterId === viewerId || pointVisible(point);
    const zoneVisible: ZoneVisibility = (zone) =>
      zone.casterId === viewerId ||
      pointVisible(zone.origin) ||
      (zone.anchor !== "aimPoint" && visibleIds.has(zone.casterId)) ||
      landsOnViewer(zone.shape, zone.origin, zone.direction);

    const events = this.events.filter((event) => {
      switch (event.kind) {
        case "hit":
          return visibleIds.has(event.attackerId) || visibleIds.has(event.targetId);
        case "respawn":
          return event.playerId === viewerId;
        case "death":
        case "matchPhase":
          return true;
        case "skillCast":
          return visibleIds.has(event.casterId);
        case "skillHit":
        case "statusApplied":
          return event.targetId === viewerId || visibleIds.has(event.targetId);
        case "skillZone": {
          const zone = getSkill(event.skillId).zones[event.zoneIndex];
          const shape: SkillShape =
            event.length !== undefined && zone.shape.type === "line" ? { ...zone.shape, length: event.length } : zone.shape;
          return zoneVisible({
            origin: event,
            direction: { x: event.dirX, y: event.dirY },
            shape,
            anchor: zone.anchor,
            casterId: event.casterId,
          });
        }
        case "projectileEnd":
          return event.targetId === viewerId || projectileVisible(event, event.casterId);
      }
    });

    const snapshot = this.baseSnapshot(spawned, visible, viewerId);
    if (events.length > 0) snapshot.events = events;
    const projectiles = this.skills.visibleProjectiles(projectileVisible);
    if (projectiles.length > 0) snapshot.projectiles = projectiles;
    const zones = this.skills.visibleZones(zoneVisible, this.tick);
    if (zones.length > 0) snapshot.zones = zones;
    return snapshot;
  }

  private spectatorSnapshot(spawned: SpawnedPlayer[]): SnapshotMessage {
    const snapshot = this.baseSnapshot(spawned, spawned.filter(isAlive), "");
    snapshot.spectating = true;
    if (this.events.length > 0) snapshot.events = [...this.events];
    const projectiles = this.skills.visibleProjectiles(() => true);
    if (projectiles.length > 0) snapshot.projectiles = projectiles;
    const zones = this.skills.visibleZones(() => true, this.tick);
    if (zones.length > 0) snapshot.zones = zones;
    return snapshot;
  }

  private baseSnapshot(spawned: SpawnedPlayer[], visible: SpawnedPlayer[], viewerId: string): SnapshotMessage {
    return {
      tick: this.tick,
      playersInRoom: this.players.size,
      roster: spawned.map((player) => ({ id: player.id, heroId: player.heroId, name: player.name })),
      visible: visible.map((player) => this.visiblePlayer(player, viewerId)),
      match: this.match.view(
        this.tick,
        spawned.filter((player) => !player.connected).map((player) => player.id),
      ),
      spectators: this.spectators.size,
    };
  }

  private visiblePlayer(player: SpawnedPlayer, viewerId: string): VisiblePlayer {
    const entry: VisiblePlayer = {
      id: player.id,
      x: player.position.x,
      y: player.position.y,
      hp: player.hp,
      lastInputSeq: player.id === viewerId ? player.lastProcessedSeq : 0,
    };
    if (player.respawnAtTick !== null) entry.respawnTicks = player.respawnAtTick - this.tick;
    if (player.id === viewerId) {
      const [q, e, r] = player.skillReadyTick.map((readyTick) => Math.max(0, readyTick - this.tick));
      entry.skillCooldownTicks = [q, e, r];
    }
    const statuses = visibleStatuses(player.status, this.tick);
    if (statuses) entry.statuses = statuses;
    return entry;
  }
}

function restartInputSequence(player: ServerPlayer) {
  player.inputQueue = [];
  player.awaitingInputBuffer = true;
  player.lastQueuedSeq = 0;
  player.lastProcessedSeq = 0;
}

function isAlive(player: ServerPlayer): boolean {
  return player.heroId !== null && player.respawnAtTick === null;
}
