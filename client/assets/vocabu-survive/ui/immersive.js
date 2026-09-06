/* ══════════════════════════════════════════════════════════════════════════
   没入（全画面）。

   訴え（2026-08-31・Rinty さん）
     「まず 大事だと 思うのが、モバイルの 最適化、全画面、重くならない、
       グラフィック、マップの クオリティ。ここが 何も なってないと 詰まる。」

   ★ 直す前の 実測（写真つきで 確認）:
       PC 1440 幅  → 板は 1092×878（横 350px を サイドバーと 余白へ）
       スマホ 390 幅 → 板は 366×786（上に ハンバーガー・下に アプリの 帯）
     `requestFullscreen` は **一箇所も 呼んでいなかった**。

   ★ 2 段構え。どちらで 出しているかを 必ず 持つ。**できるふりを しない。**
       real … Fullscreen API。器が 画面そのものに なる。
       fake … 疑似。器を position:fixed で 画面いっぱいへ 出し、
              本体の サイドバー・帯・お知らせを 伏せる（index.html の CSS）。
     iPhone の Safari は 要素の 全画面を 持たない（video だけ）。
     だから fake は **飾りでは なく 本命の 道**。

   ★ 入るのは **人が 押した その場**でだけ。
     Fullscreen API は 「利用者の 操作の 中」でしか 通らない。
     await を 挟むと 権限が 切れる（実測で 落ちた）ので、
     入る 処理の 中で 先に requestFullscreen を 呼び、
     その あとで 見た目を 整える。

   ★ 出るときは 必ず 元へ 戻す。Esc・戻る・端末の 操作でも 出られるので、
     fullscreenchange を 見張って **こちらの 見た目も** 合わせる。
   ══════════════════════════════════════════════════════════════════════════ */

const B = "vq-survive-immersive";   /* 疑似 全画面の 印（index.html の CSS） */
/* ★ 走行中の 印（vq-survive-play）は **ここでは 触らない**。
   あれは 試合の 間だけ 下の 帯を しまう もので、持ち主は match.js。
   ここで 一緒に 外すと、走っている 最中に Esc を 押した だけで
   下の 帯が 戻り、跳ぶ ボタンが 隠れる。 */

let 状態 = { on: false, real: false, どこ: null };
const 聞き手 = new Set();
let 見張り済み = false;

function doc() { return typeof document !== "undefined" ? document : null; }

/** 本当の 全画面が 使えるか。 */
export function realOK(el) {
  const d = doc(); if (!d) return false;
  const 器 = el || d.documentElement;
  if (!器) return false;
  const f = 器.requestFullscreen || 器.webkitRequestFullscreen || 器.webkitRequestFullScreen
         || 器.mozRequestFullScreen || 器.msRequestFullscreen;
  if (!f) return false;
  /* 端末が 断る ことも ある（iframe の 許可・iPhone）。分かる 範囲で 見る。 */
  if (d.fullscreenEnabled === false && d.webkitFullscreenEnabled === false) return false;
  return true;
}

function いま全画面() {
  const d = doc(); if (!d) return null;
  return d.fullscreenElement || d.webkitFullscreenElement || d.mozFullScreenElement || d.msFullscreenElement || null;
}

function 見張る() {
  if (見張り済み) return;
  const d = doc(); if (!d) return;
  見張り済み = true;
  const 変わった = () => {
    const 本物 = !!いま全画面();
    if (状態.on && 状態.real && !本物) {
      /* Esc や 端末の 操作で 抜けた。こちらの 見た目も 戻す。 */
      out(true);
    } else if (状態.on) {
      状態.real = 本物;
      伝える();
    }
  };
  for (const n of ["fullscreenchange", "webkitfullscreenchange", "mozfullscreenchange", "MSFullscreenChange"]) {
    try { d.addEventListener(n, 変わった); } catch (e) {}
  }
}

function 伝える() {
  for (const f of 聞き手) { try { f(Object.assign({}, 状態)); } catch (e) {} }
}

/** 見た目だけ 疑似 全画面へ（本当の 全画面が 通っても 併用して 良い）。 */
function 印をつける(on) {
  const d = doc(); if (!d || !d.body) return;
  try {
    d.body.classList.toggle(B, !!on);
    d.documentElement.classList.toggle(B, !!on);
  } catch (e) {}
}

/** 横向きに したい（できる 端末だけ。断られても 何も 言わない）。 */
async function 横へ() {
  try {
    const s = screen && screen.orientation;
    if (s && typeof s.lock === "function") { await s.lock("landscape"); return true; }
  } catch (e) {}
  return false;
}
async function 向きを放す() {
  try { const s = screen && screen.orientation; if (s && typeof s.unlock === "function") s.unlock(); } catch (e) {}
}

/**
 * 没入へ 入る。**人が 押した その場**で 呼ぶこと。
 * @param {HTMLElement} el 全画面に したい 器（ふつうは #appSurvivePage）
 * @param {{landscape?:boolean}} [opts]
 * @returns {Promise<{on:boolean, real:boolean}>}
 */
export async function into(el, opts) {
  const d = doc(); if (!d) return { on: false, real: false };
  見張る();
  const o = opts || {};
  /* ★ 先に 頼む。await を 挟むと 「人が 押した」扱いが 切れる。 */
  let 頼み = null;
  const 器 = el || (d.getElementById && d.getElementById("appSurvivePage")) || d.documentElement;
  if (realOK(器)) {
    const f = 器.requestFullscreen || 器.webkitRequestFullscreen || 器.webkitRequestFullScreen
           || 器.mozRequestFullScreen || 器.msRequestFullscreen;
    try { 頼み = f.call(器, { navigationUI: "hide" }); } catch (e) {
      try { 頼み = f.call(器); } catch (e2) { 頼み = null; }
    }
  }
  /* 見た目は 先に 変える。断られても 疑似で 画面いっぱいに なる。 */
  印をつける(true);

  let 本物 = false;
  if (頼み && typeof 頼み.then === "function") {
    try { await 頼み; 本物 = !!いま全画面(); } catch (e) { 本物 = false; }
  }
  状態 = { on: true, real: 本物, どこ: 器 };
  if (o.landscape) 横へ();
  伝える();
  return { on: true, real: 本物 };
}

/** 没入から 出る。 */
export async function out(見た目だけ) {
  const d = doc(); if (!d) return;
  印をつける(false);
  if (!見た目だけ && いま全画面()) {
    const x = d.exitFullscreen || d.webkitExitFullscreen || d.webkitCancelFullScreen
           || d.mozCancelFullScreen || d.msExitFullscreen;
    if (x) { try { await x.call(d); } catch (e) {} }
  }
  向きを放す();
  状態 = { on: false, real: false, どこ: null };
  伝える();
}

/** いまの ようす。 */
export function state() { return Object.assign({}, 状態, { realOK: realOK() }); }

/** 変わったら 呼ばれる。外す 関数を 返す。 */
export function watch(fn) { 聞き手.add(fn); return () => 聞き手.delete(fn); }

/** 入っているか。 */
export function isOn() { return !!状態.on; }

/** 押すたび 入る/出る。 */
export async function toggle(el, opts) {
  if (状態.on) { await out(); return state(); }
  await into(el, opts);
  return state();
}
