import { getHero, isHeroId, type AdminMatch, type AdminMatchPlayer, type AdminUser } from "@moba/shared";

export interface Column<T> {
  title: string;
  cell(row: T): Node | string;
}

export function userColumns(onOpenMatches: (username: string) => void): Column<AdminUser>[] {
  return [
    {
      title: "Username",
      cell: (user) => button(user.username, () => onOpenMatches(user.username), "Show this user's matches"),
    },
    { title: "Matches", cell: (user) => String(user.matches) },
    { title: "Wins", cell: (user) => `${user.wins} (${percent(user.wins, user.matches)})` },
    { title: "Kills", cell: (user) => String(user.kills) },
    { title: "Last IP", cell: (user) => user.lastIp ?? "—" },
    { title: "IPs", cell: ipList },
    { title: "Last seen", cell: (user) => formatDate(user.lastSeenAt) },
    { title: "Created", cell: (user) => formatDate(user.createdAt) },
  ];
}

export function matchColumns(onOpenUser: (username: string) => void): Column<AdminMatch>[] {
  return [
    { title: "Ended", cell: (match) => formatDate(match.endedAt) },
    { title: "Players", cell: (match) => playersCell(match.players, onOpenUser) },
    { title: "Score", cell: (match) => match.players.map((player) => player.kills).join(" : ") },
    { title: "Winner", cell: (match) => match.players.find((player) => player.won)?.username ?? "Draw" },
    { title: "Reason", cell: (match) => match.endReason },
    { title: "Duration", cell: (match) => formatDuration(match.durationMs) },
    { title: "Room", cell: (match) => match.roomCode },
  ];
}

function playersCell(players: AdminMatchPlayer[], onOpenUser: (username: string) => void): Node {
  const cell = document.createElement("div");
  cell.className = "admin-players";
  for (const player of players) {
    const line = document.createElement("div");
    if (player.won) line.className = "admin-winner";
    line.append(
      button(player.username, () => onOpenUser(player.username), "Filter by this user"),
      ` · ${heroName(player.heroId)}`,
    );
    cell.append(line);
  }
  return cell;
}

function ipList(user: AdminUser): Node | string {
  if (user.ips.length === 0) return "—";
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = String(user.ips.length);
  details.append(summary);
  for (const ip of user.ips) {
    const line = document.createElement("div");
    line.textContent = `${ip.ip} · ${ip.times}× · last ${formatDate(ip.lastSeenAt)}`;
    details.append(line);
  }
  return details;
}

function button(text: string, onClick: () => void, title: string): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "admin-link";
  element.textContent = text;
  element.title = title;
  element.onclick = onClick;
  return element;
}

function heroName(heroId: string): string {
  return isHeroId(heroId) ? getHero(heroId).name : heroId;
}

function percent(part: number, whole: number): string {
  return whole === 0 ? "—" : `${Math.round((part / whole) * 100)}%`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
