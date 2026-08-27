/* ══════════════════════════════════════════════════════════════════════
   テスト用の共通土台
   ・ブラウザ用に書いた V2 のコードを Node でそのまま読み込むための最小の shim。
   ・localStorage は実物と同じ挙動（容量超過で throw する）を模す。
   ══════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const V2 = join(HERE, "..");
export const ROOT = join(V2, "..", "..");

/* ── localStorage の代替。quotaBytes を超えると QuotaExceededError を投げる。 ── */
export function installLocalStorage(quotaBytes) {
  const map = new Map();
  const quota = quotaBytes || 5 * 1024 * 1024;
  const ls = {
    getItem(k) { return map.has(String(k)) ? map.get(String(k)) : null; },
    setItem(k, v) {
      const key = String(k), val = String(v);
      let total = val.length;
      for (const [mk, mv] of map) if (mk !== key) total += mv.length;
      if (total > quota) { const e = new Error("QuotaExceededError"); e.name = "QuotaExceededError"; throw e; }
      map.set(key, val);
    },
    removeItem(k) { map.delete(String(k)); },
    clear() { map.clear(); },
    key(i) { return [...map.keys()][i] ?? null; },
    get length() { return map.size; },
    _dump() { return Object.fromEntries(map); }
  };
  globalThis.localStorage = ls;
  return ls;
}

/* ── URL / location の代替（flags.js が読む） ── */
export function installLocation(search) {
  globalThis.location = { search: search || "", href: "http://127.0.0.1/" + (search || "") };
  if (!globalThis.URLSearchParams) globalThis.URLSearchParams = URLSearchParams;
}

/* ── V2 のソースを評価して globalThis.VQ2 を組み立てる ── */
export function loadV2(files) {
  const list = files || [
    "domain/schema.js", "domain/validate.js", "domain/adapter.js",
    /* store.js は保存直前に採番を確定させるので draft.js を必要とする */
    "domain/score-allocator.js", "domain/draft.js", "domain/flags.js", "domain/store.js"
  ];
  for (const f of list) {
    const src = readFileSync(join(V2, f), "utf8");
    /* IIFE なので new Function で評価すればよい。import/export は使っていない。 */
    // eslint-disable-next-line no-new-func
    new Function(src).call(globalThis);
  }
  return globalThis.VQ2;
}

/* ── 極小テストランナー ────────────────────────────────────────── */
const results = [];
let currentGroup = "";

export function group(name) { currentGroup = name; }

export function test(name, fn) {
  try {
    fn();
    results.push({ group: currentGroup, name, ok: true });
  } catch (e) {
    results.push({ group: currentGroup, name, ok: false, error: e && e.message ? e.message : String(e), stack: e && e.stack });
  }
}

export function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}
export function assertEq(actual, expected, msg) {
  if (actual !== expected) throw new Error((msg || "値が違います") + `（期待 ${JSON.stringify(expected)} / 実際 ${JSON.stringify(actual)}）`);
}
export function assertDeep(actual, expected, msg) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error((msg || "内容が違います") + `\n  期待: ${b}\n  実際: ${a}`);
}
export function assertThrows(fn, msg) {
  let threw = false;
  try { fn(); } catch (e) { threw = true; }
  if (!threw) throw new Error(msg || "例外が投げられませんでした");
}
/* issues に指定 code の error が含まれるか */
export function hasError(issues, code) {
  return (issues || []).some((i) => i.severity === "error" && i.code === code);
}
export function errorCodes(issues) {
  return (issues || []).filter((i) => i.severity === "error").map((i) => i.code);
}

export function report(title) {
  const pass = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok);
  let lastGroup = null;
  for (const r of results) {
    if (r.group !== lastGroup) { console.log("\n── " + r.group + " ──"); lastGroup = r.group; }
    console.log((r.ok ? "  ok   " : "  FAIL ") + r.name + (r.ok ? "" : "\n         → " + r.error));
  }
  console.log("\n" + (title || "テスト") + ": " + pass + " / " + results.length + " 通過"
    + (fail.length ? "  （失敗 " + fail.length + " 件）" : ""));
  return fail.length;
}
