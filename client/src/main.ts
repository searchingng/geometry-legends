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

async function start() {
  const hud = new Hud();
  const scene = new SceneRenderer(document.getElementById("app")!, ARENA);
  const lobby = new Lobby(connectionOptionsFromEnvironment());

  const url = new URL(location.href);
  const connection = await lobby.connect(url.searchParams.get(ROOM_PARAM));

  url.searchParams.set(ROOM_PARAM, connection.roomCode);
  history.replaceState(null, "", url);

  const shareUrl = new URL(location.origin + location.pathname);
  shareUrl.searchParams.set(ROOM_PARAM, connection.roomCode);
  hud.showRoom(connection.roomCode, shareUrl.toString());

  new ReconnectOverlay(connection);
  const game = new Game(scene, connection, new Keyboard(), new Pointer(scene), new MeshHeroRenderer(), hud);
  if (connection.resumed && (await alreadyPicked(connection))) return;
  game.pickHero(await new HeroPicker().pick());
}

function alreadyPicked(connection: Connection): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    connection.on<SnapshotMessage>(Message.Snapshot, (snapshot) => {
      if (settled) return;
      settled = true;
      resolve(snapshot.roster.some((entry) => entry.id === connection.sessionId));
    });
  });
}

start();
