// Sunset Shores — fully synthesised audio: engine hum, police siren,
// gunshots, impacts, chimes and a low sunset-synthwave music loop.
// No audio files: everything is WebAudio oscillators + filtered noise.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicOn = true;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = null;
    this.musicTimer = null;
    this.step = 0;
  }

  // Must be called from a user gesture (start button) at least once.
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.startMusic();
    } catch (e) {
      this.ctx = null; // headless / no audio: the game still runs
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  _noiseBuffer(seconds = 1) {
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * seconds, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _tone(freq, dur, type = 'sine', vol = 0.2, when = 0, slideTo = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  _noise(dur, vol = 0.3, filterFreq = 1200, when = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(dur + 0.1);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  // ---- one-shots ------------------------------------------------------------
  shot() { this._noise(0.16, 0.5, 2800); this._tone(160, 0.1, 'square', 0.25, 0, 60); }
  punch() { this._tone(110, 0.12, 'sine', 0.4, 0, 45); this._noise(0.08, 0.2, 500); }
  crash() { this._noise(0.35, 0.5, 700); this._tone(70, 0.3, 'sine', 0.4, 0, 35); }
  chime() { this._tone(880, 0.12, 'sine', 0.22); this._tone(1318, 0.22, 'sine', 0.2, 0.1); }
  jingle() {
    [523, 659, 784, 1046].forEach((f, i) => this._tone(f, 0.22, 'triangle', 0.22, i * 0.11));
  }
  fail() { this._tone(220, 0.3, 'sawtooth', 0.18, 0, 110); this._tone(165, 0.4, 'sawtooth', 0.15, 0.15, 82); }
  sirenBlip() { this._tone(950, 0.18, 'square', 0.1, 0, 700); }

  // ---- engine loop ----------------------------------------------------------
  setEngine(on, speed01) {
    if (!this.ctx) return;
    if (on && !this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass'; this.engineFilter.frequency.value = 700;
      this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0.0;
      this.engineOsc.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
    }
    if (!this.engineOsc) return;
    const t = this.ctx.currentTime;
    if (on) {
      this.engineOsc.frequency.setTargetAtTime(55 + speed01 * 130, t, 0.08);
      this.engineGain.gain.setTargetAtTime(0.05 + speed01 * 0.06, t, 0.1);
    } else {
      this.engineGain.gain.setTargetAtTime(0.0, t, 0.15);
    }
  }

  // ---- police siren loop ------------------------------------------------------
  setSiren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 750;
      this.sirenGain = this.ctx.createGain(); this.sirenGain.gain.value = 0.045;
      this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      let hi = false;
      this.sirenTimer = setInterval(() => {
        if (!this.sirenOsc) return;
        hi = !hi;
        this.sirenOsc.frequency.setTargetAtTime(hi ? 980 : 720, this.ctx.currentTime, 0.05);
      }, 420);
    } else if (!on && this.sirenOsc) {
      clearInterval(this.sirenTimer); this.sirenTimer = null;
      try { this.sirenOsc.stop(); } catch { /* already stopped */ }
      this.sirenOsc = null;
    }
  }

  // ---- music: Am – F – C – G sunset loop, step-sequenced ----------------------
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    const chords = [
      [220.0, 261.6, 329.6], // Am
      [174.6, 220.0, 261.6], // F
      [261.6, 329.6, 392.0], // C
      [196.0, 246.9, 293.7], // G
    ];
    const bass = [110.0, 87.3, 130.8, 98.0];
    const stepDur = 0.21;
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.muted || !this.musicOn) return;
      const bar = Math.floor(this.step / 8) % 4;
      const s = this.step % 8;
      const chord = chords[bar];
      if (s === 0) this._tone(bass[bar], 1.4, 'triangle', 0.16);
      if (s % 2 === 0) {
        const note = chord[(s / 2) % 3] * 2;
        this._tone(note, stepDur * 1.8, 'sine', 0.05);
      }
      if (s === 4) this._tone(chord[1] * 4, stepDur, 'sine', 0.03);
      this.step++;
    }, stepDur * 1000);
  }
}
