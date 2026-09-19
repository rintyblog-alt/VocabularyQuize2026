/* ══════════════════════════════════════════════════════════════════════
   core/log.js — 唯一のログ出口（既定では黙る）

   ★ 何をする所か
     契約書 §0 の「console.log は残さない」を守るための受け皿。
     全モジュールはここの log/warn/error/time/group だけを使う。
     出るのは **?debug=1 か localStorage["vqstudio.debug"]="1" のときだけ**。
     ただし error は常に出す（黙って壊れる方が困る）。

   ★ なぜこの形か
     ・出力を 1 箇所（emit）に集めておくと、後から画面内コンソールや
       selftest.html への転送を足すときに 1 箇所だけ直せば済む。
     ・毎フレーム呼ばれる所（compositor / playback）から呼ばれるので、
       黙るときは文字列を組み立てる前に return する（template も作らない）。
     ・tag を必須の第 1 引数にして `[VQS:tag]` を頭に付ける。動画編集は
       出所（engine か export か ai か）が分からないと追えない。
     ・localStorage は iOS Safari のプライベートモードや sandbox された
       iframe で **読むだけで throw する**。必ず try/catch で包む。
     ・URL の ?debug=0 は localStorage より強い。現場で「一旦黙らせる」
       手段が無いと困る。

   ★ 触るときの注意
     ・ここ以外で console を直に呼ばない（grep で見つかったら差し戻し）。
     ・Node（試験）では location も localStorage も無い。黙って false。
   ══════════════════════════════════════════════════════════════════════ */

/** localStorage のキー（契約書の文言どおり） */
export const DEBUG_KEY = "vqstudio.debug";

const PREFIX = "VQS";
const FALLBACK_LEVEL = "log";

/** setDebug() での上書き（null = 上書き無し） */
let manual = null;
/** URL / localStorage から読んだ値（一度だけ調べる） */
let detected = null;
/** time() で開いているラベル。timeEnd の空振りで console が警告するのを防ぐ */
const openTimers = new Set();

function detect() {
  // 1) URL の ?debug=…（Worker でも location は在る）
  try {
    const loc = globalThis.location;
    const q = loc && typeof loc.search === "string" ? loc.search : "";
    const m = /[?&]debug(?:=([^&#]*))?/.exec(q);
    if (m) {
      const v = (m[1] === undefined ? "" : decodeURIComponent(m[1])).toLowerCase();
      return v === "" || v === "1" || v === "true" || v === "on" || v === "yes";
    }
  } catch (_e) { /* location が無い/読めない環境 */ }
  // 2) localStorage（プライベートモードでは読むだけで throw する）
  try {
    const ls = globalThis.localStorage;
    if (ls && ls.getItem(DEBUG_KEY) === "1") return true;
  } catch (_e) { /* 使えないだけ。黙る */ }
  return false;
}

/**
 * ログを出す状態か。
 * @returns {boolean}
 */
export function isDebug() {
  if (manual !== null) return manual;
  if (detected === null) detected = detect();
  return detected;
}

/**
 * 実行中に切り替える（selftest やコンソールから使う）。
 * localStorage にも書き残す（書けない環境では黙って諦める）。
 * @param {boolean} on
 */
export function setDebug(on) {
  manual = !!on;
  try {
    const ls = globalThis.localStorage;
    if (ls) {
      if (manual) ls.setItem(DEBUG_KEY, "1");
      else ls.removeItem(DEBUG_KEY);
    }
  } catch (_e) { /* 書けなくても動きは変わらない */ }
}

/** tag を "[VQS:tag]" に整える */
function head(tag) {
  const t = tag === undefined || tag === null || tag === "" ? "?" : String(tag);
  return `[${PREFIX}:${t}]`;
}

/**
 * 唯一の出口。console が無い環境（一部の Worker / 埋め込み）でも落ちない。
 * @param {"log"|"warn"|"error"|"debug"|"group"|"groupCollapsed"} level
 * @param {string} tag
 * @param {any[]} args
 */
function emit(level, tag, args) {
  const c = globalThis.console;
  if (!c) return;
  const fn = typeof c[level] === "function" ? c[level] : c[FALLBACK_LEVEL];
  if (typeof fn !== "function") return;
  try {
    fn.call(c, head(tag), ...args);
  } catch (_e) {
    /* ログで落ちるのが一番間抜けなので、ここは握りつぶす（他に手が無い） */
  }
}

/**
 * 普段のログ。debug のときだけ出る。
 * @param {string} tag 出所（"engine" "export" "ai" など）
 * @param {...any} args
 */
export function log(tag, ...args) {
  if (!isDebug()) return;
  emit("log", tag, args);
}

/**
 * 警告。debug のときだけ出る（想定内の劣化＝2d フォールバック等はこちら）。
 * @param {string} tag @param {...any} args
 */
export function warn(tag, ...args) {
  if (!isDebug()) return;
  emit("warn", tag, args);
}

/**
 * 失敗。**debug でなくても出す**（利用者の環境で起きた事故を拾うため）。
 * @param {string} tag @param {...any} args
 */
export function error(tag, ...args) {
  emit("error", tag, args);
}

/**
 * 時間を測り始める。返り値を呼ぶと終われる（timeEnd を書き忘れないため）。
 * debug でないときは 何もしない関数を返す。
 * @param {string} tag @returns {() => void}
 */
export function time(tag) {
  if (!isDebug()) return () => {};
  const label = head(tag);
  const c = globalThis.console;
  if (c && typeof c.time === "function" && !openTimers.has(label)) {
    openTimers.add(label);
    try { c.time(label); } catch (_e) { openTimers.delete(label); }
  }
  return () => timeEnd(tag);
}

/**
 * 時間の測り終わり。開いていないラベルは黙って無視する
 * （console.timeEnd は空振りすると自分で警告を出してしまう）。
 * @param {string} tag
 */
export function timeEnd(tag) {
  const label = head(tag);
  if (!openTimers.has(label)) return;
  openTimers.delete(label);
  const c = globalThis.console;
  if (c && typeof c.timeEnd === "function") {
    try { c.timeEnd(label); } catch (_e) { /* 何も出ないだけ */ }
  }
}

/**
 * まとめ始め（既定は畳んだ状態で開く。長い一覧で画面を埋めないため）。
 * @param {string} tag @param {...any} args
 */
export function group(tag, ...args) {
  if (!isDebug()) return;
  const c = globalThis.console;
  const level = c && typeof c.groupCollapsed === "function" ? "groupCollapsed" : "group";
  emit(/** @type {any} */ (level), tag, args);
}

/** まとめ終わり（group と必ず対にする） */
export function groupEnd() {
  if (!isDebug()) return;
  const c = globalThis.console;
  if (c && typeof c.groupEnd === "function") {
    try { c.groupEnd(); } catch (_e) { /* 何も出ないだけ */ }
  }
}

/**
 * tag を固定した小さな窓口を作る。
 *   const L = scope("engine"); L.log("1 フレーム描いた", ms);
 * 各モジュールの頭で 1 回作っておくと tag の書き間違いが消える。
 * @param {string} tag
 */
export function scope(tag) {
  return {
    log: (...a) => log(tag, ...a),
    warn: (...a) => warn(tag, ...a),
    error: (...a) => error(tag, ...a),
    time: () => time(tag),
    timeEnd: () => timeEnd(tag),
    group: (...a) => group(tag, ...a),
    groupEnd,
  };
}
