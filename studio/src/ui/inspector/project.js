/* ══════════════════════════════════════════════════════════════════════════
   studio/src/ui/inspector/project.js — 「プロジェクト」タブ

   ★ 何をする所か
     作品ぜんたいの設定。比率・解像度・fps・背景（色 / ぼかし / 画像）・
     セーフエリア表示・吸着・磁着・既定の遷移時間・既定のテロップ様式・
     自動保存の様子・素材の使用量・プロジェクトの複製と名前変更。
     Premiere の「シーケンス設定」＋ CapCut の「比率」に当たる所で、
     **クリップを選んでいなくても開ける**（選択なしのときの既定のタブ）。

   ★ なぜこの形か
     ・寸法は `settings.update` に **ratio だけ**渡すと ops が既定の寸法を
       入れてくれる（core/ops.js の opSettingsUpdate）。解像度を選んだ時は
       width/height を明に渡す。偶数丸めは ops 側が最後にやる。
     ・使用量は `persist.estimate()`（契約書 §3）。storage が無い環境
       （IndexedDB が使えない / まだ開けていない）でも画面が壊れないよう、
       在るときだけ出して、無ければ「—」に留める。
     ・自動保存の状態は ui/app.js が #saveState の文字を書き換えるので、
       その要素を **MutationObserver で見る**。二重に持つと必ずずれる。

   ★ 触るときの注意
     ・比率 "custom" のときだけ幅と高さを直接触れる（それ以外は ratio が
       寸法を決める。両方から書くと食い違う）。
     ・背景画像は project.assets の image だけを候補にする。消えた素材を
       指したままにしても normalizeProject が null に落とす（そこは安心）。

   CONTRACT-NOTE: 「既定の遷移時間」は契約書 §1 の settings に置き場が無く、
     normalizeProject が知らないキーを落とすため、**localStorage の
     `vqstudio.defaults.transition` に持つ**（分割線の幅と同じ扱い＝
     画面の好み）。遷移を挿す担当（timeline / commands）は同じキーを読む。
   CONTRACT-NOTE: 「既定のテロップ様式」は置き場が在る（project.subtitleStyle）
     が、それを書く op が契約書 §3 に無い。op を増やすのは core 担当の
     仕事なので、ここでは `store.replace(snapshot, label)`（契約書 §3 に
     在る・1 取消単位）で書いた。`subtitle.setStyle` が増えたらそちらへ移す。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

import { createFieldKit, el } from "./index.js";
import { clamp, finite, formatBytes, uid } from "../../core/util.js";
import { RATIOS, defaultTextStyle } from "../../core/schema.js";
import { humanDuration } from "../../core/time.js";

/** 比率の並び（RATIOS の順。"custom" は最後に「自由」として出す） */
const RATIO_ITEMS = [
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
  { value: "1:1", label: "1:1" },
  { value: "4:5", label: "4:5" },
  { value: "4:3", label: "4:3" },
  { value: "2.35:1", label: "2.35:1" },
  { value: "custom", label: "自由" }
];

/** 解像度の段（短い方の辺を基準にする。縦動画でも同じ言い方になる） */
const RES_STEPS = [2160, 1440, 1080, 720, 480];

/** fps の段（契約書 §11 の書き出しと同じ並び） */
const FPS_STEPS = [24, 25, 30, 50, 60];

/** 既定のテロップ様式（字幕の見た目。project.subtitleStyle へ入れる） */
export const CAPTION_PRESETS = [
  { id: "plain", label: "標準", style: { size: 56, weight: 700, color: "#ffffff", stroke: { width: 0, color: "#000000" }, shadow: { x: 0, y: 3, blur: 10, color: "#000000aa" }, bg: null } },
  { id: "outline", label: "白フチ太字", style: { size: 60, weight: 800, color: "#ffffff", stroke: { width: 6, color: "#000000" }, shadow: { x: 0, y: 0, blur: 0, color: "#00000000" }, bg: null } },
  { id: "band", label: "黒帯", style: { size: 48, weight: 700, color: "#ffffff", stroke: { width: 0, color: "#000000" }, shadow: { x: 0, y: 0, blur: 0, color: "#00000000" }, bg: { color: "#000000cc", pad: 18, radius: 10 } } },
  { id: "pop", label: "ポップ", style: { size: 64, weight: 900, color: "#fff45a", stroke: { width: 8, color: "#2a1a00" }, shadow: { x: 0, y: 6, blur: 0, color: "#2a1a00" }, bg: null } },
  { id: "news", label: "ニュース", style: { size: 44, weight: 700, color: "#ffffff", stroke: { width: 0, color: "#000000" }, shadow: { x: 0, y: 2, blur: 6, color: "#000000cc" }, bg: { color: "#0b2f6bdd", pad: 14, radius: 4 } } }
];

/** 画面の好み（プロジェクトに置き場が無いもの）の保管キー */
export const DEFAULTS_KEYS = Object.freeze({
  transition: "vqstudio.defaults.transition",
  caption: "vqstudio.defaults.captionStyle"
});

/** 比率から「その解像度の段」の寸法を出す */
export function sizeForStep(ratio, step) {
  const base = RATIOS[ratio] || RATIOS["16:9"];
  const ar = base.w / base.h;
  const s = Math.max(120, finite(step, 1080));
  if (ar >= 1) return { w: Math.round(s * ar), h: s };      // 横長 … 高さを段に合わせる
  return { w: s, h: Math.round(s / ar) };                    // 縦長 … 幅を段に合わせる
}

/* ── 本体 ───────────────────────────────────────────────────────── */

/**
 * 「プロジェクト」タブ。
 * @param {{store:Object, widgets?:Object, clipIds?:string[], transport?:Object, ctx?:Object}} o
 * @returns {{el:HTMLElement, update:Function, dispose:Function}}
 */
export function createProjectPanel(o) {
  const store = o.store;
  const kit = createFieldKit({ store, widgets: o.widgets, clipIds: o.clipIds || [], transport: o.transport });
  const ctx = o.ctx || null;
  const root = el("div", "vqs-prj");

  /** 保管庫（persist）。無い環境でも画面は成立させる */
  const storage = (ctx && ctx.storage)
    || (typeof window !== "undefined" && window.VQSTUDIO ? window.VQSTUDIO.storage : null)
    || null;

  const S = () => (store.project && store.project.settings) || {};
  const setS = (patch, label) => kit.patch("settings.update", { patch }, { label: label || "プロジェクト設定", coalesce: true });
  const one = (v) => ({ value: v, mixed: false });

  /* ── 1. 名前 ────────────────────────────────────────────────── */
  const secName = kit.section({ title: "プロジェクト", id: "prjname" });
  const nameInput = el("input", "vqs-prj__name");
  nameInput.type = "text";
  nameInput.setAttribute("aria-label", "プロジェクト名");
  nameInput.setAttribute("data-test", "insp-prj-name");
  nameInput.maxLength = 200;
  nameInput.style.minHeight = "44px";
  nameInput.addEventListener("change", () => {
    const v = nameInput.value.trim();
    if (!v) { nameInput.value = String(store.project.name || ""); return; }
    kit.patch("project.rename", { name: v }, { label: "名前を変える" });
  });
  nameInput.addEventListener("keydown", (ev) => { if (ev.key === "Enter") nameInput.blur(); });
  kit.addField({ el: nameInput, set() { }, refresh() { if (document.activeElement !== nameInput) nameInput.value = String(store.project.name || ""); } });
  secName.add(kit.row({ label: "名前", node: nameInput }));
  secName.add(kit.btnRow([
    kit.btn("この作品を複製する", () => duplicate(), { test: "insp-prj-dup" })
  ]));
  root.append(secName.el);

  /* ── 2. 比率・解像度・fps ───────────────────────────────────── */
  const secSize = kit.section({ title: "比率と解像度", id: "prjsize" });

  const ratioField = kit.seg({
    label: "比率",
    items: RATIO_ITEMS,
    get: () => one(String(S().ratio || "16:9")),
    onChange: (v) => { setS({ ratio: String(v) }, "比率"); kit.update(); renderSizeState(); }
  });
  secSize.add(kit.row({ label: "比率", field: ratioField }));

  const resField = kit.sel({
    label: "解像度",
    items: RES_STEPS.map((s) => ({ value: String(s), label: s + "p" })).concat([{ value: "custom", label: "任意（下で指定）" }]),
    get: () => {
      const s = S();
      const short = Math.min(finite(s.width, 1920), finite(s.height, 1080));
      const hit = RES_STEPS.find((x) => Math.abs(x - short) <= 8);
      return one(hit ? String(hit) : "custom");
    },
    onChange: (v) => {
      if (v === "custom") { kit.toast("下の幅と高さで指定できます", { kind: "info" }); return; }
      const size = sizeForStep(String(S().ratio || "16:9"), Number(v));
      setS({ width: size.w, height: size.h }, "解像度");
      kit.update();
    }
  });
  secSize.add(kit.row({ label: "解像度", field: resField }));

  const wField = kit.num({
    label: "幅", unit: "px", min: 16, max: 7680, step: 2, digits: 0,
    get: () => one(finite(S().width, 1920)),
    onInput: (v) => setS({ width: Math.round(clamp(v, 16, 7680)) }, "幅")
  });
  const hField = kit.num({
    label: "高さ", unit: "px", min: 16, max: 7680, step: 2, digits: 0,
    get: () => one(finite(S().height, 1080)),
    onInput: (v) => setS({ height: Math.round(clamp(v, 16, 7680)) }, "高さ")
  });
  const sizeRow = kit.row({ label: "寸法", node: kit.btnRow([wField.el, hField.el], "vqs-prj__pair") });
  secSize.add(sizeRow);
  const sizeHint = kit.note("");
  secSize.body.append(sizeHint);

  const fpsField = kit.seg({
    label: "fps",
    items: FPS_STEPS.map((f) => ({ value: String(f), label: String(f) })),
    get: () => {
      const f = Math.round(finite(S().fps, 30));
      return { value: String(f), mixed: FPS_STEPS.indexOf(f) < 0 };
    },
    onChange: (v) => { setS({ fps: Number(v) }, "fps"); kit.update(); }
  });
  secSize.add(kit.row({ label: "fps", field: fpsField }));
  const fpsNum = kit.num({
    label: "任意の fps", unit: "fps", min: 1, max: 240, step: 1, digits: 2,
    get: () => one(finite(S().fps, 30)),
    onInput: (v) => setS({ fps: clamp(v, 1, 240) }, "fps")
  });
  secSize.add(kit.row({ label: "任意の fps", field: fpsNum, hint: "書き出しの fps は書き出し画面で別に選べます。" }));
  root.append(secSize.el);

  function renderSizeState() {
    const custom = String(S().ratio || "16:9") === "custom";
    sizeRow.classList.toggle("vqs-insp-row--off", !custom);
    for (const inp of sizeRow.querySelectorAll("input")) inp.disabled = !custom;
    sizeHint.textContent = custom
      ? "「自由」のときだけ幅と高さを直接決められます。"
      : "比率を選ぶと寸法は自動で決まります。直接決めたいときは「自由」にしてください。";
  }

  /* ── 3. 背景 ────────────────────────────────────────────────── */
  const secBg = kit.section({ title: "背景", id: "prjbg" });
  const bgTypeField = kit.seg({
    label: "背景の種類",
    items: [{ value: "color", label: "色" }, { value: "blur", label: "ぼかし" }, { value: "image", label: "画像" }],
    get: () => one(String((S().background || {}).type || "color")),
    onChange: (v) => { setS({ background: { type: String(v) } }, "背景"); kit.update(); renderBgState(); }
  });
  secBg.add(kit.row({ label: "種類", field: bgTypeField }));

  const bgColor = kit.col({
    label: "背景の色",
    get: () => one(String((S().background || {}).color || "#000000")),
    onInput: (v) => setS({ background: { color: String(v) } }, "背景の色")
  });
  const bgColorRow = kit.row({ label: "色", field: bgColor });
  secBg.add(bgColorRow);

  const bgBlur = kit.sld({
    label: "ぼかしの強さ", min: 0, max: 200, step: 1, digits: 0, center: 40,
    get: () => one(clamp(finite((S().background || {}).blur, 40), 0, 200)),
    onInput: (v) => setS({ background: { blur: clamp(v, 0, 200) } }, "背景のぼかし")
  });
  const bgBlurRow = kit.row({ label: "ぼかし", field: bgBlur, hint: "映像の外側を、その映像をぼかした絵で埋めます（縦動画を横画面に入れるときに効きます）。" });
  secBg.add(bgBlurRow);

  const bgImage = kit.sel({
    label: "背景の画像",
    items: [{ value: "", label: "（選んでいません）" }],
    get: () => one(String((S().background || {}).assetId || "")),
    onChange: (v) => setS({ background: { assetId: v ? String(v) : null } }, "背景の画像")
  });
  const bgImageRow = kit.row({ label: "画像", field: bgImage });
  secBg.add(bgImageRow);
  root.append(secBg.el);

  function renderBgState() {
    const type = String((S().background || {}).type || "color");
    bgColorRow.classList.toggle("vqs-insp-row--off", type === "image");
    bgBlurRow.classList.toggle("vqs-insp-row--off", type !== "blur");
    bgImageRow.classList.toggle("vqs-insp-row--off", type !== "image");
    /* 画像の候補は project.assets から毎回引き直す（取り込みで増える） */
    const sel = bgImage.el.querySelector("select");
    if (!sel) return;
    const images = (store.project.assets || []).filter((a) => a && a.kind === "image");
    const want = images.map((a) => a.id).join(",");
    if (sel.getAttribute("data-assets") === want) return;
    sel.setAttribute("data-assets", want);
    sel.textContent = "";
    const none = el("option", "", images.length ? "（選んでいません）" : "（画像の素材がありません）");
    none.value = "";
    sel.append(none);
    for (const a of images) {
      const op = el("option", "", a.name || a.id);
      op.value = a.id;
      sel.append(op);
    }
    sel.value = String((S().background || {}).assetId || "");
  }

  /* ── 4. 編集の助け（セーフエリア・吸着・磁着）──────────────── */
  const secHelp = kit.section({ title: "編集の助け", id: "prjhelp" });
  secHelp.add(
    kit.row({
      label: "セーフエリア", field: kit.tog({
        label: "セーフエリアを出す",
        get: () => one(!!S().showSafeArea),
        onChange: (v) => setS({ showSafeArea: !!v }, "セーフエリア")
      }),
      hint: "文字が切れない範囲の目安を、プレビューに重ねて出します。"
    }),
    kit.row({
      label: "吸着", field: kit.tog({
        label: "吸着する",
        get: () => one(S().snap !== false),
        onChange: (v) => setS({ snap: !!v }, "吸着")
      }),
      hint: "クリップの端・再生ヘッド・マーカーに吸い付きます。"
    }),
    kit.row({
      label: "磁着", field: kit.tog({
        label: "磁着する",
        get: () => one(S().magnet !== false),
        onChange: (v) => setS({ magnet: !!v }, "磁着")
      }),
      hint: "クリップを消したり動かしたとき、隙間を自動で詰めます。"
    })
  );
  root.append(secHelp.el);

  /* ── 5. 既定の値（画面の好み）──────────────────────────────── */
  const secDefaults = kit.section({ title: "既定の値", id: "prjdefaults", open: false });
  const transField = kit.num({
    label: "遷移の長さ", unit: "秒", min: 0.1, max: 5, step: 0.1, digits: 1,
    get: () => one(readDefault(DEFAULTS_KEYS.transition, 0.5)),
    onInput: (v) => writeDefault(DEFAULTS_KEYS.transition, clamp(finite(v, 0.5), 0.1, 5))
  });
  secDefaults.add(kit.row({ label: "既定の遷移時間", field: transField, hint: "遷移（クロスフェード等）を挿すときの最初の長さです。" }));

  const capField = kit.sel({
    label: "テロップ様式",
    items: CAPTION_PRESETS.map((p) => ({ value: p.id, label: p.label })),
    get: () => one(readDefault(DEFAULTS_KEYS.caption, "plain")),
    onChange: (v) => applyCaptionPreset(String(v))
  });
  secDefaults.add(kit.row({ label: "既定のテロップ様式", field: capField, hint: "字幕や自動生成のテロップが、この見た目で作られます。" }));
  const capPreview = el("div", "vqs-prj__cappreview");
  capPreview.setAttribute("data-test", "insp-prj-cappreview");
  secDefaults.body.append(capPreview);
  root.append(secDefaults.el);

  /* ── 6. 保存の様子と使用量 ────────────────────────────────── */
  const secStore = kit.section({ title: "保存と使用量", id: "prjstore" });
  const saveRow = kit.kv("自動保存", "—", "insp-prj-save");
  secStore.body.append(saveRow);
  const countRow = kit.kv("素材", "—", "insp-prj-count");
  secStore.body.append(countRow);
  const usage = el("div", "vqs-usage");
  const usageBar = el("div", "vqs-usage__bar");
  const usageFill = el("i", "vqs-usage__fill");
  usageBar.append(usageFill);
  const usageText = el("p", "vqs-usage__text", "使用量を調べています…");
  usageText.setAttribute("data-test", "insp-prj-usage");
  usage.append(usageBar, usageText);
  secStore.body.append(usage);
  secStore.add(kit.btnRow([
    kit.btn("使用量を調べ直す", () => refreshUsage(), { test: "insp-prj-usage-again" }),
    kit.btn("今すぐ保存", () => saveNow(), { cls: "vqs-btn--ghost" })
  ]));
  secStore.add(kit.note("ホーム画面に追加したアプリと Safari は保存の場所が別です。大事な作品は「書き出し → プロジェクト」で手元に残してください。", "warn"));
  root.append(secStore.el);

  /* ── 中身の実装 ───────────────────────────────────────────────── */

  function readDefault(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      if (v === null) return fallback;
      return typeof fallback === "number" ? finite(Number(v), fallback) : v;
    } catch (e) { return fallback; }
  }
  function writeDefault(key, v) {
    try { localStorage.setItem(key, String(v)); } catch (e) { /* 使えない環境は覚えないだけ */ }
  }

  /** 字幕の既定の見た目を project.subtitleStyle へ書く（CONTRACT-NOTE 参照） */
  function applyCaptionPreset(id) {
    const p = CAPTION_PRESETS.find((x) => x.id === id) || CAPTION_PRESETS[0];
    writeDefault(DEFAULTS_KEYS.caption, p.id);
    try {
      const snap = store.snapshot();
      snap.subtitleStyle = Object.assign(defaultTextStyle(), snap.subtitleStyle || {}, p.style);
      store.replace(snap, "既定のテロップ様式");
    } catch (e) {
      kit.toast((e && e.message) || "様式を変えられませんでした", { kind: "error" });
    }
    renderCaptionPreview();
  }
  function renderCaptionPreview() {
    const id = readDefault(DEFAULTS_KEYS.caption, "plain");
    const p = CAPTION_PRESETS.find((x) => x.id === id) || CAPTION_PRESETS[0];
    capPreview.textContent = "";
    const chip = el("span", "vqs-prj__capchip", "テロップの見本");
    /* 見本は inline で描く（CSS 側で様式ごとに上書きしても良い） */
    const st = p.style;
    chip.style.color = st.color;
    chip.style.fontWeight = String(st.weight);
    chip.style.padding = st.bg ? (st.bg.pad / 2) + "px " + st.bg.pad + "px" : "2px 0";
    if (st.bg) { chip.style.background = st.bg.color; chip.style.borderRadius = st.bg.radius + "px"; }
    if (st.stroke && st.stroke.width) chip.style.webkitTextStroke = Math.max(1, Math.round(st.stroke.width / 3)) + "px " + st.stroke.color;
    if (st.shadow && (st.shadow.blur || st.shadow.y)) chip.style.textShadow = `${st.shadow.x}px ${st.shadow.y}px ${st.shadow.blur}px ${st.shadow.color}`;
    capPreview.append(chip);
  }

  /** 作品を丸ごと複製して保管庫へ入れる（開くかは人に決めてもらう） */
  async function duplicate() {
    if (!storage || typeof storage.putProject !== "function") {
      kit.toast("保存庫が使えないため複製できません", { kind: "error" });
      return;
    }
    try {
      const snap = store.snapshot();
      snap.id = uid("prj");
      snap.name = String(snap.name || "無題のプロジェクト") + " のコピー";
      snap.createdAt = Date.now();
      snap.updatedAt = Date.now();
      await storage.putProject(snap);
      kit.toast("「" + snap.name + "」として複製しました（一覧から開けます）", { kind: "success" });
    } catch (e) {
      kit.toast((e && e.message) || "複製できませんでした", { kind: "error" });
    }
  }

  async function saveNow() {
    const app = ctx && ctx.app;
    if (app && typeof app.save === "function") {
      try { await app.save(); kit.toast("保存しました", { kind: "success" }); }
      catch (e) { kit.toast((e && e.message) || "保存できませんでした", { kind: "error" }); }
      return;
    }
    if (storage && typeof storage.putProject === "function") {
      try { await storage.putProject(store.snapshot()); kit.toast("保存しました", { kind: "success" }); }
      catch (e) { kit.toast((e && e.message) || "保存できませんでした", { kind: "error" }); }
      return;
    }
    kit.toast("保存庫が使えません", { kind: "error" });
  }

  let usageBusy = false;
  async function refreshUsage() {
    const assets = store.project.assets || [];
    let bytes = 0;
    for (const a of assets) bytes += Math.max(0, finite(a && a.size, 0));
    countRow.querySelector(".vqs-insp-kv__v").textContent =
      assets.length ? `${assets.length} 個 ・ 合計 ${formatBytes(bytes)}` : "まだありません";

    if (!storage || typeof storage.estimate !== "function") {
      usageText.textContent = "この環境では使用量を調べられません（素材の合計は上に出しています）。";
      usageFill.style.width = "0%";
      return;
    }
    if (usageBusy) return;
    usageBusy = true;
    try {
      const est = await storage.estimate();
      const used = Math.max(0, finite(est && est.usage, 0));
      const quota = Math.max(1, finite(est && est.quota, 0));
      const pct = clamp(used / quota, 0, 1);
      usageFill.style.width = (pct * 100).toFixed(1) + "%";
      usage.classList.toggle("vqs-usage--tight", pct > 0.8);
      usageText.textContent = `${formatBytes(used)} / ${formatBytes(quota)} を使っています（${(pct * 100).toFixed(1)}%）`;
    } catch (e) {
      usageText.textContent = "使用量を調べられませんでした: " + String((e && e.message) || e);
    } finally {
      usageBusy = false;
    }
  }

  /* 自動保存の表示は ui/app.js が #saveState に書く。二重に持たず、そこを見る */
  const saveEl = document.getElementById("saveState");
  const readSave = () => {
    const slot = saveRow.querySelector(".vqs-insp-kv__v");
    if (!slot) return;
    slot.textContent = saveEl ? (saveEl.textContent || "—") : "自動保存の状態が分かりません";
  };
  let mo = null;
  if (saveEl && typeof MutationObserver === "function") {
    mo = new MutationObserver(readSave);
    try { mo.observe(saveEl, { childList: true, characterData: true, subtree: true }); }
    catch (e) { mo = null; }
  }

  /* ── 情報（読むだけ）───────────────────────────────────────── */
  const info = el("div", "vqs-prj__info");
  root.append(info);
  function renderInfo() {
    const s = S();
    const p = store.project;
    info.textContent = "";
    info.append(kit.kv("出力", `${finite(s.width, 0)} × ${finite(s.height, 0)} ・ ${finite(s.fps, 30)}fps`, "insp-prj-out"));
    let last = 0;
    for (const tr of p.tracks || []) {
      for (const c of (tr && tr.clips) || []) last = Math.max(last, finite(c.start, 0) + finite(c.duration, 0));
    }
    info.append(kit.kv("今の長さ", humanDuration(last), "insp-prj-dur"));
    info.append(kit.kv("トラック", String((p.tracks || []).length) + " 本", "insp-prj-tracks"));
  }

  /* ── 契約の形 ─────────────────────────────────────────────────── */
  kit.update(o.clipIds || []);
  renderSizeState();
  renderBgState();
  renderCaptionPreview();
  renderInfo();
  readSave();
  refreshUsage();

  return {
    el: root,
    update(ids) {
      kit.update(ids || []);
      renderSizeState();
      renderBgState();
      renderInfo();
      readSave();
    },
    dispose() {
      if (mo) { try { mo.disconnect(); } catch (e) { /* noop */ } mo = null; }
      kit.dispose();
      try { root.remove(); } catch (e) { /* noop */ }
    }
  };
}
