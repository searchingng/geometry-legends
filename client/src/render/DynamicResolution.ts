const MIN_SCALE = 0.5;
const MAX_SCALE = 1;
const WARMUP_MS = 2000;
const SAMPLE_MS = 1000;
const LOW_FPS = 50;
const HIGH_FPS = 57;
const STEP_DOWN = 0.85;
const STEP_UP = 1.1;
const UPSCALE_COOLDOWN_MS = 8000;
const MIN_DOWNSCALE_GAIN = 1.08;
const NOT_GPU_BOUND_LOCK_MS = 30000;

export class DynamicResolution {
  private sampleStart: number | undefined;
  private frames = 0;
  private startedAt: number | undefined;
  private lastDownscaleAt = -Infinity;
  private lockedUntil = 0;
  private pendingCheck: { fpsBefore: number; previousScale: number } | undefined;

  constructor(
    public scale: number,
    private readonly onChange: (scale: number) => void,
  ) {}

  frame(now: number) {
    this.startedAt ??= now;
    if (now - this.startedAt < WARMUP_MS) return;

    if (document.visibilityState !== "visible") {
      this.sampleStart = undefined;
      return;
    }
    if (this.sampleStart === undefined) {
      this.sampleStart = now;
      this.frames = 0;
      return;
    }

    this.frames++;
    const elapsed = now - this.sampleStart;
    if (elapsed < SAMPLE_MS) return;

    const fps = (this.frames / elapsed) * 1000;
    this.sampleStart = now;
    this.frames = 0;
    this.evaluate(fps, now);
  }

  private evaluate(fps: number, now: number) {
    if (this.pendingCheck) {
      const { fpsBefore, previousScale } = this.pendingCheck;
      this.pendingCheck = undefined;
      if (fps < fpsBefore * MIN_DOWNSCALE_GAIN) {
        this.lockedUntil = now + NOT_GPU_BOUND_LOCK_MS;
        this.setScale(previousScale);
        return;
      }
    }

    if (now < this.lockedUntil) return;

    if (fps < LOW_FPS && this.scale > MIN_SCALE) {
      this.pendingCheck = { fpsBefore: fps, previousScale: this.scale };
      this.lastDownscaleAt = now;
      this.setScale(Math.max(MIN_SCALE, this.scale * STEP_DOWN));
    } else if (fps >= HIGH_FPS && this.scale < MAX_SCALE && now - this.lastDownscaleAt > UPSCALE_COOLDOWN_MS) {
      this.setScale(Math.min(MAX_SCALE, this.scale * STEP_UP));
    }
  }

  private setScale(scale: number) {
    if (scale === this.scale) return;
    this.scale = scale;
    this.onChange(scale);
  }
}
