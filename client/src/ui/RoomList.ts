import { getHero, isHeroId, type RoomListResponse, type RoomSummary } from "@moba/shared";
import "./roomList.css";

const POLL_MS = 2000;
const REQUEST_TIMEOUT_MS = 1500;

export type RoomAction = (code: string, spectate: boolean) => void;

interface RoomRow {
  root: HTMLLIElement;
  players: HTMLSpanElement;
  heroes: HTMLSpanElement;
  phase: HTMLSpanElement;
  spectators: HTMLSpanElement;
  join: HTMLButtonElement;
  watch: HTMLButtonElement;
  signature: string;
}

export class RoomList {
  private readonly list = document.createElement("ul");
  private readonly status = document.createElement("p");
  private readonly rows = new Map<string, RoomRow>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private busy = false;

  constructor(
    container: HTMLElement,
    private readonly url: string,
    private readonly onAction: RoomAction,
  ) {
    this.list.className = "room-list";
    this.status.className = "room-list-status";
    this.status.textContent = "Loading rooms…";
    container.append(this.list, this.status);
  }

  start() {
    if (this.running) return;
    this.running = true;
    void this.poll();
  }

  stop() {
    this.running = false;
    clearTimeout(this.timer);
  }

  setBusy(busy: boolean) {
    this.busy = busy;
    for (const row of this.rows.values()) {
      row.join.disabled = busy;
      row.watch.disabled = busy;
    }
  }

  private async poll() {
    if (!this.running) return;
    try {
      this.render(await this.fetchRooms());
    } catch {
      this.showStatus("Can't reach the game server — retrying…");
    }
    if (this.running) this.timer = setTimeout(() => void this.poll(), POLL_MS);
  }

  private async fetchRooms(): Promise<RoomSummary[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(this.url, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as RoomListResponse;
      return Array.isArray(body.rooms) ? body.rooms : [];
    } finally {
      clearTimeout(timeout);
    }
  }

  private render(rooms: RoomSummary[]) {
    const seen = new Set<string>();
    for (const room of rooms) {
      seen.add(room.code);
      const row = this.rows.get(room.code) ?? this.createRow(room.code);
      this.updateRow(row, room);
    }
    for (const [code, row] of this.rows) {
      if (seen.has(code)) continue;
      row.root.remove();
      this.rows.delete(code);
    }
    this.showStatus(rooms.length === 0 ? "No open rooms yet — create one!" : "");
  }

  private createRow(code: string): RoomRow {
    const root = document.createElement("li");
    root.className = "room-row";
    const codeLabel = span("room-code", code);
    const players = span("room-players");
    const heroes = span("room-heroes");
    const phase = span("room-phase");
    const spectators = span("room-spectators");
    const join = button("Join", () => this.onAction(code, false));
    const watch = button("Watch", () => this.onAction(code, true));
    watch.classList.add("room-watch");
    join.disabled = watch.disabled = this.busy;

    const info = document.createElement("div");
    info.className = "room-info";
    info.append(codeLabel, players, heroes, phase, spectators);
    const actions = document.createElement("div");
    actions.className = "room-actions";
    actions.append(join, watch);
    root.append(info, actions);
    this.list.appendChild(root);

    const row = { root, players, heroes, phase, spectators, join, watch, signature: "" };
    this.rows.set(code, row);
    return row;
  }

  private updateRow(row: RoomRow, room: RoomSummary) {
    const signature = `${room.players}|${room.maxPlayers}|${room.spectators}|${room.phase}|${room.heroes.join(",")}`;
    if (signature === row.signature) return;
    row.signature = signature;

    const full = room.players >= room.maxPlayers;
    row.players.textContent = `${room.players}/${room.maxPlayers}`;
    row.players.classList.toggle("room-full", full);
    row.phase.textContent = phaseLabel(room);
    row.phase.dataset.phase = room.phase;
    row.spectators.textContent = room.spectators > 0 ? `${room.spectators} watching` : "";
    row.join.hidden = full;
    row.heroes.replaceChildren(...room.heroes.map(heroBadge));
  }

  private showStatus(text: string) {
    if (this.status.textContent !== text) this.status.textContent = text;
    this.status.hidden = text === "";
  }
}

function phaseLabel(room: RoomSummary): string {
  if (room.phase !== "waiting") return room.phase;
  if (room.heroes.length < room.players) return "choosing heroes";
  return room.players < room.maxPlayers ? "waiting for player" : "waiting";
}

function heroBadge(heroId: string): HTMLElement {
  const badge = span("room-hero");
  if (!isHeroId(heroId)) return badge;
  const hero = getHero(heroId);
  badge.title = hero.name;
  badge.textContent = hero.name;
  badge.style.setProperty("--hero-color", `#${hero.visual.color.toString(16).padStart(6, "0")}`);
  return badge;
}

function span(className: string, text = ""): HTMLSpanElement {
  const element = document.createElement("span");
  element.className = className;
  element.textContent = text;
  return element;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.addEventListener("click", onClick);
  return element;
}
