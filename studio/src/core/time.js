/* ══════════════════════════════════════════════════════════════════════
   core/time.js — 秒・フレーム・タイムコードの変換だけを持つ所

   ★ 何をする所か
     契約書 §1 の「秒は浮動小数、フレームは settings.fps で丸める」を
     **ここ 1 箇所**で実装する。タイムライン・書き出し・字幕・ビート吸着が
     同じ丸め方を使うための唯一の窓口。

   ★ なぜこの形か
     ・浮動小数の秒とフレーム番号を往復すると 必ず誤差が出る。
       例: 7 / 29.97 * 29.97 = 6.999999999999999。これを floor すると 6 に
       落ちて、書き出しでフレームが 1 枚抜ける / クリップの端が 1 フレーム
       短くなる。だから **フレーム単位で 1e-6 の誤差を吸ってから**丸める
       （EPS_FRAME）。snapFrame が何度呼ばれても同じ値になる（冪等）のは
       この吸い込みのおかげ。
     ・snapFrame は floor ではなく **round**。編集者が掴んだ位置は「近い
       フレーム」に付くべきで、常に手前へずれると触り心地が悪い。
       尺を数える所（frameIndex）だけが floor を使う。
     ・fps は 29.97 / 23.976 のような小数も来る（契約書 §1 の Asset.fps）。
     ・**drop frame タイムコードは扱わない。** 29.97 でも "30 フレームで
       1 秒" と数える non-drop frame 固定（表示上の時刻が実時間より
       0.1% 進む）。放送納品の要件が無く、drop frame を混ぜると往復が
       一致しなくなる（00:01:00:00 が存在しない等）ため v1 では採らない。
       表示の区切りは常に ":"（";" の入力は読めるが NDF として扱う）。

   ★ 触るときの注意
     ・fps が 0 / NaN / 負で来たら 30（契約書 §1 の既定）へ落とす。
       ここで throw すると再生ループが止まるだけで直らない。
     ・fromTC は読めない文字列に **null** を返す。UI は null を見て
       入力欄を戻すこと（0 秒に飛ばさない）。
   ══════════════════════════════════════════════════════════════════════ */

import { clamp, finite, formatDuration, bisect } from "./util.js";

/** フレーム単位で吸い込む誤差。1/1000 フレームより ずっと小さい */
const EPS_FRAME = 1e-6;

/** 既定 fps（契約書 §1 settings.fps） */
export const DEFAULT_FPS = 30;

/**
 * タイムコード文字列の形。
 *   [符号] 数字(:数字){0,3} [. または , で小数]
 * 読める形: "83" / "1:23" / "1:23.4" / "00:01:23:12" / "00:01:23;12"
 * ":" 区切りが 4 つのときだけ 最後をフレーム番号として扱う。
 */
export const TIMECODE_RE = /^\s*([+-])?(\d{1,6}(?:[:;]\d{1,3}){0,3})(?:[.,](\d{1,6}))?\s*$/;

/** fps を有限な正の数に正す（内部用） */
function fpsOf(fps) {
  const f = finite(fps, DEFAULT_FPS);
  return f > 0 ? f : DEFAULT_FPS;
}

/**
 * タイムコードを数えるときの「名目 fps」。29.97→30, 23.976→24。
 * non-drop frame の定義そのもの（契約書外の放送規格は追わない）。
 */
function nominalFps(fps) {
  return Math.max(1, Math.round(fpsOf(fps)));
}

function pad2(n) {
  return String(Math.abs(Math.trunc(n))).padStart(2, "0");
}

/**
 * 1 フレームの長さ（秒）。
 * @param {number} fps @returns {number}
 */
export function frameDur(fps) {
  return 1 / fpsOf(fps);
}

/**
 * 最も近いフレーム境界へ寄せる（round）。1e-6 フレーム分の誤差を吸うので
 * 何度通しても値が動かない（snapFrame(snapFrame(t)) === snapFrame(t)）。
 * @param {number} t 秒 @param {number} fps @returns {number} 秒
 */
export function snapFrame(t, fps) {
  const f = fpsOf(fps);
  const raw = finite(t, 0) * f;
  const i = Math.round(raw + EPS_FRAME);
  return i === 0 ? 0 : i / f; // -0 を外へ出さない（表示や比較で厄介なだけ）
}

/**
 * その時刻が属するフレーム番号（0 始まり・floor）。
 * 書き出しの枚数計算や サムネの割り当てに使う。
 * @param {number} t 秒 @param {number} fps @returns {number} 整数
 */
export function frameIndex(t, fps) {
  const f = fpsOf(fps);
  return Math.floor(finite(t, 0) * f + EPS_FRAME);
}

/**
 * フレーム番号の先頭時刻（秒）。frameIndex の逆。
 * @param {number} i @param {number} fps @returns {number} 秒
 */
export function frameStart(i, fps) {
  const f = fpsOf(fps);
  const n = Math.round(finite(i, 0));
  return n === 0 ? 0 : n / f;
}

/**
 * 秒 → タイムコード文字列。
 *   既定           "00:01:23:12"（HH:MM:SS:FF, non-drop frame）
 *   {ms:true}      "00:01:23.456"（フレームの代わりにミリ秒）
 *   {compact:true} "1:23.4"（先頭の 0 を省く。小数 1 桁）
 *   {compact,ms}   "1:23.456"
 * @param {number} t 秒 @param {number} fps
 * @param {{compact?:boolean, ms?:boolean}} [opts]
 * @returns {string}
 */
export function toTC(t, fps, opts) {
  const o = opts || {};
  const n = finite(t, 0);
  if (o.compact) return formatDuration(n, { decimals: o.ms ? 3 : 1 });

  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (o.ms) {
    const totalMs = Math.round(a * 1000);
    const s = Math.floor(totalMs / 1000);
    const ms = totalMs % 1000;
    return `${sign}${pad2(Math.floor(s / 3600))}:${pad2(Math.floor(s / 60) % 60)}:${pad2(s % 60)}.${String(ms).padStart(3, "0")}`;
  }
  const f = fpsOf(fps);
  const nom = nominalFps(f);
  const total = Math.floor(a * f + EPS_FRAME); // 素材の実フレーム番号
  const ff = total % nom;                      // 表示は名目 fps で割る（NDF）
  const rest = Math.floor(total / nom);
  return `${sign}${pad2(Math.floor(rest / 3600))}:${pad2(Math.floor(rest / 60) % 60)}:${pad2(rest % 60)}:${pad2(ff)}`;
}

/**
 * タイムコード文字列 → 秒。読めなければ null（0 ではない）。
 * ":" 区切りの個数で意味が変わる:
 *   "83"          → 83 秒
 *   "1:23"        → 1 分 23 秒
 *   "00:01:23"    → 時:分:秒
 *   "00:01:23:12" → 時:分:秒:フレーム（non-drop frame）
 * 小数（"1:23.4"）はそのまま秒の小数。フレーム欄と小数が同時に在る場合は
 * フレーム欄を採る。桁が足りない入力（"123" を 1 秒 23 フレームに読む等）は
 * UI 側で整えてから渡すこと。ここは左から順に読むだけ。
 * @param {string} str @param {number} fps @returns {number|null}
 */
export function fromTC(str, fps) {
  if (typeof str !== "string") return null;
  const m = TIMECODE_RE.exec(str);
  if (!m) return null;
  const sign = m[1] === "-" ? -1 : 1;
  const parts = m[2].split(/[:;]/).map((s) => parseInt(s, 10));
  for (const p of parts) if (!Number.isFinite(p)) return null;

  let h = 0, mi = 0, s = 0, fr = 0, hasFrames = false;
  if (parts.length === 1) { s = parts[0]; }
  else if (parts.length === 2) { mi = parts[0]; s = parts[1]; }
  else if (parts.length === 3) { h = parts[0]; mi = parts[1]; s = parts[2]; }
  else { h = parts[0]; mi = parts[1]; s = parts[2]; fr = parts[3]; hasFrames = true; }

  const whole = (h * 60 + mi) * 60 + s;
  if (hasFrames) {
    const f = fpsOf(fps);
    const total = whole * nominalFps(f) + fr; // 名目 fps で数えたフレーム数
    return sign * (total / f);                // 実 fps で秒へ戻す
  }
  const frac = m[3] ? Number("0." + m[3]) : 0;
  return sign * (whole + finite(frac, 0));
}

/**
 * 範囲に収める。start > end で渡されても入れ替えて扱う。
 * range が無ければ t をそのまま有限化して返す。
 * @param {number} t @param {{start?:number,end?:number}} [range] @returns {number}
 */
export function clampRange(t, range) {
  if (!range) return finite(t, 0);
  const start = finite(range.start, 0);
  const end = finite(range.end, start);
  return clamp(t, Math.min(start, end), Math.max(start, end));
}

/**
 * 2 つの区間の重なり（秒）。重なっていなければ 0。
 * トランジションに使える長さ（契約書 §1 不変条件 3）や
 * ダッキングの判定に使う。端が逆さでも正す。
 * @param {number} aStart @param {number} aEnd @param {number} bStart @param {number} bEnd
 * @returns {number} 0 以上の秒
 */
export function overlap(aStart, aEnd, bStart, bEnd) {
  const a0 = finite(aStart, 0), a1 = finite(aEnd, 0);
  const b0 = finite(bStart, 0), b1 = finite(bEnd, 0);
  const lo = Math.max(Math.min(a0, a1), Math.min(b0, b1));
  const hi = Math.min(Math.max(a0, a1), Math.max(b0, b1));
  return hi > lo ? hi - lo : 0;
}

/**
 * 人が読む尺。"1分23秒" / "1時間2分3秒" / "0.4秒"。
 * 0 になる単位は省く（60 秒 → "1分"）。1 秒未満は小数 1 桁で出す
 * （クリップの尺は 0.04 秒まで在り得るので "0秒" と言い切れない）。
 * @param {number} t 秒 @returns {string}
 */
export function humanDuration(t) {
  const n = finite(t, 0);
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (a < 1) {
    // 0.04 秒（MIN_CLIP）を "0秒" と言わないよう、小さいほど桁を増やす
    const d = a < 0.1 ? Math.round(a * 100) / 100 : Math.round(a * 10) / 10;
    return `${sign}${d}秒`;
  }
  const total = Math.round(a);
  const h = Math.floor(total / 3600);
  const mi = Math.floor((total % 3600) / 60);
  const s = total % 60;
  let out = "";
  if (h > 0) out += `${h}時間`;
  if (mi > 0) out += `${mi}分`;
  if (s > 0 || out === "") out += `${s}秒`;
  return sign + out;
}

/**
 * 最も近い値を返す（ビート吸着・マーカー吸着用）。
 * values は **昇順**が前提（analysis の beats.times はそう）。昇順でない
 * 配列を渡すときは { sorted: false } を付けること（線形に全部見る）。
 * maxDist を付けると、その秒数より遠いときは null を返す
 * （吸着を「効かせない」判断を呼び出し側でせずに済む）。
 * @param {number[]} values @param {number} t
 * @param {{maxDist?:number, sorted?:boolean}} [opts]
 * @returns {number|null}
 */
export function nearest(values, t, opts) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const o = opts || {};
  const n = finite(t, 0);
  const maxDist = o.maxDist === undefined ? Infinity : Math.abs(finite(o.maxDist, Infinity));

  let best = null, bestD = Infinity;
  if (o.sorted === false) {
    for (const v of values) {
      const x = finite(v, 0);
      const d = Math.abs(x - n);
      if (d < bestD) { bestD = d; best = x; }
    }
  } else {
    const i = bisect(values, n);
    // 境界の両側だけ見れば足りる（昇順なので）
    for (let k = i - 1; k <= i; k++) {
      if (k < 0 || k >= values.length) continue;
      const x = finite(values[k], 0);
      const d = Math.abs(x - n);
      if (d < bestD) { bestD = d; best = x; }
    }
  }
  if (best === null) return null;
  return bestD <= maxDist ? best : null;
}
