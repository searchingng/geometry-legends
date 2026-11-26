import type { HeroId, SkillSlot, SnapshotMessage, Vec2, VisiblePlayer } from "@moba/shared";
import type { PositionLookup } from "../render/AttackEffects.js";
import type { Connection } from "../net/Connection.js";
import type { Keyboard } from "../input/keyboard.js";
import type { Pointer } from "../input/Pointer.js";
import type { SceneRenderer } from "../render/SceneRenderer.js";
import type { Hud } from "../ui/Hud.js";

export interface GameServices {
  connection: Connection;
  keyboard: Keyboard;
  pointer: Pointer;
  scene: SceneRenderer;
  hud: Hud;
  predictLocalCast(slot: SkillSlot, aim: Vec2): void;
}

export interface VisibleEnemy {
  id: string;
  heroId: HeroId;
  position: Vec2;
}

export interface FrameContext {
  now: number;
  frameMs: number;
  myId: string;
  myHeroId: HeroId | undefined;
  myPosition: Vec2 | undefined;
  me: VisiblePlayer | undefined;
  dead: boolean;
  spectating: boolean;
  inputLocked: boolean;
  enemies: VisibleEnemy[];
  viewPosition: PositionLookup;
}

export interface SnapshotContext {
  myId: string;
  heroIds: ReadonlyMap<string, HeroId>;
  snapshot: SnapshotMessage;
  viewPosition: PositionLookup;
}
