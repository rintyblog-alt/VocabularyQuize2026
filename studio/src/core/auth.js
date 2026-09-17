/* ══════════════════════════════════════════════════════════════════════
   core/auth.js — アカウント（契約書 §10）。**既存 VocabuQuiz の会員基盤をそのまま使う**

   ★ 何をする所か
     ・新規登録（メール確認コードの 4 段: start → verify → resend → consent）
     ・ログイン / ログアウト / ゲスト / 起動時の復帰（boot）
     ・パスワード変更 / パスワード再設定（コード or 暗証番号）
     ・上の全てを 1 本の request() に集め、失敗を AuthError に包んで返す
     ・パスワード強度・入力の検め（**純関数。ここだけは試験で守る**）
     DOM は一切触らない（画面は ui/auth-screen.js の仕事）。

   ★ なぜこの形か
     ・**会員システムを作らない。**本体 index.html と同じ API・同じ保管キーを使う。
       別に作ると「本体では入れているのに Studio では弾かれる」が必ず起き、
       しかも片方だけ直したときに黙って食い違う（契約書 §10 の一行目）。
       保管キーが同じなので **本体でログイン済みなら Studio も入っている**。
     ・API の口・引数・戻りは契約書 §10.1 が正。特に /api/auth/change-password
       だけが **snake_case**（grade_prefix / old_password / new_password）。
       気持ち悪いが、サーバがそうなので **ここで勝手に直さない**。
     ・登録の 4 段は **状態を持たない**。challengeId / registrationSession は
       呼び出し側（UI）が持つ。ここに持たせると、画面を閉じた・戻った・
       2 つのタブで別々に進めた、で簡単に食い違う。
     ・fetch は必ず request() を通す。timeout（AbortController）を付け忘れた
       口が 1 つでも在ると、電波の悪い所でボタンが永遠に回り続ける。
     ・**ネット不通（NETWORK/TIMEOUT）と サーバの拒否（HTTP_xxx）を必ず分ける。**
       前者は「もう一度」、後者は「入力が違う」で、利用者に言うことが正反対。
     ・オフラインで起動したら、保存済みの user で **暫定的に入れたまま**にし
       state.stale = true を立てるだけにする（編集を止めない。§10 の割り切り）。
     ・ゲストは必須。**ゲストでも編集機能は一切制限しない**（保存はローカルのみ）。

   ★ 触るときの注意
     ・保管キー（AUTH_KEYS）を変えると本体との共有が切れる。絶対に変えない。
     ・localStorage は iOS Safari のプライベートモードで **読むだけで throw する**。
       全ての読み書きを safeStorage() 経由にする（例外を外に出さない）。
     ・expiresAt は本体が書いた値をそのまま持つ（秒/ミリ秒が混ざり得るので
       **比べるときだけ** normalizeExpiresAt() で ms に直す。書き戻しはしない）。
     ・boot() は例外を投げない。どんな失敗でも最後は anon か user(stale) に落ちる。
     ・passwordStrength / validate* / normalizeGradePrefix は **純関数**。
       ここに fetch も Date も入れない（tests/auth.test.mjs が単調性まで見る）。
     ・CONTRACT-NOTE: 契約書 §10.2 の createAuth は { apiBase, storage } だが、
       試験で偽の fetch と偽の storage を差せないと分類（NETWORK/TIMEOUT/401/429）
       を確かめられないので fetchImpl / sessionStorage / timeout を
       **任意の追加引数**として受ける（契約の口は 1 つも減らしていない）。
   ══════════════════════════════════════════════════════════════════════ */

import { uid } from "./util.js";
import { scope } from "./log.js";

const L = scope("auth");

/* ── 0. 定数 ───────────────────────────────────────────────────── */

/** 接続先の既定（契約書 §10） */
export const DEFAULT_API_BASE = "https://vocabuquiz-api.rintyblog.workers.dev";

/**
 * 保管キー。**本体アプリと同じ**（契約書 §10）。
 * sessionOnly / sessionAlive も本体の「ログインしたまま」と同じ鍵を使う。
 */
export const AUTH_KEYS = Object.freeze({
  token: "app.auth.token.v1",
  expiresAt: "app.auth.expiresAt.v1",
  profile: "app.auth.profile.v1",
  mode: "app.auth.mode.v1",
  /** 「ログインしたまま」を外した印（localStorage 側。本体と同じ） */
  sessionOnly: "app.auth.session_only.v1",
  /** このブラウザセッションが生きている印（sessionStorage 側。本体と同じ） */
  sessionAlive: "app.auth.session_alive.v1",
  /** ゲストの id（Studio だけが使う枝。本体には無い） */
  guestId: "vqstudio.auth.guestId.v1",
});

/** 既定の待ち時間（ms）。契約書 §10 の口は全部これを通る */
export const DEFAULT_TIMEOUT_MS = 15000;
/** パスワードの最短（サーバも 8 文字以上を求める） */
export const MIN_PASSWORD_LENGTH = 8;
/** 確認コードの桁数 */
export const CODE_LENGTH = 6;
/** ニックネームの厳しい形（新規登録の画面はこれを求めてよい。既存の名前は通す） */
export const NICKNAME_STRICT_RE = /^[A-Za-z0-9._-]{2,24}$/;
/** 学年接頭の形（例 "H1"） */
export const GRADE_PREFIX_RE = /^[A-Z][0-9]$/;

/** 強度の呼び名（score 0..4 と同じ並び） */
const STRENGTH_LABELS = Object.freeze(["とても弱い", "弱い", "ふつう", "強い", "とても強い"]);

/**
 * よく使われる語（40 語程度）。丸ごと一致は即 0、6 文字以上の語を含むだけでも減点。
 * 日本の利用者が実際に入れる物（naruto / sakura / hogehoge…）も入れておく。
 */
const COMMON_PASSWORDS = new Set([
  "password", "passw0rd", "p@ssword", "pass", "secret", "login", "admin",
  "administrator", "welcome", "hello", "sample", "test", "testtest", "hogehoge",
  "123456", "1234567", "12345678", "123456789", "1234567890", "000000", "111111",
  "qwerty", "qwertyui", "asdfgh", "asdfghjk", "zxcvbn", "qazwsx", "zaq12wsx",
  "1q2w3e4r", "abc123", "letmein", "iloveyou", "monkey", "dragon", "sunshine",
  "princess", "football", "baseball", "master", "shadow", "superman", "batman",
  "trustno1", "starwars", "whatever", "pokemon", "naruto", "sasuke", "sakura",
  "kimetsu", "vocabuquiz", "vocabulary", "japan", "tokyo", "nihon", "gakusei",
]);

/* ── 1. AuthError（契約書 §10.2） ──────────────────────────────── */

/**
 * 認証まわりの失敗。**呼び出し側が code で分岐できる形**にするのが肝。
 * code: "NETWORK" | "TIMEOUT" | "ABORTED" | "HTTP_401" | "HTTP_<n>" |
 *       サーバが返した status 文字列（"RESTART_REQUIRED" / "EXPIRED" …） |
 *       "REJECTED"（ok:false だが status が無い） | "VALIDATION" | "BAD_RESPONSE"
 */
export class AuthError extends Error {
  /**
   * @param {string} message 利用者にそのまま見せられる日本語
   * @param {{code?:string, status?:number, retryAfter?:number|null,
   *          attemptsRemaining?:number|null, serverStatus?:string,
   *          body?:any, cause?:any}} [info]
   */
  constructor(message, info = {}) {
    super(String(message || "うまくいきませんでした。"));
    this.name = "AuthError";
    /** @type {string} 分岐の頼り。必ず入る */
    this.code = String(info.code || "UNKNOWN");
    /** @type {number} HTTP の番号（通信できなかったときは 0） */
    this.status = Number.isFinite(info.status) ? Number(info.status) : 0;
    /** @type {number|null} 429 等で「何秒待てば良いか」 */
    this.retryAfter = info.retryAfter == null ? null : Number(info.retryAfter);
    /** @type {number|null} コードの残り試行回数（画面に出す） */
    this.attemptsRemaining = info.attemptsRemaining == null ? null : Number(info.attemptsRemaining);
    /** @type {string} サーバの status 文字列（code に採れなかったときも残す） */
    this.serverStatus = String(info.serverStatus || "");
    /** @type {any} 応答の中身（開発時の追跡用） */
    this.body = info.body === undefined ? null : info.body;
    if (info.cause !== undefined) this.cause = info.cause;
  }

  /** 通信できなかった（＝もう一度試せば直るかもしれない）か */
  get isOffline() {
    return this.code === "NETWORK" || this.code === "TIMEOUT";
  }
}

/* ── 2. 純関数（ここは必ず試験する） ──────────────────────────── */

/** 全角英数を半角へ（iOS の日本語キーボードは "Ｈ１" を打ってくる） */
function toHalfWidth(s) {
  return String(s).replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

/**
 * 学年接頭を整える。"h1" → "H1"、"Ｈ１" → "H1"、"その他" → "OTHER"。
 * /^[A-Z][0-9]$/ と "OTHER"（本体は "OT"）を想定するが、
 * **知らない形でも通す**（サーバが正。画面で勝手に弾くと入れない人が出る）。
 * @param {*} s @returns {string}
 */
export function normalizeGradePrefix(s) {
  if (s == null) return "";
  const raw = toHalfWidth(String(s)).replace(/\s+/g, "").trim();
  if (!raw) return "";
  if (/^(その他|ほか|他)$/.test(raw)) return "OTHER";
  return raw.toUpperCase();
}

/** 制御文字（見えない文字）が混じっていないか。
    正規表現に直書きすると ファイル自体に制御文字が残るので 番号で見る。 */
function hasControlChar(s) {
  for (const c of String(s)) {
    const n = c.codePointAt(0);
    if (n < 0x20 || n === 0x7f) return true;
  }
  return false;
}

/**
 * ニックネーム（＝ログイン ID）を検める。
 * ok=false は「明らかに送れない」ときだけ（空・2 文字未満・24 文字超・制御文字）。
 * 既存の会員には日本語の名前も居るので **文字種では弾かない**。
 * 新規登録の画面は strict が true であることを追加で求めてよい。
 * @param {*} s @returns {{ok:boolean, value:string, message:string, strict:boolean}}
 */
export function validateNickname(s) {
  const value = String(s == null ? "" : s).trim().replace(/\s+/g, "");
  const chars = Array.from(value);
  let message = "";
  let ok = true;
  if (!chars.length) { ok = false; message = "ログイン ID を入れてください。"; }
  else if (hasControlChar(value)) { ok = false; message = "使えない文字が入っています。"; }
  else if (chars.length < 2) { ok = false; message = "ログイン ID は 2 文字以上にしてください。"; }
  else if (chars.length > 24) { ok = false; message = "ログイン ID は 24 文字以内にしてください。"; }
  return { ok, value, message, strict: NICKNAME_STRICT_RE.test(value) };
}

/**
 * メールを検める（登録の確認コードの送り先）。
 * **小文字化しない**（ローカル部の大小を勝手に変えると別のアドレスになり得る）。
 * @param {*} s @returns {{ok:boolean, value:string, message:string}}
 */
export function validateEmail(s) {
  const value = String(s == null ? "" : s).trim().replace(/\s+/g, "");
  if (!value) return { ok: false, value, message: "メールアドレスを入れてください。" };
  if (value.length > 254) return { ok: false, value, message: "メールアドレスが長すぎます。" };
  const ok = /^[^\s@,:;<>"'()[\]\\]+@[^\s@.,:;<>"'()[\]\\]+(\.[^\s@.,:;<>"'()[\]\\]+)+$/.test(value);
  return { ok, value, message: ok ? "" : "メールアドレスの形を確かめてください（例: name@example.com）。" };
}

/**
 * メールを隠した形にする（サーバが maskedEmail を返さなかったときの控え）。
 * @param {*} s @returns {string}
 */
export function maskEmail(s) {
  const v = String(s == null ? "" : s).trim();
  const at = v.lastIndexOf("@");
  if (at <= 0) return "***";
  return v.slice(0, 1) + "*****" + v.slice(at);
}

/** 文字の種類を数える（日本語などは記号として扱う＝種類が増える） */
function charClasses(s) {
  const lower = /[a-z]/.test(s);
  const upper = /[A-Z]/.test(s);
  const digit = /[0-9]/.test(s);
  const symbol = /[^A-Za-z0-9]/.test(s);
  return {
    lower, upper, digit, symbol,
    count: (lower ? 1 : 0) + (upper ? 1 : 0) + (digit ? 1 : 0) + (symbol ? 1 : 0),
  };
}

/** 連続した並び（abcd / 4321）の最長 */
function longestRun(chars) {
  let best = chars.length ? 1 : 0;
  let up = 1;
  let down = 1;
  for (let i = 1; i < chars.length; i++) {
    const d = chars[i].codePointAt(0) - chars[i - 1].codePointAt(0);
    up = d === 1 ? up + 1 : 1;
    down = d === -1 ? down + 1 : 1;
    if (up > best) best = up;
    if (down > best) best = down;
  }
  return best;
}

/** 同じ文字の繰り返し（aaa）の最長 */
function longestSame(chars) {
  let best = chars.length ? 1 : 0;
  let cur = 1;
  for (let i = 1; i < chars.length; i++) {
    cur = chars[i] === chars[i - 1] ? cur + 1 : 1;
    if (cur > best) best = cur;
  }
  return best;
}

/** 短い単位の丸ごと繰り返し（"abcabcabc" / "1212"）か */
function isRepeatedUnit(chars) {
  const n = chars.length;
  for (let u = 1; u <= 4; u++) {
    if (u >= n || n % u !== 0) continue;
    let same = true;
    for (let i = u; i < n && same; i++) if (chars[i] !== chars[i - u]) same = false;
    if (same) return true;
  }
  return false;
}

/** よく使われる語に当たったか（"exact" = 丸ごと / "contains" = 含む / "" = 無事） */
function commonHit(s) {
  const low = s.toLowerCase();
  if (COMMON_PASSWORDS.has(low)) return "exact";
  const trimmed = low.replace(/^[^a-z]+/, "").replace(/[^a-z]+$/, "");
  if (trimmed.length >= 4 && COMMON_PASSWORDS.has(trimmed)) return "exact";
  for (const w of COMMON_PASSWORDS) {
    if (w.length >= 6 && low.includes(w)) return "contains";
  }
  return "";
}

/**
 * パスワードの強さ（契約書 §10.2）。**純関数**。
 * 長さ（8/12/16）と種類数（2/3/4）で加点し、よくある語・連続・反復で減点する。
 * 致命的な弱さ（丸ごとよくある語 / 全部が連続 / 全部が繰り返し）は上限 0 に落とす。
 * @param {*} pw
 * @returns {{score:number, label:string, hints:string[], length:number, classes:number}}
 */
export function passwordStrength(pw) {
  const s = pw == null ? "" : String(pw);
  const chars = Array.from(s);
  const len = chars.length;
  if (len === 0) {
    return {
      score: 0, label: STRENGTH_LABELS[0],
      hints: ["8 文字以上のパスワードを決めてください。"],
      length: 0, classes: 0,
    };
  }

  const cls = charClasses(s);
  let points = 0;
  if (len >= 8) points += 1;
  if (len >= 12) points += 1;
  if (len >= 16) points += 1;
  if (cls.count >= 2) points += 1;
  if (cls.count >= 3) points += 1;
  if (cls.count >= 4) points += 1;

  /** これ以上は名乗れない上限（致命的な弱さは加点を無かったことにする） */
  let cap = 4;
  const hints = [];

  const repeated = len >= 4 && isRepeatedUnit(chars);
  const run = longestRun(chars);
  const same = longestSame(chars);
  if (repeated) {
    cap = 0;
    hints.push("同じ並びの繰り返し（abcabc / 1111）は すぐ破られます。");
  } else if (len >= 4 && run >= len) {
    cap = 0;
    hints.push("順番に並んだだけの文字（abcdef / 123456）は すぐ破られます。");
  } else {
    if (run >= 4 && run / len >= 0.5) {
      points -= 1;
      hints.push("順番に並んだ部分（abcd / 1234）が多いです。混ぜてください。");
    }
    if (same >= 3) {
      points -= 1;
      hints.push("同じ文字が 3 つ以上続いています。");
    }
  }

  const hit = commonHit(s);
  if (hit === "exact") {
    cap = 0;
    hints.push("よく使われるパスワードそのものです。別の物にしてください。");
  } else if (hit === "contains") {
    points -= 2;
    hints.push("よく知られた言葉が そのまま入っています。");
  }

  if (len < MIN_PASSWORD_LENGTH) {
    if (cap > 1) cap = 1;
    hints.push("8 文字以上にしてください（サーバも 8 文字以上を求めます）。");
  } else if (len < 12) {
    hints.push("12 文字以上にすると ぐっと強くなります。");
  }
  if (!cls.lower) hints.push("小文字を混ぜてください。");
  if (!cls.upper) hints.push("大文字を混ぜると強くなります。");
  if (!cls.digit) hints.push("数字を混ぜると強くなります。");
  if (!cls.symbol) hints.push("記号（! ? - _ など）を混ぜると強くなります。");

  let score = points <= 1 ? 0 : points <= 2 ? 1 : points <= 3 ? 2 : points <= 4 ? 3 : 4;
  if (score > cap) score = cap;
  if (score < 0) score = 0;
  return { score, label: STRENGTH_LABELS[score], hints: hints.slice(0, 4), length: len, classes: cls.count };
}

/**
 * 保存された expiresAt を ms に直す（**比べるときだけ**使う）。
 * 本体が書いた値は秒とミリ秒が混ざり得る。1e12 未満なら秒と見る。
 * @param {*} v @returns {number} 0 = 分からない
 */
export function normalizeExpiresAt(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n < 1e12 ? Math.trunc(n * 1000) : Math.trunc(n);
}

/**
 * トークンが切れているか。0（不明）は **切れていない扱い**（/me に確かめさせる）。
 * @param {*} expiresAt @param {number} [now=Date.now()] @param {number} [skewMs=0]
 * @returns {boolean}
 */
export function isTokenExpired(expiresAt, now = Date.now(), skewMs = 0) {
  const ms = normalizeExpiresAt(expiresAt);
  if (!ms) return false;
  return ms <= now + skewMs;
}

/**
 * 接続先を決める（契約書 §10）。?api= → __PUBLIC_CONFIG__ → VQ_API_BASE → 既定。
 * ?api= は **https（か localhost）だけ**受ける。ここに他所の http を入れられると
 * パスワードがそのまま流れる（URL は誰でも作って人に送れる）。
 * @param {string} [explicit] createAuth に渡された値（在れば最優先）
 * @returns {string} 末尾の / を落とした基点
 */
export function resolveApiBase(explicit) {
  const clean = (v) => String(v == null ? "" : v).trim().replace(/\/+$/, "");
  const ex = clean(explicit);
  if (ex) return ex;
  try {
    const q = String(globalThis.location?.search || "");
    const m = /[?&]api=([^&#]+)/.exec(q);
    if (m) {
      const v = clean(decodeURIComponent(m[1]));
      const okHost = /^https:\/\//i.test(v) || /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(v);
      if (v && okHost) return v;
      if (v) L.warn("?api= は https だけ受ける（無視した）", v);
    }
  } catch (_e) { /* location が無い（Node の試験） */ }
  try {
    const g = globalThis;
    const fromConfig = clean(g.__PUBLIC_CONFIG__?.api?.base);
    if (fromConfig) return fromConfig;
    const fromGlobal = clean(g.VQ_API_BASE) || clean(g.AUTH_API_BASE);
    if (fromGlobal) return fromGlobal;
  } catch (_e) { /* 何も無いだけ */ }
  return DEFAULT_API_BASE;
}

/* ── 3. 保管（iOS のプライベートモードで throw しても死なない） ── */

/** どこにも書けない環境用の代わり（その場だけ覚える） */
function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

/**
 * 例外を外に出さない storage の被せ物。
 * @param {*} raw localStorage / sessionStorage / 偽物 / undefined
 */
function safeStorage(raw) {
  let s = raw;
  try {
    if (!s || typeof s.getItem !== "function") s = null;
    else s.getItem(AUTH_KEYS.mode); // 読むだけで throw する環境を先に見つける
  } catch (_e) {
    s = null;
  }
  if (!s) s = memoryStorage();
  return {
    get(key) {
      try { return String(s.getItem(key) ?? ""); } catch (_e) { return ""; }
    },
    set(key, value) {
      try {
        if (value === "" || value == null) s.removeItem(key);
        else s.setItem(key, String(value));
        return true;
      } catch (_e) { return false; }
    },
    remove(key) {
      try { s.removeItem(key); return true; } catch (_e) { return false; }
    },
  };
}

/* ── 4. 小道具 ─────────────────────────────────────────────────── */

const str = (v) => String(v == null ? "" : v).trim();
const numOrNull = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** HTTP の番号から「利用者に見せる既定の文言」 */
function defaultMessage(status) {
  if (status === 400) return "入力の内容をもう一度確かめてください。";
  if (status === 401) return "ログインの情報が正しくありません。";
  if (status === 403) return "この操作は許可されていません。";
  if (status === 404) return "見つかりませんでした。";
  if (status === 409) return "すでに使われています。";
  if (status === 429) return "回数が多すぎます。少し待ってからもう一度お試しください。";
  if (status >= 500) return "サーバー側で問題が起きています。少し待ってからもう一度お試しください。";
  return "うまくいきませんでした。";
}

/** Retry-After（ヘッダ or 本文）を秒で拾う */
function pickRetryAfter(res, data) {
  let v = null;
  try {
    if (res && res.headers && typeof res.headers.get === "function") v = res.headers.get("retry-after");
  } catch (_e) { /* ヘッダを読めないだけ */ }
  const fromHeader = numOrNull(v);
  if (fromHeader != null) return fromHeader;
  const fromBody = numOrNull(data ? data.retryAfter : null);
  if (fromBody != null) return fromBody;
  return numOrNull(data ? data.resendAvailableIn : null);
}

/* ── 5. createAuth ─────────────────────────────────────────────── */

/**
 * @typedef {Object} AuthState
 * @property {"booting"|"anon"|"guest"|"user"} status
 * @property {any|null} user      サーバの user（guest/anon は null）
 * @property {string} token
 * @property {number} expiresAt   保存された生の値（比べるときは normalizeExpiresAt）
 * @property {boolean} stale      true = /me で確かめられていない（オフライン起動）
 * @property {string} guestId     ゲストのときだけ入る
 */

/**
 * @typedef {Object} Challenge
 * @property {boolean} ok
 * @property {string} challengeId
 * @property {string} maskedEmail
 * @property {number} expiresIn
 * @property {number} resendAvailableIn
 * @property {number} resendsRemaining
 * @property {string} devCode   開発環境だけ来る（画面に出さないと「届かない」に見える）
 * @property {string} message
 */

/**
 * アカウントの窓口を作る（契約書 §10.2）。
 * @param {{apiBase?:string, storage?:any, sessionStorage?:any,
 *          fetchImpl?:Function, timeout?:number}} [opts]
 */
export function createAuth(opts = {}) {
  const apiBase = resolveApiBase(opts.apiBase);
  const store = safeStorage(opts.storage !== undefined ? opts.storage : globalThis.localStorage);
  const session = safeStorage(opts.sessionStorage !== undefined ? opts.sessionStorage : globalThis.sessionStorage);
  const rawFetch = typeof opts.fetchImpl === "function" ? opts.fetchImpl : globalThis.fetch;
  const fetchImpl = typeof rawFetch === "function" ? (...a) => rawFetch(...a) : null;
  const defaultTimeout = Number.isFinite(opts.timeout) && Number(opts.timeout) > 0
    ? Number(opts.timeout)
    : DEFAULT_TIMEOUT_MS;

  /** @type {Set<(s:AuthState)=>void>} */
  const listeners = new Set();
  /** @type {Set<(e:AuthError)=>void>} */
  const unauthorizedListeners = new Set();
  /** @type {Promise<AuthState>|null} boot の二重呼びを 1 本にまとめる */
  let booting = null;

  /* ── 保管の読み書き ── */

  function readProfile() {
    const raw = store.get(AUTH_KEYS.profile);
    if (!raw) return null;
    try {
      const v = JSON.parse(raw);
      return v && typeof v === "object" ? v : null;
    } catch (_e) {
      return null; // 壊れていたら無かったことにする（/me が正）
    }
  }

  function writeProfile(user) {
    if (user && typeof user === "object") {
      try {
        store.set(AUTH_KEYS.profile, JSON.stringify(user));
      } catch (_e) { /* JSON にできない物が混ざっていたら諦める */ }
    } else {
      store.remove(AUTH_KEYS.profile);
    }
  }

  /** 「ログインしたまま」の印を付け替える（本体と同じ鍵・同じ意味） */
  function applyRemember(remember) {
    if (remember) {
      store.remove(AUTH_KEYS.sessionOnly);
    } else {
      store.set(AUTH_KEYS.sessionOnly, "1");
      session.set(AUTH_KEYS.sessionAlive, "1");
    }
  }

  /**
   * 前回「ログインしたまま」を外していて、かつ ブラウザを閉じた後なら捨てる。
   * sessionStorage はセッションで消えるので、それを目印に使う（本体と同じやり方）。
   */
  function sweepSession() {
    const sessionOnly = store.get(AUTH_KEYS.sessionOnly) === "1";
    const alive = session.get(AUTH_KEYS.sessionAlive) === "1";
    if (sessionOnly && !alive && store.get(AUTH_KEYS.token)) clearStored();
    session.set(AUTH_KEYS.sessionAlive, "1");
  }

  function clearStored() {
    store.remove(AUTH_KEYS.token);
    store.remove(AUTH_KEYS.expiresAt);
    store.remove(AUTH_KEYS.profile);
  }

  /* ── state ── */

  /** @type {AuthState} */
  let state = Object.freeze({ status: "anon", user: null, token: "", expiresAt: 0, stale: false, guestId: "" });

  function setState(partial) {
    state = Object.freeze({ ...state, ...partial });
    for (const fn of Array.from(listeners)) {
      try { fn(state); } catch (err) { L.error("subscribe の中で落ちた", err); }
    }
    return state;
  }

  const anonState = () => setState({ status: "anon", user: null, token: "", expiresAt: 0, stale: false, guestId: "" });

  /* ── 起動時の見立て（boot() を待たずに UI が形を決められるように） ── */
  sweepSession();
  {
    const token0 = store.get(AUTH_KEYS.token);
    const exp0 = Number(store.get(AUTH_KEYS.expiresAt)) || 0;
    const mode0 = store.get(AUTH_KEYS.mode);
    if (token0 && !isTokenExpired(exp0)) {
      // 「たぶん入っている」。確かめるのは boot()。
      state = Object.freeze({ status: "booting", user: readProfile(), token: token0, expiresAt: exp0, stale: true, guestId: "" });
    } else if (mode0 === "guest") {
      state = Object.freeze({ status: "guest", user: null, token: "", expiresAt: 0, stale: false, guestId: store.get(AUTH_KEYS.guestId) });
    }
  }

  /* ── 通信（全ての口はここを通る） ── */

  function authHeader() {
    const t = state.token || store.get(AUTH_KEYS.token);
    return t ? { Authorization: `Bearer ${t}` } : {};
  }

  function notifyUnauthorized(err) {
    for (const fn of Array.from(unauthorizedListeners)) {
      try { fn(err); } catch (e2) { L.error("onUnauthorized の中で落ちた", e2); }
    }
  }

  /**
   * 唯一の fetch。timeout は AbortController。失敗は必ず AuthError で投げる。
   * @param {string} path "/api/auth/login" など
   * @param {{method?:string, body?:any, auth?:boolean, token?:string,
   *          timeout?:number, signal?:AbortSignal|null}} [o]
   * @returns {Promise<any>} 応答の JSON（本文が無ければ {}）
   */
  async function request(path, o = {}) {
    const method = o.method || "GET";
    const timeout = Number.isFinite(o.timeout) && Number(o.timeout) > 0 ? Number(o.timeout) : defaultTimeout;
    if (!fetchImpl) throw new AuthError("この環境では通信できません。", { code: "NETWORK" });

    const headers = { Accept: "application/json" };
    if (o.body != null) headers["Content-Type"] = "application/json";
    if (o.auth) {
      const t = str(o.token) || state.token || store.get(AUTH_KEYS.token);
      if (t) headers.Authorization = `Bearer ${t}`;
    }

    const ctrl = typeof AbortController === "function" ? new AbortController() : null;
    let timedOut = false;
    let timer = null;
    let onAbort = null;
    if (ctrl && timeout > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        try { ctrl.abort(); } catch (_e) { /* もう終わっている */ }
      }, timeout);
    }
    if (ctrl && o.signal) {
      if (o.signal.aborted) { try { ctrl.abort(); } catch (_e) { /* 同上 */ } }
      else {
        onAbort = () => { try { ctrl.abort(); } catch (_e) { /* 同上 */ } };
        try { o.signal.addEventListener("abort", onAbort); } catch (_e) { onAbort = null; }
      }
    }

    let res = null;
    try {
      res = await fetchImpl(`${apiBase}${path}`, {
        method,
        headers,
        body: o.body == null ? undefined : JSON.stringify(o.body),
        signal: ctrl ? ctrl.signal : undefined,
        mode: "cors",
        credentials: "omit",
        cache: "no-store",
      });
    } catch (err) {
      if (timedOut) {
        throw new AuthError("時間内に応答がありませんでした。通信が不安定かもしれません。", { code: "TIMEOUT", cause: err });
      }
      if (o.signal && o.signal.aborted) throw new AuthError("中止しました。", { code: "ABORTED", cause: err });
      throw new AuthError("サーバーへつながりませんでした。通信の状態を確かめてください。", { code: "NETWORK", cause: err });
    } finally {
      if (timer) clearTimeout(timer);
      if (onAbort) {
        try { o.signal.removeEventListener("abort", onAbort); } catch (_e) { /* 外せないだけ */ }
      }
    }

    const status = Number(res && res.status) || 0;
    let text = "";
    try {
      text = await res.text();
    } catch (err) {
      throw new AuthError("応答を読み取れませんでした。", { code: "NETWORK", status, cause: err });
    }
    /** @type {any} */
    let data = {};
    if (text) {
      try { data = JSON.parse(text); } catch (_e) { data = { message: String(text).slice(0, 300) }; }
    }
    if (!data || typeof data !== "object") data = { value: data };

    const serverStatus = typeof data.status === "string" ? data.status.trim() : "";
    const retryAfter = pickRetryAfter(res, data);
    const attemptsRemaining = numOrNull(data.attemptsRemaining);
    const message = str(data.message) || str(data.error) || defaultMessage(status);

    if (status === 401) {
      /* 401 は「トークンが古い/違う」。呼び出し側（UI）へ知らせて、
         入り直す画面を出させる。ここで勝手にログアウトはしない
         （書き出しの途中で全部消えると困る。捨てるのは boot() の仕事）。 */
      const err = new AuthError(message, {
        code: "HTTP_401", status, retryAfter, attemptsRemaining, serverStatus, body: data,
      });
      notifyUnauthorized(err);
      throw err;
    }
    if (!res.ok) {
      throw new AuthError(message, {
        code: serverStatus || `HTTP_${status}`,
        status, retryAfter, attemptsRemaining, serverStatus, body: data,
      });
    }
    // 200 でも { ok:false } を返す口が在る（本体もこれで判定している）
    if (data.ok === false) {
      throw new AuthError(message, {
        code: serverStatus || "REJECTED",
        status, retryAfter, attemptsRemaining, serverStatus, body: data,
      });
    }
    return data;
  }

  /* ── セッションの受け取り ── */

  /** ログイン/登録完了で貰った token を保管して user 状態にする */
  function adoptSession({ token, expiresAt, user, remember = true }) {
    const t = str(token);
    if (!t) throw new AuthError("ログインの応答が不正です（token がありません）。", { code: "BAD_RESPONSE" });
    const exp = Number(expiresAt);
    const keep = Number.isFinite(exp) && exp > 0 ? Math.trunc(exp) : 0;
    store.set(AUTH_KEYS.token, t);
    if (keep) store.set(AUTH_KEYS.expiresAt, String(keep));
    else store.remove(AUTH_KEYS.expiresAt);
    store.set(AUTH_KEYS.mode, "user");
    writeProfile(user);
    applyRemember(remember !== false);
    return setState({
      status: "user",
      user: user && typeof user === "object" ? user : null,
      token: t,
      expiresAt: keep,
      stale: false,
      guestId: "",
    });
  }

  /* ── 公開する口 ── */

  /**
   * 保存トークンで入り直す。**例外は投げない**（契約書 §10 の割り切り）。
   * @returns {Promise<AuthState>}
   */
  async function boot() {
    if (booting) return booting;
    booting = (async () => {
      sweepSession();
      const token = store.get(AUTH_KEYS.token);
      const expiresAt = Number(store.get(AUTH_KEYS.expiresAt)) || 0;
      const mode = store.get(AUTH_KEYS.mode);
      const cached = readProfile();

      if (!token) {
        clearStored();
        return mode === "guest" ? guest() : anonState();
      }
      if (isTokenExpired(expiresAt)) {
        L.warn("保存トークンの期限が切れていた");
        clearStored();
        return anonState();
      }

      setState({ status: "booting", user: cached, token, expiresAt, stale: true, guestId: "" });
      try {
        const data = await request("/api/auth/me", { method: "GET", auth: true, token });
        const user = data && typeof data.user === "object" && data.user ? data.user : null;
        if (!user) {
          clearStored();
          return anonState();
        }
        writeProfile(user);
        store.set(AUTH_KEYS.mode, "user");
        return setState({ status: "user", user, token, expiresAt, stale: false, guestId: "" });
      } catch (err) {
        const code = err instanceof AuthError ? err.code : "NETWORK";
        if (code === "NETWORK" || code === "TIMEOUT" || code === "ABORTED") {
          /* オフライン。保存済みの user で **入ったまま**にして編集を止めない。
             stale=true を見た画面は「未確認」の印を出すだけにする。 */
          L.warn("オフラインのまま起動した（暫定で user 状態）", code);
          return setState({ status: "user", user: cached, token, expiresAt, stale: true, guestId: "" });
        }
        /* サーバがはっきり断った（401 等）。ここで捨てないと ずっと弾かれ続ける。 */
        L.warn("保存トークンが通らなかった", code);
        clearStored();
        return anonState();
      }
    })();
    try {
      return await booting;
    } finally {
      booting = null;
    }
  }

  /**
   * stale を外したい / 情報を取り直したいとき。
   * CONTRACT-NOTE: 契約書 §10.2 に無い追加。オフラインで入った後に繋がったとき、
   * boot をもう一度呼ぶ以外の手が無いと画面が「未確認」のまま固まるので足した。
   * @returns {Promise<AuthState>}
   */
  async function refresh() {
    if (!store.get(AUTH_KEYS.token)) return state;
    return boot();
  }

  /** @returns {Promise<AuthState>} */
  async function login({ gradePrefix, nickname, password, remember = true } = {}) {
    const grade = normalizeGradePrefix(gradePrefix);
    const nick = validateNickname(nickname);
    if (!grade) throw new AuthError("学年を選んでください。", { code: "VALIDATION" });
    if (!nick.ok) throw new AuthError(nick.message, { code: "VALIDATION" });
    if (!String(password || "")) throw new AuthError("パスワードを入れてください。", { code: "VALIDATION" });

    const data = await request("/api/auth/login", {
      method: "POST",
      body: { gradePrefix: grade, nickname: nick.value, password: String(password) },
    });
    const user = data && typeof data.user === "object" ? data.user : null;
    if (!str(data && data.token) || !user) {
      throw new AuthError("ログインの応答が不正です。もう一度お試しください。", { code: "BAD_RESPONSE", body: data });
    }
    return adoptSession({ token: data.token, expiresAt: data.expiresAt, user, remember });
  }

  /**
   * ログアウト。keepGuest なら そのままゲストとして編集を続けられる。
   * @param {{keepGuest?:boolean}} [o] @returns {AuthState}
   */
  function logout(o = {}) {
    clearStored();
    if (o && o.keepGuest) return guest();
    store.remove(AUTH_KEYS.mode);
    return anonState();
  }

  /**
   * ログインせずに使う道（必須）。**ゲストでも編集機能は一切制限しない。**
   * @returns {AuthState}
   */
  function guest() {
    let id = store.get(AUTH_KEYS.guestId);
    if (!/^guest_[A-Za-z0-9]{4,}$/.test(id)) {
      id = uid("guest");
      store.set(AUTH_KEYS.guestId, id);
    }
    /* CONTRACT-NOTE: 共有の mode キーは **本体のログインを消さない**ように、
       user の token が残っているときは触らない（本体が guest 扱いになると
       同じ端末の学習側が締め出される）。 */
    if (!store.get(AUTH_KEYS.token)) store.set(AUTH_KEYS.mode, "guest");
    return setState({ status: "guest", user: null, token: "", expiresAt: 0, stale: false, guestId: id });
  }

  /* ── 新規登録（4 段。状態は呼び出し側＝UI が持つ） ── */

  /**
   * 応答を Challenge の形に揃える。
   * @param {any} data @param {string} [email] maskedEmail が無いときの控え
   * @returns {Challenge}
   */
  function toChallenge(data, email) {
    const challengeId = str(data && data.challengeId);
    if (!challengeId) {
      throw new AuthError("確認コードの受付が返ってきませんでした。もう一度お試しください。", { code: "BAD_RESPONSE", body: data });
    }
    return {
      ok: true,
      challengeId,
      maskedEmail: str(data && data.maskedEmail) || (email ? maskEmail(email) : ""),
      expiresIn: numOrNull(data && data.expiresIn) ?? 600,
      resendAvailableIn: numOrNull(data && data.resendAvailableIn) ?? 30,
      resendsRemaining: numOrNull(data && data.resendsRemaining) ?? 3,
      /* 開発環境はメールを送らず devCode を返す。**そのまま渡す**。
         画面に出さないと「コードが届かない」ようにしか見えない（本体で踏んだ）。 */
      devCode: str(data && data.devCode),
      message: str(data && data.message),
    };
  }

  const register = {
    /**
     * ① メール確認を始める。
     * @param {{email:string, gradePrefix:string, nickname:string,
     *          password:string, password2?:string, turnstileToken?:string}} p
     * @returns {Promise<Challenge>}
     */
    async start(p = {}) {
      const email = validateEmail(p.email);
      const nick = validateNickname(p.nickname);
      const grade = normalizeGradePrefix(p.gradePrefix);
      const pw = String(p.password || "");
      const pw2 = p.password2 === undefined ? pw : String(p.password2);
      if (!email.ok) throw new AuthError(email.message, { code: "VALIDATION" });
      if (!nick.ok) throw new AuthError(nick.message, { code: "VALIDATION" });
      if (!grade) throw new AuthError("学年を選んでください。", { code: "VALIDATION" });
      if (pw.length < MIN_PASSWORD_LENGTH) throw new AuthError("パスワードは 8 文字以上にしてください。", { code: "VALIDATION" });
      if (pw !== pw2) throw new AuthError("2 つのパスワードが違います。", { code: "VALIDATION" });

      const data = await request("/api/auth/register/start", {
        method: "POST",
        body: {
          email: email.value,
          gradePrefix: grade,
          nickname: nick.value,
          password: pw,
          password2: pw2,
          turnstileToken: str(p.turnstileToken),
        },
      });
      return toChallenge(data, email.value);
    },

    /**
     * ② 6 桁のコードを確かめる。
     * @param {{challengeId:string, code:string}} p
     * @returns {Promise<{registrationSession:string, verified:boolean,
     *                    alreadyVerified:boolean, message:string}>}
     */
    async verify(p = {}) {
      const challengeId = str(p.challengeId);
      const code = String(p.code || "").replace(/\D/g, "");
      if (!challengeId) throw new AuthError("受付が切れています。最初からやり直してください。", { code: "VALIDATION" });
      if (code.length !== CODE_LENGTH) throw new AuthError("6 桁の数字を入れてください。", { code: "VALIDATION" });

      const data = await request("/api/auth/register/verify", { method: "POST", body: { challengeId, code } });
      const verified = !!(data && data.verified);
      const alreadyVerified = !!(data && data.alreadyVerified);
      if (!verified && !alreadyVerified) {
        throw new AuthError(str(data && data.message) || "確認できませんでした。", {
          code: str(data && data.status) || "REJECTED",
          attemptsRemaining: numOrNull(data && data.attemptsRemaining),
          body: data,
        });
      }
      return {
        registrationSession: str(data && data.registrationSession),
        verified, alreadyVerified,
        message: str(data && data.message),
      };
    },

    /**
     * ③ コードを送り直す（30 秒待ち・残り回数はサーバが持つ）。
     * @param {{challengeId:string}} p @returns {Promise<Challenge>}
     */
    async resend(p = {}) {
      const challengeId = str(p.challengeId);
      if (!challengeId) throw new AuthError("受付が切れています。最初からやり直してください。", { code: "VALIDATION" });
      const data = await request("/api/auth/register/resend", { method: "POST", body: { challengeId } });
      /* この口は challengeId を返さない。呼び出し側が同じ受付を続けられるよう、
         渡された challengeId を埋めて Challenge の形を保つ。 */
      return toChallenge({ challengeId, ...(data && typeof data === "object" ? data : {}) }, "");
    },

    /**
     * ④ 規約に同意して本登録（そのまま入った状態になる）。
     * @param {{registrationSession:string, pin?:string, remember?:boolean}} p
     * @returns {Promise<AuthState>}
     */
    async consent(p = {}) {
      const registrationSession = str(p.registrationSession);
      if (!registrationSession) throw new AuthError("受付が切れています。最初からやり直してください。", { code: "VALIDATION" });
      const data = await request("/api/auth/register/consent", {
        method: "POST",
        body: {
          registrationSession,
          agreeTerms: true,
          agreePrivacy: true,
          agreeAge: true,
          pin: str(p.pin),
        },
      });
      return adoptSession({
        token: data && data.token,
        expiresAt: data && data.expiresAt,
        user: (data && data.user) || null,
        remember: p.remember !== false,
      });
    },
  };

  /**
   * パスワード変更。**ここだけ snake_case**（契約書 §10.1。サーバがそう）。
   * @param {{gradePrefix:string, nickname:string, oldPassword:string, newPassword:string}} p
   * @returns {Promise<{ok:true, message:string}>}
   */
  async function changePassword(p = {}) {
    const grade = normalizeGradePrefix(p.gradePrefix);
    const nick = validateNickname(p.nickname);
    const oldPw = String(p.oldPassword || "");
    const newPw = String(p.newPassword || "");
    if (!grade) throw new AuthError("学年を選んでください。", { code: "VALIDATION" });
    if (!nick.ok) throw new AuthError(nick.message, { code: "VALIDATION" });
    if (!oldPw) throw new AuthError("今のパスワードを入れてください。", { code: "VALIDATION" });
    if (newPw.length < MIN_PASSWORD_LENGTH) throw new AuthError("新しいパスワードは 8 文字以上にしてください。", { code: "VALIDATION" });
    if (newPw === oldPw) throw new AuthError("今と同じパスワードです。別の物にしてください。", { code: "VALIDATION" });

    const data = await request("/api/auth/change-password", {
      method: "POST",
      body: { grade_prefix: grade, nickname: nick.value, old_password: oldPw, new_password: newPw },
    });
    return { ok: true, message: str(data && data.message) };
  }

  const reset = {
    /** 本人確認を始める（メールへコード）。@returns {Promise<Challenge>} */
    async start(p = {}) {
      const grade = normalizeGradePrefix(p.gradePrefix);
      const nick = validateNickname(p.nickname);
      if (!grade) throw new AuthError("学年を選んでください。", { code: "VALIDATION" });
      if (!nick.ok) throw new AuthError(nick.message, { code: "VALIDATION" });
      const data = await request("/api/auth/reset/start", {
        method: "POST",
        body: { gradePrefix: grade, nickname: nick.value },
      });
      return toChallenge(data, "");
    },

    /** コードで確かめる。@returns {Promise<{resetToken:string, attemptsRemaining:number|null}>} */
    async code(p = {}) {
      const challengeId = str(p.challengeId);
      const code = String(p.code || "").replace(/\D/g, "");
      if (!challengeId) throw new AuthError("受付が切れています。最初からやり直してください。", { code: "VALIDATION" });
      if (code.length !== CODE_LENGTH) throw new AuthError("6 桁の数字を入れてください。", { code: "VALIDATION" });
      const data = await request("/api/auth/reset/code", { method: "POST", body: { challengeId, code } });
      const resetToken = str(data && data.resetToken);
      if (!resetToken) {
        throw new AuthError(str(data && data.message) || "確認できませんでした。", {
          code: str(data && data.status) || "REJECTED",
          attemptsRemaining: numOrNull(data && data.attemptsRemaining),
          body: data,
        });
      }
      return { resetToken, attemptsRemaining: numOrNull(data && data.attemptsRemaining) };
    },

    /** 暗証番号で確かめる（4 桁 or 6 桁）。@returns {Promise<{challengeId:string, resetToken:string}>} */
    async pin(p = {}) {
      const grade = normalizeGradePrefix(p.gradePrefix);
      const nick = validateNickname(p.nickname);
      const pin = String(p.pin || "").replace(/\D/g, "");
      if (!grade) throw new AuthError("学年を選んでください。", { code: "VALIDATION" });
      if (!nick.ok) throw new AuthError(nick.message, { code: "VALIDATION" });
      if (pin.length !== 4 && pin.length !== 6) throw new AuthError("4 桁または 6 桁の数字を入れてください。", { code: "VALIDATION" });
      const data = await request("/api/auth/reset/pin", {
        method: "POST",
        body: { gradePrefix: grade, nickname: nick.value, pin },
      });
      const resetToken = str(data && data.resetToken);
      if (!resetToken) {
        throw new AuthError(str(data && data.message) || "確認できませんでした。", {
          code: str(data && data.status) || "REJECTED", body: data,
        });
      }
      return { challengeId: str(data && data.challengeId), resetToken };
    },

    /** 新しいパスワードを決める。@returns {Promise<{ok:true, message:string}>} */
    async password(p = {}) {
      const challengeId = str(p.challengeId);
      const resetToken = str(p.resetToken);
      const newPassword = String(p.newPassword || "");
      if (!challengeId || !resetToken) throw new AuthError("受付が切れています。最初からやり直してください。", { code: "VALIDATION" });
      if (newPassword.length < MIN_PASSWORD_LENGTH) throw new AuthError("パスワードは 8 文字以上にしてください。", { code: "VALIDATION" });
      const data = await request("/api/auth/reset/password", {
        method: "POST",
        body: { challengeId, resetToken, newPassword },
      });
      return { ok: true, message: str(data && data.message) };
    },
  };

  /** プロフィール（契約書 §10.1 の GET /api/profile/me） */
  async function profile() {
    return request("/api/profile/me", { method: "GET", auth: true });
  }

  return {
    get state() { return state; },
    get apiBase() { return apiBase; },

    /** @param {(s:AuthState)=>void} fn @returns {()=>void} */
    subscribe(fn) {
      if (typeof fn !== "function") return () => {};
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },

    /**
     * 401 を受けたことを呼び出し側へ知らせる口（入り直す画面を出させる）。
     * @param {(e:AuthError)=>void} fn @returns {()=>void}
     */
    onUnauthorized(fn) {
      if (typeof fn !== "function") return () => {};
      unauthorizedListeners.add(fn);
      return () => { unauthorizedListeners.delete(fn); };
    },

    boot,
    refresh,
    login,
    logout,
    guest,
    register,
    changePassword,
    reset,
    profile,
    authHeader,
    passwordStrength,
    /** 画面の入力検めにも使えるよう出しておく（純関数なので副作用なし） */
    validateNickname,
    validateEmail,
    normalizeGradePrefix,
    /** 下位の口（export/ai が Bearer 付きで別の API を叩きたいとき用） */
    request,
  };
}
