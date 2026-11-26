import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  type Object3D,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import type { GameMap, Vec2 } from "@moba/shared";
import { DynamicResolution } from "./DynamicResolution.js";
import { probeGpu, type GpuInfo } from "./gpu.js";

const BACKGROUND = 0x05070d;
const CAMERA_FOV = 40;
const CAMERA_DISTANCE = 1050;
const CAMERA_PITCH_DEG = 56;
const MAX_BASE_PIXEL_RATIO = 1.5;
const SOFTWARE_INITIAL_SCALE = 0.6;
const MAX_FRAME_MS = 250;
const SHAKE_MAX_OFFSET = 16;
const SHAKE_DECAY_PER_MS = 1 / 320;
const SHAKE_FREQUENCY = 0.045;

export interface ScreenPoint {
  x: number;
  y: number;
}

export class SceneRenderer {
  readonly scene = new Scene();
  readonly gpu: GpuInfo;
  private readonly renderer: WebGLRenderer;
  private readonly camera = new PerspectiveCamera(CAMERA_FOV, 1, 10, 5000);
  private readonly resolution: DynamicResolution;
  private readonly basePixelRatio: number;
  private readonly cameraOffset: Vector3;
  private readonly focus = new Vector3();
  private readonly shakeOffset = new Vector3();
  private readonly projected = new Vector3();
  private trauma = 0;
  private lastShakeAt = performance.now();

  constructor(container: HTMLElement, map: GameMap) {
    this.gpu = probeGpu();
    console.info(`[gfx] GPU: ${this.gpu.name}${this.gpu.isSoftware ? " (software rendering)" : ""}`);

    this.renderer = new WebGLRenderer({
      antialias: !this.gpu.isSoftware,
      powerPreference: "high-performance",
      stencil: false,
    });
    this.renderer.toneMapping = ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);

    this.basePixelRatio = this.gpu.isSoftware ? 1 : Math.min(window.devicePixelRatio, MAX_BASE_PIXEL_RATIO);
    this.resolution = new DynamicResolution(this.gpu.isSoftware ? SOFTWARE_INITIAL_SCALE : 1, () =>
      this.applyPixelRatio(),
    );

    this.scene.background = new Color(BACKGROUND);
    this.scene.fog = new Fog(BACKGROUND, 1400, 2600);
    this.addLights();

    const pitch = (CAMERA_PITCH_DEG * Math.PI) / 180;
    this.cameraOffset = new Vector3(0, Math.sin(pitch) * CAMERA_DISTANCE, Math.cos(pitch) * CAMERA_DISTANCE);
    this.focus.set(map.width / 2, 0, map.height / 2);

    window.addEventListener("resize", () => this.resize());
    this.applyPixelRatio();
  }

  get graphicsLabel(): string {
    return `res ${Math.round(this.resolution.scale * 100)}%${this.gpu.isSoftware ? " (software GPU)" : ""}`;
  }

  add(object: Object3D) {
    this.scene.add(object);
  }

  screenToGround(clientX: number, clientY: number): Vec2 | undefined {
    const ndc = new Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    const raycaster = new Raycaster();
    raycaster.setFromCamera(ndc, this.camera);
    const hit = raycaster.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), 0), new Vector3());
    return hit ? { x: hit.x, y: hit.z } : undefined;
  }

  follow(position: Vec2) {
    this.focus.set(position.x, 0, position.y);
    this.placeCamera();
  }

  shake(intensity: number) {
    this.trauma = Math.min(1, this.trauma + Math.max(0, intensity));
  }

  worldToScreen(point: Vec2, height: number, out: ScreenPoint): boolean {
    this.projected.set(point.x, height, point.y).project(this.camera);
    if (this.projected.z > 1) return false;
    out.x = (this.projected.x + 1) * 0.5 * window.innerWidth;
    out.y = (1 - this.projected.y) * 0.5 * window.innerHeight;
    return true;
  }

  render() {
    this.updateShake();
    this.placeCamera();
    this.renderer.render(this.scene, this.camera);
  }

  private placeCamera() {
    this.camera.position.copy(this.focus).add(this.cameraOffset).add(this.shakeOffset);
    this.camera.lookAt(this.focus.x + this.shakeOffset.x, this.shakeOffset.y, this.focus.z + this.shakeOffset.z);
    this.camera.updateMatrixWorld();
  }

  private updateShake() {
    const now = performance.now();
    const elapsed = Math.min(now - this.lastShakeAt, MAX_FRAME_MS);
    this.lastShakeAt = now;
    if (this.trauma <= 0) {
      this.shakeOffset.set(0, 0, 0);
      return;
    }

    this.trauma = Math.max(0, this.trauma - elapsed * SHAKE_DECAY_PER_MS);
    const amplitude = this.trauma * this.trauma * SHAKE_MAX_OFFSET;
    const phase = now * SHAKE_FREQUENCY;
    this.shakeOffset.set(
      amplitude * Math.sin(phase * 1.7),
      amplitude * 0.5 * Math.sin(phase * 2.3 + 1.1),
      amplitude * Math.sin(phase * 1.3 + 2.4),
    );
  }

  onFrame(callback: (frameMs: number) => void) {
    let last = performance.now();
    this.renderer.setAnimationLoop((now) => {
      callback(Math.min(now - last, MAX_FRAME_MS));
      last = now;
      this.resolution.frame(now);
    });
  }

  private addLights() {
    this.scene.add(new AmbientLight(0x8090c0, 0.7));
    this.scene.add(new HemisphereLight(0x9fb4ff, 0x10131f, 0.7));

    const sun = new DirectionalLight(0xffffff, 1.4);
    sun.position.set(-500, 1200, 400);
    this.scene.add(sun);
  }

  private applyPixelRatio() {
    this.renderer.setPixelRatio(this.basePixelRatio * this.resolution.scale);
    this.resize();
  }

  private resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }
}
