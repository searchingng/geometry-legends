import { Client, type Room } from "colyseus.js";
import { DEFAULT_SERVER_PORT, ROOM_NAME } from "@moba/shared";

export interface ConnectionOptions {
  serverUrl: string;
  simulatedLagMs: number;
}

export function connectionOptionsFromEnvironment(): ConnectionOptions {
  const params = new URLSearchParams(location.search);
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  return {
    serverUrl:
      import.meta.env.VITE_SERVER_URL ?? `${protocol}://${location.hostname}:${DEFAULT_SERVER_PORT}`,
    simulatedLagMs: Math.max(0, Number(params.get("lag")) || 0),
  };
}

export class Connection {
  private constructor(
    private readonly room: Room,
    private readonly oneWayDelayMs: number,
  ) {}

  static async create(options: ConnectionOptions, roomCode?: string): Promise<Connection> {
    const room = await new Client(options.serverUrl).create(ROOM_NAME, roomCode ? { roomCode } : {});
    return new Connection(room, options.simulatedLagMs / 2);
  }

  static async joinByCode(options: ConnectionOptions, code: string): Promise<Connection> {
    const room = await new Client(options.serverUrl).joinById(code);
    return new Connection(room, options.simulatedLagMs / 2);
  }

  get sessionId(): string {
    return this.room.sessionId;
  }

  get roomCode(): string {
    return this.room.roomId;
  }

  send(type: string, payload: unknown) {
    this.delay(() => this.room.send(type, payload));
  }

  on<T>(type: string, handler: (payload: T) => void) {
    this.room.onMessage(type, (payload: T) => this.delay(() => handler(payload)));
  }

  onLeave(handler: (code: number) => void) {
    this.room.onLeave(handler);
  }

  private delay(action: () => void) {
    if (this.oneWayDelayMs === 0) action();
    else setTimeout(action, this.oneWayDelayMs);
  }
}
