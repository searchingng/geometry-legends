import {
  KILLS_TO_WIN,
  MATCH_COUNTDOWN_MS,
  MATCH_DURATION_MS,
  TICK_MS,
  type MatchEndReason,
  type MatchPhase,
  type MatchState,
} from "@moba/shared";

export const COUNTDOWN_TICKS = Math.round(MATCH_COUNTDOWN_MS / TICK_MS);
export const MATCH_TICKS = Math.round(MATCH_DURATION_MS / TICK_MS);

export type MatchTransition = "countdown" | "playing" | "ended";

export class MatchController {
  phase: MatchPhase = "waiting";
  winnerId: string | null = null;
  endReason: MatchEndReason | undefined;
  private participants: string[] = [];
  private readonly scores = new Map<string, number>();
  private readonly deaths = new Map<string, number>();
  private readonly votes = new Set<string>();
  private countdownEndTick = 0;
  private endTick = 0;

  constructor(
    private readonly countdownTicks = COUNTDOWN_TICKS,
    private readonly matchTicks = MATCH_TICKS,
    private readonly killsToWin = KILLS_TO_WIN,
  ) {}

  get allowsGameplay(): boolean {
    return this.phase === "waiting" || this.phase === "playing";
  }

  get isRunning(): boolean {
    return this.phase === "countdown" || this.phase === "playing";
  }

  update(tick: number, readyIds: readonly string[]): MatchTransition | null {
    switch (this.phase) {
      case "waiting":
        if (readyIds.length === 2) return this.startCountdown(tick, readyIds);
        return null;
      case "ended":
        if (readyIds.length === 2 && !sameMembers(readyIds, this.participants)) return this.startCountdown(tick, readyIds);
        return null;
      case "countdown":
        if (tick < this.countdownEndTick) return null;
        this.phase = "playing";
        this.endTick = tick + this.matchTicks;
        return "playing";
      case "playing":
        if (tick < this.endTick) return null;
        this.finish(this.leader(), "time");
        return "ended";
    }
  }

  recordKill(killerId: string, victimId: string): MatchTransition | null {
    if (this.phase !== "playing") return null;
    if (this.participants.includes(victimId)) this.deaths.set(victimId, (this.deaths.get(victimId) ?? 0) + 1);
    if (!this.participants.includes(killerId)) return null;
    const kills = (this.scores.get(killerId) ?? 0) + 1;
    this.scores.set(killerId, kills);
    if (kills < this.killsToWin) return null;
    this.finish(killerId, "kills");
    return "ended";
  }

  recordBaseDestroyed(winnerId: string): MatchTransition | null {
    if (this.phase !== "playing" || !this.participants.includes(winnerId)) return null;
    this.finish(winnerId, "base");
    return "ended";
  }

  forfeit(leaverId: string): MatchTransition | null {
    this.votes.delete(leaverId);
    if (!this.isRunning || !this.participants.includes(leaverId)) return null;
    this.finish(this.participants.find((id) => id !== leaverId) ?? null, "forfeit");
    return "ended";
  }

  voteRematch(playerId: string, tick: number, readyIds: readonly string[]): MatchTransition | null {
    if (this.phase !== "ended" || !this.participants.includes(playerId)) return null;
    this.votes.add(playerId);
    const everyoneVoted = this.participants.every((id) => this.votes.has(id));
    if (!everyoneVoted || !sameMembers(readyIds, this.participants)) return null;
    return this.startCountdown(tick, readyIds);
  }

  view(tick: number, disconnected: readonly string[]): MatchState {
    const state: MatchState = {
      phase: this.phase,
      scores: this.participants.map((id) => ({
        id,
        kills: this.scores.get(id) ?? 0,
        deaths: this.deaths.get(id) ?? 0,
        assists: 0,
      })),
      killsToWin: this.killsToWin,
    };
    if (this.phase === "countdown") state.countdownTicks = Math.max(0, this.countdownEndTick - tick);
    if (this.phase === "playing") state.timeLeftTicks = Math.max(0, this.endTick - tick);
    if (this.phase === "ended") {
      state.winnerId = this.winnerId;
      if (this.endReason) state.endReason = this.endReason;
      state.rematchVotes = [...this.votes];
    }
    if (disconnected.length > 0) state.disconnected = [...disconnected];
    return state;
  }

  private startCountdown(tick: number, readyIds: readonly string[]): MatchTransition {
    this.phase = "countdown";
    this.participants = [...readyIds];
    this.scores.clear();
    this.deaths.clear();
    this.votes.clear();
    this.winnerId = null;
    this.endReason = undefined;
    this.countdownEndTick = tick + this.countdownTicks;
    return "countdown";
  }

  private finish(winnerId: string | null, reason: MatchEndReason) {
    this.phase = "ended";
    this.winnerId = winnerId;
    this.endReason = reason;
    this.votes.clear();
  }

  private leader(): string | null {
    const [a, b] = this.participants.map((id) => ({ id, kills: this.scores.get(id) ?? 0 }));
    if (!a || !b || a.kills === b.kills) return null;
    return a.kills > b.kills ? a.id : b.id;
  }
}

function sameMembers(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}
