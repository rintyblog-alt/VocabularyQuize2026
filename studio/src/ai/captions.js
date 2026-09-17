/* ══════════════════════════════════════════════════════════════════════
   ai/captions.js — 字幕（文字起こし・改行・SRT/VTT・字幕スタイル）

   ★ 何をする所か
     ・`transcribe()` … 音 → 字幕。**三段構え**で、どの段でも必ず何かを返す:
         ① API の口（`<apiBase>/api/ai/transcribe`）を試す
            → 404 / 405 / 501 なら「この配信には口が無い」と覚えて以後試さない
         ② Web Speech API（`capabilities()` で申告するだけ。**既定では使わない**
            ＝ブラウザが勝手に音をどこかへ送る道なので、頼まれた時だけ）
         ③ どちらも無ければ **無音区間から「話している区間」だけ**を作り、
            文字は空で返す（枠だけ出来る → 人が打てば完成する）
       どれを通ったかは `via` に入れる（画面が「AI で起こした」と嘘をつかない）。
     ・`captionsToClips()` … 字幕 → text クリップの ops（`store.batch` で当てる）。
     ・`wrapJa()` … 日本語の改行位置（句読点・助詞・禁則）。**pure・試験する**。
     ・`srtParse / srtStringify / vttParse / vttStringify` … **pure・試験する**。
     ・`autoSubtitleStyle()` … 画面の寸法から読みやすい既定の字幕スタイル。

   ★ なぜこの形か
     ・字幕は「読めるかどうか」で価値が決まる。だから改行規則を **pure な関数**
       に切り出して試験で固定した（ここが崩れると全部の動画が読みにくくなる）。
     ・文字起こしは通信・端末差・権限の 3 重の不確かさがある。**戻り値の形を
       1 つに固定**して、呼び出し側が段の違いを気にしなくて良いようにした。
     ・字幕は最終的に **ただの text クリップ**（契約書 §1）。専用の枠を作ると
       書き出し・プレビュー・インスペクタの全部に穴が空く。

   ★ 触るときの注意
     ・`captionsToClips` は ops（配列）を返す。`{ops,summary,warnings}` ではない
       （契約書 §6 の表記に合わせた。tools.js の auto* とは形が違う）。
     ・秒はタイムライン秒。SRT / VTT のミリ秒は 3 桁で丸める。
     ・`transcribe` は async。中止は `signal`。DOM が無い所（Node の試験）でも
       ③ の道だけは動く（`opts.silence` を渡せる）。

   CONTRACT-NOTE: 共通前提は「1 ファイル 700 行で分割」だが、分割先
     （ai/captions/*.js）は担当外なので作れない。§A〜§F の章立てで 1 ファイルに
     収めた。統合担当が分けるときは §C（改行）・§E（SRT/VTT）が pure で
     独立しているので、その 2 章から切り出すのが安全。
   ══════════════════════════════════════════════════════════════════════ */

import { clamp, clamp01, finite } from "../core/util.js";
import { MIN_CLIP, defaultTextStyle } from "../core/schema.js";
import { detectSilence } from "../analysis/audio.js";

const str = (v) => (typeof v === "string" ? v : v === undefined || v === null ? "" : String(v));
const plain = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const arr = (v) => (Array.isArray(v) ? v : []);

/** @typedef {{start:number, end:number, text:string, conf?:number}} Caption */

/** API の口（契約書 §6 の api base に足す） */
export const TRANSCRIBE_PATH = "/api/ai/transcribe";
export const DEFAULT_API_BASE = "https://vocabuquiz-api.rintyblog.workers.dev";
/** 1 行に入れる目安（CapCut の既定に近い） */
export const DEFAULT_MAX_CHARS = 18;
export const DEFAULT_MAX_LINES = 2;

/* 口が無い配信を覚える（毎回 404 を叩きに行かない）。試験は reset で戻す */
const apiState = { disabled: false, reason: "" };
/** 「口が無い」の記憶を消す（試験・設定変更のあと） */
export function resetTranscribeState() { apiState.disabled = false; apiState.reason = ""; }

function abortError(msg = "中止しました") {
  const e = new Error(msg);
  e.name = "AbortError";
  return e;
}
function throwIfAborted(signal) { if (signal && signal.aborted) throw abortError(); }
const isAbort = (e) => !!e && (e.name === "AbortError" || /abort|中止/i.test(str(e.message)));

/* ══ §A この端末で使える道 ═══════════════════════════════════════ */

/**
 * 文字起こしに使える道の申告（**Web Speech は既定では使わない**）。
 * @returns {{api:boolean, apiDisabled:boolean, apiReason:string, webSpeech:boolean,
 *            mic:boolean, silence:boolean, note:string}}
 */
export function capabilities() {
  const g = typeof globalThis !== "undefined" ? globalThis : {};
  const nav = g.navigator || null;
  const SR = g.SpeechRecognition || g.webkitSpeechRecognition || null;
  return {
    api: typeof g.fetch === "function" && !apiState.disabled,
    apiDisabled: apiState.disabled,
    apiReason: apiState.reason,
    webSpeech: !!SR,
    mic: !!(nav && nav.mediaDevices && typeof nav.mediaDevices.getUserMedia === "function"),
    silence: true,
    note: SR
      ? "この端末は音声認識を持っています（既定では使いません。マイクから拾う形なので、頼まれた時だけ動かします）"
      : "この端末に音声認識はありません（無音の区切りから枠だけ作ります）"
  };
}

/* ══ §B 字幕の器と並べ直し（pure）════════════════════════════════ */

/**
 * 字幕を整える（秒の順に並べ、重なりを解き、空白を均す）。
 * @param {*} list @param {{minDur?:number, gap?:number}} [opts]
 * @returns {Caption[]}
 */
export function normalizeCaptions(list, opts = {}) {
  const o = plain(opts) || {};
  const minDur = Math.max(MIN_CLIP, finite(o.minDur, 0.3));
  const items = arr(list).map((c) => {
    const q = plain(c) || {};
    const start = Math.max(0, finite(q.start !== undefined ? q.start : q.from, 0));
    const rawEnd = finite(q.end !== undefined ? q.end : q.to, start + minDur);
    const text = str(q.text !== undefined ? q.text : q.content).replace(/\r/g, "").replace(/[ \t　]+\n/g, "\n").trim();
    const out = { start, end: Math.max(start + 1e-4, rawEnd), text };
    if (Number.isFinite(q.conf)) out.conf = clamp01(q.conf);
    return out;
  }).filter((c) => Number.isFinite(c.start) && Number.isFinite(c.end));
  items.sort((a, b) => a.start - b.start || a.end - b.end);
  const out = [];
  for (const c of items) {
    const last = out[out.length - 1];
    if (last && c.start < last.end - 1e-6) {
      if (last.end - last.start > minDur * 2 && c.start > last.start + minDur) last.end = c.start;
      else c.start = last.end;
    }
    if (c.end < c.start + 1e-4) c.end = c.start + 1e-4;
    out.push(c);
  }
  return out;
}

/**
 * 無音の区間から「話している区間」を作る（文字は空）。
 * @param {{start:number,end:number}[]} silence @param {{duration?:number, minDur?:number, maxDur?:number}} [opts]
 * @returns {Caption[]}
 */
export function captionsFromSilence(silence, opts = {}) {
  const o = plain(opts) || {};
  const minDur = Math.max(MIN_CLIP, finite(o.minDur, 0.5));
  const maxDur = Math.max(minDur, finite(o.maxDur, 6));
  const spans = arr(silence).map((s) => ({
    start: Math.max(0, finite(s && s.start, 0)),
    end: Math.max(0, finite(s && s.end, 0))
  })).filter((s) => s.end > s.start).sort((a, b) => a.start - b.start);
  let dur = Math.max(0, finite(o.duration, 0));
  if (!(dur > 0)) dur = spans.length ? spans[spans.length - 1].end : 0;
  const out = [];
  let cur = 0;
  const add = (a, b) => {
    const len = b - a;
    if (len < minDur) return;
    const parts = Math.max(1, Math.ceil(len / maxDur));
    for (let i = 0; i < parts; i++) out.push({ start: a + (len * i) / parts, end: a + (len * (i + 1)) / parts, text: "" });
  };
  for (const s of spans) {
    if (s.start > cur) add(cur, Math.min(s.start, dur));
    cur = Math.max(cur, s.end);
    if (cur >= dur) break;
  }
  if (dur > cur) add(cur, dur);
  return out;
}

/* ══ §C 日本語の改行（pure・試験する所）══════════════════════════ */

/** 行頭に置けない文字（禁則）。閉じ括弧・句読点・小書き・長音 */
const NO_START = "、。，．,.!?！？…‥・:;：；」』）］｝〉》】”’ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮーヽヾゝゞ%％";
/** 行末に置けない文字（開き括弧） */
const NO_END = "「『（［｛〈《【“‘";
/** 切れ目として良い助詞・助動詞（後ろで切る） */
const PARTICLES_2 = ["から", "まで", "より", "ので", "けど", "ても", "でも", "には", "とは", "では", "って", "ながら", "そして", "しかし"];
const PARTICLES_1 = "はがをにでとへもやねよか";
/** ここで切ると語が割れる 2 文字（「です」「でき」「から」…）。切らせない */
const NO_BREAK_PAIRS = new Set([
  "です", "でし", "ます", "まし", "ませ", "でき", "でい", "でも", "では", "ても", "ては",
  "には", "とは", "にも", "とも", "から", "まで", "より", "ので", "のに", "ない", "なく",
  "なけ", "たい", "てい", "って", "った", "ちゃ", "じゃ", "しょ", "まと", "につ", "にお", "とし"
]);
/** 強い切れ目（この後ろは最優先で切る） */
const STRONG = "。！？!?…";
const WEAK = "、，,・";

const isLatin = (ch) => /[0-9A-Za-z.,'’\-_/:]/.test(ch);
const charClass = (ch) => {
  if (!ch) return "none";
  if (/[぀-ゟ]/.test(ch)) return "hira";
  if (/[゠-ヿ]/.test(ch)) return "kata";
  if (/[一-鿿々]/.test(ch)) return "kanji";
  if (isLatin(ch)) return "latin";
  return "other";
};

/**
 * 文字を「切ってはいけない塊」に分ける。
 *   ・英数の連なりは 1 つの塊（途中で改行しない）
 *   ・行頭に置けない文字は **前の塊にくっつける**
 *   ・行末に置けない文字は **次の塊にくっつける**
 * @param {string} text @returns {string[]}
 */
function atomsOf(text) {
  const s = str(text);
  const out = [];
  let i = 0;
  let pendingOpen = "";
  while (i < s.length) {
    let unit = "";
    if (isLatin(s[i])) {
      while (i < s.length && isLatin(s[i])) unit += s[i++];
    } else {
      unit = s[i++];
    }
    if (NO_END.indexOf(unit) >= 0) { pendingOpen += unit; continue; }
    if (pendingOpen) { unit = pendingOpen + unit; pendingOpen = ""; }
    if (NO_START.indexOf(unit) >= 0 && out.length) out[out.length - 1] += unit;
    else out.push(unit);
  }
  if (pendingOpen) {
    if (out.length) out[out.length - 1] += pendingOpen;
    else out.push(pendingOpen);
  }
  return out;
}

/** その塊の末尾で切る良さ（大きいほど良い） */
function breakScore(prev, next) {
  const left = str(prev).replace(/[ \u3000]+$/, "");
  const tail = left.slice(-1);
  const head = str(next).slice(0, 1);
  if (NO_BREAK_PAIRS.has(tail + head)) return -100;             // 語の途中（「です」「でき」）で切らない
  if (STRONG.indexOf(tail) >= 0) return 100;
  if (WEAK.indexOf(tail) >= 0) return 80;
  if ("」』）］｝〉》】".indexOf(tail) >= 0) return 70;
  if (NO_END.indexOf(head) >= 0) return 66;                     // 開き括弧の前
  if (left.length >= 3 && PARTICLES_2.indexOf(left.slice(-2)) >= 0) return 62;
  if (left.length >= 2 && PARTICLES_1.indexOf(tail) >= 0) return 58;   // 一字の助詞（語頭の「の」等では切らない）
  const ct = charClass(tail), ch = charClass(head);
  if (ct === "none" || ch === "none") return 10;
  /* 語の始まり（漢字・カタカナ・英数）の **前** は良い切れ目。
     逆に漢字の **後ろ**（＝送り仮名の手前）で切ると動詞が割れるので下げる。 */
  if ((ct === "hira" || ct === "kata") && (ch === "kanji" || ch === "latin")) return 40;
  if (ct === "kanji" && ch === "hira") return 24;
  if (ct !== ch) return 30;
  return 10;
}

/** 表示上の長さ（末尾の句読点はぶら下げるので数えない） */
function visualLen(s) {
  const t = str(s);
  if (t.length && (STRONG + WEAK).indexOf(t.slice(-1)) >= 0) return t.length - 1;   // ぶら下げは 1 文字だけ
  return t.length;
}

/**
 * 日本語の字幕を読める位置で折る（**pure**）。
 *   ・句読点 → 閉じ括弧 → 助詞の切れ目 → 語種の境目 の順に良い所を選ぶ
 *   ・禁則: 行頭に「、。」等を置かない／行末に「「（」等を置かない
 *   ・句読点は 1 文字だけぶら下げる（1 文字あふれても折らない）
 *   ・英数の語は途中で切らない
 *   ・入力の改行はそのまま行の区切りとして残す
 * @param {string} text @param {number} [maxCharsPerLine]
 * @returns {string[]} 1 行ずつ
 */
export function wrapJa(text, maxCharsPerLine = DEFAULT_MAX_CHARS) {
  const max = Math.max(4, Math.round(finite(maxCharsPerLine, DEFAULT_MAX_CHARS)));
  const src = str(text).replace(/\r\n?/g, "\n");
  const lines = [];
  for (const para of src.split("\n")) {
    const one = para.replace(/[ \t　]+/g, " ").trim();
    if (!one) continue;
    const atoms = atomsOf(one);
    let cur = [];
    const flush = () => {
      const s = cur.join("").replace(/^[ 　]+|[ 　]+$/g, "");
      if (s) lines.push(s);
      cur = [];
    };
    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      const tentative = cur.concat([atom]);
      if (visualLen(tentative.join("")) <= max) { cur = tentative; continue; }
      if (!cur.length) { cur = tentative; flush(); continue; }   // 1 つで溢れる塊は諦めて 1 行に
      /* 溢れた: 今の行の中で一番良い切れ目を探す（早すぎる所は損をさせる） */
      let bestAt = cur.length, bestScore = -Infinity;
      const fitLen = visualLen(cur.join(""));
      for (let k = cur.length; k >= 1; k--) {
        const len = visualLen(cur.slice(0, k).join(""));
        if (len < Math.min(max, fitLen) * 0.45) break;           // 半分より短い所では折らない
        const score = breakScore(cur.slice(0, k).join(""), k < cur.length ? cur[k] : atom) - (fitLen - len) * 3.5;
        if (score > bestScore) { bestScore = score; bestAt = k; }
      }
      const rest = cur.slice(bestAt);
      cur = cur.slice(0, bestAt);
      flush();
      cur = rest.concat([atom]);
      /* 折り返した先が既に溢れているなら、そのまま 1 行として出す */
      while (visualLen(cur.join("")) > max && cur.length > 1) {
        let at = cur.length - 1;
        for (let k = cur.length - 1; k >= 1; k--) {
          if (visualLen(cur.slice(0, k).join("")) <= max) { at = k; break; }
        }
        const tail = cur.slice(at);
        cur = cur.slice(0, at);
        flush();
        cur = tail;
      }
    }
    flush();
  }
  return lines;
}

/**
 * 1 つの字幕を「maxLines 行ずつの塊」に割る（長い台詞は複数のクリップになる）。
 * @param {string} text @param {number} [maxCharsPerLine] @param {number} [maxLines]
 * @returns {string[][]}
 */
export function splitCaptionText(text, maxCharsPerLine = DEFAULT_MAX_CHARS, maxLines = DEFAULT_MAX_LINES) {
  const per = Math.max(1, Math.round(finite(maxLines, DEFAULT_MAX_LINES)));
  const lines = wrapJa(text, maxCharsPerLine);
  if (!lines.length) return [[]];
  const out = [];
  for (let i = 0; i < lines.length; i += per) out.push(lines.slice(i, i + per));
  return out;
}

/* ══ §D 字幕 → クリップ（ops）════════════════════════════════════ */

/**
 * 読みやすい字幕の既定スタイル（画面の寸法から決める）。
 * @param {Object} project @returns {Object} TextStyle（契約書 §1）
 */
export function autoSubtitleStyle(project) {
  const s = plain(project && project.settings) || {};
  const w = Math.max(16, finite(s.width, 1920)), h = Math.max(16, finite(s.height, 1080));
  const vertical = h > w;
  const base = Math.min(w, h);
  const size = Math.round(clamp(base * (vertical ? 0.058 : 0.052), 18, 220));
  const style = Object.assign(defaultTextStyle(), {
    size, weight: 700, color: "#ffffff",
    stroke: { width: Math.max(2, Math.round(size * 0.07)), color: "#000000" },
    shadow: { x: 0, y: Math.max(1, Math.round(size * 0.06)), blur: Math.max(2, Math.round(size * 0.16)), color: "#000000a6" },
    bg: vertical ? { color: "#000000a6", pad: Math.round(size * 0.28), radius: Math.round(size * 0.22) } : null
  });
  return style;
}

/**
 * 字幕 → text クリップの ops（契約書 §6）。
 * 長い台詞は `maxLines` 行ずつに割り、文字数の割合で尺を分ける。
 * @param {Caption[]} captions
 * @param {{style?:Object, trackId?:string, maxCharsPerLine?:number, maxLines?:number,
 *          project?:Object, offset?:number, mode?:string, name?:string}} [opts]
 * @returns {{type:string, payload:Object}[]} ops
 */
export function captionsToClips(captions, opts = {}) {
  const o = plain(opts) || {};
  const maxChars = Math.max(4, Math.round(finite(o.maxCharsPerLine, DEFAULT_MAX_CHARS)));
  const maxLines = Math.max(1, Math.round(finite(o.maxLines, DEFAULT_MAX_LINES)));
  const offset = finite(o.offset, 0);
  const style = plain(o.style) || (o.project ? autoSubtitleStyle(o.project) : (plain(o.project && o.project.subtitleStyle) || defaultTextStyle()));
  const list = normalizeCaptions(captions);
  const ops = [];
  for (const c of list) {
    const start = Math.max(0, c.start + offset);
    const span = Math.max(MIN_CLIP, c.end - c.start);
    const groups = splitCaptionText(c.text, maxChars, maxLines);
    const weights = groups.map((g) => Math.max(1, g.join("").length));
    const total = weights.reduce((a, b) => a + b, 0);
    let cursor = start;
    for (let i = 0; i < groups.length; i++) {
      const dur = i === groups.length - 1
        ? Math.max(MIN_CLIP, start + span - cursor)
        : Math.max(MIN_CLIP, (span * weights[i]) / total);
      const content = groups[i].join("\n");
      const payload = {
        at: cursor, mode: str(o.mode) || "overwrite",
        clip: {
          kind: "text", name: content.split("\n")[0].slice(0, 24) || str(o.name) || "字幕",
          start: cursor, duration: dur,
          text: { content, style }
        }
      };
      if (str(o.trackId)) payload.trackId = str(o.trackId);
      ops.push({ type: "clip.add", payload });
      cursor += dur;
    }
  }
  return ops;
}

/**
 * タイムラインの text クリップ → 字幕（**書き出し用**・pure）。
 * 契約書 §11-5 の「SRT / VTT 書き出し」は これで字幕を集めてから
 * `srtStringify` / `vttStringify` に渡す。
 * CONTRACT-NOTE: 依存の向きは `ui → ai → … → export` なので、export 側から
 *   ここを import してはいけない。**ui が文字列を作って exporter へ渡す**。
 * @param {Object} project @param {{trackId?:string, trackIds?:string[]}} [opts]
 * @returns {Caption[]}
 */
export function captionsFromProject(project, opts = {}) {
  const o = plain(opts) || {};
  const want = str(o.trackId) ? [str(o.trackId)] : arr(o.trackIds).map(str).filter(Boolean);
  const out = [];
  for (const track of arr(project && project.tracks)) {
    if (!track || (want.length && want.indexOf(str(track.id)) < 0)) continue;
    for (const clip of arr(track.clips)) {
      if (str(clip && clip.kind) !== "text") continue;
      const text = str(clip.text && clip.text.content).trim();
      if (!text) continue;
      const start = Math.max(0, finite(clip.start, 0));
      out.push({ start, end: start + Math.max(MIN_CLIP, finite(clip.duration, MIN_CLIP)), text });
    }
  }
  return normalizeCaptions(out);
}

/* ══ §E SRT / VTT（pure・往復できること）════════════════════════ */

/** 秒 → "HH:MM:SS,mmm"（`dot:true` で "." = VTT） */
export function formatTimestamp(sec, opts = {}) {
  const o = plain(opts) || {};
  const total = Math.max(0, Math.round(finite(sec, 0) * 1000));
  const ms = total % 1000;
  const s = Math.floor(total / 1000) % 60;
  const m = Math.floor(total / 60000) % 60;
  const h = Math.floor(total / 3600000);
  const p2 = (n) => String(n).padStart(2, "0");
  const sep = o.dot ? "." : ",";
  return `${p2(h)}:${p2(m)}:${p2(s)}${sep}${String(ms).padStart(3, "0")}`;
}

/** "00:01:02,500" / "1:02.5" / "62.5" → 秒（読めなければ null） */
export function parseTimestamp(s) {
  const m = /^\s*(?:(\d{1,3}):)?(?:(\d{1,3}):)?(\d{1,3})(?:[.,](\d{1,3}))?\s*$/.exec(str(s));
  if (!m) return null;
  const a = m[1] !== undefined ? Number(m[1]) : null;
  const b = m[2] !== undefined ? Number(m[2]) : null;
  const c = Number(m[3]);
  const frac = m[4] ? Number(("0." + m[4])) : 0;
  let sec = 0;
  if (a !== null && b !== null) sec = a * 3600 + b * 60 + c;
  else if (a !== null) sec = a * 60 + c;
  else sec = c;
  return sec + frac;
}

const CUE_RE = /(-?[\d:.,]+)\s*--?>\s*(-?[\d:.,]+)(.*)$/;

/** 字幕の本文（SRT / VTT 共通の読み取り） */
function parseCues(text) {
  const src = str(text).replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const out = [];
  const blocks = src.split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.replace(/\s+$/, ""));
    if (!lines.length) continue;
    const head = str(lines[0]).trim();
    if (/^WEBVTT/i.test(head)) continue;
    if (/^(NOTE|STYLE|REGION)\b/i.test(head)) continue;
    let at = -1, m = null;
    for (let i = 0; i < lines.length; i++) {
      const hit = CUE_RE.exec(lines[i]);
      if (hit) { at = i; m = hit; break; }
    }
    if (at < 0 || !m) continue;
    const start = parseTimestamp(m[1]);
    const end = parseTimestamp(m[2]);
    if (start === null || end === null) continue;
    const body = lines.slice(at + 1).join("\n").trim();
    const id = at > 0 ? str(lines[at - 1]).trim() : "";
    const cue = { start, end: Math.max(start + 1e-4, end), text: body };
    if (id && !/^\d+$/.test(id)) cue.id = id;
    out.push(cue);
  }
  return normalizeCaptions(out);
}

/** SRT を読む @param {string} text @returns {Caption[]} */
export function srtParse(text) { return parseCues(text); }
/** VTT を読む @param {string} text @returns {Caption[]} */
export function vttParse(text) { return parseCues(text); }

/** SRT を書く @param {Caption[]} captions @returns {string} */
export function srtStringify(captions) {
  const list = normalizeCaptions(captions);
  const out = [];
  for (let i = 0; i < list.length; i++) {
    out.push(String(i + 1));
    out.push(`${formatTimestamp(list[i].start)} --> ${formatTimestamp(list[i].end)}`);
    out.push(str(list[i].text));
    out.push("");
  }
  return out.join("\n");
}

/** VTT を書く @param {Caption[]} captions @param {{cueIds?:boolean}} [opts] @returns {string} */
export function vttStringify(captions, opts = {}) {
  const o = plain(opts) || {};
  const list = normalizeCaptions(captions);
  const out = ["WEBVTT", ""];
  for (let i = 0; i < list.length; i++) {
    if (o.cueIds) out.push(String(i + 1));
    out.push(`${formatTimestamp(list[i].start, { dot: true })} --> ${formatTimestamp(list[i].end, { dot: true })}`);
    out.push(str(list[i].text));
    out.push("");
  }
  return out.join("\n");
}

/* ══ §F 文字起こし（三段構え）════════════════════════════════════ */

/** API の基点（契約書 §10 と同じ決め方） */
function apiBaseOf(opts) {
  const o = plain(opts) || {};
  if (str(o.apiBase)) return str(o.apiBase).replace(/\/+$/, "");
  const g = typeof globalThis !== "undefined" ? globalThis : {};
  const cfg = plain(g.__PUBLIC_CONFIG__);
  const fromCfg = cfg && plain(cfg.api) ? str(cfg.api.base) : "";
  if (fromCfg) return fromCfg.replace(/\/+$/, "");
  if (str(g.VQ_API_BASE)) return str(g.VQ_API_BASE).replace(/\/+$/, "");
  return DEFAULT_API_BASE;
}

/** 入力（Blob / assetId / {blob}）から音の実体を取り出す */
async function resolveBlob(input, opts) {
  const o = plain(opts) || {};
  const cand = [o.blob, input];
  for (const c of cand) {
    if (!c || typeof c === "string") continue;
    if (typeof c.arrayBuffer === "function" || (Number.isFinite(c.size) && typeof c.type === "string")) return c;
  }
  const assetId = typeof input === "string" ? input : str(o.assetId);
  if (!assetId || !o.storage) return null;
  const project = plain(o.project);
  const asset = project ? arr(project.assets).find((a) => str(a && a.id) === assetId) : plain(o.asset);
  const key = asset && plain(asset.storage) ? str(asset.storage.key) : assetId;
  if (typeof o.storage.getAssetBlob !== "function") return null;
  try { return await o.storage.getAssetBlob(key); }
  catch (_e) { return null; }
}

/** API の返事（色々な形）を字幕に読み替える */
export function readTranscript(data, opts = {}) {
  const o = plain(opts) || {};
  if (typeof data === "string") {
    const s = data.trim();
    if (!s) return [];
    if (/-->/.test(s)) return parseCues(s);
    return [{ start: Math.max(0, finite(o.start, 0)), end: Math.max(finite(o.duration, 0), finite(o.start, 0) + 2), text: s }];
  }
  const d = plain(data);
  if (!d) return [];
  const list = arr(d.captions).length ? d.captions
    : arr(d.segments).length ? d.segments
      : arr(d.results).length ? d.results
        : arr(d.chunks).length ? d.chunks : null;
  if (list) {
    return normalizeCaptions(list.map((q) => {
      const x = plain(q) || {};
      return {
        start: finite(x.start !== undefined ? x.start : (x.from !== undefined ? x.from : (Array.isArray(x.timestamp) ? x.timestamp[0] : 0)), 0),
        end: finite(x.end !== undefined ? x.end : (x.to !== undefined ? x.to : (Array.isArray(x.timestamp) ? x.timestamp[1] : 0)), 0),
        text: str(x.text !== undefined ? x.text : x.content),
        conf: Number.isFinite(x.conf) ? x.conf : (Number.isFinite(x.confidence) ? x.confidence : undefined)
      };
    }));
  }
  if (typeof d.srt === "string" && d.srt.trim()) return parseCues(d.srt);
  if (typeof d.vtt === "string" && d.vtt.trim()) return parseCues(d.vtt);
  if (typeof d.text === "string" && d.text.trim()) return readTranscript(d.text, o);
  return [];
}

/**
 * ① API の口を叩く。口が無い（404 / 405 / 501）なら「無効」と覚える。
 * @returns {Promise<Caption[]|null>} null = この道は使えなかった
 */
async function tryApi(blob, opts) {
  const o = plain(opts) || {};
  const g = typeof globalThis !== "undefined" ? globalThis : {};
  const fetchImpl = typeof o.fetchImpl === "function" ? o.fetchImpl : (typeof g.fetch === "function" ? (...a) => g.fetch(...a) : null);
  if (!fetchImpl || !blob) return null;
  const url = apiBaseOf(o) + (str(o.path) || TRANSCRIBE_PATH);
  const lang = str(o.lang) || "ja";
  const headers = {};
  if (str(o.token)) headers.Authorization = `Bearer ${str(o.token)}`;
  let body = null;
  if (typeof g.FormData === "function") {
    const fd = new g.FormData();
    try { fd.append("audio", blob, str(o.filename) || "audio.webm"); }
    catch (_e) { fd.append("audio", blob); }
    fd.append("lang", lang);
    body = fd;
  } else {
    body = blob;
    if (str(blob.type)) headers["Content-Type"] = str(blob.type);
  }
  const res = await fetchImpl(`${url}?lang=${encodeURIComponent(lang)}`, {
    method: "POST", headers, body,
    signal: o.signal || undefined, mode: "cors", credentials: "omit", cache: "no-store"
  });
  const status = Number(res && res.status) || 0;
  if (status === 404 || status === 405 || status === 501) {
    apiState.disabled = true;
    apiState.reason = `この配信に文字起こしの口がありません（HTTP ${status}）`;
    return null;
  }
  if (!res || !res.ok) {
    const e = new Error(`文字起こしの口が ${status} を返しました`);
    e.name = "TranscribeError";
    throw e;
  }
  let text = "";
  try { text = await res.text(); } catch (_e) { text = ""; }
  let data = text;
  if (text) { try { data = JSON.parse(text); } catch (_e) { data = text; } }
  const caps = readTranscript(data, o);
  return caps.length ? caps : null;
}

/**
 * ② Web Speech API（**マイクから拾う道しか無い**）。頼まれた時だけ動かす。
 * @param {{lang?:string, maxMs?:number, signal?:AbortSignal, onProgress?:Function}} [opts]
 * @returns {Promise<Caption[]>}
 */
export function listenWebSpeech(opts = {}) {
  const o = plain(opts) || {};
  const g = typeof globalThis !== "undefined" ? globalThis : {};
  const SR = g.SpeechRecognition || g.webkitSpeechRecognition || null;
  if (!SR) return Promise.reject(new Error("この端末に音声認識はありません"));
  const maxMs = clamp(finite(o.maxMs, 60000), 1000, 600000);
  const now = () => (g.performance && typeof g.performance.now === "function" ? g.performance.now() : Date.now());
  return new Promise((resolve, reject) => {
    let rec = null;
    try { rec = new SR(); } catch (e) { reject(e); return; }
    const t0 = now();
    const out = [];
    let last = 0, timer = null, onAbort = null, settled = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (onAbort && o.signal) { try { o.signal.removeEventListener("abort", onAbort); } catch (_e) { /* 外せないだけ */ } }
      try { rec.stop(); } catch (_e) { /* もう止まっている */ }
      if (err) reject(err); else resolve(normalizeCaptions(out));
    };
    rec.lang = str(o.lang) || "ja-JP";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (ev) => {
      const t = (now() - t0) / 1000;
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (!r || !r.isFinal) continue;
        const text = str(r[0] && r[0].transcript).trim();
        if (!text) continue;
        out.push({ start: last, end: Math.max(last + 0.4, t), text, conf: Number.isFinite(r[0].confidence) ? r[0].confidence : undefined });
        last = Math.max(last + 0.4, t);
      }
      if (typeof o.onProgress === "function") { try { o.onProgress(clamp01((now() - t0) / maxMs), "聞き取っています"); } catch (_e) { /* 進捗は落ちても良い */ } }
    };
    rec.onerror = (ev) => {
      const code = str(ev && ev.error);
      if (code === "no-speech" || code === "aborted") finish(null);
      else finish(new Error(`音声認識が失敗しました（${code || "原因不明"}）`));
    };
    rec.onend = () => finish(null);
    if (o.signal) {
      if (o.signal.aborted) { finish(abortError()); return; }
      onAbort = () => finish(abortError());
      try { o.signal.addEventListener("abort", onAbort); } catch (_e) { onAbort = null; }
    }
    timer = setTimeout(() => finish(null), maxMs);
    try { rec.start(); } catch (e) { finish(e); }
  });
}

/** ③ 無音区間（指定 → 解析 → AudioBuffer → Blob を復号） */
async function silenceOf(input, opts) {
  const o = plain(opts) || {};
  if (Array.isArray(o.silence) && o.silence.length) return { spans: o.silence, duration: finite(o.duration, 0) };
  const A = plain(o.analysis);
  if (A && Array.isArray(A.silence) && A.silence.length) {
    const dur = finite(o.duration, 0) || (plain(A.loudness) && finite(A.loudness.hz, 0) > 0 ? arr(A.loudness.values).length / A.loudness.hz : 0);
    return { spans: A.silence, duration: dur };
  }
  const buf = plain(o.audioBuffer) || (input && typeof input === "object" && typeof input.getChannelData === "function" ? input : null);
  if (buf) return { spans: detectSilence(buf, o), duration: finite(buf.duration, 0) || finite(o.duration, 0) };
  const g = typeof globalThis !== "undefined" ? globalThis : {};
  const Ctx = g.AudioContext || g.webkitAudioContext || null;
  const blob = await resolveBlob(input, o);
  if (!blob || !Ctx || typeof blob.arrayBuffer !== "function") return { spans: [], duration: finite(o.duration, 0) };
  let ctx = null;
  try {
    ctx = new Ctx();
    const ab = await blob.arrayBuffer();
    const decoded = await ctx.decodeAudioData(ab);
    return { spans: detectSilence(decoded, o), duration: finite(decoded.duration, 0) };
  } catch (_e) {
    return { spans: [], duration: finite(o.duration, 0) };
  } finally {
    if (ctx && typeof ctx.close === "function") { try { ctx.close(); } catch (_e) { /* 閉じられないだけ */ } }
  }
}

/**
 * 音 → 字幕（三段構え。契約書 §6）。
 * @param {Blob|string|Object} blobOrAssetId 音の実体 / 素材 id / AudioBuffer
 * @param {{llm?:Object, lang?:string, onProgress?:Function, signal?:AbortSignal,
 *          apiBase?:string, fetchImpl?:Function, token?:string, storage?:Object,
 *          project?:Object, analysis?:Object, silence?:Array, duration?:number,
 *          audioBuffer?:Object, useApi?:boolean, useWebSpeech?:boolean,
 *          minDur?:number, maxDur?:number}} [opts]
 * @returns {Promise<{captions:Caption[], via:"api"|"webspeech"|"silence"|"none", warnings:string[]}>}
 */
export async function transcribe(blobOrAssetId, opts = {}) {
  const o = plain(opts) || {};
  const warnings = [];
  const prog = typeof o.onProgress === "function" ? o.onProgress : null;
  const report = (p, msg) => { if (prog) { try { prog(clamp01(p), str(msg)); } catch (_e) { /* 進捗は落ちても良い */ } } };
  throwIfAborted(o.signal);

  /* ① API の口 */
  if (o.useApi !== false && !apiState.disabled) {
    report(0.05, "音声を送る準備をしています");
    try {
      const blob = await resolveBlob(blobOrAssetId, o);
      throwIfAborted(o.signal);
      if (blob) {
        report(0.2, "文字にしています");
        const caps = await tryApi(blob, o);
        throwIfAborted(o.signal);
        if (caps && caps.length) {
          report(1, "文字にしました");
          return { captions: caps, via: "api", warnings };
        }
        if (apiState.disabled) warnings.push(apiState.reason);
      }
    } catch (e) {
      if (isAbort(e)) throw e;
      warnings.push(str(e && e.message) || "文字起こしの口へ繋がりませんでした");
    }
  } else if (apiState.disabled && apiState.reason) {
    warnings.push(apiState.reason);
  }

  /* ② Web Speech（既定では使わない） */
  if (o.useWebSpeech === true) {
    report(0.3, "音声認識を起こしています");
    try {
      const caps = await listenWebSpeech(o);
      throwIfAborted(o.signal);
      if (caps.length) {
        report(1, "聞き取りました");
        warnings.push("端末の音声認識で聞き取りました（マイクから拾うので、元の音と時刻が少しずれます）");
        return { captions: caps, via: "webspeech", warnings };
      }
    } catch (e) {
      if (isAbort(e)) throw e;
      warnings.push(str(e && e.message) || "音声認識が使えませんでした");
    }
  } else if (capabilities().webSpeech) {
    warnings.push("この端末は音声認識を持っています（使うには useWebSpeech を立ててください）");
  }

  /* ③ 無音から「話している区間」だけを作る（文字は空） */
  report(0.6, "話している区間を探しています");
  const sil = await silenceOf(blobOrAssetId, o);
  throwIfAborted(o.signal);
  const captions = captionsFromSilence(sil.spans, {
    duration: finite(o.duration, 0) || sil.duration,
    minDur: o.minDur, maxDur: o.maxDur
  });
  report(1, captions.length ? "枠を作りました" : "できませんでした");
  if (!captions.length) {
    warnings.push("音の解析が無いので区間も作れませんでした（先に素材を解析してください）");
    return { captions: [], via: "none", warnings };
  }
  warnings.push("文字起こしは使えないので、話している区間の空の枠だけ作りました");
  return { captions, via: "silence", warnings };
}
