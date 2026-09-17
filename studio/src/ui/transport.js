/* ══════════════════════════════════════════════════════════════════════════
   studio/src/ui/transport.js — 再生操作の列（#transport）

   ★ 何をする所か
     プレビューの真下に置く「再生機」。
       中央: 先頭へ / 1 コマ戻る / 再生・一時停止 / 1 コマ進む / 末尾へ /
             ループ / 逆再生
       左  : タイムコード（現在 / 全体。叩けば打ち込める・横へ擦れば早送り）と
             イン点・アウト点（設定 / 解除 / その点へ飛ぶ / 範囲の長さ）
       右  : 再生速度（0.25〜4）・マスター音量・プレビュー画質・比率・
             全画面・スナップショット（現在フレームを PNG）・実測 fps
     モバイル（< 1024px）は 1 列だけ: 再生・コマ送り・タイムコード・全画面。

   ★ なぜこの形か
     ・**組み立ては 1 回、render() は状態だけ**書き換える。毎回作り直すと
       指を置いた瞬間にボタンが消えて押せなくなる（触り所 44px の意味が無くなる）。
     ・engine/playback.js（Transport）は **無いことがある**（並行して作っている）。
       無い器でも「時刻の表示・コマ送り・タイムコードの打ち込み」は
       store.setView({playhead}) で成立させ、再生だけを無効にする。
       画面が真っ白にならないことが最優先。
     ・Space は **奪い合わない**。ui/shortcuts.js が先に preventDefault した
       ときは黙って譲る（両方が toggle すると 2 回切り替わって何も起きない）。
       入力欄・ボタンに焦点が在るときも触らない（ボタンは Space で自分が押される）。
     ・実測 fps の rAF は **再生中だけ**。表示のために電池を使い続けない。
     ・全画面は iPhone に `requestFullscreen` が無い（契約書 §13.4）。
       在れば本物、無ければ position:fixed の疑似全画面に落とす。
       疑似の方は CSS 担当が居なくても成立するよう、最小限の inline style を
       自分で当てて、抜けるときに必ず戻す。
     ・スナップショットは **今プレビューに出ている絵**を撮る。合成器の
       grabPixels() が読めればそれを使い、読めなければ canvas を直に写す。

   ★ 触るときの注意
     ・短絡キーの割り当ては ui/shortcuts.js が正。ここは tooltip に書くだけ。
     ・速度とループは **保存形式に枝が無い**（契約書 §1）。
       CONTRACT-NOTE: 速度は engine の Transport が持つ値（= 保存しない）、
       ループだけ localStorage に覚える。project を汚さない。
     ・音量は `settings.audio.master`（保存される値）。ここでは ops 経由で当て、
       AudioEngine には触らない（engine は settings を見る）。
     ・widgets.js / icons.js は未完成でも動くように、在る物だけ使う。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

import { clamp, finite, rafThrottle, throttle } from "../core/util.js";
import { toTC, fromTC, snapFrame, frameDur } from "../core/time.js";
import { projectDuration, RATIOS } from "../core/schema.js";
import { warn } from "../core/log.js";

const MOBILE_W = 1024;                       // 契約書 §7.2 の境目
const RATES = [0.25, 0.5, 0.75, 1, 1.5, 2, 4];
const LOOP_KEY = "vqstudio.transport.loop";
const SCRUB_PX_PER_FRAME = 4;                // タイムコードを擦るときの手触り
const CLICK_SLOP = 5;                        // これ未満の移動は「叩いた」扱い

/** プレビュー画質（契約書 §1 settings.previewQuality） */
const QUALITIES = [
  ["auto", "自動", "画質 自動"],
  ["full", "フル", "画質 フル"],
  ["half", "1/2", "画質 1/2"],
  ["quarter", "1/4", "画質 1/4"]
];

/* ── 小道具（共有ファイルは担当外なので各自が持つ。timeline/toolbar.js と同じ作り）── */
const has = (o, k) => !!o && typeof o[k] === "function";
function tryCall(o, k, args) {
  if (!has(o, k)) return undefined;
  try { return o[k].apply(o, args || []); } catch (e) { warn("transport", k, e); return undefined; }
}
function el(tag, cls, attrs) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (attrs) for (const k in attrs) { if (attrs[k] != null) n.setAttribute(k, String(attrs[k])); }
  return n;
}
function iconEl(W, name, glyph) {
  const made = tryCall(W, "icon", [name]);
  if (made && made.nodeType === 1) return made;
  const s = el("span", "vqs-tricon vqs-tricon--text", { "aria-hidden": "true", "data-icon": name });
  s.textContent = glyph || "";
  return s;
}
function tip(W, node, text, key) {
  const full = key ? text + " (" + key + ")" : text;
  node.setAttribute("aria-label", text);
  if (key) node.setAttribute("data-key", key);
  if (has(W, "tooltip")) tryCall(W, "tooltip", [node, full]); else node.title = full;
}
function lsGet(key, dflt) {
  try { const v = globalThis.localStorage.getItem(key); return v == null ? dflt : v; } catch (_e) { return dflt; }
}
function lsSet(key, v) { try { globalThis.localStorage.setItem(key, String(v)); } catch (_e) { /* 覚えられなくて良い */ } }
/** 読めた計算済みの値（読めない器では null） */
function computed(node) {
  try { return typeof getComputedStyle === "function" ? getComputedStyle(node) : null; } catch (_e) { return null; }
}
/**
 * 触り所を 44px 以上にする（契約書 §7.2）。
 * CSS 担当が既に決めているならそれを尊重し、誰も決めていないときだけ補う
 * （inline style は CSS より強いので、勝手に上書きすると後から直せなくなる）。
 */
function ensureTouchSize(node) {
  const cs = computed(node);
  if (!cs) { node.style.minWidth = "44px"; node.style.minHeight = "44px"; return; }
  /* flex の子の min-height は "auto" と返る（数にならない）。
     読めない値は 0（= 誰も決めていない）として扱う。NaN の比較は必ず false に
     なるので、ここを素通りさせると触り所が 24px のまま出てしまう。 */
  const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
  if (num(cs.minHeight) < 44 && num(cs.height) < 44) node.style.minHeight = "44px";
  if (num(cs.minWidth) < 44 && num(cs.width) < 44) node.style.minWidth = "44px";
}

/* ── 純粋な計算（試験できる形で外に出す）───────────────────────── */

/**
 * 再生速度の見せ方。1 は「標準」と書かず ×1 で揃える（幅が動くと目が滑る）。
 * @param {number} r @returns {string}
 */
export function formatRate(r) {
  const v = clamp(finite(r, 1), 0.05, 16);
  const s = Math.abs(v - Math.round(v)) < 1e-6 ? String(Math.round(v)) : String(Math.round(v * 100) / 100);
  return (v < 0 ? "-" : "") + s + "×";
}

/**
 * ダウンロードの名前を作る。**ASCII に落とす**のが要点。
 * Chromium は `download` 属性が非 ASCII だとその名前を捨て、拡張子の無い
 * "download" で保存する（実測）。日本語のプロジェクト名が普通なので、
 * ここで ASCII だけを残し、何も残らなければ "VQStudio" を使う。
 * @param {string} base 元にする名前 @param {string} stamp 時刻など
 * @param {string} ext 拡張子（"png" 等・点は付けない）
 * @returns {string}
 */
export function safeFileName(base, stamp, ext) {
  const ascii = String(base == null ? "" : base)
    .replace(/[^\x20-\x7E]/g, "")            // 非 ASCII は落とす
    .replace(/[\\/:*?"<>|]+/g, "_")           // ファイル名に使えない字
    .replace(/\s+/g, "_")
    .replace(/^[._]+|[._]+$/g, "")
    .slice(0, 60);
  const st = String(stamp == null ? "" : stamp).replace(/[^0-9A-Za-z_-]+/g, "-");
  const e = String(ext || "png").replace(/[^0-9A-Za-z]+/g, "") || "png";
  return (ascii || "VQStudio") + (st ? "_" + st : "") + "." + e;
}

/**
 * タイムコードを擦った量 → 秒。1 コマ動かすのに SCRUB_PX_PER_FRAME px 要る。
 * @param {number} dx 横の移動量（px） @param {number} fps @returns {number} 秒
 */
export function scrubDelta(dx, fps) {
  const f = Math.round(finite(dx, 0) / SCRUB_PX_PER_FRAME);
  return f * frameDur(fps);
}

/* ══ 本体 ════════════════════════════════════════════════════════════ */
/**
 * @param {{store:Object, els?:Object, transport?:Object, widgets?:Object,
 *          compositor?:Object, ctx?:Object}} deps
 * @returns {{render:Function, dispose:Function}}
 */
export function createTransportBar(deps) {
  const store = deps && deps.store;
  const els = (deps && deps.els) || {};
  const engine = (deps && deps.transport) || null;
  const root = els.transport || document.getElementById("transport");
  if (!store || !root) {
    warn("transport", "store か #transport が無いので再生機を出さない");
    return { render() { }, dispose() { } };
  }
  let W = (deps && deps.widgets) || null;
  if (!W) import("./widgets.js").then((m) => { W = m; if (!dead) build(); }).catch(() => { /* 控えで進む */ });
  /**
   * 候補から選ばせる。widgets.menu がまだ無い器では **次の候補へ回す**
   * （一覧を自前で描くより、値を変えられる事の方が大事）。
   */
  function choose(anchor, items) {
    const list = (items || []).filter(Boolean);
    if (!list.length) return null;
    if (has(W, "menu")) return tryCall(W, "menu", [anchor, list]);
    let i = -1;
    for (let k = 0; k < list.length; k++) if (list[k].checked) { i = k; break; }
    const next = list[(i + 1) % list.length];
    tryCall(next, "onSelect", []);
    say(String(next.label || "") + " にしました", "info");
    return null;
  }
  const say = (msg, kind) => {
    if (has(W, "toast")) tryCall(W, "toast", [msg, { kind: kind || "info" }]);
  };

  /* ── 状態 ─────────────────────────────────────────────────────── */
  const nodes = {};
  let dead = false, compact = false;
  let editingTC = false, scrubbing = false;
  let fpsRaf = 0, fpsShown = 0, playIconOn = null;
  let lastVolume = 1;                    // ミュートを戻すときの控え
  let loop = lsGet(LOOP_KEY, "off") === "on";
  let fsPrev = null;                     // 疑似全画面から戻すための控え

  const P = () => store.project || {};
  const S = () => P().settings || {};
  const V = () => store.view || {};
  const fps = () => clamp(finite(S().fps, 30), 1, 240);
  const total = () => Math.max(0, projectDuration(P()));
  /** 今の時刻。engine が在ればそれが正（rAF で進む） */
  const now = () => {
    if (engine && typeof engine.time === "number") return Math.max(0, engine.time);
    return Math.max(0, finite(V().playhead, 0));
  };
  const playing = () => !!(engine && engine.playing);
  const rate = () => {
    const r = engine && typeof engine.rate === "number" ? engine.rate : 1;
    return r === 0 ? 1 : r;
  };
  const canPlay = () => has(engine, "play") || has(engine, "toggle");

  /* ── 時刻を動かす（engine が無くても動く）───────────────────── */
  function seek(t, scrub) {
    const v = snapFrame(clamp(finite(t, 0), 0, Math.max(0, total())), fps());
    if (has(engine, "seek")) tryCall(engine, "seek", [v, { scrub: !!scrub }]);
    else { try { store.setView({ playhead: v }); } catch (e) { warn("transport", "seek", e); } }
    renderSoon();
    return v;
  }
  function step(dir) {
    if (has(engine, "stepFrame")) { tryCall(engine, "stepFrame", [dir > 0 ? 1 : -1]); renderSoon(); return; }
    seek(now() + (dir > 0 ? 1 : -1) * frameDur(fps()));
  }
  function togglePlay() {
    if (!canPlay()) { say("再生機能をまだ読み込めていません", "warn"); return; }
    if (has(engine, "toggle")) tryCall(engine, "toggle");
    else if (playing()) tryCall(engine, "pause");
    else tryCall(engine, "play");
    renderSoon();
  }
  function toHead() { if (has(engine, "pause") && playing()) tryCall(engine, "pause"); seek(0); }
  function toTail() { if (has(engine, "pause") && playing()) tryCall(engine, "pause"); seek(total()); }

  function setLoop(v) {
    loop = !!v;
    lsSet(LOOP_KEY, loop ? "on" : "off");
    if (has(engine, "setLoop")) tryCall(engine, "setLoop", [loop]);
    else if (loop) say("繰り返しは再生機能の用意ができてから効きます", "warn");
    render();
  }
  /** 逆再生。engine が負の速度を受けないことも在るので、当てた後に確かめる */
  function playReverse() {
    if (!canPlay()) { say("再生機能をまだ読み込めていません", "warn"); return; }
    if (rate() < 0 && playing()) { tryCall(engine, "pause"); renderSoon(); return; }
    if (has(engine, "playReverse")) { tryCall(engine, "playReverse"); renderSoon(); return; }
    if (!has(engine, "setRate")) { say("逆再生に対応していません", "warn"); return; }
    tryCall(engine, "setRate", [-Math.abs(rate() || 1)]);
    if (rate() >= 0) { say("この環境では逆再生できません", "warn"); return; }
    if (!playing()) tryCall(engine, "play");
    renderSoon();
  }
  function setRate(r) {
    const v = clamp(finite(r, 1), 0.25, 4);
    const signed = rate() < 0 ? -v : v;
    if (has(engine, "setRate")) tryCall(engine, "setRate", [signed]);
    else say("速度は再生機能の用意ができてから効きます", "warn");
    render();
  }

  /* ── イン点・アウト点 ─────────────────────────────────────────── */
  function pushRange() {
    const v = V();
    if (has(engine, "setRange")) tryCall(engine, "setRange", [v.inPoint, v.outPoint]);
  }
  function setMark(which) {
    const t = snapFrame(now(), fps());
    const v = V();
    const patch = which === "in" ? { inPoint: t } : { outPoint: t };
    /* 逆さに来ても store が入れ替えてくれる（§3 applyView）。こちらは素直に当てる */
    try { store.setView(patch); } catch (e) { warn("transport", "mark", e); return; }
    pushRange();
    render();
    const other = which === "in" ? v.outPoint : v.inPoint;
    say((which === "in" ? "イン点" : "アウト点") + " " + toTC(t, fps(), { compact: true }) +
      (other == null ? "" : "（範囲 " + toTC(Math.abs((V().outPoint || 0) - (V().inPoint || 0)), fps(), { compact: true }) + "）"), "ok");
  }
  function clearMarks() {
    try { store.setView({ inPoint: null, outPoint: null }); } catch (e) { warn("transport", "clear", e); }
    pushRange();
    render();
  }

  /* ── 音量（保存される値: settings.audio.master）───────────────── */
  const masterOf = () => clamp(finite((S().audio || {}).master, 1), 0, 4);
  const pushVolume = throttle((v) => {
    try { store.dispatch("settings.update", { patch: { audio: { master: v } } }, { label: "音量", coalesce: true }); }
    catch (e) { warn("transport", "volume", e); }
  }, 80);
  function setMaster(v) {
    const val = clamp(finite(v, 1), 0, 2);
    if (val > 0) lastVolume = val;
    pushVolume(val);
    paintVolume(val);
  }
  function toggleMute() {
    const cur = masterOf();
    setMaster(cur > 0 ? 0 : (lastVolume > 0 ? lastVolume : 1));
    render();
  }

  /* ── 画質・比率 ───────────────────────────────────────────────── */
  function setQuality(q) {
    try { store.dispatch("settings.update", { patch: { previewQuality: q } }, { label: "プレビュー画質" }); }
    catch (e) { say((e && e.message) || "画質を変えられません", "error"); }
  }
  function qualityMenu(anchor) {
    const cur = String(S().previewQuality || "auto");
    return choose(anchor, QUALITIES.map((q) => ({
      label: q[2], checked: cur === q[0], onSelect: () => setQuality(q[0])
    })));
  }
  /* 比率はここでは「変えるだけ」。クリップを枠に収め直すかを尋ねるのは
     上段の #btnRatio の持ち物（toolbar.js）。同じ処理を 2 つ持つと、
     片方だけ直したときに「上段とプレビュー下で結果が違う」が起きる。 */
  function setRatio(r) {
    if (String(S().ratio || "") === r) return;
    try { store.dispatch("settings.update", { patch: { ratio: r } }, { label: "比率" }); }
    catch (e) { say((e && e.message) || "比率を変えられません", "error"); return; }
    render();
  }
  function ratioMenu(anchor) {
    const cur = String(S().ratio || "16:9");
    return choose(anchor, Object.keys(RATIOS).map((k) => ({
      label: (RATIOS[k].label || k) + (k === "custom" ? "" : "（" + RATIOS[k].w + "×" + RATIOS[k].h + "）"),
      checked: cur === k, onSelect: () => setRatio(k)
    })));
  }

  /* ── 全画面（本物 → 疑似）─────────────────────────────────────── */
  function fsTarget() {
    return document.getElementById("center") || els.previewWrap || root.parentNode || root;
  }
  const realFs = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  function isFs() { return !!realFs() || !!fsPrev; }
  function enterPseudo(node) {
    if (fsPrev) return;
    fsPrev = { node, style: node.getAttribute("style") || "" };
    node.classList.add("vqs-fs-fake");
    document.documentElement.classList.add("vqs-fs-lock");
    /* CSS 担当が居なくても成立させる最小限（抜けるときに丸ごと戻す） */
    node.style.cssText = (fsPrev.style ? fsPrev.style + ";" : "") +
      "position:fixed;left:0;right:0;top:0;bottom:0;z-index:80;background:#000;" +
      "height:100dvh;max-height:100dvh;padding-bottom:env(safe-area-inset-bottom);margin:0";
    document.addEventListener("keydown", onFsKey, true);
  }
  function leavePseudo() {
    if (!fsPrev) return;
    const { node, style } = fsPrev;
    fsPrev = null;
    node.classList.remove("vqs-fs-fake");
    document.documentElement.classList.remove("vqs-fs-lock");
    if (style) node.setAttribute("style", style); else node.removeAttribute("style");
    document.removeEventListener("keydown", onFsKey, true);
  }
  function onFsKey(e) { if (e.key === "Escape") { e.preventDefault(); toggleFs(); } }
  function toggleFs() {
    const node = fsTarget();
    if (realFs()) {
      if (has(document, "exitFullscreen")) tryCall(document, "exitFullscreen");
      else tryCall(document, "webkitExitFullscreen");
      render();
      return;
    }
    if (fsPrev) { leavePseudo(); onResize(); render(); return; }
    if (has(node, "requestFullscreen")) {
      const p = tryCall(node, "requestFullscreen", [{ navigationUI: "hide" }]);
      if (p && typeof p.catch === "function") p.catch(() => { enterPseudo(node); render(); });
      render();
      return;
    }
    if (has(node, "webkitRequestFullscreen")) { tryCall(node, "webkitRequestFullscreen"); render(); return; }
    enterPseudo(node);            // iPhone はここ（契約書 §13.4）
    onResize();
    render();
  }

  /* ── スナップショット（現在フレームを PNG）───────────────────── */
  function findCompositor() {
    if (deps && deps.compositor) return deps.compositor;
    if (deps && deps.ctx && deps.ctx.compositor) return deps.ctx.compositor;
    /* CONTRACT-NOTE: transport の引数には合成器が無い（契約書 §7 の呼び出し形）。
       WebGL は描画バッファを保たないので canvas を直に写すと黒になり得る。
       唯一の公認の窓 window.VQSTUDIO から **読むだけ**で借りる。 */
    try { return globalThis.VQSTUDIO && globalThis.VQSTUDIO.app && globalThis.VQSTUDIO.app.parts
      ? globalThis.VQSTUDIO.app.parts.compositor || null : null; } catch (_e) { return null; }
  }
  function download(blob, name) {
    try {
      const url = URL.createObjectURL(blob);
      const a = el("a", "", { href: url, download: name });
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { try { a.remove(); URL.revokeObjectURL(url); } catch (_e) { /* noop */ } }, 4000);
      return true;
    } catch (e) { warn("transport", "download", e); return false; }
  }
  async function snapshot() {
    const t = now();
    const name = safeFileName(P().name, toTC(t, fps(), { compact: true }), "png");
    const comp = findCompositor();
    let blob = null;
    try {
      if (has(comp, "grabPixels")) {
        const img = comp.grabPixels();
        const w = Math.max(1, img.width | 0), h = Math.max(1, img.height | 0);
        const cv = document.createElement("canvas");
        cv.width = w; cv.height = h;
        const cx = cv.getContext("2d");
        if (cx && typeof ImageData !== "undefined" && img instanceof ImageData) cx.putImageData(img, 0, 0);
        else if (cx && img && img.data) cx.putImageData(new ImageData(img.data, w, h), 0, 0);
        blob = await new Promise((res) => cv.toBlob(res, "image/png"));
      } else if (els.previewCanvas && has(els.previewCanvas, "toBlob")) {
        blob = await new Promise((res) => els.previewCanvas.toBlob(res, "image/png"));
      }
    } catch (e) { warn("transport", "snapshot", e); }
    if (!blob) { say("スナップショットを作れませんでした", "error"); return null; }
    if (download(blob, name)) say("PNG を保存しました（" + name + "）", "ok");
    return blob;
  }

  /* ── タイムコード（叩く / 擦る）───────────────────────────────── */
  function editTC() {
    const box = nodes.tc;
    if (!box || editingTC) return;
    editingTC = true;
    const input = el("input", "vqs-transport__tcinput", {
      type: "text", inputmode: "numeric", "aria-label": "再生位置を打ち込む",
      value: toTC(now(), fps()), "data-test": "tr-tc-input"
    });
    box.textContent = "";
    box.appendChild(input);
    try { input.focus(); input.select(); } catch (_e) { /* noop */ }
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      editingTC = false;
      const v = ok ? fromTC(input.value, fps()) : null;
      input.remove();
      if (v != null) seek(v);
      render();
    };
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();                       // Space も ← → も打ち込みのもの
      if (e.key === "Enter") { e.preventDefault(); finish(true); }
      else if (e.key === "Escape") { e.preventDefault(); finish(false); }
    });
    input.addEventListener("blur", () => finish(true));
  }
  /** 横へ擦って早送り（Premiere の手触り）。Pointer Events 1 本で書く */
  function bindScrub(node) {
    let id = -1, x0 = 0, t0 = 0, moved = 0;
    node.addEventListener("pointerdown", (e) => {
      if (editingTC || e.button > 0) return;
      id = e.pointerId; x0 = e.clientX; t0 = now(); moved = 0;
      try { node.setPointerCapture(id); } catch (_e) { /* noop */ }
    });
    node.addEventListener("pointermove", (e) => {
      if (e.pointerId !== id) return;
      const dx = e.clientX - x0;
      if (Math.abs(dx) < CLICK_SLOP && !scrubbing) return;
      if (!scrubbing) { scrubbing = true; node.classList.add("is-scrubbing"); }
      moved = Math.max(moved, Math.abs(dx));
      e.preventDefault();
      seek(t0 + scrubDelta(dx, fps()), true);
    });
    const end = (e) => {
      if (e.pointerId !== id) return;
      try { node.releasePointerCapture(id); } catch (_e) { /* noop */ }
      id = -1;
      if (scrubbing) { scrubbing = false; node.classList.remove("is-scrubbing"); seek(now(), false); }
      else if (moved < CLICK_SLOP) editTC();
    };
    node.addEventListener("pointerup", end);
    node.addEventListener("pointercancel", end);
    /* touch-action は CSS 担当の持ち物。まだ誰も決めていないときだけ、
       擦っている間にページが流れないように最低線を当てる。 */
    const cs = computed(node);
    if (!cs || cs.touchAction === "auto") node.style.touchAction = "none";
  }

  /* ── 実測 fps（再生中だけ測る）───────────────────────────────── */
  function fpsLoop() {
    let last = 0, acc = 0, n = 0;
    const tick = (ts) => {
      if (dead) return;
      if (last) { acc += ts - last; n++; }
      last = ts;
      if (n >= 20) {
        const v = Math.round(1000 / Math.max(1, acc / n));
        if (v !== fpsShown) { fpsShown = v; paintFps(); }
        acc = 0; n = 0;
      }
      fpsRaf = requestAnimationFrame(tick);
    };
    fpsRaf = requestAnimationFrame(tick);
  }
  function stopFps() { if (fpsRaf) { try { cancelAnimationFrame(fpsRaf); } catch (_e) { /* noop */ } fpsRaf = 0; } }
  /** engine が測っているならそれを使う（同じ物を 2 か所で測らない） */
  const engineMeasures = () => !!engine && typeof engine.measuredFps === "number";
  function paintFps() {
    if (!nodes.fps) return;
    const v = engineMeasures() ? Math.round(engine.measuredFps) : fpsShown;
    nodes.fps.textContent = v > 0 ? v + " fps" : "— fps";
    nodes.fps.classList.toggle("is-low", v > 0 && v < Math.min(30, fps()) - 4);
    nodes.fps.classList.toggle("is-idle", !playing());
  }
  function paintVolume(v) {
    const val = v === undefined ? masterOf() : v;
    if (nodes.vol && document.activeElement !== nodes.vol) nodes.vol.value = String(Math.round(val * 100));
    if (nodes.mute) {
      const off = val <= 0.0001;
      nodes.mute.setAttribute("aria-pressed", off ? "true" : "false");
      nodes.mute.classList.toggle("is-off", off);
      tip(W, nodes.mute, off ? "ミュート解除" : "ミュート（" + Math.round(val * 100) + "%）");
    }
  }

  /* ══ 組み立て ══════════════════════════════════════════════════ */
  function btn(cls, spec) {
    const b = el("button", cls, { type: "button", "data-test": "tr-" + spec.id, "data-act": spec.id });
    b.append(iconEl(W, spec.icon, spec.glyph));
    if (spec.text) {
      const s = el("span", "vqs-transport__btnlabel");
      s.textContent = spec.text;
      b.appendChild(s);
    }
    tip(W, b, spec.label, spec.key);
    nodes[spec.id] = b;
    return b;
  }
  function chip(id, label, key) {
    const b = el("button", "vqs-transport__chip", { type: "button", "data-test": "tr-" + id, "data-act": id });
    tip(W, b, label, key);
    nodes[id] = b;
    return b;
  }

  function build() {
    root.textContent = "";
    for (const k in nodes) delete nodes[k];
    playIconOn = null;
    compact = (globalThis.innerWidth || 1280) < MOBILE_W;
    root.setAttribute("role", "group");
    root.setAttribute("aria-label", "再生操作");
    root.setAttribute("data-compact", compact ? "1" : "0");
    /* まだ CSS が無いときだけ「横 1 列」という前提を最小限だけ補う */
    try {
      const cs = typeof getComputedStyle === "function" ? getComputedStyle(root) : null;
      if (!cs || cs.display === "block" || cs.display === "inline") {
        root.style.display = "flex";
        root.style.alignItems = "center";
        root.style.gap = "6px";
      }
    } catch (_e) { /* 読めない器では触らない */ }

    /* ① タイムコード（compact でも出す） */
    const tc = el("span", "vqs-transport__tc", { "data-test": "tr-tc", role: "button", tabindex: "0" });
    tc.style.fontVariantNumeric = "tabular-nums";       // 等幅（数字が踊らないように）
    tip(W, tc, "再生位置（叩くと打ち込める・横に擦ると送れる）");
    tc.addEventListener("keydown", (e) => {
      /* 焦点がタイムコードに在るときの Space は「打ち込み」。
         止めないと下の document の Space（再生）と二重に効く。 */
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); editTC(); }
    });
    bindScrub(tc);
    nodes.tc = tc;

    /* ② 中央の再生操作（モバイルは 3 つだけ作る。作らない物は render() も触らない） */
    const bPrev = btn("vqs-transport__btn", { id: "prev", icon: "step-back", glyph: "◀|", label: "1 コマ戻る", key: "←" });
    bPrev.addEventListener("click", () => step(-1));
    const bPlay = btn("vqs-transport__btn vqs-transport__btn--play", { id: "play", icon: "play", glyph: "▶", label: "再生", key: "Space" });
    bPlay.addEventListener("click", togglePlay);
    const bNext = btn("vqs-transport__btn", { id: "next", icon: "step-fwd", glyph: "|▶", label: "1 コマ進む", key: "→" });
    bNext.addEventListener("click", () => step(1));
    const bFs = btn("vqs-transport__btn", { id: "fullscreen", icon: "fullscreen", glyph: "⤢", label: "全画面", key: "F" });
    bFs.addEventListener("click", toggleFs);

    if (compact) {
      /* モバイル: プレビュー直下に 1 列（再生・コマ送り・タイムコード・全画面のみ） */
      root.append(bPrev, bPlay, bNext, tc, bFs);
      for (const k of ["prev", "play", "next", "fullscreen", "tc"]) {
        if (nodes[k]) ensureTouchSize(nodes[k]);
      }
    } else {
      const mid = el("div", "vqs-transport__center", { "data-test": "tr-center" });
      const bHead = btn("vqs-transport__btn", { id: "head", icon: "skip-start", glyph: "⏮", label: "先頭へ", key: "Home" });
      bHead.addEventListener("click", toHead);
      const bTail = btn("vqs-transport__btn", { id: "tail", icon: "skip-end", glyph: "⏭", label: "末尾へ", key: "End" });
      bTail.addEventListener("click", toTail);
      const bLoop = btn("vqs-transport__btn vqs-transport__btn--toggle", { id: "loop", icon: "loop", glyph: "⟳", label: "繰り返し再生" });
      bLoop.addEventListener("click", () => setLoop(!loop));
      const bRev = btn("vqs-transport__btn vqs-transport__btn--toggle", { id: "reverse", icon: "reverse", glyph: "◀◀", label: "逆再生", key: "J" });
      bRev.addEventListener("click", playReverse);
      const left = el("div", "vqs-transport__side vqs-transport__side--left");
      const right = el("div", "vqs-transport__side vqs-transport__side--right");
      left.appendChild(tc);

      /* イン点・アウト点 */
      const io = el("div", "vqs-transport__inout", { "data-test": "tr-inout" });
      const bIn = btn("vqs-transport__mark", { id: "markIn", icon: "in-point", glyph: "{", label: "イン点を設定", key: "I" });
      bIn.addEventListener("click", () => setMark("in"));
      const bOut = btn("vqs-transport__mark", { id: "markOut", icon: "out-point", glyph: "}", label: "アウト点を設定", key: "O" });
      bOut.addEventListener("click", () => setMark("out"));
      const rng = el("button", "vqs-transport__range", { type: "button", "data-test": "tr-range" });
      rng.style.fontVariantNumeric = "tabular-nums";
      tip(W, rng, "イン点へ飛ぶ（範囲の長さ）");
      rng.addEventListener("click", () => { const v = V(); if (v.inPoint != null) seek(v.inPoint); });
      const bClr = btn("vqs-transport__mark", { id: "clearMarks", icon: "close", glyph: "×", label: "イン・アウトを解除" });
      bClr.addEventListener("click", clearMarks);
      nodes.range = rng;
      io.append(bIn, rng, bOut, bClr);
      left.appendChild(io);

      mid.append(bHead, bPrev, bPlay, bNext, bTail, bLoop, bRev);

      /* 右: 速度 */
      const rateChip = chip("rate", "再生速度", "L / K");
      rateChip.addEventListener("click", () => choose(rateChip, RATES.map((r) => ({
        label: formatRate(r) + (r === 1 ? "（標準）" : ""), checked: Math.abs(Math.abs(rate()) - r) < 1e-6,
        onSelect: () => setRate(r)
      }))));
      right.appendChild(rateChip);

      /* 右: 音量（マスター） */
      const volWrap = el("div", "vqs-transport__vol", { "data-test": "tr-vol" });
      const bMute = btn("vqs-transport__btn vqs-transport__btn--toggle", { id: "mute", icon: "volume", glyph: "🔈", label: "ミュート" });
      bMute.addEventListener("click", toggleMute);
      const vol = el("input", "vqs-transport__volrange", {
        type: "range", min: "0", max: "200", step: "1", "aria-label": "マスター音量（%）", "data-test": "tr-volrange"
      });
      vol.addEventListener("input", () => setMaster(finite(parseFloat(vol.value), 100) / 100));
      vol.addEventListener("dblclick", () => { setMaster(1); render(); });
      nodes.vol = vol;
      volWrap.append(bMute, vol);
      right.appendChild(volWrap);

      /* 右: 画質・比率 */
      const q = chip("quality", "プレビュー画質");
      q.addEventListener("click", () => qualityMenu(q));
      const ra = chip("ratio", "画面の比率");
      ra.addEventListener("click", () => ratioMenu(ra));
      right.append(q, ra);

      /* 右: スナップショット・全画面・実測 fps */
      const snap = btn("vqs-transport__btn", { id: "snapshot", icon: "camera", glyph: "📷", label: "スナップショット（PNG で保存）" });
      snap.addEventListener("click", () => { snapshot(); });
      const fpsEl = el("span", "vqs-transport__fps", { "data-test": "tr-fps", title: "実測の描画速度" });
      nodes.fps = fpsEl;
      right.append(snap, bFs, fpsEl);

      root.append(left, mid, right);
    }

    paintFps();
    paintVolume();
    render();
  }

  /* ══ 描く（状態だけ）═════════════════════════════════════════ */
  function render() {
    if (dead || !nodes.tc) return;
    const f = fps();
    const v = V();
    const t = now();
    if (!editingTC) {
      nodes.tc.textContent = toTC(t, f) + " / " + toTC(total(), f);
      nodes.tc.setAttribute("data-time", String(Math.round(t * 1000) / 1000));
    }
    /* 再生ボタン: 見た目・読み上げ・aria-pressed */
    const play = nodes.play;
    if (play) {
      const on = playing();
      play.classList.toggle("is-playing", on);
      play.setAttribute("aria-pressed", on ? "true" : "false");
      play.disabled = !canPlay();
      /* 絵の差し替えは **変わった時だけ**（毎フレーム作り直すと iPhone で重い） */
      if (playIconOn !== on) {
        playIconOn = on;
        const ic = iconEl(W, on ? "pause" : "play", on ? "⏸" : "▶");
        const old = play.firstChild;
        if (old) play.replaceChild(ic, old); else play.appendChild(ic);
        tip(W, play, on ? "一時停止" : "再生", "Space");
      }
    }
    for (const k of ["head", "prev", "next", "tail"]) {
      const b = nodes[k];
      if (!b) continue;
      const at0 = t <= 1e-6, atEnd = t >= total() - 1e-6;
      b.disabled = (k === "head" || k === "prev") ? at0 : atEnd;
    }
    if (nodes.loop) {
      /* engine が覗き窓（transport.loop）を持っていればそちらが正 */
      const on = engine && typeof engine.loop === "boolean" ? engine.loop : loop;
      loop = on;
      nodes.loop.setAttribute("aria-pressed", on ? "true" : "false");
      nodes.loop.classList.toggle("is-on", on);
    }
    if (nodes.reverse) {
      const on = playing() && rate() < 0;
      nodes.reverse.setAttribute("aria-pressed", on ? "true" : "false");
      nodes.reverse.classList.toggle("is-on", on);
      nodes.reverse.disabled = !canPlay();
    }
    if (nodes.rate) {
      nodes.rate.textContent = formatRate(Math.abs(rate()));
      nodes.rate.setAttribute("data-value", String(rate()));
    }
    if (nodes.quality) {
      const cur = String(S().previewQuality || "auto");
      const item = QUALITIES.find((x) => x[0] === cur) || QUALITIES[0];
      nodes.quality.textContent = "画質 " + item[1];
      nodes.quality.setAttribute("data-value", cur);
    }
    if (nodes.ratio) {
      const r = String(S().ratio || "16:9");
      nodes.ratio.textContent = r === "custom" ? S().width + "×" + S().height : r;
      nodes.ratio.setAttribute("data-value", r);
    }
    if (nodes.range) {
      const hasIn = v.inPoint != null, hasOut = v.outPoint != null;
      if (!hasIn && !hasOut) nodes.range.textContent = "範囲なし";
      else if (hasIn && hasOut) nodes.range.textContent = toTC(v.inPoint, f, { compact: true }) + "〜" + toTC(v.outPoint, f, { compact: true }) +
        "（" + toTC(Math.max(0, v.outPoint - v.inPoint), f, { compact: true }) + "）";
      else nodes.range.textContent = hasIn ? "イン " + toTC(v.inPoint, f, { compact: true }) : "アウト " + toTC(v.outPoint, f, { compact: true });
      nodes.range.classList.toggle("is-set", hasIn || hasOut);
      if (nodes.clearMarks) nodes.clearMarks.disabled = !hasIn && !hasOut;
      if (nodes.markIn) nodes.markIn.classList.toggle("is-on", hasIn);
      if (nodes.markOut) nodes.markOut.classList.toggle("is-on", hasOut);
    }
    if (nodes.fullscreen) {
      const on = isFs();
      nodes.fullscreen.setAttribute("aria-pressed", on ? "true" : "false");
      nodes.fullscreen.classList.toggle("is-on", on);
      tip(W, nodes.fullscreen, on ? "全画面をやめる" : "全画面", "F");
    }
    paintVolume();
    paintFps();
  }
  const renderSoon = rafThrottle(render);

  /* ══ 外からの変化 ══════════════════════════════════════════════ */
  const unsubscribe = store.subscribe ? store.subscribe(() => { if (!dead) renderSoon(); }) : null;
  const offTime = has(engine, "on") ? tryCall(engine, "on", ["time", () => renderSoon()]) : null;
  const offState = has(engine, "on") ? tryCall(engine, "on", ["state", () => {
    if (playing() && !fpsRaf && !engineMeasures()) fpsLoop();
    else if (!playing() && fpsRaf) { stopFps(); paintFps(); }
    renderSoon();
  }]) : null;
  const offEnd = has(engine, "on") ? tryCall(engine, "on", ["end", () => renderSoon()]) : null;

  /* Space だけは自分でも受ける（プレビューの真下に在る物なので、
     ui/shortcuts.js がまだ無くても再生できてほしい）。ただし
       ・焦点が入力欄に在るときは奪わない（打ち込みの Space が消える）
       ・焦点がボタン・リンクに在るときも触らない（Space でその物が押される）
       ・誰かが先に preventDefault していたら譲る（2 回切り替わると何も起きない）
     F などの他の鍵は ui/shortcuts.js の持ち物なので、ここでは受けない。 */
  function typingIn(node) {
    if (!node || node === document.body) return false;
    const tag = String(node.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select" || tag === "button" || tag === "a") return true;
    if (node.isContentEditable) return true;
    /* role="button" の物（タイムコード等）も「その物が Space を使う」側 */
    if (has(node, "getAttribute") && node.getAttribute("role") === "button") return true;
    return false;
  }
  function onKey(e) {
    if (dead || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code !== "Space" && e.key !== " ") return;
    if (typingIn(e.target) || typingIn(document.activeElement)) return;
    e.preventDefault();
    togglePlay();
  }
  document.addEventListener("keydown", onKey);

  const onFsChange = () => { if (realFs()) leavePseudo(); render(); };
  document.addEventListener("fullscreenchange", onFsChange);
  document.addEventListener("webkitfullscreenchange", onFsChange);

  const onResize = rafThrottle(() => {
    if (dead) return;
    const want = (globalThis.innerWidth || 1280) < MOBILE_W;
    if (want !== compact) build(); else render();
  });
  if (typeof globalThis.addEventListener === "function") globalThis.addEventListener("resize", onResize, { passive: true });

  build();
  if (loop && has(engine, "setLoop")) tryCall(engine, "setLoop", [true]);
  pushRange();
  if (playing() && !engineMeasures()) fpsLoop();

  function dispose() {
    dead = true;
    stopFps();
    leavePseudo();
    if (renderSoon.cancel) renderSoon.cancel();
    if (onResize.cancel) onResize.cancel();
    if (pushVolume.cancel) pushVolume.cancel();
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("fullscreenchange", onFsChange);
    document.removeEventListener("webkitfullscreenchange", onFsChange);
    if (typeof globalThis.removeEventListener === "function") globalThis.removeEventListener("resize", onResize);
    if (unsubscribe) { try { unsubscribe(); } catch (_e) { /* noop */ } }
    for (const off of [offTime, offState, offEnd]) {
      if (typeof off === "function") { try { off(); } catch (_e) { /* noop */ } }
    }
    root.textContent = "";
  }

  return { render, dispose };
}
