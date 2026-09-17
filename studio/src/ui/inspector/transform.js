/* ══════════════════════════════════════════════════════════════════════════
   studio/src/ui/inspector/transform.js — 「変形」タブ

   ★ 何をする所か
     選択クリップの `clip.transform`（位置・拡大・回転・反転・基準点・クロップ）と
     `clip.opacity` / `clip.blend` を触る所。Premiere の「モーション」＋
     「不透明度」、CapCut の「変形」に当たる。整列とプリセット
     （画面に合わせる / 画面を埋める / 元の大きさ / 9:16 に切り抜く）も持つ。

   ★ なぜこの形か
     ・値は **必ず ops 経由**（`clip.setTransform` / `clip.update`）。patch は
       深く重なる（core/ops.js の mergeInto）ので `{ crop: { t: 0.1 } }` の
       ような部分更新がそのまま効く。
     ・触っている間は kit.driver が rAF で間引き、離したら 1 回 commit する。
       `{ coalesce: true }` を付けているので store 側で 1 undo にまとまる。
     ・複数選択では「共通の値だけ出し、違えば —」（kit.read が mixed を返す）。
       書き込みは選択全部へ同じ値を当てる（プロ機と同じ作法）。
     ・整列とプリセットは **素材の寸法とプロジェクトの寸法から計算**する。
       engine がまだ無いので、ここでの単位の約束を下の CONTRACT-NOTE に
       明記しておき、engine 側がそれに合わせる（食い違ったら検収で直す）。

   ★ 触るときの注意
     ・クロップは 0..1 の割合で、schema が l+r <= 0.98 に丸める。UI 側でも
       98% で止めているが、最後の砦は schema（そこは信じてよい）。
     ・回転ダイヤルは Pointer Events のみ（touch/mouse を混ぜない）。
       touch-action は CSS 担当へ（vqs-dial に `touch-action:none` が要る）。

   CONTRACT-NOTE: 契約書 §1 は `transform.x/y` と `scale` の **単位**を
     定めていない。engine が未着なので、ここでは次の約束で実装した:
       ・x / y … 画面の幅 / 高さに対する割合。0 = 中央、+x = 右、+y = 下。
                 UI は % 表示（×100）。
       ・scale 1 … 素材を画面に **収めた**（contain した）大きさ。
                 これなら縦動画を横プロジェクトに入れても既定で全部見える。
     engine/compositor.js がこれと違う約束で描くなら、下の `frameFit()` と
     整列・プリセットの計算だけを直せば済むようにまとめてある。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

import { createFieldKit, el, fmtNum } from "./index.js";
import { clamp, finite, isTouch } from "../../core/util.js";
import { assetById, defaultTransform, BLEND_MODES } from "../../core/schema.js";

/** ブレンドモードの日本語（内部名は英語のまま。契約書 §1 の並び順） */
const BLEND_LABELS = {
  normal: "通常", add: "加算", screen: "スクリーン", multiply: "乗算",
  overlay: "オーバーレイ", softlight: "ソフトライト", difference: "差の絶対値",
  lighten: "比較（明）", darken: "比較（暗）"
};

/** 基準点の 9 マス（左上から右下へ） */
const ANCHORS = [
  { x: 0, y: 0, label: "左上" }, { x: 0.5, y: 0, label: "上" }, { x: 1, y: 0, label: "右上" },
  { x: 0, y: 0.5, label: "左" }, { x: 0.5, y: 0.5, label: "中央" }, { x: 1, y: 0.5, label: "右" },
  { x: 0, y: 1, label: "左下" }, { x: 0.5, y: 1, label: "下" }, { x: 1, y: 1, label: "右下" }
];

/* ── 寸法の計算（ここだけが engine の約束に触れる）───────────────── */

/**
 * クリップ 1 個ぶんの「画面と素材の寸法」を出す。
 * @returns {{W:number,H:number,aw:number,ah:number,k:number,dispW:number,dispH:number}}
 */
export function frameFit(project, clip, asset) {
  const s = (project && project.settings) || {};
  const W = Math.max(2, finite(s.width, 1920));
  const H = Math.max(2, finite(s.height, 1080));
  let aw = finite(asset && asset.width, 0);
  let ah = finite(asset && asset.height, 0);
  /* 90/270 度で撮った素材は縦横が入れ替わって届く（iPhone の縦撮り） */
  const rot = finite(asset && asset.rotation, 0);
  if (rot === 90 || rot === 270) { const t = aw; aw = ah; ah = t; }
  if (!(aw > 0) || !(ah > 0)) { aw = W; ah = H; }        // 素材の寸法が不明なら画面と同じと見なす
  const k = Math.min(W / aw, H / ah);                    // scale 1 = contain
  return { W, H, aw, ah, k, dispW: aw * k, dispH: ah * k };
}

/** crop を織り込んだ「今、画面に出ている大きさ」（画面に対する割合） */
function shownSize(fit, tr) {
  const cr = (tr && tr.crop) || {};
  const kw = Math.max(0.02, 1 - finite(cr.l, 0) - finite(cr.r, 0));
  const kh = Math.max(0.02, 1 - finite(cr.t, 0) - finite(cr.b, 0));
  const sx = finite(tr && tr.scale, 1) * finite(tr && tr.scaleX, 1);
  const sy = finite(tr && tr.scale, 1) * finite(tr && tr.scaleY, 1);
  return { w: (fit.dispW * kw * sx) / fit.W, h: (fit.dispH * kh * sy) / fit.H };
}

/** 「画面を埋める」ときの scale（crop も織り込む） */
function fillScale(fit, tr) {
  const cr = (tr && tr.crop) || {};
  const kw = Math.max(0.02, 1 - finite(cr.l, 0) - finite(cr.r, 0));
  const kh = Math.max(0.02, 1 - finite(cr.t, 0) - finite(cr.b, 0));
  const sx = Math.abs(finite(tr && tr.scaleX, 1)) || 1;
  const sy = Math.abs(finite(tr && tr.scaleY, 1)) || 1;
  return clamp(Math.max(fit.W / (fit.dispW * kw * sx), fit.H / (fit.dispH * kh * sy)), 0.01, 100);
}

/**
 * 指した比率で素材を切り抜く crop（中央基準）。
 * @param {number} ratio 幅 / 高さ（9:16 なら 9/16）
 */
export function cropForRatio(fit, ratio) {
  const r = finite(ratio, 1);
  if (!(r > 0)) return { l: 0, t: 0, r: 0, b: 0 };
  const srcAR = fit.aw / fit.ah;
  const out = { l: 0, t: 0, r: 0, b: 0 };
  if (srcAR > r) {
    const keep = clamp(r / srcAR, 0.02, 1);
    const cut = (1 - keep) / 2;
    out.l = cut;
    out.r = cut;
  } else if (srcAR < r) {
    const keep = clamp(srcAR / r, 0.02, 1);
    const cut = (1 - keep) / 2;
    out.t = cut;
    out.b = cut;
  }
  return out;
}

/* ── 本体 ───────────────────────────────────────────────────────── */

/**
 * 「変形」タブ。
 * @param {{store:Object, widgets?:Object, clipIds:string[], transport?:Object, ctx?:Object}} o
 * @returns {{el:HTMLElement, update:Function, dispose:Function, reset:Function}}
 */
export function createTransformPanel(o) {
  const store = o.store;
  const kit = createFieldKit({ store, widgets: o.widgets, clipIds: o.clipIds, transport: o.transport });
  const ctx = o.ctx || null;
  const root = el("div", "vqs-tf");

  /* ── 書き込みの口 ─────────────────────────────────────────────── */
  /** transform の枝を部分的に当てる（1 操作 1 undo） */
  const setT = (patch, label) =>
    kit.patchAll("clip.setTransform", { patch }, { label: label || "変形", coalesce: true });
  /** clip 自体の値（不透明度・ブレンド） */
  const setC = (patch, label) => kit.patchAll("clip.update", { patch }, { label: label || "変更", coalesce: true });

  /** 先頭クリップの transform（無ければ既定） */
  const tr0 = () => {
    const list = kit.clips();
    return (list[0] && list[0].transform) || defaultTransform();
  };
  /** 先頭クリップの寸法計算 */
  const fit0 = () => {
    const list = kit.clips();
    const c = list[0] || null;
    return frameFit(store.project, c, c ? assetById(store.project, c.assetId) : null);
  };

  /* ── 1. 位置・拡大・回転 ─────────────────────────────────────── */
  const secMotion = kit.section({ title: "位置と大きさ", id: "motion" });

  const fx = kit.num({
    label: "X", unit: "%", min: -400, max: 400, step: 0.5, digits: 1, scale: 100,
    get: () => kit.read((c) => finite(c.transform && c.transform.x, 0)),
    onInput: (v) => setT({ x: v }, "位置")
  });
  const fy = kit.num({
    label: "Y", unit: "%", min: -400, max: 400, step: 0.5, digits: 1, scale: 100,
    get: () => kit.read((c) => finite(c.transform && c.transform.y, 0)),
    onInput: (v) => setT({ y: v }, "位置")
  });
  const posRow = el("div", "vqs-insp-row vqs-tf__pos");
  posRow.append(kit.keyframeMark("transform.x", "位置 X"));
  const posCtl = el("div", "vqs-insp-row__ctl vqs-tf__pair");
  posCtl.append(fx.el, fy.el);
  posRow.append(posCtl);
  secMotion.body.append(posRow);
  secMotion.add(
    kit.row({
      label: "拡大", path: "transform.scale",
      field: kit.sld({
        label: "拡大", unit: "%", min: 1, max: 500, step: 1, digits: 1, scale: 100, center: 100,
        get: () => kit.read((c) => finite(c.transform && c.transform.scale, 1)),
        onInput: (v) => setT({ scale: clamp(v, 0.01, 5) }, "拡大")
      }),
      onReset: () => setT({ scale: 1 }, "拡大を戻す")
    }),
    kit.row({
      label: "横だけ", path: "transform.scaleX",
      field: kit.sld({
        label: "横だけ", unit: "%", min: 1, max: 500, step: 1, digits: 1, scale: 100, center: 100,
        get: () => kit.read((c) => finite(c.transform && c.transform.scaleX, 1)),
        onInput: (v) => setT({ scaleX: clamp(v, 0.01, 5) }, "横の拡大")
      }),
      onReset: () => setT({ scaleX: 1 }, "横の拡大を戻す")
    }),
    kit.row({
      label: "縦だけ", path: "transform.scaleY",
      field: kit.sld({
        label: "縦だけ", unit: "%", min: 1, max: 500, step: 1, digits: 1, scale: 100, center: 100,
        get: () => kit.read((c) => finite(c.transform && c.transform.scaleY, 1)),
        onInput: (v) => setT({ scaleY: clamp(v, 0.01, 5) }, "縦の拡大")
      }),
      onReset: () => setT({ scaleY: 1 }, "縦の拡大を戻す")
    })
  );

  /* 回転はダイヤル + 数値の 2 本立て（指でも正確に合わせられるように） */
  const rotDrv = kit.driver({
    label: "回転",
    apply: (v) => setT({ rotate: clamp(v, -180, 180) }, "回転")
  });
  const dial = makeDial({
    label: "回転",
    onInput: (deg) => rotDrv.input(deg),
    onEnd: () => rotDrv.end(),
    onReset: () => { setT({ rotate: 0 }, "回転を戻す"); }
  });
  kit.addField({
    el: dial.el,
    set(v, mixed) { dial.set(mixed ? 0 : finite(v, 0), mixed); },
    refresh() { const r = kit.read((c) => finite(c.transform && c.transform.rotate, 0)); dial.set(finite(r.value, 0), r.mixed); }
  });
  const rotNum = kit.num({
    label: "度", unit: "°", min: -180, max: 180, step: 1, digits: 1, scale: 1,
    get: () => kit.read((c) => finite(c.transform && c.transform.rotate, 0)),
    onInput: (v) => setT({ rotate: clamp(v, -180, 180) }, "回転")
  });
  const rotRow = el("div", "vqs-insp-row vqs-tf__rot");
  rotRow.append(kit.keyframeMark("transform.rotate", "回転"));
  const rotCtl = el("div", "vqs-insp-row__ctl vqs-tf__pair");
  rotCtl.append(dial.el, rotNum.el);
  rotRow.append(rotCtl);
  secMotion.body.append(rotRow);

  /* 反転 */
  const flipH = kit.tog({
    label: "左右反転",
    get: () => kit.read((c) => !!(c.transform && c.transform.flipH)),
    onChange: (v) => setT({ flipH: !!v }, "左右反転")
  });
  const flipV = kit.tog({
    label: "上下反転",
    get: () => kit.read((c) => !!(c.transform && c.transform.flipV)),
    onChange: (v) => setT({ flipV: !!v }, "上下反転")
  });
  secMotion.add(kit.row({ label: "反転", node: kit.btnRow([flipH.el, flipV.el], "vqs-tf__flips") }));
  root.append(secMotion.el);

  /* ── 2. 不透明度とブレンド ──────────────────────────────────── */
  const secMix = kit.section({ title: "不透明度と重ね方", id: "mix" });
  secMix.add(
    kit.row({
      label: "不透明度", path: "opacity",
      field: kit.sld({
        label: "不透明度", unit: "%", min: 0, max: 100, step: 1, digits: 0, scale: 100, center: 100,
        get: () => kit.read((c) => clamp(finite(c.opacity, 1), 0, 1)),
        onInput: (v) => setC({ opacity: clamp(v, 0, 1) }, "不透明度")
      }),
      onReset: () => setC({ opacity: 1 }, "不透明度を戻す")
    }),
    kit.row({
      label: "重ね方",
      field: kit.sel({
        label: "重ね方",
        items: BLEND_MODES.map((m) => ({ value: m, label: BLEND_LABELS[m] || m })),
        get: () => kit.read((c) => String(c.blend || "normal")),
        onChange: (v) => setC({ blend: String(v) }, "重ね方")
      })
    })
  );
  root.append(secMix.el);

  /* ── 3. クロップ ────────────────────────────────────────────── */
  const secCrop = kit.section({ title: "切り抜き（クロップ）", id: "crop", open: false });
  const cropField = (key, label) => kit.row({
    label,
    field: kit.num({
      label, unit: "%", min: 0, max: 98, step: 0.5, digits: 1, scale: 100,
      get: () => kit.read((c) => clamp(finite(c.transform && c.transform.crop && c.transform.crop[key], 0), 0, 1)),
      onInput: (v) => setT({ crop: { [key]: clamp(v, 0, 0.98) } }, "切り抜き")
    }),
    onReset: () => setT({ crop: { [key]: 0 } }, "切り抜きを戻す")
  });
  secCrop.add(cropField("t", "上"), cropField("b", "下"), cropField("l", "左"), cropField("r", "右"));
  secCrop.add(kit.btnRow([
    kit.btn("プレビュー上で切り抜く", () => enterCropMode(), { test: "insp-crop-mode", title: "プレビューの上で枠を掴んで切り抜きます" }),
    kit.btn("切り抜きを解除", () => setT({ crop: { l: 0, t: 0, r: 0, b: 0 } }, "切り抜きを解除"))
  ]));
  root.append(secCrop.el);

  /* ── 4. 基準点 ──────────────────────────────────────────────── */
  const secAnchor = kit.section({ title: "基準点", id: "anchor", open: false });
  const anchor = makeAnchorGrid({
    onPick: (a) => setT({ anchorX: a.x, anchorY: a.y }, "基準点")
  });
  kit.addField({
    el: anchor.el,
    set() { /* refresh から呼ぶ */ },
    refresh() {
      const rx = kit.read((c) => finite(c.transform && c.transform.anchorX, 0.5));
      const ry = kit.read((c) => finite(c.transform && c.transform.anchorY, 0.5));
      anchor.set(finite(rx.value, 0.5), finite(ry.value, 0.5), rx.mixed || ry.mixed);
    }
  });
  secAnchor.add(anchor.el, kit.note("回転と拡大の中心になる点です。既定は中央。"));
  root.append(secAnchor.el);

  /* ── 5. 整列 ────────────────────────────────────────────────── */
  const secAlign = kit.section({ title: "整列", id: "align" });
  secAlign.add(kit.btnRow([
    kit.btn("中央", () => align("center"), { test: "insp-align-center" }),
    kit.btn("左", () => align("left")),
    kit.btn("右", () => align("right")),
    kit.btn("上", () => align("top")),
    kit.btn("下", () => align("bottom"))
  ], "vqs-tf__aligns"));
  root.append(secAlign.el);

  /* ── 6. プリセット ──────────────────────────────────────────── */
  const secPreset = kit.section({ title: "よく使う形", id: "preset" });
  secPreset.add(kit.btnRow([
    kit.btn("画面に合わせる", () => preset("fit"), { cls: "vqs-btn--ghost", test: "insp-preset-fit" }),
    kit.btn("画面を埋める", () => preset("fill"), { test: "insp-preset-fill" }),
    kit.btn("元の大きさ", () => preset("actual")),
    kit.btn("9:16 に切り抜く", () => preset("9:16"), { test: "insp-preset-916" })
  ], "vqs-insp-presets"));
  secPreset.add(kit.note("「画面を埋める」は縦横比を保ったまま、はみ出す分を切らずに拡大します（切りたいときは切り抜きを使います）。"));
  root.append(secPreset.el);

  /* ── 整列とプリセットの中身 ─────────────────────────────────── */
  function align(where) {
    kit.eachClip("整列", (c) => {
      const fit = frameFit(store.project, c, assetById(store.project, c.assetId));
      const size = shownSize(fit, c.transform || defaultTransform());
      const patch = {};
      if (where === "center") { patch.x = 0; patch.y = 0; }
      if (where === "left") patch.x = -(1 - size.w) / 2;
      if (where === "right") patch.x = (1 - size.w) / 2;
      if (where === "top") patch.y = -(1 - size.h) / 2;
      if (where === "bottom") patch.y = (1 - size.h) / 2;
      return { type: "clip.setTransform", payload: { clipId: c.id, patch } };
    });
  }

  function preset(kind) {
    const label = kind === "9:16" ? "9:16 に切り抜く" : kind === "fill" ? "画面を埋める" : kind === "actual" ? "元の大きさ" : "画面に合わせる";
    const make = (c) => {
      const fit = frameFit(store.project, c, assetById(store.project, c.assetId));
      const tr = c.transform || defaultTransform();
      if (kind === "fit") return { x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, crop: { l: 0, t: 0, r: 0, b: 0 } };
      if (kind === "fill") return { x: 0, y: 0, scaleX: 1, scaleY: 1, scale: fillScale(fit, Object.assign({}, tr, { scaleX: 1, scaleY: 1 })) };
      if (kind === "actual") return { x: 0, y: 0, scaleX: 1, scaleY: 1, scale: clamp(1 / (fit.k || 1), 0.01, 100) };
      /* 9:16: まず素材を 9:16 に切り抜き、その窓で画面を埋める */
      const crop = cropForRatio(fit, 9 / 16);
      const withCrop = Object.assign({}, tr, { crop, scaleX: 1, scaleY: 1 });
      return { x: 0, y: 0, scaleX: 1, scaleY: 1, crop, scale: fillScale(fit, withCrop) };
    };
    kit.eachClip(label, (c) => ({ type: "clip.setTransform", payload: { clipId: c.id, patch: make(c) } }));
  }

  /** プレビュー上の切り抜き操作へ渡す（preview.js が在れば） */
  function enterCropMode() {
    const p = ctx && (ctx.preview || (ctx.app && ctx.app.parts && ctx.app.parts.preview));
    const ids = kit.clips().map((c) => c.id);
    if (p && typeof p.setMode === "function") { p.setMode("crop", { clipIds: ids }); return; }
    if (p && typeof p.startCrop === "function") { p.startCrop({ clipIds: ids }); return; }
    kit.toast("プレビュー上の切り抜きはまだ使えません。上の数値で調整してください。", { kind: "info" });
  }

  /* ── 一覧の外（情報）──────────────────────────────────────────── */
  const info = el("div", "vqs-tf__info");
  root.append(info);
  function renderInfo() {
    const list = kit.clips();
    info.textContent = "";
    if (list.length !== 1) return;
    const fit = fit0();
    const size = shownSize(fit, tr0());
    info.append(kit.kv("素材の寸法", fit.aw + " × " + fit.ah, "insp-tf-src"));
    info.append(kit.kv("画面に出る大きさ", fmtNum(size.w * 100, 0) + "% × " + fmtNum(size.h * 100, 0) + "%", "insp-tf-shown"));
  }

  /* ── 契約の形 ─────────────────────────────────────────────────── */
  kit.update(o.clipIds);
  renderInfo();

  return {
    el: root,
    update(ids) { kit.update(ids); renderInfo(); },
    reset() {
      const d = defaultTransform();
      kit.patchAll("clip.setTransform", { patch: d }, { label: "変形を既定へ戻す" });
      kit.patchAll("clip.update", { patch: { opacity: 1, blend: "normal" } }, { label: "変形を既定へ戻す" });
      kit.update();
      renderInfo();
    },
    dispose() {
      kit.dispose();
      try { root.remove(); } catch (e) { /* noop */ }
    }
  };
}

/* ── 部品: 回転ダイヤル ─────────────────────────────────────────────
   widgets には回転専用の部品が無い（契約書 §7.3）。角度は「掴んで回す」方が
   速いので自前で持つ。当たり判定は 56px（44px 以上の約束）。 */

/**
 * @param {{label?:string,onInput:(deg:number)=>void,onEnd:Function,onReset:Function}} c
 */
export function makeDial(c) {
  const SIZE = 56;
  const host = el("div", "vqs-dial");
  host.style.width = SIZE + "px";
  host.style.height = SIZE + "px";
  host.style.touchAction = "none";           // CSS 担当へ: vqs-dial に同じ指定を
  host.setAttribute("role", "slider");
  host.setAttribute("tabindex", "0");
  host.setAttribute("aria-label", c.label || "回転");
  host.setAttribute("aria-valuemin", "-180");
  host.setAttribute("aria-valuemax", "180");
  host.title = "掴んで回す（Shift で 1 度ずつ・ダブルクリックで 0°）";

  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 56 56");
  svg.setAttribute("class", "vqs-dial__face");
  svg.setAttribute("aria-hidden", "true");
  svg.style.width = "100%";
  svg.style.height = "100%";
  const ring = document.createElementNS(NS, "circle");
  ring.setAttribute("cx", "28");
  ring.setAttribute("cy", "28");
  ring.setAttribute("r", "22");
  ring.setAttribute("fill", "none");
  ring.setAttribute("stroke", "currentColor");
  ring.setAttribute("stroke-opacity", "0.35");
  ring.setAttribute("stroke-width", "2");
  const hand = document.createElementNS(NS, "line");
  hand.setAttribute("x1", "28");
  hand.setAttribute("y1", "28");
  hand.setAttribute("x2", "28");
  hand.setAttribute("y2", "8");
  hand.setAttribute("stroke", "currentColor");
  hand.setAttribute("stroke-width", "2.5");
  hand.setAttribute("stroke-linecap", "round");
  hand.setAttribute("class", "vqs-dial__hand");
  const dot = document.createElementNS(NS, "circle");
  dot.setAttribute("cx", "28");
  dot.setAttribute("cy", "28");
  dot.setAttribute("r", "2.5");
  dot.setAttribute("fill", "currentColor");
  svg.append(ring, hand, dot);
  host.append(svg);

  let deg = 0;
  let dragging = false;

  function paint(mixed) {
    hand.setAttribute("transform", `rotate(${finite(deg, 0)} 28 28)`);
    host.setAttribute("aria-valuenow", String(Math.round(finite(deg, 0))));
    host.classList.toggle("vqs-field--mixed", !!mixed);
  }
  function angleFrom(ev) {
    const r = host.getBoundingClientRect();
    const dx = ev.clientX - (r.left + r.width / 2);
    const dy = ev.clientY - (r.top + r.height / 2);
    let a = (Math.atan2(dx, -dy) * 180) / Math.PI;     // 上を 0 度・時計回りが +
    if (a > 180) a -= 360;
    if (a < -180) a += 360;
    return a;
  }
  host.addEventListener("pointerdown", (ev) => {
    dragging = true;
    try { host.setPointerCapture(ev.pointerId); } catch (e) { /* 対応していない環境は無視 */ }
    ev.preventDefault();
  });
  host.addEventListener("pointermove", (ev) => {
    if (!dragging) return;
    let a = angleFrom(ev);
    if (ev.shiftKey) a = Math.round(a);
    else a = Math.round(a / 5) * 5;                    // 既定は 5 度刻み（指でも合わせやすい）
    deg = clamp(a, -180, 180);
    paint(false);
    c.onInput(deg);
  });
  const up = () => { if (!dragging) return; dragging = false; c.onEnd(); };
  host.addEventListener("pointerup", up);
  host.addEventListener("pointercancel", up);
  host.addEventListener("dblclick", () => { deg = 0; paint(false); c.onReset(); });
  host.addEventListener("keydown", (ev) => {
    const d = ev.key === "ArrowRight" || ev.key === "ArrowUp" ? 1 : ev.key === "ArrowLeft" || ev.key === "ArrowDown" ? -1 : 0;
    if (!d) return;
    ev.preventDefault();
    deg = clamp(deg + d * (ev.shiftKey ? 15 : 1), -180, 180);
    paint(false);
    c.onInput(deg);
    c.onEnd();
  });
  paint(false);
  return {
    el: host,
    set(v, mixed) { if (!dragging) { deg = clamp(finite(v, 0), -180, 180); paint(mixed); } }
  };
}

/* ── 部品: 基準点の 9 マス ─────────────────────────────────────── */

/** @param {{onPick:(a:{x:number,y:number})=>void}} c */
export function makeAnchorGrid(c) {
  const host = el("div", "vqs-anchor");
  host.setAttribute("role", "group");
  host.setAttribute("aria-label", "基準点");
  /* CSS がまだ無くても 3 列に並ぶように（最小限だけ inline） */
  host.style.display = "grid";
  host.style.gridTemplateColumns = "repeat(3, minmax(0, 1fr))";
  host.style.maxWidth = isTouch() ? "168px" : "132px";
  const cells = [];
  for (const a of ANCHORS) {
    const b = el("button", "vqs-anchor__cell");
    b.type = "button";
    b.title = a.label;
    b.setAttribute("aria-label", a.label);
    b.setAttribute("data-anchor", a.x + "," + a.y);
    b.style.minWidth = isTouch() ? "44px" : "36px";
    b.style.minHeight = isTouch() ? "44px" : "36px";
    b.append(el("span", "vqs-anchor__dot"));
    b.addEventListener("click", () => c.onPick(a));
    host.append(b);
    cells.push({ a, b });
  }
  return {
    el: host,
    set(x, y, mixed) {
      for (const { a, b } of cells) {
        const on = !mixed && Math.abs(a.x - finite(x, 0.5)) < 0.01 && Math.abs(a.y - finite(y, 0.5)) < 0.01;
        b.classList.toggle("vqs-anchor__cell--on", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      }
      host.classList.toggle("vqs-field--mixed", !!mixed);
    }
  };
}
