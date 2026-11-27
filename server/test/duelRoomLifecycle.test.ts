import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, type Room } from "colyseus.js";
import { ROOM_NAME } from "@moba/shared";
import { DuelRoom } from "../src/DuelRoom.js";

let httpServer: HttpServer;
let gameServer: Server;
let endpoint = "";

beforeAll(async () => {
  httpServer = createServer();
  gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
  gameServer.define(ROOM_NAME, DuelRoom);
  await gameServer.listen(0);
  endpoint = `ws://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await gameServer.gracefullyShutdown(false);
});

function join(room: Room | undefined, options: { name?: string; spectate?: boolean }): Promise<Room> {
  const client = new Client(endpoint);
  return room ? client.joinById(room.roomId, options) : client.create(ROOM_NAME, options);
}

async function waitFor(condition: () => boolean | Promise<boolean>, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function listedCodes(): Promise<string[]> {
  const rooms = await matchMaker.query({ name: ROOM_NAME });
  return rooms.map((room) => room.roomId);
}

describe("DuelRoom lifecycle on quit", () => {
  it("keeps the room while one player stays and disposes it when the last one quits", async () => {
    const first = await join(undefined, { name: "alpha" });
    const second = await join(first, { name: "bravo" });
    const code = first.roomId;

    await first.leave(true);
    await waitFor(async () => {
      const room = (await matchMaker.query({ roomId: code }))[0];
      return room?.metadata?.players === 1;
    });
    expect(matchMaker.getLocalRoomById(code)).toBeDefined();

    await second.leave(true);
    await waitFor(() => matchMaker.getLocalRoomById(code) === undefined);
    expect(await listedCodes()).not.toContain(code);
  });

  it("closes the room for spectators once the last player quits", async () => {
    const player = await join(undefined, { name: "charlie" });
    const spectator = await join(player, { spectate: true });
    const code = player.roomId;
    let spectatorLeft = false;
    spectator.onLeave(() => (spectatorLeft = true));

    await player.leave(true);
    await waitFor(() => matchMaker.getLocalRoomById(code) === undefined && spectatorLeft);
    expect(await listedCodes()).not.toContain(code);
  });

  it("keeps the room when only a spectator quits", async () => {
    const player = await join(undefined, { name: "delta" });
    const spectator = await join(player, { spectate: true });
    const code = player.roomId;

    await spectator.leave(true);
    await waitFor(async () => {
      const room = (await matchMaker.query({ roomId: code }))[0];
      return room?.metadata?.spectators === 0;
    });
    expect(matchMaker.getLocalRoomById(code)).toBeDefined();

    await player.leave(true);
    await waitFor(() => matchMaker.getLocalRoomById(code) === undefined);
  });

  it("frees the room code so a new room can reuse it", async () => {
    const player = await join(undefined, { name: "echo" });
    const code = player.roomId;
    await player.leave(true);
    await waitFor(() => matchMaker.getLocalRoomById(code) === undefined);

    const reused = await new Client(endpoint).create(ROOM_NAME, { name: "echo", roomCode: code });
    expect(reused.roomId).toBe(code);
    await reused.leave(true);
    await waitFor(() => matchMaker.getLocalRoomById(code) === undefined);
  });
});
