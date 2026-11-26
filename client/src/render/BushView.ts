import {
  type BufferGeometry,
  Color,
  ConeGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Rect } from "@moba/shared";
import type { VisionFog } from "./VisionFog.js";

const TUFT_SPACING = 24;
const TUFT_JITTER = 8;
const TUFT_MIN_HEIGHT = 16;
const TUFT_MAX_HEIGHT = 27;
const TUFT_MIN_RADIUS = 9;
const TUFT_MAX_RADIUS = 14;
const TUFT_SEGMENTS = 5;
const PATCH_INSET = 2;
const OCCUPIED_OPACITY = 0.4;
const SEE_THROUGH_OPACITY = 0.3;
const TUFT_COLORS = [0x2f8a4a, 0x3aa055, 0x277a43, 0x46b062].map((hex) => new Color(hex));
const PATCH_COLOR = 0x173d2a;

export class BushView {
  readonly root = new Group();
  private readonly activeBush = { value: -1 };
  private readonly seeThrough = { value: 0 };

  constructor(bushes: readonly Rect[], visionFog: VisionFog) {
    if (bushes.length === 0) return;
    const patches = new Mesh(mergeGeometries(bushes.map(createPatch)), new MeshBasicMaterial({ color: PATCH_COLOR }));
    const tufts = new Mesh(
      mergeGeometries(bushes.flatMap((bush, index) => createTufts(bush, index))),
      this.createTuftMaterial(),
    );
    visionFog.apply(patches.material);
    visionFog.apply(tufts.material);
    this.root.add(patches, tufts);
  }

  setOccupiedBush(index: number) {
    this.activeBush.value = index;
  }

  setSeeThrough(enabled: boolean) {
    this.seeThrough.value = enabled ? 1 : 0;
  }

  private createTuftMaterial(): MeshLambertMaterial {
    const material = new MeshLambertMaterial({ vertexColors: true, flatShading: true, transparent: true });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uActiveBush = this.activeBush;
      shader.uniforms.uSeeThrough = this.seeThrough;
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nattribute float bushIndex;\nuniform float uActiveBush;\nuniform float uSeeThrough;\nvarying float vBushAlpha;",
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>\nvBushAlpha = uSeeThrough > 0.5 ? ${SEE_THROUGH_OPACITY.toFixed(2)} : abs(bushIndex - uActiveBush) < 0.5 ? ${OCCUPIED_OPACITY.toFixed(2)} : 1.0;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vBushAlpha;")
        .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.a *= vBushAlpha;");
    };
    material.customProgramCacheKey = () => "bush-tufts";
    return material;
  }
}

function createPatch(bush: Rect): BufferGeometry {
  return new PlaneGeometry(bush.width - PATCH_INSET * 2, bush.height - PATCH_INSET * 2)
    .rotateX(-Math.PI / 2)
    .translate(bush.x + bush.width / 2, 0.6, bush.y + bush.height / 2);
}

function createTufts(bush: Rect, bushIndex: number): BufferGeometry[] {
  const random = seededRandom(bushIndex * 7919 + 17);
  const columns = Math.max(1, Math.round(bush.width / TUFT_SPACING));
  const rows = Math.max(1, Math.round(bush.height / TUFT_SPACING));
  const tufts: BufferGeometry[] = [];

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const radius = TUFT_MIN_RADIUS + random() * (TUFT_MAX_RADIUS - TUFT_MIN_RADIUS);
      const height = TUFT_MIN_HEIGHT + random() * (TUFT_MAX_HEIGHT - TUFT_MIN_HEIGHT);
      const x = bush.x + ((column + 0.5) / columns) * bush.width + (random() - 0.5) * TUFT_JITTER;
      const z = bush.y + ((row + 0.5) / rows) * bush.height + (random() - 0.5) * TUFT_JITTER;
      const geometry = new ConeGeometry(radius, height, TUFT_SEGMENTS, 1, true)
        .rotateY(random() * Math.PI)
        .translate(x, height / 2, z);
      paint(geometry, TUFT_COLORS[Math.floor(random() * TUFT_COLORS.length)], bushIndex);
      tufts.push(geometry);
    }
  }
  return tufts;
}

function paint(geometry: BufferGeometry, color: Color, bushIndex: number) {
  const count = geometry.getAttribute("position").count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) color.toArray(colors, i * 3);
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setAttribute("bushIndex", new Float32BufferAttribute(new Float32Array(count).fill(bushIndex), 1));
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
