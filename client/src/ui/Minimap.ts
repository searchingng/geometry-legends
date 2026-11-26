import type { GameMap, Rect, Vec2 } from "@moba/shared";
import type { VisibleArea } from "../render/VisionFog.js";
import "./minimap.css";

const WIDTH_PX = 240;
const SMALL_SCREEN_WIDTH_PX = 160;
const SMALL_SCREEN_BREAKPOINT = 640;
const REDRAW_INTERVAL_MS = 80;
const HERO_DOT_PX = 3.5;
const HIDDEN_RING_PX = 6.5;
const MAP_DIM_ALPHA = 0.35;
const COLORS = {
  floor: "#111a2e",
  wall: "#6f86ff",
  bush: "#2f8a4a",
  vision: "rgba(255, 255, 255, 0.07)",
  me: "#5dffa0",
  enemy: "#ff5a5a",
};

export interface MinimapFrame {
  now: number;
  myPosition: Vec2 | undefined;
  hiddenInBush: boolean;
  enemies: readonly MinimapMarker[];
  visibleArea: VisibleArea | undefined;
  fullView?: boolean;
}

export interface MinimapMarker {
  position: Vec2;
  color?: string;
  hiddenInBush?: boolean;
}

export class Minimap {
  private readonly canvas = document.createElement("canvas");
  private readonly context: CanvasRenderingContext2D;
  private readonly background = document.createElement("canvas");
  private scale = 1;
  private cssScale = 1;
  private lastDrawAt = -Infinity;

  constructor(private readonly map: GameMap) {
    this.canvas.id = "minimap";
    this.canvas.hidden = true;
    this.context = this.canvas.getContext("2d")!;
    document.body.append(this.canvas);
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  update(frame: MinimapFrame) {
    if (this.canvas.hidden) {
      if (!frame.myPosition && frame.enemies.length === 0) return;
      this.canvas.hidden = false;
    }
    if (frame.now - this.lastDrawAt < REDRAW_INTERVAL_MS) return;
    this.lastDrawAt = frame.now;
    this.draw(frame);
  }

  private resize() {
    const cssWidth = window.innerWidth <= SMALL_SCREEN_BREAKPOINT ? SMALL_SCREEN_WIDTH_PX : WIDTH_PX;
    const cssHeight = Math.round((cssWidth * this.map.height) / this.map.width);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    for (const canvas of [this.canvas, this.background]) {
      canvas.width = Math.round(cssWidth * pixelRatio);
      canvas.height = Math.round(cssHeight * pixelRatio);
    }
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    this.scale = this.canvas.width / this.map.width;
    this.cssScale = cssWidth / this.map.width;
    this.drawBackground();
    this.lastDrawAt = -Infinity;
  }

  private drawBackground() {
    const context = this.background.getContext("2d")!;
    context.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    context.fillStyle = COLORS.floor;
    context.fillRect(0, 0, this.map.width, this.map.height);
    fillRects(context, this.map.bushes ?? [], COLORS.bush);
    fillRects(context, this.map.walls, COLORS.wall);
  }

  private draw(frame: MinimapFrame) {
    const context = this.context;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    context.globalAlpha = frame.fullView ? 1 : MAP_DIM_ALPHA;
    context.drawImage(this.background, 0, 0);
    context.globalAlpha = 1;

    if (frame.visibleArea) this.drawVisibleArea(frame.visibleArea);

    context.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    for (const enemy of frame.enemies) {
      const color = enemy.color ?? COLORS.enemy;
      this.drawDot(enemy.position, color);
      if (enemy.hiddenInBush) this.drawRing(enemy.position, color);
    }
    if (frame.myPosition) {
      this.drawDot(frame.myPosition, COLORS.me);
      if (frame.hiddenInBush) this.drawRing(frame.myPosition, COLORS.me);
    }
  }

  private drawVisibleArea({ center, rays }: VisibleArea) {
    const context = this.context;
    context.save();
    context.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    context.beginPath();
    const step = (Math.PI * 2) / rays.length;
    for (let i = 0; i < rays.length; i++) {
      const x = center.x + Math.cos(i * step) * rays[i];
      const y = center.y + Math.sin(i * step) * rays[i];
      if (i === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
    context.clip();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.drawImage(this.background, 0, 0);
    context.fillStyle = COLORS.vision;
    context.fillRect(0, 0, this.canvas.width, this.canvas.height);
    context.restore();
  }

  private drawDot(position: Vec2, color: string) {
    const context = this.context;
    context.fillStyle = color;
    context.beginPath();
    context.arc(position.x, position.y, HERO_DOT_PX / this.cssScale, 0, Math.PI * 2);
    context.fill();
  }

  private drawRing(position: Vec2, color: string) {
    const context = this.context;
    context.strokeStyle = color;
    context.lineWidth = 1 / this.cssScale;
    context.setLineDash([2 / this.cssScale, 2 / this.cssScale]);
    context.beginPath();
    context.arc(position.x, position.y, HIDDEN_RING_PX / this.cssScale, 0, Math.PI * 2);
    context.stroke();
    context.setLineDash([]);
  }
}

function fillRects(context: CanvasRenderingContext2D, rects: readonly Rect[], color: string) {
  context.fillStyle = color;
  for (const rect of rects) context.fillRect(rect.x, rect.y, rect.width, rect.height);
}
