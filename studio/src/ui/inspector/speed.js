/* ══════════════════════════════════════════════════════════════════════════
   studio/src/ui/inspector/speed.js — 「速度」タブ

   ★ 何をする所か
     選択クリップの再生速度を触る所。
       ① 一定速度（0.1〜10 倍・よく使う 0.5 / 1 / 2・尺を保つ／伸ばす）
       ② 逆再生・フリーズ（今の絵で止まるクリップを差し込む）
       ③ **速度ランプ**（CapCut の「カーブ」相当。v(t) を曲線で描く）
       ④ 音のピッチを保つ（実際の処理は engine/audio 側）
     Premiere の「タイムリマップ」、CapCut の「速度 → 曲線」に当たる。

   ★ なぜこの形か
     ・**尺の計算はここで純関数として持つ**（rampIntegral / rampDuration）。
       ops 側も同じ積分をするが、UI は「適用する前に、変化後の尺を出す」
       必要があるので、ここに Node で試験できる形（DOM に触らない export）で
       置いた（studio/tests/inspector-speed.test.mjs）。
     ・曲線の縦軸は **対数**。0.1〜10 倍を線形に並べると 1 倍が左端に寄って
       「ちょっと遅くする」が触れなくなる。log なら 1 倍がちょうど中央。
     ・プリセットは t を 0..1 の割合で持ち、当てるときにクリップの尺へ
       伸ばす。こうすると 2 秒のクリップでも 30 秒のクリップでも同じ形になる。
     ・widgets.curveEditor が在ればそれを使う（契約書 §7.3）。無い間は
       自前の SVG 編集器で代替する（点を掴む・空白を押して追加・
       ダブルクリックで削除）。

   ★ 触るときの注意
     ・`clip.setSpeed` と `clip.setSpeedRamp` は **clipId を 1 つずつ**取る op。
       複数選択のときは kit.eachClip（= store.batch）で 1 undo にまとめる。
     ・ramp の t は **clip ローカル秒**。尺が変わると ops が t を伸縮するので、
       当てた直後に読み直す（update() が読み直す）。
     ・速度を変えると後続クリップが詰め直される（ops の ripple 既定 true）。
       ここでは既定のままにしてある（CapCut と同じ挙動）。

   CONTRACT-NOTE: 「音のピッチを保つ」は契約書 §1 の Clip に置き場が無く、
     normalizeProject が知らない枝を落とすため、**FxInstance
     （type:"pitchPreserve"）として clip.fx に積む**形で表した。
     engine/audio 側はこの type を見て playbackRate 補正を切り替えればよい。
     置き場が Clip に増えたら、こちらをその枝へ移す。
   CONTRACT-NOTE: core/ops.js の `scaleLocalTimes()` は keys / audioFade /
     transition の t を尺の変化に合わせて伸縮するが、**speedRamp の t は
     伸縮しない**。ramp は clip ローカル秒なので、速度を変えて尺が縮むと
     ramp の末尾がクリップの外へ出て、途中から「端の速度で一定」の平らな
     尾になる。ここでは当てる前に `shapeDuration()` で変化後の尺を閉じた式で
     出し、**その尺へ形を伸ばした ramp** を渡して回避している。
     ops 側が scaleLocalTimes で speedRamp も伸縮するようになれば、
     rampForShape は単純な scalePreset(shape, clip.duration) に戻せる。
   CONTRACT-NOTE: 補間（なし / ブレンド）は契約書 §9「やらないこと（v1）」に
     光学フロー補間が入っているため、v1 では「なし」だけを選べる形にし、
     選べない旨を画面に出す（依頼書どおり）。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

import { createFieldKit, el, fmtNum } from "./index.js";
import { clamp, finite } from "../../core/util.js";
import { humanDuration } from "../../core/time.js";
import { MIN_CLIP } from "../../core/schema.js";

/* ── 0. 定数 ──────────────────────────────────────────────────────── */

/** UI で触れる速度の幅（ops の下限 0.02 / 上限 100 より内側に置く） */
export const SPEED_MIN = 0.1;
export const SPEED_MAX = 10;
/** フリーズの既定の長さ（秒） */
export const FREEZE_DEFAULT = 2;
/** ピッチ保持を表す効果の type（CONTRACT-NOTE 参照） */
export const PITCH_FX_TYPE = "pitchPreserve";

const KEEP_KEY = "vqstudio.speed.keepDuration";

/* ── 1. 速度ランプの算数（純関数・DOM に触らない＝試験できる）──────── */

/** ramp を「t 昇順・v > 0・重複なし」に整える */
export function normRamp(ramp) {
  if (!Array.isArray(ramp)) return [];
  const out = [];
  for (const raw of ramp) {
    if (!raw || typeof raw !== "object") continue;
    const t = Number(raw.t);
    const v = Number(raw.v);
    if (!Number.isFinite(t) || !Number.isFinite(v) || v <= 0) continue;
    out.push({ t: Math.max(0, t), v: clamp(Math.abs(v), 0.02, 100) });
  }
  out.sort((a, b) => a.t - b.t);
  const dedup = [];
  for (const p of out) {
    const last = dedup[dedup.length - 1];
    if (last && Math.abs(last.t - p.t) < 1e-9) dedup[dedup.length - 1] = p;
    else dedup.push(p);
  }
  return dedup;
}

/**
 * ∫0..t v(τ) dτ … 「local 秒 t までに素材を何秒進めたか」。
 * v は区分線形、両端の外側は端の値で一定（ops の speedRamp と同じ読み方）。
 * @param {Array} ramp @param {number} t @returns {number}
 */
export function rampIntegral(ramp, t) {
  return integ(normRamp(ramp), t);
}

/** rampIntegral の中身（pts は normRamp 済み前提。二分探索から何度も呼ぶので分けた） */
function integ(pts, t) {
  const T = Math.max(0, Number.isFinite(t) ? t : 0);
  if (!pts.length) return T;                       // ramp 無し = 1 倍
  let acc = 0;
  const p0 = pts[0];
  const head = Math.min(T, Math.max(0, p0.t));
  acc += head * p0.v;
  if (T <= p0.t) return acc;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (T <= a.t) break;
    const span = b.t - a.t;
    if (span <= 0) continue;
    const to = Math.min(T, b.t);
    const u = (to - a.t) / span;
    const vAt = a.v + (b.v - a.v) * u;
    acc += ((a.v + vAt) / 2) * (to - a.t);
    if (T <= b.t) return acc;
  }
  const last = pts[pts.length - 1];
  if (T > last.t) acc += (T - last.t) * last.v;
  return acc;
}

/**
 * 「素材を sourceSpan 秒ぶん使うと、タイムライン上の尺は何秒になるか」。
 * v > 0 なので積分は単調増加 → 二分探索で逆算できる。
 * @param {Array} ramp @param {number} sourceSpan 素材側の秒数（out - in）
 * @returns {number}
 */
export function rampDuration(ramp, sourceSpan) {
  const span = Math.max(0, Number.isFinite(sourceSpan) ? sourceSpan : 0);
  const pts = normRamp(ramp);
  if (!pts.length) return span;
  let minV = Infinity;
  let maxT = 0;
  for (const p of pts) { minV = Math.min(minV, p.v); maxT = Math.max(maxT, p.t); }
  if (!(minV > 0)) return span;
  let lo = 0;
  let hi = maxT + span / minV + 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (integ(pts, mid) < span) lo = mid;
    else hi = mid;
  }
  return Math.max(MIN_CLIP, (lo + hi) / 2);
}

/** 速度 → 曲線の縦位置（0..1・対数。1 倍がちょうど 0.5） */
export function speedToY(v) {
  const s = clamp(Number.isFinite(v) ? v : 1, SPEED_MIN, SPEED_MAX);
  return Math.log(s / SPEED_MIN) / Math.log(SPEED_MAX / SPEED_MIN);
}
/** 曲線の縦位置（0..1） → 速度 */
export function yToSpeed(y) {
  const u = clamp(Number.isFinite(y) ? y : 0.5, 0, 1);
  const v = SPEED_MIN * Math.pow(SPEED_MAX / SPEED_MIN, u);
  return Math.round(v * 100) / 100;
}

/**
 * 速度ランプのプリセット。t は 0..1 の割合（当てるときに尺へ伸ばす）。
 * @type {{id:string,label:string,hint:string,points:{t:number,v:number}[]}[]}
 */
export const RAMP_PRESETS = [
  { id: "montage", label: "モンタージュ", hint: "速く入って真ん中をゆっくり、また速く抜ける", points: [{ t: 0, v: 2 }, { t: 0.2, v: 0.6 }, { t: 0.8, v: 0.6 }, { t: 1, v: 2 }] },
  { id: "hero", label: "ヒーロー", hint: "見せ場だけ大きくスローにする", points: [{ t: 0, v: 1 }, { t: 0.35, v: 0.25 }, { t: 0.65, v: 0.25 }, { t: 1, v: 1 }] },
  { id: "skip", label: "飛ばす", hint: "ほぼ早送りで、最後だけ等速に戻す", points: [{ t: 0, v: 4 }, { t: 0.7, v: 4 }, { t: 1, v: 1 }] },
  { id: "jumpcut", label: "ジャンプカット", hint: "速い流れの途中で一瞬だけ止める", points: [{ t: 0, v: 3 }, { t: 0.45, v: 3 }, { t: 0.5, v: 0.2 }, { t: 0.55, v: 3 }, { t: 1, v: 3 }] },
  { id: "slowIn", label: "スローイン", hint: "ゆっくり始めて加速する", points: [{ t: 0, v: 0.3 }, { t: 1, v: 3 }] }
];

/**
 * 0..1 の「形」の平均倍率 … ∫0..1 f(u) du。
 * 形を尺 D へ伸ばしたとき ∫0..D f(t/D) dt = D × mean なので、
 * これだけで「素材を span 秒使うときの尺」が閉じた式で出る（二分探索が要らない）。
 * @param {{t:number,v:number}[]} points t は 0..1
 */
export function shapeMean(points) {
  const m = rampIntegral(points, 1);
  return m > 0 ? m : 1;
}

/**
 * 形（t: 0..1）で素材を sourceSpan 秒使うときの、タイムライン上の尺。
 * この尺へ形を伸ばして ramp にすれば、**ramp がちょうどクリップを覆う**
 * （ops の scaleLocalTimes は speedRamp の t を伸縮しないので、UI 側で
 *  最初から合わせておく。そうしないと末尾が端の速度で一定の平らな尾を引く）。
 */
export function shapeDuration(points, sourceSpan) {
  const span = Math.max(0, Number.isFinite(sourceSpan) ? sourceSpan : 0);
  return Math.max(MIN_CLIP, span / shapeMean(points));
}

/** curveEditor の [[x,y]] → 0..1 の形（t: 0..1, v: 倍率） */
export function curveToShape(points) {
  const list = Array.isArray(points) ? points : [];
  const out = list.map((q) => {
    const x = Array.isArray(q) ? q[0] : (q && q.x);
    const y = Array.isArray(q) ? q[1] : (q && q.y);
    return { t: clamp(finite(x, 0), 0, 1), v: yToSpeed(finite(y, 0.5)) };
  });
  return normRamp(out.length >= 2 ? out : [{ t: 0, v: 1 }, { t: 1, v: 1 }]);
}

/** 割合の点（t: 0..1）→ clip ローカル秒の ramp */
export function scalePreset(points, duration) {
  const d = Math.max(MIN_CLIP, Number.isFinite(duration) ? duration : MIN_CLIP);
  return normRamp((points || []).map((p) => ({ t: clamp(finite(p.t, 0), 0, 1) * d, v: p.v })));
}

/** ramp → curveEditor に渡す [[x, y]]（x: 0..1 の時間, y: 0..1 の速度） */
export function rampToPoints(ramp, duration) {
  const d = Math.max(MIN_CLIP, Number.isFinite(duration) ? duration : MIN_CLIP);
  const pts = normRamp(ramp);
  if (!pts.length) return [[0, speedToY(1)], [1, speedToY(1)]];
  const out = pts.map((p) => [clamp(p.t / d, 0, 1), speedToY(p.v)]);
  if (out[0][0] > 0) out.unshift([0, out[0][1]]);
  if (out[out.length - 1][0] < 1) out.push([1, out[out.length - 1][1]]);
  return out;
}

/** curveEditor の [[x, y]] → clip ローカル秒の ramp */
export function pointsToRamp(points, duration) {
  const d = Math.max(MIN_CLIP, Number.isFinite(duration) ? duration : MIN_CLIP);
  const list = Array.isArray(points) ? points : [];
  return normRamp(list.map((q) => {
    const x = Array.isArray(q) ? q[0] : (q && q.x);
    const y = Array.isArray(q) ? q[1] : (q && q.y);
    return { t: clamp(finite(x, 0), 0, 1) * d, v: yToSpeed(finite(y, 0.5)) };
  }));
}

/* ── 2. 本体 ─────────────────────────────────────────────────────── */

/**
 * 「速度」タブ。
 * @param {{store:Object, widgets?:Object, clipIds:string[], transport?:Object, ctx?:Object}} o
 * @returns {{el:HTMLElement, update:Function, dispose:Function, reset:Function}}
 */
export function createSpeedPanel(o) {
  const store = o.store;
  const kit = createFieldKit({ store, widgets: o.widgets, clipIds: o.clipIds, transport: o.transport });
  const root = el("div", "vqs-spd");

  /** 「尺を保つ」か（プロジェクトには持たない UI の好み。localStorage に覚える） */
  let keepDuration = readKeep();
  /** フリーズで差し込む静止の長さ */
  let freezeDur = FREEZE_DEFAULT;

  const first = () => kit.clips()[0] || null;
  const srcSpan = (c) => Math.max(0, finite(c && c.out, 0) - finite(c && c.in, 0));

  /* ── 1. 一定速度 ────────────────────────────────────────────── */
  const secConst = kit.section({ title: "一定速度", id: "const" });

  const speedField = kit.sld({
    label: "速さ", unit: "×", min: SPEED_MIN, max: SPEED_MAX, step: 0.05, digits: 2, center: 1,
    get: () => kit.read((c) => clamp(finite(c.speed, 1), SPEED_MIN, SPEED_MAX)),
    onInput: (v) => applySpeed(v)
  });
  secConst.add(kit.row({ label: "速さ", field: speedField, onReset: () => applySpeed(1) }));
  secConst.add(kit.btnRow([
    kit.btn("0.5×", () => applySpeed(0.5), { test: "insp-speed-half" }),
    kit.btn("1×", () => applySpeed(1), { test: "insp-speed-one" }),
    kit.btn("2×", () => applySpeed(2), { test: "insp-speed-two" }),
    kit.btn("4×", () => applySpeed(4))
  ], "vqs-spd__quick"));

  const keepField = kit.seg({
    label: "尺の扱い",
    items: [{ value: "grow", label: "尺を伸ばす" }, { value: "keep", label: "尺を保つ" }],
    get: () => ({ value: keepDuration ? "keep" : "grow", mixed: false }),
    onChange: (v) => {
      keepDuration = v === "keep";
      writeKeep(keepDuration);
      keepField.set(keepDuration ? "keep" : "grow", false);
      kit.toast(keepDuration ? "尺を保ち、使う素材の量を変えます" : "使う素材の量を保ち、尺を伸び縮みさせます", { kind: "info" });
    }
  });
  secConst.add(kit.row({ label: "尺の扱い", field: keepField, hint: "「尺を保つ」は素材の使う範囲が変わります（足りなければ縮みます）。" }));
  root.append(secConst.el);

  /* ── 2. 逆再生・フリーズ ────────────────────────────────────── */
  const secTrick = kit.section({ title: "逆再生と静止", id: "trick" });
  const revField = kit.tog({
    label: "逆再生",
    get: () => kit.read((c) => !!c.reverse),
    onChange: (v) => kit.eachClip("逆再生", (c) => ({ type: "clip.reverse", payload: { clipId: c.id, reverse: !!v } }))
  });
  secTrick.add(kit.row({ label: "逆再生", field: revField, hint: "長い素材の逆再生は重くなります（3 秒くらいまでを目安に）。" }));

  const freezeNum = kit.num({
    label: "静止の長さ", unit: "秒", min: 0.1, max: 30, step: 0.1, digits: 1,
    get: () => ({ value: freezeDur, mixed: false }),
    onInput: (v) => { freezeDur = clamp(finite(v, FREEZE_DEFAULT), 0.1, 30); }
  });
  secTrick.add(kit.row({ label: "静止の長さ", field: freezeNum }));
  secTrick.add(kit.btnRow([
    kit.btn("今の位置で静止を差し込む", () => doFreeze(), { cls: "vqs-btn--ghost", test: "insp-speed-freeze" })
  ]));
  root.append(secTrick.el);

  /* ── 3. 速度ランプ（カーブ）─────────────────────────────────── */
  const secRamp = kit.section({ title: "速度ランプ（カーブ）", id: "ramp" });
  const curveHost = el("div", "vqs-spd__curve");
  curveHost.setAttribute("data-test", "insp-speed-curve");
  secRamp.body.append(curveHost);
  let curve = null;                     // { el, set(points) }

  const presetRow = kit.btnRow(
    RAMP_PRESETS.map((p) => kit.btn(p.label, () => applyPreset(p), { title: p.hint, test: "insp-ramp-" + p.id })),
    "vqs-insp-presets vqs-spd__presets"
  );
  secRamp.body.append(presetRow);
  secRamp.add(kit.btnRow([
    kit.btn("カーブを外す（一定速度へ）", () => clearRamp(), { test: "insp-ramp-clear" })
  ]));

  const durLine = kit.kv("変化後の尺", "—", "insp-speed-newdur");
  secRamp.body.append(durLine);
  const rampNote = kit.note("");
  secRamp.body.append(rampNote);
  root.append(secRamp.el);

  /* ── 4. 音 ──────────────────────────────────────────────────── */
  const secAudio = kit.section({ title: "音と補間", id: "spdaudio", open: false });
  const pitchField = kit.tog({
    label: "ピッチを保つ",
    get: () => kit.read((c) => hasPitchFx(c)),
    onChange: (v) => togglePitch(!!v)
  });
  secAudio.add(kit.row({ label: "ピッチを保つ", field: pitchField, hint: "速度を変えても声の高さを変えません（処理はオーディオ側で行います）。" }));

  const interp = kit.seg({
    label: "補間",
    items: [{ value: "none", label: "なし" }, { value: "blend", label: "ブレンド" }],
    get: () => ({ value: "none", mixed: false }),
    onChange: (v) => {
      if (v !== "none") {
        kit.toast("フレームの補間（ブレンド）はこの版では選べません", { kind: "info" });
        interp.set("none", false);
      }
    }
  });
  secAudio.add(kit.row({ label: "補間", field: interp, hint: "この版は「なし」だけです（コマを混ぜる補間は入れていません）。" }));
  root.append(secAudio.el);

  /* ── 書き込み ────────────────────────────────────────────────── */
  function applySpeed(v) {
    const speed = clamp(finite(v, 1), SPEED_MIN, SPEED_MAX);
    kit.eachClip("速度", (c) => ({ type: "clip.setSpeed", payload: { clipId: c.id, speed, keepDuration } }));
    kit.update();
    /* スライダーを掴んでいる間も呼ばれる。曲線の DOM は作り直さず、尺の表示だけ直す */
    refreshEstimate();
  }

  function doFreeze() {
    const list = kit.clips();
    if (!list.length) { kit.toast("クリップを選んでください", { kind: "info" }); return; }
    const t = kit.now();
    const c = list[0];
    const inside = t > finite(c.start, 0) - 1e-6 && t < finite(c.start, 0) + finite(c.duration, 0) + 1e-6;
    if (!inside) { kit.toast("再生ヘッドを、選んだクリップの上へ動かしてください", { kind: "warn" }); return; }
    const r = kit.patch("clip.freeze", { clipId: c.id, t, duration: freezeDur }, { label: "静止を差し込む" });
    if (r) kit.toast(humanDuration(freezeDur) + "の静止を差し込みました", { kind: "success" });
    kit.update();
    renderRamp();  // 尺が変わって ramp の t が伸縮するので描き直す
  }

  /**
   * 0..1 の形をクリップへ当てる ramp にする。
   * 「尺を伸ばす」ときは、形を **これから決まる尺**へ伸ばす（shapeDuration）。
   * こうしないと ramp が古い尺のままで、末尾に平らな尾が残る。
   */
  function rampForShape(c, shape) {
    const span = Math.max(0, finite(c.out, 0) - finite(c.in, 0));
    const dur = Math.max(MIN_CLIP, finite(c.duration, MIN_CLIP));
    const target = keepDuration || !(span > 0) ? dur : shapeDuration(shape, span);
    return { ramp: scalePreset(shape, target), duration: target };
  }

  function applyPreset(p) {
    kit.eachClip(p.label, (c) => ({
      type: "clip.setSpeedRamp",
      payload: { clipId: c.id, ramp: rampForShape(c, p.points).ramp, keepDuration }
    }));
    kit.update();
    renderRamp();
  }

  function clearRamp() {
    kit.eachClip("カーブを外す", (c) => ({ type: "clip.setSpeedRamp", payload: { clipId: c.id, ramp: null, keepDuration } }));
    kit.update();
    renderRamp();
  }

  /** 曲線を触っている間は間引き、離したら 1 回（1 操作 1 undo） */
  const curveDrv = kit.driver({
    label: "速度カーブ",
    apply: (points) => {
      const shape = curveToShape(points);
      kit.eachClip("速度カーブ", (c) => ({
        type: "clip.setSpeedRamp",
        payload: { clipId: c.id, ramp: rampForShape(c, shape).ramp, keepDuration }
      }));
      showEstimate(points);
    }
  });

  function hasPitchFx(c) {
    return (Array.isArray(c.fx) ? c.fx : []).some((f) => f && f.type === PITCH_FX_TYPE && f.enabled !== false);
  }
  function togglePitch(on) {
    kit.eachClip(on ? "ピッチを保つ" : "ピッチを保たない", (c) => {
      const cur = (Array.isArray(c.fx) ? c.fx : []).find((f) => f && f.type === PITCH_FX_TYPE);
      if (on) {
        if (cur) return { type: "clip.updateFx", payload: { clipId: c.id, fxId: cur.id, enabled: true } };
        return { type: "clip.addFx", payload: { clipId: c.id, type: PITCH_FX_TYPE, params: {} } };
      }
      if (!cur) return null;
      return { type: "clip.removeFx", payload: { clipId: c.id, fxId: cur.id } };
    });
    kit.update();
  }

  /* ── 曲線の見せ方 ──────────────────────────────────────────────── */
  function renderRamp() {
    const c = first();
    const list = kit.clips();
    curveHost.textContent = "";
    curve = null;
    if (!c) {
      rampNote.textContent = "クリップを選ぶとカーブを描けます。";
      durLine.querySelector(".vqs-insp-kv__v").textContent = "—";
      return;
    }
    const dur = Math.max(MIN_CLIP, finite(c.duration, MIN_CLIP));
    const points = rampToPoints(c.speedRamp, dur);
    const onChange = (pts) => curveDrv.input(normalizePts(pts));
    const made = kit.tryW("curveEditor", { points, onChange, onInput: onChange, min: 0, max: 1 });
    if (made) {
      curveHost.append(made);
      curve = { el: made, set: (pts) => { if (typeof made.vqsSet === "function") { try { made.vqsSet(pts); } catch (e) { /* noop */ } } } };
    } else {
      const fb = makeCurveFallback({
        points,
        onInput: onChange,
        onEnd: () => curveDrv.end()
      });
      curveHost.append(fb.el);
      curve = fb;
    }
    rampNote.textContent = list.length > 1
      ? "複数のクリップに同じ形のカーブを当てます（尺に合わせて伸縮します）。"
      : "縦が速さ（真ん中が 1 倍）・横がクリップの中の時間です。点を掴んで動かし、空いた所を押すと点が増えます。";
    showEstimate(points);
  }

  function normalizePts(pts) {
    const list = Array.isArray(pts) ? pts : [];
    return list.map((q) => (Array.isArray(q) ? [clamp(finite(q[0], 0), 0, 1), clamp(finite(q[1], 0), 0, 1)] : [clamp(finite(q && q.x, 0), 0, 1), clamp(finite(q && q.y, 0.5), 0, 1)]));
  }

  /** 今のクリップの ramp から尺の表示だけ直す（DOM は作り直さない） */
  function refreshEstimate() {
    const c = first();
    if (!c) return;
    showEstimate(rampToPoints(c.speedRamp, Math.max(MIN_CLIP, finite(c.duration, MIN_CLIP))));
  }

  /** 変化後の尺をその場で出す（当てる前に分かるように） */
  function showEstimate(points) {
    const c = first();
    const slot = durLine.querySelector(".vqs-insp-kv__v");
    if (!c || !slot) return;
    const dur = Math.max(MIN_CLIP, finite(c.duration, MIN_CLIP));
    const span = srcSpan(c);
    if (!(span > 0)) { slot.textContent = fmtNum(dur, 2) + " 秒（素材の尺が分かりません）"; return; }
    const next = rampForShape(c, curveToShape(points)).duration;
    const delta = next - dur;
    slot.textContent = fmtNum(next, 2) + " 秒"
      + (Math.abs(delta) < 0.02 ? "" : `（${delta > 0 ? "+" : "−"}${fmtNum(Math.abs(delta), 2)} 秒）`);
  }

  function readKeep() {
    try { return localStorage.getItem(KEEP_KEY) === "1"; } catch (e) { return false; }
  }
  function writeKeep(v) {
    try { localStorage.setItem(KEEP_KEY, v ? "1" : "0"); } catch (e) { /* 使えない環境は覚えないだけ */ }
  }

  /* ── 契約の形 ─────────────────────────────────────────────────── */
  kit.update(o.clipIds);
  renderRamp();

  return {
    el: root,
    update(ids) {
      kit.update(ids);
      /* 曲線は「今の ramp」を映すだけなので、触っていない時だけ作り直す */
      const c = first();
      if (!c || !curve || typeof curve.set !== "function") { renderRamp(); return; }
      const pts = rampToPoints(c.speedRamp, Math.max(MIN_CLIP, finite(c.duration, MIN_CLIP)));
      curve.set(pts);
      showEstimate(pts);
    },
    reset() {
      kit.eachClip("速度を既定へ戻す", (c) => ({ type: "clip.setSpeedRamp", payload: { clipId: c.id, ramp: null } }));
      kit.eachClip("速度を既定へ戻す", (c) => ({ type: "clip.setSpeed", payload: { clipId: c.id, speed: 1 } }));
      kit.eachClip("速度を既定へ戻す", (c) => ({ type: "clip.reverse", payload: { clipId: c.id, reverse: false } }));
      kit.update();
      renderRamp();
    },
    dispose() {
      kit.dispose();
      try { root.remove(); } catch (e) { /* noop */ }
    }
  };
}

/* ── 3. 自前のカーブ編集器（widgets.curveEditor が無い間の代替）───────
   点を掴む / 空いた所を押して足す / ダブルクリック（長押し）で消す。
   当たり判定は 44px 相当（半径 22 の当たり円を別に置く）。 */

/**
 * @param {{points:number[][], onInput:(pts:number[][])=>void, onEnd:Function}} c
 * @returns {{el:HTMLElement, set:(pts:number[][])=>void}}
 */
export function makeCurveFallback(c) {
  const W = 300;
  const H = 140;
  const PAD = 14;
  const NS = "http://www.w3.org/2000/svg";
  const host = el("div", "vqs-curve");
  host.style.touchAction = "none";           // CSS 担当へ: vqs-curve に同じ指定を
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("class", "vqs-curve__svg");
  svg.setAttribute("role", "application");
  svg.setAttribute("aria-label", "速度カーブ");
  svg.style.width = "100%";
  svg.style.height = "auto";
  svg.style.display = "block";
  svg.style.minHeight = "140px";

  /* 目安の横線（1 倍・2 倍・0.5 倍） */
  const guides = document.createElementNS(NS, "g");
  guides.setAttribute("class", "vqs-curve__guides");
  for (const g of [{ v: 2, t: "2×" }, { v: 1, t: "1×" }, { v: 0.5, t: "0.5×" }]) {
    const y = PAD + (1 - speedToY(g.v)) * (H - PAD * 2);
    const ln = document.createElementNS(NS, "line");
    ln.setAttribute("x1", String(PAD));
    ln.setAttribute("x2", String(W - PAD));
    ln.setAttribute("y1", String(y));
    ln.setAttribute("y2", String(y));
    ln.setAttribute("stroke", "currentColor");
    ln.setAttribute("stroke-opacity", g.v === 1 ? "0.4" : "0.15");
    ln.setAttribute("stroke-dasharray", g.v === 1 ? "" : "3 4");
    const tx = document.createElementNS(NS, "text");
    tx.setAttribute("x", String(W - PAD + 2));
    tx.setAttribute("y", String(y + 3));
    tx.setAttribute("font-size", "9");
    tx.setAttribute("fill", "currentColor");
    tx.setAttribute("fill-opacity", "0.5");
    tx.textContent = g.t;
    guides.append(ln, tx);
  }
  const line = document.createElementNS(NS, "polyline");
  line.setAttribute("fill", "none");
  line.setAttribute("stroke", "currentColor");
  line.setAttribute("stroke-width", "2");
  line.setAttribute("stroke-linejoin", "round");
  line.setAttribute("class", "vqs-curve__line");
  const dots = document.createElementNS(NS, "g");
  dots.setAttribute("class", "vqs-curve__dots");
  svg.append(guides, line, dots);
  host.append(svg);

  let pts = (Array.isArray(c.points) && c.points.length >= 2 ? c.points : [[0, 0.5], [1, 0.5]]).map((q) => [clamp(finite(q[0], 0), 0, 1), clamp(finite(q[1], 0), 0, 1)]);
  let dragIndex = -1;

  const toPx = (p) => [PAD + p[0] * (W - PAD * 2), PAD + (1 - p[1]) * (H - PAD * 2)];
  const toUnit = (x, y) => [clamp((x - PAD) / (W - PAD * 2), 0, 1), clamp(1 - (y - PAD) / (H - PAD * 2), 0, 1)];

  function svgPoint(ev) {
    const r = svg.getBoundingClientRect();
    const sx = ((ev.clientX - r.left) / Math.max(1, r.width)) * W;
    const sy = ((ev.clientY - r.top) / Math.max(1, r.height)) * H;
    return [sx, sy];
  }
  function nearest(sx, sy) {
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const [px, py] = toPx(pts[i]);
      const d = Math.hypot(px - sx, py - sy);
      if (d < bd) { bd = d; best = i; }
    }
    /* 44px の触り所（viewBox は横 300 なので、実寸換算はおおよそで十分） */
    return bd <= 24 ? best : -1;
  }
  function paint() {
    line.setAttribute("points", pts.map((p) => toPx(p).join(",")).join(" "));
    dots.textContent = "";
    pts.forEach((p, i) => {
      const [x, y] = toPx(p);
      const hit = document.createElementNS(NS, "circle");
      hit.setAttribute("cx", String(x));
      hit.setAttribute("cy", String(y));
      hit.setAttribute("r", "22");
      hit.setAttribute("fill", "transparent");
      const dot = document.createElementNS(NS, "circle");
      dot.setAttribute("cx", String(x));
      dot.setAttribute("cy", String(y));
      dot.setAttribute("r", i === dragIndex ? "6" : "4.5");
      dot.setAttribute("fill", "currentColor");
      dot.setAttribute("class", "vqs-curve__pt");
      const lab = document.createElementNS(NS, "title");
      lab.textContent = fmtNum(yToSpeed(p[1]), 2) + "× / " + fmtNum(p[0] * 100, 0) + "%";
      dot.append(lab);
      dots.append(hit, dot);
    });
  }
  function emit() { c.onInput(pts.map((p) => p.slice())); }

  svg.addEventListener("pointerdown", (ev) => {
    const [sx, sy] = svgPoint(ev);
    let i = nearest(sx, sy);
    if (i < 0) {
      /* 空いた所 = 点を足す（両端の間に入れる） */
      const u = toUnit(sx, sy);
      pts.push(u);
      pts.sort((a, b) => a[0] - b[0]);
      i = pts.findIndex((p) => p === u);
      emit();
    }
    dragIndex = i;
    try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* 対応していない環境は無視 */ }
    ev.preventDefault();
    paint();
  });
  svg.addEventListener("pointermove", (ev) => {
    if (dragIndex < 0) return;
    const [sx, sy] = svgPoint(ev);
    const u = toUnit(sx, sy);
    /* 端の点は横に動かさない（0 と 1 を守る） */
    const isFirst = dragIndex === 0;
    const isLast = dragIndex === pts.length - 1;
    const x = isFirst ? 0 : isLast ? 1 : clamp(u[0], pts[dragIndex - 1][0] + 0.01, pts[dragIndex + 1][0] - 0.01);
    pts[dragIndex] = [x, u[1]];
    paint();
    emit();
  });
  const up = () => {
    if (dragIndex < 0) return;
    dragIndex = -1;
    paint();
    c.onEnd();
  };
  svg.addEventListener("pointerup", up);
  svg.addEventListener("pointercancel", up);
  svg.addEventListener("dblclick", (ev) => {
    const [sx, sy] = svgPoint(ev);
    const i = nearest(sx, sy);
    if (i < 0 || pts.length <= 2 || i === 0 || i === pts.length - 1) return;
    pts.splice(i, 1);
    paint();
    emit();
    c.onEnd();
  });

  paint();
  return {
    el: host,
    set(next) {
      if (dragIndex >= 0) return;                 // 掴んでいる間は上から書き換えない
      const list = Array.isArray(next) && next.length >= 2 ? next : [[0, 0.5], [1, 0.5]];
      pts = list.map((q) => [clamp(finite(q[0], 0), 0, 1), clamp(finite(q[1], 0), 0, 1)]);
      paint();
    }
  };
}
