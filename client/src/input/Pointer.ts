import type { Vec2 } from "@moba/shared";
import type { SceneRenderer } from "../render/SceneRenderer.js";

export class Pointer {
  private clientX: number | undefined;
  private clientY: number | undefined;
  private leftClicked = false;
  private readonly leftClickListeners = new Set<() => void>();

  constructor(
    private readonly scene: SceneRenderer,
    target: Window = window,
  ) {
    target.addEventListener("pointermove", (event) => {
      this.clientX = event.clientX;
      this.clientY = event.clientY;
    });
    target.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || isInteractiveElement(event.target)) return;
      this.clientX = event.clientX;
      this.clientY = event.clientY;
      this.leftClicked = true;
      for (const listener of this.leftClickListeners) listener();
    });
    target.addEventListener("contextmenu", (event) => event.preventDefault());
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

  onLeftClick(listener: () => void): () => void {
    this.leftClickListeners.add(listener);
    return () => this.leftClickListeners.delete(listener);
  }
}

function isInteractiveElement(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("button, input, a, [data-ui]") !== null;
}
