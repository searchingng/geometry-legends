import type { IncomingMessage, ServerResponse } from "node:http";
import { matchMaker } from "colyseus";
import {
  MAX_PLAYERS,
  ROOMS_API_PATH,
  ROOM_NAME,
  type MatchPhase,
  type RoomListResponse,
  type RoomSummary,
} from "@moba/shared";

interface ListedRoom {
  roomId: string;
  createdAt?: Date | string | number;
  metadata?: Partial<Omit<RoomSummary, "code" | "maxPlayers">>;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "no-store",
};

export function isRoomListRequest(req: IncomingMessage): boolean {
  return (req.url ?? "").split("?")[0] === ROOMS_API_PATH;
}

export async function handleRoomList(req: IncomingMessage, res: ServerResponse) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS).end();
    return;
  }
  if (req.method !== "GET") {
    res.writeHead(405, { ...CORS_HEADERS, Allow: "GET, OPTIONS" }).end();
    return;
  }

  try {
    const rooms = (await matchMaker.query({ name: ROOM_NAME })) as ListedRoom[];
    const body: RoomListResponse = { rooms: summarizeRooms(rooms) };
    res.writeHead(200, { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify(body));
  } catch {
    res.writeHead(500, { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" }).end('{"rooms":[]}');
  }
}

export function summarizeRooms(rooms: readonly ListedRoom[]): RoomSummary[] {
  return [...rooms]
    .filter((room) => (room.metadata?.players ?? 0) > 0)
    .sort((a, b) => timeOf(b.createdAt) - timeOf(a.createdAt))
    .map((room) => ({
      code: room.roomId,
      players: room.metadata?.players ?? 0,
      maxPlayers: MAX_PLAYERS,
      spectators: room.metadata?.spectators ?? 0,
      phase: (room.metadata?.phase ?? "waiting") as MatchPhase,
      heroes: room.metadata?.heroes ?? [],
    }));
}

function timeOf(value: Date | string | number | undefined): number {
  if (value === undefined) return 0;
  return new Date(value).getTime() || 0;
}
