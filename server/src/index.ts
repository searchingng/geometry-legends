import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { DEFAULT_SERVER_PORT, ROOM_NAME } from "@moba/shared";
import { DuelRoom } from "./DuelRoom.js";

const port = Number(process.env.GAME_SERVER_PORT ?? DEFAULT_SERVER_PORT);

const gameServer = new Server({ transport: new WebSocketTransport() });
gameServer.define(ROOM_NAME, DuelRoom);

await gameServer.listen(port);
console.log(`Game server listening on ws://localhost:${port}`);
