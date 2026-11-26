/**
 * Procedural Web Audio API sound effects synthesizer.
 * Zero external audio files — every combat, gathering, fishing, crafting, and market sound is synthesized live.
 */
class SoundSynth {
  private ctx: AudioContext | null = null;
  public muted = false;
  public volume = 0.75;

  public setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
  }

  private ensureContext(): AudioContext | null {
    if (this.muted || this.volume <= 0.01) return null;
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public unlock(): void {
    this.ensureContext();
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  private tone(
    freqStart: number,
    freqEnd: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    delay = 0,
  ): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const scaledVol = Math.max(0.002, volume * this.volume);
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + duration);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(scaledVol, now + Math.min(0.015, duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private noise(duration: number, volume: number, filterFreq: number, delay = 0): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime + delay;
    const sampleRate = ctx.sampleRate;
    const length = Math.max(1, Math.floor(sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFreq, now);
    filter.Q.setValueAtTime(1.4, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(Math.max(0.002, volume * this.volume), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + duration + 0.02);
  }

  public playSwing(heavy = false): void {
    this.noise(heavy ? 0.16 : 0.1, heavy ? 0.16 : 0.1, heavy ? 420 : 900);
    this.tone(heavy ? 180 : 320, heavy ? 70 : 120, heavy ? 0.15 : 0.09, 'triangle', 0.08);
  }

  public playBow(): void {
    this.tone(520, 160, 0.11, 'triangle', 0.11);
    this.noise(0.07, 0.08, 1800);
  }

  public playMagic(): void {
    this.tone(440, 880, 0.18, 'sine', 0.09);
    this.tone(660, 320, 0.22, 'triangle', 0.06, 0.04);
  }

  public playHit(crit = false): void {
    this.noise(crit ? 0.14 : 0.08, crit ? 0.22 : 0.14, crit ? 720 : 520);
    this.tone(crit ? 260 : 160, 52, crit ? 0.16 : 0.1, 'sawtooth', crit ? 0.14 : 0.09);
    if (crit) {
      this.tone(780, 1120, 0.12, 'triangle', 0.08, 0.02);
    }
  }

  public playDodge(): void {
    this.noise(0.16, 0.12, 1100);
    this.tone(240, 420, 0.13, 'sine', 0.06);
  }

  public playParryStance(): void {
    this.tone(480, 620, 0.12, 'triangle', 0.09);
  }

  public playParrySuccess(): void {
    this.tone(920, 1480, 0.26, 'triangle', 0.16);
    this.tone(1380, 2100, 0.22, 'sine', 0.12, 0.03);
    this.noise(0.09, 0.18, 2600);
  }

  public playGather(kind: 'ore' | 'tree' | 'fiber' | 'stone' | 'herb' | 'skin'): void {
    if (kind === 'ore' || kind === 'stone') {
      this.tone(1150, 740, 0.09, 'triangle', 0.11);
      this.noise(0.06, 0.12, 2200);
    } else if (kind === 'tree') {
      this.tone(170, 82, 0.1, 'square', 0.09);
      this.noise(0.07, 0.12, 650);
    } else {
      this.noise(0.09, 0.1, 1450);
      this.tone(360, 480, 0.08, 'sine', 0.05);
    }
  }

  public playError(): void {
    this.tone(200, 140, 0.14, 'sawtooth', 0.08);
  }

  public playSplash(): void {
    this.noise(0.24, 0.15, 950);
    this.tone(340, 180, 0.18, 'sine', 0.08);
  }

  public playFishBite(): void {
    this.tone(620, 980, 0.14, 'sine', 0.13);
    this.tone(880, 1240, 0.14, 'triangle', 0.1, 0.09);
  }

  public playCatch(): void {
    this.tone(523, 659, 0.12, 'triangle', 0.12, 0);
    this.tone(659, 784, 0.12, 'triangle', 0.12, 0.1);
    this.tone(784, 1046, 0.22, 'triangle', 0.14, 0.2);
  }

  public playCraft(): void {
    this.tone(860, 520, 0.12, 'triangle', 0.13, 0);
    this.tone(1040, 620, 0.16, 'triangle', 0.11, 0.11);
  }

  public playCoin(): void {
    this.tone(1320, 1760, 0.09, 'sine', 0.1, 0);
    this.tone(1760, 2200, 0.14, 'sine', 0.09, 0.07);
  }

  public playMount(): void {
    this.tone(240, 380, 0.16, 'triangle', 0.1);
    this.tone(380, 540, 0.18, 'sine', 0.09, 0.08);
  }

  public playHeal(): void {
    this.tone(440, 660, 0.2, 'sine', 0.1);
    this.tone(660, 880, 0.24, 'sine', 0.08, 0.08);
  }

  public playLevelUp(): void {
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) => {
      this.tone(f, f * 1.02, 0.22, 'triangle', 0.12, i * 0.09);
    });
  }

  public playBossRoar(): void {
    this.tone(130, 58, 0.48, 'sawtooth', 0.16);
    this.noise(0.45, 0.16, 320);
  }
}

export const sound = new SoundSynth();
