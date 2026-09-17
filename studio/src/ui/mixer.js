/* ══════════════════════════════════════════════════════════════════════════
   studio/src/ui/mixer.js — ミキサー（Premiere のオーディオトラックミキサー相当）

   ★ 何をする所か
     トラックを縦フェーダーで横に並べ、音量（dB）・パン・ミュート／ソロ・
     メーター（縦 2 本 = L/R）・効果の数・名前を 1 画面で見せる所。
     一番右に master を 1 本。上に「マスター音量」「リミッター on/off」
     「ラウドネス目安（LUFS 近似）」、下に「−14 LUFS にそろえる」。
     配信向けの実用機能（−14 LUFS）まで入れるのが依頼の要。

   ★ なぜこの形か
     ・**メーターは canvas 1 枚**。トラックが 10 本なら DOM のメーターは
       20 本の要素 × 毎フレームの style 書き換えになる。1 枚の canvas に
       全部描けば、書き込みは 1 回で済み、iPhone でも 30fps を保てる。
       60fps は狙わない（ミキサーは主役ではない。鳴り方は耳で確かめる物で、
       目で 60fps を追う必要が無い）。
     ・**フェーダーは自前**。widgets.slider は横向きで、縦フェーダーの
       「掴んだ所からの相対移動」「ダブルタップで 0dB」「dB 目盛り」が要る。
       Pointer Events 1 本で書き、掴み所は 44px 以上（幅 64px の列に収まる）。
     ・dB ↔ 線形の変換と目盛りは **inspector/audio.js のものを使い回す**。
       2 箇所に同じ式を書くと、片方だけ直したときに「インスペクタでは
       −6dB、ミキサーでは −5.8dB」という気味の悪い食い違いが出る。
     ・LUFS は **近似**と明記する。本物は K 特性フィルタ（ITU-R BS.1770）を
       通した上での積分で、メーターの RMS からは出せない。ここは
       「−14 にそろえる」という実用の当て所を出すための目安で、
       画面にもその旨を書く（嘘の数字を自信ありげに出さない）。
     ・値の当て方は **1 操作 1 undo**。掴んでいる間は `coalesce:true` の
       dispatch を rAF で間引き、離したら最後の値を 1 回当てる
       （store の合体が「同 type・同じ相手・120ms 以内」なので、
       指が止まっても鎖が切れないように 100ms の心拍を打つ）。

   ★ 触るときの注意
     ・ここは store を読むだけ。編集は必ず ops（`track.update` /
       `settings.update`）経由。
     ・トラックの追加・削除はしない（タイムラインの受け持ち）。
     ・`audio`（AudioEngine）は **無いことがある**。無ければメーターは
       静かなまま、フェーダーは普通に効く（保存される値なので）。
     ・モバイルは横スクロール。列の幅 64px は CSS 変数 --vqs-mixer-strip に
       出してあるので、CSS 担当はそこを触れば良い。

   CONTRACT-NOTE: 契約書 §4 の AudioEngine は `meter(trackId|"master")` を
     持つ。依頼書は「engine/audio/meter.js の read() を rAF で読む」なので、
     ①meter.js の read/readMeter/createMeter ②AudioEngine.meter の順に試し、
     読めた口を 1 つ覚えて使う（どちらが先に出来上がっても動く）。
     読みの形は inspector/audio.js の normalizeMeterReading が吸収する。
   CONTRACT-NOTE: 「−14 LUFS にそろえる」は `settings.audio.master` を
     掛け直す形で当てる（各トラックの volume は触らない）。トラック側を
     触るとユーザーが作った音量差が壊れるため。押した分は 1 undo で戻る。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

import { clamp, finite, isTouch, rafThrottle } from "../core/util.js";
import { warn } from "../core/log.js";
import {
  DB_MIN, DB_MAX, GAIN_MAX,
  gainToDb, dbToGain, clampDb, fmtDb, fmtPan, normalizeMeterReading
} from "./inspector/audio.js";

/* ── §0. 寸法と目盛り ──────────────────────────────────────────────── */

/** 縦フェーダー 1 列の幅（依頼書: モバイルでは 64px ずつ横スクロール） */
export const STRIP_W = 64;
/** メーターの高さ（フェーダーと同じ高さで並べる） */
export const FADER_H = 180;
/** ピークホールド（インスペクタと同じ 1.5 秒） */
export const PEAK_HOLD_MS = 1500;
/** 描き直しの間隔（30fps。60fps は無理に追わない） */
export const FRAME_MS = 33;
/** dB の目盛り（フェーダーとメーターで共用） */
export const DB_TICKS = Object.freeze([12, 6, 0, -6, -12, -18, -24, -36, -48, -60]);

/* ── §1. フェーダーの目盛り（純関数・Node で試験できる）─────────────
   等間隔の dB では 0dB 付近が窮屈になる。放送卓と同じ「上が細かく下が粗い」
   割り付けにする: 0dB を上から 20% の所に置き、そこから下は 2 段の直線。 */

/** 0dB が縦位置のどこに来るか（0 = 上端, 1 = 下端） */
const UNITY_POS = 0.2;
/** 直線が折れる所（この dB より下は粗くなる） */
const KNEE_DB = -24;
const KNEE_POS = 0.68;

/**
 * dB → フェーダーの縦位置（0 = 上端 = +12dB, 1 = 下端 = −∞）。
 * @param {number} db @returns {number} 0..1
 */
export function dbToPos(db) {
  const v = clampDb(db);
  if (v >= 0) return UNITY_POS * (1 - (v / DB_MAX));
  if (v >= KNEE_DB) return UNITY_POS + (KNEE_POS - UNITY_POS) * (v / KNEE_DB);
  return KNEE_POS + (1 - KNEE_POS) * ((v - KNEE_DB) / (DB_MIN - KNEE_DB));
}

/**
 * フェーダーの縦位置 → dB（dbToPos の逆）。
 * @param {number} pos 0..1 @returns {number}
 */
export function posToDb(pos) {
  const p = clamp(finite(pos, 0), 0, 1);
  if (p <= UNITY_POS) return DB_MAX * (1 - p / UNITY_POS);
  if (p <= KNEE_POS) return KNEE_DB * ((p - UNITY_POS) / (KNEE_POS - UNITY_POS));
  return KNEE_DB + (DB_MIN - KNEE_DB) * ((p - KNEE_POS) / (1 - KNEE_POS));
}

/* ── §2. ラウドネスの近似（純関数）─────────────────────────────────
   本物（ITU-R BS.1770）は K 特性フィルタ → 平均二乗 → 対数 → 400ms の窓 →
   −70LUFS の絶対ゲート → 相対ゲート。ここはメーターの RMS しか無いので、
   「K 特性を通していない」「チャンネル合算を 2ch 等価で見る」の 2 点だけ
   割り切って、残りは同じ手順を踏む（だから「目安」と書く）。 */

/** ゲートのしきい（これより小さい窓は勘定に入れない） */
export const LUFS_GATE = -70;
/** 配信で一般的な当て所 */
export const LUFS_TARGET = -14;

/**
 * 平均二乗 → LUFS 近似。
 * 2ch 等価（10*log10(2z) = 20*log10(rms) + 3.01）と BS.1770 の定数 −0.691 を
 * 足した 2.32 を補正に使う。
 * @param {number} meanSquare @returns {number} LUFS（無音は -Infinity）
 */
export function msToLufs(meanSquare) {
  const z = finite(meanSquare, 0);
  if (!(z > 0)) return -Infinity;
  return 10 * Math.log10(z) + 2.32;
}

/** LUFS の見せ方（「−14.2 LUFS」「— LUFS」） */
export function fmtLufs(v) {
  if (!Number.isFinite(v)) return "— LUFS";
  return (v < 0 ? "−" : "") + Math.abs(v).toFixed(1) + " LUFS";
}

/**
 * 目標 LUFS へそろえるための倍率。
 * @param {number} current 今の LUFS @param {number} [target]
 * @returns {number} 掛ける倍率（1 = そのまま）
 */
export function gainForTargetLufs(current, target) {
  const t = finite(target, LUFS_TARGET);
  if (!Number.isFinite(current)) return 1;
  return Math.pow(10, (t - current) / 20);
}

/**
 * ラウドネスの積み上げ（momentary 400ms / short 3s / integrated 全体）。
 * `push(rms, dtMs)` を 30fps で呼ぶだけで 3 つの値が出る。
 * DOM も時計も持たない（= Node で試験できる）。
 * @returns {{push:Function, get:Function, reset:Function}}
 */
export function createLoudnessMeter() {
  const short = [];          // { z, dt } の待ち行列（3 秒分）
  let shortSum = 0;
  let shortDt = 0;
  let momZ = 0;
  let momDt = 0;
  let intSum = 0;            // ゲートを通った窓の平均二乗 × 時間
  let intDt = 0;

  function push(rms, dtMs) {
    const dt = clamp(finite(dtMs, FRAME_MS), 1, 500);
    const z = Math.pow(clamp(finite(rms, 0), 0, 8), 2);
    /* momentary = 直近 400ms */
    momZ = momZ * 0.82 + z * 0.18;
    momDt += dt;
    /* short term = 3 秒の窓 */
    short.push({ z, dt });
    shortSum += z * dt;
    shortDt += dt;
    while (shortDt > 3000 && short.length > 1) {
      const old = short.shift();
      shortSum -= old.z * old.dt;
      shortDt -= old.dt;
    }
    /* integrated = 絶対ゲート（−70 LUFS）を越えた窓だけ積む */
    if (msToLufs(z) > LUFS_GATE) {
      intSum += z * dt;
      intDt += dt;
    }
  }

  function get() {
    return {
      momentary: momDt > 0 ? msToLufs(momZ) : -Infinity,
      short: shortDt > 0 ? msToLufs(shortSum / shortDt) : -Infinity,
      integrated: intDt > 0 ? msToLufs(intSum / intDt) : -Infinity,
      seconds: intDt / 1000
    };
  }

  function reset() {
    short.length = 0;
    shortSum = 0; shortDt = 0; momZ = 0; momDt = 0; intSum = 0; intDt = 0;
  }

  return { push, get, reset };
}

/**
 * 音が鳴り得るトラックだけ（core/eval.js の canSoundTrack と同じ判断）。
 * @param {Object} project @returns {Object[]}
 */
export function soundTracks(project) {
  const list = (project && project.tracks) || [];
  return list.filter((t) => t && typeof t === "object" && String(t.kind) !== "adjust");
}

/* ── §3. 小さな道具 ───────────────────────────────────────────────── */

function el(tag, cls, text) {
  const n = document.createElement(tag || "div");
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = String(text);
  return n;
}
function iconOf(widgets, name, fallback) {
  if (widgets && typeof widgets.icon === "function") {
    try {
      const g = widgets.icon(name);
      if (g && g.nodeType === 1) return g;
    } catch (e) { /* 代替へ */ }
  }
  return el("span", "vqs-ico vqs-ico--text", fallback || "");
}
function toastOf(widgets, msg, opts) {
  if (widgets && typeof widgets.toast === "function") {
    try { return widgets.toast(msg, opts); } catch (e) { /* noop */ }
  }
  return null;
}
/** 同じ文字なら書かない（毎フレーム呼ばれる所で使う） */
function setText(node, text) {
  const t = String(text);
  if (node && node.textContent !== t) node.textContent = t;
}
function touch44(node) {
  if (node && node.style && isTouch()) { node.style.minWidth = "44px"; node.style.minHeight = "44px"; }
  return node;
}

/* ── §4. 本体 ─────────────────────────────────────────────────────── */

/**
 * ミキサーを組み立てる。
 * @param {{store:Object, audio?:Object, widgets?:Object, ctx?:Object}} o
 * @returns {{el:HTMLElement, update:Function, dispose:Function}}
 */
export function createMixer(o) {
  const store = o && o.store;
  if (!store) throw new Error("createMixer: store が必要です");
  const widgets = (o && o.widgets) || null;
  const ctx = (o && o.ctx) || null;
  const audio = (o && o.audio) || (ctx && ctx.audio) || null;

  const root = el("div", "vqs-mixer");
  root.setAttribute("data-test", "mixer");
  root.style.setProperty("--vqs-mixer-strip", STRIP_W + "px");

  let disposed = false;
  let rafId = 0;
  let lastPaint = 0;
  /** trackId → 列の部品 */
  const strips = new Map();
  /** 列の並び（canvas の描き先を決めるのに使う） */
  let order = [];
  /** 今の指紋（トラックの増減・名前の変更で作り直す） */
  let sig = "";
  /** trackId → ピークホールド */
  const holds = new Map();
  /** メーターを描く場所（lane を原点にした実測。rebuild と寸法変化で取り直す） */
  let layout = null;
  const loudness = createLoudnessMeter();
  /** メーターの読み口（見つかるまで null） */
  let meterRead = null;
  let meterTried = false;

  /* ── 4.1 上段（マスター音量・リミッター・LUFS）─────────────────── */
  const head = el("div", "vqs-mixer__head");
  head.setAttribute("data-test", "mixer-head");

  const masterWrap = el("label", "vqs-mixer__master");
  masterWrap.append(el("span", "vqs-mixer__masterlab", "マスター音量"));
  const masterRange = el("input", "vqs-mixer__masterrange");
  masterRange.type = "range";
  masterRange.min = "0";
  masterRange.max = "1";
  masterRange.step = "0.001";
  masterRange.setAttribute("aria-label", "マスター音量");
  masterRange.setAttribute("data-test", "mixer-master");
  masterRange.style.touchAction = "none";      /* CSS 担当へ: .vqs-mixer__masterrange{touch-action:none} */
  if (isTouch()) masterRange.style.minHeight = "44px";
  const masterVal = el("span", "vqs-mixer__masterval", "0.0 dB");
  masterVal.setAttribute("data-test", "mixer-master-db");
  masterWrap.append(masterRange, masterVal);

  const limiterBtn = el("button", "vqs-mixer__limiter");
  limiterBtn.type = "button";
  limiterBtn.setAttribute("data-test", "mixer-limiter");
  limiterBtn.append(iconOf(widgets, "shield", "▲"), el("span", "", "リミッター"));
  touch44(limiterBtn);

  const lufsBox = el("div", "vqs-mixer__lufs");
  lufsBox.setAttribute("data-test", "mixer-lufs");
  const lufsNow = el("strong", "vqs-mixer__lufsnow", "— LUFS");
  const lufsSub = el("span", "vqs-mixer__lufssub", "ラウドネス目安");
  lufsBox.append(lufsNow, lufsSub);
  lufsBox.title = "K 特性フィルタを通していない近似です。目安として使ってください。";

  head.append(masterWrap, limiterBtn, lufsBox);
  root.append(head);

  /* ── 4.2 列の並び（横スクロール）────────────────────────────── */
  const scroller = el("div", "vqs-mixer__scroll");
  scroller.setAttribute("data-test", "mixer-scroll");
  scroller.style.overflowX = "auto";
  scroller.style.overflowY = "hidden";
  scroller.style.webkitOverflowScrolling = "touch";
  const lane = el("div", "vqs-mixer__lane");
  lane.style.display = "flex";
  lane.style.alignItems = "stretch";
  lane.style.position = "relative";      /* canvas をこの中に敷く */
  /** メーターは canvas 1 枚（依頼書）。列の上に重ねる */
  const meterCanvas = el("canvas", "vqs-mixer__meters");
  meterCanvas.setAttribute("data-test", "mixer-meters");
  meterCanvas.setAttribute("aria-hidden", "true");
  meterCanvas.style.position = "absolute";
  meterCanvas.style.left = "0";
  meterCanvas.style.top = "0";
  meterCanvas.style.pointerEvents = "none";
  lane.append(meterCanvas);
  scroller.append(lane);
  root.append(scroller);

  /* ── 4.3 下段（−14 LUFS にそろえる）──────────────────────────── */
  const foot = el("div", "vqs-mixer__foot");
  const alignBtn = el("button", "vqs-btn vqs-btn--primary vqs-mixer__align", "−14 LUFS にそろえる");
  alignBtn.type = "button";
  alignBtn.setAttribute("data-test", "mixer-align");
  alignBtn.title = "配信向けの当て所。今の測りからマスター音量を計算し直します。";
  touch44(alignBtn);
  const footNote = el("p", "vqs-mixer__footnote", "少し再生してから押すと、正しく測れます。");
  foot.append(alignBtn, footNote);
  root.append(foot);

  /* ── 5. 当てる（1 操作 1 undo）──────────────────────────────── */

  /**
   * 掴んでいる間は間引き、離したら 1 回。inspector の driver と同じ考え方。
   * @param {{label:string, apply:(v:number, phase:string)=>void}} cfg
   */
  function makeDriver(cfg) {
    let pending = 0;
    let has = false;
    let beat = 0;
    const flush = rafThrottle(() => {
      if (!has) return;
      try { cfg.apply(pending, "live"); } catch (e) { toastOf(widgets, (e && e.message) || "変えられませんでした", { kind: "error" }); }
    });
    return {
      input(v) {
        pending = v;
        has = true;
        /* 指が止まっている間も 100ms ごとに当て直して合体の鎖を繋ぐ
           （store の合体は 120ms 以内の同 type のみ） */
        if (!beat) beat = setInterval(() => { if (has) { try { cfg.apply(pending, "live"); } catch (e) { /* flush 側で出す */ } } }, 100);
        flush();
      },
      end() {
        if (beat) { clearInterval(beat); beat = 0; }
        if (!has) return;
        has = false;
        try { cfg.apply(pending, "commit"); } catch (e) { toastOf(widgets, (e && e.message) || "変えられませんでした", { kind: "error" }); }
      },
      kill() { if (beat) { clearInterval(beat); beat = 0; } has = false; }
    };
  }
  const drivers = [];
  function driver(cfg) { const d = makeDriver(cfg); drivers.push(d); return d; }

  function dispatch(type, payload, label) {
    try { return store.dispatch(type, payload, { label, coalesce: true }); }
    catch (e) {
      toastOf(widgets, (e && e.message) || "操作できませんでした", { kind: "error" });
      return null;
    }
  }
  const settings = () => (store.project && store.project.settings) || {};
  const audioSettings = () => (settings().audio && typeof settings().audio === "object" ? settings().audio : { master: 1, limiter: true });

  /* マスター音量（settings.audio.master）。位置 → dB → 倍率 */
  const masterDrv = driver({
    label: "マスター音量",
    apply: (g) => {
      dispatch("settings.update", { patch: { audio: { master: clamp(finite(g, 1), 0, GAIN_MAX) } } }, "マスター音量");
      if (audio && typeof audio.setMasterVolume === "function") {
        try { audio.setMasterVolume(clamp(finite(g, 1), 0, GAIN_MAX)); } catch (e) { /* 鳴らないだけ */ }
      }
    }
  });
  masterRange.addEventListener("input", () => {
    const db = posToDb(1 - finite(parseFloat(masterRange.value), 0));
    masterVal.textContent = fmtDb(db);
    masterDrv.input(dbToGain(db));
  });
  masterRange.addEventListener("change", () => masterDrv.end());
  masterRange.addEventListener("pointerup", () => masterDrv.end());
  masterRange.addEventListener("dblclick", () => {
    masterRange.value = String(1 - dbToPos(0));
    masterVal.textContent = fmtDb(0);
    masterDrv.input(1);
    masterDrv.end();
  });

  limiterBtn.addEventListener("click", () => {
    const on = !audioSettings().limiter;
    try { store.dispatch("settings.update", { patch: { audio: { limiter: on } } }, { label: "リミッター" }); }
    catch (e) { toastOf(widgets, (e && e.message) || "変えられませんでした", { kind: "error" }); return; }
    paintHead();
    toastOf(widgets, on ? "リミッターを入れました（音が割れにくくなります）" : "リミッターを切りました", { kind: "info" });
  });

  alignBtn.addEventListener("click", () => {
    const m = loudness.get();
    const cur = Number.isFinite(m.integrated) ? m.integrated : m.short;
    if (!Number.isFinite(cur)) {
      toastOf(widgets, "まだ測れていません。少し再生してからもう一度押してください。", { kind: "info" });
      return;
    }
    const factor = gainForTargetLufs(cur, LUFS_TARGET);
    const next = clamp(finite(audioSettings().master, 1) * factor, 0, GAIN_MAX);
    try { store.dispatch("settings.update", { patch: { audio: { master: next } } }, { label: "−14 LUFS にそろえる" }); }
    catch (e) { toastOf(widgets, (e && e.message) || "そろえられませんでした", { kind: "error" }); return; }
    if (audio && typeof audio.setMasterVolume === "function") {
      try { audio.setMasterVolume(next); } catch (e) { /* noop */ }
    }
    loudness.reset();
    paintHead();
    toastOf(widgets, "マスター音量を " + fmtDb(gainToDb(next)) + " にしました（測り: " + fmtLufs(cur) + "）", { kind: "success" });
  });

  /* ── 6. 列（strip）────────────────────────────────────────────── */

  /**
   * 1 列を作る。`id === "master"` のときはマスター用（パン・ソロ無し）。
   * @param {Object|null} track @param {string} id
   */
  function makeStrip(track, id) {
    const isMaster = id === "master";
    const host = el("div", "vqs-mixer__strip" + (isMaster ? " vqs-mixer__strip--master" : ""));
    host.setAttribute("data-test", "mixer-strip-" + id);
    host.setAttribute("data-track", id);
    host.style.flex = "0 0 auto";
    host.style.width = STRIP_W + "px";

    const name = el("div", "vqs-mixer__name", isMaster ? "マスター" : String((track && track.name) || "トラック"));
    name.title = name.textContent;
    const fxCount = el("div", "vqs-mixer__fx", "");
    fxCount.setAttribute("data-test", "mixer-fx-" + id);

    /* フェーダーとメーターを横に並べる（メーターは canvas 1 枚なので場所だけ空ける） */
    const bay = el("div", "vqs-mixer__bay");
    bay.style.position = "relative";
    bay.style.display = "flex";
    bay.style.gap = "4px";
    bay.style.height = FADER_H + "px";

    const fader = el("div", "vqs-mixer__fader");
    fader.setAttribute("role", "slider");
    fader.setAttribute("aria-label", (isMaster ? "マスター" : name.textContent) + "の音量");
    fader.setAttribute("aria-valuemin", String(DB_MIN));
    fader.setAttribute("aria-valuemax", String(DB_MAX));
    fader.setAttribute("data-test", "mixer-fader-" + id);
    fader.tabIndex = 0;
    fader.style.position = "relative";
    fader.style.flex = "1 1 auto";
    fader.style.minWidth = "28px";
    fader.style.height = "100%";
    fader.style.touchAction = "none";   /* CSS 担当へ: .vqs-mixer__fader{touch-action:none} */
    const rail = el("div", "vqs-mixer__rail");
    rail.style.position = "absolute";
    rail.style.left = "50%";
    rail.style.top = "0";
    rail.style.bottom = "0";
    rail.style.width = "4px";
    rail.style.transform = "translateX(-2px)";
    const cap = el("div", "vqs-mixer__cap");
    cap.style.position = "absolute";
    cap.style.left = "0";
    cap.style.right = "0";
    cap.style.height = "18px";
    cap.style.marginTop = "-9px";
    /* 掴み所は 44px 以上（見た目 18px の上に透明な当たり判定を重ねる） */
    const grab = el("div", "vqs-mixer__grab");
    grab.style.position = "absolute";
    grab.style.left = "-8px";
    grab.style.right = "-8px";
    grab.style.height = "44px";
    grab.style.marginTop = "-22px";
    fader.append(rail, cap, grab);

    /* メーターの場所（canvas はこの矩形へ描く） */
    const meterSlot = el("div", "vqs-mixer__meterslot");
    meterSlot.style.flex = "0 0 14px";
    meterSlot.style.height = "100%";
    bay.append(fader, meterSlot);

    const dbRead = el("div", "vqs-mixer__db", "0.0 dB");
    dbRead.setAttribute("data-test", "mixer-db-" + id);

    /* パン（マスターには出さない。−1..1 の小さな横スライダー） */
    let panRange = null;
    let panRead = null;
    if (!isMaster) {
      panRange = el("input", "vqs-mixer__pan");
      panRange.type = "range";
      panRange.min = "-1";
      panRange.max = "1";
      panRange.step = "0.01";
      panRange.setAttribute("aria-label", name.textContent + "のパン");
      panRange.setAttribute("data-test", "mixer-pan-" + id);
      panRange.style.width = "100%";
      panRange.style.touchAction = "none";
      if (isTouch()) panRange.style.minHeight = "32px";
      panRead = el("div", "vqs-mixer__panread", "中央");
    }

    /* ミュート・ソロ */
    const btns = el("div", "vqs-mixer__btns");
    btns.style.display = "flex";
    btns.style.gap = "2px";
    const muteBtn = el("button", "vqs-mixer__m", "M");
    muteBtn.type = "button";
    muteBtn.title = "ミュート";
    muteBtn.setAttribute("aria-label", name.textContent + "をミュート");
    muteBtn.setAttribute("data-test", "mixer-mute-" + id);
    muteBtn.style.flex = "1 1 0";
    if (isTouch()) muteBtn.style.minHeight = "44px";
    btns.append(muteBtn);
    let soloBtn = null;
    if (!isMaster) {
      soloBtn = el("button", "vqs-mixer__s", "S");
      soloBtn.type = "button";
      soloBtn.title = "ソロ（これだけ鳴らす）";
      soloBtn.setAttribute("aria-label", name.textContent + "をソロ");
      soloBtn.setAttribute("data-test", "mixer-solo-" + id);
      soloBtn.style.flex = "1 1 0";
      if (isTouch()) soloBtn.style.minHeight = "44px";
      btns.append(soloBtn);
    }

    host.append(name, bay, dbRead, btns);
    if (panRange) host.append(panRange, panRead);
    host.append(fxCount);

    /* ── 値を当てる ── */
    const volDrv = driver({
      label: "音量",
      apply: (g) => {
        if (isMaster) {
          dispatch("settings.update", { patch: { audio: { master: g } } }, "マスター音量");
          if (audio && typeof audio.setMasterVolume === "function") {
            try { audio.setMasterVolume(g); } catch (e) { /* noop */ }
          }
        } else {
          dispatch("track.update", { trackId: id, patch: { volume: g } }, "音量");
        }
      }
    });
    const panDrv = driver({
      label: "パン",
      apply: (p) => { if (!isMaster) dispatch("track.update", { trackId: id, patch: { pan: p } }, "パン"); }
    });

    /** 今の dB（store が正） */
    function curDb() {
      const g = isMaster ? finite(audioSettings().master, 1) : finite(trackOf(id) && trackOf(id).volume, 1);
      return clampDb(gainToDb(g));
    }

    /* フェーダーの掴み（Pointer Events。掴んだ所からの相対移動） */
    let dragging = false;
    let startY = 0;
    let startPos = 0;
    const onDown = (ev) => {
      if (ev.button !== undefined && ev.button !== 0) return;
      dragging = true;
      startY = ev.clientY;
      startPos = dbToPos(curDb());
      try { grab.setPointerCapture(ev.pointerId); } catch (e) { /* 無ければそのまま */ }
      ev.preventDefault();
    };
    const onMove = (ev) => {
      if (!dragging) return;
      const h = fader.clientHeight || FADER_H;
      const pos = clamp(startPos + (ev.clientY - startY) / h, 0, 1);
      const db = clampDb(posToDb(pos));
      setCap(db);
      volDrv.input(dbToGain(db));
      ev.preventDefault();
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      volDrv.end();
    };
    grab.addEventListener("pointerdown", onDown);
    grab.addEventListener("pointermove", onMove);
    grab.addEventListener("pointerup", onUp);
    grab.addEventListener("pointercancel", onUp);
    /* 空いた所を押したらそこへ飛ぶ（卓と同じ） */
    fader.addEventListener("pointerdown", (ev) => {
      if (ev.target === grab || ev.target === cap) return;
      const r = fader.getBoundingClientRect();
      const db = clampDb(posToDb((ev.clientY - r.top) / Math.max(1, r.height)));
      setCap(db);
      volDrv.input(dbToGain(db));
      volDrv.end();
    });
    /* ダブルタップで 0dB（卓の作法） */
    grab.addEventListener("dblclick", () => { setCap(0); volDrv.input(1); volDrv.end(); });
    /* キーボード（↑↓ 1dB, PageUp/Down 6dB, Home 0dB） */
    fader.addEventListener("keydown", (ev) => {
      const step = ev.key === "ArrowUp" ? 1 : ev.key === "ArrowDown" ? -1
        : ev.key === "PageUp" ? 6 : ev.key === "PageDown" ? -6 : 0;
      if (!step && ev.key !== "Home") return;
      ev.preventDefault();
      const db = ev.key === "Home" ? 0 : clampDb(curDb() + step);
      setCap(db);
      volDrv.input(dbToGain(db));
      volDrv.end();
    });

    if (panRange) {
      panRange.addEventListener("input", () => {
        const v = clamp(finite(parseFloat(panRange.value), 0), -1, 1);
        panRead.textContent = fmtPan(v);
        panDrv.input(v);
      });
      panRange.addEventListener("change", () => panDrv.end());
      panRange.addEventListener("pointerup", () => panDrv.end());
      panRange.addEventListener("dblclick", () => { panRange.value = "0"; panRead.textContent = fmtPan(0); panDrv.input(0); panDrv.end(); });
    }
    muteBtn.addEventListener("click", () => {
      if (isMaster) {
        const g = finite(audioSettings().master, 1);
        const next = g > 0 ? 0 : 1;
        try { store.dispatch("settings.update", { patch: { audio: { master: next } } }, { label: "マスターをミュート" }); }
        catch (e) { toastOf(widgets, (e && e.message) || "変えられませんでした", { kind: "error" }); }
      } else {
        const tr = trackOf(id);
        dispatchOnce("track.update", { trackId: id, patch: { muted: !(tr && tr.muted) } }, "ミュート");
      }
      refresh();
    });
    if (soloBtn) {
      soloBtn.addEventListener("click", () => {
        const tr = trackOf(id);
        dispatchOnce("track.update", { trackId: id, patch: { solo: !(tr && tr.solo) } }, "ソロ");
        refresh();
      });
    }

    /** cap の位置と読みを書く（store を待たずに指へ付いてくる） */
    function setCap(db) {
      const pos = dbToPos(db);
      cap.style.top = (pos * 100) + "%";
      grab.style.top = (pos * 100) + "%";
      dbRead.textContent = fmtDb(db);
      fader.setAttribute("aria-valuenow", String(Math.round(clampDb(db) * 10) / 10));
      fader.setAttribute("aria-valuetext", fmtDb(db));
    }

    /** store から読み直す */
    function refresh() {
      const tr = isMaster ? null : trackOf(id);
      if (!isMaster && !tr) return;
      setCap(curDb());
      if (!isMaster) {
        name.textContent = String(tr.name || "トラック");
        name.title = name.textContent;
        const p = clamp(finite(tr.pan, 0), -1, 1);
        if (panRange && document.activeElement !== panRange) panRange.value = String(p);
        if (panRead) panRead.textContent = fmtPan(p);
        const muted = !!tr.muted;
        muteBtn.classList.toggle("vqs-mixer__m--on", muted);
        muteBtn.setAttribute("aria-pressed", muted ? "true" : "false");
        if (soloBtn) {
          soloBtn.classList.toggle("vqs-mixer__s--on", !!tr.solo);
          soloBtn.setAttribute("aria-pressed", tr.solo ? "true" : "false");
        }
        const n = ((tr.fx) || []).length;
        fxCount.textContent = n ? "効果 " + n : "";
        fxCount.title = n ? n + " 個の効果が掛かっています" : "";
        host.classList.toggle("vqs-mixer__strip--muted", muted);
        host.classList.toggle("vqs-mixer__strip--solo", !!tr.solo);
      } else {
        const g = finite(audioSettings().master, 1);
        muteBtn.classList.toggle("vqs-mixer__m--on", !(g > 0));
        muteBtn.setAttribute("aria-pressed", g > 0 ? "false" : "true");
        fxCount.textContent = audioSettings().limiter ? "リミッター" : "";
      }
    }

    refresh();
    return { id, host, meterSlot, refresh, isMaster };
  }

  /** 合体させたくない 1 回きりの操作 */
  function dispatchOnce(type, payload, label) {
    try { return store.dispatch(type, payload, { label, coalesce: false }); }
    catch (e) {
      toastOf(widgets, (e && e.message) || "操作できませんでした", { kind: "error" });
      return null;
    }
  }
  function trackOf(id) {
    for (const t of (store.project && store.project.tracks) || []) if (t && t.id === id) return t;
    return null;
  }

  /* ── 7. 列の並べ直し ────────────────────────────────────────── */

  function sigOf() {
    const list = soundTracks(store.project);
    return list.map((t) => t.id + ":" + (t.name || "")).join("|") + "|master";
  }

  function rebuild() {
    sig = sigOf();
    holds.clear();
    layout = null;
    for (const s of strips.values()) { try { s.host.remove(); } catch (e) { /* noop */ } }
    strips.clear();
    order = [];
    /* 下のトラック（V1 = 配列の先頭）を左に並べる。タイムラインと上下が
       逆に見えるが、卓は「左から順番」なので、番号の若い順が自然。 */
    for (const tr of soundTracks(store.project)) {
      const s = makeStrip(tr, tr.id);
      strips.set(tr.id, s);
      order.push(s);
      lane.append(s.host);
    }
    const m = makeStrip(null, "master");
    strips.set("master", m);
    order.push(m);
    lane.append(m.host);
    if (!order.length) lane.append(el("p", "vqs-mixer__empty", "音のトラックがまだありません。"));
    paintHead();
  }

  function paintHead() {
    const g = clamp(finite(audioSettings().master, 1), 0, GAIN_MAX);
    const db = clampDb(gainToDb(g));
    if (document.activeElement !== masterRange) masterRange.value = String(1 - dbToPos(db));
    masterVal.textContent = fmtDb(db);
    const on = !!audioSettings().limiter;
    limiterBtn.classList.toggle("vqs-mixer__limiter--on", on);
    limiterBtn.setAttribute("aria-pressed", on ? "true" : "false");
    limiterBtn.title = on ? "リミッターが入っています（0dB を超えさせません）" : "リミッターは切れています";
  }

  /* ── 8. メーター（canvas 1 枚・30fps）──────────────────────────── */

  function ensureMeter() {
    if (meterRead || meterTried) return;
    meterTried = true;
    import("../engine/audio/meter.js").then((mod) => {
      if (disposed) return;
      meterRead = buildReader(mod);
    }, () => {
      if (disposed) return;
      meterRead = buildReader(null);
    });
  }
  /** meter.js → AudioEngine.meter の順に試す（CONTRACT-NOTE 参照） */
  function buildReader(mod) {
    const call = (fn, args) => { try { return fn.apply(null, args); } catch (e) { return null; } };
    if (mod) {
      if (typeof mod.read === "function") return (id) => normalizeMeterReading(call(mod.read, [id]));
      if (typeof mod.readMeter === "function") return (id) => normalizeMeterReading(call(mod.readMeter, [id]));
      if (typeof mod.createMeter === "function") {
        const inst = call(mod.createMeter, [{ audio, ctx: audio && audio.ctx }]);
        if (inst && typeof inst.read === "function") return (id) => normalizeMeterReading(call(inst.read.bind(inst), [id]));
      }
    }
    if (audio && typeof audio.meter === "function") return (id) => normalizeMeterReading(call(audio.meter.bind(audio), [id]));
    footNote.textContent = "メーターはこの環境では動きません（音量とパンは普通に効きます）。";
    return null;
  }

  function holdOf(id) {
    let h = holds.get(id);
    if (!h) { h = [{ v: 0, at: 0 }, { v: 0, at: 0 }]; holds.set(id, h); }
    return h;
  }

  /**
   * メーターの場所を実測して覚える（lane を原点にした座標）。
   * 毎フレーム getBoundingClientRect を呼ぶと 30fps でも reflow が積むので、
   * 作り直したときと寸法が変わったときだけ測る。
   * canvas の幅は **測った列の右端**から出す（lane.scrollWidth を見ると、
   * 絶対配置の canvas 自身が scrollWidth を押し広げて毎フレーム太る）。
   */
  function measure() {
    const base = lane.getBoundingClientRect();
    const slots = [];
    let right = 0;
    let bottom = 0;
    for (const s of order) {
      if (!s.meterSlot || !s.meterSlot.isConnected) continue;
      const r = s.meterSlot.getBoundingClientRect();
      const hr = s.host.getBoundingClientRect();
      slots.push({
        id: s.id, isMaster: s.isMaster,
        x: r.left - base.left, y: r.top - base.top,
        w: Math.max(4, r.width), h: Math.max(8, r.height)
      });
      right = Math.max(right, hr.right - base.left);
      bottom = Math.max(bottom, hr.bottom - base.top);
    }
    layout = {
      slots,
      width: Math.max(1, Math.round(Math.max(right, base.width))),
      height: Math.max(1, Math.round(Math.max(bottom, base.height))),
      atW: Math.round(base.width), atH: Math.round(base.height)
    };
    return layout;
  }

  /** 1 枚の canvas に全部の縦メーター（L/R）を描く */
  function paintMeters(now) {
    if (!order.length) return;
    const bw = Math.round(lane.clientWidth);
    const bh = Math.round(lane.clientHeight);
    if (!layout || layout.atW !== bw || layout.atH !== bh) measure();
    if (!layout || !layout.slots.length) return;
    const dpr = clamp(finite(globalThis.devicePixelRatio, 1), 1, 2);
    const w = layout.width;
    const h = layout.height;
    const pw = Math.round(w * dpr);
    const ph = Math.round(h * dpr);
    if (meterCanvas.width !== pw || meterCanvas.height !== ph) {
      meterCanvas.width = pw;
      meterCanvas.height = ph;
      meterCanvas.style.width = w + "px";
      meterCanvas.style.height = h + "px";
    }
    const g = meterCanvas.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    let masterRms = 0;
    for (const slot of layout.slots) {
      const reading = meterRead ? meterRead(slot.id) : null;
      const hold = holdOf(slot.id);
      const peak = reading ? reading.peak : [0, 0];
      const rms = reading ? reading.rms : [0, 0];
      for (let ch = 0; ch < 2; ch++) {
        const hd = hold[ch];
        if (peak[ch] >= hd.v) { hd.v = peak[ch]; hd.at = now; }
        else if (now - hd.at > PEAK_HOLD_MS) { hd.v = peak[ch]; hd.at = now; }
      }
      if (slot.isMaster) masterRms = Math.max(rms[0], rms[1]);
      drawVertPair(g, slot.x, slot.y, slot.w, slot.h, peak, rms, hold);
    }
    /* ラウドネスはマスターの RMS から積む（読めないときは 0 = 測らない） */
    loudness.push(masterRms, FRAME_MS);
    const m = loudness.get();
    const shown = Number.isFinite(m.integrated) ? m.integrated : m.short;
    /* 30fps で同じ文字を書き直すと無駄な reflow が積むので、変わった時だけ */
    setText(lufsNow, fmtLufs(shown));
    lufsNow.classList.toggle("vqs-mixer__lufsnow--hot", Number.isFinite(shown) && shown > LUFS_TARGET + 1);
    setText(lufsSub, Number.isFinite(shown)
      ? (m.seconds < 3 ? "測り始めました（目安）" : "目安 ・ 目標 −14")
      : "ラウドネス目安");
  }

  /** 縦 2 本（L/R）＋ ピークホールド ＋ 0dB の線 */
  function drawVertPair(g, x, y, w, h, peak, rms, hold) {
    const barW = Math.max(3, (w - 2) / 2);
    g.fillStyle = "rgba(255,255,255,.06)";
    g.fillRect(x, y, w, h);
    /* 0dB の位置に線（それより上は赤い帯） */
    const zero = dbToPos(0) * h;
    g.fillStyle = "rgba(255,120,120,.28)";
    g.fillRect(x, y, w, zero);
    for (let ch = 0; ch < 2; ch++) {
      const bx = x + ch * (barW + 1);
      const pv = dbToPos(gainToDb(peak[ch])) * h;
      const rv = dbToPos(gainToDb(rms[ch])) * h;
      /* peak（薄い）→ rms（濃い）の 2 段で描くと、ならし具合が目で分かる */
      if (pv < h) {
        const grad = g.createLinearGradient(0, y, 0, y + h);
        grad.addColorStop(0, "#ff6b6b");
        grad.addColorStop(dbToPos(0), "#ffd166");
        grad.addColorStop(dbToPos(-12), "#7ee081");
        grad.addColorStop(1, "#3ddc97");
        g.fillStyle = grad;
        g.globalAlpha = 0.5;
        g.fillRect(bx, y + pv, barW, h - pv);
        g.globalAlpha = 1;
        g.fillRect(bx, y + rv, barW, h - rv);
      }
      const hv = dbToPos(gainToDb(hold[ch].v)) * h;
      if (hv < h - 1) {
        g.fillStyle = hold[ch].v >= 1 ? "#ff6b6b" : "rgba(255,255,255,.92)";
        g.fillRect(bx, y + hv, barW, 2);
      }
    }
  }

  function tick(now) {
    rafId = 0;
    if (disposed) return;
    if (root.isConnected && now - lastPaint >= FRAME_MS) {
      lastPaint = now;
      try { paintMeters(now); } catch (e) { warn("mixer", "メーターを描けなかった", e); }
    }
    schedule();
  }
  function schedule() {
    if (disposed || rafId || typeof requestAnimationFrame !== "function") return;
    rafId = requestAnimationFrame(tick);
  }

  /* ── 9. store の変化に付いていく ──────────────────────────────── */

  /** store から全部読み直す（トラックが増減していたら組み直す） */
  function updateAll() {
    if (disposed) return;
    if (sigOf() !== sig) { rebuild(); return; }
    for (const s of strips.values()) { try { s.refresh(); } catch (e) { /* noop */ } }
    paintHead();
  }

  const off = typeof store.subscribe === "function" ? store.subscribe((ev) => {
    /* view（再生位置・ズーム）では何も変わらないので無視する */
    if (!ev || ev.kind === "view") return;
    updateAll();
  }) : null;

  /** 寸法が変わったら測り直す（ResizeObserver が無い環境は paintMeters が拾う） */
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => { layout = null; }) : null;
  if (ro) { try { ro.observe(lane); } catch (e) { /* noop */ } }

  const api = {
    el: root,
    update: updateAll,
    /** 測りを捨てる（書き出し前・素材を入れ替えた後などに呼ぶ） */
    resetLoudness() { loudness.reset(); },
    dispose() {
      disposed = true;
      if (rafId && typeof cancelAnimationFrame === "function") cancelAnimationFrame(rafId);
      rafId = 0;
      for (const d of drivers) { try { d.kill(); } catch (e) { /* noop */ } }
      drivers.length = 0;
      if (typeof off === "function") { try { off(); } catch (e) { /* noop */ } }
      if (ro) { try { ro.disconnect(); } catch (e) { /* noop */ } }
      strips.clear();
      holds.clear();
      try { root.remove(); } catch (e) { /* noop */ }
    }
  };

  rebuild();
  ensureMeter();
  schedule();
  return api;
}

/**
 * ミキサーをシート／モーダルで開く（左パネルに常駐させない使い方）。
 * widgets が無い環境では #sheetHost（無ければ body）へ直に出す。
 * @param {{store:Object, audio?:Object, widgets?:Object, ctx?:Object}} o
 * @returns {{close:Function, mixer:Object}}
 */
export function openMixer(o) {
  const mixer = createMixer(o);
  const widgets = (o && o.widgets) || null;
  let handle = null;
  if (widgets && typeof widgets.openSheet === "function") {
    try { handle = widgets.openSheet({ title: "ミキサー", content: mixer.el, height: "auto" }); }
    catch (e) { handle = null; }
  }
  if (!handle && widgets && typeof widgets.openModal === "function") {
    try { handle = widgets.openModal({ title: "ミキサー", content: mixer.el }); }
    catch (e) { handle = null; }
  }
  if (!handle) {
    const host = document.getElementById("sheetHost") || document.body;
    const wrap = el("div", "vqs-mixer__fallback");
    const close = el("button", "vqs-btn vqs-btn--ghost", "閉じる");
    close.type = "button";
    touch44(close);
    wrap.append(mixer.el, close);
    host.append(wrap);
    const done = () => { try { wrap.remove(); } catch (e) { /* noop */ } };
    close.addEventListener("click", () => { mixer.dispose(); done(); });
    handle = { close: () => { mixer.dispose(); done(); } };
  }
  return {
    mixer,
    close() {
      try { if (handle && typeof handle.close === "function") handle.close(); } catch (e) { /* noop */ }
      mixer.dispose();
    }
  };
}
