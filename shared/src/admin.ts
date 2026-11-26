import type { HeroId } from "./heroes.js";
import type { MatchEndReason } from "./protocol.js";

export const ADMIN_API_PATH = "/api/admin";
export const ADMIN_PAGE_SIZE = 50;

export interface AdminLoginRequest {
  username: string;
  password: string;
}

export interface AdminUserIp {
  ip: string;
  firstSeenAt: string;
  lastSeenAt: string;
  times: number;
}

export interface AdminUser {
  username: string;
  createdAt: string;
  lastSeenAt: string;
  lastIp: string | null;
  ips: AdminUserIp[];
  matches: number;
  wins: number;
  kills: number;
}

export interface AdminMatchPlayer {
  slot: 0 | 1;
  username: string;
  heroId: HeroId;
  kills: number;
  won: boolean;
}

export interface AdminMatch {
  id: number;
  roomCode: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  endReason: MatchEndReason;
  players: AdminMatchPlayer[];
}

export interface AdminPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
