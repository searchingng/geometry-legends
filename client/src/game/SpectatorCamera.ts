import { clamp, type GameMap, type Vec2 } from "@moba/shared";
import type { Keyboard } from "../input/keyboard.js";
import type { SceneRenderer } from "../render/SceneRenderer.js";

const OVERVIEW_DISTANCE = 1950;
const MIN_DISTANCE = 650;
const MAX_DISTANCE = 2300;
const FOLLOW_DISTANCE = 1250;
const WHEEL_ZOOM_RATE = 0.0012;
const PAN_SPEED_PER_DISTANCE = 0.9;
const FOCUS_HALF_LIFE_MS = 110;
const ZOOM_HALF_LIFE_MS = 90;
const FOLLOW_KEYS: Record<string, number> = { Digit1: 0, Numpad1: 0, Digit2: 1, Numpad2: 1 };

export type CameraMode = "follow" | "free";

export class SpectatorCamera {
  private readonly focus: Vec2;
  private readonly targetFocus: Vec2;
  private distance = OVERVIEW_DISTANCE;
  private targetDistance = OVERVIEW_DISTANCE;
  private followIndex = 0;
  private dragAnchor: Vec2 | undefined;
  private active = false;
  mode: CameraMode = "free";

  constructor(
    private readonly scene: SceneRenderer,
    private readonly keyboard: Keyboard,
    private readonly map: GameMap,
  ) {
    this.focus = { x: map.width / 2, y: map.height / 2 };
    this.targetFocus = { ...this.focus };
  }

  get followedIndex(): number | undefined {
    return this.mode === "follow" ? this.followIndex : undefined;
  }

  activate() {
    if (this.active) return;
    this.active = true;
    const canvas = document.querySelector("canvas");
    window.addEventListener("wheel", (event) => this.onWheel(event), { passive: false });
    window.addEventListener("keydown", (event) => this.onKey(event));
    canvas?.addEventListener("pointerdown", (event) => this.startDrag(event));
    window.addEventListener("pointermove", (event) => this.drag(event));
    window.addEventListener("pointerup", () => (this.dragAnchor = undefined));
    canvas?.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  update(frameMs: number, players: readonly (Vec2 | undefined)[]) {
    if (this.keyboard.consumeAttackTap()) this.toggleMode();

    const pan = this.keyboard.moveDirection();
    if (pan.x !== 0 || pan.y !== 0) {
      this.mode = "free";
      const step = this.targetDistance * PAN_SPEED_PER_DISTANCE * (frameMs / 1000);
      this.targetFocus.x += pan.x * step;
      this.targetFocus.y += pan.y * step;
    }

    const followed = this.mode === "follow" ? players[this.followIndex] : undefined;
    if (followed) {
      this.targetFocus.x = followed.x;
      this.targetFocus.y = followed.y;
    }
    this.targetFocus.x = clamp(this.targetFocus.x, 0, this.map.width);
    this.targetFocus.y = clamp(this.targetFocus.y, 0, this.map.height);

    if (!this.dragAnchor) {
      const focusBlend = smoothing(frameMs, FOCUS_HALF_LIFE_MS);
      this.focus.x += (this.targetFocus.x - this.focus.x) * focusBlend;
      this.focus.y += (this.targetFocus.y - this.focus.y) * focusBlend;
    }
    this.distance += (this.targetDistance - this.distance) * smoothing(frameMs, ZOOM_HALF_LIFE_MS);

    this.scene.setCameraDistance(this.distance);
    this.scene.follow(this.focus);
  }

  private toggleMode() {
    if (this.mode === "follow") {
      this.mode = "free";
      return;
    }
    this.follow(this.followIndex);
  }

  private follow(index: number) {
    this.mode = "follow";
    this.followIndex = index;
    this.targetDistance = Math.min(this.targetDistance, FOLLOW_DISTANCE);
  }

  private onWheel(event: WheelEvent) {
    event.preventDefault();
    this.targetDistance = clamp(this.targetDistance * Math.exp(event.deltaY * WHEEL_ZOOM_RATE), MIN_DISTANCE, MAX_DISTANCE);
  }

  private onKey(event: KeyboardEvent) {
    const index = FOLLOW_KEYS[event.code];
    if (index === undefined || event.repeat) return;
    event.preventDefault();
    this.follow(index);
  }

  private startDrag(event: PointerEvent) {
    this.dragAnchor = this.scene.screenToGround(event.clientX, event.clientY);
    if (this.dragAnchor) this.mode = "free";
  }

  private drag(event: PointerEvent) {
    if (!this.dragAnchor) return;
    if (event.buttons === 0) {
      this.dragAnchor = undefined;
      return;
    }
    const ground = this.scene.screenToGround(event.clientX, event.clientY);
    if (!ground) return;
    this.focus.x = clamp(this.focus.x + this.dragAnchor.x - ground.x, 0, this.map.width);
    this.focus.y = clamp(this.focus.y + this.dragAnchor.y - ground.y, 0, this.map.height);
    this.targetFocus.x = this.focus.x;
    this.targetFocus.y = this.focus.y;
    this.scene.follow(this.focus);
  }
}

function smoothing(frameMs: number, halfLifeMs: number): number {
  return 1 - Math.pow(0.5, frameMs / halfLifeMs);
}
