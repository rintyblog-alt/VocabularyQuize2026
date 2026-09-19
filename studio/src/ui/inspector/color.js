/* ══════════════════════════════════════════════════════════════════════════
   studio/src/ui/inspector/color.js — 「カラー」タブ（色補正）

   ★ 何をする所か
     DaVinci Resolve のカラーページの簡易版。選択クリップの `clip.color`
     （契約書 §1 の ColorGrade）を全部触れるようにする所。
       1. 基本   … 露出〜粒子までの 16 本（スライダー + 数値 + キーフレーム + 戻す）
       2. カーブ … RGB / R / G / B / 輝度 の 5 面（多点・追加削除・プリセット）
       3. ホイール … リフト / ガンマ / ゲイン / オフセット（自前 canvas + Pointer Events）
       4. HSL   … 6 帯域（赤橙黄緑青紫）ごとに 色相 / 彩度 / 輝度。色を吸って選べる
       5. LUT   … 内蔵 LUT の一覧 + .cube 読み込み + 適用量
       6. プリセット … 14 種（基本 + カーブ + LUT をまとめて当てる）・自作の保存
       7. 比較   … 「補正前」を押している間だけ色を外して見せる
     下に計測器（ui/scopes.js）も出す（波形を見ながら触れないと色は合わせられない）。

   ★ なぜこの形か
     ・値の読み書きは **必ず ops 経由**（`clip.setColor` = 深いマージの糖衣）。
       配列（curves / wheels / hsl）は core/ops.js の mergeInto が丸ごと差し替える
       ので、`{ wheels: { lift: [r,g,b] } }` のような部分更新がそのまま効く。
     ・触っている間の間引きと「1 操作 1 undo」は inspector/index.js の
       `kit.driver` に任せる（心拍で履歴の鎖を繋ぐ仕掛けが既に在る）。
     ・**ホイールとカーブは自前の canvas + Pointer Events**。widgets 側に
       `curveEditor` が在ればカーブはそれを使うが、無い間も完全に動く。
       円盤は「色の向き」、外周のリングは「明度」、ダブルタップで中立。
     ・複数選択では共通値だけ出し、違えば「—」（kit.read と同じ作法）。
       書き込みは選択の **音声以外**の全部へ同じ値を当てる。
     ・engine/fx/luts.js と ui/scopes.js は **動的 import**。まだ無い・壊れて
       いる時に カラータブごと真っ白になるのを避ける（隣は並行作業中）。

   ★ 触るときの注意
     ・`touch-action` は CSS 担当へ: `.vqs-col-wheel__disc` と `.vqs-col-curve`
       に `touch-action: none` が要る（指で描く所）。
     ・円盤・カーブは CSS が高さを決めていない間だけ inline で自立する。
     ・触り所は 44px 以上。円盤は最小 96px（指で回せる下限）。

   CONTRACT-NOTE 1（値の単位）: 契約書 §1 は ColorGrade の数値の **範囲**を
     定めていない。engine（色）が未着なので、ここでは
       **全部 -1..1（0 = 何もしない）** に統一した。片側だけの物
       （フェード / シャープ / ノイズ除去 / 粒子）は 0..1。
       画面の表示は下の BASIC 表の `scale` で作る（露出は ±2 EV、色相は ±180°）。
     engine が別の範囲で描くなら BASIC 表の scale と min/max だけを直せば済む。
   CONTRACT-NOTE 2（wheels の意味）: `wheels.<name> = [r,g,b]` を
     「その帯域に足す色の偏り」と読み、**3 つの平均が明度**、平均を引いた残りが
     色の向きになるよう `polarToWheel` / `wheelToPolar` で往復させている
     （円盤の位置と数値が 1 対 1 で戻る形。engine もこの読み方で合わせてほしい）。
   CONTRACT-NOTE 3（比較）: 依頼は「store の view フラグ経由で良い」だったが、
     core/store.js の `setView` は **決まった鍵しか受けない**（知らない鍵は
     警告して捨てる）ので view には積めない。代わりに
       ① `compositor.setBypass({ color:true })` が在ればそれを使う
       ② 無ければ **色を外した project の複製を 1 枚だけ描き直す**
     の二段にした（②は契約書 §4 の renderFrame だけで成り立つ）。
   CONTRACT-NOTE 4（行数）: 1 ファイル 700 行の目安を超えている。分けるには
     担当外のファイル（inspector/color-wheels.js 等）を作るしかなく、
     「担当ファイルだけ」の約束の方が強いのでこの 1 枚に収めた。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

import { createFieldKit, el, fmtNum, sameValue } from "./index.js";
import { clamp, finite, isTouch, deepClone, rgbToHex, cssVar } from "../../core/util.js";
import { defaultColorGrade } from "../../core/schema.js";
import { warn } from "../../core/log.js";

/* ══ 0. 表（値の定義。UI はここから作る）══════════════════════════ */

/**
 * 基本の 16 本。`scale` は「保存値 × scale = 画面の数」。
 * min / max / step は **画面の数**（kit.sld / kit.num の約束）。
 * @type {{key:string,label:string,unit:string,min:number,max:number,step:number,
 *         digits:number,scale:number,center:number,hint?:string}[]}
 */
export const BASIC = Object.freeze([
  { key: "exposure", label: "露出", unit: "EV", min: -2, max: 2, step: 0.05, digits: 2, scale: 2, center: 0 },
  { key: "contrast", label: "コントラスト", unit: "", min: -100, max: 100, step: 1, digits: 0, scale: 100, center: 0 },
  { key: "saturation", label: "彩度", unit: "", min: -100, max: 100, step: 1, digits: 0, scale: 100, center: 0 },
  { key: "temperature", label: "色温度", unit: "", min: -100, max: 100, step: 1, digits: 0, scale: 100, center: 0, hint: "−が青・＋が橙" },
  { key: "tint", label: "色合い", unit: "", min: -100, max: 100, step: 1, digits: 0, scale: 100, center: 0, hint: "−が緑・＋が紫" },
  { key: "highlights", label: "ハイライト", unit: "", min: -100, max: 100, step: 1, digits: 0, scale: 100, center: 0 },
  { key: "shadows", label: "シャドウ", unit: "", min: -100, max: 100, step: 1, digits: 0, scale: 100, center: 0 },
  { key: "whites", label: "白", unit: "", min: -100, max: 100, step: 1, digits: 0, scale: 100, center: 0 },
  { key: "blacks", label: "黒", unit: "", min: -100, max: 100, step: 1, digits: 0, scale: 100, center: 0 },
  { key: "vibrance", label: "自然な彩度", unit: "", min: -100, max: 100, step: 1, digits: 0, scale: 100, center: 0, hint: "肌の色を残して濃くする" },
  { key: "hue", label: "色相", unit: "°", min: -180, max: 180, step: 1, digits: 0, scale: 180, center: 0 },
  { key: "fade", label: "フェード", unit: "", min: 0, max: 100, step: 1, digits: 0, scale: 100, center: 0, hint: "黒を持ち上げて霞ませる" },
  { key: "sharpen", label: "シャープ", unit: "", min: 0, max: 100, step: 1, digits: 0, scale: 100, center: 0 },
  { key: "denoise", label: "ノイズ除去", unit: "", min: 0, max: 100, step: 1, digits: 0, scale: 100, center: 0 },
  { key: "vignette", label: "周辺減光", unit: "", min: -100, max: 100, step: 1, digits: 0, scale: 100, center: 0, hint: "＋で四隅を暗く" },
  { key: "grain", label: "粒子", unit: "", min: 0, max: 100, step: 1, digits: 0, scale: 100, center: 0 }
]);

/** カーブの 5 面（rgb は既定で直線が入っている・他は null = 何もしない） */
export const CURVE_CHANNELS = Object.freeze([
  { id: "rgb", label: "RGB", color: "#e9eef5" },
  { id: "r", label: "R", color: "#ff5a5a" },
  { id: "g", label: "G", color: "#56e08a" },
  { id: "b", label: "B", color: "#6b9dff" },
  { id: "luma", label: "輝度", color: "#ffd666" }
]);

/** カーブのプリセット */
export const CURVE_PRESETS = Object.freeze([
  { id: "line", label: "直線", pts: [[0, 0], [1, 1]] },
  { id: "s", label: "S 字", pts: [[0, 0], [0.25, 0.17], [0.5, 0.5], [0.75, 0.83], [1, 1]] },
  { id: "bright", label: "明るく", pts: [[0, 0], [0.25, 0.36], [0.5, 0.63], [0.75, 0.86], [1, 1]] },
  { id: "dark", label: "暗く", pts: [[0, 0], [0.25, 0.15], [0.5, 0.38], [0.75, 0.65], [1, 1]] },
  { id: "film", label: "フィルム", pts: [[0, 0.06], [0.22, 0.2], [0.5, 0.52], [0.8, 0.86], [1, 0.95]] }
]);

/** ホイールの 4 つ */
export const WHEELS = Object.freeze([
  { key: "lift", label: "リフト", sub: "暗部" },
  { key: "gamma", label: "ガンマ", sub: "中間" },
  { key: "gain", label: "ゲイン", sub: "明部" },
  { key: "offset", label: "オフセット", sub: "全体" }
]);
/** 円盤の端（色の偏りの上限）と リングの端（明度の上限） */
export const WHEEL_RADIUS_MAX = 0.5;
export const WHEEL_MASTER_MAX = 0.5;

/** HSL 個別調整の 6 帯域（hue は度・range は帯の半幅） */
export const HSL_BANDS = Object.freeze([
  { id: "red", label: "赤", hue: 0, range: 30, css: "#ff4d4f" },
  { id: "orange", label: "橙", hue: 32, range: 26, css: "#ff9a3c" },
  { id: "yellow", label: "黄", hue: 60, range: 26, css: "#ffd666" },
  { id: "green", label: "緑", hue: 125, range: 45, css: "#56e08a" },
  { id: "blue", label: "青", hue: 220, range: 50, css: "#4f8cff" },
  { id: "purple", label: "紫", hue: 290, range: 40, css: "#b07cff" }
]);

/** 色ごとの調整（h/s/l）の見せ方 */
const HSL_FIELDS = Object.freeze([
  { key: "h", label: "色相", unit: "°", min: -60, max: 60, step: 1, digits: 0, scale: 60 },
  { key: "s", label: "彩度", unit: "", min: -100, max: 100, step: 1, digits: 0, scale: 100 },
  { key: "l", label: "輝度", unit: "", min: -100, max: 100, step: 1, digits: 0, scale: 100 }
]);

/**
 * 見た目のプリセット（**基本 + カーブ + ホイール + LUT をまとめて**当てる）。
 * `lut` は engine/fx/luts.js に同じ id が在るときだけ使う（無ければ色だけ当てる）。
 */
export const LOOK_PRESETS = Object.freeze([
  { id: "none", name: "なし", grade: {} },
  { id: "cinema", name: "シネマ", lut: "cinema", grade: { contrast: 0.18, saturation: -0.04, vibrance: 0.1, shadows: -0.06, vignette: 0.18, curves: { rgb: [[0, 0.02], [0.25, 0.2], [0.5, 0.5], [0.75, 0.82], [1, 0.98]] }, wheels: { lift: [-0.02, -0.01, 0.04], gain: [0.03, 0.01, -0.03] } } },
  { id: "teal", name: "ティール&オレンジ", lut: "teal_orange", grade: { contrast: 0.14, saturation: 0.08, temperature: 0.06, wheels: { lift: [-0.03, 0, 0.06], gain: [0.06, 0.02, -0.05] }, hsl: [{ hue: 32, range: 26, h: -0.07, s: 0.14, l: 0.04 }, { hue: 220, range: 50, h: 0.07, s: 0.1, l: -0.02 }] } },
  { id: "vivid", name: "鮮やか", grade: { saturation: 0.3, vibrance: 0.2, contrast: 0.12, sharpen: 0.12 } },
  { id: "pale", name: "淡い", grade: { saturation: -0.24, contrast: -0.1, fade: 0.26, whites: 0.08, curves: { rgb: [[0, 0.1], [0.5, 0.52], [1, 0.94]] } } },
  { id: "night", name: "夜", grade: { exposure: -0.08, temperature: -0.3, tint: -0.04, shadows: -0.12, blacks: -0.08, saturation: -0.08, vignette: 0.3, wheels: { lift: [-0.03, -0.01, 0.05] } } },
  { id: "warm", name: "暖かい", grade: { temperature: 0.28, tint: 0.05, vibrance: 0.1, highlights: -0.05 } },
  { id: "cool", name: "冷たい", grade: { temperature: -0.28, tint: -0.04, contrast: 0.06 } },
  { id: "mono", name: "モノクロ", grade: { saturation: -1, contrast: 0.16, whites: 0.06 } },
  { id: "noir", name: "ノワール", grade: { saturation: -1, contrast: 0.36, blacks: -0.18, whites: 0.12, grain: 0.14, vignette: 0.24, curves: { rgb: [[0, 0], [0.3, 0.16], [0.7, 0.84], [1, 1]] } } },
  { id: "film", name: "フィルム", lut: "film", grade: { saturation: -0.08, fade: 0.14, grain: 0.18, temperature: 0.08, curves: { rgb: [[0, 0.06], [0.22, 0.2], [0.5, 0.52], [0.8, 0.86], [1, 0.95]] } } },
  { id: "retro", name: "レトロ", grade: { temperature: 0.16, saturation: -0.14, fade: 0.2, contrast: -0.06, grain: 0.1, wheels: { lift: [0.05, 0.02, -0.02] }, curves: { b: [[0, 0.08], [0.5, 0.5], [1, 0.92]] } } },
  { id: "summer", name: "夏", grade: { exposure: 0.08, saturation: 0.18, temperature: 0.12, vibrance: 0.16, highlights: 0.06 } },
  { id: "mist", name: "霧", grade: { contrast: -0.2, fade: 0.32, saturation: -0.1, whites: 0.12, curves: { rgb: [[0, 0.14], [0.5, 0.54], [1, 0.9]] } } },
  { id: "drama", name: "ドラマ", grade: { contrast: 0.26, highlights: -0.16, shadows: -0.12, vibrance: 0.2, sharpen: 0.1, vignette: 0.22, wheels: { gamma: [-0.02, 0, 0.02] } } }
]);

const USER_PRESET_KEY = "vqstudio.color.presets.v1";
const LAST_BAND_KEY = "vqstudio.color.band";
const LAST_CURVE_KEY = "vqstudio.color.curve";

/* ══ 1. 純粋な計算（Node でも動く。engine と共有したい式）════════ */

/** 円盤の角度（rad）と半径・明度 → wheels の [r,g,b] */
export function polarToWheel(angle, radius, master) {
  const a = finite(angle, 0);
  const rad = clamp(finite(radius, 0), 0, 1);
  const m = finite(master, 0);
  const th = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3];
  return th.map((t) => clamp(m + rad * Math.cos(a - t), -1, 1));
}

/** wheels の [r,g,b] → 円盤の角度（rad）と半径・明度（polarToWheel の逆） */
export function wheelToPolar(triple) {
  const t = Array.isArray(triple) ? triple : [];
  const v = [finite(t[0], 0), finite(t[1], 0), finite(t[2], 0)];
  const master = (v[0] + v[1] + v[2]) / 3;
  const th = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3];
  let X = 0;
  let Y = 0;
  for (let i = 0; i < 3; i++) {
    const res = v[i] - master;
    X += res * Math.cos(th[i]);
    Y += res * Math.sin(th[i]);
  }
  const radius = (2 / 3) * Math.hypot(X, Y);
  const angle = radius < 1e-9 ? 0 : Math.atan2(Y, X);
  return { angle, radius, master };
}

/** 0..255 の RGB → { h: 0..360, s: 0..1, l: 0..1 } */
export function rgbToHsl(r, g, b) {
  const R = clamp(finite(r, 0), 0, 255) / 255;
  const G = clamp(finite(g, 0), 0, 255) / 255;
  const B = clamp(finite(b, 0), 0, 255) / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d < 1e-9) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === R) h = ((G - B) / d) % 6;
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  h = (h * 60 + 360) % 360;
  return { h, s, l };
}

/** 色相の差（度・-180..180。帯域を選ぶのに使う） */
export function hueDistance(a, b) {
  let d = (finite(a, 0) - finite(b, 0)) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/**
 * 単調 3 次補間（Fritsch–Carlson）でカーブを読む。
 * 画面の曲線と engine の結果を揃えたいので、**式をここに 1 つだけ**置く。
 * @param {number[][]} points [[x,y]]（x 昇順・0..1）
 * @param {number} x 0..1
 * @returns {number} 0..1
 */
export function curveAt(points, x) {
  const p = normalizeCurve(points);
  const t = clamp(finite(x, 0), 0, 1);
  const n = p.length;
  if (n === 0) return t;
  if (t <= p[0][0]) return p[0][1];
  if (t >= p[n - 1][0]) return p[n - 1][1];
  /* 区間の傾き */
  const dx = [];
  const dy = [];
  const s = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(Math.max(1e-6, p[i + 1][0] - p[i][0]));
    dy.push(p[i + 1][1] - p[i][1]);
    s.push(dy[i] / dx[i]);
  }
  /* 節点の傾き（単調性を壊さない選び方） */
  const m = new Array(n);
  m[0] = s[0];
  m[n - 1] = s[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (s[i - 1] * s[i] <= 0) m[i] = 0;
    else {
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      m[i] = (w1 + w2) / (w1 / s[i - 1] + w2 / s[i]);
    }
  }
  let i = 0;
  while (i < n - 2 && t > p[i + 1][0]) i++;
  const h = dx[i];
  const u = (t - p[i][0]) / h;
  const u2 = u * u;
  const u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;
  return clamp(h00 * p[i][1] + h10 * h * m[i] + h01 * p[i + 1][1] + h11 * h * m[i + 1], 0, 1);
}

/** カーブの点を整える（0..1 に収め、x 昇順、2 点以上、端を 0 と 1 へ寄せる） */
export function normalizeCurve(points) {
  const list = (Array.isArray(points) ? points : [])
    .filter((q) => Array.isArray(q) && q.length >= 2)
    .map((q) => [clamp(finite(q[0], 0), 0, 1), clamp(finite(q[1], 0), 0, 1)])
    .sort((a, b) => a[0] - b[0]);
  if (list.length < 2) return [[0, 0], [1, 1]];
  list[0][0] = 0;
  list[list.length - 1][0] = 1;
  /* x が重なった点は捨てる（補間が壊れる） */
  const out = [list[0]];
  for (let i = 1; i < list.length; i++) {
    if (list[i][0] - out[out.length - 1][0] > 1e-4) out.push(list[i]);
    else if (i === list.length - 1) out[out.length - 1] = list[i];
  }
  return out.length >= 2 ? out : [[0, 0], [1, 1]];
}

/**
 * .cube を読む（engine/fx/luts.js の parseCubeLUT が無い間の代替）。
 * @param {string} text @param {string} [name]
 * @returns {{name:string,size:number,data:Float32Array,domain:number[][]}}
 * @throws {Error} 形が違うとき（呼び出し側が toast に出せる message を付ける）
 */
export function parseCubeText(text, name) {
  const src = String(text == null ? "" : text);
  if (!src) throw new Error(".cube が空です");
  let size = 0;
  let title = String(name || "").replace(/\.cube$/i, "");
  const dmin = [0, 0, 0];
  const dmax = [1, 1, 1];
  const vals = [];
  const lines = src.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const up = line.toUpperCase();
    if (up.startsWith("TITLE")) {
      const m = line.match(/"([^"]*)"/);
      if (m) title = m[1];
      continue;
    }
    if (up.startsWith("LUT_3D_SIZE")) { size = parseInt(line.split(/\s+/)[1], 10) || 0; continue; }
    if (up.startsWith("LUT_1D_SIZE")) throw new Error("1D の .cube には未対応です（3D LUT を選んでください）");
    if (up.startsWith("DOMAIN_MIN")) { const p = line.split(/\s+/); for (let i = 0; i < 3; i++) dmin[i] = finite(parseFloat(p[i + 1]), 0); continue; }
    if (up.startsWith("DOMAIN_MAX")) { const p = line.split(/\s+/); for (let i = 0; i < 3; i++) dmax[i] = finite(parseFloat(p[i + 1]), 1); continue; }
    if (/^[A-Z_]/.test(up)) continue;                     // 知らない見出しは飛ばす
    const p = line.split(/\s+/);
    if (p.length < 3) continue;
    const r = parseFloat(p[0]);
    const g = parseFloat(p[1]);
    const b = parseFloat(p[2]);
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) continue;
    vals.push(r, g, b);
  }
  if (!(size >= 2)) throw new Error("LUT_3D_SIZE が見つかりません");
  const want = size * size * size * 3;
  if (vals.length < want) throw new Error(`点の数が足りません（${vals.length / 3} / ${want / 3}）`);
  return { name: title || "読み込んだ LUT", size, data: new Float32Array(vals.slice(0, want)), domain: [dmin, dmax] };
}

/* ══ 2. 小さな道具（DOM）══════════════════════════════════════════ */

const DPR_MAX = 2;

/** 触り所を 44px 以上に（CSS がまだ無くても指で押せるように） */
function touch44(node) {
  if (node && node.style && isTouch()) { node.style.minHeight = "44px"; node.style.minWidth = "44px"; }
  return node;
}

/** canvas の実寸を合わせて 2d ctx を返す（CSS が寸法を決めていなければ自前で） */
function fitCanvas(canvas, wantW, wantH) {
  const w = Math.max(24, Math.round(finite(canvas.clientWidth, 0) || wantW));
  let h = Math.round(finite(canvas.clientHeight, 0));
  if (!h) { canvas.style.height = wantH + "px"; h = wantH; }
  const dpr = clamp(finite(globalThis.devicePixelRatio, 1), 1, DPR_MAX);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h, dpr };
}

/** 押した所を canvas の座標（CSS px）に直す */
function localPoint(canvas, ev) {
  const r = canvas.getBoundingClientRect();
  return {
    x: ((ev.clientX - r.left) / Math.max(1, r.width)) * (canvas.clientWidth || r.width),
    y: ((ev.clientY - r.top) / Math.max(1, r.height)) * (canvas.clientHeight || r.height)
  };
}

const COL = {
  ink: () => cssVar("--vqs-col-ink", "rgba(233,238,245,.72)"),
  grid: () => cssVar("--vqs-col-grid", "rgba(233,238,245,.16)"),
  bg: () => cssVar("--vqs-col-canvas-bg", "rgba(10,12,17,.9)"),
  accent: () => cssVar("--vqs-accent", "#4f8cff")
};

/* ══ 3. カーブ編集器（自前・canvas + Pointer Events）═════════════ */

/**
 * 色カーブの編集器。
 * @param {{points:number[][], color?:string, label?:string,
 *          onInput:(pts:number[][])=>void, onEnd:Function}} c
 * @returns {{el:HTMLElement, set:(pts:number[][], color?:string)=>void, dispose:Function}}
 */
export function makeCurveEditor(c) {
  const host = el("div", "vqs-col-curve");
  host.style.touchAction = "none";        // CSS 担当へ: .vqs-col-curve に同じ指定を
  const canvas = el("canvas", "vqs-col-curve__canvas");
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.setAttribute("role", "application");
  canvas.setAttribute("aria-label", (c.label || "カーブ") + "（点を掴んで動かす・空いた所を押すと点が増える）");
  canvas.setAttribute("data-test", "col-curve");
  host.append(canvas);
  const readout = el("p", "vqs-col-curve__hint", "点を掴んで動かす・空いた所を押すと増える・点をダブルタップで削除");
  host.append(readout);

  let pts = normalizeCurve(c.points);
  let color = c.color || COL.ink();
  let drag = -1;
  /* 点の削除は「動かさずに離した 2 回」（ドラッグ直後の 1 回では消さない） */
  let gest = { at: 0, x: 0, y: 0, moved: false, i: -1 };
  let lastTap = null;
  const PAD = 10;

  const toPx = (box, p) => ({ x: PAD + p[0] * (box.w - PAD * 2), y: PAD + (1 - p[1]) * (box.h - PAD * 2) });
  const toUnit = (box, x, y) => [
    clamp((x - PAD) / Math.max(1, box.w - PAD * 2), 0, 1),
    clamp(1 - (y - PAD) / Math.max(1, box.h - PAD * 2), 0, 1)
  ];

  function paint() {
    const wantH = Math.max(140, Math.min(260, Math.round(canvas.clientWidth || 220)));
    const box = fitCanvas(canvas, 220, wantH);
    if (!box) return;
    const ctx = box.ctx;
    const bg = COL.bg();
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, box.w, box.h); }
    /* 目安の格子と対角線 */
    ctx.save();
    ctx.strokeStyle = COL.grid();
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const gx = PAD + (i / 4) * (box.w - PAD * 2);
      const gy = PAD + (i / 4) * (box.h - PAD * 2);
      ctx.globalAlpha = i === 0 || i === 4 ? 0.9 : 0.45;
      ctx.beginPath();
      ctx.moveTo(Math.round(gx) + 0.5, PAD);
      ctx.lineTo(Math.round(gx) + 0.5, box.h - PAD);
      ctx.moveTo(PAD, Math.round(gy) + 0.5);
      ctx.lineTo(box.w - PAD, Math.round(gy) + 0.5);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.5;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(PAD, box.h - PAD);
    ctx.lineTo(box.w - PAD, PAD);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    /* 曲線（単調 3 次。curveAt と同じ式） */
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.beginPath();
    const steps = Math.max(24, Math.round(box.w - PAD * 2));
    for (let i = 0; i <= steps; i++) {
      const x = i / steps;
      const p = toPx(box, [x, curveAt(pts, x)]);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    /* 点 */
    for (let i = 0; i < pts.length; i++) {
      const p = toPx(box, pts[i]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, i === drag ? 6.5 : 5, 0, Math.PI * 2);
      ctx.fillStyle = i === drag ? COL.accent() : color;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(0,0,0,.55)";
      ctx.stroke();
    }
    ctx.restore();
  }

  /** 触った所に近い点（当たり判定は 22px = 44px の触り所） */
  function nearest(box, x, y) {
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const p = toPx(box, pts[i]);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = i; }
    }
    return bd <= 22 ? best : -1;
  }

  const boxNow = () => ({ w: canvas.clientWidth || 220, h: canvas.clientHeight || 160 });

  const onDown = (ev) => {
    const box = boxNow();
    const p = localPoint(canvas, ev);
    let i = nearest(box, p.x, p.y);
    const now = Date.now();
    if (i > 0 && i < pts.length - 1 && lastTap && lastTap.i === i && now - lastTap.at < 320) {
      /* 2 回目の軽い触り = その点を消す */
      pts.splice(i, 1);
      lastTap = null;
      paint();
      c.onInput(pts.map((q) => q.slice()));
      c.onEnd();
      return;
    }
    gest = { at: now, x: p.x, y: p.y, moved: false, i };
    if (i < 0) {
      const u = toUnit(box, p.x, p.y);
      pts.push(u);
      pts = normalizeCurve(pts);
      /* 足した点は normalizeCurve で端へ寄せられる事がある。x が一番近い点を掴む */
      i = 0;
      let bx = Infinity;
      for (let k = 0; k < pts.length; k++) {
        const d = Math.abs(pts[k][0] - u[0]);
        if (d < bx) { bx = d; i = k; }
      }
      c.onInput(pts.map((q) => q.slice()));
    }
    drag = i;
    try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* 対応していない環境は無視 */ }
    ev.preventDefault();
    paint();
  };
  const onMove = (ev) => {
    if (drag < 0) return;
    const box = boxNow();
    const p = localPoint(canvas, ev);
    if (Math.hypot(p.x - gest.x, p.y - gest.y) > 8) gest.moved = true;
    const u = toUnit(box, p.x, p.y);
    const first = drag === 0;
    const last = drag === pts.length - 1;
    const x = first ? 0 : last ? 1 : clamp(u[0], pts[drag - 1][0] + 0.01, pts[drag + 1][0] - 0.01);
    pts[drag] = [x, u[1]];
    paint();
    readout.textContent = `入 ${Math.round(x * 255)} → 出 ${Math.round(u[1] * 255)}`;
    c.onInput(pts.map((q) => q.slice()));
  };
  const onUp = () => {
    if (drag < 0) return;
    const now = Date.now();
    lastTap = !gest.moved && now - gest.at < 300 ? { at: now, i: drag } : null;
    drag = -1;
    paint();
    c.onEnd();
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  const onResize = () => paint();
  globalThis.addEventListener("resize", onResize);

  paint();
  /* 最初の描画は幅が 0 のことがある（まだ append されていない） */
  const raf = requestAnimationFrame(paint);

  return {
    el: host,
    set(next, nextColor) {
      if (drag >= 0) return;                 // 掴んでいる間は上から書き換えない
      const np = normalizeCurve(next);
      const changed = !sameValue(np, pts) || (nextColor && nextColor !== color);
      if (nextColor) color = nextColor;
      pts = np;
      /* 再生中は 1 秒に何度も呼ばれる。変わっていなければ描かない */
      if (changed) paint();
    },
    dispose() {
      cancelAnimationFrame(raf);
      globalThis.removeEventListener("resize", onResize);
    }
  };
}

/* ══ 4. カラーホイール（自前・canvas + Pointer Events）══════════ */

/** 円盤の下地（色の見本）は寸法ごとに 1 回だけ作って使い回す */
const discCache = new Map();
function discImage(size) {
  const key = String(size);
  if (discCache.has(key)) return discCache.get(key);
  let out = null;
  try {
    const cv = document.createElement("canvas");
    cv.width = size;
    cv.height = size;
    const g = cv.getContext("2d");
    if (g) {
      const img = g.createImageData(size, size);
      const px = img.data;
      const half = (size - 1) / 2;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const u = (x - half) / half;
          const v = -(y - half) / half;
          const rad = Math.hypot(u, v);
          const o = (y * size + x) * 4;
          if (rad > 1) { px[o + 3] = 0; continue; }
          /* 円盤の位置 = wheels の向き。同じ式で色を作る（見た目と結果が揃う） */
          const t = polarToWheel(Math.atan2(v, u), rad, 0);
          const k = 0.5;
          px[o] = clamp(Math.round((0.5 + t[0] * k) * 255), 0, 255);
          px[o + 1] = clamp(Math.round((0.5 + t[1] * k) * 255), 0, 255);
          px[o + 2] = clamp(Math.round((0.5 + t[2] * k) * 255), 0, 255);
          /* 縁を少しだけ柔らかく（階段が出ないように） */
          px[o + 3] = Math.round(clamp((1 - rad) * size * 0.5, 0, 1) * 255);
        }
      }
      g.putImageData(img, 0, 0);
      out = cv;
    }
  } catch (e) { out = null; }
  if (discCache.size > 6) discCache.clear();
  discCache.set(key, out);
  return out;
}

/**
 * 1 つのホイール（円盤 = 色の向き / 外周のリング = 明度 / ダブルタップで中立）。
 * @param {{label:string, sub?:string, get:()=>{value:number[],mixed:boolean},
 *          onInput:(t:number[])=>void, onEnd:Function, onReset:Function}} c
 * @returns {{el:HTMLElement, refresh:Function, dispose:Function}}
 */
export function makeWheel(c) {
  const host = el("div", "vqs-col-wheel");
  const head = el("div", "vqs-col-wheel__head");
  head.append(el("span", "vqs-col-wheel__label", c.label));
  if (c.sub) head.append(el("span", "vqs-col-wheel__sub", c.sub));
  const canvas = el("canvas", "vqs-col-wheel__disc");
  canvas.style.touchAction = "none";       // CSS 担当へ: .vqs-col-wheel__disc に同じ指定を
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.setAttribute("role", "application");
  canvas.setAttribute("aria-label", c.label + "（中を触ると色の向き・外周のリングで明るさ・ダブルタップで中立）");
  canvas.setAttribute("data-test", "col-wheel");
  const nums = el("p", "vqs-col-wheel__nums", "");
  host.append(head, canvas, nums);

  let triple = [0, 0, 0];
  let mixed = false;
  let mode = "";                           // "disc" | "ring"
  /* ダブルタップの判定。**動かさずに離した 2 回**だけを数える
     （動かして離した直後の 1 回を数えると、触る度に中立へ戻って使えない） */
  let gest = { at: 0, x: 0, y: 0, moved: false };
  let lastTap = null;

  function paint() {
    const box = fitCanvas(canvas, 120, Math.max(96, Math.round(canvas.clientWidth || 120)));
    if (!box) return;
    const ctx = box.ctx;
    const R = Math.min(box.w, box.h) / 2;
    const cx = box.w / 2;
    const cy = box.h / 2;
    const ringW = Math.max(7, R * 0.16);
    const discR = R - ringW - 3;
    const pol = wheelToPolar(triple);

    /* 外周のリング（明度）*/
    ctx.save();
    ctx.lineWidth = ringW;
    ctx.strokeStyle = COL.grid();
    ctx.beginPath();
    ctx.arc(cx, cy, R - ringW / 2, 0, Math.PI * 2);
    ctx.stroke();
    const mNorm = clamp(pol.master / WHEEL_MASTER_MAX, -1, 1);
    if (Math.abs(mNorm) > 0.001) {
      ctx.strokeStyle = COL.accent();
      ctx.beginPath();
      /* 12 時から左右へ伸ばす（＋は時計回り） */
      ctx.arc(cx, cy, R - ringW / 2, -Math.PI / 2, -Math.PI / 2 + mNorm * Math.PI, mNorm < 0);
      ctx.stroke();
    }
    ctx.restore();

    /* 円盤 */
    const size = Math.max(24, Math.round(discR * 2 * box.dpr));
    const disc = discImage(Math.min(256, size));
    ctx.save();
    if (disc) ctx.drawImage(disc, cx - discR, cy - discR, discR * 2, discR * 2);
    else {
      ctx.fillStyle = COL.grid();
      ctx.beginPath();
      ctx.arc(cx, cy, discR, 0, Math.PI * 2);
      ctx.fill();
    }
    /* 中心の十字 */
    ctx.strokeStyle = "rgba(0,0,0,.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 5, cy);
    ctx.lineTo(cx + 5, cy);
    ctx.moveTo(cx, cy - 5);
    ctx.lineTo(cx, cy + 5);
    ctx.stroke();
    /* 掴み */
    const rr = clamp(pol.radius / WHEEL_RADIUS_MAX, 0, 1) * discR;
    const hx = cx + Math.cos(pol.angle) * rr;
    const hy = cy - Math.sin(pol.angle) * rr;
    ctx.beginPath();
    ctx.arc(hx, hy, 7, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(0,0,0,.6)";
    ctx.stroke();
    ctx.restore();

    nums.textContent = mixed
      ? "—"
      : `R ${sign(triple[0])} G ${sign(triple[1])} B ${sign(triple[2])} ／ 明 ${sign(pol.master)}`;
    host.classList.toggle("vqs-field--mixed", mixed);
  }
  const sign = (v) => (finite(v, 0) >= 0 ? "+" : "−") + fmtNum(Math.abs(finite(v, 0)) * 100, 0);

  function fromPoint(p) {
    const w = canvas.clientWidth || 120;
    const h = canvas.clientHeight || 120;
    const R = Math.min(w, h) / 2;
    const cx = w / 2;
    const cy = h / 2;
    const ringW = Math.max(7, R * 0.16);
    const discR = R - ringW - 3;
    const dx = p.x - cx;
    const dy = cy - p.y;
    const dist = Math.hypot(dx, dy);
    const pol = wheelToPolar(triple);
    if (mode === "ring") {
      /* 12 時を 0 とした角度 → 明度（±WHEEL_MASTER_MAX） */
      let a = Math.atan2(dx, dy);                       // 12 時が 0・時計回りが ＋
      const m = clamp(a / Math.PI, -1, 1) * WHEEL_MASTER_MAX;
      return polarToWheel(pol.angle, pol.radius, m);
    }
    const rad = clamp(dist / Math.max(1, discR), 0, 1) * WHEEL_RADIUS_MAX;
    return polarToWheel(Math.atan2(dy, dx), rad, pol.master);
  }

  const onDown = (ev) => {
    const p = localPoint(canvas, ev);
    const w = canvas.clientWidth || 120;
    const h = canvas.clientHeight || 120;
    const R = Math.min(w, h) / 2;
    const ringW = Math.max(7, R * 0.16);
    const dist = Math.hypot(p.x - w / 2, p.y - h / 2);
    gest = { at: Date.now(), x: p.x, y: p.y, moved: false };
    mode = dist > R - ringW - 3 ? "ring" : "disc";
    try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* noop */ }
    ev.preventDefault();
    triple = fromPoint(p);
    mixed = false;
    paint();
    c.onInput(triple.slice());
  };
  const onMove = (ev) => {
    if (!mode) return;
    const p = localPoint(canvas, ev);
    if (Math.hypot(p.x - gest.x, p.y - gest.y) > 8) gest.moved = true;
    triple = fromPoint(p);
    paint();
    c.onInput(triple.slice());
  };
  const onUp = () => {
    if (!mode) return;
    mode = "";
    const now = Date.now();
    const clean = !gest.moved && now - gest.at < 300;
    if (clean && lastTap && now - lastTap.at < 320
        && Math.hypot(gest.x - lastTap.x, gest.y - lastTap.y) < 24) {
      lastTap = null;
      c.onEnd();                           // 触った分を先に確定してから中立へ（取消 2 回で戻る）
      c.onReset();
      return;
    }
    lastTap = clean ? { at: now, x: gest.x, y: gest.y } : null;
    c.onEnd();
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("dblclick", (ev) => { ev.preventDefault(); c.onReset(); });
  const onResize = () => paint();
  globalThis.addEventListener("resize", onResize);

  function refresh() {
    if (mode) return;                      // 触っている間は上から書き換えない
    const r = c.get ? c.get() : { value: [0, 0, 0], mixed: false };
    const v = Array.isArray(r.value) ? r.value : [0, 0, 0];
    const next = [finite(v[0], 0), finite(v[1], 0), finite(v[2], 0)];
    if (!sameValue(next, triple) || mixed !== !!r.mixed) {
      triple = next;
      mixed = !!r.mixed;
      paint();
    }
  }
  refresh();
  const raf = requestAnimationFrame(paint);

  return {
    el: host,
    refresh,
    dispose() {
      cancelAnimationFrame(raf);
      globalThis.removeEventListener("resize", onResize);
    }
  };
}

/* ══ 5. LUT の受け皿（engine/fx/luts.js は動的に読む）════════════ */

/** この画面で読み込んだ .cube（パネルを作り直しても残るように module に置く） */
const userLuts = new Map();

/** BUILTIN_LUTS の形が配列でも object でも受ける */
export function normalizeLutList(raw) {
  const out = [];
  const seen = new Set();
  const push = (id, name) => {
    const i = String(id == null ? "" : id).trim();
    if (!i || seen.has(i)) return;
    seen.add(i);
    out.push({ id: i, name: String(name == null || name === "" ? i : name) });
  };
  if (Array.isArray(raw)) {
    for (const e of raw) {
      if (typeof e === "string") push(e, e);
      else if (e && typeof e === "object") push(e.id || e.key || e.name, e.name || e.label || e.title || e.id);
    }
  } else if (raw && typeof raw === "object") {
    for (const k of Object.keys(raw)) {
      const e = raw[k];
      push(k, e && typeof e === "object" ? (e.name || e.label || e.title || k) : (typeof e === "string" ? e : k));
    }
  }
  return out;
}

/* ══ 6. 本体 ══════════════════════════════════════════════════════ */

/**
 * 「カラー」タブ。
 * @param {{store:Object, widgets?:Object, clipIds:string[], compositor?:Object,
 *          transport?:Object, ctx?:Object, els?:Object}} o
 * @returns {{el:HTMLElement, update:Function, dispose:Function, reset:Function}}
 */
export function createColorPanel(o) {
  const store = o.store;
  const ctx = o.ctx || null;
  const els = o.els || (ctx && ctx.els) || {};
  const compositor = o.compositor || (ctx && ctx.compositor) || null;
  const kit = createFieldKit({
    store, widgets: o.widgets, clipIds: o.clipIds,
    transport: o.transport || (ctx && ctx.transport) || null
  });
  const root = el("div", "vqs-col");
  root.setAttribute("data-test", "insp-color");
  /** dispose でまとめて外す */
  const cleanups = [];
  /** 少し待ってからやる事（dispose 後に走らせない。ここを忘れると null を触る） */
  const timers = new Set();
  function later(fn, ms) {
    const t = setTimeout(() => {
      timers.delete(t);
      if (dead) return;
      try { fn(); } catch (e) { warn("color", "遅延処理で失敗", e); }
    }, ms);
    timers.add(t);
    return t;
  }
  cleanups.push(() => { for (const t of timers) clearTimeout(t); timers.clear(); });
  const wheelParts = [];
  let curve = null;
  let scopes = null;
  let dead = false;

  /* ── 読み書きの口 ─────────────────────────────────────────────── */

  /** 色が意味を持つクリップだけ（音声に色は無い） */
  const targets = () => kit.clips().filter((c) => String(c.kind) !== "audio");
  /** 対象の共通値（違えば mixed。kit.read の対象を絞った版） */
  function readT(get) {
    const list = targets();
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
  /** 先頭クリップの色（無ければ既定） */
  const grade0 = () => {
    const list = targets();
    return (list[0] && list[0].color) || defaultColorGrade();
  };
  /** 色を当てる（1 操作 1 undo。coalesce は kit.driver と噛み合う） */
  function setGrade(patch, label) {
    const ids = targets().map((c) => c.id);
    if (!ids.length) { kit.toast("色を変えられるクリップが選ばれていません", { kind: "info" }); return null; }
    return kit.patch("clip.setColor", { clipIds: ids, patch }, { label: label || "カラー", coalesce: true });
  }
  /** 数値 1 本 */
  const setNum = (key, v, label) => setGrade({ [key]: v }, label || "カラー");

  /* ══ 節 1. 基本 ═══════════════════════════════════════════════ */
  const secBasic = kit.section({ title: "基本", id: "color-basic" });
  for (const f of BASIC) {
    const path = "color." + f.key;
    const host = el("div", "vqs-col-row");
    host.setAttribute("data-test", "col-row-" + f.key);
    host.append(kit.keyframeMark(path, f.label));
    const lab = el("span", "vqs-col-row__label", f.label);
    if (f.hint) lab.title = f.hint;
    const get = () => readT((c) => finite(c.color && c.color[f.key], 0));
    const common = {
      label: f.label, unit: f.unit, min: f.min, max: f.max, step: f.step,
      digits: f.digits, scale: f.scale, center: f.center, get,
      onInput: (v) => setNum(f.key, clamp(v, f.min / f.scale, f.max / f.scale), f.label)
    };
    const sl = kit.sld(common);
    const nm = kit.num(common);
    const rs = kit.btn("↺", () => { setNum(f.key, 0, f.label + "を戻す"); kit.update(); }, {
      cls: "vqs-btn--ghost vqs-col-row__reset", title: f.label + "を既定（0）へ戻す"
    });
    const ctl = el("div", "vqs-col-row__ctl");
    ctl.append(sl.el, nm.el, rs);
    host.append(lab, ctl);
    if (f.hint) host.append(el("p", "vqs-insp-hint", f.hint));
    secBasic.body.append(host);
  }
  secBasic.add(kit.btnRow([
    kit.btn("基本だけ戻す", () => {
      const patch = {};
      for (const f of BASIC) patch[f.key] = 0;
      setGrade(patch, "基本を戻す");
      kit.update();
    }, { cls: "vqs-btn--ghost", test: "col-basic-reset" })
  ]));

  /* ══ 節 2. カーブ ═════════════════════════════════════════════ */
  const secCurve = kit.section({ title: "カーブ", id: "color-curve" });
  let curCh = readLast(LAST_CURVE_KEY, "rgb", CURVE_CHANNELS.map((c) => c.id));
  const chanOf = (id) => CURVE_CHANNELS.find((c) => c.id === id) || CURVE_CHANNELS[0];
  /** その面の点（null = まだ触っていない = 直線） */
  function curvePts(ch) {
    const g = grade0();
    const cv = (g && g.curves) || {};
    const v = cv[ch];
    return Array.isArray(v) && v.length >= 2 ? normalizeCurve(v) : [[0, 0], [1, 1]];
  }
  const curveDrv = kit.driver({
    label: "カーブ",
    apply: (pts) => setGrade({ curves: { [curCh]: pts } }, "カーブ")
  });
  const chanSeg = kit.seg({
    label: "カーブの面",
    items: CURVE_CHANNELS.map((c) => ({ value: c.id, label: c.label })),
    get: () => ({ value: curCh, mixed: false }),
    onChange: (v) => {
      curCh = String(v);
      writeLast(LAST_CURVE_KEY, curCh);
      kit.update();
      if (curve) curve.set(curvePts(curCh), chanOf(curCh).color);
    }
  });
  secCurve.add(chanSeg.el);
  const curveHost = el("div", "vqs-col-curve-host");
  secCurve.body.append(curveHost);
  const curvePresetRow = el("div", "vqs-insp-presets vqs-col-presets");
  for (const p of CURVE_PRESETS) {
    curvePresetRow.append(kit.btn(p.label, () => {
      setGrade({ curves: { [curCh]: p.pts.map((q) => q.slice()) } }, "カーブ（" + p.label + "）");
      if (curve) curve.set(curvePts(curCh), chanOf(curCh).color);
    }, { cls: "vqs-btn--ghost", test: "col-curve-" + p.id }));
  }
  secCurve.body.append(curvePresetRow);
  secCurve.add(kit.btnRow([
    kit.btn("この面を使わない", () => {
      setGrade({ curves: { [curCh]: curCh === "rgb" ? [[0, 0], [1, 1]] : null } }, "カーブを外す");
      if (curve) curve.set(curvePts(curCh), chanOf(curCh).color);
    }, { cls: "vqs-btn--ghost", test: "col-curve-clear" })
  ]));
  buildCurve();

  function buildCurve() {
    curveHost.textContent = "";
    if (curve && typeof curve.dispose === "function") { try { curve.dispose(); } catch (e) { /* noop */ } }
    curve = null;
    const points = curvePts(curCh);
    const color = chanOf(curCh).color;
    const onInput = (pts) => curveDrv.input(normalizeCurve(pts));
    const made = kit.tryW("curveEditor", { points, color, onChange: onInput, onInput, min: 0, max: 1 });
    if (made) {
      curveHost.append(made);
      let shown = null;
      curve = {
        el: made,
        set(pts) {
          const np = normalizeCurve(pts);
          if (sameValue(np, shown)) return;
          shown = np;
          if (typeof made.vqsSet === "function") { try { made.vqsSet(np); } catch (e) { /* noop */ } }
        },
        dispose() { /* widgets 側の後始末に任せる */ }
      };
      return;
    }
    curve = makeCurveEditor({
      points, color, label: chanOf(curCh).label + " カーブ",
      onInput, onEnd: () => curveDrv.end()
    });
    curveHost.append(curve.el);
  }

  /* ══ 節 3. カラーホイール ═════════════════════════════════════ */
  const secWheel = kit.section({ title: "カラーホイール", id: "color-wheels" });
  const wheelGrid = el("div", "vqs-col-wheels");
  /* CSS 担当が来る前でも 2 列に並ぶように（timeline のタブ帯と同じ作法で
     最小限だけ inline。細かい寸法と間隔は .vqs-col-wheels 側で決めてほしい） */
  wheelGrid.style.display = "grid";
  wheelGrid.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
  wheelGrid.style.gap = "8px";
  for (const w of WHEELS) {
    const paths = [0, 1, 2].map((i) => `color.wheels.${w.key}.${i}`);
    const drv = kit.driver({
      label: w.label,
      apply: (t) => setGrade({ wheels: { [w.key]: t } }, w.label)
    });
    const cell = el("div", "vqs-col-wheels__cell");
    cell.append(kit.keyframeMark(paths, w.label));
    const part = makeWheel({
      label: w.label, sub: w.sub,
      get: () => readT((c) => {
        const t = c.color && c.color.wheels && c.color.wheels[w.key];
        return Array.isArray(t) ? [finite(t[0], 0), finite(t[1], 0), finite(t[2], 0)] : [0, 0, 0];
      }),
      onInput: (t) => drv.input(t),
      onEnd: () => drv.end(),
      onReset: () => { setGrade({ wheels: { [w.key]: [0, 0, 0] } }, w.label + "を中立へ"); kit.update(); part.refresh(); }
    });
    wheelParts.push(part);
    cell.append(part.el);
    wheelGrid.append(cell);
  }
  secWheel.body.append(wheelGrid);
  secWheel.add(
    kit.note("円盤の中を触ると色の向き、外周のリングで明るさ。ダブルタップで中立に戻ります。", "hint"),
    kit.btnRow([
      kit.btn("4 つとも中立へ", () => {
        setGrade({ wheels: { lift: [0, 0, 0], gamma: [0, 0, 0], gain: [0, 0, 0], offset: [0, 0, 0] } }, "ホイールを中立へ");
        kit.update();
        for (const p of wheelParts) p.refresh();
      }, { cls: "vqs-btn--ghost", test: "col-wheels-reset" })
    ])
  );

  /* ══ 節 4. HSL 個別調整 ═══════════════════════════════════════ */
  const secHsl = kit.section({ title: "HSL 個別調整", id: "color-hsl", open: false });
  let bandIdx = clamp(parseInt(readLast(LAST_BAND_KEY, "0", null), 10) || 0, 0, HSL_BANDS.length - 1);

  /** 保存されている hsl を 6 帯域へ並べ直す（無い帯域は 0） */
  function bands() {
    const g = grade0();
    const src = Array.isArray(g && g.hsl) ? g.hsl : [];
    return HSL_BANDS.map((b) => {
      let best = null;
      let bd = Infinity;
      for (const e of src) {
        const d = Math.abs(hueDistance(finite(e && e.hue, 0), b.hue));
        if (d < bd) { bd = d; best = e; }
      }
      const use = best && bd <= 24 ? best : null;
      return {
        hue: use ? finite(use.hue, b.hue) : b.hue,
        range: clamp(finite(use && use.range, b.range), 1, 180),
        h: finite(use && use.h, 0), s: finite(use && use.s, 0), l: finite(use && use.l, 0)
      };
    });
  }
  function writeBand(patch, label) {
    const list = bands();
    list[bandIdx] = Object.assign({}, list[bandIdx], patch);
    setGrade({ hsl: list }, label || "HSL");
  }
  const bandRow = el("div", "vqs-col-bands");
  bandRow.setAttribute("role", "group");
  bandRow.setAttribute("aria-label", "調整する色の帯");
  const bandBtns = [];
  HSL_BANDS.forEach((b, i) => {
    const btn = el("button", "vqs-col-bands__btn");
    btn.type = "button";
    btn.title = b.label + "の色だけを調整する";
    btn.setAttribute("data-value", b.id);
    btn.setAttribute("data-test", "col-band-" + b.id);
    const sw = el("i", "vqs-col-bands__sw");
    sw.style.background = b.css;
    btn.append(sw, el("span", "vqs-col-bands__label", b.label));
    touch44(btn);
    btn.addEventListener("click", () => {
      bandIdx = i;
      writeLast(LAST_BAND_KEY, String(i));
      paintBands();
      kit.update();
    });
    bandBtns.push(btn);
    bandRow.append(btn);
  });
  function paintBands() {
    const list = bands();
    bandBtns.forEach((btn, i) => {
      const on = i === bandIdx;
      btn.classList.toggle("vqs-col-bands__btn--on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      const b = list[i];
      const touched = Math.abs(b.h) + Math.abs(b.s) + Math.abs(b.l) > 1e-6;
      btn.classList.toggle("vqs-col-bands__btn--has", touched);
    });
  }
  secHsl.body.append(bandRow);
  for (const f of HSL_FIELDS) {
    secHsl.add(kit.row({
      label: f.label,
      field: kit.sld({
        label: f.label, unit: f.unit, min: f.min, max: f.max, step: f.step,
        digits: f.digits, scale: f.scale, center: 0,
        get: () => readT(() => finite(bands()[bandIdx][f.key], 0)),
        onInput: (v) => writeBand({ [f.key]: clamp(v, f.min / f.scale, f.max / f.scale) }, "HSL（" + f.label + "）")
      }),
      onReset: () => { writeBand({ [f.key]: 0 }, "HSL を戻す"); kit.update(); }
    }));
  }
  secHsl.add(kit.row({
    label: "帯の広さ",
    field: kit.sld({
      label: "帯の広さ", unit: "°", min: 5, max: 90, step: 1, digits: 0, scale: 1, center: 30,
      get: () => readT(() => clamp(finite(bands()[bandIdx].range, 30), 1, 180)),
      onInput: (v) => writeBand({ range: clamp(v, 1, 180) }, "帯の広さ")
    })
  }));
  const pickSwatch = el("i", "vqs-col-pick__sw");
  const pickBtn = kit.btn("プレビューから色を吸う", () => beginPick(), { cls: "vqs-btn--ghost", test: "col-pick" });
  pickBtn.prepend(pickSwatch);
  secHsl.add(
    kit.btnRow([
      pickBtn,
      kit.btn("この帯を戻す", () => { writeBand({ h: 0, s: 0, l: 0 }, "HSL を戻す"); kit.update(); paintBands(); }, { cls: "vqs-btn--ghost" }),
      kit.btn("全部の帯を戻す", () => {
        setGrade({ hsl: HSL_BANDS.map((b) => ({ hue: b.hue, range: b.range, h: 0, s: 0, l: 0 })) }, "HSL を戻す");
        kit.update();
        paintBands();
      }, { cls: "vqs-btn--ghost" })
    ]),
    kit.note("「色を吸う」を押してからプレビューを触ると、その色に一番近い帯を選びます（Esc でやめる）。", "hint")
  );
  paintBands();

  /* ── 色を吸う（compositor.grabPixels を使う）─────────────────── */
  let pickOff = null;
  function endPick() {
    if (typeof pickOff === "function") { try { pickOff(); } catch (e) { /* noop */ } }
    pickOff = null;
  }
  cleanups.push(endPick);
  function beginPick() {
    const canvas = els.previewCanvas || document.getElementById("previewCanvas");
    if (!canvas || !compositor || typeof compositor.grabPixels !== "function") {
      kit.toast("この画面ではプレビューから色を吸えません", { kind: "info" });
      return;
    }
    if (pickOff) { endPick(); return; }
    pickBtn.classList.add("vqs-btn--on");
    const prevCursor = canvas.style.cursor;
    canvas.style.cursor = "crosshair";
    kit.toast("プレビューを触ると、その色の帯を選びます", { kind: "info" });
    const onDown = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      grabAt(canvas, ev);
      endPick();
    };
    const onKey = (ev) => { if (ev.key === "Escape") endPick(); };
    canvas.addEventListener("pointerdown", onDown, true);
    globalThis.addEventListener("keydown", onKey, true);
    pickOff = () => {
      canvas.removeEventListener("pointerdown", onDown, true);
      globalThis.removeEventListener("keydown", onKey, true);
      canvas.style.cursor = prevCursor;
      pickBtn.classList.remove("vqs-btn--on");
    };
  }
  /** 触った所の色を 3×3 の平均で読む（1 画素だけだとノイズで揺れる） */
  function grabAt(canvas, ev) {
    let img = null;
    try { img = compositor.grabPixels(); } catch (e) { img = null; }
    if (!img || !img.data || !img.width) { kit.toast("映像を読めませんでした", { kind: "error" }); return; }
    const r = canvas.getBoundingClientRect();
    const u = clamp((ev.clientX - r.left) / Math.max(1, r.width), 0, 1);
    const v = clamp((ev.clientY - r.top) / Math.max(1, r.height), 0, 1);
    const cx = Math.min(img.width - 1, Math.floor(u * img.width));
    const cy = Math.min(img.height - 1, Math.floor(v * img.height));
    let R = 0;
    let G = 0;
    let B = 0;
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = clamp(cx + dx, 0, img.width - 1);
        const y = clamp(cy + dy, 0, img.height - 1);
        const i = (y * img.width + x) * 4;
        R += img.data[i];
        G += img.data[i + 1];
        B += img.data[i + 2];
        n++;
      }
    }
    R = Math.round(R / n);
    G = Math.round(G / n);
    B = Math.round(B / n);
    const hsl = rgbToHsl(R, G, B);
    const hex = rgbToHex(R / 255, G / 255, B / 255);   // core/util.js の rgbToHex は 0..1
    pickSwatch.style.background = hex;
    if (hsl.s < 0.06) {
      kit.toast(`吸った色は ${hex}（無彩色に近いので帯は選べません）`, { kind: "info" });
      return;
    }
    let best = 0;
    let bd = Infinity;
    HSL_BANDS.forEach((b, i) => {
      const d = Math.abs(hueDistance(hsl.h, b.hue));
      if (d < bd) { bd = d; best = i; }
    });
    bandIdx = best;
    writeLast(LAST_BAND_KEY, String(best));
    /* 帯の中心を吸った色へ寄せる（狙った色だけに効くように） */
    writeBand({ hue: Math.round(hsl.h) }, "帯の中心を合わせる");
    paintBands();
    kit.update();
    kit.toast(`${hex} → 「${HSL_BANDS[best].label}」の帯を選びました`, { kind: "info" });
  }

  /* ══ 節 5. LUT ════════════════════════════════════════════════ */
  const secLut = kit.section({ title: "LUT", id: "color-lut", open: false });
  const lutState = { mod: null, list: [], loaded: false, parse: null, reg: null };
  const lutSel = kit.sel({
    label: "LUT",
    items: [{ value: "", label: "なし" }],
    get: () => readT((c) => (c.color && c.color.lut && c.color.lut.id) || ""),
    onChange: (v) => {
      const id = String(v || "");
      const amount = finite((grade0().lut || {}).amount, 1);
      setGrade({ lut: id ? { id, amount: clamp(amount, 0, 1) || 1 } : null }, "LUT");
      kit.update();
    }
  });
  const lutNote = kit.note("内蔵の LUT を読み込んでいます…", "hint");
  const lutFile = el("input", "vqs-col-lut__file");
  lutFile.type = "file";
  lutFile.accept = ".cube,.CUBE,text/plain";
  lutFile.hidden = true;
  lutFile.setAttribute("data-test", "col-lut-file");
  lutFile.addEventListener("change", () => {
    const f = lutFile.files && lutFile.files[0];
    lutFile.value = "";
    if (f) loadCube(f);
  });
  secLut.add(
    kit.row({ label: "LUT", field: lutSel }),
    kit.row({
      label: "適用量",
      field: kit.sld({
        label: "適用量", unit: "%", min: 0, max: 100, step: 1, digits: 0, scale: 100, center: 100,
        get: () => readT((c) => (c.color && c.color.lut ? clamp(finite(c.color.lut.amount, 1), 0, 1) : 1)),
        onInput: (v) => {
          const cur = grade0().lut;
          if (!cur || !cur.id) return;
          setGrade({ lut: { id: cur.id, amount: clamp(v, 0, 1) } }, "LUT の量");
        }
      })
    }),
    kit.btnRow([
      kit.btn(".cube を読み込む", () => lutFile.click(), { cls: "vqs-btn--ghost", test: "col-lut-load" }),
      kit.btn("LUT を外す", () => { setGrade({ lut: null }, "LUT を外す"); kit.update(); }, { cls: "vqs-btn--ghost" })
    ]),
    lutNote
  );
  secLut.body.append(lutFile);

  /** 内蔵 LUT を読む（engine/fx/luts.js はまだ無いことがある） */
  (async function loadLutModule() {
    let mod = null;
    try { mod = await import("../../engine/fx/luts.js"); }
    catch (e) { mod = null; }
    if (dead) return;
    lutState.mod = mod;
    lutState.loaded = true;
    lutState.parse = mod && typeof mod.parseCubeLUT === "function" ? mod.parseCubeLUT : null;
    for (const n of ["registerLUT", "addLUT", "putLUT", "addLut", "register"]) {
      if (mod && typeof mod[n] === "function") { lutState.reg = mod[n]; break; }
    }
    lutState.list = normalizeLutList(mod && (mod.BUILTIN_LUTS || mod.LUTS || mod.default));
    refreshLutItems();
    lutNote.textContent = lutState.list.length
      ? `内蔵 ${lutState.list.length} 種。.cube（3D LUT）も読み込めます。`
      : "内蔵 LUT はまだ用意されていません（.cube の読み込みは試せます）。";
  })();

  function refreshLutItems() {
    const items = [{ value: "", label: "なし" }]
      .concat(lutState.list.map((l) => ({ value: l.id, label: l.name })))
      .concat(Array.from(userLuts.values()).map((l) => ({ value: l.id, label: l.name + "（読み込み）" })));
    /* kit.sel は items を作り直せないので、中の <select> を直に組み替える */
    const sel = lutSel.el.querySelector("select");
    if (!sel) return;
    const keep = sel.value;
    sel.textContent = "";
    for (const it of items) {
      const op = el("option", "", it.label);
      op.value = String(it.value);
      sel.append(op);
    }
    if (items.some((it) => String(it.value) === keep)) sel.value = keep;
    kit.update();
  }

  async function loadCube(file) {
    let text = "";
    try {
      text = typeof file.text === "function" ? await file.text() : await readAsText(file);
    } catch (e) {
      kit.toast("ファイルを読めませんでした", { kind: "error" });
      return;
    }
    if (dead) return;
    let parsed = null;
    try {
      parsed = lutState.parse ? lutState.parse(text, file.name) : parseCubeText(text, file.name);
    } catch (e) {
      kit.toast((e && e.message) || ".cube を読めませんでした", { kind: "error" });
      return;
    }
    if (!parsed) { kit.toast(".cube を読めませんでした", { kind: "error" }); return; }
    let id = String(parsed.id || "");
    if (lutState.reg) {
      try {
        const r = lutState.reg(parsed);
        const got = typeof r === "string" ? r : (r && (r.id || r.key)) || "";
        if (got) id = String(got);
      } catch (e) { warn("color", "LUT を登録できなかった", e); }
    }
    if (!id) id = "lut_user_" + (parsed.name || "cube").replace(/[^\w-]+/g, "_").slice(0, 24) + "_" + userLuts.size;
    userLuts.set(id, { id, name: String(parsed.name || file.name || "LUT"), size: finite(parsed.size, 0) });
    refreshLutItems();
    setGrade({ lut: { id, amount: 1 } }, "LUT を読み込む");
    kit.update();
    kit.toast(lutState.reg
      ? `${parsed.name || file.name} を読み込みました`
      : `${parsed.name || file.name} を読み込みました（映像に出るのは LUT の受け皿ができてからです）`,
    { kind: lutState.reg ? "success" : "info" });
  }

  function readAsText(file) {
    return new Promise((resolve, reject) => {
      try {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result || ""));
        fr.onerror = () => reject(new Error("読み込みに失敗しました"));
        fr.readAsText(file);
      } catch (e) { reject(e); }
    });
  }

  /* ══ 節 6. プリセット ═════════════════════════════════════════ */
  const secPreset = kit.section({ title: "プリセット", id: "color-preset" });
  const presetGrid = el("div", "vqs-insp-presets vqs-col-looks");
  for (const look of LOOK_PRESETS) {
    const b = el("button", "vqs-col-looks__btn");
    b.type = "button";
    b.setAttribute("data-value", look.id);
    b.setAttribute("data-test", "col-look-" + look.id);
    b.title = look.name + "（基本・カーブ・LUT をまとめて当てます）";
    const sw = el("i", "vqs-col-looks__sw");
    sw.style.background = lookSwatch(look);
    b.append(sw, el("span", "vqs-col-looks__label", look.name));
    touch44(b);
    b.addEventListener("click", () => applyLook(look));
    presetGrid.append(b);
  }
  secPreset.body.append(presetGrid);

  const nameInput = el("input", "vqs-col-save__name");
  nameInput.type = "text";
  nameInput.placeholder = "この色に名前を付けて保存";
  nameInput.setAttribute("aria-label", "プリセットの名前");
  nameInput.autocomplete = "off";
  if (isTouch()) nameInput.style.minHeight = "44px";
  const userList = el("div", "vqs-col-users");
  secPreset.add(
    kit.btnRow([nameInput, kit.btn("保存", () => saveUserPreset(), { cls: "vqs-btn--ghost", test: "col-save" })], "vqs-col-save"),
    userList,
    kit.btnRow([
      kit.btn("このクリップの色を全クリップへ", () => applyToAll(), { cls: "vqs-btn--ghost", test: "col-all" }),
      kit.btn("色を全部戻す", () => { setGrade(null, "色を戻す"); afterBigChange(); }, { cls: "vqs-btn--ghost", test: "col-reset-all" })
    ])
  );
  paintUserList();

  /** プリセットの見本色（温度と彩度から作る。目で選べるように） */
  function lookSwatch(look) {
    const g = look.grade || {};
    const temp = finite(g.temperature, 0);
    const sat = finite(g.saturation, 0);
    const ex = finite(g.exposure, 0);
    const base = 0.5 + ex * 0.25;
    const warm = [base + temp * 0.35, base + temp * 0.05, base - temp * 0.3];
    const cool = [base - temp * 0.1, base + 0.02, base + Math.abs(temp) * 0.1];
    const mix = (c) => {
      const gray = (c[0] + c[1] + c[2]) / 3;
      const k = clamp(1 + sat, 0, 2);
      /* rgbToHex は 0..1 を受ける（0..255 を渡すと全部白になる） */
      return rgbToHex(
        clamp(gray + (c[0] - gray) * k, 0, 1),
        clamp(gray + (c[1] - gray) * k, 0, 1),
        clamp(gray + (c[2] - gray) * k, 0, 1)
      );
    };
    return `linear-gradient(135deg, ${mix(warm)}, ${mix(cool)})`;
  }

  /** プリセット（部分）→ 完全な ColorGrade（当てる度に積み重ならないように） */
  function gradeFromLook(look) {
    const g = defaultColorGrade();
    const p = (look && look.grade) || {};
    for (const k of Object.keys(p)) {
      if (k === "curves") {
        const cv = deepClone(p.curves) || {};
        for (const ch of ["rgb", "r", "g", "b", "luma"]) {
          if (Array.isArray(cv[ch])) g.curves[ch] = normalizeCurve(cv[ch]);
        }
      } else if (k === "wheels") {
        const wh = deepClone(p.wheels) || {};
        for (const w of WHEELS) if (Array.isArray(wh[w.key])) g.wheels[w.key] = wh[w.key].map((v) => clamp(finite(v, 0), -1, 1));
      } else if (k === "hsl") {
        const list = HSL_BANDS.map((b) => ({ hue: b.hue, range: b.range, h: 0, s: 0, l: 0 }));
        for (const e of Array.isArray(p.hsl) ? p.hsl : []) {
          let best = 0;
          let bd = Infinity;
          HSL_BANDS.forEach((b, i) => {
            const d = Math.abs(hueDistance(finite(e && e.hue, 0), b.hue));
            if (d < bd) { bd = d; best = i; }
          });
          list[best] = {
            hue: finite(e.hue, HSL_BANDS[best].hue),
            range: clamp(finite(e.range, HSL_BANDS[best].range), 1, 180),
            h: clamp(finite(e.h, 0), -1, 1),
            s: clamp(finite(e.s, 0), -1, 1),
            l: clamp(finite(e.l, 0), -1, 1)
          };
        }
        g.hsl = list;
      } else if (Object.prototype.hasOwnProperty.call(g, k)) {
        g[k] = clamp(finite(p[k], 0), -1, 1);
      }
    }
    /* LUT は engine 側に同じ id が在るときだけ（無いのに指すと灰色になる） */
    const lutId = look && look.lut ? String(look.lut) : "";
    const found = lutId
      ? (lutState.list.find((l) => l.id === lutId || l.id.indexOf(lutId) >= 0) || null)
      : null;
    g.lut = found ? { id: found.id, amount: 1 } : null;
    return g;
  }

  function applyLook(look) {
    const g = look.id === "none" ? null : gradeFromLook(look);
    setGrade(g, "プリセット（" + look.name + "）");
    afterBigChange();
    kit.toast(look.id === "none" ? "色を戻しました" : `「${look.name}」を当てました`, { kind: "info" });
  }

  /** 大きく変えた後の立て直し（値・カーブ・円盤・帯を全部読み直す） */
  function afterBigChange() {
    kit.update();
    if (curve) curve.set(curvePts(curCh), chanOf(curCh).color);
    for (const p of wheelParts) p.refresh();
    paintBands();
    if (scopes && typeof scopes.refresh === "function") scopes.refresh();
  }

  /* ── 自作プリセット（localStorage）──────────────────────────── */
  function readUserPresets() {
    try {
      const raw = localStorage.getItem(USER_PRESET_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.filter((e) => e && e.id && e.grade) : [];
    } catch (e) { return []; }
  }
  function writeUserPresets(list) {
    try { localStorage.setItem(USER_PRESET_KEY, JSON.stringify(list.slice(0, 40))); return true; }
    catch (e) { kit.toast("この端末には保存できませんでした", { kind: "error" }); return false; }
  }
  function saveUserPreset() {
    const list = targets();
    if (!list.length) { kit.toast("保存する色がありません", { kind: "info" }); return; }
    const name = String(nameInput.value || "").trim() || "自作 " + (readUserPresets().length + 1);
    const grade = deepClone(list[0].color || defaultColorGrade());
    const next = readUserPresets();
    next.unshift({ id: "u_" + Date.now().toString(36), name, grade, at: Date.now() });
    if (!writeUserPresets(next)) return;
    nameInput.value = "";
    paintUserList();
    kit.toast(`「${name}」を保存しました`, { kind: "success" });
  }
  function paintUserList() {
    userList.textContent = "";
    const list = readUserPresets();
    if (!list.length) {
      userList.append(kit.note("自作のプリセットはまだありません。名前を付けて保存すると、ここに並びます。", "hint"));
      return;
    }
    for (const p of list) {
      const rowEl = el("div", "vqs-col-users__row");
      const use = kit.btn(p.name, () => {
        setGrade(deepClone(p.grade), "プリセット（" + p.name + "）");
        afterBigChange();
      }, { cls: "vqs-btn--ghost vqs-col-users__use", title: "この色を当てる" });
      const del = kit.btn("削除", () => {
        writeUserPresets(readUserPresets().filter((x) => x.id !== p.id));
        paintUserList();
      }, { cls: "vqs-btn--ghost vqs-col-users__del", title: p.name + " を消す" });
      rowEl.append(use, del);
      userList.append(rowEl);
    }
  }

  /** この色を（音声以外の）全クリップへ */
  function applyToAll() {
    const list = targets();
    if (!list.length) { kit.toast("元になるクリップが選ばれていません", { kind: "info" }); return; }
    const grade = deepClone(list[0].color || defaultColorGrade());
    const ids = [];
    for (const tr of (store.project && store.project.tracks) || []) {
      for (const c of (tr && tr.clips) || []) {
        if (!c || String(c.kind) === "audio" || c.locked) continue;
        ids.push(String(c.id));
      }
    }
    if (!ids.length) { kit.toast("当てられるクリップがありません", { kind: "info" }); return; }
    const r = kit.patch("clip.setColor", { clipIds: ids, patch: grade }, { label: "色を全クリップへ" });
    if (r) kit.toast(`${ids.length} 個のクリップへ色を当てました（取り消せます）`, { kind: "success" });
  }

  /* ══ 節 7. 比較（補正前 / 後）═════════════════════════════════ */
  const secCmp = kit.section({ title: "比較", id: "color-compare" });
  const cmpBtn = el("button", "vqs-col-cmp");
  cmpBtn.type = "button";
  cmpBtn.textContent = "押している間だけ補正前";
  cmpBtn.setAttribute("data-test", "col-compare");
  cmpBtn.title = "押している間だけ色補正を外して見せます";
  touch44(cmpBtn);
  const cmpBadge = el("span", "vqs-col-cmp__badge", "補正前");
  cmpBadge.hidden = true;
  const cmp = { held: false, timer: 0, mode: "" };

  /** 色を外した project の複製（比較の②の道） */
  function neutralProject() {
    const p = typeof store.snapshot === "function" ? store.snapshot() : deepClone(store.project);
    const only = new Set(targets().map((c) => c.id));
    const walk = (tracks) => {
      for (const tr of tracks || []) {
        for (const c of (tr && tr.clips) || []) {
          if (!c) continue;
          if (!only.size || only.has(String(c.id))) c.color = null;
          if (c.compound && Array.isArray(c.compound.tracks)) walk(c.compound.tracks);
        }
      }
    };
    walk(p && p.tracks);
    return p;
  }
  function renderProject(project) {
    if (!compositor || typeof compositor.renderFrame !== "function") return false;
    try {
      const out = compositor.renderFrame(project, kit.now(), {
        sources: (ctx && ctx.sources) || o.sources || null,
        quality: 1
      });
      if (out && typeof out.catch === "function") out.catch((e) => warn("color", "比較の描画で失敗", e));
      return true;
    } catch (e) {
      warn("color", "比較の描画で失敗", e);
      return false;
    }
  }
  function cmpStart() {
    if (cmp.held) return;
    cmp.held = true;
    cmpBtn.classList.add("vqs-col-cmp--on");
    cmpBadge.hidden = false;
    /* ① engine が対応していればそれが一番素直 */
    if (compositor && typeof compositor.setBypass === "function") {
      cmp.mode = "bypass";
      try { compositor.setBypass({ color: true }); } catch (e) { cmp.mode = ""; }
    } else if (compositor && typeof compositor.setColorBypass === "function") {
      cmp.mode = "bypass2";
      try { compositor.setColorBypass(true); } catch (e) { cmp.mode = ""; }
    }
    if (cmp.mode === "bypass" || cmp.mode === "bypass2") {
      renderProject(store.project);
    } else {
      /* ② 色を外した複製を描き続ける（他の描画に上書きされても戻らないように） */
      cmp.mode = "repaint";
      const p = neutralProject();
      if (!renderProject(p)) {
        kit.toast("この画面では比較できません（プレビューが動いていません）", { kind: "info" });
        cmpEnd();
        return;
      }
      cmp.timer = setInterval(() => renderProject(p), 150);
    }
    later(() => { if (cmp.held && scopes && typeof scopes.refresh === "function") scopes.refresh(); }, 40);
  }
  function cmpEnd() {
    if (!cmp.held) return;
    cmp.held = false;
    cmpBtn.classList.remove("vqs-col-cmp--on");
    cmpBadge.hidden = true;
    if (cmp.timer) { clearInterval(cmp.timer); cmp.timer = 0; }
    if (cmp.mode === "bypass") { try { compositor.setBypass({ color: false }); } catch (e) { /* noop */ } }
    if (cmp.mode === "bypass2") { try { compositor.setColorBypass(false); } catch (e) { /* noop */ } }
    cmp.mode = "";
    renderProject(store.project);
    later(() => { if (scopes && typeof scopes.refresh === "function") scopes.refresh(); }, 40);
  }
  cmpBtn.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    try { cmpBtn.setPointerCapture(ev.pointerId); } catch (e) { /* noop */ }
    cmpStart();
  });
  for (const n of ["pointerup", "pointercancel", "pointerleave", "blur"]) cmpBtn.addEventListener(n, cmpEnd);
  cmpBtn.addEventListener("keydown", (ev) => { if (ev.key === " " || ev.key === "Enter") { ev.preventDefault(); cmpStart(); } });
  cmpBtn.addEventListener("keyup", (ev) => { if (ev.key === " " || ev.key === "Enter") cmpEnd(); });
  cleanups.push(cmpEnd);
  const cmpRow = el("div", "vqs-col-cmp__row");
  cmpRow.append(cmpBtn, cmpBadge);
  secCmp.body.append(cmpRow);
  secCmp.add(kit.note("押している間だけ、選んでいるクリップの色補正を外します（指を離すと戻ります）。", "hint"));

  /* ══ 節 8. 計測器（波形・ヒストグラム・ベクトル）══════════════ */
  const secScope = kit.section({ title: "計測器", id: "color-scopes" });
  const scopeHost = el("div", "vqs-col-scopehost");
  secScope.body.append(scopeHost);
  (async function mountScopes() {
    let mod = null;
    try { mod = await import("../scopes.js"); }
    catch (e) { mod = null; }
    if (dead) return;
    if (!mod || typeof mod.createScopes !== "function") {
      scopeHost.append(kit.note("計測器はまだ読み込めません。", "hint"));
      return;
    }
    try {
      scopes = mod.createScopes({ compositor, store, widgets: kit.widgets, els: {} });
      scopeHost.append(scopes.el);
    } catch (e) {
      warn("color", "計測器を作れなかった", e);
      scopeHost.append(kit.note("計測器を出せませんでした。", "hint"));
    }
  })();

  /* ── 組み立て ─────────────────────────────────────────────────── */
  root.append(secBasic.el, secCurve.el, secWheel.el, secHsl.el, secLut.el, secPreset.el, secCmp.el, secScope.el);
  if (!targets().length) root.prepend(kit.note("色を変えられるクリップ（映像・画像・文字・図形・調整レイヤー）を選んでください。", "warn"));
  kit.update(o.clipIds);
  paintBands();

  function readLast(key, dflt, allow) {
    try {
      const v = localStorage.getItem(key);
      if (v && (!allow || allow.indexOf(v) >= 0)) return v;
    } catch (e) { /* noop */ }
    return dflt;
  }
  function writeLast(key, v) {
    try { localStorage.setItem(key, String(v)); } catch (e) { /* 使えない環境は覚えないだけ */ }
  }

  /* ── 契約の形（{el, update, dispose} + reset）──────────────────── */
  return {
    el: root,
    update(ids) {
      kit.update(ids);
      /* 再生ヘッドが動くたびに呼ばれるので、変わった物だけ描き直す */
      for (const p of wheelParts) p.refresh();
      if (curve) curve.set(curvePts(curCh), chanOf(curCh).color);
      paintBands();
    },
    reset() {
      setGrade(null, "色を既定へ戻す");
      afterBigChange();
    },
    dispose() {
      dead = true;
      for (const f of cleanups) { try { f(); } catch (e) { /* noop */ } }
      cleanups.length = 0;
      for (const p of wheelParts) { try { p.dispose(); } catch (e) { /* noop */ } }
      wheelParts.length = 0;
      if (curve && typeof curve.dispose === "function") { try { curve.dispose(); } catch (e) { /* noop */ } }
      curve = null;
      if (scopes && typeof scopes.dispose === "function") { try { scopes.dispose(); } catch (e) { /* noop */ } }
      scopes = null;
      kit.dispose();
      try { root.remove(); } catch (e) { /* noop */ }
    }
  };
}
