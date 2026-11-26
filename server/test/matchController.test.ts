import { describe, expect, it } from "vitest";
import { MatchController } from "../src/match/MatchController.js";

const PLAYERS = ["a", "b"];

function playing() {
  const match = new MatchController(3, 100, 2);
  expect(match.update(0, PLAYERS)).toBe("countdown");
  expect(match.update(2, PLAYERS)).toBeNull();
  expect(match.update(3, PLAYERS)).toBe("playing");
  return match;
}

describe("MatchController", () => {
  it("waits for two ready players before counting down", () => {
    const match = new MatchController(3, 100, 2);
    expect(match.update(0, ["a"])).toBeNull();
    expect(match.phase).toBe("waiting");
    expect(match.allowsGameplay).toBe(true);
    match.update(1, PLAYERS);
    expect(match.allowsGameplay).toBe(false);
    expect(match.view(2, []).countdownTicks).toBe(2);
  });

  it("ends when a player reaches the kill target", () => {
    const match = playing();
    expect(match.recordKill("a")).toBeNull();
    expect(match.recordKill("a")).toBe("ended");
    expect(match.winnerId).toBe("a");
    expect(match.view(10, []).endReason).toBe("kills");
  });

  it("ends on time with the leader or a draw", () => {
    const lead = playing();
    lead.recordKill("b");
    expect(lead.update(103, PLAYERS)).toBe("ended");
    expect(lead.winnerId).toBe("b");

    const tie = playing();
    tie.update(103, PLAYERS);
    expect(tie.winnerId).toBeNull();
    expect(tie.endReason).toBe("time");
  });

  it("awards a forfeit to the remaining player", () => {
    const match = playing();
    expect(match.forfeit("b")).toBe("ended");
    expect(match.winnerId).toBe("a");
    expect(match.endReason).toBe("forfeit");
  });

  it("restarts only when both players vote for a rematch", () => {
    const match = playing();
    match.recordKill("a");
    match.recordKill("a");
    expect(match.voteRematch("a", 20, PLAYERS)).toBeNull();
    expect(match.view(20, []).rematchVotes).toEqual(["a"]);
    expect(match.voteRematch("b", 21, PLAYERS)).toBe("countdown");
    expect(match.view(21, []).scores).toEqual([
      { id: "a", kills: 0 },
      { id: "b", kills: 0 },
    ]);
  });
});
