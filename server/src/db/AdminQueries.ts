import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type {
  AdminMatch,
  AdminMatchPlayer,
  AdminPage,
  AdminUser,
  AdminUserIp,
  HeroId,
  MatchEndReason,
} from "@moba/shared";
import { escapeLike } from "./database.js";

export interface PageQuery {
  search: string;
  page: number;
  pageSize: number;
}

interface UserRow {
  username: string;
  created_at: string;
  last_seen_at: string;
  last_ip: string | null;
  matches: number;
  wins: number;
  kills: number;
}

interface IpRow {
  username: string;
  ip: string;
  first_seen_at: string;
  last_seen_at: string;
  times: number;
}

interface MatchRow {
  id: number;
  room_code: string;
  started_at: string;
  ended_at: string;
  duration_ms: number;
  end_reason: MatchEndReason;
}

interface PlayerRow {
  match_id: number;
  slot: 0 | 1;
  username: string;
  hero_id: HeroId;
  kills: number;
  won: number;
}

export class AdminQueries {
  constructor(private readonly db: DatabaseSync) {}

  users({ search, page, pageSize }: PageQuery): AdminPage<AdminUser> {
    const pattern = `%${escapeLike(search)}%`;
    const { total } = this.db
      .prepare("SELECT COUNT(*) AS total FROM users WHERE username LIKE ? ESCAPE '\\'")
      .get(pattern) as { total: number };
    const rows = this.db
      .prepare(
        `SELECT u.username, u.created_at, u.last_seen_at, u.last_ip,
                COALESCE(s.matches, 0) AS matches, COALESCE(s.wins, 0) AS wins, COALESCE(s.kills, 0) AS kills
         FROM users u
         LEFT JOIN (
           SELECT username, COUNT(*) AS matches, SUM(won) AS wins, SUM(kills) AS kills
           FROM match_players GROUP BY username COLLATE NOCASE
         ) s ON s.username = u.username
         WHERE u.username LIKE ? ESCAPE '\\'
         ORDER BY u.last_seen_at DESC
         LIMIT ? OFFSET ?`,
      )
      .all(pattern, pageSize, (page - 1) * pageSize) as unknown as UserRow[];

    const ips = this.groupBy(
      this.selectIn<IpRow>(
        "SELECT username, ip, first_seen_at, last_seen_at, times FROM user_ips WHERE username IN",
        rows.map((row) => row.username),
        "ORDER BY last_seen_at DESC",
      ),
      (row) => row.username.toLowerCase(),
    );

    return {
      total,
      page,
      pageSize,
      items: rows.map((row) => ({
        username: row.username,
        createdAt: row.created_at,
        lastSeenAt: row.last_seen_at,
        lastIp: row.last_ip,
        ips: (ips.get(row.username.toLowerCase()) ?? []).map(toUserIp),
        matches: row.matches,
        wins: row.wins,
        kills: row.kills,
      })),
    };
  }

  matches({ search, page, pageSize }: PageQuery): AdminPage<AdminMatch> {
    const filter = search
      ? "WHERE m.id IN (SELECT match_id FROM match_players WHERE username LIKE ? ESCAPE '\\')"
      : "";
    const filterArgs: SQLInputValue[] = search ? [`%${escapeLike(search)}%`] : [];
    const { total } = this.db.prepare(`SELECT COUNT(*) AS total FROM matches m ${filter}`).get(...filterArgs) as {
      total: number;
    };
    const rows = this.db
      .prepare(
        `SELECT m.id, m.room_code, m.started_at, m.ended_at, m.duration_ms, m.end_reason
         FROM matches m ${filter}
         ORDER BY m.ended_at DESC, m.id DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...filterArgs, pageSize, (page - 1) * pageSize) as unknown as MatchRow[];

    const players = this.groupBy(
      this.selectIn<PlayerRow>(
        "SELECT match_id, slot, username, hero_id, kills, won FROM match_players WHERE match_id IN",
        rows.map((row) => row.id),
        "ORDER BY slot",
      ),
      (row) => row.match_id,
    );

    return {
      total,
      page,
      pageSize,
      items: rows.map((row) => ({
        id: row.id,
        roomCode: row.room_code,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        durationMs: row.duration_ms,
        endReason: row.end_reason,
        players: (players.get(row.id) ?? []).map(toMatchPlayer),
      })),
    };
  }

  private selectIn<T>(prefix: string, values: SQLInputValue[], suffix: string): T[] {
    if (values.length === 0) return [];
    const placeholders = values.map(() => "?").join(", ");
    return this.db.prepare(`${prefix} (${placeholders}) ${suffix}`).all(...values) as unknown as T[];
  }

  private groupBy<T, K>(rows: T[], keyOf: (row: T) => K): Map<K, T[]> {
    const groups = new Map<K, T[]>();
    for (const row of rows) {
      const key = keyOf(row);
      const group = groups.get(key);
      if (group) group.push(row);
      else groups.set(key, [row]);
    }
    return groups;
  }
}

function toUserIp(row: IpRow): AdminUserIp {
  return { ip: row.ip, firstSeenAt: row.first_seen_at, lastSeenAt: row.last_seen_at, times: row.times };
}

function toMatchPlayer(row: PlayerRow): AdminMatchPlayer {
  return { slot: row.slot, username: row.username, heroId: row.hero_id, kills: row.kills, won: row.won === 1 };
}
