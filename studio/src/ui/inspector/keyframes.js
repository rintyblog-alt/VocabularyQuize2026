/* ══════════════════════════════════════════════════════════════════════════
   studio/src/ui/inspector/keyframes.js — キーフレームの一覧と編集

   ★ 何をする所か
     選択クリップが持つ **全てのキーフレーム**（`clip.keys` の property ごと）を
     行に並べて、打つ / 消す / 動かす / 値を変える / イージングを選ぶ /
     前後のキーへ飛ぶ / 全部消す / 値をコピーして別クリップへ貼る、を行う所。
     Premiere の「エフェクトコントロール」の時間軸、After Effects の
     タイムラインに当たる。加えて「よく使う道具」（フェードイン/アウト・
     ズームイン・揺れ）が、キーを 2〜4 個まとめて打つ。

   ★ なぜこの形か
     ・横軸は **クリップ内の相対位置**（0 = クリップの頭、右端 = 終わり）。
       タイムラインのズームには追従しない（依頼どおり）。こうすると
       クリップの尺が変わっても行の見た目が崩れず、速度を変えた後でも
       「クリップの何割の所か」が一目で分かる。
     ・キーの t は **clip ローカル秒**（契約書 §2）。op も同じ単位なので、
       画面の x → 秒 の変換はここ 1 箇所（`xToT` / `tToX`）だけで済む。
     ・**先頭の選択クリップだけ**を編集する。キーは clip ごとに別物で、
       複数のクリップを 1 つの時間軸に混ぜると「どれを動かしたのか」が
       分からなくなる（プロ機も選択 1 つで扱う）。貼り付けだけは
       「選択中の他のクリップへ」効く。
     ・値の編集は選んだキー 1 個だけを対象にする（`key.update`）。編集欄は
       選び直すたびに作り替えるので、**専用の kit（editKit）** を持って
       古い部品を捨てる（kit に溜め続けると update が重くなる）。
     ・掴んで動かすのは Pointer Events のみ（touch と mouse を混ぜない）。
       当たり判定は viewBox 上で 26（実寸 ≒ 44px 相当）。

   ★ 触るときの注意
     ・`key.add` は打てない path で throw する（契約書 §2 の一覧 +
       `fx.<fxId>.<paramKey>`）。道具（フェード等）も打つ前に
       `isKeyablePath` で確かめている。
     ・`key.remove` は「在る所」にしか投げない。無い所へ投げると op が
       throw して batch ごと巻き戻る。
     ・`touch-action` は CSS 担当へ: `.vqs-kfp__lane` に `touch-action: none`。
     ・触り所は 44px 以上（行の高さは 44px を下回らせない）。

   CONTRACT-NOTE: 契約書 §7.3 の `curveEditor({points,onChange})` は「点の列」を
     取る形なので、イージングの 3 次ベジェ（`bez:[x1,y1,x2,y2]`）を
     **2 点（[x1,y1] と [x2,y2]）の列**として渡す。widgets 側が別の形で
     返してきたら（2 点未満）自前の編集器へ落ちる。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

import { createFieldKit, el, fmtNum } from "./index.js";
import { clamp, finite, isTouch, rafThrottle } from "../../core/util.js";
import { frameDur, toTC } from "../../core/time.js";
import { isKeyablePath } from "../../core/schema.js";
import { sampleClipPath } from "../../core/eval.js";

/* ── §0. 名前と定数（純関数のための表）──────────────────────────── */

/** property path → 日本語（契約書 §2 の一覧） */
export const PATH_LABELS = Object.freeze({
  opacity: "不透明度", volume: "音量", pan: "左右",
  "transform.x": "位置 X", "transform.y": "位置 Y",
  "transform.scale": "拡大", "transform.scaleX": "横の拡大", "transform.scaleY": "縦の拡大",
  "transform.rotate": "回転",
  "mask.x": "マスク X", "mask.y": "マスク Y", "mask.w": "マスクの幅", "mask.h": "マスクの高さ",
  "mask.rotate": "マスクの回転", "mask.feather": "マスクのぼかし",
  "chroma.similarity": "クロマキーの許容差", "chroma.smoothness": "クロマキーの境界", "chroma.spill": "スピル除去",
  "text.style.size": "文字の大きさ", "text.style.color": "文字の色"
});

/** ColorGrade の数値キーの日本語（color.<key> 用。足りない分は英語のまま） */
export const COLOR_LABELS = Object.freeze({
  exposure: "露出", contrast: "コントラスト", saturation: "彩度", temperature: "色温度",
  tint: "色かぶり", highlights: "明部", shadows: "暗部", whites: "白", blacks: "黒",
  vibrance: "自然な彩度", hue: "色相", sharpen: "先鋭化", denoise: "ノイズ除去",
  vignette: "周辺減光", grain: "粒子", fade: "フェード"
});

/** イージング（契約書 §2 の EASES） */
export const EASE_ITEMS = Object.freeze([
  { value: "linear", label: "直線" },
  { value: "in", label: "だんだん速く" },
  { value: "out", label: "だんだん遅く" },
  { value: "inout", label: "なめらか" },
  { value: "hold", label: "段差（保つ）" },
  { value: "bezier", label: "自由曲線" }
]);

/** 「打つ」で選べる よく使う property（クリップの種類で絞る） */
export const QUICK_PATHS = Object.freeze([
  { path: "opacity", kinds: null },
  { path: "transform.x", kinds: ["video", "image", "text", "shape", "compound"] },
  { path: "transform.y", kinds: ["video", "image", "text", "shape", "compound"] },
  { path: "transform.scale", kinds: ["video", "image", "text", "shape", "compound"] },
  { path: "transform.rotate", kinds: ["video", "image", "text", "shape", "compound"] },
  { path: "volume", kinds: ["video", "audio", "compound"] },
  { path: "pan", kinds: ["video", "audio", "compound"] }
]);

/* ── §1. 純関数（DOM に触らない＝ Node で試験できる）─────────────── */

/**
 * path の見せ方。fx のパラメータは clip の効果の type を混ぜて名乗る。
 * @param {string} path @param {Object} [clip] @returns {string}
 */
export function pathLabel(path, clip) {
  const p = String(path || "");
  if (PATH_LABELS[p]) return PATH_LABELS[p];
  const seg = p.split(".");
  if (seg[0] === "color") {
    if (seg[1] === "wheels") {
      const ch = ["R", "G", "B"][Number(seg[3])] || "";
      return "カラー: " + (seg[2] || "") + " " + ch;
    }
    return "カラー: " + (COLOR_LABELS[seg[1]] || seg[1] || "");
  }
  if (seg[0] === "fx") {
    const list = (clip && Array.isArray(clip.fx) ? clip.fx : []);
    const f = list.find((x) => x && x.id === seg[1]);
    return "効果: " + ((f && f.type) || seg[1] || "") + " / " + (seg[2] || "");
  }
  return p;
}

/**
 * その path の値は **色**か（キーの値は数か "#rrggbb" のどちらか）。
 * `color.<key>`（ColorGrade）は数値なので色ではない。末尾が `.color` の物
 * （`text.style.color` や 効果の色パラメータ）だけが色。
 * @param {string} path @returns {boolean}
 */
export function isColorPath(path) {
  const p = String(path || "");
  return /(^|\.)color$/.test(p) && p.indexOf("color.") !== 0;
}

/**
 * フェードイン / アウトのキー（不透明度）。
 * @param {number} duration クリップの尺（秒）
 * @param {{inDur?:number, outDur?:number}} [opts]
 * @returns {{t:number,v:number,ease:string}[]}
 */
export function fadeKeys(duration, opts) {
  const o = opts || {};
  const len = Math.max(0.04, finite(duration, 0));
  const fi = clamp(finite(o.inDur, 0.5), 0, len / 2);
  const fo = clamp(finite(o.outDur, 0.5), 0, len / 2);
  const keys = [];
  if (fi > 0) { keys.push({ t: 0, v: 0, ease: "inout" }); keys.push({ t: fi, v: 1, ease: "linear" }); }
  else keys.push({ t: 0, v: 1, ease: "linear" });
  if (fo > 0) { keys.push({ t: Math.max(fi + 0.01, len - fo), v: 1, ease: "inout" }); keys.push({ t: len, v: 0, ease: "linear" }); }
  return keys;
}

/**
 * ズームイン（拡大）のキー。
 * @param {number} duration @param {{from?:number,to?:number}} [opts]
 * @returns {{t:number,v:number,ease:string}[]}
 */
export function zoomKeys(duration, opts) {
  const o = opts || {};
  const len = Math.max(0.04, finite(duration, 0));
  const from = clamp(finite(o.from, 1), 0.01, 20);
  const to = clamp(finite(o.to, 1.18), 0.01, 20);
  return [{ t: 0, v: from, ease: "inout" }, { t: len, v: to, ease: "linear" }];
}

/**
 * 揺れ（位置 X / Y を交互に振る）のキー。
 * @param {number} duration @param {{amount?:number,count?:number}} [opts]
 * @returns {{x:{t:number,v:number,ease:string}[], y:{t:number,v:number,ease:string}[]}}
 */
export function shakeKeys(duration, opts) {
  const o = opts || {};
  const len = Math.max(0.04, finite(duration, 0));
  const amp = clamp(finite(o.amount, 0.012), 0.0005, 0.3);
  const n = Math.max(2, Math.min(8, Math.round(finite(o.count, 4))));
  const x = [];
  const y = [];
  for (let i = 0; i <= n; i++) {
    const t = (len * i) / n;
    const s = i % 2 === 0 ? 1 : -1;
    x.push({ t, v: i === 0 || i === n ? 0 : amp * s, ease: "inout" });
    y.push({ t, v: i === 0 || i === n ? 0 : amp * 0.6 * -s, ease: "inout" });
  }
  return { x, y };
}

/** bez([x1,y1,x2,y2]) ↔ curveEditor の点の列（CONTRACT-NOTE） */
export function bezToPoints(bez) {
  const b = Array.isArray(bez) && bez.length >= 4 ? bez : [0.25, 0.1, 0.25, 1];
  return [[clamp(finite(b[0], 0.25), 0, 1), finite(b[1], 0.1)], [clamp(finite(b[2], 0.25), 0, 1), finite(b[3], 1)]];
}
/** curveEditor の点の列 → bez */
export function pointsToBez(points) {
  if (!Array.isArray(points) || points.length < 2) return [0.25, 0.1, 0.25, 1];
  const a = points[0] || [];
  const b = points[points.length - 1] || [];
  return [clamp(finite(a[0], 0.25), 0, 1), finite(a[1], 0.1), clamp(finite(b[0], 0.25), 0, 1), finite(b[1], 1)];
}

/* ── §2. 画面本体 ───────────────────────────────────────────────── */

/** 「値をコピー」の置き場（panel を作り直しても残るように module に置く） */
let clipboard = null;

/**
 * キーフレームの一覧と編集。
 * @param {{store:Object, widgets?:Object, clipIds:string[], transport?:Object, ctx?:Object}} o
 * @returns {{el:HTMLElement, update:Function, dispose:Function, reset:Function}}
 */
export function createKeyframePanel(o) {
  const store = o.store;
  const widgets = o.widgets || null;
  const transport = o.transport || null;
  const kit = createFieldKit({ store, widgets, clipIds: o.clipIds, transport });
  /** 選んだキーの編集欄だけを持つ kit（選び直すたびに捨てて作る） */
  let editKit = null;
  const root = el("div", "vqs-kfp");
  let dead = false;
  let rowsSig = "";
  /** 選んでいるキー { path, index } */
  let pick = null;
  /** path → { lane, dots:[], svg } */
  const lanes = new Map();

  const VW = 1000;     // viewBox の横幅（秒ではなく割合で描く）
  const VH = 34;
  const HIT = 26;      // 当たり判定（viewBox 単位 ≒ 44px）

  const clip0 = () => kit.clips()[0] || null;
  const fps = () => kit.fps();
  const tol = () => Math.max(1e-4, frameDur(fps()) / 2);
  const lenOf = (c) => Math.max(0.04, finite(c && c.duration, 0));
  const keysOf = (c) => (c && c.keys && typeof c.keys === "object" ? c.keys : {});
  const listOf = (c, path) => {
    const l = keysOf(c)[path];
    return Array.isArray(l) ? l : [];
  };

  /* ── 2.1 見出し ──────────────────────────────────────────────── */
  const head = el("div", "vqs-kfp__head");
  const headText = el("p", "vqs-insp-note", "");
  headText.setAttribute("data-test", "insp-kf-head");
  head.append(headText);
  root.append(head);

  /* ── 2.2 打つ（property を選んで現在位置に）──────────────────── */
  const secAdd = kit.section({ title: "キーフレームを打つ", id: "kfadd" });
  let quickPath = "opacity";
  const quickSel = kit.sel({
    label: "どの値に打つか",
    items: quickItems(),
    get: () => ({ value: quickPath, mixed: false }),
    onChange: (v) => { quickPath = String(v); }
  });
  /** クリップの種類で「打てる値」を絞る（音に拡大を出さない） */
  function quickItems() {
    const c = kit.clips()[0] || null;
    const kind = String((c && c.kind) || "video");
    const out = [];
    for (const q of QUICK_PATHS) {
      if (q.kinds && q.kinds.indexOf(kind) < 0) continue;
      out.push({ value: q.path, label: pathLabel(q.path) });
    }
    return out.length ? out : [{ value: "opacity", label: pathLabel("opacity") }];
  }
  /** <option> を作り替える（選択が変わると打てる値も変わる） */
  function refillQuick() {
    const sel = quickSel.el && quickSel.el.querySelector ? quickSel.el.querySelector("select") : null;
    if (!sel) return;
    const items = quickItems();
    const sig = items.map((i) => i.value).join(",");
    if (sel.getAttribute("data-items") === sig) return;
    sel.setAttribute("data-items", sig);
    sel.textContent = "";
    for (const it of items) {
      const op = el("option", "", it.label);
      op.value = String(it.value);
      sel.append(op);
    }
    if (!items.some((i) => i.value === quickPath)) quickPath = items[0].value;
    sel.value = quickPath;
  }
  secAdd.add(kit.row({ label: "値", field: quickSel }));
  secAdd.add(kit.btnRow([
    kit.btn("今の位置に打つ", () => addAt(quickPath), { test: "insp-kf-add" }),
    kit.btn("前のキーへ", () => jump(-1), { cls: "vqs-btn--ghost" }),
    kit.btn("次のキーへ", () => jump(1), { cls: "vqs-btn--ghost" })
  ]));
  root.append(secAdd.el);

  /* ── 2.3 行（property ごとの時間軸）──────────────────────────── */
  const secRows = kit.section({ title: "打ってあるキー", id: "kfrows" });
  const rowsHost = el("div", "vqs-kfp__rows");
  rowsHost.setAttribute("data-test", "insp-kf-rows");
  secRows.body.append(rowsHost);
  secRows.add(kit.btnRow([
    kit.btn("全部消す", () => removeAll(), { cls: "vqs-btn--danger", test: "insp-kf-clearall" }),
    kit.btn("全部コピー", () => copyAll(), { cls: "vqs-btn--ghost", test: "insp-kf-copy" }),
    kit.btn("選択中の他クリップへ貼る", () => paste(), { cls: "vqs-btn--ghost", test: "insp-kf-paste" })
  ]));
  root.append(secRows.el);

  /* ── 2.4 選んだキーの編集欄 ─────────────────────────────────── */
  const secEdit = kit.section({ title: "選んだキー", id: "kfedit" });
  const editHost = el("div", "vqs-kfp__edit");
  editHost.setAttribute("data-test", "insp-kf-edit");
  secEdit.body.append(editHost);
  root.append(secEdit.el);

  /* ── 2.5 よく使う道具 ───────────────────────────────────────── */
  const secTool = kit.section({ title: "よく使う道具", id: "kftool" });
  secTool.add(kit.btnRow([
    kit.btn("フェードイン / アウトを作る", () => makeFade(), { test: "insp-kf-fade" }),
    kit.btn("ズームインを作る", () => makeZoom(), { test: "insp-kf-zoom" }),
    kit.btn("揺れを作る", () => makeShake(), { test: "insp-kf-shake" })
  ], "vqs-kfp__tools"));
  secTool.add(kit.note("押すとキーフレームを 2〜4 個まとめて打ちます。すでに同じ値にキーが在るときは作り直します。"));
  root.append(secTool.el);

  /* ── 2.6 行を作る ──────────────────────────────────────────── */

  /** 行の指紋（形が変わった時だけ作り直す） */
  function sigOfRows() {
    const c = clip0();
    if (!c) return "";
    const ks = keysOf(c);
    const paths = Object.keys(ks).sort();
    return c.id + "#" + fmtNum(lenOf(c), 3) + "|" + paths.map((p) => p + ":" + listOf(c, p).map((k) => fmtNum(k.t, 3) + (k.ease || "")).join("/")).join(",");
  }

  function buildRows() {
    lanes.clear();
    rowsHost.textContent = "";
    const c = clip0();
    const many = kit.clips().length;
    if (!c) {
      headText.textContent = "クリップを選ぶと、そのキーフレームが出ます。";
      rowsHost.append(kit.note("選択がありません。"));
      return;
    }
    headText.textContent = many > 1
      ? many + " 個選んでいます。編集は 1 つ目（" + (c.name || "先頭のクリップ") + "）に効きます。貼り付けは他のクリップへ入ります。"
      : "クリップの頭から終わりまでを 1 本の帯で表します（左端 = 頭）。";
    const paths = Object.keys(keysOf(c)).filter((p) => listOf(c, p).length).sort();
    if (!paths.length) {
      rowsHost.append(kit.note("まだキーフレームはありません。上の「今の位置に打つ」か、下の道具から作れます。"));
      return;
    }
    for (const p of paths) rowsHost.append(buildRow(c, p));
  }

  function buildRow(c, path) {
    const host = el("div", "vqs-kfp__row");
    host.setAttribute("data-path", path);
    host.setAttribute("data-test", "insp-kf-row");
    const bar = el("div", "vqs-kfp__rowhead");
    const nm = el("span", "vqs-kfp__rowname", pathLabel(path, c));
    const cnt = el("span", "vqs-kfp__rowcount", String(listOf(c, path).length) + " 個");
    const del = kit.btn("消す", () => removePath(path), { cls: "vqs-btn--ghost", title: pathLabel(path, c) + " のキーを全部消す" });
    const cp = kit.btn("コピー", () => copyPath(path), { cls: "vqs-btn--ghost", title: "この行のキーをコピーする" });
    bar.append(nm, cnt, cp, del);
    host.append(bar);

    const NS = "http://www.w3.org/2000/svg";
    const lane = el("div", "vqs-kfp__lane");
    lane.style.touchAction = "none";        // CSS 担当へ: .vqs-kfp__lane に同じ指定を
    lane.style.minHeight = isTouch() ? "44px" : "36px";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + VW + " " + VH);
    svg.setAttribute("class", "vqs-kfp__svg");
    svg.setAttribute("role", "application");
    svg.setAttribute("aria-label", pathLabel(path, c) + " のキーフレーム");
    svg.style.width = "100%";
    svg.style.height = isTouch() ? "44px" : "36px";
    svg.style.display = "block";
    const base = document.createElementNS(NS, "line");
    base.setAttribute("x1", "4");
    base.setAttribute("x2", String(VW - 4));
    base.setAttribute("y1", String(VH / 2));
    base.setAttribute("y2", String(VH / 2));
    base.setAttribute("stroke", "currentColor");
    base.setAttribute("stroke-opacity", "0.25");
    base.setAttribute("stroke-width", "2");
    const ph = document.createElementNS(NS, "line");
    ph.setAttribute("y1", "2");
    ph.setAttribute("y2", String(VH - 2));
    ph.setAttribute("stroke", "currentColor");
    ph.setAttribute("stroke-opacity", "0.6");
    ph.setAttribute("stroke-width", "1.5");
    ph.setAttribute("class", "vqs-kfp__ph");
    const dots = document.createElementNS(NS, "g");
    svg.append(base, dots, ph);
    lane.append(svg);
    host.append(lane);

    const tToX = (t) => 4 + (clamp(finite(t, 0) / lenOf(clip0() || c), 0, 1)) * (VW - 8);
    const xToT = (x) => clamp(((x - 4) / (VW - 8)) * lenOf(clip0() || c), 0, lenOf(clip0() || c));
    const svgX = (ev) => {
      const r = svg.getBoundingClientRect();
      return ((ev.clientX - r.left) / Math.max(1, r.width)) * VW;
    };

    let drag = -1;
    let dragT = 0;

    function paint() {
      const cc = clip0();
      const list = listOf(cc, path);
      cnt.textContent = String(list.length) + " 個";
      dots.textContent = "";
      list.forEach((k, i) => {
        const x = tToX(drag === i ? dragT : k.t);
        const g = document.createElementNS(NS, "g");
        const hit = document.createElementNS(NS, "rect");
        hit.setAttribute("x", String(x - HIT / 2));
        hit.setAttribute("y", "0");
        hit.setAttribute("width", String(HIT));
        hit.setAttribute("height", String(VH));
        hit.setAttribute("fill", "transparent");
        const dot = document.createElementNS(NS, "polygon");
        const r = drag === i || (pick && pick.path === path && pick.index === i) ? 8 : 6;
        dot.setAttribute("points", [
          x + "," + (VH / 2 - r), (x + r) + "," + (VH / 2), x + "," + (VH / 2 + r), (x - r) + "," + (VH / 2)
        ].join(" "));
        dot.setAttribute("fill", "currentColor");
        dot.setAttribute("class", "vqs-kfp__dot" + (pick && pick.path === path && pick.index === i ? " vqs-kfp__dot--on" : ""));
        const ttl = document.createElementNS(NS, "title");
        ttl.textContent = toTC(finite(k.t, 0), fps(), { compact: true }) + " / " + (typeof k.v === "string" ? k.v : fmtNum(k.v, 3));
        dot.append(ttl);
        g.append(hit, dot);
        dots.append(g);
      });
      const lt = kit.localTime(clip0() || c);
      ph.setAttribute("x1", String(tToX(lt)));
      ph.setAttribute("x2", String(tToX(lt)));
    }

    function nearest(x) {
      const list = listOf(clip0(), path);
      let best = -1;
      let bd = Infinity;
      for (let i = 0; i < list.length; i++) {
        const d = Math.abs(tToX(list[i].t) - x);
        if (d < bd) { bd = d; best = i; }
      }
      return bd <= HIT / 2 + 4 ? best : -1;
    }

    svg.addEventListener("pointerdown", (ev) => {
      const x = svgX(ev);
      const i = nearest(x);
      if (i < 0) {
        /* 空いた所を押す = そこへ打つ */
        addAt(path, xToT(x));
        return;
      }
      drag = i;
      dragT = finite(listOf(clip0(), path)[i].t, 0);
      select(path, i);
      try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* 対応していない環境は無視 */ }
      ev.preventDefault();
      paint();
    });
    svg.addEventListener("pointermove", (ev) => {
      if (drag < 0) return;
      dragT = xToT(svgX(ev));
      paint();
    });
    const up = () => {
      if (drag < 0) return;
      const i = drag;
      drag = -1;
      const cc = clip0();
      if (!cc) { paint(); return; }
      const k = listOf(cc, path)[i];
      if (!k) { paint(); return; }
      if (Math.abs(finite(k.t, 0) - dragT) > tol()) {
        const to = dragT;
        kit.patch("key.update", { clipId: cc.id, path, index: i, to }, { label: "キーフレーム移動" });
        /* 動かすと並び順が変わることがあるので、t から選び直す */
        const ni = listOf(clip0(), path).findIndex((x) => Math.abs(finite(x.t, 0) - to) <= tol() * 2);
        if (ni >= 0) pick = { path, index: ni };
        refresh();
        return;
      }
      paint();
    };
    svg.addEventListener("pointerup", up);
    svg.addEventListener("pointercancel", up);
    svg.addEventListener("dblclick", (ev) => {
      const i = nearest(svgX(ev));
      if (i < 0) return;
      removeOne(path, i);
    });

    lanes.set(path, { paint });
    paint();
    return host;
  }

  /* ── 2.7 選んだキーの編集欄 ─────────────────────────────────── */

  function select(path, index) {
    pick = { path, index };
    try { store.selectKeyframe({ clipId: clip0() ? clip0().id : "", path, index }); } catch (e) { /* 選択の飾りだけ */ }
    buildEdit();
    for (const [, l] of lanes) { try { l.paint(); } catch (e) { /* noop */ } }
  }

  function buildEdit() {
    if (editKit) { try { editKit.dispose(); } catch (e) { /* noop */ } editKit = null; }
    editHost.textContent = "";
    const c = clip0();
    if (!c || !pick) { editHost.append(kit.note("帯の ◆ を押すと、その 1 個の値とイージングを変えられます。")); return; }
    const list = listOf(c, pick.path);
    const k = list[pick.index];
    if (!k) { pick = null; editHost.append(kit.note("選んでいたキーは無くなりました。")); return; }
    editKit = createFieldKit({ store, widgets, clipIds: [c.id], transport });
    const isColor = typeof k.v === "string";
    const at = () => {
      const l2 = listOf(clip0(), pick.path);
      return l2[pick.index] || k;
    };
    const send = (patch, label) => {
      const r = kit.patch("key.update", Object.assign({ clipId: c.id, path: pick.path, index: pick.index }, patch), { label: label || "キーフレーム変更", coalesce: true });
      return r;
    };
    editHost.append(kit.kv("値", pathLabel(pick.path, c), "insp-kf-pickname"));
    editHost.append(editKit.row({
      label: "時間",
      field: editKit.num({
        label: "時間", unit: "秒", min: 0, max: lenOf(c), step: frameDur(fps()), digits: 3,
        get: () => ({ value: finite(at().t, 0), mixed: false }),
        onInput: (v) => send({ to: clamp(v, 0, lenOf(clip0() || c)) }, "キーフレーム移動")
      })
    }));
    if (isColor) {
      editHost.append(editKit.row({
        label: "色",
        field: editKit.col({
          label: "色",
          get: () => ({ value: String(at().v || "#ffffff"), mixed: false }),
          onInput: (v) => send({ v: String(v) }, "キーフレームの色")
        })
      }));
    } else {
      editHost.append(editKit.row({
        label: "値",
        field: editKit.num({
          label: "値", min: -1e6, max: 1e6, step: 0.01, digits: 4,
          get: () => ({ value: finite(at().v, 0), mixed: false }),
          onInput: (v) => send({ v: finite(v, 0) }, "キーフレームの値")
        })
      }));
      editHost.append(kit.btnRow([
        kit.btn("今の値を取り込む", () => {
          const cc = clip0();
          if (!cc) return;
          const cur = sampleClipPath(cc, pick.path, finite(at().t, 0), 0);
          send({ v: typeof cur === "number" ? cur : 0 }, "キーフレームの値");
          refresh();
        }, { cls: "vqs-btn--ghost", title: "その時刻に画面へ出ている値をこのキーへ入れます" })
      ]));
    }
    editHost.append(editKit.row({
      label: "イージング",
      field: editKit.sel({
        label: "イージング", items: EASE_ITEMS.slice(),
        get: () => ({ value: String(at().ease || "linear"), mixed: false }),
        onChange: (v) => { send({ ease: String(v) }, "イージング"); refresh(); }
      }),
      hint: "「段差（保つ）」は次のキーまで値を保ちます（カクッと切り替わります）。"
    }));
    if (String(at().ease) === "bezier") editHost.append(buildBez(c));
    editHost.append(kit.btnRow([
      kit.btn("このキーへ移動", () => {
        const cc = clip0();
        if (!cc) return;
        seek(finite(cc.start, 0) + finite(at().t, 0));
      }, { cls: "vqs-btn--ghost" }),
      kit.btn("このキーを消す", () => removeOne(pick.path, pick.index), { cls: "vqs-btn--danger" })
    ]));
    editKit.update([c.id]);
  }

  /** ベジェの編集（widgets.curveEditor が在ればそれ・無ければ数値 4 つ） */
  function buildBez(c) {
    const box = el("div", "vqs-kfp__bez");
    const cur = () => {
      const l = listOf(clip0() || c, pick.path)[pick.index];
      return bezToPoints(l && l.bez);
    };
    const put = (pts) => {
      kit.patch("key.update", { clipId: c.id, path: pick.path, index: pick.index, ease: "bezier", bez: pointsToBez(pts) }, { label: "イージングの曲線", coalesce: true });
    };
    const made = kit.tryW("curveEditor", { points: cur(), min: 0, max: 1, onChange: put, onInput: put });
    if (made) { box.append(made); return box; }
    /* 控え: x1 y1 x2 y2 を数値で（曲線が描けなくても値は決められる） */
    const names = ["入りの強さ", "入りの高さ", "出の強さ", "出の高さ"];
    for (let i = 0; i < 4; i++) {
      box.append(editKit.row({
        label: names[i],
        field: editKit.sld({
          label: names[i], min: i % 2 === 0 ? 0 : -1, max: i % 2 === 0 ? 1 : 2, step: 0.01, digits: 2,
          get: () => {
            const l = listOf(clip0() || c, pick.path)[pick.index];
            const b = Array.isArray(l && l.bez) && l.bez.length >= 4 ? l.bez : [0.25, 0.1, 0.25, 1];
            return { value: finite(b[i], 0), mixed: false };
          },
          onInput: (v) => {
            const l = listOf(clip0() || c, pick.path)[pick.index];
            const b = (Array.isArray(l && l.bez) && l.bez.length >= 4 ? l.bez.slice(0, 4) : [0.25, 0.1, 0.25, 1]).map((n) => finite(n, 0));
            b[i] = finite(v, 0);
            kit.patch("key.update", { clipId: c.id, path: pick.path, index: pick.index, ease: "bezier", bez: b }, { label: "イージングの曲線", coalesce: true });
          }
        })
      }));
    }
    return box;
  }

  /* ── 2.8 操作 ───────────────────────────────────────────────── */

  const seek = (t) => {
    if (transport && typeof transport.seek === "function") { try { transport.seek(t); return; } catch (e) { /* 下へ */ } }
    store.setView({ playhead: t });
  };

  /** 現在位置（か指した t）に 1 個打つ */
  function addAt(path, t) {
    const c = clip0();
    if (!c) return;
    if (!isKeyablePath(path)) { kit.toast("この値にはキーフレームを打てません", { kind: "error" }); return; }
    const at = t === undefined ? kit.localTime(c) : clamp(finite(t, 0), 0, lenOf(c));
    const r = kit.patch("key.add", { clipId: c.id, path, t: at }, { label: "キーフレーム追加" });
    if (r) {
      refresh();
      const i = listOf(clip0(), path).findIndex((k) => Math.abs(finite(k.t, 0) - finite(r.t, at)) <= tol());
      if (i >= 0) select(path, i);
    }
  }

  function removeOne(path, index) {
    const c = clip0();
    if (!c) return;
    const list = listOf(c, path);
    if (!list[index]) return;
    kit.patch("key.remove", { clipId: c.id, path, index }, { label: "キーフレーム削除" });
    if (pick && pick.path === path) pick = null;
    refresh();
  }

  function removePath(path) {
    const c = clip0();
    if (!c || !listOf(c, path).length) return;
    kit.patch("key.remove", { clipId: c.id, path, all: true }, { label: "キーフレームを全部削除" });
    if (pick && pick.path === path) pick = null;
    refresh();
  }

  function removeAll() {
    const c = clip0();
    if (!c) return;
    const paths = Object.keys(keysOf(c)).filter((p) => listOf(c, p).length);
    if (!paths.length) { kit.toast("消すキーフレームがありません", { kind: "info" }); return; }
    try {
      store.batch("キーフレームを全部削除", (d) => { for (const p of paths) d("key.remove", { clipId: c.id, path: p, all: true }); });
      kit.toast(paths.length + " 種類のキーフレームを消しました", { kind: "success" });
    } catch (e) {
      kit.toast((e && e.message) || "消せませんでした", { kind: "error" });
    }
    pick = null;
    refresh();
  }

  /** 前後のキーへ（今見ている行が在ればその行、無ければ全部から） */
  function jump(dir) {
    const c = clip0();
    if (!c) return;
    const lt = kit.localTime(c);
    const t0 = tol();
    const paths = pick && listOf(c, pick.path).length ? [pick.path] : Object.keys(keysOf(c));
    let best = null;
    for (const p of paths) {
      for (const k of listOf(c, p)) {
        const kt = finite(k.t, 0);
        if (dir > 0 ? kt > lt + t0 : kt < lt - t0) {
          if (best === null || (dir > 0 ? kt < best : kt > best)) best = kt;
        }
      }
    }
    if (best === null) { kit.toast(dir > 0 ? "これより後にキーフレームはありません" : "これより前にキーフレームはありません", { kind: "info" }); return; }
    seek(finite(c.start, 0) + best);
  }

  function copyPath(path) {
    const c = clip0();
    if (!c) return;
    const list = listOf(c, path);
    if (!list.length) return;
    clipboard = { duration: lenOf(c), paths: { [path]: list.map((k) => ({ t: finite(k.t, 0), v: k.v, ease: String(k.ease || "linear"), bez: Array.isArray(k.bez) ? k.bez.slice(0, 4) : null })) } };
    kit.toast(pathLabel(path, c) + " のキーをコピーしました", { kind: "success" });
  }

  function copyAll() {
    const c = clip0();
    if (!c) return;
    const paths = {};
    let n = 0;
    for (const p of Object.keys(keysOf(c))) {
      const list = listOf(c, p);
      if (!list.length) continue;
      paths[p] = list.map((k) => ({ t: finite(k.t, 0), v: k.v, ease: String(k.ease || "linear"), bez: Array.isArray(k.bez) ? k.bez.slice(0, 4) : null }));
      n += list.length;
    }
    if (!n) { kit.toast("コピーするキーフレームがありません", { kind: "info" }); return; }
    clipboard = { duration: lenOf(c), paths };
    kit.toast(n + " 個のキーをコピーしました", { kind: "success" });
  }

  /**
   * コピーしたキーを「選択中の他のクリップ」へ貼る。
   * t は **割合で伸縮**する（尺の違うクリップでも同じ形になる）。
   */
  function paste() {
    if (!clipboard || !clipboard.paths) { kit.toast("先にコピーしてください", { kind: "info" }); return; }
    const src = clip0();
    const targets = kit.clips().filter((c) => !src || c.id !== src.id);
    const list = targets.length ? targets : (src ? [src] : []);
    if (!list.length) { kit.toast("貼る相手がいません（2 つ以上選んでください）", { kind: "info" }); return; }
    const jobs = [];
    for (const c of list) {
      const k = lenOf(c) / Math.max(0.04, finite(clipboard.duration, 1));
      for (const p of Object.keys(clipboard.paths)) {
        if (!isKeyablePath(p)) continue;
        if (p.indexOf("fx.") === 0) continue;         // 効果の id は相手に無い
        if (listOf(c, p).length) jobs.push({ type: "key.remove", payload: { clipId: c.id, path: p, all: true } });
        for (const key of clipboard.paths[p]) {
          const payload = { clipId: c.id, path: p, t: clamp(finite(key.t, 0) * k, 0, lenOf(c)), v: key.v, ease: key.ease };
          if (key.ease === "bezier" && key.bez) payload.bez = key.bez;
          jobs.push({ type: "key.add", payload });
        }
      }
    }
    if (!jobs.length) { kit.toast("貼れるキーフレームがありませんでした", { kind: "info" }); return; }
    try {
      store.batch("キーフレームを貼り付け", (d) => { for (const j of jobs) d(j.type, j.payload); });
      kit.toast(list.length + " 個のクリップへ貼りました", { kind: "success" });
    } catch (e) {
      kit.toast((e && e.message) || "貼れませんでした", { kind: "error" });
    }
    refresh();
  }

  /** 道具: キーを作り直す（同じ path の古いキーは消してから） */
  function makeKeys(jobsFor, label) {
    const list = kit.clips();
    if (!list.length) return;
    const jobs = [];
    for (const c of list) {
      const made = jobsFor(c);
      for (const m of made) {
        if (!isKeyablePath(m.path)) continue;
        if (listOf(c, m.path).length) jobs.push({ type: "key.remove", payload: { clipId: c.id, path: m.path, all: true } });
        for (const k of m.keys) {
          jobs.push({ type: "key.add", payload: { clipId: c.id, path: m.path, t: k.t, v: k.v, ease: k.ease } });
        }
      }
    }
    if (!jobs.length) { kit.toast("この種類のクリップには作れません", { kind: "info" }); return; }
    try {
      store.batch(label, (d) => { for (const j of jobs) d(j.type, j.payload); });
      kit.toast(label + "を作りました", { kind: "success" });
    } catch (e) {
      kit.toast((e && e.message) || "作れませんでした", { kind: "error" });
    }
    pick = null;
    refresh();
  }

  const makeFade = () => makeKeys((c) => [{ path: "opacity", keys: fadeKeys(lenOf(c), { inDur: Math.min(0.5, lenOf(c) / 3), outDur: Math.min(0.5, lenOf(c) / 3) }) }], "フェードイン / アウト");
  const makeZoom = () => makeKeys((c) => (c.kind === "audio" ? [] : [{ path: "transform.scale", keys: zoomKeys(lenOf(c), { from: 1, to: 1.18 }) }]), "ズームイン");
  const makeShake = () => makeKeys((c) => {
    if (c.kind === "audio") return [];
    const s = shakeKeys(lenOf(c), { amount: 0.012, count: 4 });
    return [{ path: "transform.x", keys: s.x }, { path: "transform.y", keys: s.y }];
  }, "揺れ");

  /* ── 2.9 読み直し ──────────────────────────────────────────── */
  function refresh() {
    if (dead) return;
    const sig = sigOfRows();
    if (sig !== rowsSig) {
      rowsSig = sig;
      buildRows();
      buildEdit();
    } else {
      for (const [, l] of lanes) { try { l.paint(); } catch (e) { /* noop */ } }
      if (editKit) editKit.update();
    }
    refillQuick();
    kit.update();
  }
  /** 再生ヘッドの線だけ動かす（軽い） */
  const paintPlayhead = rafThrottle(() => {
    if (dead) return;
    for (const [, l] of lanes) { try { l.paint(); } catch (e) { /* noop */ } }
  });
  let offTime = null;
  if (transport && typeof transport.on === "function") {
    try { offTime = transport.on("time", paintPlayhead); } catch (e) { offTime = null; }
  }

  /* ── 契約の形 ───────────────────────────────────────────────── */
  kit.update(o.clipIds);
  refillQuick();
  rowsSig = sigOfRows();
  buildRows();
  buildEdit();

  return {
    el: root,
    update(ids) {
      kit.update(ids);
      refresh();
    },
    reset() { removeAll(); },
    dispose() {
      dead = true;
      if (typeof offTime === "function") { try { offTime(); } catch (e) { /* noop */ } }
      if (editKit) { try { editKit.dispose(); } catch (e) { /* noop */ } editKit = null; }
      lanes.clear();
      kit.dispose();
      try { root.remove(); } catch (e) { /* noop */ }
    }
  };
}
