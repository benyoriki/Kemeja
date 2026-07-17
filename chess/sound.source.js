/* =========================================================
   SOUND.JS
   -------------------------------------------------
   Semua efek suara dibuat langsung lewat Web Audio API
   (oscillator + noise envelope), BUKAN file mp3/audio yang
   diputar. Alasannya sederhana: file audio biner tidak bisa
   dibuat lewat kode teks, dan mengandalkan file dummy hanya
   akan menghasilkan suara kosong/rusak. Pendekatan sintesis
   ini justru menjamin SEMUA suara benar-benar berbunyi di
   semua browser tanpa perlu meng-hosting file audio apapun.

   Jika nanti Anda punya file SFX premium (mp3/ogg) sendiri,
   tinggal taruh di chess/assets/audio/ dan ganti isi fungsi
   di bawah ini dengan `new Audio('assets/audio/xxx.mp3').play()`.
========================================================= */

class SoundEngine{
  constructor(){
    this.ctx = null;
    this.muted = localStorage.getItem('chessMuted') === '1';
    this.volume = parseFloat(localStorage.getItem('chessVolume') || '0.6');
  }

  _ensureCtx(){
    if (!this.ctx){
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  setMuted(v){ this.muted = v; localStorage.setItem('chessMuted', v ? '1' : '0'); }
  setVolume(v){ this.volume = v; localStorage.setItem('chessVolume', String(v)); }

  _tone({ freq = 440, dur = 0.15, type = 'sine', gain = 0.25, glideTo = null, delay = 0 }){
    if (this.muted) return;
    const ctx = this._ensureCtx();
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain * this.volume), t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  _noise({ dur = 0.2, gain = 0.2, delay = 0, filterFreq = 2000 }){
    if (this.muted) return;
    const ctx = this._ensureCtx();
    const t0 = ctx.currentTime + delay;
    const bufferSize = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(Math.max(0.0001, gain * this.volume), t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt).connect(g).connect(ctx.destination);
    src.start(t0);
  }

  move(){ this._tone({ freq: 340, dur: .09, type: 'triangle', gain: .22 }); this._noise({ dur:.05, gain:.1, filterFreq:1200 }); }
  capture(){ this._tone({ freq: 220, dur: .16, type: 'sawtooth', gain: .22, glideTo: 120 }); this._noise({ dur:.12, gain:.22, filterFreq:2600 }); }
  check(){ this._tone({ freq: 660, dur: .12, type: 'square', gain: .2 }); this._tone({ freq: 880, dur: .12, type: 'square', gain: .16, delay: .1 }); }
  checkmate(){
    [523, 659, 784, 1046].forEach((f, i) => this._tone({ freq: f, dur: .3, type: 'sawtooth', gain: .22, delay: i * .12 }));
  }
  victory(){
    [523, 659, 784, 1046, 1318].forEach((f, i) => this._tone({ freq: f, dur: .35, type: 'triangle', gain: .25, delay: i * .11 }));
  }
  lose(){
    [440, 392, 349, 293].forEach((f, i) => this._tone({ freq: f, dur: .35, type: 'sine', gain: .2, delay: i * .14 }));
  }
  countdown(){ this._tone({ freq: 880, dur: .08, type: 'square', gain: .18 }); }
  notification(){ this._tone({ freq: 740, dur: .1, type: 'sine', gain: .2 }); this._tone({ freq: 990, dur: .12, type: 'sine', gain: .18, delay: .1 }); }
  challenge(){ this._tone({ freq: 500, dur: .1, type: 'triangle', gain: .22 }); this._tone({ freq: 750, dur: .16, type: 'triangle', gain: .22, delay: .12 }); }
  click(){ this._tone({ freq: 600, dur: .05, type: 'square', gain: .12 }); }
  draw(){ this._tone({ freq: 400, dur: .25, type: 'sine', gain: .18 }); }
}

export const sound = new SoundEngine();
