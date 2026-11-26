import type { HeroId } from "./heroes.js";

export const Message = {
  Input: "input",
  Snapshot: "snapshot",
  Welcome: "welcome",
  Ping: "ping",
  Pong: "pong",
} as const;

export interface WelcomeMessage {
  playerId: string;
  heroId: HeroId;
}

export interface PlayerSnapshot {
  id: string;
  heroId: HeroId;
  x: number;
  y: number;
  lastInputSeq: number;
}

export interface SnapshotMessage {
  tick: number;
  players: PlayerSnapshot[];
}
