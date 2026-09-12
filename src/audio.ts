import type { GameEvent } from './game';

export class GameAudio {
  context: AudioContext | null = null;
  muted = false;
  playing = false;
  private master: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextNote = 0;
  private beat = 0;
  private chamber = 0;
  private noise: AudioBuffer | null = null;

  async unlock() {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0;
      const compressor = this.context.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.ratio.value = 5;
      this.master.connect(compressor);
      compressor.connect(this.context.destination);
      this.noise = this.context.createBuffer(1, this.context.sampleRate * 0.1, this.context.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let index = 0; index < data.length; index++) data[index] = (Math.random() * 2 - 1) * (1 - index / data.length);
      this.timer = setInterval(() => this.schedule(), 30);
    }
    if (this.context.state === 'suspended') await this.context.resume();
    this.sync(this.playing, this.chamber);
  }

  sync(playing: boolean, chamber: number) {
    const resuming = playing && !this.playing;
    this.playing = playing;
    this.chamber = chamber;
    if (this.context && this.master) {
      const now = this.context.currentTime;
      this.master.gain.setTargetAtTime(playing && !this.muted ? 0.45 : 0, now, 0.012);
      if (resuming) this.nextNote = now + 0.04;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    this.sync(this.playing, this.chamber);
  }

  private tone(note: number, when: number, duration: number, volume: number, type: OscillatorType = 'square', slide = 0) {
    if (!this.context || !this.master) return;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = type;
    const frequency = 440 * 2 ** ((note - 69) / 12);
    oscillator.frequency.setValueAtTime(frequency, when);
    if (slide) oscillator.frequency.exponentialRampToValueAtTime(frequency * slide, when + duration);
    envelope.gain.setValueAtTime(0, when);
    envelope.gain.linearRampToValueAtTime(volume, when + 0.005);
    envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    oscillator.connect(envelope);
    envelope.connect(this.master);
    oscillator.start(when);
    oscillator.stop(when + duration + 0.01);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
  }

  private hat(when: number, strong: boolean) {
    if (!this.context || !this.master || !this.noise) return;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = this.noise;
    filter.type = 'highpass';
    filter.frequency.value = strong ? 1800 : 7000;
    gain.gain.setValueAtTime(strong ? 0.09 : 0.045, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.065);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(when);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }

  private schedule() {
    if (!this.context || !this.playing || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    if (this.nextNote < now) this.nextNote = now + 0.01;
    const melody = [0, 7, 12, 7, 3, 10, 7, 3, 5, 12, 15, 12, 7, 10, 14, 10, 0, 7, 12, 15, 14, 10, 7, 3, 5, 8, 12, 8, 7, 3, 2, 7];
    const roots = [45, 41, 48, 43];
    const transposition = this.chamber % 3;
    while (this.nextNote < now + 0.1) {
      const index = this.beat % 32;
      const root = roots[Math.floor(this.beat / 16) % roots.length] + transposition;
      if (!this.muted) {
        this.tone(69 + transposition + melody[index], this.nextNote, 0.09, index % 4 === 0 ? 0.035 : 0.023);
        if (this.beat % 2 === 0) this.tone(root + (this.beat % 8 === 6 ? 12 : 0), this.nextNote, 0.19, 0.14, 'triangle');
        if (this.beat % 4 === 0) this.tone(48, this.nextNote, 0.095, 0.15, 'sine', 0.25);
        this.hat(this.nextNote, this.beat % 8 === 4);
        if (this.beat % 4 === 2) this.tone(root + 24 + [0, 7, 12][Math.floor(this.beat / 4) % 3], this.nextNote, 0.13, 0.018, 'triangle');
      }
      this.nextNote += 60 / (112 + this.chamber * 2) / 4;
      this.beat++;
    }
  }

  effect(event: GameEvent) {
    if (!this.context || this.muted) return;
    const now = this.context.currentTime;
    if (event === 'hurt' || event === 'lost') this.tone(49, now, 0.3, 0.13, 'sawtooth', 0.3);
    else if (event === 'pulse') this.tone(76, now, 0.35, 0.1, 'triangle', 0.15);
    else {
      const notes = event === 'key' ? [76, 80, 83, 88] : event === 'bridge' ? [55, 62] : event === 'clear' || event === 'won' ? [72, 76, 79, 84] : [79, 86];
      notes.forEach((note, index) => this.tone(note, now + index * 0.07, 0.16, 0.065, 'square'));
    }
  }

  dispose() {
    if (this.timer) clearInterval(this.timer);
    void this.context?.close();
  }
}
