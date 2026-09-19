/* ══════════════════════════════════════════════════════════════════════════
   studio/tests/mixer.test.mjs — 音の UI の「純ロジック」の試験

   ★ 何をする所か
     ui/mixer.js と ui/inspector/audio.js の **DOM を触らない部分**だけを
     Node で確かめる。画面（createMixer / createAudioPanel）は document が
     無いと動かないので、ここでは呼ばない（契約書 §8 の割り切り）。
       ・dB ↔ 線形の往復（−∞ と上限の扱い）
       ・フェーダーの目盛り dbToPos / posToDb が互いの逆になっているか
       ・メーターの読みの形をどれだけ飲めるか（normalizeMeterReading）
       ・効果の登録表の正規化（配列でも地図でも同じ形になるか）
       ・LUFS 近似と「−14 にそろえる」倍率の整合
       ・フェードの包絡線が 0→1→0 になるか
   ══════════════════════════════════════════════════════════════════════════ */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DB_MIN, DB_MAX, GAIN_MAX,
  gainToDb, dbToGain, clampDb, fmtDb, fmtPan,
  normalizeMeterReading, normalizeAudioFxRegistry, defaultFxParams,
  fadeEnvelope, AUDIO_FX_PRESETS, FALLBACK_AUDIO_FX, MARKER_FX_TYPES
} from "../src/ui/inspector/audio.js";

import {
  dbToPos, posToDb, msToLufs, fmtLufs, gainForTargetLufs,
  createLoudnessMeter, soundTracks, STRIP_W, LUFS_TARGET
} from "../src/ui/mixer.js";

/* ── dB ────────────────────────────────────────────────────────────── */

test("gainToDb / dbToGain: 基準点と往復", () => {
  assert.equal(gainToDb(1), 0);
  assert.ok(Math.abs(gainToDb(0.5) + 6.0206) < 1e-3);
  assert.ok(Math.abs(gainToDb(2) - 6.0206) < 1e-3);
  assert.equal(gainToDb(0), -Infinity);
  assert.equal(gainToDb(-1), -Infinity);       // 負の増幅は無音として扱う

  for (const db of [-48, -24, -12, -6, -0.5, 0, 3, 6, 12]) {
    const back = gainToDb(dbToGain(db));
    assert.ok(Math.abs(back - db) < 1e-6, `${db}dB の往復がずれた: ${back}`);
  }
  assert.equal(dbToGain(DB_MIN), 0, "下端は無音");
  assert.equal(dbToGain(-999), 0);
  assert.ok(dbToGain(DB_MAX) <= GAIN_MAX, "上端がモデルの上限を超えない");
  assert.ok(Math.abs(dbToGain(DB_MAX) - 3.981) < 1e-3);
});

test("clampDb: NaN と ±∞ を端へ寄せる", () => {
  assert.equal(clampDb(NaN), DB_MIN);
  assert.equal(clampDb(-Infinity), DB_MIN);
  assert.equal(clampDb(Infinity), DB_MAX);
  assert.equal(clampDb(-120), DB_MIN);
  assert.equal(clampDb(99), DB_MAX);
  assert.equal(clampDb(-6), -6);
});

test("fmtDb / fmtPan: 文言", () => {
  assert.equal(fmtDb(0), "0.0 dB");
  assert.equal(fmtDb(3), "+3.0 dB");
  assert.equal(fmtDb(-12.5), "−12.5 dB");
  assert.equal(fmtDb(-Infinity), "−∞ dB");
  assert.equal(fmtDb(DB_MIN), "−∞ dB");
  assert.equal(fmtPan(0), "中央");
  assert.equal(fmtPan(-1), "L100");
  assert.equal(fmtPan(0.5), "R50");
  assert.equal(fmtPan(9), "R100", "範囲外は端へ丸める");
});

/* ── フェーダーの目盛り ────────────────────────────────────────────── */

test("dbToPos / posToDb: 互いの逆で、上が細かい", () => {
  assert.ok(Math.abs(dbToPos(DB_MAX) - 0) < 1e-9, "+12dB は上端");
  assert.ok(Math.abs(dbToPos(DB_MIN) - 1) < 1e-9, "−60dB は下端");
  assert.ok(Math.abs(dbToPos(0) - 0.2) < 1e-9, "0dB は上から 20%");

  for (const db of [12, 6, 0, -3, -12, -24, -36, -60]) {
    const back = posToDb(dbToPos(db));
    assert.ok(Math.abs(back - db) < 1e-6, `${db}dB の往復がずれた: ${back}`);
  }
  /* 単調（下へ行くほど小さい音） */
  let prev = -Infinity;
  for (let p = 0; p <= 1.0001; p += 0.05) {
    const db = posToDb(p);
    if (prev !== -Infinity) assert.ok(db <= prev + 1e-9, `p=${p} で単調でない`);
    prev = db;
  }
  /* 上が細かい = 0dB の上下で同じ距離を動かしたとき、上の方が dB の変化が小さい */
  const upper = Math.abs(posToDb(0.10) - posToDb(0.20));
  const lower = Math.abs(posToDb(0.80) - posToDb(0.90));
  assert.ok(upper < lower, "上端の方が目盛りが細かいこと");
  assert.equal(posToDb(-5), DB_MAX, "範囲外の位置も端へ丸める");
  assert.equal(posToDb(5), DB_MIN);
});

/* ── メーターの読み ───────────────────────────────────────────────── */

test("normalizeMeterReading: いろいろな形を飲む", () => {
  assert.equal(normalizeMeterReading(null), null);
  assert.equal(normalizeMeterReading(undefined), null);

  const a = normalizeMeterReading(0.5);
  assert.deepEqual(a.peak, [0.5, 0.5]);
  assert.deepEqual(a.rms, [0.5, 0.5]);

  const b = normalizeMeterReading({ peak: 0.8, rms: 0.4 });
  assert.deepEqual(b.peak, [0.8, 0.8]);
  assert.deepEqual(b.rms, [0.4, 0.4]);

  const c = normalizeMeterReading({ peak: [0.9, 0.3], rms: [0.5, 0.1] });
  assert.deepEqual(c.peak, [0.9, 0.3]);
  assert.deepEqual(c.rms, [0.5, 0.1]);

  const d = normalizeMeterReading({ l: 0.2, r: 0.6 });
  assert.deepEqual(d.peak, [0.2, 0.6]);

  const e = normalizeMeterReading([0.1, 0.7]);
  assert.deepEqual(e.peak, [0.1, 0.7]);

  const f = normalizeMeterReading({ channels: [{ peak: 0.4, rms: 0.2 }, { peak: 0.8, rms: 0.3 }] });
  assert.deepEqual(f.peak, [0.4, 0.8]);
  assert.deepEqual(f.rms, [0.2, 0.3]);

  const g = normalizeMeterReading({ peak: 99 });
  assert.ok(g.peak[0] <= 4, "とんでもない値は丸める");
});

/* ── 効果の登録表 ─────────────────────────────────────────────────── */

test("normalizeAudioFxRegistry: 配列と地図で同じ形になる", () => {
  const fromArray = normalizeAudioFxRegistry([
    { type: "eq", label: "EQ", params: [{ key: "low", min: -12, max: 12, step: 0.5, def: 0, unit: "dB" }] }
  ]);
  const fromMap = normalizeAudioFxRegistry({
    eq: { label: "EQ", params: { low: { min: -12, max: 12, step: 0.5, def: 0, unit: "dB" } } }
  });
  assert.equal(fromArray.length, 1);
  assert.deepEqual(fromArray, fromMap);
  assert.equal(fromArray[0].params[0].key, "low");
  assert.equal(fromArray[0].params[0].unit, "dB");
});

test("normalizeAudioFxRegistry: 欠けた所を埋め、印は隠す", () => {
  const list = normalizeAudioFxRegistry({
    weird: {},                                    // label も params も無い
    bgm: { label: "これは印" },                    // 効果一覧には出さない
    dup: { params: { amount: 0.25 } }              // 数だけ渡された param
  });
  const types = list.map((d) => d.type);
  assert.deepEqual(types, ["weird", "dup"]);
  assert.equal(list[0].label, "weird", "label が無ければ type を出す");
  assert.deepEqual(list[0].params, []);
  const amount = list[1].params[0];
  assert.equal(amount.key, "amount");
  assert.equal(amount.def, 0.25);
  assert.ok(amount.max > amount.min);
  assert.ok(amount.step > 0);

  assert.deepEqual(normalizeAudioFxRegistry(null), []);
  assert.deepEqual(normalizeAudioFxRegistry("eq"), []);
});

test("控えの表とプリセットの整合（プリセットの type が控えに在る）", () => {
  const reg = normalizeAudioFxRegistry(FALLBACK_AUDIO_FX);
  const known = new Set(reg.map((d) => d.type));
  for (const t of MARKER_FX_TYPES) assert.ok(!known.has(t), `印 ${t} は一覧に出さない`);
  for (const p of AUDIO_FX_PRESETS) {
    assert.ok(p.chain.length > 0, `${p.id} が空`);
    for (const step of p.chain) {
      assert.ok(known.has(step.type), `${p.id} の ${step.type} が控えの表に無い`);
      const def = reg.find((d) => d.type === step.type);
      for (const key of Object.keys(step.params)) {
        const spec = def.params.find((x) => x.key === key);
        assert.ok(spec, `${step.type}.${key} が登録表に無い`);
        assert.ok(step.params[key] >= spec.min && step.params[key] <= spec.max,
          `${step.type}.${key} = ${step.params[key]} が ${spec.min}..${spec.max} の外`);
      }
    }
  }
});

test("defaultFxParams: 既定値を集める", () => {
  const reg = normalizeAudioFxRegistry(FALLBACK_AUDIO_FX);
  const comp = reg.find((d) => d.type === "compressor");
  const p = defaultFxParams(comp);
  assert.equal(p.ratio, 3);
  assert.equal(p.threshold, -20);
  assert.deepEqual(defaultFxParams(null), {});
});

/* ── フェードの包絡線 ─────────────────────────────────────────────── */

test("fadeEnvelope: 0 → 1 → 0 で、形の違いが出る", () => {
  const clip = { duration: 4, audioFade: { in: 1, out: 1, curve: "linear" } };
  assert.equal(fadeEnvelope(clip, 0), 0);
  assert.ok(Math.abs(fadeEnvelope(clip, 0.5) - 0.5) < 1e-9);
  assert.equal(fadeEnvelope(clip, 2), 1);
  assert.ok(Math.abs(fadeEnvelope(clip, 3.5) - 0.5) < 1e-9);
  assert.equal(fadeEnvelope(clip, 4), 0);
  /* 範囲外は端の値（尺の外を聞かせない） */
  assert.equal(fadeEnvelope(clip, -1), 0);
  assert.equal(fadeEnvelope(clip, 9), 0);

  const exp = fadeEnvelope({ duration: 4, audioFade: { in: 1, out: 0, curve: "exp" } }, 0.5);
  const log = fadeEnvelope({ duration: 4, audioFade: { in: 1, out: 0, curve: "log" } }, 0.5);
  assert.ok(exp < 0.5, "exp はゆっくり立ち上がる");
  assert.ok(log > 0.5, "log は素早く立ち上がる");

  /* フェード無しは常に 1 */
  const plain = { duration: 2, audioFade: { in: 0, out: 0, curve: "linear" } };
  assert.equal(fadeEnvelope(plain, 0), 1);
  assert.equal(fadeEnvelope(plain, 1), 1);
  /* audioFade が無いクリップでも落ちない */
  assert.equal(fadeEnvelope({ duration: 1 }, 0.5), 1);
});

/* ── LUFS ─────────────────────────────────────────────────────────── */

test("msToLufs: 無音は −∞、倍にすると +6", () => {
  assert.equal(msToLufs(0), -Infinity);
  assert.equal(msToLufs(-1), -Infinity);
  const a = msToLufs(0.1 * 0.1);
  const b = msToLufs(0.2 * 0.2);
  assert.ok(Math.abs((b - a) - 6.0206) < 1e-3);
  assert.equal(fmtLufs(-Infinity), "— LUFS");
  assert.equal(fmtLufs(-14.25), "−14.3 LUFS");
});

test("gainForTargetLufs: そろえた後は目標に一致する", () => {
  const cur = -20;
  const g = gainForTargetLufs(cur, LUFS_TARGET);
  assert.ok(g > 1, "小さい音は持ち上げる");
  /* 倍率を掛けたら目標になる（LUFS は 20log10 の世界） */
  const after = cur + 20 * Math.log10(g);
  assert.ok(Math.abs(after - LUFS_TARGET) < 1e-9);
  assert.equal(gainForTargetLufs(-Infinity), 1, "測れていないときは触らない");
  assert.ok(gainForTargetLufs(-6, LUFS_TARGET) < 1, "大きい音は下げる");
});

test("createLoudnessMeter: 一定の音を入れたら LUFS が一致する", () => {
  const m = createLoudnessMeter();
  assert.equal(m.get().integrated, -Infinity, "何も入れていなければ測れていない");
  const rms = 0.2;                                // 一定の RMS
  for (let i = 0; i < 300; i++) m.push(rms, 33);  // 約 10 秒
  const got = m.get();
  const want = msToLufs(rms * rms);
  assert.ok(Math.abs(got.integrated - want) < 1e-6, `integrated=${got.integrated} want=${want}`);
  assert.ok(Math.abs(got.short - want) < 1e-6);
  assert.ok(Math.abs(got.momentary - want) < 0.5, "momentary は追従が遅いので緩く見る");
  assert.ok(got.seconds > 9 && got.seconds < 11);

  /* 無音はゲートで落ちるので integrated を引きずり下げない */
  for (let i = 0; i < 300; i++) m.push(0, 33);
  assert.ok(Math.abs(m.get().integrated - want) < 1e-6, "無音でゲートが効いている");

  m.reset();
  assert.equal(m.get().integrated, -Infinity);
});

/* ── トラックの選び方 ─────────────────────────────────────────────── */

test("soundTracks: adjust は音を持たない（eval.js と同じ判断）", () => {
  const project = {
    tracks: [
      { id: "tr_v", kind: "video" },
      { id: "tr_a", kind: "audio" },
      { id: "tr_o", kind: "overlay" },
      { id: "tr_adj", kind: "adjust" },
      null
    ]
  };
  assert.deepEqual(soundTracks(project).map((t) => t.id), ["tr_v", "tr_a", "tr_o"]);
  assert.deepEqual(soundTracks(null), []);
  assert.deepEqual(soundTracks({}), []);
});

test("列の幅は依頼どおり 64px", () => {
  assert.equal(STRIP_W, 64);
});
