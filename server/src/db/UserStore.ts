import { createHash, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { defaultUsername } from "@moba/shared";
import { inTransaction } from "./database.js";

export type AuthResult = { ok: true; username: string } | { ok: false };

interface UserRow {
  username: string;
  key_hash: string;
}

export class UserStore {
  constructor(private readonly db: DatabaseSync) {}

  createDefault(key: string, ip: string, now = new Date()): string {
    const nextNumber = this.db.prepare(
      `INSERT INTO counters (name, value) VALUES ('default_username', 1)
       ON CONFLICT(name) DO UPDATE SET value = value + 1 RETURNING value`,
    );
    return inTransaction(this.db, () => {
      for (;;) {
        const { value } = nextNumber.get() as { value: number };
        const username = defaultUsername(value);
        if (this.find(username)) continue;
        this.insert(username, key, ip, now);
        return username;
      }
    });
  }

  authenticate(username: string, key: string, ip: string, now = new Date()): AuthResult {
    return inTransaction(this.db, () => {
      const existing = this.find(username);
      if (!existing) {
        this.insert(username, key, ip, now);
        return { ok: true, username };
      }
      if (!matchesHash(key, existing.key_hash)) return { ok: false };
      this.touch(existing.username, ip, now);
      return { ok: true, username: existing.username };
    });
  }

  private find(username: string): UserRow | undefined {
    return this.db.prepare("SELECT username, key_hash FROM users WHERE username = ?").get(username) as
      | UserRow
      | undefined;
  }

  private insert(username: string, key: string, ip: string, now: Date) {
    const at = now.toISOString();
    this.db
      .prepare("INSERT INTO users (username, key_hash, created_at, last_seen_at, last_ip) VALUES (?, ?, ?, ?, ?)")
      .run(username, hashKey(key), at, at, ip);
    this.recordIp(username, ip, at);
  }

  private touch(username: string, ip: string, now: Date) {
    const at = now.toISOString();
    this.db.prepare("UPDATE users SET last_seen_at = ?, last_ip = ? WHERE username = ?").run(at, ip, username);
    this.recordIp(username, ip, at);
  }

  private recordIp(username: string, ip: string, at: string) {
    this.db
      .prepare(
        `INSERT INTO user_ips (username, ip, first_seen_at, last_seen_at, times) VALUES (?, ?, ?, ?, 1)
         ON CONFLICT(username, ip) DO UPDATE SET last_seen_at = excluded.last_seen_at, times = times + 1`,
      )
      .run(username, ip, at, at);
  }
}

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function matchesHash(key: string, expectedHex: string): boolean {
  const actual = Buffer.from(hashKey(key), "hex");
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
