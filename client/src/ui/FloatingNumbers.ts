import type { Vec2 } from "@moba/shared";
import type { PositionLookup } from "../render/AttackEffects.js";
import type { ScreenPoint, SceneRenderer } from "../render/SceneRenderer.js";

export type NumberStyle = "dealt" | "neutral" | "taken" | "heal" | "absorb";

const POOL_SIZE = 32;
const LIFETIME_MS = 800;
const RISE_PX = 56;
const POP_MS = 120;
const POP_SCALE = 1.45;
const FADE_START = 0.55;
const ANCHOR_HEIGHT = 85;
const JITTER_PX = 10;
const STACK_WINDOW_MS = 200;
const STACK_STEP_PX = 20;
const STACK_LIMIT = 4;

interface FloatingNumber {
  element: HTMLDivElement;
  targetId: string;
  anchor: Vec2;
  ageMs: number;
  jitterX: number;
  stackY: number;
  active: boolean;
  shown: boolean;
}

export class FloatingNumbers {
  private readonly pool: FloatingNumber[] = [];
  private readonly screen: ScreenPoint = { x: 0, y: 0 };
  private readonly stacks = new Map<string, { at: number; count: number }>();
  private next = 0;

  constructor(
    layer: HTMLElement,
    private readonly scene: SceneRenderer,
  ) {
    for (let i = 0; i < POOL_SIZE; i++) {
      const element = document.createElement("div");
      element.className = "cf-number";
      layer.appendChild(element);
      this.pool.push({
        element,
        targetId: "",
        anchor: { x: 0, y: 0 },
        ageMs: 0,
        jitterX: 0,
        stackY: 0,
        active: false,
        shown: false,
      });
    }
  }

  spawn(targetId: string, text: string, style: NumberStyle, viewPosition: PositionLookup) {
    const position = viewPosition(targetId);
    if (!position) return;

    const number = this.pool[this.next];
    this.next = (this.next + 1) % POOL_SIZE;
    number.targetId = targetId;
    number.anchor.x = position.x;
    number.anchor.y = position.y;
    number.ageMs = 0;
    const stackIndex = this.stackIndex(targetId);
    number.jitterX = (Math.random() * 2 - 1) * JITTER_PX;
    number.stackY = stackIndex * STACK_STEP_PX;
    number.active = true;
    number.element.textContent = text;
    number.element.className = `cf-number cf-${style}`;
  }

  update(frameMs: number, viewPosition: PositionLookup) {
    for (const number of this.pool) {
      if (!number.active) continue;
      number.ageMs += frameMs;
      if (number.ageMs >= LIFETIME_MS) {
        number.active = false;
        this.setShown(number, false);
        continue;
      }

      const position = viewPosition(number.targetId);
      if (position) {
        number.anchor.x = position.x;
        number.anchor.y = position.y;
      }
      if (!this.scene.worldToScreen(number.anchor, ANCHOR_HEIGHT, this.screen)) {
        this.setShown(number, false);
        continue;
      }

      const t = number.ageMs / LIFETIME_MS;
      const rise = RISE_PX * (1 - (1 - t) * (1 - t));
      const pop = number.ageMs < POP_MS ? POP_SCALE - (POP_SCALE - 1) * (number.ageMs / POP_MS) : 1;
      const opacity = t < FADE_START ? 1 : 1 - (t - FADE_START) / (1 - FADE_START);
      const style = number.element.style;
      style.transform = `translate3d(${(this.screen.x + number.jitterX).toFixed(1)}px,${(this.screen.y - rise - number.stackY).toFixed(1)}px,0) translate(-50%,-50%) scale(${pop.toFixed(3)})`;
      style.opacity = opacity.toFixed(3);
      this.setShown(number, true);
    }
  }

  private stackIndex(targetId: string): number {
    const now = performance.now();
    const stack = this.stacks.get(targetId);
    if (!stack || now - stack.at > STACK_WINDOW_MS) {
      this.stacks.set(targetId, { at: now, count: 1 });
      return 0;
    }
    stack.at = now;
    return stack.count++ % STACK_LIMIT;
  }

  private setShown(number: FloatingNumber, shown: boolean) {
    if (number.shown === shown) return;
    number.shown = shown;
    number.element.style.visibility = shown ? "visible" : "hidden";
  }
}
