import type { HeroId } from "./heroes.js";
import type { Vec2 } from "./math.js";
import type { ForcedMotion } from "./skillMotion.js";
import type { SkillId } from "./skills.js";
import type { SkillSlot } from "./skillTypes.js";

export const Message = {
  Input: "input",
  Attack: "attack",
  CastSkill: "castSkill",
  PickHero: "pickHero",
  Snapshot: "snapshot",
  Ping: "ping",
  Pong: "pong",
  Rematch: "rematch",
} as const;

export interface PickHeroMessage {
  heroId: HeroId;
}

export interface AttackMessage {
  held: boolean;
  aim?: Vec2;
}

export function isAttackMessage(value: unknown): value is AttackMessage {
  if (typeof value !== "object" || value === null) return false;
  const message = value as AttackMessage;
  return typeof message.held === "boolean" && (message.aim === undefined || isVec2(message.aim));
}

export interface CastSkillMessage {
  slot: SkillSlot;
  aim: Vec2;
}

export function isCastSkillMessage(value: unknown): value is CastSkillMessage {
  if (typeof value !== "object" || value === null) return false;
  const message = value as CastSkillMessage;
  return (message.slot === 0 || message.slot === 1 || message.slot === 2) && isVec2(message.aim);
}

export function isVec2(value: unknown): value is Vec2 {
  if (typeof value !== "object" || value === null) return false;
  const { x, y } = value as Vec2;
  return Number.isFinite(x) && Number.isFinite(y);
}

export interface RosterEntry {
  id: string;
  heroId: HeroId;
}

export interface VisiblePlayer {
  id: string;
  x: number;
  y: number;
  hp: number;
  lastInputSeq: number;
  respawnTicks?: number;
  skillCooldownTicks?: [number, number, number];
  statuses?: PlayerStatuses;
}

export interface PlayerStatuses {
  stunTicks?: number;
  slowPercent?: number;
  slowTicks?: number;
  shield?: number;
  shieldTicks?: number;
  motion?: ForcedMotion;
  protectedTicks?: number;
}

export type StatusKind = "stun" | "slow" | "knockback" | "shield" | "protection";

export interface StatusAppliedEvent {
  kind: "statusApplied";
  targetId: string;
  sourceId: string;
  status: StatusKind;
  durationTicks?: number;
  percent?: number;
  amount?: number;
  distance?: number;
}

export type MatchPhase = "waiting" | "countdown" | "playing" | "ended";
export type MatchEndReason = "kills" | "time" | "forfeit";

export interface MatchScore {
  id: string;
  kills: number;
}

export interface MatchState {
  phase: MatchPhase;
  scores: MatchScore[];
  killsToWin: number;
  countdownTicks?: number;
  timeLeftTicks?: number;
  winnerId?: string | null;
  endReason?: MatchEndReason;
  rematchVotes?: string[];
  disconnected?: string[];
}

export interface MatchPhaseEvent {
  kind: "matchPhase";
  phase: MatchPhase;
}

export interface VisibleProjectile {
  id: number;
  skillId: SkillId;
  casterId: string;
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  speed: number;
}

export interface VisibleZone {
  id: number;
  skillId: SkillId;
  zoneIndex: number;
  casterId: string;
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  remainingTicks: number;
  delayTicks: number;
}

export type SkillEvent =
  | {
      kind: "skillCast";
      casterId: string;
      skillId: SkillId;
      slot: SkillSlot;
      x: number;
      y: number;
      dirX: number;
      dirY: number;
      aimX: number;
      aimY: number;
    }
  | {
      kind: "skillZone";
      casterId: string;
      skillId: SkillId;
      zoneIndex: number;
      x: number;
      y: number;
      dirX: number;
      dirY: number;
      length?: number;
    }
  | {
      kind: "skillHit";
      casterId: string;
      targetId: string;
      skillId: SkillId;
      damage: number;
      absorbed: number;
      healed: number;
    }
  | {
      kind: "projectileEnd";
      projectileId: number;
      casterId: string;
      skillId: SkillId;
      x: number;
      y: number;
      targetId?: string;
    };

export type CombatEvent =
  | { kind: "hit"; attackerId: string; targetId: string; damage: number }
  | { kind: "death"; playerId: string; killerId: string }
  | { kind: "respawn"; playerId: string }
  | SkillEvent
  | StatusAppliedEvent
  | MatchPhaseEvent;

export interface SnapshotMessage {
  tick: number;
  playersInRoom: number;
  roster: RosterEntry[];
  visible: VisiblePlayer[];
  events?: CombatEvent[];
  projectiles?: VisibleProjectile[];
  zones?: VisibleZone[];
  match?: MatchState;
  spectating?: true;
  spectators?: number;
}

export type ViewerRole = "player" | "spectator";

export interface JoinOptions {
  spectate?: boolean;
}

export interface RoomSummary {
  code: string;
  players: number;
  maxPlayers: number;
  spectators: number;
  phase: MatchPhase;
  heroes: HeroId[];
}

export interface RoomListResponse {
  rooms: RoomSummary[];
}
