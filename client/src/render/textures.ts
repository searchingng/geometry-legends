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
