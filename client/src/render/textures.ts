import { CanvasTexture, SRGBColorSpace, type Texture } from "three";

const SIZE = 128;

let radialGradient: Texture | undefined;

export function radialGradientTexture(): Texture {
  if (radialGradient) return radialGradient;

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(SIZE / 2, SIZE / 2, 0, SIZE / 2, SIZE / 2, SIZE / 2);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.35, "rgba(255,255,255,0.55)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, SIZE, SIZE);

  radialGradient = new CanvasTexture(canvas);
  radialGradient.colorSpace = SRGBColorSpace;
  return radialGradient;
}

const LABEL_FONT_PX = 40;
const LABEL_PADDING_PX = 8;
const LABEL_FONT = `600 ${LABEL_FONT_PX}px ui-monospace, "Cascadia Code", Consolas, monospace`;

export interface LabelTexture {
  texture: Texture;
  aspect: number;
}

export function labelTexture(text: string, color: string): LabelTexture {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d")!;
  context.font = LABEL_FONT;
  const width = Math.ceil(context.measureText(text).width) + LABEL_PADDING_PX * 2;
  const height = LABEL_FONT_PX + LABEL_PADDING_PX * 2;
  canvas.width = width;
  canvas.height = height;

  context.font = LABEL_FONT;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineJoin = "round";
  context.lineWidth = 8;
  context.strokeStyle = "rgba(5, 7, 13, 0.9)";
  context.strokeText(text, width / 2, height / 2);
  context.fillStyle = color;
  context.fillText(text, width / 2, height / 2);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return { texture, aspect: width / height };
}
