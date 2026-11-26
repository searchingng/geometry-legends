import { Client, type Room } from "colyseus.js";
import {
  DEFAULT_SERVER_PORT,
  PICK_TIMEOUT_CLOSE_CODE,
  ROOMS_API_PATH,
  ROOM_NAME,
  type JoinOptions,
} from "@moba/shared";

export interface ConnectionOptions {
  serverUrl: string;
  simulatedLagMs: number;
  spectate: boolean;
}

export type ConnectionStatus = "connected" | "reconnecting" | "lost";

const CONSENTED_CLOSE_CODE = 4000;
const RECONNECT_WINDOW_MS = 20_000;
const FIRST_RETRY_MS = 250;
const MAX_RETRY_MS = 2000;
const TOKEN_KEY_PREFIX = "moba.reconnect.";

export function connectionOptionsFromEnvironment(): ConnectionOptions {
  const params = new URLSearchParams(location.search);
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const defaultUrl = import.meta.env.DEV
    ? `${protocol}://${location.hostname}:${DEFAULT_SERVER_PORT}`
    : `${protocol}://${location.host}`;
  return {
    serverUrl: import.meta.env.VITE_SERVER_URL ?? defaultUrl,
    simulatedLagMs: Math.max(0, Number(params.get("lag")) || 0),
    spectate: params.get("spectate") === "1",
  };
}

export function roomsApiUrl(options: ConnectionOptions): string {
  const url = new URL(options.serverUrl);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.pathname = ROOMS_API_PATH;
  url.search = "";
  return url.toString();
}

type MessageHandler = (payload: unknown) => void;

export class Connection {
  private room!: Room;
  private status: ConnectionStatus = "connected";
  private spectating = false;
  closeCode: number | undefined;
  private leaving = false;
  private readonly messageHandlers: [string, MessageHandler][] = [];
  private readonly leaveHandlers: ((code: number) => void)[] = [];
  private readonly statusListeners: ((status: ConnectionStatus) => void)[] = [];
  private readonly oneWayDelayMs: number;

  private constructor(
    private readonly client: Client,
    room: Room,
    options: ConnectionOptions,
    readonly resumed: boolean,
  ) {
    this.oneWayDelayMs = options.simulatedLagMs / 2;
    this.attach(room);
  }

  static async create(options: ConnectionOptions, roomCode?: string): Promise<Connection> {
    const client = new Client(options.serverUrl);
    const room = await client.create(ROOM_NAME, roomCode ? { roomCode } : {});
    return new Connection(client, room, options, false);
  }

  static async joinByCode(options: ConnectionOptions, code: string, join: JoinOptions = {}): Promise<Connection> {
    const client = new Client(options.serverUrl);
    const room = await client.joinById(code, join);
    return new Connection(client, room, options, false);
  }

  static async resume(options: ConnectionOptions, code: string): Promise<Connection | undefined> {
    const token = readToken(code);
    if (!token) return undefined;
    const client = new Client(options.serverUrl);
    try {
      const room = await client.reconnect(token);
      return new Connection(client, room, options, true);
    } catch {
      clearToken(code);
      return undefined;
    }
  }

  get sessionId(): string {
    return this.room.sessionId;
  }

  get roomCode(): string {
    return this.room.roomId;
  }

  get connectionStatus(): ConnectionStatus {
    return this.status;
  }

  get isSpectator(): boolean {
    return this.spectating;
  }

  markSpectator() {
    this.spectating = true;
    clearToken(this.room.roomId);
  }

  send(type: string, payload: unknown) {
    this.delay(() => {
      if (this.status === "connected") this.room.send(type, payload);
    });
  }

  on<T>(type: string, handler: (payload: T) => void) {
    const wrapped = handler as MessageHandler;
    this.messageHandlers.push([type, wrapped]);
    this.listen(this.room, type, wrapped);
  }

  onLeave(handler: (code: number) => void) {
    this.leaveHandlers.push(handler);
  }

  onStatus(listener: (status: ConnectionStatus) => void) {
    this.statusListeners.push(listener);
  }

  private attach(room: Room) {
    this.room = room;
    if (!this.spectating) writeToken(room.roomId, room.reconnectionToken);
    for (const [type, handler] of this.messageHandlers) this.listen(room, type, handler);
    room.onLeave((code) => {
      if (this.room === room) void this.handleLeave(code);
    });
  }

  private listen(room: Room, type: string, handler: MessageHandler) {
    room.onMessage(type, (payload: unknown) =>
      this.delay(() => {
        if (this.room === room) handler(payload);
      }),
    );
  }

  async leave() {
    this.leaving = true;
    clearToken(this.room.roomId);
    try {
      await this.room.leave(true);
    } catch {
      return;
    }
  }

  private async handleLeave(code: number) {
    if (this.leaving) return;
    if (code === CONSENTED_CLOSE_CODE || code === PICK_TIMEOUT_CLOSE_CODE) {
      this.lose(code);
      return;
    }

    this.setStatus("reconnecting");
    const roomCode = this.room.roomId;
    const token = this.room.reconnectionToken;
    const deadline = performance.now() + RECONNECT_WINDOW_MS;
    let retryMs = FIRST_RETRY_MS;

    while (performance.now() < deadline) {
      await wait(Math.min(retryMs, Math.max(0, deadline - performance.now())));
      retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
      try {
        const room = this.spectating
          ? await this.client.joinById(roomCode, { spectate: true } satisfies JoinOptions)
          : await this.client.reconnect(token);
        this.attach(room);
        this.setStatus("connected");
        return;
      } catch {
        continue;
      }
    }

    clearToken(roomCode);
    this.lose(code);
  }

  private lose(code: number) {
    this.closeCode = code;
    clearToken(this.room.roomId);
    this.setStatus("lost");
    for (const handler of this.leaveHandlers) handler(code);
  }

  private setStatus(status: ConnectionStatus) {
    this.status = status;
    for (const listener of this.statusListeners) listener(status);
  }

  private delay(action: () => void) {
    if (this.oneWayDelayMs === 0) action();
    else setTimeout(action, this.oneWayDelayMs);
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tokenKey(roomCode: string): string {
  return TOKEN_KEY_PREFIX + roomCode;
}

function readToken(roomCode: string): string | undefined {
  try {
    return sessionStorage.getItem(tokenKey(roomCode)) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeToken(roomCode: string, token: string) {
  try {
    sessionStorage.setItem(tokenKey(roomCode), token);
  } catch {
    return;
  }
}

function clearToken(roomCode: string) {
  try {
    sessionStorage.removeItem(tokenKey(roomCode));
  } catch {
    return;
  }
}
