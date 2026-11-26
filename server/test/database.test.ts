import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { openDatabase } from "../src/db/database.js";
import type { MatchRecord } from "../src/db/MatchHistory.js";
import { createServices, provideServices, recordMatch, type Services } from "../src/db/services.js";

const KEY_A = "a".repeat(32);
const KEY_B = "b".repeat(32);

function match(endedAt: string, players: [string, number, boolean][], roomCode = "ABCDE"): MatchRecord {
  const ended = new Date(endedAt);
  return {
    roomCode,
    startedAt: new Date(ended.getTime() - 90_000),
    endedAt: ended,
    endReason: "kills",
    players: players.map(([username, kills, won], slot) => ({
      slot: slot as 0 | 1,
      username,
      heroId: slot === 0 ? "blade" : "nova",
      kills,
      won,
    })),
  };
}

describe("database", () => {
  let db: DatabaseSync;
  let services: Services;

  beforeEach(() => {
    db = openDatabase(":memory:");
    services = createServices(db);
  });

  afterEach(() => {
    provideServices(undefined);
    db.close();
  });

  describe("UserStore", () => {
    it("hands out sequential default names and skips ones already claimed", () => {
      expect(services.users.authenticate("user_2", KEY_B, "1.1.1.1")).toEqual({ ok: true, username: "user_2" });
      expect(services.users.createDefault(KEY_A, "1.1.1.1")).toBe("user_1");
      expect(services.users.createDefault(KEY_A, "1.1.1.1")).toBe("user_3");
    });

    it("lets the first browser claim a name and rejects other keys, ignoring case", () => {
      expect(services.users.authenticate("Sardor", KEY_A, "1.1.1.1")).toEqual({ ok: true, username: "Sardor" });
      expect(services.users.authenticate("sardor", KEY_A, "2.2.2.2")).toEqual({ ok: true, username: "Sardor" });
      expect(services.users.authenticate("SARDOR", KEY_B, "3.3.3.3")).toEqual({ ok: false });
    });

    it("records every IP a user comes from", () => {
      const at = (minute: number) => new Date(`2026-11-26T10:0${minute}:00Z`);
      services.users.authenticate("Sardor", KEY_A, "1.1.1.1", at(0));
      services.users.authenticate("Sardor", KEY_A, "2.2.2.2", at(1));
      services.users.authenticate("Sardor", KEY_A, "1.1.1.1", at(2));
      services.users.authenticate("Sardor", KEY_B, "9.9.9.9", at(3));

      const [user] = services.admin.users({ search: "", page: 1, pageSize: 10 }).items;
      expect(user.lastIp).toBe("1.1.1.1");
      expect(user.lastSeenAt).toBe(at(2).toISOString());
      expect(user.ips.map(({ ip, times }) => [ip, times])).toEqual([
        ["1.1.1.1", 2],
        ["2.2.2.2", 1],
      ]);
    });
  });

  describe("AdminQueries", () => {
    beforeEach(() => {
      services.users.authenticate("Sardor", KEY_A, "1.1.1.1", new Date("2026-11-26T09:00:00Z"));
      services.users.authenticate("Timur", KEY_B, "2.2.2.2", new Date("2026-11-26T11:00:00Z"));
      services.users.authenticate("100%_real", KEY_B, "3.3.3.3", new Date("2026-11-26T08:00:00Z"));
      services.history.record(match("2026-11-26T10:00:00Z", [["Sardor", 5, true], ["Timur", 2, false]], "OLDER"));
      services.history.record(match("2026-11-26T12:00:00Z", [["Timur", 5, true], ["Sardor", 4, false]], "NEWER"));
      services.history.record(match("2026-11-26T11:00:00Z", [["Timur", 1, false], ["100%_real", 5, true]], "MIDDL"));
    });

    it("lists users by last seen with match totals", () => {
      const page = services.admin.users({ search: "", page: 1, pageSize: 10 });
      expect(page.total).toBe(3);
      expect(page.items.map(({ username, matches, wins, kills }) => [username, matches, wins, kills])).toEqual([
        ["Timur", 3, 1, 8],
        ["Sardor", 2, 1, 9],
        ["100%_real", 1, 1, 5],
      ]);
    });

    it("searches users literally, so % and _ are not wildcards", () => {
      expect(services.admin.users({ search: "dor", page: 1, pageSize: 10 }).items.map((u) => u.username)).toEqual([
        "Sardor",
      ]);
      expect(services.admin.users({ search: "%_", page: 1, pageSize: 10 }).items.map((u) => u.username)).toEqual([
        "100%_real",
      ]);
    });

    it("lists matches newest first with players in slot order", () => {
      const page = services.admin.matches({ search: "", page: 1, pageSize: 10 });
      expect(page.items.map((m) => m.roomCode)).toEqual(["NEWER", "MIDDL", "OLDER"]);
      expect(page.items[0]).toMatchObject({
        durationMs: 90_000,
        endReason: "kills",
        players: [
          { slot: 0, username: "Timur", heroId: "blade", kills: 5, won: true },
          { slot: 1, username: "Sardor", heroId: "nova", kills: 4, won: false },
        ],
      });
    });

    it("filters matches by username and pages through them", () => {
      const filtered = services.admin.matches({ search: "sardor", page: 1, pageSize: 10 });
      expect(filtered.total).toBe(2);
      expect(filtered.items.map((m) => m.roomCode)).toEqual(["NEWER", "OLDER"]);

      const second = services.admin.matches({ search: "", page: 2, pageSize: 2 });
      expect(second).toMatchObject({ total: 3, page: 2, pageSize: 2 });
      expect(second.items.map((m) => m.roomCode)).toEqual(["OLDER"]);
    });
  });

  it("saves through the provided services and survives a failing store", () => {
    provideServices(services);
    recordMatch(match("2026-11-26T10:00:00Z", [["Sardor", 5, true], ["Timur", 0, false]]));
    expect(services.admin.matches({ search: "", page: 1, pageSize: 10 }).total).toBe(1);

    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    provideServices({
      ...services,
      history: {
        record() {
          throw new Error("disk full");
        },
      },
    });
    expect(() => recordMatch(match("2026-11-26T10:00:00Z", []))).not.toThrow();
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });
});
