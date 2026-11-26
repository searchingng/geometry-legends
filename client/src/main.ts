import { ARENA, Message, type SnapshotMessage } from "@moba/shared";
import { type Connection, connectionOptionsFromEnvironment } from "./net/Connection.js";
import { Keyboard } from "./input/keyboard.js";
import { Pointer } from "./input/Pointer.js";
import { MeshHeroRenderer } from "./render/MeshHeroRenderer.js";
import { SceneRenderer } from "./render/SceneRenderer.js";
import { Game } from "./game/Game.js";
import { Hud } from "./ui/Hud.js";
import { Lobby } from "./ui/Lobby.js";
import { HeroPicker } from "./ui/HeroPicker.js";
import { ReconnectOverlay } from "./ui/ReconnectOverlay.js";

const ROOM_PARAM = "room";
const SPECTATE_PARAM = "spectate";

async function start() {
  const hud = new Hud();
  const scene = new SceneRenderer(document.getElementById("app")!, ARENA);
  const lobby = new Lobby(connectionOptionsFromEnvironment());

  const url = new URL(location.href);
  const connection = await lobby.connect(url.searchParams.get(ROOM_PARAM));

  url.searchParams.set(ROOM_PARAM, connection.roomCode);
  url.searchParams.delete(SPECTATE_PARAM);
  history.replaceState(null, "", url);

  const shareUrl = new URL(location.origin + location.pathname);
  shareUrl.searchParams.set(ROOM_PARAM, connection.roomCode);
  hud.showRoom(connection.roomCode, shareUrl.toString());

  new ReconnectOverlay(connection);
  const game = new Game(scene, connection, new Keyboard(), new Pointer(scene), new MeshHeroRenderer(), hud);
  const first = await firstSnapshot(connection);
  if (first.spectating) {
    connection.markSpectator();
    url.searchParams.set(SPECTATE_PARAM, "1");
    history.replaceState(null, "", url);
    return;
  }
  if (connection.resumed && first.roster.some((entry) => entry.id === connection.sessionId)) return;
  game.pickHero(await new HeroPicker().pick());
}

function firstSnapshot(connection: Connection): Promise<SnapshotMessage> {
  return new Promise((resolve) => {
    let settled = false;
    connection.on<SnapshotMessage>(Message.Snapshot, (snapshot) => {
      if (settled) return;
      settled = true;
      resolve(snapshot);
    });
  });
}

start();
