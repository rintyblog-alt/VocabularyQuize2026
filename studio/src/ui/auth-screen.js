/* ══════════════════════════════════════════════════════════════════════
   ui/auth-screen.js — アカウント画面（契約書 §10.3）

   ★ 何をする所か
     最初に目に入る画面。welcome / login / signup / verify / pin / consent /
     reset / reset-code / reset-password / change-password / profile の 11 枚を
     1 つの箱（index.html の #authScreen）の中で差し替える。通信は一切書かず、
     **core/auth.js（§10.2）の口だけ**を呼ぶ。見た目は styles/auth.css。

   ★ なぜこの形か
     ・**画面が登録の途中の値（challengeId / registrationSession / resetToken）を持つ。**
       auth.js は状態を持たない約束（§10.2 の註）なので、持つのはここ。
       画面を閉じたら捨てる＝中途半端な受付が裏で生き残らない。
     ・1 枚ずつ作り直して差し替える（部分更新をしない）。入力が 5 個しか無い画面で
       差分更新を書くと「戻ったら前の文字が残っている」種類の不具合が必ず出る。
       作り直せば、表示している物 = S（状態）と常に一致する。
     ・遷移は横スライド。**進む先を右から入れ、戻るときは逆**。
       ブラウザの戻るで 1 段戻れるように history.pushState で深さだけを積む
       （URL は変えない。#authScreen は 1 枚の箱で、URL に意味を持たせると
       共有された URL から途中の画面だけが開いてしまう）。
     ・失敗は **AuthError の値をそのまま出す**（残り回数・待ち秒数）。
       「失敗しました」だけでは、あと何回試せるのか利用者に分からない。
     ・ネットが無いときはログインを塞いで理由を出し、「ゲストで試す」を目立たせる。
       §10 の割り切り（ゲストでも編集は一切制限しない）が効く唯一の入口。

   ★ 触るときの注意
     ・学年接頭は本体の AUTH_GRADE_VALUES = J1/J2/J3/H1/H2/H3/OT が正。
       CONTRACT-NOTE: §10.3 の指示が「小1〜高3」なので小学生（E1..E6）も並べるが、
       サーバが会員として持たない値は弾かれ得る。並びと送る値は
       normalizeGradePrefix（auth.js）が通す形（[A-Z][0-9] か OT）に揃えてある。
     ・6 桁入力は iOS のメール/SMS 自動入力に乗せるため
       inputmode="numeric" + autocomplete="one-time-code" を **1 枠目に必ず**置く。
       枠を分けても貼り付け（6 文字まとめて）で全枠に配る道を残す。
     ・タイマー（残り時間・再送待ち）は画面を離れたら必ず止める。
       止め忘れると隠れた画面が毎秒 DOM を触り続ける（モバイルで体感で分かる）。
     ・背景の粒子は reduced-motion で **静止**（CSS 側の階調だけが残る）。
       rAF は hide()/dispose() で必ず止める。
     ══════════════════════════════════════════════════════════════════════ */

import { scope } from "../core/log.js";

const L = scope("auth-screen");

/* ── 0. 定数 ───────────────────────────────────────────────────── */

/** 学年接頭（値は auth.js の GRADE_PREFIX_RE を満たす形） */
export const GRADE_ITEMS = Object.freeze([
  { value: "E1", label: "小学 1 年" }, { value: "E2", label: "小学 2 年" },
  { value: "E3", label: "小学 3 年" }, { value: "E4", label: "小学 4 年" },
  { value: "E5", label: "小学 5 年" }, { value: "E6", label: "小学 6 年" },
  { value: "J1", label: "中学 1 年" }, { value: "J2", label: "中学 2 年" },
  { value: "J3", label: "中学 3 年" },
  { value: "H1", label: "高校 1 年" }, { value: "H2", label: "高校 2 年" },
  { value: "H3", label: "高校 3 年" },
  { value: "OT", label: "その他" }
]);

/** 画面の名前（contract §10.3） */
export const VIEWS = Object.freeze([
  "welcome", "login", "signup", "verify", "pin", "consent",
  "reset", "reset-code", "reset-password", "change-password", "profile"
]);

const CODE_LEN = 6;
const PIN_LEN = 4;
const MIN_PW = 8;
const SLIDE_MS = 260;

const STRENGTH_CLASS = ["s0", "s1", "s2", "s3", "s4"];

/* ── 1. 小さな道具 ─────────────────────────────────────────────── */

const DOC = typeof document !== "undefined" ? document : null;

function mk(tag, cls, text) {
  const el = DOC.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined && text !== null && text !== "") el.textContent = String(text);
  return el;
}

function btnEl(cls, label) {
  const b = mk("button", cls);
  b.type = "button";
  b.append(mk("span", "vqs-auth__blabel", label));
  return b;
}

function reducedMotion() {
  try {
    return !!(globalThis.matchMedia && globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches);
  } catch (e) { return false; }
}

function isOffline() {
  try { return typeof navigator !== "undefined" && navigator.onLine === false; } catch (e) { return false; }
}

function mmss(sec) {
  const s = Math.max(0, Math.floor(sec));
  return String(Math.floor(s / 60)) + ":" + String(s % 60).padStart(2, "0");
}

/** AuthError を「具体的な文」に直す（残り回数・待ち秒数を必ず出す） */
function errText(err) {
  if (!err) return "うまくいきませんでした。もう一度お試しください。";
  const code = err.code || "";
  let msg = String(err.message || "").trim();
  if (code === "NETWORK" || code === "TIMEOUT" || code === "ABORTED" || isOffline()) {
    if (!msg) msg = "通信できませんでした。";
    return msg + " 電波の届く所でもう一度お試しください（ゲストならそのまま編集できます）。";
  }
  if (!msg) msg = "うまくいきませんでした。";
  const extra = [];
  const n = err.attemptsRemaining;
  if (typeof n === "number" && Number.isFinite(n) && n >= 0) extra.push("あと " + n + " 回試せます");
  const r = err.retryAfter;
  if (typeof r === "number" && Number.isFinite(r) && r > 0) extra.push(Math.ceil(r) + " 秒後にもう一度お試しください");
  if (code === "RESTART_REQUIRED") extra.push("最初からやり直してください");
  if (code === "EXPIRED") extra.push("受付の時間が切れています");
  return extra.length ? msg + "（" + extra.join("・") + "）" : msg;
}

/* ── 2. 部品: 入力欄（浮き上がるラベル） ───────────────────────── */

/**
 * 1 行入力。placeholder=" " を置いて :placeholder-shown でラベルを浮かせる。
 * @returns {{el:HTMLElement, input:HTMLInputElement, setHint:(s:string,kind?:string)=>void, value:()=>string}}
 */
function field(o) {
  const c = o || {};
  const el = mk("label", "vqs-auth__field");
  const box = mk("span", "vqs-auth__fbox");
  const input = mk("input", "vqs-auth__input");
  input.type = c.type || "text";
  input.placeholder = " ";
  input.value = c.value === undefined || c.value === null ? "" : String(c.value);
  input.autocomplete = c.autocomplete || "off";
  input.spellcheck = false;
  if (c.inputmode) input.setAttribute("inputmode", c.inputmode);
  if (c.maxLength) input.maxLength = Number(c.maxLength);
  if (c.name) input.name = String(c.name);
  if (c.enterKeyHint) input.setAttribute("enterkeyhint", String(c.enterKeyHint));
  if (c.test) input.setAttribute("data-test", String(c.test));
  const label = mk("span", "vqs-auth__flabel", c.label || "");
  box.append(input, label);
  el.append(box);
  const hint = mk("span", "vqs-auth__fhint", c.hint || "");
  hint.setAttribute("aria-live", "polite");
  el.append(hint);

  /* パスワードは表示切替（見えないまま打ち間違えるのが一番多い失敗） */
  if (c.reveal) {
    const eye = mk("button", "vqs-auth__eye");
    eye.type = "button";
    eye.setAttribute("aria-label", "パスワードを表示");
    eye.append(mk("span", "", "表示"));
    eye.addEventListener("click", () => {
      const on = input.type === "password";
      input.type = on ? "text" : "password";
      eye.firstChild.textContent = on ? "隠す" : "表示";
      eye.setAttribute("aria-label", on ? "パスワードを隠す" : "パスワードを表示");
      try { input.focus(); } catch (e) { /* noop */ }
    });
    box.append(eye);
    box.classList.add("vqs-auth__fbox--reveal");
    /* 大文字ロックの警告（気付かないと何度も弾かれる） */
    const caps = mk("span", "vqs-auth__caps", "Caps Lock が入っています");
    el.append(caps);
    const onKey = (ev) => {
      let on = false;
      try { on = !!(ev.getModifierState && ev.getModifierState("CapsLock")); } catch (e) { on = false; }
      el.classList.toggle("vqs-auth__field--caps", on);
    };
    input.addEventListener("keydown", onKey);
    input.addEventListener("keyup", onKey);
  }

  if (typeof c.onInput === "function") input.addEventListener("input", () => c.onInput(input.value, api));
  if (typeof c.onEnter === "function") {
    input.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); c.onEnter(); } });
  }
  /* iOS: キーボードが出ると入力欄が隠れる。焦点の後に自分を見える所へ寄せる */
  input.addEventListener("focus", () => {
    setTimeout(() => { try { el.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) { /* noop */ } }, 220);
  });

  const api = {
    el, input,
    value: () => input.value,
    setHint(text, kind) {
      hint.textContent = text || "";
      el.classList.toggle("vqs-auth__field--bad", kind === "bad");
      el.classList.toggle("vqs-auth__field--ok", kind === "ok");
    }
  };
  return api;
}

/** 学年の選択（native select。iOS の輪っかで指で確実に選べる） */
function gradeField(value, onChange) {
  const el = mk("label", "vqs-auth__field vqs-auth__field--select");
  const box = mk("span", "vqs-auth__fbox");
  const sel = mk("select", "vqs-auth__select");
  sel.setAttribute("data-test", "auth-grade");
  sel.autocomplete = "off";
  for (const it of GRADE_ITEMS) {
    const op = mk("option", "", it.label);
    op.value = it.value;
    sel.append(op);
  }
  sel.value = value && GRADE_ITEMS.some((g) => g.value === value) ? value : "H1";
  box.append(sel, mk("span", "vqs-auth__flabel vqs-auth__flabel--fixed", "学年"));
  el.append(box);
  if (typeof onChange === "function") sel.addEventListener("change", () => onChange(sel.value));
  return { el, input: sel, value: () => sel.value, setHint() { /* select に助言は出さない */ } };
}

/** 確認の印（規約・年齢） */
function checkRow(label, onChange) {
  const el = mk("label", "vqs-auth__check");
  const inp = mk("input", "vqs-auth__checkbox");
  inp.type = "checkbox";
  el.append(inp, mk("span", "vqs-auth__checkmark"), mk("span", "vqs-auth__checklabel", label));
  inp.addEventListener("change", () => { if (typeof onChange === "function") onChange(inp.checked); });
  return { el, input: inp, checked: () => inp.checked };
}

/* ── 3. 部品: 6 桁 / 4 桁のコード入力 ─────────────────────────── */

/**
 * 1 枠 1 文字の数字入力。自動で次へ・貼り付け一括・Backspace で戻る。
 * @param {{length?:number, onComplete?:(code:string)=>void, otp?:boolean, test?:string}} o
 */
function codeInput(o) {
  const c = o || {};
  const len = Number(c.length) || CODE_LEN;
  const el = mk("div", "vqs-auth__code");
  el.setAttribute("role", "group");
  el.setAttribute("aria-label", len + " 桁の数字");
  if (c.test) el.setAttribute("data-test", c.test);
  /** @type {HTMLInputElement[]} */
  const cells = [];

  const value = () => cells.map((x) => x.value).join("");

  function fire() {
    const v = value();
    if (v.length === len && typeof c.onComplete === "function") c.onComplete(v);
  }

  function put(text, from) {
    const digits = String(text || "").replace(/\D/g, "").split("");
    if (!digits.length) return;
    let i = from;
    while (i < len && digits.length) { cells[i].value = digits.shift(); i += 1; }
    const next = Math.min(len - 1, i);
    try { cells[next].focus(); cells[next].select(); } catch (e) { /* noop */ }
    fire();
  }

  for (let i = 0; i < len; i += 1) {
    const inp = mk("input", "vqs-auth__cell");
    inp.type = "text";
    inp.setAttribute("inputmode", "numeric");
    inp.setAttribute("pattern", "[0-9]*");
    inp.maxLength = 1;
    inp.setAttribute("aria-label", (i + 1) + " 文字目");
    /* iOS の自動入力は 1 枠目に付けた one-time-code を見る */
    inp.autocomplete = c.otp === false ? "off" : (i === 0 ? "one-time-code" : "off");
    inp.addEventListener("input", () => {
      const raw = inp.value.replace(/\D/g, "");
      if (raw.length > 1) { inp.value = ""; put(raw, i); return; }
      inp.value = raw;
      if (raw && i < len - 1) { try { cells[i + 1].focus(); cells[i + 1].select(); } catch (e) { /* noop */ } }
      fire();
    });
    inp.addEventListener("keydown", (ev) => {
      if (ev.key === "Backspace") {
        if (!inp.value && i > 0) {
          ev.preventDefault();
          cells[i - 1].value = "";
          try { cells[i - 1].focus(); } catch (e) { /* noop */ }
        }
        return;
      }
      if (ev.key === "ArrowLeft" && i > 0) { ev.preventDefault(); cells[i - 1].focus(); }
      if (ev.key === "ArrowRight" && i < len - 1) { ev.preventDefault(); cells[i + 1].focus(); }
    });
    inp.addEventListener("paste", (ev) => {
      let text = "";
      try { text = (ev.clipboardData || globalThis.clipboardData).getData("text"); } catch (e) { text = ""; }
      if (!text) return;
      ev.preventDefault();
      put(text, i);
    });
    inp.addEventListener("focus", () => { try { inp.select(); } catch (e) { /* noop */ } });
    cells.push(inp);
    el.append(inp);
  }

  return {
    el, value,
    clear() { for (const x of cells) x.value = ""; try { cells[0].focus(); } catch (e) { /* noop */ } },
    focus() { try { cells[0].focus(); } catch (e) { /* noop */ } },
    /** 失敗したら赤く 1 回震える */
    shake() {
      el.classList.remove("vqs-auth__code--bad");
      void el.offsetWidth;
      el.classList.add("vqs-auth__code--bad");
      setTimeout(() => el.classList.remove("vqs-auth__code--bad"), 560);
    }
  };
}

/* ── 4. 部品: パスワード強度メータ ─────────────────────────────── */

function strengthMeter(authApi) {
  const el = mk("div", "vqs-auth__pw");
  const bars = mk("div", "vqs-auth__pwbars");
  const segs = [];
  for (let i = 0; i < 4; i += 1) { const s = mk("i"); bars.append(s); segs.push(s); }
  const label = mk("span", "vqs-auth__pwlabel", "");
  const hints = mk("ul", "vqs-auth__pwhints");
  el.append(bars, label, hints);
  el.setAttribute("aria-live", "polite");
  return {
    el,
    /** @returns {number} score 0..4 */
    set(pw) {
      let r = { score: 0, label: "", hints: [] };
      try {
        if (authApi && typeof authApi.passwordStrength === "function") r = authApi.passwordStrength(pw) || r;
      } catch (e) { /* 強度が出せなくても入力は続けさせる */ }
      const score = Math.max(0, Math.min(4, Number(r.score) || 0));
      for (let i = 0; i < segs.length; i += 1) segs[i].className = i < score ? "on" : "";
      bars.className = "vqs-auth__pwbars vqs-auth__pwbars--" + STRENGTH_CLASS[score];
      label.textContent = pw ? (r.label || "") : "";
      hints.textContent = "";
      for (const h of (Array.isArray(r.hints) ? r.hints : []).slice(0, 3)) hints.append(mk("li", "", h));
      return score;
    }
  };
}
