import { TICK_MS, getHero, type MatchState, type RosterEntry } from "@moba/shared";
import "./gameInfo.css";

const TOGGLE_KEY = "Tab";

interface PlayerRow {
  root: HTMLElement;
  icon: HTMLElement;
  name: HTMLElement;
  hero: HTMLElement;
  kills: HTMLElement;
  deaths: HTMLElement;
  assists: HTMLElement;
}

export class GameInfo {
  private readonly root = element("div", "game-info");
  private readonly allyScore = element("span", "game-info-score game-info-score-ally");
  private readonly enemyScore = element("span", "game-info-score game-info-score-enemy");
  private readonly timer = element("span", "game-info-timer");
  private readonly goal = element("p", "game-info-goal");
  private readonly allyRows = element("div", "game-info-team game-info-team-ally");
  private readonly enemyRows = element("div", "game-info-team game-info-team-enemy");
  private readonly rows = new Map<string, PlayerRow>();
  private readonly shown = new Map<HTMLElement, string>();
  private match: MatchState | undefined;
  private roster: readonly RosterEntry[] = [];
  private isAlly: (playerId: string) => boolean = () => false;
  private open = false;

  constructor(target: Window = window) {
    const title = element("h2", "game-info-title");
    title.textContent = "Game Info";
    const score = element("div", "game-info-scoreline");
    const separator = element("span", "game-info-separator");
    separator.textContent = ":";
    score.append(this.allyScore, separator, this.enemyScore);
    const header = element("div", "game-info-header");
    header.append(title, this.timer);
    this.root.append(header, score, this.goal, columnHeader(), this.allyRows, this.enemyRows);
    this.root.hidden = true;
    document.body.append(this.root);

    target.addEventListener("keydown", (event) => {
      if (event.code !== TOGGLE_KEY) return;
      event.preventDefault();
      if (!event.repeat) this.setOpen(true);
    });
    target.addEventListener("keyup", (event) => {
      if (event.code !== TOGGLE_KEY) return;
      event.preventDefault();
      this.setOpen(false);
    });
    target.addEventListener("blur", () => this.setOpen(false));
  }

  update(match: MatchState | undefined, roster: readonly RosterEntry[], isAlly: (playerId: string) => boolean) {
    this.match = match;
    this.roster = roster;
    this.isAlly = isAlly;
    if (this.open) this.render();
  }

  private setOpen(open: boolean) {
    if (this.open === open) return;
    this.open = open;
    this.root.hidden = !open;
    if (open) this.render();
  }

  private render() {
    const scores = this.match?.scores ?? [];
    let allyKills = 0;
    let enemyKills = 0;
    const present = new Set<string>();

    for (const player of this.roster) {
      present.add(player.id);
      const ally = this.isAlly(player.id);
      const score = scores.find((entry) => entry.id === player.id);
      const kills = score?.kills ?? 0;
      if (ally) allyKills += kills;
      else enemyKills += kills;

      const row = this.rowFor(player);
      const hero = getHero(player.heroId);
      row.icon.style.background = `#${hero.visual.color.toString(16).padStart(6, "0")}`;
      this.setText(row.name, player.name);
      this.setText(row.hero, hero.name);
      this.setText(row.kills, String(kills));
      this.setText(row.deaths, String(score?.deaths ?? 0));
      this.setText(row.assists, String(score?.assists ?? 0));
      const team = ally ? this.allyRows : this.enemyRows;
      if (row.root.parentElement !== team) team.append(row.root);
    }

    for (const [id, row] of this.rows) {
      if (present.has(id)) continue;
      row.root.remove();
      this.rows.delete(id);
    }

    this.setText(this.allyScore, String(allyKills));
    this.setText(this.enemyScore, String(enemyKills));
    this.setText(this.timer, timerText(this.match));
    this.setText(this.goal, this.match ? `First to ${this.match.killsToWin} kills` : "");
  }

  private rowFor(player: RosterEntry): PlayerRow {
    const existing = this.rows.get(player.id);
    if (existing) return existing;
    const row: PlayerRow = {
      root: element("div", "game-info-row"),
      icon: element("span", "game-info-icon"),
      name: element("span", "game-info-name"),
      hero: element("span", "game-info-hero"),
      kills: element("span", "game-info-stat"),
      deaths: element("span", "game-info-stat"),
      assists: element("span", "game-info-stat"),
    };
    const identity = element("div", "game-info-identity");
    identity.append(row.name, row.hero);
    row.root.append(row.icon, identity, row.kills, row.deaths, row.assists);
    this.rows.set(player.id, row);
    return row;
  }

  private setText(node: HTMLElement, text: string) {
    if (this.shown.get(node) === text) return;
    this.shown.set(node, text);
    node.textContent = text;
  }
}

function columnHeader(): HTMLElement {
  const header = element("div", "game-info-row game-info-columns");
  const labels = ["", "Player", "K", "D", "A"];
  for (const label of labels) {
    const cell = element("span", label.length === 1 ? "game-info-stat" : "game-info-label");
    cell.textContent = label;
    header.append(cell);
  }
  return header;
}

function timerText(match: MatchState | undefined): string {
  if (!match || match.phase === "waiting") return "Waiting";
  if (match.phase === "countdown") return "Starting";
  if (match.phase === "ended") return "Ended";
  const seconds = Math.ceil(((match.timeLeftTicks ?? 0) * TICK_MS) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}
