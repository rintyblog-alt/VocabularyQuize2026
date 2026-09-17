/* ══════════════════════════════════════════════════════════════════════
   ai/llm.js — 言葉の相手（LLM）への唯一の口

   ★ 何をする所か
     ・`createLLM({ endpoint, token, fetchImpl })` で「話す道具」を作る。
       `chat(messages)` は文字列を返し、`json(messages)` は **必ず object**
       を返す（返せなければ投げる）。`probe()` は繋がるか試すだけ。
     ・既定の相手は 契約書 §6 の `<apiBase>/api/ai/chat`
       （`POST {messages:[{role,content}], max_tokens}`）。
     ・応答の形は相手任せなので、text の取り出しは **柔らかく**する
       （body.text → body.content → body.message → choices[0].message.content
        → 文字列そのもの の順）。
     ・壊れた JSON を直す `jsonRepair()` は **pure**。試験で固定する。

   ★ なぜこの形か
     ・**繋がらなくても編集は止めない**（契約書 §6 の合格条件）。だから
       ここは「失敗を必ず投げる（握りつぶさない）」だけに徹し、諦める判断は
       planner が持つ。available を見て呼ぶかどうか決めるのも planner。
     ・LLM は ``` で囲んだ JSON・前後の言い訳・末尾のカンマ・全角の引用符を
       平気で混ぜる。毎回 planner 側で直すと同じ処理が散るので、
       **直す所をここ 1 か所**に集めた。直し方は「素の JSON.parse から
       始めて、段階的に手を入れ、**最初に読めた形を返す**」順にしてある
       （いきなり全部書き換えると、元々読めていた物を壊す）。
     ・fetch を差し替えられるようにした（`fetchImpl`）。ブラウザ無しの
       Node の試験でここを通せるようにするため（core/auth.js と同じ作法）。

   ★ 触るときの注意
     ・`console.log` は使わない（core/log.js の log/warn を通す）。
     ・タイムアウトは 40 秒（契約の指定）。`AbortController` で必ず止める。
       呼び手の `signal` も一緒に効かせる（書き出し中の中止と同じ作法）。
     ・401 が来たら `available=false` にする（token が無い/切れている）。
       それ以外の失敗（通信・5xx）は **一時的**として available は落とさない。
     ・返事の text をそのまま `eval` したり DOM へ入れたりしない。
       ここが返すのは常に「文字列」か「JSON.parse した object」だけ。
   ══════════════════════════════════════════════════════════════════════ */

import { warn } from "../core/log.js";

/** 既定の口（契約書 §6） */
export const DEFAULT_CHAT_PATH = "/api/ai/chat";
/** 既定の API 基点（契約書 §10 と同じ。auth.js の DEFAULT_API_BASE と揃える） */
export const DEFAULT_API_BASE = "https://vocabuquiz-api.rintyblog.workers.dev";
/** 応答を待つ上限（契約の指定: 40 秒） */
export const DEFAULT_TIMEOUT = 40000;
/** JSON が読めなかったときの言い直しの回数（契約の指定: 2 回） */
export const JSON_RETRIES = 2;

/** LLM の失敗。code で呼び手が分岐できる形にする（握りつぶさない） */
export class LLMError extends Error {
  /** @param {string} message @param {{code?:string,status?:number,cause?:any,text?:string}} [info] */
  constructor(message, info) {
    super(String(message || "AI に繋がりませんでした"));
    this.name = "LLMError";
    const o = info && typeof info === "object" ? info : {};
    /** @type {string} NETWORK / TIMEOUT / ABORTED / HTTP_401 / HTTP_xxx / BAD_JSON / NO_FETCH */
    this.code = String(o.code || "LLM");
    this.status = Number(o.status) || 0;
    this.cause = o.cause || null;
    /** @type {string} 直前に貰った本文（言い直しに使う） */
    this.text = typeof o.text === "string" ? o.text : "";
  }
}

const str = (v) => (typeof v === "string" ? v : v === undefined || v === null ? "" : String(v));
const plain = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);

/* ══ §A 応答から text を取り出す（pure）═══════════════════════════ */

/**
 * 相手の返事から本文を拾う。形はどれでも受ける（契約書 §6 の柔らかい順）。
 * @param {any} body @returns {string} 見つからなければ ""
 */
export function extractText(body) {
  if (typeof body === "string") return body;
  const b = plain(body);
  if (!b) return "";
  const direct = [b.text, b.content, b.message, b.output, b.answer, b.reply, b.result];
  for (const v of direct) {
    if (typeof v === "string" && v.trim()) return v;
    // { message: { content } } / { content: [{ text }] } の形も在る
    const o = plain(v);
    if (o && typeof o.content === "string" && o.content.trim()) return o.content;
    if (Array.isArray(v)) {
      const joined = v.map((p) => (typeof p === "string" ? p : str(plain(p) && (plain(p).text || plain(p).content)))).filter(Boolean).join("");
      if (joined.trim()) return joined;
    }
  }
  const ch = Array.isArray(b.choices) ? b.choices[0] : null;
  const c0 = plain(ch);
  if (c0) {
    const m = plain(c0.message);
    if (m && typeof m.content === "string" && m.content.trim()) return m.content;
    if (typeof c0.text === "string" && c0.text.trim()) return c0.text;
  }
  if (Array.isArray(b.candidates)) {
    const cand = plain(b.candidates[0]);
    const parts = cand && plain(cand.content) && Array.isArray(plain(cand.content).parts) ? plain(cand.content).parts : null;
    if (parts) {
      const joined = parts.map((p) => str(plain(p) && plain(p).text)).join("");
      if (joined.trim()) return joined;
    }
  }
  if (Array.isArray(b.data)) {
    const joined = b.data.map((p) => (typeof p === "string" ? p : str(plain(p) && (plain(p).text || plain(p).content)))).filter(Boolean).join("");
    if (joined.trim()) return joined;
  }
  return "";
}

/* ══ §B 壊れた JSON を直す（pure）═════════════════════════════════ */

/** ``` で囲まれた中身を全部拾う（```json と素の ``` の両方） */
function fencedBlocks(text) {
  const out = [];
  const re = /```[ \t]*([A-Za-z0-9_-]*)[ \t]*\r?\n([\s\S]*?)```/g;
  let m = null;
  while ((m = re.exec(text))) out.push(m[2]);
  // 閉じ忘れ（```json の後が最後まで続く）も拾う
  const open = /```[ \t]*([A-Za-z0-9_-]*)[ \t]*\r?\n([\s\S]*)$/.exec(text);
  if (open && out.indexOf(open[2]) < 0) out.push(open[2]);
  return out;
}

/**
 * 最初の { か [ から対応する閉じ括弧までを切り出す（文字列とエスケープを見る）。
 * 閉じていなければ最後まで返す（後で closeOpen が閉じる）。
 * @param {string} s @returns {string}
 */
export function sliceJsonSpan(s) {
  const t = str(s);
  let start = -1;
  for (let i = 0; i < t.length; i++) { const c = t[i]; if (c === "{" || c === "[") { start = i; break; } }
  if (start < 0) return t.trim();
  let depth = 0, inStr = false, esc = false, q = "";
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === q) inStr = false;
      continue;
    }
    if (c === '"' || c === "'") { inStr = true; q = c; continue; }
    if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") { depth--; if (depth === 0) return t.slice(start, i + 1); }
  }
  return t.slice(start);
}

/** 文字列の外だけを走る道具（fn(ch, i) が返した文字を書き出す） */
function outsideStrings(s, fn) {
  let out = "", inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      out += c;
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; out += c; continue; }
    out += fn(c, i);
  }
  return out;
}

/** // と /* *\/ のコメントを落とす（文字列の中の // は残す） */
export function stripJsonComments(s) {
  let out = "", inStr = false, esc = false, i = 0;
  while (i < s.length) {
    const c = s[i], n = s[i + 1];
    if (inStr) {
      out += c;
      if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false;
      i++; continue;
    }
    if (c === '"') { inStr = true; out += c; i++; continue; }
    if (c === "/" && n === "/") { while (i < s.length && s[i] !== "\n") i++; continue; }
    if (c === "/" && n === "*") { i += 2; while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) i++; i += 2; continue; }
    out += c; i++;
  }
  return out;
}

/** 末尾のカンマ（, の後が } か ] だけ）を落とす */
export function stripTrailingCommas(s) {
  let out = "", inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      out += c;
      if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === ",") {
      let j = i + 1;
      while (j < s.length && /\s/.test(s[j])) j++;
      if (s[j] === "}" || s[j] === "]") continue;   // 落とす
    }
    out += c;
  }
  return out;
}

/** 全角の引用符・括弧・区切りを半角へ（引用符は構造の目印なので丸ごと直す） */
export function normalizeFullWidth(s) {
  const quoted = s
    .replace(/[“”〝〞＂]/g, '"')
    .replace(/[‘’]/g, "'");
  // 引用符を直した後なら「文字列の中/外」が判るので、区切りは外だけ直す
  return outsideStrings(quoted, (c) => {
    if (c === "：") return ":";
    if (c === "，" || c === "、") return ",";
    if (c === "｛") return "{";
    if (c === "｝") return "}";
    if (c === "［") return "[";
    if (c === "］") return "]";
    if (c === "　") return " ";
    return c;
  });
}

/** '…' の文字列を "…" にする（中の " は逃がす） */
export function singleToDoubleQuotes(s) {
  let out = "", inD = false, inS = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inD) {
      out += c;
      if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inD = false;
      continue;
    }
    if (inS) {
      if (esc) { out += c; esc = false; continue; }
      if (c === "\\") { out += c; esc = true; continue; }
      if (c === "'") { out += '"'; inS = false; continue; }
      out += c === '"' ? '\\"' : c;
      continue;
    }
    if (c === '"') { inD = true; out += c; continue; }
    if (c === "'") { inS = true; out += '"'; continue; }
    out += c;
  }
  return out;
}

/** 裸の鍵（{ a: 1 } の a）を "a" にする */
export function quoteBareKeys(s) {
  return s.replace(/([{,])(\s*)([A-Za-z_$][A-Za-z0-9_$\-.]*)(\s*):/g, '$1$2"$3"$4:');
}

/** 途中で切れた JSON を閉じる（文字列も括弧も） */
export function closeOpenJson(s) {
  const stack = [];
  let inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === "{" || c === "[") stack.push(c);
    else if (c === "}" || c === "]") stack.pop();
  }
  let out = s;
  if (inStr) out += '"';
  out = stripTrailingCommas(out.replace(/[,:]\s*$/, ""));
  for (let i = stack.length - 1; i >= 0; i--) out += stack[i] === "{" ? "}" : "]";
  return out;
}

/** JSON.parse できたら true（object / 配列のときだけ） */
function parses(s) {
  try {
    const v = JSON.parse(s);
    return v !== null && typeof v === "object";
  } catch (_e) { return false; }
}

/**
 * LLM の返事から **JSON.parse できる文字列**を作る（pure）。
 * 直せなければ null。段階的に手を入れ、**最初に読めた形**を返す。
 * @param {string} text @returns {string|null}
 */
export function jsonRepair(text) {
  const raw = str(text);
  if (!raw.trim()) return null;
  /* 候補は「``` の中身」→「全体」の順。``` の中身の方が当たりやすい */
  const candidates = fencedBlocks(raw).concat([raw]);
  const steps = [
    (s) => s,
    (s) => stripJsonComments(s),
    (s) => stripTrailingCommas(s),
    (s) => normalizeFullWidth(s),
    (s) => singleToDoubleQuotes(s),
    (s) => quoteBareKeys(s),
    (s) => stripTrailingCommas(s),
    (s) => closeOpenJson(s)
  ];
  for (const cand of candidates) {
    for (const span of [sliceJsonSpan(cand), str(cand).trim()]) {
      if (!span) continue;
      let cur = span;
      if (parses(cur)) return cur;
      for (const step of steps) {
        let next = cur;
        try { next = step(cur); } catch (_e) { continue; }
        if (next === cur) continue;
        cur = next;
        if (parses(cur)) return cur;
      }
    }
  }
  return null;
}

/**
 * 返事を object にする（pure）。読めなければ null。
 * @param {string} text @returns {Object|Array|null}
 */
export function parseJsonLoose(text) {
  const fixed = jsonRepair(text);
  if (fixed === null) return null;
  try { return JSON.parse(fixed); } catch (_e) { return null; }
}

/* ══ §C 道具を作る ════════════════════════════════════════════════ */

/** 既定の endpoint（apiBase が在ればそこへ、無ければ契約の既定へ） */
function defaultEndpoint(apiBase) {
  const base = str(apiBase).trim().replace(/\/+$/, "") || DEFAULT_API_BASE;
  return base + DEFAULT_CHAT_PATH;
}

/** messages を口の形（[{role,content}]）に整える */
function normalizeMessages(messages) {
  const list = Array.isArray(messages) ? messages : [{ role: "user", content: str(messages) }];
  const out = [];
  for (const m of list) {
    if (typeof m === "string") { out.push({ role: "user", content: m }); continue; }
    const o = plain(m);
    if (!o) continue;
    const role = ["system", "user", "assistant"].indexOf(str(o.role)) >= 0 ? str(o.role) : "user";
    const content = typeof o.content === "string" ? o.content : str(extractText(o.content));
    if (content) out.push({ role, content });
  }
  if (!out.length) throw new LLMError("送る文章がありません", { code: "EMPTY" });
  return out;
}

/**
 * LLM の道具を作る（契約書 §6）。**作るだけでは通信しない**。
 * @param {{endpoint?:string, apiBase?:string, token?:string|null,
 *   fetchImpl?:Function, timeout?:number, maxTokens?:number, model?:string}} [opts]
 * @returns {{chat:Function, json:Function, probe:Function, available:boolean,
 *   endpoint:string, setToken:Function, lastError:LLMError|null}}
 */
export function createLLM(opts) {
  const o = plain(opts) || {};
  const endpoint = str(o.endpoint).trim() || defaultEndpoint(o.apiBase);
  const rawFetch = typeof o.fetchImpl === "function" ? o.fetchImpl : globalThis.fetch;
  const fetchImpl = typeof rawFetch === "function" ? (...a) => rawFetch(...a) : null;
  const timeout = Number.isFinite(o.timeout) && Number(o.timeout) > 0 ? Number(o.timeout) : DEFAULT_TIMEOUT;
  const maxTokens = Number.isFinite(o.maxTokens) && Number(o.maxTokens) > 0 ? Math.round(Number(o.maxTokens)) : 1600;
  const model = str(o.model);
  let token = str(o.token) || "";
  /* 「使える見込み」。fetch が無い環境と 401 を貰った後だけ false。
     通信の一時的な失敗では落とさない（次に繋がるかもしれない）。 */
  let usable = !!fetchImpl;
  let lastError = null;

  /**
   * 1 往復（契約書 §6 の POST）。返り値は本文の文字列。
   * @param {Array|string} messages
   * @param {{maxTokens?:number, max_tokens?:number, timeout?:number,
   *   signal?:AbortSignal|null, temperature?:number, system?:string}} [opt]
   * @returns {Promise<string>}
   */
  async function chat(messages, opt) {
    const q = plain(opt) || {};
    if (!fetchImpl) throw (lastError = new LLMError("この環境では通信できません（fetch が無い）", { code: "NO_FETCH" }));
    const msgs = normalizeMessages(messages);
    if (str(q.system)) msgs.unshift({ role: "system", content: str(q.system) });

    const body = {
      messages: msgs,
      max_tokens: Number.isFinite(q.maxTokens) ? Math.round(Number(q.maxTokens))
        : Number.isFinite(q.max_tokens) ? Math.round(Number(q.max_tokens)) : maxTokens
    };
    if (Number.isFinite(q.temperature)) body.temperature = Number(q.temperature);
    if (model) body.model = model;

    const headers = { "Content-Type": "application/json", Accept: "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    const ms = Number.isFinite(q.timeout) && Number(q.timeout) > 0 ? Number(q.timeout) : timeout;
    const ctrl = typeof AbortController === "function" ? new AbortController() : null;
    let timedOut = false, timer = null, onAbort = null;
    if (ctrl && ms > 0) timer = setTimeout(() => { timedOut = true; try { ctrl.abort(); } catch (_e) { /* もう終わっている */ } }, ms);
    if (ctrl && q.signal) {
      if (q.signal.aborted) { try { ctrl.abort(); } catch (_e) { /* 同上 */ } }
      else {
        onAbort = () => { try { ctrl.abort(); } catch (_e) { /* 同上 */ } };
        try { q.signal.addEventListener("abort", onAbort); } catch (_e) { onAbort = null; }
      }
    }

    let res = null;
    try {
      res = await fetchImpl(endpoint, {
        method: "POST", headers, body: JSON.stringify(body),
        signal: ctrl ? ctrl.signal : undefined,
        mode: "cors", credentials: "omit", cache: "no-store"
      });
    } catch (err) {
      if (q.signal && q.signal.aborted) throw (lastError = new LLMError("中止しました", { code: "ABORTED", cause: err }));
      if (timedOut) throw (lastError = new LLMError("AI の応答が時間内に来ませんでした", { code: "TIMEOUT", cause: err }));
      throw (lastError = new LLMError("AI へ繋がりませんでした", { code: "NETWORK", cause: err }));
    } finally {
      if (timer) clearTimeout(timer);
      if (onAbort) { try { q.signal.removeEventListener("abort", onAbort); } catch (_e) { /* 外せないだけ */ } }
    }

    const status = Number(res && res.status) || 0;
    let text = "";
    try { text = await res.text(); } catch (err) {
      throw (lastError = new LLMError("AI の応答を読めませんでした", { code: "NETWORK", status, cause: err }));
    }
    let data = text;
    if (text) { try { data = JSON.parse(text); } catch (_e) { data = text; } }

    if (status === 401 || status === 403) {
      usable = false;   // token が無い / 切れている → 以後は端末内で作る
      const msg = str(plain(data) && (plain(data).message || plain(data).error)) || "AI を使う権限がありません（ログインし直してください）";
      throw (lastError = new LLMError(msg, { code: `HTTP_${status}`, status }));
    }
    if (!res.ok) {
      const msg = str(plain(data) && (plain(data).message || plain(data).error)) || `AI が ${status} を返しました`;
      throw (lastError = new LLMError(msg, { code: `HTTP_${status}`, status }));
    }
    const out = extractText(data);
    if (!str(out).trim()) throw (lastError = new LLMError("AI の返事が空でした", { code: "EMPTY_REPLY", status, text: String(text).slice(0, 300) }));
    lastError = null;
    return out;
  }

  /**
   * JSON を貰う。読めなければ **直前の返事とエラーを見せて言い直させる**（2 回）。
   * @param {Array|string} messages
   * @param {string|Object} [schemaHint] 期待する形の説明（object なら opts 扱い）
   * @param {Object} [opt]
   * @returns {Promise<Object>}
   * CONTRACT-NOTE: 契約書 §6 は `json(messages, schemaHint, opts)`、担当の指示は
   *   `json(messages, opts)`。どちらで呼ばれても動くように、2 つ目が文字列なら
   *   schemaHint、object なら opts として読む（呼び手を直さなくて済む）。
   */
  async function json(messages, schemaHint, opt) {
    const hint = typeof schemaHint === "string" ? schemaHint : "";
    const q = plain(typeof schemaHint === "string" ? opt : schemaHint) || plain(opt) || {};
    const base = normalizeMessages(messages);
    if (hint) base.push({ role: "user", content: `期待する JSON の形:\n${hint}\nJSON だけを返してください。` });
    let msgs = base;
    let last = "";
    let err = null;
    const tries = Number.isFinite(q.retries) ? Math.max(0, Math.round(Number(q.retries))) : JSON_RETRIES;
    for (let i = 0; i <= tries; i++) {
      last = await chat(msgs, q);          // 通信の失敗はそのまま投げる（planner が受ける）
      const obj = parseJsonLoose(last);
      if (obj && typeof obj === "object") return obj;
      err = new LLMError("返事が JSON として読めませんでした", { code: "BAD_JSON", text: String(last).slice(0, 600) });
      if (i === tries) break;
      warn("ai/llm", `JSON が読めないので言い直させる（${i + 1}/${tries}）`);
      msgs = base.concat([
        { role: "assistant", content: String(last).slice(0, 4000) },
        {
          role: "user",
          content: "上の返事は JSON として読めませんでした（JSON.parse が失敗）。"
            + "説明・前置き・``` を一切付けず、**JSON だけ**をもう一度返してください。"
            + "鍵は二重引用符、末尾のカンマ無し、コメント無しで。"
        }
      ]);
    }
    lastError = err;
    throw err;
  }

  /**
   * 繋がるか試す（投げない）。@param {{signal?:AbortSignal|null}} [q]
   * @returns {Promise<boolean>}
   */
  async function probe(q) {
    if (!fetchImpl) return false;
    try {
      const t = await chat([{ role: "user", content: "ok と 2 文字だけ返してください。" }],
        { maxTokens: 8, timeout: 8000, signal: (plain(q) || {}).signal || null });
      usable = !!str(t).trim();
      return usable;
    } catch (e) {
      // 401 のときだけ usable は落ちている（chat の中で落とした）
      warn("ai/llm", "probe 失敗", e && e.message ? e.message : e);
      return false;
    }
  }

  return {
    chat, json, probe,
    get available() { return usable; },
    set available(v) { usable = !!v; },
    get endpoint() { return endpoint; },
    get lastError() { return lastError; },
    /** token を後から入れる（ログイン後に呼ぶ）。入れ直したら使える見込みも戻す */
    setToken(next) { token = str(next); if (token && fetchImpl) usable = true; return !!token; }
  };
}
