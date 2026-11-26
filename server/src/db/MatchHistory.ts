import type { DatabaseSync } from "node:sqlite";
import type { AdminMatchPlayer, MatchEndReason } from "@moba/shared";
import { inTransaction } from "./database.js";

export interface MatchRecord {
  roomCode: string;
  startedAt: Date;
  endedAt: Date;
  endReason: MatchEndReason;
  players: AdminMatchPlayer[];
}

export interface MatchRecorder {
  record(match: MatchRecord): void;
}

export class MatchHistory implements MatchRecorder {
  constructor(private readonly db: DatabaseSync) {}

  record(match: MatchRecord) {
    const insertMatch = this.db.prepare(
      "INSERT INTO matches (room_code, started_at, ended_at, duration_ms, end_reason) VALUES (?, ?, ?, ?, ?)",
    );
    const insertPlayer = this.db.prepare(
      "INSERT INTO match_players (match_id, slot, username, hero_id, kills, won) VALUES (?, ?, ?, ?, ?, ?)",
    );
    inTransaction(this.db, () => {
      const { lastInsertRowid } = insertMatch.run(
        match.roomCode,
        match.startedAt.toISOString(),
        match.endedAt.toISOString(),
        match.endedAt.getTime() - match.startedAt.getTime(),
        match.endReason,
      );
      for (const player of match.players) {
        insertPlayer.run(lastInsertRowid, player.slot, player.username, player.heroId, player.kills, player.won ? 1 : 0);
      }
    });
  }
}
