/* ══════════════════════════════════════════════════════════════════════
   Lumi の声を鳴らす部分を、**実際に音を通して**確かめる。

   ★ 「音割れしている」を耳の印象で直さない。440Hz の音を流し込み、
     出てきた波形を **理想の波形と比べて** 数字で見る。

   ★ 見るもの:
     ・理想からのずれ（大きいほど濁る）
     ・急に飛んだ回数（プツッという音の元。0 でなければならない）
     ・1 を超えた回数（本当の意味の音割れ）
     ・穴（無音が挟まった回数）
   ══════════════════════════════════════════════════════════════════════ */
const fs = require("fs");
const path = require("path");

const SRC = fs.readFileSync(path.join(__dirname, "client", "vq-live-pcm.worklet.js"), "utf8");

/* worklet は専用の場所でしか動かないので、必要なものだけ用意して読み込む。 */
function load(deviceRate) {
  const box = {
    sampleRate: deviceRate,
    AudioWorkletProcessor: class { constructor() { this.port = { onmessage: null, postMessage() {} }; } },
    registered: {},
    registerProcessor(name, cls) { this.registered[name] = cls; }
  };
  const fn = new Function(
    "sampleRate", "AudioWorkletProcessor", "registerProcessor",
    SRC + "\nreturn { VqMicDown: VqMicDown, VqSpeakUp: VqSpeakUp };"
  );
  return fn(box.sampleRate, box.AudioWorkletProcessor,
    (n, c) => { box.registered[n] = c; });
}

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ✓ " + name + (extra ? "  " + extra : "")); }
  else { fail++; console.log("  ✗ " + name + (extra ? "  " + extra : "")); }
}
function sec(t) { console.log("\n■ " + t); }

/* ── 音を作る（24000Hz の 440Hz）────────────────────────────────── */
function sine(n, hz, rate, from) {
  const a = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    a[i] = Math.round(Math.sin(2 * Math.PI * hz * (from + i) / rate) * 0.8 * 32767);
  }
  return a;
}

function run(deviceRate, chunkLen) {
  const { VqSpeakUp } = load(deviceRate);
  const sp = new VqSpeakUp({ processorOptions: { sourceRate: 24000 } });
  const post = sp.port.onmessage;

  const SRCRATE = 24000, HZ = 440;
  const CHUNKS = 40;
  /* Gemini は 100ms 前後の塊で送ってくる。切れ目の扱いを見たいので細かめにも試す。 */
  let at = 0;
  const feed = () => {
    const a = sine(chunkLen, HZ, SRCRATE, at);
    at += chunkLen;
    post({ data: { type: "pcm", buf: a.buffer } });
  };

  /* 貯まるまで（80ms ぶん）先に入れておく */
  for (let i = 0; i < 3; i++) feed();

  const BLOCK = 128;
  const outAll = [];
  for (let b = 0; b < CHUNKS * Math.ceil(chunkLen / (BLOCK * (SRCRATE / deviceRate))); b++) {
    const out = [new Float32Array(BLOCK)];
    sp.process([], [out]);
    for (let i = 0; i < BLOCK; i++) outAll.push(out[0][i]);
    /* 消費したぶん、また入れる（実際の流れに近づける） */
    if (sp.wrote - sp.read < SRCRATE * 0.2 && at < CHUNKS * chunkLen) feed();
  }

  /* 鳴り始めを探す（貯めている間の無音を飛ばす） */
  let s0 = 0;
  while (s0 < outAll.length && Math.abs(outAll[s0]) < 1e-6) s0++;
  const y = outAll.slice(s0, s0 + Math.min(deviceRate, outAll.length - s0 - 200));

  /* ── 測る ────────────────────────────────────────────────── */
  let over = 0, holes = 0, maxJump = 0, jumps = 0, run0 = 0;
  const step = 2 * Math.PI * HZ / deviceRate;
  for (let i = 0; i < y.length; i++) {
    if (Math.abs(y[i]) > 1.0000001) over++;
    if (i > 0) {
      const d = Math.abs(y[i] - y[i - 1]);
      if (d > maxJump) maxJump = d;
      /* 440Hz なら 1 サンプルの差は最大でも 0.8*step 程度。その 3 倍を飛びとみなす。 */
      if (d > 0.8 * step * 3) jumps++;
    }
    /* ★ 穴は「0 が **続く**」こと。440Hz の波は本来ゼロを通るので、
       1 個の 0 を穴と数えてはいけない（48000Hz でちょうど乗って 79 個出た）。 */
    if (y[i] === 0) { run0++; if (run0 === 3) holes++; } else run0 = 0;
  }
  /* 理想の波と比べる（位相は合わせる） */
  let best = Infinity;
  for (let ph = 0; ph < 200; ph++) {
    let e = 0;
    for (let i = 0; i < 2000; i++) {
      const want = Math.sin(2 * Math.PI * HZ * (i + ph / 100) / deviceRate) * 0.8;
      e += Math.abs(y[i] - want);
    }
    if (e / 2000 < best) best = e / 2000;
  }
  return { ずれ: best, 飛び: jumps, 最大の飛び: maxJump, 超え: over, 穴: holes, 長さ: y.length };
}

sec("PC（48000Hz）で 440Hz を鳴らす");
const r48 = run(48000, 2400);       /* 100ms の塊 */
console.log("  " + JSON.stringify(r48));
ok("理想の波からのずれが小さい（0.02 未満）", r48.ずれ < 0.02, "ずれ " + r48.ずれ.toFixed(4));
ok("急に飛ばない（プツッが無い）", r48.飛び === 0, "飛び " + r48.飛び + " 回");
ok("1 を超えない（本当の音割れが無い）", r48.超え === 0);
ok("途中に穴が空かない", r48.穴 === 0);
ok("ちゃんと鳴っている（1 秒ぶん出ている）", r48.長さ > 40000);

sec("塊が細かいとき（20ms）でも切れ目で壊れない");
const rSmall = run(48000, 480);
console.log("  " + JSON.stringify(rSmall));
ok("細かい塊でも 飛ばない", rSmall.飛び === 0, "飛び " + rSmall.飛び + " 回");
ok("細かい塊でも ずれが小さい", rSmall.ずれ < 0.02, "ずれ " + rSmall.ずれ.toFixed(4));

sec("44100Hz の端末（端数が出る）");
const r441 = run(44100, 2400);
console.log("  " + JSON.stringify(r441));
ok("端数が出ても 飛ばない", r441.飛び === 0, "飛び " + r441.飛び + " 回");
ok("端数が出ても ずれが小さい", r441.ずれ < 0.02, "ずれ " + r441.ずれ.toFixed(4));

/* ── 途切れ途切れに届いても「終わった」と言わないか ─────────────
   ★ 訴え「会話が途中で止まる」「長いと飛び飛びになる」。
     一瞬でも音が尽きたときに「終わった」と知らせると、本体がマイクを開け、
     スピーカーから出ている Lumi 自身の声を割り込みとみなして
     **鳴らしかけの声を捨てる**。それが正体だった。 */
sec("途中の隙間で「終わった」と言わないか");
function gaps(deviceRate, gapMs) {
  const { VqSpeakUp } = load(deviceRate);
  const sp = new VqSpeakUp({ processorOptions: { sourceRate: 24000 } });
  const post = sp.port.onmessage;
  let idle = 0;
  sp.port.postMessage = (m) => { if (m && m.type === "idle") idle++; };
  const BLOCK = 128, SRCRATE = 24000;
  let at = 0;
  const feed = (n) => { post({ data: { type: "pcm", buf: sine(n, 440, SRCRATE, at).buffer } }); at += n; };
  const run = (ms) => {
    const blocks = Math.round(deviceRate * ms / 1000 / BLOCK);
    for (let b = 0; b < blocks; b++) {
      const out = [new Float32Array(BLOCK)];
      sp.process([], [out]);
    }
  };
  feed(2400); feed(2400);        /* 200ms ぶん貯める */
  run(150);                      /* 鳴らす */
  const before = idle;
  run(gapMs);                    /* ★ ここが隙間（何も届かない） */
  const during = idle - before;
  feed(2400); run(120);          /* 続きが届く */
  return { 隙間中に終わったと言った回数: during, 全部: idle };
}
const g200 = gaps(48000, 200);
console.log("  200ms の隙間: " + JSON.stringify(g200));
ok("★ 200ms 途切れても「終わった」と言わない", g200.隙間中に終わったと言った回数 === 0);
const g300 = gaps(48000, 300);
console.log("  300ms の隙間: " + JSON.stringify(g300));
ok("★ 300ms 途切れても「終わった」と言わない", g300.隙間中に終わったと言った回数 === 0);
const g600 = gaps(48000, 600);
console.log("  600ms の隙間: " + JSON.stringify(g600));
ok("　本当に終わったとき（600ms）は ちゃんと知らせる", g600.隙間中に終わったと言った回数 >= 1);

sec("作りの決まり");
/* ★ 解説文にも同じ字が出るので、**動く部分だけ**を見る。 */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "");
ok("★ 塊の切れ目で 無音を入れない", !/cur = null/.test(CODE) && !/this\.q\b/.test(CODE));
ok("★ 切れ目で 読み位置を 0 に戻さない", !/q\.shift\(\)/.test(CODE));
ok("★ 前後の間を 線で結ぶ（階段状にしない）", /var v = a \+ \(b - a\) \* fr;/.test(SRC));
ok("★ 少し貯めてから鳴らす", /this\.PRIME = Math\.round\(this\.src \* 0\.08\)/.test(SRC));
ok("★ 足りないときは そっと下げる", /this\.last \*= 0\.985;/.test(SRC));
ok("　割り込まれたら すぐ捨てる", /d\.type === "clear"/.test(SRC) && /this\.on = false/.test(SRC));
ok("★ 尽きた状態が続いたときだけ 終わりとみなす",
  /if \(this\.dry > Math\.round\(sampleRate \* 0\.35\)\)/.test(SRC));
ok("　マイク側は 止めていても音の大きさを測る",
  /this\.rms = Math\.sqrt\(sum \/ ch\.length\);/.test(SRC)
  && SRC.indexOf("this.rms = Math.sqrt") < SRC.indexOf("if (this.muted) { this.pos = 0; this.at = 0; return true; }"));
ok("★ 止められたら 溜めていた途中のぶんも捨てる",
  /if \(this\.muted\) \{ this\.pos = 0; this\.at = 0; return true; \}/.test(SRC));

/* ══ 起動音・終了音（2026-08-16 に足した）══════════════════════════
   ★ 利用者が作った音。**ファイルが在ること**と、**作りの決まり**を固定する。
     実際に鳴らす試験は scratchpad/jingle.cjs（実ブラウザ）。 */
sec("起動音・終了音");
const fs2 = require("fs");
const IDX2 = fs2.readFileSync(path.join(__dirname, "client", "index.html"), "utf8");
[["vq-lumi-start.m4a", 10000], ["vq-lumi-end.m4a", 10000],
 ["vq-lumi-start.wav", 200000], ["vq-lumi-end.wav", 200000]].forEach(function (x) {
  let n = 0;
  try { n = fs2.statSync(path.join(__dirname, "client", x[0])).size; } catch (e) {}
  ok("　" + x[0] + " が在る", n > x[1], Math.round(n / 1024) + "KB");
});
ok("★ 読めない形なら 控えの形へ落とす（AAC を積んでいない端末がある）",
  /start: \["\/vq-lumi-start\.m4a", "\/vq-lumi-start\.wav"\]/.test(IDX2)
  && /return b \|\| 試す\(i \+ 1\);/.test(IDX2));
ok("★ 鳴っている間は マイクを送らない（自分の音を こちらの声と思われる）",
  /if \(st\.jingleOn\) return;/.test(IDX2));
ok("★ 鳴り終わったら 必ず解く（解けないとマイクが永久に届かない）",
  /setTimeout\(終わり, Math\.round\(buf\.duration \* 1000\) \+ 300\);/.test(IDX2));
ok("★ 終了音を鳴らしきってから 眠らせる",
  /鳴らす\("end", function \(\) \{/.test(IDX2) && /if \(!またWake\) letSleep\(\);/.test(IDX2));
ok("★ 効果音を切っていたら 鳴らさない",
  /if \(!効果音の大きさ\(\)\) \{ 終わり\(\); return; \}/.test(IDX2));
ok("　大きさは いまある効果音の設定に合わせる（設定を増やさない）",
  /root\.__vqSet && root\.__vqSet\.get\("sound\.sfxVolume"\)/.test(IDX2));
ok("　Lumi の声と同じ入れ物で鳴らす（<audio> は iPhone で鳴らないことがある）",
  /ctx\.createBufferSource\(\)/.test(IDX2) && /gain\.connect\(ctx\.destination\)/.test(IDX2));

sec("いま何をしているか（帯と作業中の音）");
{
  let n = 0;
  try { n = fs2.statSync(path.join(__dirname, "client", "vq-lumi-think.m4a")).size; } catch (e) {}
  ok("　作業中の音のファイルが在る", n > 100000, Math.round(n / 1024) + "KB");
}
ok("★ いまの様子を **画面に出す**（前は st.state に入れるだけだった）",
  /sp\.textContent = st\.state;/.test(IDX2)
  && /h\.classList\.toggle\("work", !!st\.state\);/.test(IDX2));
{
  /* 様子の表の中だけを数える（1 行に 2 つ書いてあるので行では数えない） */
  const m = /var 様子 = \{([\s\S]*?)\n  \};/.exec(IDX2);
  const 表 = m ? m[1] : "";
  const 数 = (表.match(/[a-zA-Z]+: "[^"]+"/g) || []).length;
  const 言い方 = new Set(表.match(/"[^"]+"/g) || []);
  ok("★ 道具ごとに 言い方を変える", 数 >= 25 && 言い方.size >= 15,
    数 + " つの道具 / " + 言い方.size + " 通りの言い方");
}
ok("★ すぐ終わる道具では 出さない（チカチカさせない）",
  /st\.workT = setTimeout\(出す, 180\);/.test(IDX2));
ok("★ 喋っている間は 横取りしない。ただし あきらめず出し直す",
  /if \(st\.speaking\) \{ st\.workT = setTimeout\(出す, 200\); return; \}/.test(IDX2));
ok("★ st.words では判じない（前の発言を持ったままで 二度と出なくなる）",
  /st\.words は \*\*前の発言を持ったまま\*\*/.test(IDX2));
ok("★ 帯が出ていても 音は鳴らす（文字だけ差し替えて抜けない）",
  /if \(st\.workSrc\) \{ say\(st\.workName\); return; \}/.test(IDX2));
ok("★ 道具が重なっても 音は 1 本（数を数える）",
  /st\.workN = \(st\.workN \|\| 0\) \+ 1;/.test(IDX2)
  && /if \(st\.workN\) return;/.test(IDX2));
ok("★ 終わったら すっと消す（ぶつっと止めない）",
  /exponentialRampToValueAtTime\(0\.0001, t \+ 0\.7\);/.test(IDX2));
ok("★ 繰り返し流す", /src\.loop = true;/.test(IDX2));
ok("★ 声より控えめにする", /var 目標 = g0 \* 0\.5;/.test(IDX2));
ok("★ 会話を畳んだら 必ず止める", /st\.workN = 0; st\.thinking = false;/.test(IDX2));
ok("★ 作業音も 先に読んでおく（初回の出遅れを防ぐ）", /作業音を用意\(\);/.test(IDX2));
ok("　打った字を読み上げ直す知らせは出さない", IDX2.indexOf("文字で送りました") < 0);

sec("長い返事と 割り込み（2026-08-16）");
{
  const W2 = fs2.readFileSync(path.join(__dirname, "client", "vq-live-pcm.worklet.js"), "utf8");
  ok("★ 音の帯が 10 秒では足りない（実測 65 秒溜まる）",
    /this\.CAP = this\.src \* 180;/.test(W2),
    (/this\.CAP = this\.src \* (\d+)/.exec(W2) || [])[1] + " 秒");
  ok("★ 捨てたときは 黙って見過ごさない",
    /type: "drop", ms:/.test(W2) && /音を " \+ e\.data\.ms \+ " ミリ秒 捨てた/.test(IDX2));
  ok("★ 鳴らし残しを 聞ける（開けてよいかの判断に使う）",
    /d\.type === "level"/.test(W2) && /st\.spkMs = e\.data\.ms/.test(IDX2));
}
/* ★ 待つのは 30 秒まで（数字が止まると 永久に開かず「いきなり喋らなくなる」）。 */
/* ★ 2026-08-16・本命: 下限 0.14 では **ふつうの話し声では越えられない**。
   マイクは反響消しを入れて取っているので回り込みはほぼ 0 → 線は下限に張り付く。
   実測: 話し声 rms 0.049 → 0.14 では一度も立たず、0.045 なら立つ。 */
/* ★ 2026-08-16 の 2 度目: 0.045 でも「大きく言わないと割り込めない」と
   訴えが続いたので、下限を **決め打ちから 覚えられる値**へ変えた。
   ここは 数値を焼き付けるのをやめ、**満たすべき性質**で見る。
   （前の版より弱くならないよう、下の 3 本すべてを求める） */
ok("★★ 線の下限は 覚えられる値から取る（決め打ちにしない）",
  /var 線 = Math\.max\(マイクの感度\(\), \(st\.echo \|\| 0\) \* 2\.8\);/.test(IDX2)
  && /function マイクの感度/.test(IDX2));
ok("★★ 既定の下限は ふつうの話し声（0.05〜0.12）より下",
  (function () {
    const m = /if \(!isFinite\(v\) \|\| v <= 0\) return (0\.\d+);/.exec(IDX2);
    return !!m && Number(m[1]) <= 0.03;
  })(), (/if \(!isFinite\(v\) \|\| v <= 0\) return (0\.\d+);/.exec(IDX2) || [])[1]);
ok("★★ いくら下げても 雑音では鳴らない床がある（0 にできない）",
  /Math\.max\(0\.008, Math\.min\(0\.2, v\)\)/.test(IDX2));
ok("★ 覚えた値は 診断の行にも同じ式で出る（数字が食い違わない）",
  /線 " \+ Math\.max\(マイクの感度\(\), \(st\.echo \|\| 0\) \* 2\.8\)\.toFixed\(3\)/.test(IDX2));
ok("★ マイクは反響消しを入れて取る（下げても自分の声で鳴らない土台）",
  /echoCancellation: true, noiseSuppression: true, autoGainControl: true/.test(IDX2));
ok("★ 返事ごとに こちらの声の最大を記録する（合わないとき数字で直せる）",
  /この返事の間、こちらの声の最大は/.test(IDX2));
ok("★ 鳴らし残しがある間は マイクを開けない（自分の声で止められない）",
  /if \(\(st\.spkMs \|\| 0\) > 200 && st\.waitSpk <= 20\)/.test(IDX2));
ok("★ 割り込みの数え方は 通算でなく連続",
  /\} else \{ st\.bargeN = 0; \}          \/\* ★ 線を割ったら 常に 0/.test(IDX2));
ok("★ 回り込みの学習に 利用者の声を混ぜない",
  /else if \(rms < st\.echo \* 2\.2\)/.test(IDX2));
/* ★ 2026-08-16: まず 2.5 秒マイクを開けて **向こうに判じてもらう**。
   それでも向こうが遮らず、こちらが話し続けているときだけ 手元で止める
   （実測: 合成音では向こうの判定が働かず、これが無いと永久に割り込めない）。 */
ok("★ 声の割り込みは まず **向こうに判じてもらう**（すぐ捨てない）",
  /st\.probeUntil = Date\.now\(\) \+ 2500;/.test(IDX2)
  && /setMuted\(false\);            \/\* ★ 音は捨てない。開けるだけ \*\//.test(IDX2));
ok("★ 試している間は 自分の声を小さくする（自分で自分を止めない）",
  /function duck/.test(IDX2) && /duck\(0\.3\);/.test(IDX2));
/* ★ 2026-08-16 実測で見つけた、声で割り込めない本当の原因 3 つ。 */
ok("★★ 文字バーを閉じても Lumi が喋っている間は マイクの止めを解かない",
  /var 実際 = !!on \|\| !!st\.speaking;/.test(IDX2)
  && /一度 文字を打つと、その会話ではもう声で割り込めなくなっていた/.test(IDX2));
ok("★ 止めているつもりと 実際がずれたら 直す",
  /function syncMute/.test(IDX2) && /st\.lastMuted === 欲しい/.test(IDX2));
ok("★★ 空振りかは **音が届いているか**で判じない（必ず空振りになる）",
  /空振りかどうかを \*\*音が届いているか\*\*で判じてはいけない/.test(IDX2)
  && /var 割合 = st\.probeAll \? \(st\.probeHit \/ st\.probeAll\) : 0;/.test(IDX2));
/* ★ 2026-08-16 の 2 度目: ひと言だけ言って黙る（「ちがう」「ストップ」）と
   2.5 秒のうち声が出ているのは 3〜5 回ぶんしかなく、半分では通らなかった。
   4 割・6 回へ緩めた。**割合で見る**という肝は変えていないので、
   ここでは「割合の判定であること」と「緩めすぎていないこと」の両方を求める。 */
ok("★ 開けている間 どれだけ話していたかの **割合**で止める",
  /if \(割合 >= 0\.4 && st\.probeAll >= 6\)/.test(IDX2)
  && /話し続けているので こちらで止める/.test(IDX2));
ok("★★ 割合の線は 3 割より下げない（無音でも止まってしまう）",
  (function () {
    const m = /if \(割合 >= (0\.\d+) && st\.probeAll >= (\d+)\)/.exec(IDX2);
    return !!m && Number(m[1]) >= 0.3 && Number(m[2]) >= 5;
  })());
ok("★ 割り込みは 続いたときだけ（1 回の物音では動かない）",
  /if \(st\.bargeN >= 3\)/.test(IDX2) && /鳴り始めから > 800/.test(IDX2));
ok("　番が変われば また試せる（3 回で打ち止めにしない）",
  /st\.probeNg = 0;                    \/\* 番が変われば また試せる \*\//.test(IDX2));
ok("★ 文字で送ったら その場で黙る（鳴らし残しを捨てる）",
  /文字で送ったら \*\*その場で 声を止める\*\*/.test(IDX2)
  && /st\.cutAt = Date\.now\(\);/.test(IDX2));
ok("　打ち切った番の 遅れて届く音は鳴らさない",
  /if \(st\.cutAt && st\.turnAt && st\.turnAt < st\.cutAt\) continue;/.test(IDX2));

sec("会話の持ち越し（2026-08-16）");
ok("★ 閉じるときに 要約だけ残す（全文は残さない）",
  /function 覚え書きを残す/.test(IDX2) && /覚え書きを残す\(\);/.test(IDX2));
ok("★ 開くときに 読み直す", /覚え書きを読む\(\);/.test(IDX2));
ok("★ こちらが頼んだことを 軸にする（挨拶しか残らなかった）",
  /\*\*こちらが頼んだこと\*\*を軸にする/.test(IDX2) && /st\.mine/.test(IDX2));
ok("★ 前に話したことを 文脈へ渡す",
  /【前に話したこと（/.test(IDX2));
ok("　いまの画面と 取り違えさせない",
  /これは前回までの覚え書きです。\*\*いまの画面のことではありません。\*\*/.test(IDX2));

console.log("\n" + (fail ? "❌ 落ちています" : "✅ 全部通りました")
  + "  通過 " + pass + " / 失敗 " + fail);
process.exit(fail ? 1 : 0);
