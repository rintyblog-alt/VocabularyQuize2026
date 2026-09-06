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

  /* ★ ごほうびの 音（2026-08-31）。結果の 板に 記章と 育ちを 出した のに
     **音が 何も 変わらなかった**。積み上がった ことは 耳でも 分かる ほうが 良い。
     ★ 決めごと: 短く（1 秒 以内）・結果の 曲と 重ならない ように 少し 遅らせる。 */
  /** 記章（銅=1 / 銀=2 / 金=3）。上ほど 高く、金だけ 3 音。 */
  medal(rank) {
    const r = Math.max(1, Math.min(3, rank | 0));
    const base = 72 + (r - 1) * 4;
    const seq = r >= 3 ? [base, base + 5, base + 12] : (r === 2 ? [base, base + 7] : [base]);
    seq.forEach((n, i) => setTimeout(() =>
      this._tone(note(n), 0.32, { type: "sine", gain: 0.19 }), 620 + i * 130));
  }
  /** 種が 育った。上へ 伸びる 音（滑らせる）。 */
  grow() {
    setTimeout(() => this._tone(note(64), 0.55, { type: "triangle", slide: 2.2, gain: 0.17 }), 980);
    setTimeout(() => this._tone(note(76), 0.42, { type: "sine", gain: 0.14 }), 1180);
  }

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

  /* ══ 曲（2026-08-31・訴え「世界観」）════════════════════════════════
     ★ 直す前は **2 種類しか なかった**（落ち着く／走る）。
       氷でも 溶岩でも ネオンでも 同じ 曲が 流れ、
       せっかく 風景を 10 種類 作っても 耳では 同じ 場所だった。
     ★ 風景ごとに 「調・速さ・音色・拍」を 変える。
       音源ファイルは 置かない（0 バイトの まま）。
     ★ 声は 4 つまで（土台・和音・旋律・拍）。増やすと 端末が つらい。 */
  startMusic(mood) {
    if (!this.enabled || !this.ctx || !this.musicOn) return;
    this.stopMusic();
    const M = MOODS[mood] || MOODS[mood === "calm" ? "calm" : "run"] || MOODS.run;
    const prog = M.prog;
    const beat = 60 / M.bpm;
    this._bar = 0;
    const step = () => {
      if (!this.ctx || !this.musicOn) return;
      const ch = prog[this._bar % prog.length];

      /* 和音（ゆっくり 伸ばす）*/
      for (const n of ch) {
        this._tone(note(n + 12), beat * M.hold, { type: M.pad, gain: M.padGain, bus: this.musicGain });
      }
      /* 土台の 音 */
      this._tone(note(ch[0] - 12), beat * (M.hold + 0.2),
        { type: M.bass, gain: M.bassGain, bus: this.musicGain });

      /* 旋律。和音の 音を 順に 拾うだけ。**作曲は しない。**
         ここで 凝ると 何度も 聞く うちに 必ず うるさく なる。 */
      if (M.arp > 0) {
        const 段 = [0, 1, 2, 1, 2, 0, 1, 2];
        for (let i = 0; i < M.arp; i++) {
          const n = ch[段[(this._bar * 3 + i) % 段.length] % ch.length] + 24;
          setTimeout(() => {
            if (this.ctx && this.musicOn) {
              this._tone(note(n), beat * 0.34, { type: M.lead, gain: M.leadGain, bus: this.musicGain });
            }
          }, i * beat * 2000 / M.arp);
        }
      }

      /* 拍 */
      if (M.beat) {
        for (let i = 0; i < M.beat; i++) {
          setTimeout(() => {
            if (this.ctx && this.musicOn) this._noiseBurst(0.05, M.beatHz, 2.0, M.beatGain);
          }, (i + 0.5) * beat * 2000 / M.beat);
        }
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

/* ══════════════════════════════════════════════════════════════════════════
   風景ごとの 曲

   ★ 決めごと:
     ・和音は **4 つの 進行**だけ。長い 曲を 作らない（必ず 飽きる）。
     ・音色は 4 種類（sine / triangle / square / sawtooth）の 組み合わせだけ。
     ・「速さ」と「調」で 場所を 分ける。旋律で 分けようと しない。
     ・音量は 控えめ。走っている 間 ずっと 鳴る ものは 小さいほど 良い。
   数字の 意味: 48=C3, 60=C4。 [根音, 3度, 5度] の 3 音で 1 和音。
   ══════════════════════════════════════════════════════════════════════════ */
const MOODS = {
  /* ロビー。落ち着く。 */
  calm:   { bpm: 84, prog: [[57,60,64],[53,57,60],[48,52,55],[55,59,62]],
            pad: "sine", padGain: 0.050, bass: "triangle", bassGain: 0.055, hold: 1.7,
            arp: 0, lead: "sine", leadGain: 0.02, beat: 0, beatHz: 3600, beatGain: 0.02 },
  /* 何も 指定が 無い ときの 走り。 */
  run:    { bpm: 124, prog: [[48,52,55],[55,59,62],[57,60,64],[53,57,60]],
            pad: "sine", padGain: 0.046, bass: "triangle", bassGain: 0.058, hold: 1.6,
            arp: 4, lead: "triangle", leadGain: 0.024, beat: 2, beatHz: 3600, beatGain: 0.030 },

  /* ── 風景ごと ── */
  meadow: { bpm: 106, prog: [[48,52,55],[55,59,62],[53,57,60],[50,53,57]],
            pad: "sine", padGain: 0.048, bass: "triangle", bassGain: 0.056, hold: 1.6,
            arp: 4, lead: "triangle", leadGain: 0.026, beat: 2, beatHz: 4200, beatGain: 0.026 },
  sunset: { bpm: 92, prog: [[53,57,60],[50,54,57],[48,52,55],[55,58,62]],
            pad: "sine", padGain: 0.052, bass: "sine", bassGain: 0.058, hold: 1.9,
            arp: 2, lead: "sine", leadGain: 0.026, beat: 1, beatHz: 3000, beatGain: 0.020 },
  candy:  { bpm: 128, prog: [[50,54,57],[57,61,64],[55,59,62],[52,55,59]],
            pad: "triangle", padGain: 0.040, bass: "triangle", bassGain: 0.052, hold: 1.3,
            arp: 8, lead: "square", leadGain: 0.018, beat: 4, beatHz: 5200, beatGain: 0.020 },
  ice:    { bpm: 76, prog: [[52,55,59],[50,53,57],[47,50,54],[55,59,62]],
            pad: "sine", padGain: 0.055, bass: "sine", bassGain: 0.048, hold: 2.1,
            arp: 2, lead: "sine", leadGain: 0.030, beat: 0, beatHz: 6200, beatGain: 0.016 },
  lava:   { bpm: 138, prog: [[45,48,52],[46,50,53],[43,46,50],[48,51,55]],
            pad: "sawtooth", padGain: 0.026, bass: "sawtooth", bassGain: 0.040, hold: 1.2,
            arp: 4, lead: "square", leadGain: 0.016, beat: 4, beatHz: 2200, beatGain: 0.040 },
  neon:   { bpm: 126, prog: [[45,48,52],[50,53,57],[43,46,50],[48,52,55]],
            pad: "sawtooth", padGain: 0.024, bass: "sawtooth", bassGain: 0.044, hold: 1.5,
            arp: 8, lead: "sawtooth", leadGain: 0.014, beat: 4, beatHz: 4800, beatGain: 0.030 },
  forest: { bpm: 96, prog: [[50,53,57],[55,58,62],[48,52,55],[53,57,60]],
            pad: "triangle", padGain: 0.044, bass: "sine", bassGain: 0.056, hold: 1.8,
            arp: 3, lead: "sine", leadGain: 0.026, beat: 2, beatHz: 3400, beatGain: 0.022 },
  sky:    { bpm: 84, prog: [[55,59,62],[53,57,60],[57,60,64],[50,54,57]],
            pad: "sine", padGain: 0.054, bass: "sine", bassGain: 0.046, hold: 2.2,
            arp: 3, lead: "sine", leadGain: 0.028, beat: 1, beatHz: 5600, beatGain: 0.014 },
  ruins:  { bpm: 100, prog: [[50,53,57],[48,52,55],[45,48,52],[53,56,60]],
            pad: "triangle", padGain: 0.042, bass: "triangle", bassGain: 0.056, hold: 1.7,
            arp: 3, lead: "triangle", leadGain: 0.024, beat: 2, beatHz: 2800, beatGain: 0.028 },
  arena:  { bpm: 142, prog: [[45,48,52],[48,52,55],[50,53,57],[43,46,50]],
            pad: "sawtooth", padGain: 0.026, bass: "sawtooth", bassGain: 0.046, hold: 1.3,
            arp: 8, lead: "square", leadGain: 0.016, beat: 4, beatHz: 3000, beatGain: 0.044 }
};

/** その 風景の 曲が あるか（無ければ run に 落ちる）。検査に 使う。 */
export function hasMood(k) { return !!MOODS[k]; }
export const MOOD_KEYS = Object.keys(MOODS);

export default Audio3;
