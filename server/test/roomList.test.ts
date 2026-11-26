import { describe, expect, it } from "vitest";
import { summarizeRooms } from "../src/roomList.js";

describe("summarizeRooms", () => {
  it("lists rooms newest first with their metadata, full rooms included", () => {
    const rooms = summarizeRooms([
      { roomId: "OLDER", createdAt: "2026-01-01T10:00:00Z", metadata: { players: 2, spectators: 3, phase: "playing", heroes: ["blade", "nova"] } },
      { roomId: "NEWER", createdAt: "2026-01-01T11:00:00Z", metadata: { players: 1, spectators: 0, phase: "waiting", heroes: [] } },
    ]);
    expect(rooms.map((room) => room.code)).toEqual(["NEWER", "OLDER"]);
    expect(rooms[1]).toEqual({ code: "OLDER", players: 2, maxPlayers: 2, spectators: 3, phase: "playing", heroes: ["blade", "nova"] });
  });

  it("hides rooms without players and fills in missing metadata", () => {
    const rooms = summarizeRooms([
      { roomId: "EMPTY", metadata: { players: 0 } },
      { roomId: "BARE", metadata: { players: 1 } },
    ]);
    expect(rooms).toEqual([{ code: "BARE", players: 1, maxPlayers: 2, spectators: 0, phase: "waiting", heroes: [] }]);
  });
});
