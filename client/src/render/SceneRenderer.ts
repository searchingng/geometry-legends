import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  type Object3D,
  PerspectiveCamera,
  Scene,
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

export class SceneRenderer {
  readonly scene = new Scene();
  readonly gpu: GpuInfo;
  private readonly renderer: WebGLRenderer;
  private readonly camera = new PerspectiveCamera(CAMERA_FOV, 1, 10, 5000);
  private readonly resolution: DynamicResolution;
  private readonly basePixelRatio: number;
  private readonly cameraOffset: Vector3;
  private readonly focus = new Vector3();

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

  follow(position: Vec2) {
    this.focus.set(position.x, 0, position.y);
  }

  render() {
    this.camera.position.copy(this.focus).add(this.cameraOffset);
    this.camera.lookAt(this.focus);
    this.renderer.render(this.scene, this.camera);
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
