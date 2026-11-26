import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  type Material,
  RedFormat,
  RepeatWrapping,
  UnsignedByteType,
  Vector2,
} from "three";
import { ARENA, castVisibilityRays, type GameMap, type Vec2 } from "@moba/shared";

const UNLIMITED_RADIUS = 1e6;
const EDGE_SOFTNESS = 70;
const LOS_SOFTNESS = 6;
const FOG_BRIGHTNESS = 0.15;
const RAY_COUNT = 512;
const MIN_RECAST_DISTANCE_SQ = 0.25;

const VERTEX_DECLARATIONS = /* glsl */ `
varying vec3 vVisionWorld;
`;

const FRAGMENT_DECLARATIONS = /* glsl */ `
uniform vec2 uVisionCenter;
uniform float uVisionRadius;
uniform float uVisionSoftness;
uniform float uFogBrightness;
uniform sampler2D uVisionRays;
uniform float uRayScale;
uniform float uLosSoftness;
uniform float uLosBias;
varying vec3 vVisionWorld;
`;

const FRAGMENT_APPLY = /* glsl */ `
vec2 visionOffset = vVisionWorld.xz - uVisionCenter;
float visionDistance = length(visionOffset);
float rayU = atan(visionOffset.y, visionOffset.x) * 0.15915494309 + ${(0.5 / RAY_COUNT).toFixed(8)};
float rayReach = texture2D(uVisionRays, vec2(rayU, 0.5)).r * uRayScale + uLosBias;
float visionAmount = 1.0 - smoothstep(uVisionRadius - uVisionSoftness, uVisionRadius, visionDistance);
visionAmount *= 1.0 - smoothstep(rayReach - uLosSoftness, rayReach + uLosSoftness, visionDistance);
gl_FragColor.rgb *= mix(uFogBrightness, 1.0, visionAmount);
#include <fog_fragment>
`;

export interface VisibleArea {
  center: Vec2;
  rays: Float32Array;
}

export class VisionFog {
  private readonly rays = new Float32Array(RAY_COUNT);
  private readonly rayBytes = new Uint8Array(RAY_COUNT).fill(255);
  private readonly rayTexture = new DataTexture(this.rayBytes, RAY_COUNT, 1, RedFormat, UnsignedByteType);
  private readonly center = { x: Number.NaN, y: Number.NaN };
  private radius = UNLIMITED_RADIUS;
  private readonly uniforms = {
    uVisionCenter: { value: new Vector2() },
    uVisionRadius: { value: UNLIMITED_RADIUS },
    uVisionSoftness: { value: EDGE_SOFTNESS },
    uFogBrightness: { value: FOG_BRIGHTNESS },
    uVisionRays: { value: this.rayTexture },
    uRayScale: { value: 0 },
    uLosSoftness: { value: LOS_SOFTNESS },
  };

  constructor(private readonly map: GameMap = ARENA) {
    this.rayTexture.wrapS = RepeatWrapping;
    this.rayTexture.wrapT = ClampToEdgeWrapping;
    this.rayTexture.magFilter = LinearFilter;
    this.rayTexture.minFilter = LinearFilter;
    this.rayTexture.needsUpdate = true;
    this.uniforms.uRayScale.value = this.rayScale();
  }

  setCenter(position: Vec2) {
    this.uniforms.uVisionCenter.value.set(position.x, position.y);
    const dx = position.x - this.center.x;
    const dy = position.y - this.center.y;
    if (dx * dx + dy * dy < MIN_RECAST_DISTANCE_SQ) return;
    this.center.x = position.x;
    this.center.y = position.y;
    this.recast();
  }

  setRadius(radius: number) {
    if (radius === this.radius) return;
    this.radius = radius;
    this.uniforms.uVisionRadius.value = radius;
    this.uniforms.uRayScale.value = this.rayScale();
    if (Number.isFinite(this.center.x)) this.recast();
  }

  disable() {
    this.radius = UNLIMITED_RADIUS;
    this.center.x = Number.NaN;
    this.center.y = Number.NaN;
    this.uniforms.uVisionRadius.value = UNLIMITED_RADIUS;
    this.uniforms.uRayScale.value = UNLIMITED_RADIUS;
    this.rayBytes.fill(255);
    this.rayTexture.needsUpdate = true;
  }

  visibleArea(): VisibleArea | undefined {
    if (!Number.isFinite(this.center.x) || this.radius <= 0 || this.radius >= UNLIMITED_RADIUS) return undefined;
    return { center: this.center, rays: this.rays };
  }

  apply<T extends Material>(material: T, losBias = 0): T {
    const previousCompile = material.onBeforeCompile.bind(material);
    const previousKey = material.customProgramCacheKey.bind(material);
    const losBiasUniform = { value: losBias };

    material.onBeforeCompile = (shader, renderer) => {
      previousCompile(shader, renderer);
      Object.assign(shader.uniforms, this.uniforms, { uLosBias: losBiasUniform });
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>\n${VERTEX_DECLARATIONS}`)
        .replace(
          "#include <project_vertex>",
          "#include <project_vertex>\nvVisionWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;",
        );
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\n${FRAGMENT_DECLARATIONS}`)
        .replace("#include <fog_fragment>", FRAGMENT_APPLY);
    };
    material.customProgramCacheKey = () => `vision-fog|${previousKey()}`;
    return material;
  }

  private rayScale(): number {
    return Math.min(this.radius, Math.hypot(this.map.width, this.map.height));
  }

  private recast() {
    const scale = this.rayScale();
    castVisibilityRays(this.map, this.center, scale, this.rays);
    for (let i = 0; i < RAY_COUNT; i++) {
      this.rayBytes[i] = scale > 0 ? Math.round((this.rays[i] / scale) * 255) : 0;
    }
    this.rayTexture.needsUpdate = true;
  }
}
