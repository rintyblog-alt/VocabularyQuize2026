/* ══════════════════════════════════════════════════════════════════════════
   studio/src/ui/inspector/index.js — 右側の詳細設定（インスペクタ）の骨組み

   ★ 何をする所か
     Premiere の「エフェクトコントロール」・CapCut の右パネルに当たる所。
     #inspectorTabs にタブ（変形 / カラー / オーディオ / 文字 / 効果 / 速度 /
     AI / プロジェクト）を並べ、#inspector に **その時の選択に見合うタブだけ**の
     中身を出す。中身そのものは各 panel ファイルが持ち、ここは
       createXxxPanel({ store, widgets, clipIds }) -> { el, update(), dispose() }
     という **担当間の契約**の形だけを知っている（契約書 §7 / 依頼書）。

   ★ なぜこの形か
     ・**panel は動的 import で読む**。color.js / audio.js / text.js / fx.js /
       ai.js は別担当のファイルで、まだ無いことがある。静的 import だと 1 つ
       欠けただけでインスペクタごと落ちて右側が真っ白になるので、
       `import()` を都度試し、失敗したらその場に穏やかな断り書きを出す。
     ・**選択が変わらない限り DOM を作り直さない**。app.js は store の変更
       ごとに inspector.render() を呼ぶので（ui/app.js の subscribe）、毎回
       組み直すとスライダーを掴んでいる指の下から要素が消える。
       選択の指紋（clipIds + kind）が同じなら panel.update() だけを呼ぶ。
     ・**触っている間は render を止める**（isInteracting）。値の間引き dispatch
       は自分で store を変えるので、その通知で自分を作り直してしまう。
       触り終わったら 1 回だけ作り直す。
     ・**1 操作 1 undo**: driver() が「触っている間は rAF で間引いて
       `{coalesce:true}` で dispatch → 離したら最後の値を 1 回」を持つ。
       store 側の合体（120ms・同 type・同じ相手）に乗るので、ドラッグ 1 回が
       取消 1 回になる。
     ・部品（widgets）は **在れば必ず使う**。無い関数だけ自前で代替する
       （widgets.js は別担当・まだ無いことがある）。代替品には `el.vqsSet`
       を付けてあるので、widgets 側が同じ名前で setter を生やせば
       update() がそのまま効く（申し送り事項）。

   ★ 触るときの注意
     ・ここは store を読むだけ。編集は必ず ops（store.dispatch）経由。
     ・panel の契約（{el, update, dispose}）を崩さない。reset() は任意。
     ・下の「部品の詰め合わせ（kit）」は transform.js / speed.js /
       project.js が import している。形を変えるときは 3 つとも直す。

   CONTRACT-NOTE: 部品の詰め合わせ（createFieldKit）を index.js に置いた。
     担当ファイルが index / transform / speed / project の 4 つだけで、
     共通部品用のファイル（inspector/fields.js）を作ると「担当外の
     ファイルを作らない」という上位の約束を破るため。panel 側は
     `import { createFieldKit } from "./index.js"` で受ける。index.js が
     panel を読むのは **動的 import** なので循環参照にはならない。
     同じ理由でこのファイルは 700 行を超えている（作法は「超えたら分割」）。
     分ける切れ目は ①部品の詰め合わせ（createFieldKit）②インスペクタ本体
     （createInspector）の 2 つで、依存は本体 → 詰め合わせの一方向。
     inspector/fields.js を作って良い事になったら、上の §3 をそこへ移すだけで
     済むように、§3 は store と widgets 以外に何も知らない形にしてある。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

import { clamp, finite, isTouch } from "../../core/util.js";
import { toTC, humanDuration, frameDur } from "../../core/time.js";
import { findClip, assetById } from "../../core/schema.js";
import { warn } from "../../core/log.js";

/* ── 0. タブの定義 ─────────────────────────────────────────────────
   when(kinds) が false のタブは **出さない**（音クリップに変形タブを
   見せない、等）。kinds は選択中クリップの kind の集合。 */

/** in/out（= 速度）が意味を持つ kind（core/ops.js の HAS_SRC と同じ） */
const HAS_SRC = new Set(["video", "audio", "compound"]);
/** 変形が意味を持つ kind（adjust は下の合成結果に効くので変形しない） */
const HAS_TRANSFORM = new Set(["video", "image", "text", "shape", "compound"]);

const some = (kinds, set) => kinds.some((k) => set.has(k));

/** @type {{id:string,label:string,mod:string,fn:string,when:(k:string[])=>boolean}[]} */
export const TABS = [
  { id: "transform", label: "変形", mod: "./transform.js", fn: "createTransformPanel", when: (k) => some(k, HAS_TRANSFORM) },
  { id: "color", label: "カラー", mod: "./color.js", fn: "createColorPanel", when: (k) => k.some((x) => x !== "audio") },
  { id: "audio", label: "オーディオ", mod: "./audio.js", fn: "createAudioPanel", when: (k) => some(k, new Set(["audio", "video", "compound"])) },
  { id: "text", label: "文字", mod: "./text.js", fn: "createTextPanel", when: (k) => k.indexOf("text") >= 0 },
  { id: "fx", label: "効果", mod: "./fx.js", fn: "createFxPanel", when: (k) => k.length > 0 },
  { id: "speed", label: "速度", mod: "./speed.js", fn: "createSpeedPanel", when: (k) => some(k, HAS_SRC) },
  { id: "ai", label: "AI", mod: "./ai.js", fn: "createAiInspectorPanel", when: () => true },
  { id: "project", label: "プロジェクト", mod: "./project.js", fn: "createProjectPanel", when: () => true }
];

const LAST_TAB_KEY = "vqstudio.inspector.tab";

/* ── 1. 「触っている間」の旗（panel からも見える）────────────────── */

let interacting = 0;
const idleWaiters = new Set();

/** 値を触り始めた（render を止める） */
export function beginInteract() { interacting++; }
/** 値を触り終えた（溜めていた render を流す） */
export function endInteract() {
  interacting = Math.max(0, interacting - 1);
  if (interacting === 0) {
    const fns = Array.from(idleWaiters);
    idleWaiters.clear();
    for (const f of fns) { try { f(); } catch (e) { warn("inspector", "待たせていた描画で失敗", e); } }
  }
}
/** 誰かがスライダーを掴んでいるか */
export function isInteracting() { return interacting > 0; }
/** 触り終わったら 1 回だけ呼ばれる（触っていなければ即座に呼ぶ） */
export function whenIdle(fn) {
  if (typeof fn !== "function") return;
  if (interacting === 0) { fn(); return; }
  idleWaiters.add(fn);
}

/* ── 2. 小さな道具 ──────────────────────────────────────────────── */

/** @returns {HTMLElement} */
export function el(tag, cls, text) {
  const n = document.createElement(tag || "div");
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = String(text);
  return n;
}

/** widgets.icon が在れば線画、無ければ文字で代替（画面が空にならないこと） */
export function iconOf(widgets, name, fallbackText) {
  if (widgets && typeof widgets.icon === "function") {
    try {
      const g = widgets.icon(name);
      if (g && g.nodeType === 1) return g;
    } catch (e) { /* 代替へ落ちる */ }
  }
  return el("span", "vqs-ico vqs-ico--text", fallbackText || "");
}

/** widgets.toast が在れば toast、無ければ黙る（console は使わない約束） */
export function toastOf(widgets, msg, opts) {
  if (widgets && typeof widgets.toast === "function") {
    try { return widgets.toast(msg, opts); } catch (e) { /* noop */ }
  }
  warn("inspector", "toast:", msg);
  return null;
}

/** 「共通でない値（—）」を表す <option> の value。素材 id と衝突しない文字列 */
const MIXED_SENTINEL = "vqs:mixed";

/** 値が Node か（widgets の返り値を信用しすぎない） */
const isNode = (v) => !!v && typeof v === "object" && v.nodeType === 1;

/** 数を「見せる文字」にする（小数の尻尾を切る） */
export function fmtNum(v, digits) {
  const n = finite(v, 0);
  const d = digits === undefined ? 1 : digits;
  const s = n.toFixed(d);
  return s.replace(/\.?0+$/, "") || "0";
}

/* ── 3. 部品の詰め合わせ（kit）──────────────────────────────────── */

/**
 * panel が使う「行」と「入力」を作る詰め合わせ。
 * widgets に在る物は必ずそれを使い、無い物だけ自前で代替する。
 *
 * @param {{store:Object, widgets:Object, clipIds:string[], transport?:Object}} o
 * @returns {Object} kit
 */
export function createFieldKit(o) {
  const store = o.store;
  const widgets = o.widgets || null;
  const transport = o.transport || null;
  let ids = Array.isArray(o.clipIds) ? o.clipIds.slice() : [];
  /** update() で値を書き戻す口の一覧 */
  const fields = [];
  /** dispose で外す後始末 */
  const cleanups = [];

  const fps = () => {
    const s = store && store.project && store.project.settings;
    return clamp(finite(s && s.fps, 30), 1, 240);
  };
  const now = () => {
    if (transport && typeof transport.time === "number" && Number.isFinite(transport.time)) return transport.time;
    return finite(store && store.view ? store.view.playhead : 0, 0);
  };

  /** 今の選択クリップ（store から引き直す。消えた物は落ちる） */
  function clips() {
    const out = [];
    for (const id of ids) {
      const f = findClip(store.project, id);
      if (f) out.push(f.clip);
    }
    return out;
  }
  /** クリップ 1 個の中の現在時刻（clip ローカル秒・尺の中へ丸める） */
  function localTime(clip) {
    return clamp(now() - finite(clip.start, 0), 0, Math.max(0, finite(clip.duration, 0)));
  }

  /**
   * 選択の共通値を読む。違う値が混ざっていたら mixed:true（プロ機の「—」）。
   * @param {(clip:Object)=>any} get
   * @returns {{value:any, mixed:boolean, count:number}}
   */
  function read(get) {
    const list = clips();
    if (!list.length) return { value: undefined, mixed: false, count: 0 };
    let v;
    let mixed = false;
    for (let i = 0; i < list.length; i++) {
      let cur;
      try { cur = get(list[i]); } catch (e) { cur = undefined; }
      if (i === 0) v = cur;
      else if (!sameValue(v, cur)) { mixed = true; break; }
    }
    return { value: v, mixed, count: list.length };
  }

  /** op を 1 回投げる（失敗は toast にして飲み込まない＝画面には出す） */
  function patch(type, payload, opts) {
    try { return store.dispatch(type, payload, opts); }
    catch (e) {
      toastOf(widgets, (e && e.message) || "操作できませんでした", { kind: "error" });
      return null;
    }
  }
  /** 選択の全クリップに 1 個ずつ当てる op（clipId しか取らない op 用）を 1 undo で */
  function eachClip(label, make) {
    const list = clips();
    if (!list.length) return null;
    if (list.length === 1) {
      const m = make(list[0]);
      return m ? patch(m.type, m.payload, { label }) : null;
    }
    try {
      return store.batch(label, (d) => {
        for (const c of list) {
          const m = make(c);
          if (m) d(m.type, m.payload);
        }
      });
    } catch (e) {
      toastOf(widgets, (e && e.message) || "操作できませんでした", { kind: "error" });
      return null;
    }
  }
  /** clip.update / clip.setTransform のような「まとめて当てられる」op */
  function patchAll(type, payload, opts) {
    if (!ids.length) return null;
    return patch(type, Object.assign({ clipIds: clips().map((c) => c.id) }, payload), opts);
  }

  /**
   * 「触っている間は間引き・離したら 1 回」の運転手（**1 操作 1 undo**）。
   * @param {{label:string, apply:(v:any, phase:"live"|"commit")=>void}} cfg
   */
  function driver(cfg) {
    const label = (cfg && cfg.label) || "変更";
    const apply = cfg && cfg.apply;
    let raf = 0;
    let pending;
    let sent;
    let has = false;
    let live = false;
    let idleTimer = 0;
    let beat = 0;

    function flush() {
      raf = 0;
      if (!has) return;
      sent = pending;
      try { apply(pending, "live"); } catch (e) { toastOf(widgets, (e && e.message) || "変更できませんでした", { kind: "error" }); }
    }
    /**
     * 値が動いていない間も 100ms ごとに同じ値を当て直す（**心拍**）。
     * store の履歴の合体は「同 type・同じ相手・120ms 以内」なので、
     * 指が止まっている間に 120ms を超えると鎖が切れて undo が 2 回に割れる。
     * 同じ値を当て直しても pushHistory は直前の 1 件に吸収するだけなので、
     * 履歴は増えない（増やさずに鎖を繋ぐのがここの目的）。
     */
    function heartbeat() {
      if (!has) return;
      try { apply(pending, "live"); } catch (e) { /* 失敗は flush 側で既に出している */ }
    }
    function armGlobal() {
      if (live) return;
      live = true;
      beginInteract();
      window.addEventListener("pointerup", end, true);
      window.addEventListener("pointercancel", end, true);
      window.addEventListener("touchend", end, true);
      window.addEventListener("keyup", onKeyUp, true);
      beat = setInterval(heartbeat, 100);
    }
    function onKeyUp(ev) {
      /* 矢印キーや Tab で値を動かしたときも「離した」と見なす */
      if (ev && (ev.key === "Tab" || ev.key === "Enter" || String(ev.key).indexOf("Arrow") === 0)) end();
    }
    function disarm() {
      if (!live) return;
      live = false;
      if (beat) { clearInterval(beat); beat = 0; }
      window.removeEventListener("pointerup", end, true);
      window.removeEventListener("pointercancel", end, true);
      window.removeEventListener("touchend", end, true);
      window.removeEventListener("keyup", onKeyUp, true);
      endInteract();
    }
    function input(v) {
      pending = v;
      has = true;
      armGlobal();
      if (idleTimer) clearTimeout(idleTimer);
      /* 部品の pointerup を拾えなかった時の保険。心拍が鎖を繋いでいるので
         長めに取れる（短いと、ドラッグ中の長い手止まりで undo が割れる） */
      idleTimer = setTimeout(end, 1500);
      if (!raf) raf = requestAnimationFrame(flush);
    }
    function end() {
      if (idleTimer) { clearTimeout(idleTimer); idleTimer = 0; }
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (has && !sameValue(sent, pending)) {
        sent = pending;
        try { apply(pending, "commit"); } catch (e) { toastOf(widgets, (e && e.message) || "変更できませんでした", { kind: "error" }); }
      }
      has = false;
      disarm();
    }
    cleanups.push(() => {
      if (idleTimer) { clearTimeout(idleTimer); idleTimer = 0; }
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      has = false;
      disarm();
    });
    return { input, end, get label() { return label; } };
  }

  /* ── 入力の部品（widgets 優先・無ければ自前）───────────────────── */

  /** widgets の関数が在るか */
  const hasW = (name) => !!(widgets && typeof widgets[name] === "function");
  /** widgets を試して Node が返ればそれを使う */
  function tryW(name, arg) {
    if (!hasW(name)) return null;
    try {
      const n = widgets[name](arg);
      if (isNode(n)) return n;
      if (n && isNode(n.el)) return n.el;
    } catch (e) { warn("inspector", `widgets.${name} が使えなかったので自前で代替する`, e); }
    return null;
  }

  /** 部品の中の入力へ値を書き戻す（widgets の中身を知らなくても効くように） */
  function writeInto(host, v, mixed, text) {
    if (!host) return;
    /* 「—」の見た目は部品の中身に関わらず付ける（vqsSet へ渡す前に付けること。
       ここを後回しにすると、自前の部品では mixed の印が一度も付かない） */
    host.classList.toggle("vqs-field--mixed", !!mixed);
    if (typeof host.vqsSet === "function") { try { host.vqsSet(v, mixed); return; } catch (e) { /* 下へ */ } }
    const inp = host.querySelector ? host.querySelector("input, select, textarea") : null;
    if (inp) {
      if (inp.type === "checkbox") inp.checked = !!v;
      else if (!mixed) inp.value = String(v);
      if (mixed) { inp.value = ""; inp.placeholder = "—"; }
      else if (inp.placeholder === "—") inp.placeholder = "";
    }
    const out = host.querySelector ? host.querySelector("[data-value]") : null;
    if (out) out.textContent = mixed ? "—" : (text !== undefined ? text : String(v));
  }

  /** 触り所を 44px 以上にする（CSS がまだ無くても指で押せるように） */
  function touchable(node) {
    if (!node || !node.style) return node;
    if (isTouch()) { node.style.minHeight = "44px"; node.style.minWidth = "44px"; }
    return node;
  }

  /**
   * 数値（ドラッグで増減 + 直接入力）。widgets.numberDrag があればそれ。
   * @param {{label?:string,min?:number,max?:number,step?:number,unit?:string,
   *          digits?:number,scale?:number,get:()=>{value:any,mixed:boolean},
   *          onInput:(v:number,phase:string)=>void,label2?:string}} c
   */
  function num(c) {
    const scale = finite(c.scale, 1) || 1;
    const drv = driver({ label: c.label || "数値", apply: (v, ph) => c.onInput(v, ph) });
    const send = (raw) => {
      const v = clamp(finite(raw, 0), finite(c.min, -1e9), finite(c.max, 1e9));
      drv.input(v / scale);
    };
    const host = tryW("numberDrag", {
      label: c.label, unit: c.unit,
      value: 0, min: finite(c.min, -1e9), max: finite(c.max, 1e9), step: finite(c.step, 1),
      onInput: send, onChange: () => drv.end()
    }) || fbNumberDrag(c, send, () => drv.end());
    const f = {
      el: touchable(host),
      set(v, mixed) { writeInto(host, mixed ? "" : fmtNum(finite(v, 0) * scale, c.digits), mixed); },
      refresh() { const r = c.get ? c.get() : { value: 0, mixed: false }; f.set(r.value, r.mixed); }
    };
    return addField(f);
  }

  /** 自前の numberDrag（ラベルを横に掴んで振ると増減する・入力もできる） */
  function fbNumberDrag(c, send, end) {
    const host = el("div", "vqs-numdrag");
    const lab = el("span", "vqs-numdrag__label", c.label || "");
    const inp = el("input", "vqs-numdrag__input");
    inp.type = "text";
    inp.inputMode = "decimal";
    inp.autocomplete = "off";
    inp.spellcheck = false;
    inp.setAttribute("aria-label", c.label || "数値");
    const unit = c.unit ? el("span", "vqs-numdrag__unit", c.unit) : null;
    host.append(lab, inp);
    if (unit) host.append(unit);
    if (c.label) { lab.title = "左右に振ると増減・ダブルクリックで既定へ"; lab.style.cursor = "ew-resize"; lab.style.touchAction = "none"; }

    const step = finite(c.step, 1);
    const cur = () => finite(parseFloat(inp.value), 0);
    let dragging = false;
    let base = 0;
    let x0 = 0;
    const onDown = (ev) => {
      dragging = true;
      base = cur();
      x0 = ev.clientX;
      try { lab.setPointerCapture(ev.pointerId); } catch (e) { /* 対応していない環境は無視 */ }
      ev.preventDefault();
    };
    const onMove = (ev) => {
      if (!dragging) return;
      const fine = ev.shiftKey ? 0.2 : 1;
      const v = base + (ev.clientX - x0) * step * fine;
      inp.value = fmtNum(v, c.digits);
      send(v);
    };
    const onUp = () => { if (!dragging) return; dragging = false; end(); };
    lab.addEventListener("pointerdown", onDown);
    lab.addEventListener("pointermove", onMove);
    lab.addEventListener("pointerup", onUp);
    lab.addEventListener("pointercancel", onUp);
    inp.addEventListener("input", () => send(cur()));
    inp.addEventListener("change", () => { send(cur()); end(); });
    inp.addEventListener("blur", end);
    inp.addEventListener("keydown", (ev) => {
      const d = ev.key === "ArrowUp" ? 1 : ev.key === "ArrowDown" ? -1 : 0;
      if (!d) { if (ev.key === "Enter") { send(cur()); end(); } return; }
      ev.preventDefault();
      const v = cur() + d * step * (ev.shiftKey ? 10 : 1);
      inp.value = fmtNum(v, c.digits);
      send(v);
    });
    host.vqsSet = (v, mixed) => { inp.value = mixed ? "" : String(v); inp.placeholder = mixed ? "—" : ""; };
    return host;
  }

  /**
   * スライダー。widgets.slider があればそれ（中央スナップ付き）。
   * @param {{label?:string,min:number,max:number,step?:number,center?:number,unit?:string,
   *          digits?:number,scale?:number,get:()=>Object,onInput:Function}} c
   */
  function sld(c) {
    const scale = finite(c.scale, 1) || 1;
    const drv = driver({ label: c.label || "値", apply: (v, ph) => c.onInput(v, ph) });
    const send = (raw) => drv.input(clamp(finite(raw, 0), c.min, c.max) / scale);
    const host = tryW("slider", {
      label: c.label, min: c.min, max: c.max, step: finite(c.step, 1),
      value: finite(c.center, c.min), center: c.center, unit: c.unit,
      onInput: send, onChange: () => drv.end()
    }) || fbSlider(c, send, () => drv.end());
    const f = {
      el: touchable(host),
      set(v, mixed) {
        const shown = finite(v, 0) * scale;
        writeInto(host, mixed ? "" : shown, mixed, fmtNum(shown, c.digits) + (c.unit || ""));
      },
      refresh() { const r = c.get ? c.get() : { value: 0, mixed: false }; f.set(r.value, r.mixed); }
    };
    return addField(f);
  }

  /** 自前のスライダー（range + 数の読み。ダブルクリックで中央へ戻る） */
  function fbSlider(c, send, end) {
    const host = el("div", "vqs-slider");
    if (c.label) host.append(el("span", "vqs-slider__label", c.label));
    const r = el("input", "vqs-slider__range");
    r.type = "range";
    r.min = String(c.min);
    r.max = String(c.max);
    r.step = String(finite(c.step, (c.max - c.min) / 100));
    r.setAttribute("aria-label", c.label || "値");
    if (isTouch()) r.style.minHeight = "44px";
    r.style.touchAction = "none";
    const out = el("span", "vqs-slider__num");
    out.setAttribute("data-value", "");
    host.append(r, out);
    r.addEventListener("input", () => { out.textContent = fmtNum(r.value, c.digits) + (c.unit || ""); send(r.value); });
    r.addEventListener("change", () => { send(r.value); end(); });
    r.addEventListener("pointerup", end);
    if (c.center !== undefined && c.center !== null) {
      host.addEventListener("dblclick", () => { r.value = String(c.center); out.textContent = fmtNum(c.center, c.digits) + (c.unit || ""); send(c.center); end(); });
      host.classList.add("vqs-slider--centered");
    }
    host.vqsSet = (v, mixed) => {
      if (!mixed) r.value = String(finite(v, c.min));
      r.setAttribute("aria-valuetext", mixed ? "共通でない値" : String(r.value));
      out.textContent = mixed ? "—" : fmtNum(finite(v, 0), c.digits) + (c.unit || "");
    };
    return host;
  }

  /** 切り替え（widgets.toggle） */
  function tog(c) {
    const host = tryW("toggle", {
      label: c.label, value: false,
      onChange: (v) => { c.onChange(!!v); }
    }) || fbToggle(c);
    const f = {
      el: touchable(host),
      set(v, mixed) {
        writeInto(host, !!v, false, "");
        host.classList.toggle("vqs-field--mixed", !!mixed);
        if (mixed) host.setAttribute("data-mixed", "1"); else host.removeAttribute("data-mixed");
      },
      refresh() { const r = c.get ? c.get() : { value: false, mixed: false }; f.set(r.value, r.mixed); }
    };
    return addField(f);
  }
  function fbToggle(c) {
    const host = el("label", "vqs-toggle");
    const inp = el("input", "vqs-toggle__box");
    inp.type = "checkbox";
    const txt = el("span", "vqs-toggle__label", c.label || "");
    host.append(inp, txt);
    if (isTouch()) host.style.minHeight = "44px";
    inp.addEventListener("change", () => c.onChange(inp.checked));
    host.vqsSet = (v) => { inp.checked = !!v; };
    return host;
  }

  /** 並んだ選択肢（widgets.segmented）。items: [{value,label}] */
  function seg(c) {
    const items = (c.items || []).map((it) => (typeof it === "string" ? { value: it, label: it } : it));
    const host = tryW("segmented", {
      items, value: c.value, onChange: (v) => c.onChange(v)
    }) || fbSegmented(items, c);
    const f = {
      el: host,
      set(v, mixed) {
        if (typeof host.vqsSet === "function") { try { host.vqsSet(v, mixed); return; } catch (e) { /* 下へ */ } }
        const btns = host.querySelectorAll ? host.querySelectorAll("[data-value]") : [];
        for (const b of btns) {
          const on = !mixed && String(b.getAttribute("data-value")) === String(v);
          b.classList.toggle("vqs-seg__btn--on", on);
          b.setAttribute("aria-pressed", on ? "true" : "false");
        }
        host.classList.toggle("vqs-field--mixed", !!mixed);
      },
      refresh() { const r = c.get ? c.get() : { value: c.value, mixed: false }; f.set(r.value, r.mixed); }
    };
    return addField(f);
  }
  function fbSegmented(items, c) {
    const host = el("div", "vqs-seg");
    host.setAttribute("role", "group");
    if (c.label) host.setAttribute("aria-label", c.label);
    for (const it of items) {
      const b = el("button", "vqs-seg__btn", it.label);
      b.type = "button";
      b.setAttribute("data-value", String(it.value));
      if (it.title) b.title = it.title;
      if (isTouch()) { b.style.minHeight = "44px"; b.style.minWidth = "44px"; }
      b.addEventListener("click", () => c.onChange(it.value));
      host.append(b);
    }
    return host;
  }

  /** ドロップダウン（widgets に無いので自前。items: [{value,label}]） */
  function sel(c) {
    const host = el("div", "vqs-select");
    const s = el("select", "vqs-select__el");
    s.setAttribute("aria-label", c.label || "選択");
    if (isTouch()) s.style.minHeight = "44px";
    const mixedOpt = el("option", "", "—");
    mixedOpt.value = MIXED_SENTINEL;
    for (const raw of c.items || []) {
      const it = typeof raw === "string" ? { value: raw, label: raw } : raw;
      const op = el("option", "", it.label);
      op.value = String(it.value);
      s.append(op);
    }
    host.append(s);
    s.addEventListener("change", () => { if (s.value !== MIXED_SENTINEL) c.onChange(s.value); });
    const f = {
      el: host,
      set(v, mixed) {
        if (mixed) {
          if (!mixedOpt.isConnected) s.insertBefore(mixedOpt, s.firstChild);
          s.value = MIXED_SENTINEL;
        } else {
          if (mixedOpt.isConnected) mixedOpt.remove();
          s.value = String(v);
        }
        host.classList.toggle("vqs-field--mixed", !!mixed);
      },
      refresh() { const r = c.get ? c.get() : { value: "", mixed: false }; f.set(r.value, r.mixed); }
    };
    return addField(f);
  }

  /** 色（widgets.colorField） */
  function col(c) {
    const drv = driver({ label: c.label || "色", apply: (v, ph) => c.onInput(v, ph) });
    const host = tryW("colorField", { value: c.value || "#ffffff", label: c.label, onInput: (v) => drv.input(v), onChange: () => drv.end() }) || fbColor(c, drv);
    const f = {
      el: touchable(host),
      set(v, mixed) { writeInto(host, mixed ? "#000000" : String(v || "#000000"), mixed); },
      refresh() { const r = c.get ? c.get() : { value: "#000000", mixed: false }; f.set(r.value, r.mixed); }
    };
    return addField(f);
  }
  function fbColor(c, drv) {
    const host = el("div", "vqs-color");
    const inp = el("input", "vqs-color__el");
    inp.type = "color";
    inp.setAttribute("aria-label", c.label || "色");
    if (isTouch()) { inp.style.minHeight = "44px"; inp.style.minWidth = "44px"; }
    host.append(inp);
    inp.addEventListener("input", () => drv.input(inp.value));
    inp.addEventListener("change", () => { drv.input(inp.value); drv.end(); });
    host.vqsSet = (v) => { if (/^#[0-9a-fA-F]{6}$/.test(String(v))) inp.value = String(v); };
    return host;
  }

  /** ただの押しボタン */
  function btn(label, onClick, opts) {
    const o = opts || {};
    const b = el("button", "vqs-btn " + (o.cls || "vqs-btn--ghost"), label);
    b.type = "button";
    if (o.title) b.title = o.title;
    if (o.test) b.setAttribute("data-test", o.test);
    if (isTouch()) { b.style.minHeight = "44px"; b.style.minWidth = "44px"; }
    b.addEventListener("click", (ev) => {
      ev.preventDefault();
      try { onClick(ev, b); } catch (e) { toastOf(widgets, (e && e.message) || "実行できませんでした", { kind: "error" }); }
    });
    return b;
  }
  /** ボタンを横に並べる箱（狭い画面では折り返す） */
  function btnRow(children, cls) {
    const box = el("div", "vqs-btnrow " + (cls || ""));
    for (const c of children) if (c) box.append(c);
    return box;
  }

  /** 見出しつきの畳める区画 */
  function section(cfg) {
    const c = cfg || {};
    const host = el("section", "vqs-insp-sec");
    if (c.id) host.setAttribute("data-test", "insp-sec-" + c.id);
    const head = el("button", "vqs-insp-sec__head");
    head.type = "button";
    head.setAttribute("aria-expanded", c.open === false ? "false" : "true");
    head.append(el("span", "vqs-insp-sec__title", c.title || ""));
    const body = el("div", "vqs-insp-sec__body");
    host.append(head, body);
    if (c.open === false) host.classList.add("vqs-insp-sec--closed");
    if (isTouch()) head.style.minHeight = "44px";
    head.addEventListener("click", () => {
      const closed = host.classList.toggle("vqs-insp-sec--closed");
      head.setAttribute("aria-expanded", closed ? "false" : "true");
    });
    return {
      el: host,
      body,
      add(...nodes) { for (const n of nodes) if (n) body.append(n.el && isNode(n.el) ? n.el : n); return this; }
    };
  }

  /**
   * 1 行（左にキーフレーム印・右に入力）。
   * @param {{label?:string, field?:Object, node?:Node, path?:string,
   *          hint?:string, stack?:boolean, onReset?:Function}} cfg
   */
  function row(cfg) {
    const c = cfg || {};
    const host = el("div", "vqs-insp-row" + (c.stack ? " vqs-insp-row--stack" : ""));
    host.append(keyframeMark(c.path, c.label));
    const ctl = el("div", "vqs-insp-row__ctl");
    const node = c.field ? c.field.el : c.node;
    if (node) ctl.append(node);
    host.append(ctl);
    if (c.hint) host.append(el("p", "vqs-insp-hint", c.hint));
    if (typeof c.onReset === "function") {
      host.title = "ダブルクリックで既定へ戻す";
      host.addEventListener("dblclick", (ev) => {
        if (ev.target && ev.target.closest && ev.target.closest("input, select, textarea")) return;
        c.onReset();
      });
    }
    return host;
  }

  /**
   * キーフレーム印。押すと現在時刻に打つ／その時刻に在れば外す。
   * path は 1 本でも配列でも良い（位置のように X と Y を 1 つの印で扱う用）。
   * path が無い行（クロップ・反転・ブレンド等）は「打てない」印を出す
   * （場所を空けておかないと行の左端が揃わない）。
   */
  function keyframeMark(path, label) {
    const paths = (Array.isArray(path) ? path : [path]).filter((p) => typeof p === "string" && p);
    if (!paths.length) {
      const spacer = el("span", "vqs-kf vqs-kf--none");
      spacer.setAttribute("aria-hidden", "true");
      return spacer;
    }
    const tol = () => Math.max(1e-4, frameDur(fps()) / 2);
    /** その clip の path に、今の時刻のキーが在るか */
    const hasAt = (c, p) => {
      const keys = (c.keys && c.keys[p]) || [];
      const lt = localTime(c);
      const t = tol();
      return keys.some((k) => Math.abs(finite(k.t, 0) - lt) <= t);
    };
    const state = () => {
      let on = false;
      let count = 0;
      for (const c of clips()) {
        for (const p of paths) {
          count += ((c.keys && c.keys[p]) || []).length;
          if (hasAt(c, p)) on = true;
        }
      }
      return { on, count };
    };
    const toggle = () => {
      const st = state();
      if (st.on) {
        /* 在る所だけ外す（無い path に key.remove を投げると op が throw して
           batch ごと巻き戻る） */
        kit_eachPath("キーフレームを削除", (c, p) => (hasAt(c, p) ? { type: "key.remove", payload: { clipId: c.id, path: p, t: localTime(c) } } : null));
      } else {
        kit_eachPath("キーフレームを追加", (c, p) => (hasAt(c, p) ? null : { type: "key.add", payload: { clipId: c.id, path: p } }));
      }
      sync();
    };
    /** クリップ × path の全組み合わせを 1 undo で当てる */
    function kit_eachPath(label2, make) {
      const list = clips();
      if (!list.length) return null;
      const jobs = [];
      for (const c of list) for (const p of paths) {
        const m = make(c, p);
        if (m) jobs.push(m);
      }
      if (!jobs.length) return null;
      if (jobs.length === 1) return patch(jobs[0].type, jobs[0].payload, { label: label2 });
      try { return store.batch(label2, (d) => { for (const j of jobs) d(j.type, j.payload); }); }
      catch (e) { toastOf(widgets, (e && e.message) || "キーフレームを変えられませんでした", { kind: "error" }); return null; }
    }
    const jump = (dir) => {
      const list = clips();
      if (!list.length) return;
      const c = list[0];
      const lt = localTime(c);
      const t = tol();
      let best = null;
      for (const p of paths) {
        for (const k of (c.keys && c.keys[p]) || []) {
          const kt = finite(k.t, 0);
          if (dir > 0 ? kt > lt + t : kt < lt - t) {
            if (best === null || (dir > 0 ? kt < best : kt > best)) best = kt;
          }
        }
      }
      if (best === null) { toastOf(widgets, dir > 0 ? "これより後にキーフレームはありません" : "これより前にキーフレームはありません", { kind: "info" }); return; }
      const at = finite(c.start, 0) + best;
      if (transport && typeof transport.seek === "function") transport.seek(at);
      else store.setView({ playhead: at });
    };

    let host = null;
    if (hasW("keyframeRow")) {
      /* widgets 側に専用部品が在ればそれを使う（依頼書の widgets.keyframeRow）。
         引数の形が分からないので、Node が返らなければ自前へ落ちる。 */
      const st0 = state();
      host = tryW("keyframeRow", {
        label, path: paths.length === 1 ? paths[0] : paths, paths,
        active: st0.on, count: st0.count,
        onToggle: toggle, onPrev: () => jump(-1), onNext: () => jump(1)
      });
    }
    if (!host) {
      host = el("div", "vqs-kf");
      const prev = el("button", "vqs-kf__nav", "‹");
      prev.type = "button";
      prev.title = "前のキーフレームへ";
      prev.setAttribute("aria-label", "前のキーフレームへ");
      const mark = el("button", "vqs-kf__dot");
      mark.type = "button";
      mark.title = (label ? label + "に" : "") + "現在位置のキーフレームを打つ／外す";
      mark.setAttribute("aria-label", (label || "この値") + "のキーフレーム");
      mark.append(iconOf(widgets, "keyframe", "◆"));
      const next = el("button", "vqs-kf__nav", "›");
      next.type = "button";
      next.title = "次のキーフレームへ";
      next.setAttribute("aria-label", "次のキーフレームへ");
      if (isTouch()) for (const b of [prev, mark, next]) { b.style.minWidth = "44px"; b.style.minHeight = "44px"; }
      prev.addEventListener("click", () => jump(-1));
      next.addEventListener("click", () => jump(1));
      mark.addEventListener("click", toggle);
      host.append(prev, mark, next);
      host.vqsSet = (v) => {
        const on = !!(v && v.on);
        mark.classList.toggle("vqs-kf__dot--on", on);
        mark.setAttribute("aria-pressed", on ? "true" : "false");
        host.classList.toggle("vqs-kf--has", !!(v && v.count));
      };
    }
    const sync = () => { if (typeof host.vqsSet === "function") { try { host.vqsSet(state()); } catch (e) { /* noop */ } } };
    addField({ el: host, set() { sync(); }, refresh: sync });
    sync();
    return host;
  }

  /** 説明文（穏やかに出す。エラーではない） */
  function note(text, kind) {
    return el("p", "vqs-insp-note" + (kind ? " vqs-insp-note--" + kind : ""), text);
  }
  /** 読むだけの「名前: 値」 */
  function kv(k, v, testId) {
    const host = el("div", "vqs-insp-kv");
    host.append(el("span", "vqs-insp-kv__k", k));
    const val = el("span", "vqs-insp-kv__v", v === undefined || v === null ? "—" : String(v));
    if (testId) val.setAttribute("data-test", testId);
    host.append(val);
    return host;
  }

  function addField(f) { fields.push(f); return f; }

  /** 全部の値を store から読み直す（DOM は作り直さない） */
  function update(nextIds) {
    if (Array.isArray(nextIds)) ids = nextIds.slice();
    for (const f of fields) {
      if (typeof f.refresh === "function") { try { f.refresh(); } catch (e) { warn("inspector", "値の更新に失敗", e); } }
    }
  }

  function dispose() {
    for (const c of cleanups) { try { c(); } catch (e) { /* noop */ } }
    cleanups.length = 0;
    fields.length = 0;
  }

  return {
    /* 読み書き */
    clips, read, patch, patchAll, eachClip, driver, localTime, now, fps,
    /* 部品 */
    el, section, row, num, sld, tog, seg, sel, col, btn, btnRow, note, kv, keyframeMark,
    icon: (n, t) => iconOf(widgets, n, t),
    toast: (m, o) => toastOf(widgets, m, o),
    widgets,
    store,
    hasW, tryW, writeInto, touchable, addField,
    /* 寿命 */
    update, dispose,
    get ids() { return ids.slice(); }
  };
}

/** 値が同じか（数の誤差と配列・object を軽く見る） */
export function sameValue(a, b) {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-9 || (Number.isNaN(a) && Number.isNaN(b));
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return false; }
}

/* ── 4. インスペクタ本体 ────────────────────────────────────────── */

/**
 * 右側の詳細設定を組み立てる。
 * @param {{store:Object, els?:Object, widgets?:Object, transport?:Object, ctx?:Object}} o
 * @returns {{render:Function, dispose:Function, setTab:Function, get tab:string}}
 */
export function createInspector(o) {
  const store = o && o.store;
  if (!store) throw new Error("createInspector: store が必要です");
  const widgets = (o && o.widgets) || null;
  const transport = (o && o.transport) || null;
  const ctx = (o && o.ctx) || null;
  const els = (o && o.els) || {};
  const host = els.inspector || document.getElementById("inspector");
  const tabsHost = els.inspectorTabs || document.getElementById("inspectorTabs");
  if (!host) throw new Error("createInspector: #inspector が見つかりません");

  /* ── 状態 ─────────────────────────────────────────────────────── */
  const state = {
    tab: readLastTab(),
    sig: "",
    visible: [],           // 出せるタブの id
    panel: null,           // { id, api }
    loading: "",           // 読み込み中のタブ id
    disposed: false,
    raf: 0,
    pendingRebuild: true
  };
  /** 動的 import の結果（成功も失敗も 1 回だけ） */
  const modCache = new Map();

  /* ── 骨組み（1 回だけ作る）───────────────────────────────────── */
  const root = el("div", "vqs-insp");
  root.setAttribute("data-test", "inspector-root");
  const head = el("div", "vqs-insp__head");
  head.setAttribute("data-test", "insp-head");
  const headText = el("div", "vqs-insp__headtext");
  const title = el("div", "vqs-insp__title", "選択なし");
  title.setAttribute("data-test", "insp-title");
  const meta = el("div", "vqs-insp__meta", "");
  meta.setAttribute("data-test", "insp-meta");
  headText.append(title, meta);
  const resetBtn = el("button", "vqs-insp__reset", "");
  resetBtn.type = "button";
  resetBtn.title = "この設定を既定へ戻す";
  resetBtn.setAttribute("aria-label", "この設定を既定へ戻す");
  resetBtn.setAttribute("data-test", "insp-reset");
  resetBtn.append(iconOf(widgets, "reset", "↺"));
  if (isTouch()) { resetBtn.style.minWidth = "44px"; resetBtn.style.minHeight = "44px"; }
  resetBtn.addEventListener("click", onReset);
  head.append(headText, resetBtn);
  const body = el("div", "vqs-insp__body");
  body.setAttribute("data-test", "insp-body");
  root.append(head, body);
  host.append(root);

  /* タブ。#inspectorTabs が在ればそこへ、無ければ自分の中へ出す */
  const tabs = el("nav", "vqs-insp-tabs");
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("data-test", "insp-tabs");
  /* CSS がまだ無くても横に並んで指で流せるように（最小限だけ inline） */
  tabs.style.display = "flex";
  tabs.style.overflowX = "auto";
  tabs.style.flexWrap = "nowrap";
  const tabBtns = new Map();
  for (const t of TABS) {
    const b = el("button", "vqs-insp-tab", t.label);
    b.type = "button";
    b.setAttribute("role", "tab");
    b.setAttribute("data-tab", t.id);
    b.setAttribute("data-test", "insp-tab-" + t.id);
    if (isTouch()) { b.style.minHeight = "44px"; b.style.minWidth = "44px"; }
    b.addEventListener("click", () => setTab(t.id));
    tabBtns.set(t.id, b);
    tabs.append(b);
  }
  if (tabsHost) { tabsHost.append(tabs); } else { root.insertBefore(tabs, body); }

  /* ── 選択を読む ───────────────────────────────────────────────── */
  function selectedIds() {
    const sel = store.selection || { clipIds: [] };
    const out = [];
    for (const id of sel.clipIds || []) if (findClip(store.project, id)) out.push(id);
    return out;
  }
  function kindsOf(ids) {
    const set = new Set();
    for (const id of ids) {
      const f = findClip(store.project, id);
      if (f) set.add(String(f.clip.kind || ""));
    }
    return Array.from(set);
  }
  function sigOf(ids, kinds) {
    return ids.slice().sort().join(",") + "|" + kinds.slice().sort().join("/");
  }

  /* ── 見出し（選択中: 名前 / 尺 / 位置）────────────────────────── */
  function renderHead(ids) {
    const f = fpsOf();
    if (!ids.length) {
      title.textContent = "選択なし";
      meta.textContent = "クリップを選ぶと、ここに細かい設定が出ます";
      resetBtn.hidden = true;
      return;
    }
    if (ids.length === 1) {
      const found = findClip(store.project, ids[0]);
      const clip = found ? found.clip : null;
      const asset = clip ? assetById(store.project, clip.assetId) : null;
      const name = (clip && clip.name) || (asset && asset.name) || kindLabel(clip && clip.kind);
      title.textContent = name || "クリップ";
      const parts = [
        "尺 " + humanDuration(clip ? clip.duration : 0),
        "位置 " + toTC(clip ? clip.start : 0, f),
        found && found.track ? String(found.track.name || "") : ""
      ].filter(Boolean);
      meta.textContent = parts.join(" ・ ");
    } else {
      title.textContent = ids.length + " 個のクリップ";
      let total = 0;
      let first = Infinity;
      for (const id of ids) {
        const found = findClip(store.project, id);
        if (!found) continue;
        total += finite(found.clip.duration, 0);
        first = Math.min(first, finite(found.clip.start, 0));
      }
      meta.textContent = "合計 " + humanDuration(total) + " ・ 先頭 " + toTC(Number.isFinite(first) ? first : 0, f) + " ・ 共通でない値は — で出ます";
    }
    resetBtn.hidden = false;
  }
  function fpsOf() {
    const s = store.project && store.project.settings;
    return clamp(finite(s && s.fps, 30), 1, 240);
  }
  function kindLabel(kind) {
    return ({ video: "映像", image: "画像", audio: "音声", text: "テキスト", shape: "図形", adjust: "調整レイヤー", compound: "まとめたクリップ" })[String(kind)] || "";
  }

  /* ── タブの出し入れ ──────────────────────────────────────────── */
  function computeVisible(kinds) {
    const out = [];
    for (const t of TABS) {
      let ok = false;
      try { ok = !!t.when(kinds); } catch (e) { ok = false; }
      if (ok) out.push(t.id);
    }
    return out;
  }
  function renderTabs() {
    for (const t of TABS) {
      const b = tabBtns.get(t.id);
      if (!b) continue;
      const on = state.visible.indexOf(t.id) >= 0;
      b.hidden = !on;
      b.classList.toggle("vqs-insp-tab--hidden", !on);
      const active = on && t.id === state.tab;
      b.classList.toggle("vqs-insp-tab--on", active);
      b.setAttribute("aria-selected", active ? "true" : "false");
      b.tabIndex = active ? 0 : -1;
    }
  }
  function setTab(id) {
    if (state.tab === id && state.panel && state.panel.id === id) return;
    state.tab = id;
    try { localStorage.setItem(LAST_TAB_KEY, id); } catch (e) { /* 使えない環境は覚えないだけ */ }
    state.pendingRebuild = true;
    schedule();
  }
  function readLastTab() {
    try {
      const v = localStorage.getItem(LAST_TAB_KEY);
      if (v && TABS.some((t) => t.id === v)) return v;
    } catch (e) { /* noop */ }
    return "transform";
  }

  /* ── 中身（panel）を読む ─────────────────────────────────────── */
  async function loadModule(def) {
    if (modCache.has(def.id)) return modCache.get(def.id);
    let mod = null;
    try { mod = await import(def.mod); }
    catch (e) {
      mod = null;
      const fl = typeof window !== "undefined" && window.VQSTUDIO && window.VQSTUDIO.failures;
      if (Array.isArray(fl)) fl.push({ path: "ui/inspector/" + def.mod.replace("./", ""), required: false, message: String((e && e.message) || e) });
      warn("inspector", `${def.id} タブを読み込めなかった`, e);
    }
    modCache.set(def.id, mod);
    return mod;
  }

  function disposePanel() {
    if (state.panel && state.panel.api && typeof state.panel.api.dispose === "function") {
      try { state.panel.api.dispose(); } catch (e) { warn("inspector", "panel の後始末で失敗", e); }
    }
    state.panel = null;
  }

  async function buildPanel(ids) {
    const def = TABS.find((t) => t.id === state.tab);
    if (!def) return;
    state.loading = def.id;
    body.textContent = "";
    body.append(el("p", "vqs-insp-note", "読み込んでいます…"));
    const mod = await loadModule(def);
    if (state.disposed || state.loading !== def.id || state.tab !== def.id) return;
    body.textContent = "";
    const make = mod && typeof mod[def.fn] === "function" ? mod[def.fn] : null;
    if (!make) {
      body.append(missingPanel(def));
      state.panel = { id: def.id, api: null };
      return;
    }
    let api = null;
    try {
      api = make({ store, widgets, clipIds: ids.slice(), transport, ctx, els, kit: null });
    } catch (e) {
      warn("inspector", `${def.id} タブを組み立てられなかった`, e);
      body.append(brokenPanel(def, e));
      state.panel = { id: def.id, api: null };
      return;
    }
    if (!api || !api.el) {
      body.append(brokenPanel(def, new Error("panel が el を返しませんでした")));
      state.panel = { id: def.id, api: null };
      return;
    }
    const wrap = el("div", "vqs-insp-panel vqs-insp-panel--" + def.id);
    wrap.setAttribute("data-test", "insp-panel-" + def.id);
    wrap.setAttribute("role", "tabpanel");
    wrap.append(api.el);
    body.append(wrap);
    state.panel = { id: def.id, api };
  }

  function missingPanel(def) {
    const box = el("div", "vqs-insp-empty");
    box.append(el("p", "vqs-insp-note", `「${def.label}」の設定はまだ読み込めません。`));
    box.append(el("p", "vqs-insp-hint", "この部分は別の担当が用意中です。他のタブはそのまま使えます。"));
    return box;
  }
  function brokenPanel(def, e) {
    const box = el("div", "vqs-insp-empty");
    box.append(el("p", "vqs-insp-note vqs-insp-note--warn", `「${def.label}」の設定を開けませんでした。`));
    box.append(el("p", "vqs-insp-hint", String((e && e.message) || e)));
    return box;
  }

  /* ── 既定へ戻す ───────────────────────────────────────────────── */
  function onReset() {
    const api = state.panel && state.panel.api;
    if (api && typeof api.reset === "function") {
      try { api.reset(); toastOf(widgets, "既定に戻しました", { kind: "info" }); return; }
      catch (e) { toastOf(widgets, (e && e.message) || "戻せませんでした", { kind: "error" }); return; }
    }
    toastOf(widgets, "このタブには戻せる値がありません", { kind: "info" });
  }

  /* ── 描画（rAF で 1 回にまとめる）───────────────────────────── */
  function schedule() {
    if (state.disposed || state.raf) return;
    state.raf = requestAnimationFrame(() => { state.raf = 0; paint(); });
  }
  function paint() {
    if (state.disposed) return;
    /* 誰かがスライダーを掴んでいる間は DOM を作り直さない（指の下から消える） */
    if (isInteracting()) { whenIdle(schedule); return; }

    const ids = selectedIds();
    const kinds = kindsOf(ids);
    const sig = sigOf(ids, kinds);
    const visible = computeVisible(kinds);
    state.visible = visible;

    if (visible.indexOf(state.tab) < 0) {
      /* 選択の種類に合わないタブは、在るものへ静かに移る */
      state.tab = visible.indexOf("project") >= 0 && !ids.length ? "project" : (visible[0] || "project");
      state.pendingRebuild = true;
    }
    renderTabs();
    renderHead(ids);

    const changed = sig !== state.sig;
    state.sig = sig;
    if (changed || state.pendingRebuild || !state.panel || state.panel.id !== state.tab) {
      state.pendingRebuild = false;
      disposePanel();
      buildPanel(ids);
      return;
    }
    const api = state.panel && state.panel.api;
    if (api && typeof api.update === "function") {
      try { api.update(ids.slice()); } catch (e) { warn("inspector", "panel.update で失敗", e); }
    }
  }

  /* ── store の変化を聞く（app.js からの render() と合わせて 1 回に）── */
  const off = store.subscribe((ev) => {
    if (!ev) return;
    if (ev.kind === "view") {
      /* 再生ヘッドが動くとキーフレーム印の点灯が変わる。DOM は作り直さない */
      const api = state.panel && state.panel.api;
      if (api && typeof api.update === "function" && !isInteracting()) {
        try { api.update(selectedIds()); } catch (e) { /* noop */ }
      }
      return;
    }
    schedule();
  });

  /* 再生中も印の点灯を追う（transport が在れば） */
  let offTime = null;
  if (transport && typeof transport.on === "function") {
    try {
      offTime = transport.on("time", () => {
        if (isInteracting()) return;
        const api = state.panel && state.panel.api;
        if (api && typeof api.update === "function") { try { api.update(selectedIds()); } catch (e) { /* noop */ } }
      });
    } catch (e) { offTime = null; }
  }

  schedule();

  return {
    /** app.js から呼ばれる（rAF で 1 回にまとめる） */
    render() { schedule(); },
    /** タブを外から切り替える（モバイルの下段タブから使える） */
    setTab,
    get tab() { return state.tab; },
    /** 出せるタブの一覧（モバイルの殻が並べ替えるのに使う） */
    get visibleTabs() { return state.visible.slice(); },
    dispose() {
      state.disposed = true;
      if (state.raf) { cancelAnimationFrame(state.raf); state.raf = 0; }
      disposePanel();
      if (typeof off === "function") { try { off(); } catch (e) { /* noop */ } }
      if (typeof offTime === "function") { try { offTime(); } catch (e) { /* noop */ } }
      try { tabs.remove(); } catch (e) { /* noop */ }
      try { root.remove(); } catch (e) { /* noop */ }
    }
  };
}
