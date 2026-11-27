import type { Vec2 } from "@moba/shared";
import type { SceneRenderer } from "../render/SceneRenderer.js";

export class Pointer {
  private clientX: number | undefined;
  private clientY: number | undefined;
  private leftClicked = false;
  private leftDown = false;
  private readonly leftClickListeners = new Set<() => boolean>();
  private readonly rightButtonListeners = new Set<(down: boolean) => void>();

  constructor(
    private readonly scene: SceneRenderer,
    target: Window = window,
  ) {
    target.addEventListener("pointermove", (event) => {
      this.clientX = event.clientX;
      this.clientY = event.clientY;
    });
    // Pointer events report a second button pressed while another is held only as pointermove, so per-button mouse events are used.
    target.addEventListener("mousedown", (event) => {
      if (isInteractiveElement(event.target)) return;
      this.clientX = event.clientX;
      this.clientY = event.clientY;
      if (event.button === 0) {
        if (this.notifyLeftClick()) return;
        this.leftClicked = true;
        this.leftDown = true;
      } else if (event.button === 2) {
        this.notifyRightButton(true);
      }
    });
    target.addEventListener("mouseup", (event) => {
      if (event.button === 0) this.leftDown = false;
      else if (event.button === 2) this.notifyRightButton(false);
    });
    target.addEventListener("blur", () => (this.leftDown = false));
    target.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  leftHeld(): boolean {
    return this.leftDown;
  }

  worldPoint(): Vec2 | undefined {
    if (this.clientX === undefined || this.clientY === undefined) return undefined;
    return this.scene.screenToGround(this.clientX, this.clientY);
  }

  consumeLeftClick(): boolean {
    const clicked = this.leftClicked;
    this.leftClicked = false;
    return clicked;
  }

  onLeftClick(handled: () => boolean): () => void {
    this.leftClickListeners.add(handled);
    return () => this.leftClickListeners.delete(handled);
  }

  private notifyLeftClick(): boolean {
    let handled = false;
    for (const listener of this.leftClickListeners) handled = listener() || handled;
    return handled;
  }

  onRightButton(listener: (down: boolean) => void): () => void {
    this.rightButtonListeners.add(listener);
    return () => this.rightButtonListeners.delete(listener);
  }

  private notifyRightButton(down: boolean) {
    for (const listener of this.rightButtonListeners) listener(down);
  }
}

function isInteractiveElement(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("button, input, a, [data-ui]") !== null;
}
