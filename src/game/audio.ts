/**
 * All sounds are synthesised with WebAudio, so the game ships with no audio
 * files: lamp hum, paper rustle, hop, howl, quack, chime and friends.
 */
import type { Sfx } from './play.js';

export class SoundBoard {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private hum: { osc: OscillatorNode; gain: GainNode } | null = null;
  private noise: AudioBuffer | null = null;
  muted = false;

  /** Must be called from a user gesture (entering XR, a click). */
  resume(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    void this.ctx.resume();
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running' && !this.muted;
  }

  /** Quiet warm lamp hum, on while the stage is visible. */
  setHum(on: boolean): void {
    if (!this.ctx || !this.master) return;
    if (on && !this.hum) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 60;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      gain.gain.linearRampToValueAtTime(0.025, this.ctx.currentTime + 1.5);
      osc.connect(gain).connect(this.master);
      osc.start();
      this.hum = { osc, gain };
    } else if (!on && this.hum) {
      const { osc, gain } = this.hum;
      gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.3);
      osc.stop(this.ctx.currentTime + 0.35);
      this.hum = null;
    }
  }

  play(s: Sfx): void {
    if (!this.ready) return;
    switch (s) {
      case 'appear': this.sparkle(660, 0.25); break;
      case 'hop': this.sweep(320, 720, 0.18, 'triangle', 0.25); break;
      case 'land': this.thump(140, 0.12); break;
      case 'bonk': this.thump(90, 0.18); break;
      case 'fall': this.sweep(600, 120, 0.5, 'sine', 0.2); break;
      case 'howl': this.howl(); break;
      case 'quack': this.quack(); break;
      case 'paddle': this.splash(0.12); break;
      case 'scare': this.flutter(); break;
      case 'moon': this.chord([392, 494, 587, 784], 1.8, 0.15); break;
      case 'chime': this.chord([523, 659, 784], 0.9, 0.18); break;
      case 'firefly': this.sparkle(1320, 0.4); break;
      case 'paper': this.rustle(0.35); break;
      case 'win': this.chord([523, 659, 784, 1047], 1.4, 0.16); break;
    }
  }

  private env(gain: GainNode, peak: number, attack: number, dur: number): void {
    const t = (this.ctx as AudioContext).currentTime;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  private osc(type: OscillatorType, f: number, dur: number, peak: number, attack = 0.01): OscillatorNode {
    const ctx = this.ctx as AudioContext;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const g = ctx.createGain();
    this.env(g, peak, attack, dur);
    o.connect(g).connect(this.master as GainNode);
    o.start();
    o.stop(ctx.currentTime + dur + 0.05);
    return o;
  }

  private sweep(f0: number, f1: number, dur: number, type: OscillatorType, peak: number): void {
    const o = this.osc(type, f0, dur, peak);
    o.frequency.exponentialRampToValueAtTime(f1, (this.ctx as AudioContext).currentTime + dur);
  }

  private thump(f: number, dur: number): void {
    const o = this.osc('sine', f * 1.6, dur, 0.35, 0.003);
    o.frequency.exponentialRampToValueAtTime(f * 0.6, (this.ctx as AudioContext).currentTime + dur);
  }

  private sparkle(f: number, dur: number): void {
    [1, 1.5, 2].forEach((k, i) => setTimeout(() => this.ready && this.osc('sine', f * k, dur, 0.1), i * 50));
  }

  private chord(freqs: number[], dur: number, peak: number): void {
    freqs.forEach((f, i) => setTimeout(() => this.ready && this.osc('sine', f, dur, peak / Math.sqrt(freqs.length), 0.01), i * 70));
  }

  private noiseBurst(dur: number, filterF: number, q: number, peak: number, type: BiquadFilterType = 'bandpass'): void {
    const ctx = this.ctx as AudioContext;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = filterF;
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g, peak, 0.01, dur);
    src.connect(f).connect(g).connect(this.master as GainNode);
    src.start();
    src.stop(ctx.currentTime + dur + 0.05);
  }

  private rustle(dur: number): void {
    for (let i = 0; i < 4; i++) setTimeout(() => this.ready && this.noiseBurst(dur * 0.4, 2500 + Math.random() * 2000, 0.8, 0.08), i * 60);
  }

  private splash(dur: number): void {
    this.noiseBurst(dur, 900, 1.2, 0.18);
  }

  private flutter(): void {
    for (let i = 0; i < 8; i++) setTimeout(() => this.ready && this.noiseBurst(0.05, 1800, 2, 0.12), i * 45);
    this.sweep(900, 1400, 0.15, 'square', 0.03);
  }

  private quack(): void {
    const ctx = this.ctx as AudioContext;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(420, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(260, ctx.currentTime + 0.16);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1100;
    f.Q.value = 4;
    const g = ctx.createGain();
    this.env(g, 0.25, 0.01, 0.18);
    o.connect(f).connect(g).connect(this.master as GainNode);
    o.start();
    o.stop(ctx.currentTime + 0.25);
  }

  private howl(): void {
    const ctx = this.ctx as AudioContext;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(330, t);
    o.frequency.linearRampToValueAtTime(560, t + 0.35);
    o.frequency.linearRampToValueAtTime(520, t + 1.0);
    o.frequency.linearRampToValueAtTime(380, t + 1.4);
    const vib = ctx.createOscillator();
    vib.frequency.value = 6;
    const vibGain = ctx.createGain();
    vibGain.gain.value = 9;
    vib.connect(vibGain).connect(o.frequency);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.2);
    g.gain.setValueAtTime(0.16, t + 1.0);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    o.connect(f).connect(g).connect(this.master as GainNode);
    o.start();
    vib.start();
    o.stop(t + 1.6);
    vib.stop(t + 1.6);
  }
}
