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
    expect(match.recordKill("a", "b")).toBeNull();
    expect(match.recordKill("a", "b")).toBe("ended");
    expect(match.winnerId).toBe("a");
    expect(match.view(10, []).endReason).toBe("kills");
  });

  it("counts deaths for the victim", () => {
    const match = playing();
    match.recordKill("a", "b");
    match.recordKill("b", "a");
    match.recordKill("b", "a");
    expect(match.view(10, []).scores).toEqual([
      { id: "a", kills: 1, deaths: 2, assists: 0 },
      { id: "b", kills: 2, deaths: 1, assists: 0 },
    ]);
  });

  it("ends on time with the leader or a draw", () => {
    const lead = playing();
    lead.recordKill("b", "a");
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
    match.recordKill("a", "b");
    match.recordKill("a", "b");
    expect(match.voteRematch("a", 20, PLAYERS)).toBeNull();
    expect(match.view(20, []).rematchVotes).toEqual(["a"]);
    expect(match.voteRematch("b", 21, PLAYERS)).toBe("countdown");
    expect(match.view(21, []).scores).toEqual([
      { id: "a", kills: 0, deaths: 0, assists: 0 },
      { id: "b", kills: 0, deaths: 0, assists: 0 },
    ]);
  });

  it("ends when a base is destroyed", () => {
    const match = playing();
    expect(match.recordBaseDestroyed("b")).toBe("ended");
    expect(match.winnerId).toBe("b");
    expect(match.view(10, []).endReason).toBe("base");
  });

  it("counts deaths caused by units without awarding kills", () => {
    const match = playing();
    expect(match.recordKill("turret1", "a")).toBeNull();
    expect(match.view(10, []).scores[0]).toEqual({ id: "a", kills: 0, deaths: 1, assists: 0 });
  });
});
