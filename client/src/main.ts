import { ARENA } from "@moba/shared";
import { connectionOptionsFromEnvironment } from "./net/Connection.js";
import { Keyboard } from "./input/keyboard.js";
import { MeshHeroRenderer } from "./render/MeshHeroRenderer.js";
import { SceneRenderer } from "./render/SceneRenderer.js";
import { Game } from "./game/Game.js";
import { Hud } from "./ui/Hud.js";
import { Lobby } from "./ui/Lobby.js";

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

  new Game(scene, connection, new Keyboard(), new MeshHeroRenderer(), hud);
}

start();
