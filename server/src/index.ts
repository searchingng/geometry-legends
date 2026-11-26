import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { DEFAULT_SERVER_PORT, ROOM_NAME } from "@moba/shared";
import { DuelRoom } from "./DuelRoom.js";
import { staticFileHandler } from "./staticFiles.js";
import { handleRoomList, isRoomListRequest } from "./roomList.js";

const production = process.env.NODE_ENV === "production";
const port = Number(
  process.env.GAME_SERVER_PORT ?? (production ? process.env.PORT : undefined) ?? DEFAULT_SERVER_PORT,
);
const clientDist = process.env.CLIENT_DIST ?? fileURLToPath(new URL("../../client/dist", import.meta.url));
const serveClient = staticFileHandler(clientDist);

const httpServer = createServer((req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }).end("ok");
    return;
  }
  if (isRoomListRequest(req)) {
    void handleRoomList(req, res);
    return;
  }
  if (serveClient) {
    serveClient(req, res);
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
});

const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
gameServer.define(ROOM_NAME, DuelRoom);

await gameServer.listen(port);
console.log(`Game server listening on port ${port}${serveClient ? `, serving client from ${clientDist}` : ""}`);
