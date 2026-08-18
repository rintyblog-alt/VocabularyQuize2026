/* ══════════════════════════════════════════════════════════════════════
   VocabuQuiz — 音声会話の 生音（PCM）の出し入れ

   なぜ実ファイルなのか:
     audioWorklet.addModule() は **文字列やインラインを受け取らない**。
     Blob の住所を渡すやり方は Safari で不安定なので、素直に 1 枚置く。

   なぜ自分で変換するのか:
     ・送るのは 16000Hz、返ってくるのは **24000Hz**（違う）
     ・iPhone の実機は 48000Hz で動く
     new AudioContext({sampleRate:16000}) は通っても、実際は 48000 のことがある。
     **指定したからその値のはず、と思って書くと、声が高い・低い・早口になる。**
     なので AudioContext は 1 つだけ作り、実際の値（sampleRate）を読んで、
     ここで間引き・引き伸ばしをする。
   ══════════════════════════════════════════════════════════════════════ */

/* ── ① マイク → 16000Hz の Int16 にして本体へ渡す ────────────────── */
class VqMicDown extends AudioWorkletProcessor {
  constructor(opts) {
    super();
    var o = (opts && opts.processorOptions) || {};
    this.target = o.targetRate || 16000;
    /* 実際の採取率。ここを読まずに決め打ちすると必ずずれる。 */
    this.ratio = sampleRate / this.target;
    this.pos = 0;
    /* 100ms ぶん（16000 × 0.1 = 1600 サンプル）ためてから送る。
       細かく送りすぎると、やりとりの回数だけが増えて重くなる。 */
    this.chunk = Math.round(this.target / 10);
    this.buf = new Int16Array(this.chunk);
    this.at = 0;
    this.muted = false;
    this.port.onmessage = function (e) {
      var d = e && e.data;
      if (d && d.type === "mute") this.muted = !!d.on;
    }.bind(this);
  }
  process(inputs) {
    var ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    /* ★ 相手（Lumi）が話している間はマイクを止める（半二重）。
       止めないと、スピーカーから出た Lumi の声をマイクが拾い、
       Lumi が自分自身に割り込み続ける。iPhone の反響消しは
       Web Audio の出力を消せないので、**設定では直らない**。 */
    /* ══ 音の大きさは **止めている間も**測る（2026-08-15 に直した）══════
       ★ 前は「止めている＝何もしない」で先に返していた。そのため
         **Lumi が話している間、こちらの声がまったく届かなかった。**
         話しかけても反応しない、という訴えはこれ。
       ★ 測るだけなら送信しないので、反響（Lumi の声を拾う）にはならない。
         大きさだけを本体へ渡し、割り込むかどうかは本体が決める。 */
    var sum = 0;
    for (var s0 = 0; s0 < ch.length; s0++) sum += ch[s0] * ch[s0];
    this.rms = Math.sqrt(sum / ch.length);
    this.tick = (this.tick || 0) + ch.length;
    if (this.tick >= sampleRate / 10) {
      this.tick = 0;
      this.port.postMessage({ type: "level", rms: this.rms, muted: this.muted });
    }
    /* 送るのは、止めていないときだけ（Lumi の声を送り返さないため）。 */
    /* ★ 止められたら **溜めていた途中のぶんも捨てる**（2026-08-16）。
       捨てないと、次に開いたときに **止まっていた間の音**が混ざって出る。 */
    if (this.muted) { this.pos = 0; this.at = 0; return true; }
    for (var i = 0; i < ch.length; i++) {
      this.pos += 1;
      if (this.pos < this.ratio) continue;
      this.pos -= this.ratio;
      var v = ch[i];
      if (v > 1) v = 1; else if (v < -1) v = -1;
      this.buf[this.at++] = v < 0 ? v * 0x8000 : v * 0x7FFF;
      if (this.at >= this.chunk) {
        /* 中身ごと渡す（写しを作らないと、次の書き込みで壊れる） */
        var out = new Int16Array(this.buf);
        this.port.postMessage(out.buffer, [out.buffer]);
        this.at = 0;
      }
    }
    return true;
  }
}

/* ── ② 返ってきた 24000Hz の音を、この端末の速さで鳴らす ──────────
   ══ 音割れを直した（2026-08-15）══════════════════════════════════════
   ★ PC で声が割れる、という訴え。原因は 3 つとも この中にあった。

     ① **塊の切れ目ごとに無音を 1 個入れていた。**
        `if (idx >= cur.length) { cur = null; out[i] = 0; }`
        届く塊ごとに 0 が挟まるので、その周期でブツブツ鳴る。
     ② **切れ目で位置を 0 に戻していた。**
        `cur = q.shift(); pos = 0;` 端数が捨てられるので、
        塊のたびに波がずれて跳ねる（プツッという音）。
     ③ **階段状に引き伸ばしていた。**
        24000 → 48000 はちょうど 2 倍なので、同じ値を 2 回並べるだけだった。
        これは折り返し雑音を大量に作る。**PC は 48000 で動くので直撃する**
        （iPhone も 48000 だが、小さいスピーカーでは目立ちにくい）。

   ★ 直しかた:
     ・塊をつなげて **1 本の帯**として持つ（切れ目を無くす）。
     ・読み位置は端数のまま持ち越し、**前後 2 つの間を線で結んで**取る。
     ・少し貯めてから鳴らし始める（80ms）。届くのが遅れても穴が空かない。
     ・それでも足りないときは、いきなり 0 にせず **そっと下げる**。
   ══════════════════════════════════════════════════════════════════ */
class VqSpeakUp extends AudioWorkletProcessor {
  constructor(opts) {
    var o = (opts && opts.processorOptions) || {};
    super();
    this.src = o.sourceRate || 24000;
    this.ratio = this.src / sampleRate;      /* 24000 → 48000 なら 0.5 */
    /* ★ 帯を 10 秒 → 180 秒 にした（2026-08-16）。
       訴え「長いとぷつぷつ飛ぶ」の本体。Gemini は生成した音を
       **実時間より速く**送ってくるので、10 秒ぶんしか置けないと
       溢れたぶんを下の行で **黙って捨てていた**。長い返事ほど飛ぶ。
       24000Hz の Float32 で 180 秒 = 17MB。据え置きなら問題ない大きさ。 */
    this.CAP = this.src * 180;               /* 180 秒ぶんの帯 */
    this.ring = new Float32Array(this.CAP);
    this.wrote = 0;                          /* 書いた総数（整数） */
    this.read = 0;                           /* 読む位置（端数つき・通し） */
    this.PRIME = Math.round(this.src * 0.08);/* 80ms 貯めてから鳴らす */
    this.on = false;
    this.last = 0;
    this.port.onmessage = function (e) {
      var d = e && e.data;
      if (!d) return;
      if (d.type === "clear") {
        /* ★ 割り込まれたら **すぐ捨てる**。捨てないと、遮られたはずの
           古い声がそのまま喋り続けて、会話がかみ合わなくなる。 */
        this.wrote = 0; this.read = 0; this.on = false; this.last = 0; this.dry = 0;
        return;
      }
      if (d.type === "level") {
        /* まだ何ミリ秒 鳴らし残しているか。**残っている間はマイクを開けない**。 */
        try {
          this.port.postMessage({ type: "level",
            ms: Math.max(0, Math.round((this.wrote - this.read) / this.src * 1000)) });
        } catch (e) {}
        return;
      }
      if (d.type === "pcm" && d.buf) {
        var i16 = new Int16Array(d.buf);
        for (var i = 0; i < i16.length; i++) {
          this.ring[this.wrote % this.CAP] = i16[i] / 32768;
          this.wrote++;
        }
        /* それでも溢れたら 読み位置を前へ送るしかないが、**黙って捨てない**。
           何ミリ秒 捨てたかを本体へ知らせる（起きているかどうかが
           分からないまま直すことになるのを防ぐ）。 */
        if (this.wrote - this.read > this.CAP - 2) {
          var 捨てた = (this.wrote - this.read) - (this.CAP - 2);
          this.read = this.wrote - this.CAP + 2;
          try { this.port.postMessage({ type: "drop", ms: Math.round(捨てた / this.src * 1000) }); } catch (e) {}
        }
      }
    }.bind(this);
  }
  process(_inputs, outputs) {
    var out = outputs[0] && outputs[0][0];
    if (!out) return true;
    var have = this.wrote - this.read;

    /* まだ貯まっていない間は 鳴らさない（穴あきを防ぐ） */
    if (!this.on) {
      if (have < this.PRIME) {
        for (var z = 0; z < out.length; z++) out[z] = 0;
        if (!this.wrote && !this._told) { this._told = true; this.port.postMessage({ type: "idle" }); }
        return true;
      }
      this.on = true;
    }

    for (var i = 0; i < out.length; i++) {
      if (this.wrote - this.read < 2) {
        /* 足りない。いきなり 0 にすると弾ける音になるので、そっと下げる。 */
        this.last *= 0.985;
        out[i] = this.last;
        continue;
      }
      var p = this.read;
      var i0 = Math.floor(p);
      var fr = p - i0;
      var a = this.ring[i0 % this.CAP];
      var b = this.ring[(i0 + 1) % this.CAP];
      var v = a + (b - a) * fr;              /* ★ 前後の間を 線で結ぶ */
      if (v > 1) v = 1; else if (v < -1) v = -1;
      out[i] = v;
      this.last = v;
      this.read += this.ratio;               /* ★ 端数のまま持ち越す */
    }

    /* ══ 鳴らし終わりの判定（2026-08-16 に直した・重大）════════════════
       ★ 訴え「会話が途中で止まる」「長いと飛び飛びになる」。
         前は **一瞬でも音が尽きたら「終わった」** と知らせていた。
         届く音には隙間があるので、文の途中で何度も「終わった」が出る。
         本体はそれを見てマイクを開け、スピーカーから出ている
         **Lumi 自身の声**を拾い、割り込みとみなして
         **鳴らしかけの声を捨てて**いた。それが「途中で止まる」の正体。
         捨てては再開を繰り返すので「飛び飛び」にもなる。
       ★ 直しかた: **尽きた状態が 350ms 続いたときだけ**終わりとみなす。
         短い隙間は そのまま黙って埋める（作り直さないので繋ぎ目も出ない）。 */
    if (this.wrote - this.read < 2) this.dry = (this.dry || 0) + out.length;
    else this.dry = 0;

    if (this.dry > Math.round(sampleRate * 0.35)) {
      this.on = false;
      if (!this._told) { this._told = true; this.port.postMessage({ type: "idle" }); }
    } else { this._told = false; }
    return true;
  }
}

registerProcessor("vq-mic-down", VqMicDown);
registerProcessor("vq-speak-up", VqSpeakUp);
