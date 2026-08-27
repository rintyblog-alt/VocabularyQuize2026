/* ══════════════════════════════════════════════════════════════════════════
   音。**ファイルを 1 つも 置かない。** その場で 作る。

   なぜ:
     ① 著作権の 心配が 消える（要件 27）
     ② 落とす 量が 0。細い 回線でも 遅くならない
     ③ 音の 高さ・長さを その場で 変えられる（連続で 鳴らしても 濁らない）

   iPhone の 事情:
     ・**さわるまで 音は 出せない。** 最初の 指／クリックで 開ける。
     ・開けたあと 画面を 隠すと 止まる。戻ったら 開け直す。
   ══════════════════════════════════════════════════════════════════════════ */

const A4 = 440;
function note(n) { return A4 * Math.pow(2, (n - 69) / 12); }

export class Audio3 {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.enabled = true;
    this.musicOn = true;
    this.volume = 0.7;
    this._unlocked = false;
    this._musicTimer = 0;
    this._bar = 0;
    this._noise = null;
    this._onVis = null;
  }

  /** さわった ときに 呼ぶ。1 回で よい。 */
  unlock() {
    if (this._unlocked) { if (this.ctx && this.ctx.state === "suspended") this.ctx.resume().catch(() => {}); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { this.enabled = false; return; }
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 1; this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0.34; this.musicGain.connect(this.master);
      this._makeNoise();
      this._unlocked = true;
      /* 画面を 隠したら 止める。戻ったら 開け直す。 */
      this._onVis = () => {
        if (!this.ctx) return;
        if (document.hidden) { this.ctx.suspend().catch(() => {}); }
        else { this.ctx.resume().catch(() => {}); }
      };
      document.addEventListener("visibilitychange", this._onVis);
    } catch (e) { this.enabled = false; }
  }

  _makeNoise() {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 0.6;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let s = 12345;
    for (let i = 0; i < len; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      d[i] = (s / 0x3fffffff) - 1;
    }
    this._noise = buf;
  }

  setVolume(v) { this.volume = Math.max(0, Math.min(1, v)); if (this.master) this.master.gain.value = this.volume; }
  setMusic(on) { this.musicOn = !!on; if (this.musicGain) this.musicGain.gain.value = on ? 0.34 : 0; }

  /* ── 部品 ─────────────────────────────────────────────────────── */
  _tone(freq, dur, opt) {
    if (!this.enabled || !this.ctx) return;
    opt = opt || {};
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = opt.type || "triangle";
    o.frequency.setValueAtTime(freq, t);
    if (opt.slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * opt.slide), t + dur);
    const peak = (opt.gain === undefined ? 0.22 : opt.gain);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.02, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(opt.bus || this.sfxGain);
    o.start(t); o.stop(t + dur + 0.02);
  }

  _noiseBurst(dur, freq, q, gain) {
    if (!this.enabled || !this.ctx || !this._noise) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this._noise;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = freq || 900; f.Q.value = q || 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain === undefined ? 0.18 : gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxGain);
    src.start(t); src.stop(t + dur + 0.02);
  }

  /* ── 効果音 ───────────────────────────────────────────────────── */
  ui() { this._tone(note(76), 0.07, { type: "square", gain: 0.10 }); }
  beep(n) {
    if (n >= 1 && n <= 3) this._tone(note(69), 0.16, { type: "square", gain: 0.16 });
    else this._tone(note(81), 0.36, { type: "square", gain: 0.20 });
  }
  jump() { this._tone(note(72), 0.14, { type: "triangle", slide: 1.6, gain: 0.14 }); }
  land() { this._noiseBurst(0.07, 240, 0.9, 0.10); }
  hit() {
    this._noiseBurst(0.16, 420, 0.7, 0.24);
    this._tone(note(45), 0.20, { type: "sawtooth", slide: 0.5, gain: 0.14 });
  }
  bounce() { this._tone(note(64), 0.22, { type: "sine", slide: 2.6, gain: 0.18 }); }
  dive() { this._noiseBurst(0.20, 1400, 0.6, 0.10); }
  correct() {
    const seq = [76, 80, 83];
    seq.forEach((n, i) => setTimeout(() => this._tone(note(n), 0.16, { type: "triangle", gain: 0.18 }), i * 70));
  }
  wrong() {
    this._tone(note(58), 0.20, { type: "square", gain: 0.14 });
    setTimeout(() => this._tone(note(54), 0.26, { type: "square", gain: 0.13 }), 120);
  }
  checkpoint() {
    [72, 79].forEach((n, i) => setTimeout(() => this._tone(note(n), 0.20, { type: "sine", gain: 0.18 }), i * 90));
  }
  finish() {
    [72, 76, 79, 84].forEach((n, i) => setTimeout(() => this._tone(note(n), 0.30, { type: "triangle", gain: 0.20 }), i * 110));
  }
  respawn() { this._tone(note(60), 0.24, { type: "sine", slide: 0.55, gain: 0.14 }); }

  /** 結果画面の 短い 曲 */
  results(win) {
    const seq = win ? [72, 76, 79, 84, 88] : [69, 67, 64, 60];
    seq.forEach((n, i) => setTimeout(() => this._tone(note(n), 0.36, { type: "triangle", gain: 0.16 }), i * 150));
  }

  /** sim の 出来事を そのまま 受ける */
  onEvent(e, localPlayer) {
    if (!this.enabled || !this.ctx) return;
    const mine = !e.p || e.p === localPlayer;
    if (!mine && e.t !== "finish") return;   /* 他人の 音は うるさいので 出さない */
    switch (e.t) {
      case "jump": this.jump(); break;
      case "land": this.land(); break;
      case "hit": this.hit(); break;
      case "bounce": this.bounce(); break;
      case "dive": this.dive(); break;
      case "respawn": this.respawn(); break;
      case "checkpoint": this.checkpoint(); break;
      case "finish": if (mine) this.finish(); break;
      case "gate-answer": if (mine) (e.correct === true ? this.correct() : this.wrong()); break;
      case "go": this.beep(0); break;
      default: break;
    }
  }

  /* ── 曲。和音の 進行を 順に 鳴らすだけ。 */
  startMusic(mood) {
    if (!this.enabled || !this.ctx || !this.musicOn) return;
    this.stopMusic();
    /* Ⅰ Ⅴ Ⅵ Ⅳ（明るい）／ Ⅵ Ⅳ Ⅰ Ⅴ（落ち着く） */
    const prog = mood === "calm" ? [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
      : [[48, 52, 55], [55, 59, 62], [57, 60, 64], [53, 57, 60]];
    const bpm = mood === "calm" ? 84 : 124;
    const beat = 60 / bpm;
    this._bar = 0;
    const step = () => {
      if (!this.ctx || !this.musicOn) return;
      const ch = prog[this._bar % prog.length];
      for (const n of ch) this._tone(note(n + 12), beat * 1.7, { type: "sine", gain: 0.05, bus: this.musicGain });
      this._tone(note(ch[0]), beat * 1.9, { type: "triangle", gain: 0.06, bus: this.musicGain });
      /* 拍 */
      if (mood !== "calm") {
        setTimeout(() => this._noiseBurst(0.05, 3600, 2.0, 0.03), beat * 500);
      }
      this._bar++;
      this._musicTimer = setTimeout(step, beat * 2000);
    };
    step();
  }
  stopMusic() { if (this._musicTimer) { clearTimeout(this._musicTimer); this._musicTimer = 0; } }

  destroy() {
    this.stopMusic();
    if (this._onVis) { try { document.removeEventListener("visibilitychange", this._onVis); } catch (e) {} this._onVis = null; }
    if (this.ctx) { try { this.ctx.close(); } catch (e) {} this.ctx = null; }
    this._unlocked = false;
  }
}

export default Audio3;
