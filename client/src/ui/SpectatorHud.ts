import "./spectator.css";

export interface SpectatedPlayer {
  name: string;
  color: string;
  hp: number;
  maxHp: number;
  down: boolean;
}

export interface SpectatorHudState {
  spectators: number;
  players: readonly (SpectatedPlayer | undefined)[];
  followed: number | undefined;
}

const SEATS = 2;
const HINT = "Wheel zoom · WASD / drag pan · 1 / 2 follow · Space follow / free";

interface Seat {
  root: HTMLElement;
  key: HTMLElement;
  name: HTMLElement;
  fill: HTMLElement;
  value: HTMLElement;
}

export class SpectatorHud {
  private readonly root = element("div", "spectator-hud");
  private readonly badge = element("div", "spectator-badge");
  private readonly seats: Seat[] = [];
  private readonly shown = new Map<HTMLElement, string>();

  constructor() {
    const bars = element("div", "spectator-bars");
    for (let index = 0; index < SEATS; index++) {
      const seat = createSeat(index);
      this.seats.push(seat);
      bars.append(seat.root);
    }
    const hint = element("div", "spectator-hint");
    hint.textContent = HINT;
    this.root.append(this.badge, bars, hint);
    this.root.hidden = true;
    document.body.append(this.root);
  }

  update(state: SpectatorHudState) {
    this.root.hidden = false;
    const watching = state.spectators === 1 ? "1 watching" : `${state.spectators} watching`;
    this.setText(this.badge, `Spectating · ${watching}`);
    this.seats.forEach((seat, index) => this.updateSeat(seat, state.players[index], state.followed === index));
  }

  private updateSeat(seat: Seat, player: SpectatedPlayer | undefined, followed: boolean) {
    seat.root.classList.toggle("followed", followed);
    seat.root.classList.toggle("empty", !player);
    if (!player) {
      this.setText(seat.name, "Waiting for players");
      this.setText(seat.value, "");
      seat.fill.style.width = "0%";
      return;
    }
    seat.root.style.setProperty("--seat-color", player.color);
    this.setText(seat.name, player.name);
    seat.fill.style.width = `${Math.max(0, Math.min(1, player.hp / player.maxHp)) * 100}%`;
    this.setText(
      seat.value,
      player.down ? "respawning…" : `${Math.ceil(player.hp)} / ${player.maxHp}`,
    );
  }

  private setText(node: HTMLElement, text: string) {
    if (this.shown.get(node) === text) return;
    this.shown.set(node, text);
    node.textContent = text;
  }
}

function createSeat(index: number): Seat {
  const root = element("div", "spectator-seat");
  const key = element("kbd", "spectator-key");
  key.textContent = String(index + 1);
  const name = element("span", "spectator-name");
  const bar = element("div", "spectator-bar");
  const fill = element("div", "spectator-fill");
  bar.append(fill);
  const value = element("span", "spectator-value");
  const header = element("div", "spectator-seat-header");
  header.append(key, name, value);
  root.append(header, bar);
  return { root, key, name, fill, value };
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}
