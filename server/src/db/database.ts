import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY COLLATE NOCASE,
    key_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    last_ip TEXT
  );
  CREATE TABLE IF NOT EXISTS user_ips (
    username TEXT NOT NULL COLLATE NOCASE REFERENCES users(username) ON DELETE CASCADE,
    ip TEXT NOT NULL,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    times INTEGER NOT NULL,
    PRIMARY KEY (username, ip)
  );
  CREATE TABLE IF NOT EXISTS counters (
    name TEXT PRIMARY KEY,
    value INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_code TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT NOT NULL,
    duration_ms INTEGER NOT NULL,
    end_reason TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS match_players (
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    slot INTEGER NOT NULL,
    username TEXT NOT NULL COLLATE NOCASE,
    hero_id TEXT NOT NULL,
    kills INTEGER NOT NULL,
    won INTEGER NOT NULL,
    PRIMARY KEY (match_id, slot)
  );
  CREATE INDEX IF NOT EXISTS users_last_seen ON users(last_seen_at);
  CREATE INDEX IF NOT EXISTS matches_ended_at ON matches(ended_at);
  CREATE INDEX IF NOT EXISTS match_players_username ON match_players(username);
`;

export function openDatabase(path: string): DatabaseSync {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 2000;");
  db.exec(SCHEMA);
  return db;
}

export function inTransaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, "\\$&");
}
