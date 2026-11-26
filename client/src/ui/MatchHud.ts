import { TICK_MS, type MatchPhase, type MatchState } from "@moba/shared";
import "./match.css";

const FIGHT_BANNER_MS = 900;

export interface MatchHudContext {
  myId: string;
  spectating?: boolean;
  playersInRoom: number;
  heroName(playerId: string): string;
}

const WAITING_TEXT = "Waiting for players";

export class MatchHud {
  private readonly scoreboard = element("div", "match-scoreboard");
  private readonly myName = element("span", "match-name");
  private readonly myScore = element("span", "match-score match-score-me");
  private readonly timer = element("span", "match-timer");
  private readonly enemyScore = element("span", "match-score match-score-enemy");
  private readonly enemyName = element("span", "match-name");
  private readonly countdown = element("div", "match-countdown");
  private readonly banner = element("div", "match-banner");
  private readonly endScreen = element("div", "match-end");
  private readonly endTitle = element("h2", "match-end-title");
  private readonly endReason = element("p", "match-end-reason");
  private readonly endScores = element("div", "match-end-scores");
  private readonly rematchButton = element("button", "match-rematch");
  private readonly menuButton = element("button", "match-menu");
  private readonly rematchNote = element("p", "match-end-note");
  private readonly shown = new Map<HTMLElement, string>();
  private readonly names = new Map<string, string>();
  private phase: MatchPhase | undefined;
  private fightUntil = 0;
  private voted = false;

  constructor(onRematch: () => void, onBackToMenu: () => void) {
    const mySide = element("div", "match-side match-side-me");
    mySide.append(this.myName, this.myScore);
    const enemySide = element("div", "match-side match-side-enemy");
    enemySide.append(this.enemyScore, this.enemyName);
    this.scoreboard.append(mySide, this.timer, enemySide);

    const card = element("div", "match-end-card");
    const actions = element("div", "match-end-actions");
    actions.append(this.rematchButton, this.menuButton);
    card.append(this.endTitle, this.endReason, this.endScores, actions, this.rematchNote);
    this.endScreen.append(card);
    this.rematchButton.textContent = "Rematch";
    this.menuButton.textContent = "Back to menu";
    this.menuButton.dataset.ui = "";
    this.rematchButton.dataset.ui = "";
    this.menuButton.addEventListener("click", () => {
      this.menuButton.disabled = true;
      this.rematchButton.disabled = true;
      onBackToMenu();
    });
    this.rematchButton.addEventListener("click", () => {
      if (this.voted) return;
      this.voted = true;
      onRematch();
      this.setText(this.rematchButton, "Waiting for opponent…");
      this.rematchButton.disabled = true;
    });

    for (const node of [this.scoreboard, this.countdown, this.banner, this.endScreen]) node.hidden = true;
    document.body.append(this.scoreboard, this.countdown, this.banner, this.endScreen);
  }

  update(match: MatchState | undefined, ctx: MatchHudContext) {
    const now = performance.now();
    if (!match) return;
    if (match.phase !== this.phase) this.enterPhase(match.phase, now);

    const me = ctx.spectating ? match.scores[0] : match.scores.find((score) => score.id === ctx.myId);
    const enemy = ctx.spectating ? match.scores[1] : match.scores.find((score) => score.id !== ctx.myId);
    this.scoreboard.hidden = ctx.spectating ? !me : !me || !enemy;
    if (ctx.spectating && me && !enemy) {
      this.setText(this.myName, this.nameOf(me.id, ctx));
      this.setText(this.myScore, String(me.kills));
      this.setText(this.enemyScore, "–");
      this.setText(this.enemyName, WAITING_TEXT);
      this.setText(this.timer, "--:--");
    } else if (me && enemy) {
      this.setText(this.myName, this.nameOf(me.id, ctx));
      this.setText(this.myScore, String(me.kills));
      this.setText(this.enemyScore, String(enemy.kills));
      this.setText(this.enemyName, this.nameOf(enemy.id, ctx));
      this.setText(this.timer, formatTime(match.phase === "playing" ? (match.timeLeftTicks ?? 0) : 0, match));
    }

    this.updateCountdown(match, now);
    this.updateBanner(match, ctx);
    if (match.phase === "ended") this.updateEndScreen(match, ctx, me?.kills ?? 0, enemy?.kills ?? 0);
  }

  private enterPhase(phase: MatchPhase, now: number) {
    if (phase === "playing" && this.phase === "countdown") this.fightUntil = now + FIGHT_BANNER_MS;
    this.phase = phase;
    this.endScreen.hidden = phase !== "ended";
    if (phase !== "ended") {
      this.voted = false;
      this.rematchButton.disabled = false;
      this.setText(this.rematchButton, "Rematch");
    }
  }

  private updateCountdown(match: MatchState, now: number) {
    if (match.phase === "countdown") {
      this.countdown.hidden = false;
      this.setText(this.countdown, String(Math.max(1, Math.ceil(((match.countdownTicks ?? 0) * TICK_MS) / 1000))));
      return;
    }
    const fighting = match.phase === "playing" && now < this.fightUntil;
    this.countdown.hidden = !fighting;
    if (fighting) this.setText(this.countdown, "FIGHT!");
  }

  private updateBanner(match: MatchState, ctx: MatchHudContext) {
    const opponentAway = (match.disconnected ?? []).some((id) => ctx.spectating || id !== ctx.myId);
    this.banner.hidden = !opponentAway || match.phase === "ended";
    if (!opponentAway) return;
    this.setText(
      this.banner,
      ctx.spectating
        ? "A player disconnected — waiting for them to return…"
        : "Opponent disconnected — waiting for them to return…",
    );
  }

  private updateEndScreen(match: MatchState, ctx: MatchHudContext, myKills: number, enemyKills: number) {
    if (ctx.spectating) {
      this.updateSpectatorEndScreen(match, ctx, myKills, enemyKills);
      return;
    }
    const outcome = match.winnerId === ctx.myId ? "victory" : match.winnerId ? "defeat" : "draw";
    this.setText(this.endTitle, outcome === "victory" ? "Victory" : outcome === "defeat" ? "Defeat" : "Draw");
    this.endScreen.dataset.outcome = outcome;
    this.setText(this.endReason, reasonText(match, outcome));
    this.setText(this.endScores, `${myKills} : ${enemyKills}`);

    const opponentVoted = (match.rematchVotes ?? []).some((id) => id !== ctx.myId);
    const opponentPresent = ctx.playersInRoom >= 2 && match.scores.length === 2 && match.endReason !== "forfeit";
    this.rematchButton.hidden = !opponentPresent;
    this.setText(
      this.rematchNote,
      !opponentPresent ? "Your opponent left. Share the room link to play again." : opponentVoted ? "Opponent wants a rematch!" : "",
    );
  }

  private updateSpectatorEndScreen(match: MatchState, ctx: MatchHudContext, firstKills: number, secondKills: number) {
    this.setText(this.endTitle, match.winnerId ? `${this.nameOf(match.winnerId, ctx)} wins` : "Draw");
    this.endScreen.dataset.outcome = match.winnerId ? "spectator" : "draw";
    this.setText(this.endReason, spectatorReasonText(match));
    this.setText(this.endScores, `${firstKills} : ${secondKills}`);
    this.rematchButton.hidden = true;
    const bothPresent = ctx.playersInRoom >= 2 && match.scores.length === 2 && match.endReason !== "forfeit";
    this.setText(
      this.rematchNote,
      bothPresent ? "Waiting for the players to start a rematch…" : `A player left. ${WAITING_TEXT}…`,
    );
  }

  private nameOf(playerId: string, ctx: MatchHudContext): string {
    const name = ctx.heroName(playerId);
    if (name) this.names.set(playerId, name);
    return name || this.names.get(playerId) || "Opponent";
  }

  private setText(node: HTMLElement, text: string) {
    if (this.shown.get(node) === text) return;
    this.shown.set(node, text);
    node.textContent = text;
  }
}

function reasonText(match: MatchState, outcome: string): string {
  if (match.endReason === "forfeit") return outcome === "victory" ? "Your opponent left the match." : "You left the match.";
  if (match.endReason === "time") return outcome === "draw" ? "Time is up — scores are tied." : "Time is up.";
  return `First to ${match.killsToWin} kills.`;
}

function spectatorReasonText(match: MatchState): string {
  if (match.endReason === "forfeit") return "A player left the match.";
  if (match.endReason === "time") return match.winnerId ? "Time is up." : "Time is up — scores are tied.";
  return `First to ${match.killsToWin} kills.`;
}

function formatTime(ticks: number, match: MatchState): string {
  if (match.phase !== "playing") return match.phase === "ended" ? "END" : "--:--";
  const seconds = Math.ceil((ticks * TICK_MS) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}
