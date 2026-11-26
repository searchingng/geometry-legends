export type SoundId =
  | "swing"
  | "zap"
  | "enemySwing"
  | "enemyZap"
  | "hitLanded"
  | "hitTaken"
  | "castDamage"
  | "castControl"
  | "castUtility"
  | "death"
  | "respawn"
  | "kill";

type Voice = (ctx: AudioContext, out: AudioNode, noise: AudioBuffer, t: number) => number;

const MASTER_VOLUME = 0.35;
const MAX_VOICES = 8;
const MIN_REPEAT_MS = 45;
const MUTE_KEY = "moba.sfx.muted";

export class Sfx {
  private ctx: AudioContext | undefined;
  private master: GainNode | undefined;
  private noise: AudioBuffer | undefined;
  private activeVoices = 0;
  private readonly lastPlayed = new Map<SoundId, number>();
  private mutedState = readMuted();
  private readonly listeners = new Set<(muted: boolean) => void>();

  constructor(target: Window = window) {
    const unlock = () => this.unlock();
    target.addEventListener("pointerdown", unlock, true);
    target.addEventListener("keydown", unlock, true);
  }

  get muted(): boolean {
    return this.mutedState;
  }

  get context(): AudioContext | undefined {
    return this.ctx;
  }

  get voices(): number {
    return this.activeVoices;
  }

  onMuteChange(listener: (muted: boolean) => void) {
    this.listeners.add(listener);
  }

  toggleMute() {
    this.mutedState = !this.mutedState;
    writeMuted(this.mutedState);
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.volume(), this.ctx.currentTime, 0.02);
    for (const listener of this.listeners) listener(this.mutedState);
  }

  play(id: SoundId) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise || this.mutedState || ctx.state !== "running") return;
    if (this.activeVoices >= MAX_VOICES) return;

    const nowMs = performance.now();
    if (nowMs - (this.lastPlayed.get(id) ?? -Infinity) < MIN_REPEAT_MS) return;
    this.lastPlayed.set(id, nowMs);

    const duration = VOICES[id](ctx, this.master, this.noise, ctx.currentTime);
    this.activeVoices++;
    setTimeout(() => this.activeVoices--, duration * 1000 + 50);
  }

  private unlock() {
    if (!this.ctx) {
      const AudioCtor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return;
      this.ctx = new AudioCtor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume();
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -10;
      limiter.ratio.value = 8;
      this.master.connect(limiter).connect(this.ctx.destination);
      this.noise = createNoise(this.ctx);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  private volume(): number {
    return this.mutedState ? 0 : MASTER_VOLUME;
  }
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeMuted(muted: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    return;
  }
}

function createNoise(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function envelope(ctx: AudioContext, out: AudioNode, t: number, peak: number, attack: number, decay: number): GainNode {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  gain.connect(out);
  return gain;
}

function tone(
  ctx: AudioContext,
  out: AudioNode,
  t: number,
  type: OscillatorType,
  from: number,
  to: number,
  peak: number,
  decay: number,
  attack = 0.005,
) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + attack + decay);
  osc.connect(envelope(ctx, out, t, peak, attack, decay));
  osc.start(t);
  osc.stop(t + attack + decay + 0.02);
}

function noiseBurst(
  ctx: AudioContext,
  out: AudioNode,
  noise: AudioBuffer,
  t: number,
  filterType: BiquadFilterType,
  from: number,
  to: number,
  peak: number,
  decay: number,
  attack = 0.004,
) {
  const source = ctx.createBufferSource();
  source.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(to, t + attack + decay);
  source.connect(filter).connect(envelope(ctx, out, t, peak, attack, decay));
  source.start(t, Math.random() * 0.5);
  source.stop(t + attack + decay + 0.02);
}

const VOICES: Record<SoundId, Voice> = {
  swing: (ctx, out, noise, t) => {
    noiseBurst(ctx, out, noise, t, "bandpass", 2400, 600, 0.5, 0.12, 0.02);
    return 0.16;
  },
  zap: (ctx, out, _noise, t) => {
    tone(ctx, out, t, "square", 1400, 420, 0.12, 0.1);
    return 0.12;
  },
  enemySwing: (ctx, out, noise, t) => {
    noiseBurst(ctx, out, noise, t, "bandpass", 1300, 320, 0.55, 0.14, 0.025);
    return 0.18;
  },
  enemyZap: (ctx, out, _noise, t) => {
    tone(ctx, out, t, "sawtooth", 800, 240, 0.12, 0.12);
    return 0.14;
  },
  hitLanded: (ctx, out, noise, t) => {
    tone(ctx, out, t, "triangle", 220, 70, 0.6, 0.12);
    noiseBurst(ctx, out, noise, t, "highpass", 3000, 1500, 0.25, 0.04);
    return 0.14;
  },
  hitTaken: (ctx, out, noise, t) => {
    tone(ctx, out, t, "sawtooth", 140, 45, 0.35, 0.2);
    noiseBurst(ctx, out, noise, t, "lowpass", 1200, 200, 0.5, 0.15);
    return 0.22;
  },
  castDamage: (ctx, out, noise, t) => {
    tone(ctx, out, t, "sawtooth", 180, 720, 0.18, 0.22, 0.01);
    noiseBurst(ctx, out, noise, t, "bandpass", 800, 3200, 0.25, 0.2, 0.02);
    return 0.25;
  },
  castControl: (ctx, out, _noise, t) => {
    tone(ctx, out, t, "square", 110, 70, 0.18, 0.3, 0.01);
    tone(ctx, out, t, "sine", 330, 160, 0.3, 0.3, 0.01);
    return 0.32;
  },
  castUtility: (ctx, out, _noise, t) => {
    tone(ctx, out, t, "sine", 600, 1200, 0.25, 0.18, 0.01);
    tone(ctx, out, t + 0.06, "sine", 900, 1800, 0.18, 0.18, 0.01);
    return 0.26;
  },
  death: (ctx, out, noise, t) => {
    tone(ctx, out, t, "triangle", 420, 60, 0.5, 0.8, 0.01);
    noiseBurst(ctx, out, noise, t, "lowpass", 900, 120, 0.35, 0.6);
    return 0.85;
  },
  respawn: (ctx, out, _noise, t) => {
    tone(ctx, out, t, "sine", 392, 400, 0.3, 0.14);
    tone(ctx, out, t + 0.1, "sine", 523, 530, 0.3, 0.14);
    tone(ctx, out, t + 0.2, "sine", 784, 790, 0.3, 0.25);
    return 0.5;
  },
  kill: (ctx, out, _noise, t) => {
    tone(ctx, out, t, "triangle", 660, 665, 0.45, 0.16);
    tone(ctx, out, t + 0.09, "triangle", 990, 995, 0.45, 0.35);
    return 0.48;
  },
};
