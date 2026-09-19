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
     ・CONTRACT-NOTE: 共通前提の「1 ファイル 700 行で分割」を超えている。
       この画面の担当は auth-screen.js と auth.css の **2 つだけ**（他人の担当に
       ファイルを増やせない）で、§10.3 が数える画面が 11 枚あるため 1 枚あたり
       40〜70 行で既にこの量になる。分けるなら auth-screen/ 配下へ
       fields.js（部品）/ views-register.js / views-reset.js の 3 つに割るのが
       自然で、境目は §5.2（部品）と §5.3 以降（画面）に既に入れてある。
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

/* ── 5. 本体 ───────────────────────────────────────────────────── */

/**
 * アカウント画面を作る（契約書 §10.3）。
 * @param {{auth:any, els?:any, widgets?:any, onDone?:Function}} o
 * @returns {{show:(view?:string)=>void, hide:()=>void, dispose:()=>void, view:()=>string}}
 */
export function createAuthScreen(o) {
  const c = o || {};
  const auth = c.auth;
  const widgets = c.widgets || null;
  const onDone = typeof c.onDone === "function" ? c.onDone : () => { };
  if (!DOC) throw new Error("auth-screen: document がありません（ブラウザ専用）");

  const root = (c.els && c.els.authScreen) || DOC.getElementById("authScreen") || (() => {
    const d = mk("div", "vqs-auth hidden");
    d.id = "authScreen";
    DOC.body.append(d);
    return d;
  })();

  /** 画面が持つ途中の値（auth.js は状態を持たない約束） */
  const S = {
    view: "",
    busy: false,
    grade: "H1",
    nickname: "",
    email: "",
    password: "",
    remember: true,
    challenge: null,         /* register/reset 共通の受付 */
    deadline: 0,
    resendAt: 0,
    registrationSession: "",
    pin: "",
    resetVia: "code",
    resetToken: "",
    resetChallengeId: ""
  };

  let viewport = null;
  let bgCanvas = null;
  let active = false;
  let bound = false;
  let rafId = 0;
  let tickId = 0;
  let depth = 0;
  const stack = [];

  function say(msg, kind) {
    try { if (widgets && typeof widgets.toast === "function") widgets.toast(msg, { kind: kind || "info" }); } catch (e) { /* noop */ }
  }

  /* ── 5.1 骨と背景 ───────────────────────────────────────────── */

  function ensureRoot() {
    if (viewport && viewport.isConnected) return;
    root.textContent = "";
    root.classList.add("vqs-auth");
    bgCanvas = mk("canvas", "vqs-auth__bg");
    bgCanvas.setAttribute("aria-hidden", "true");
    const wash = mk("div", "vqs-auth__wash");
    wash.setAttribute("aria-hidden", "true");
    viewport = mk("div", "vqs-auth__viewport");
    viewport.setAttribute("data-test", "auth-viewport");
    const scroller = mk("div", "vqs-auth__scroll");
    scroller.append(viewport);
    root.append(bgCanvas, wash, scroller);
  }

  /* 軽い粒子。reduced-motion では 1 枚だけ描いて止める（CSS の階調だけが残る） */
  function startBg() {
    if (!bgCanvas) return;
    const ctx = bgCanvas.getContext && bgCanvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const dots = [];
    const N = 34;
    let w = 0;
    let h = 0;
    function size() {
      const r = root.getBoundingClientRect();
      w = Math.max(320, Math.round(r.width || 360));
      h = Math.max(420, Math.round(r.height || 640));
      bgCanvas.width = Math.round(w * dpr);
      bgCanvas.height = Math.round(h * dpr);
      bgCanvas.style.width = w + "px";
      bgCanvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size();
    for (let i = 0; i < N; i += 1) {
      dots.push({
        x: Math.random() * w, y: Math.random() * h,
        r: 40 + Math.random() * 130,
        vx: (Math.random() - 0.5) * 0.12, vy: (Math.random() - 0.5) * 0.1,
        hue: Math.random() < 0.5 ? "79,140,255" : (Math.random() < 0.5 ? "70,216,255" : "167,139,250"),
        a: 0.05 + Math.random() * 0.08
      });
    }
    let last = 0;
    function frame(t) {
      rafId = 0;
      if (!active) return;
      if (t - last < 40) { rafId = requestAnimationFrame(frame); return; }  /* 25fps で足りる */
      last = t;
      ctx.clearRect(0, 0, w, h);
      for (const d of dots) {
        d.x += d.vx; d.y += d.vy;
        if (d.x < -d.r) d.x = w + d.r; else if (d.x > w + d.r) d.x = -d.r;
        if (d.y < -d.r) d.y = h + d.r; else if (d.y > h + d.r) d.y = -d.r;
        const g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r);
        g.addColorStop(0, "rgba(" + d.hue + "," + d.a.toFixed(3) + ")");
        g.addColorStop(1, "rgba(" + d.hue + ",0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
      rafId = requestAnimationFrame(frame);
    }
    if (reducedMotion()) { frame(1e9); if (rafId) { cancelAnimationFrame(rafId); rafId = 0; } return; }
    rafId = requestAnimationFrame(frame);
  }

  function stopBg() { if (rafId) { cancelAnimationFrame(rafId); rafId = 0; } }
  function stopTick() { if (tickId) { clearInterval(tickId); tickId = 0; } }

  /* ── 5.2 板（ガラス調のパネル） ─────────────────────────────── */

  function panel(p) {
    const q = p || {};
    const view = mk("section", "vqs-auth__view");
    view.setAttribute("data-view", q.view || "");
    if (q.hero) view.classList.add("vqs-auth__view--hero");
    const card = mk("div", "vqs-auth__panel");
    card.setAttribute("data-test", "auth-" + (q.view || "panel"));
    const head = mk("header", "vqs-auth__head");
    if (q.back) {
      const b = mk("button", "vqs-auth__back");
      b.type = "button";
      b.setAttribute("aria-label", "戻る");
      b.append(mk("span", "", "‹"));
      b.addEventListener("click", () => goBack());
      head.append(b);
    }
    const ht = mk("div", "vqs-auth__htext");
    if (q.title) ht.append(mk("h1", "vqs-auth__title", q.title));
    if (q.sub) ht.append(mk("p", "vqs-auth__sub", q.sub));
    head.append(ht);
    const body = mk("div", "vqs-auth__body");
    const err = mk("p", "vqs-auth__error");
    err.setAttribute("role", "alert");
    err.setAttribute("data-test", "auth-error");
    card.append(head, body, err);
    view.append(card);

    const api = {
      view, card, body,
      setError(e) {
        const text = typeof e === "string" ? e : (e ? errText(e) : "");
        err.textContent = text;
        card.classList.toggle("vqs-auth__panel--bad", !!text);
      },
      clearError() { api.setError(""); }
    };
    return api;
  }

  function primary(label, onClick, test) {
    const b = btnEl("vqs-auth__btn vqs-auth__btn--primary", label);
    if (test) b.setAttribute("data-test", test);
    const sp = mk("span", "vqs-auth__spin");
    sp.setAttribute("aria-hidden", "true");
    b.append(sp);
    if (typeof onClick === "function") b.addEventListener("click", onClick);
    return b;
  }

  function ghost(label, onClick, extraCls, test) {
    const b = btnEl("vqs-auth__btn " + (extraCls || "vqs-auth__btn--ghost"), label);
    if (test) b.setAttribute("data-test", test);
    if (typeof onClick === "function") b.addEventListener("click", onClick);
    return b;
  }

  function linkBtn(label, onClick, test) {
    const b = mk("button", "vqs-auth__link", label);
    b.type = "button";
    if (test) b.setAttribute("data-test", test);
    if (typeof onClick === "function") b.addEventListener("click", onClick);
    return b;
  }

  function setBusy(btn, on) {
    if (!btn) return;
    btn.classList.toggle("vqs-auth__btn--busy", !!on);
    btn.disabled = !!on;
    btn.setAttribute("aria-busy", on ? "true" : "false");
  }

  function shake(el) {
    if (!el) return;
    el.classList.remove("vqs-auth__shake");
    void el.offsetWidth;
    el.classList.add("vqs-auth__shake");
    setTimeout(() => el.classList.remove("vqs-auth__shake"), 560);
  }

  /** 送信 1 回分の面倒（二重送信・スピナー・失敗表示）を 1 箇所に集める */
  async function run(btn, pane, fn) {
    if (S.busy) return undefined;
    S.busy = true;
    setBusy(btn, true);
    if (pane) pane.clearError();
    try {
      return await fn();
    } catch (err) {
      L.warn("失敗", err && err.code, err && err.message);
      if (pane) pane.setError(err);
      shake(pane ? pane.card : btn);
      return undefined;
    } finally {
      S.busy = false;
      setBusy(btn, false);
    }
  }

  /** 成功の合図（400ms でチェックを描く）→ 続きへ */
  function celebrate(text, next) {
    const veil = mk("div", "vqs-auth__done");
    veil.setAttribute("data-test", "auth-done");
    veil.innerHTML = '<svg class="vqs-auth__donesvg" viewBox="0 0 64 64" aria-hidden="true">'
      + '<circle class="vqs-auth__donering" cx="32" cy="32" r="27"/>'
      + '<path class="vqs-auth__donetick" d="M19 33.5 L28 42 L45 24"/></svg>';
    veil.append(mk("p", "vqs-auth__donetext", text || "ようこそ"));
    root.append(veil);
    const wait = reducedMotion() ? 120 : 620;
    setTimeout(() => {
      try { veil.remove(); } catch (e) { /* noop */ }
      if (typeof next === "function") next();
    }, wait);
  }

  /* ── 5.3 画面: welcome ──────────────────────────────────────── */

  function vWelcome() {
    const p = panel({ view: "welcome", hero: true });
    p.card.classList.add("vqs-auth__panel--hero");
    const mark = mk("div", "vqs-auth__logo");
    mark.append(mk("span", "vqs-auth__logo1", "VQ"), mk("span", "vqs-auth__logo2", "Studio"));
    const tag = mk("p", "vqs-auth__tag", "撮って、並べて、AI に任せる。");
    p.body.append(mark, tag);

    const st = (auth && auth.state) || {};
    if (st.status === "user") {
      const who = nameOf(st.user);
      p.body.append(mk("p", "vqs-auth__note", who + " さんとして入っています。"));
      p.body.append(primary("編集をはじめる", () => onDone(), "auth-continue"));
      p.body.append(linkBtn("アカウントの設定", () => go("profile"), "auth-to-profile"));
      return p.view;
    }

    const off = isOffline();
    const bStart = primary("はじめる（新規登録）", () => go("signup"), "auth-to-signup");
    const bLogin = ghost("ログイン", () => go("login"), "vqs-auth__btn--line", "auth-to-login");
    const bGuest = ghost("ゲストで試す", () => {
      try { if (auth && auth.guest) auth.guest(); } catch (e) { /* noop */ }
      say("ゲストで始めます（保存はこの端末の中だけ）", "info");
      onDone();
    }, "vqs-auth__btn--quiet", "auth-guest");

    if (off) {
      /* ネットが無い: ログイン系は塞いで理由を出し、ゲストを主役にする（§10 の割り切り） */
      bStart.disabled = true;
      bLogin.disabled = true;
      bGuest.classList.remove("vqs-auth__btn--quiet");
      bGuest.classList.add("vqs-auth__btn--primary");
      p.body.append(bGuest, bLogin, bStart);
      p.setError("いまネットに繋がっていません。登録とログインには通信が必要です。ゲストなら今すぐ編集できます（保存はこの端末の中だけ）。");
    } else {
      p.body.append(bStart, bLogin, bGuest);
    }
    p.body.append(mk("p", "vqs-auth__fine", "ゲストでも編集の機能は一切制限しません。ログインすると学習アプリと同じアカウントで持ち出せます。"));
    return p.view;
  }

  /* ── 5.4 画面: login ───────────────────────────────────────── */

  function vLogin() {
    const p = panel({ view: "login", title: "ログイン", sub: "学習アプリと同じアカウントで入れます。", back: true });
    const g = gradeField(S.grade, (v) => { S.grade = v; });
    const nick = field({
      label: "ニックネーム", value: S.nickname, autocomplete: "username", name: "username",
      test: "auth-nickname", enterKeyHint: "next", onInput: (v) => { S.nickname = v; }
    });
    const pw = field({
      label: "パスワード", type: "password", value: "", autocomplete: "current-password",
      name: "password", reveal: true, test: "auth-password", enterKeyHint: "go",
      onEnter: () => submit()
    });
    const remember = checkRow("ログインしたまま", (on) => { S.remember = on; });
    remember.input.checked = S.remember !== false;

    const btn = primary("ログイン", () => submit(), "auth-login-submit");
    p.body.append(g.el, nick.el, pw.el, remember.el, btn);

    const rowA = mk("div", "vqs-auth__row");
    rowA.append(
      linkBtn("パスワードを忘れた", () => { S.grade = g.value(); S.nickname = nick.value(); go("reset"); }, "auth-to-reset"),
      linkBtn("新規登録", () => go("signup"))
    );
    p.body.append(rowA);
    p.body.append(linkBtn("ゲストで試す", () => {
      try { if (auth && auth.guest) auth.guest(); } catch (e) { /* noop */ }
      onDone();
    }, "auth-guest"));

    if (isOffline()) {
      btn.disabled = true;
      p.setError("いまネットに繋がっていません。ログインには通信が必要です。ゲストならそのまま編集できます。");
    }

    function submit() {
      S.grade = g.value();
      S.nickname = nick.value();
      run(btn, p, async () => {
        await auth.login({
          gradePrefix: S.grade, nickname: S.nickname,
          password: pw.value(), remember: S.remember !== false
        });
        celebrate("おかえりなさい", () => onDone());
      });
    }
    return p.view;
  }

  /* ── 5.5 画面: signup ──────────────────────────────────────── */

  function vSignup() {
    const p = panel({ view: "signup", title: "はじめる", sub: "メールで確認したあと、すぐ編集できます。", back: true });
    const email = field({
      label: "メールアドレス", type: "email", value: S.email, autocomplete: "email",
      inputmode: "email", name: "email", test: "auth-email",
      hint: "確認コードを送るだけに使います。", onInput: (v, f) => {
        S.email = v;
        if (!v) { f.setHint("確認コードを送るだけに使います。"); return; }
        const r = auth && auth.validateEmail ? auth.validateEmail(v) : { ok: true };
        f.setHint(r.ok ? "確認コードを送ります。" : r.message, r.ok ? "ok" : "bad");
      }
    });
    const g = gradeField(S.grade, (v) => { S.grade = v; });
    const nick = field({
      label: "ニックネーム", value: S.nickname, autocomplete: "username", name: "username",
      test: "auth-nickname", hint: "2〜24 文字。ログインのときに使います。",
      onInput: (v, f) => {
        S.nickname = v;
        if (!v) { f.setHint("2〜24 文字。ログインのときに使います。"); return; }
        const r = auth && auth.validateNickname ? auth.validateNickname(v) : { ok: true, message: "" };
        f.setHint(r.ok ? "この名前で入れます。" : r.message, r.ok ? "ok" : "bad");
      }
    });
    const meter = strengthMeter(auth);
    const pw = field({
      label: "パスワード", type: "password", autocomplete: "new-password", name: "new-password",
      reveal: true, test: "auth-password", hint: MIN_PW + " 文字以上。",
      onInput: (v, f) => {
        const score = meter.set(v);
        if (!v) { f.setHint(MIN_PW + " 文字以上。"); return; }
        if (v.length < MIN_PW) f.setHint("あと " + (MIN_PW - v.length) + " 文字（合計 " + MIN_PW + " 文字以上）。", "bad");
        else f.setHint(score >= 3 ? "よい強さです。" : "記号や数字を混ぜるともっと強くなります。", score >= 3 ? "ok" : "");
        pw2.setHint(pw2.value() && pw2.value() !== v ? "2 つのパスワードが違います。" : "", pw2.value() && pw2.value() !== v ? "bad" : "");
      }
    });
    const pw2 = field({
      label: "パスワード（確認）", type: "password", autocomplete: "new-password",
      reveal: true, test: "auth-password2", enterKeyHint: "go", onEnter: () => submit(),
      onInput: (v, f) => f.setHint(!v ? "" : (v === pw.value() ? "一致しています。" : "2 つのパスワードが違います。"), !v ? "" : (v === pw.value() ? "ok" : "bad"))
    });
    const btn = primary("確認コードを送る", () => submit(), "auth-signup-submit");
    p.body.append(email.el, g.el, nick.el, pw.el, meter.el, pw2.el, btn);
    p.body.append(linkBtn("アカウントを持っている（ログイン）", () => go("login")));
    meter.set("");

    if (isOffline()) {
      btn.disabled = true;
      p.setError("いまネットに繋がっていません。新規登録には通信が必要です。");
    }

    function submit() {
      S.email = email.value();
      S.grade = g.value();
      S.nickname = nick.value();
      if (pw.value() !== pw2.value()) { p.setError("2 つのパスワードが違います。"); shake(p.card); return; }
      run(btn, p, async () => {
        const ch = await auth.register.start({
          email: S.email, gradePrefix: S.grade, nickname: S.nickname,
          password: pw.value(), password2: pw2.value()
        });
        adoptChallenge(ch);
        go("verify");
      });
    }
    return p.view;
  }

  /* ── 5.6 画面: verify（6 桁） ──────────────────────────────── */

  function adoptChallenge(ch) {
    S.challenge = ch || null;
    const now = Date.now();
    S.deadline = now + (Number(ch && ch.expiresIn) || 600) * 1000;
    S.resendAt = now + (Number(ch && ch.resendAvailableIn) || 30) * 1000;
  }

  function vVerify() {
    const ch = S.challenge || {};
    const p = panel({
      view: "verify", title: "確認コードを入れる",
      sub: (ch.maskedEmail ? ch.maskedEmail : "登録したメール") + " に 6 桁の数字を送りました。", back: true
    });
    const code = codeInput({ length: CODE_LEN, test: "auth-code", onComplete: (v) => submit(v) });
    const left = mk("p", "vqs-auth__timer");
    left.setAttribute("data-test", "auth-timer");
    const btn = primary("確認する", () => submit(code.value()), "auth-verify-submit");
    const resend = ghost("コードを送り直す", () => doResend(), "vqs-auth__btn--quiet", "auth-resend");
    p.body.append(code.el, left, btn, resend);
    if (ch.devCode) {
      const dev = mk("p", "vqs-auth__dev", "開発用コード: " + ch.devCode);
      dev.setAttribute("data-test", "auth-devcode");
      p.body.append(dev);
    }
    if (ch.message) p.body.append(mk("p", "vqs-auth__note", ch.message));
    p.body.append(linkBtn("メールを間違えた（入力に戻る）", () => goBack()));
    code.focus();

    stopTick();
    const paint = () => {
      const now = Date.now();
      const restSec = Math.max(0, (S.deadline - now) / 1000);
      const waitSec = Math.max(0, (S.resendAt - now) / 1000);
      const remain = Number(S.challenge && S.challenge.resendsRemaining);
      left.textContent = restSec > 0
        ? "のこり " + mmss(restSec) + " で無効になります"
        : "コードの有効期限が切れました。送り直してください。";
      left.classList.toggle("vqs-auth__timer--out", restSec <= 0);
      const noMore = Number.isFinite(remain) && remain <= 0;
      resend.disabled = waitSec > 0 || noMore || S.busy;
      const lb = resend.firstChild;
      if (lb) {
        lb.textContent = noMore
          ? "送り直せる回数がありません"
          : (waitSec > 0
            ? "送り直す（" + Math.ceil(waitSec) + " 秒後）"
            : "コードを送り直す" + (Number.isFinite(remain) ? "（あと " + remain + " 回）" : ""));
      }
    };
    paint();
    tickId = setInterval(paint, 500);

    function submit(v) {
      if (S.busy) return;
      if (String(v || "").replace(/\D/g, "").length !== CODE_LEN) {
        p.setError("6 桁の数字を入れてください。");
        code.shake();
        return;
      }
      run(btn, p, async () => {
        try {
          const r = await auth.register.verify({ challengeId: S.challenge && S.challenge.challengeId, code: v });
          S.registrationSession = r.registrationSession || "";
          go("pin");
        } catch (err) {
          code.clear();
          code.shake();
          throw err;
        }
      });
    }
    function doResend() {
      run(resend, p, async () => {
        const next = await auth.register.resend({ challengeId: S.challenge && S.challenge.challengeId });
        /* maskedEmail は resend が返さないことが在る。前の受付の値を残す */
        if (!next.maskedEmail && S.challenge) next.maskedEmail = S.challenge.maskedEmail;
        adoptChallenge(next);
        code.clear();
        say("コードを送り直しました", "ok");
        render("verify", "none");
      });
    }
    return p.view;
  }

  /* ── 5.7 画面: pin（任意） ─────────────────────────────────── */

  function vPin() {
    const p = panel({
      view: "pin", title: "暗証番号（任意）",
      sub: "パスワードを忘れたときに、メールが使えなくてもこの 4 桁で直せます。", back: true
    });
    const a = codeInput({ length: PIN_LEN, otp: false, test: "auth-pin" });
    const b = codeInput({ length: PIN_LEN, otp: false, test: "auth-pin2" });
    const btn = primary("決めて次へ", () => submit(), "auth-pin-submit");
    p.body.append(mk("p", "vqs-auth__label", "4 桁の数字"), a.el,
      mk("p", "vqs-auth__label", "もう一度"), b.el, btn);
    p.body.append(ghost("あとで決める", () => { S.pin = ""; go("consent"); }, "vqs-auth__btn--quiet", "auth-pin-skip"));
    a.focus();

    function submit() {
      const v1 = a.value();
      const v2 = b.value();
      if (v1.length !== PIN_LEN) { p.setError("4 桁の数字を入れてください。"); a.shake(); return; }
      if (v1 !== v2) { p.setError("2 つの暗証番号が違います。"); b.shake(); b.clear(); return; }
      S.pin = v1;
      p.clearError();
      go("consent");
    }
    return p.view;
  }

  /* ── 5.8 画面: consent（同意して本登録） ──────────────────── */

  function vConsent() {
    const p = panel({ view: "consent", title: "はじめる前に", sub: "大事な所だけまとめました。", back: true });
    const box = mk("div", "vqs-auth__terms");
    box.setAttribute("tabindex", "0");
    for (const t of [
      ["利用のきまり", "学習と作品づくりに使ってください。人を傷つける物・他人の作品を勝手に使った物は作らないでください。"],
      ["あなたの動画と画像", "編集した映像はこの端末の中に保存されます。作品そのものを私たちが見ることはありません。"],
      ["集めるもの", "ニックネーム・学年・メールアドレス、それに不具合の記録だけです。広告のために使いません。"],
      ["AI の機能", "自動編集を頼んだときだけ、字幕の文字など必要な物を送ります。送る前に画面で確かめられます。"],
      ["やめたいとき", "アカウントは設定からいつでも消せます。消すとサーバの記録も消えます。"]
    ]) {
      const s = mk("div", "vqs-auth__term");
      s.append(mk("h2", "vqs-auth__termh", t[0]), mk("p", "vqs-auth__termp", t[1]));
      box.append(s);
    }
    const c1 = checkRow("利用のきまりに同意します", () => paint());
    const c2 = checkRow("プライバシーの扱いに同意します", () => paint());
    const c3 = checkRow("13 歳以上です（13 歳未満の場合はおうちの人と一緒に使ってください）", () => paint());
    const btn = primary("同意してはじめる", () => submit(), "auth-consent-submit");
    p.body.append(box, c1.el, c2.el, c3.el, btn);
    const paint = () => { btn.disabled = !(c1.checked() && c2.checked() && c3.checked()) || S.busy; };
    paint();

    function submit() {
      if (!(c1.checked() && c2.checked() && c3.checked())) { p.setError("3 つすべてに印を付けてください。"); return; }
      run(btn, p, async () => {
        await auth.register.consent({
          registrationSession: S.registrationSession,
          pin: S.pin, remember: S.remember !== false
        });
        S.registrationSession = "";
        S.pin = "";
        S.challenge = null;
        celebrate("ようこそ、VQ Studio へ", () => onDone());
      });
    }
    return p.view;
  }

  /* ── 5.9 画面: reset（本人確認 → 方法選び） ──────────────────── */

  function methodPicker(value, onChange) {
    const el = mk("div", "vqs-auth__seg");
    el.setAttribute("role", "radiogroup");
    el.setAttribute("aria-label", "確認の方法");
    const mkOne = (v, label, note) => {
      const b = mk("button", "vqs-auth__segitem");
      b.type = "button";
      b.setAttribute("role", "radio");
      b.setAttribute("data-value", v);
      b.append(mk("span", "vqs-auth__segt", label), mk("span", "vqs-auth__segn", note));
      b.addEventListener("click", () => { value = v; paint(); onChange(v); });
      el.append(b);
      return b;
    };
    const a = mkOne("code", "メールのコード", "登録したメールに 6 桁を送ります");
    const b = mkOne("pin", "暗証番号", "登録のときに決めた 4 桁で直します");
    function paint() {
      a.classList.toggle("vqs-auth__segitem--on", value === "code");
      b.classList.toggle("vqs-auth__segitem--on", value === "pin");
      a.setAttribute("aria-checked", value === "code" ? "true" : "false");
      b.setAttribute("aria-checked", value === "pin" ? "true" : "false");
    }
    paint();
    return el;
  }

  function vReset() {
    const p = panel({ view: "reset", title: "パスワードを直す", sub: "まず本人か確かめます。", back: true });
    const g = gradeField(S.grade, (v) => { S.grade = v; });
    const nick = field({
      label: "ニックネーム", value: S.nickname, autocomplete: "username",
      test: "auth-nickname", onInput: (v) => { S.nickname = v; }
    });
    const picker = methodPicker(S.resetVia, (v) => { S.resetVia = v; pinWrap.classList.toggle("hidden", v !== "pin"); });
    const pinWrap = mk("div", "vqs-auth__pinwrap" + (S.resetVia === "pin" ? "" : " hidden"));
    const pin = codeInput({ length: PIN_LEN, otp: false, test: "auth-reset-pin" });
    pinWrap.append(mk("p", "vqs-auth__label", "暗証番号（4 桁）"), pin.el);
    const btn = primary("次へ", () => submit(), "auth-reset-submit");
    p.body.append(g.el, nick.el, picker, pinWrap, btn);
    p.body.append(linkBtn("ログインに戻る", () => go("login")));

    if (isOffline()) { btn.disabled = true; p.setError("いまネットに繋がっていません。パスワードの直しには通信が必要です。"); }

    function submit() {
      S.grade = g.value();
      S.nickname = nick.value();
      run(btn, p, async () => {
        if (S.resetVia === "pin") {
          const r = await auth.reset.pin({ gradePrefix: S.grade, nickname: S.nickname, pin: pin.value() });
          S.resetChallengeId = r.challengeId || "";
          S.resetToken = r.resetToken || "";
          go("reset-password");
          return;
        }
        const ch = await auth.reset.start({ gradePrefix: S.grade, nickname: S.nickname });
        adoptChallenge(ch);
        S.resetChallengeId = ch.challengeId || "";
        go("reset-code");
      });
    }
    return p.view;
  }

  /* ── 5.10 画面: reset-code ─────────────────────────────────── */

  function vResetCode() {
    const ch = S.challenge || {};
    const p = panel({
      view: "reset-code", title: "コードを入れる",
      sub: (ch.maskedEmail || "登録したメール") + " に 6 桁の数字を送りました。", back: true
    });
    const code = codeInput({ length: CODE_LEN, test: "auth-reset-code", onComplete: (v) => submit(v) });
    const left = mk("p", "vqs-auth__timer");
    const btn = primary("確認する", () => submit(code.value()), "auth-resetcode-submit");
    const again = ghost("コードを送り直す", () => doAgain(), "vqs-auth__btn--quiet", "auth-reset-resend");
    p.body.append(code.el, left, btn, again);
    if (ch.devCode) p.body.append(mk("p", "vqs-auth__dev", "開発用コード: " + ch.devCode));
    code.focus();

    stopTick();
    const paint = () => {
      const rest = Math.max(0, (S.deadline - Date.now()) / 1000);
      left.textContent = rest > 0 ? "のこり " + mmss(rest) : "コードの有効期限が切れました。送り直してください。";
      left.classList.toggle("vqs-auth__timer--out", rest <= 0);
      const remain = Number(S.challenge && S.challenge.resendsRemaining);
      const lb = again.firstChild;
      if (lb && Number.isFinite(remain)) lb.textContent = remain > 0 ? "コードを送り直す（あと " + remain + " 回）" : "送り直せる回数がありません";
      again.disabled = (Number.isFinite(remain) && remain <= 0) || S.busy;
    };
    paint();
    tickId = setInterval(paint, 500);

    function submit(v) {
      if (S.busy) return;
      if (String(v || "").replace(/\D/g, "").length !== CODE_LEN) { p.setError("6 桁の数字を入れてください。"); code.shake(); return; }
      run(btn, p, async () => {
        try {
          const r = await auth.reset.code({ challengeId: S.resetChallengeId, code: v });
          S.resetToken = r.resetToken || "";
          go("reset-password");
        } catch (err) { code.clear(); code.shake(); throw err; }
      });
    }
    function doAgain() {
      run(again, p, async () => {
        const next = await auth.reset.start({ gradePrefix: S.grade, nickname: S.nickname });
        adoptChallenge(next);
        S.resetChallengeId = next.challengeId || "";
        code.clear();
        say("コードを送り直しました", "ok");
        render("reset-code", "none");
      });
    }
    return p.view;
  }

  /* ── 5.11 画面: reset-password ─────────────────────────────── */

  function vResetPassword() {
    const p = panel({ view: "reset-password", title: "新しいパスワード", sub: MIN_PW + " 文字以上にしてください。", back: true });
    const meter = strengthMeter(auth);
    const pw = field({
      label: "新しいパスワード", type: "password", autocomplete: "new-password", reveal: true,
      test: "auth-newpassword", onInput: (v, f) => {
        meter.set(v);
        f.setHint(!v ? "" : (v.length < MIN_PW ? "あと " + (MIN_PW - v.length) + " 文字。" : "この長さなら大丈夫です。"), !v ? "" : (v.length < MIN_PW ? "bad" : "ok"));
      }
    });
    const pw2 = field({
      label: "もう一度", type: "password", autocomplete: "new-password", reveal: true,
      test: "auth-newpassword2", enterKeyHint: "go", onEnter: () => submit(),
      onInput: (v, f) => f.setHint(!v ? "" : (v === pw.value() ? "一致しています。" : "2 つが違います。"), !v ? "" : (v === pw.value() ? "ok" : "bad"))
    });
    const btn = primary("このパスワードにする", () => submit(), "auth-resetpw-submit");
    p.body.append(pw.el, meter.el, pw2.el, btn);
    meter.set("");

    function submit() {
      if (pw.value() !== pw2.value()) { p.setError("2 つのパスワードが違います。"); shake(p.card); return; }
      run(btn, p, async () => {
        await auth.reset.password({
          challengeId: S.resetChallengeId, resetToken: S.resetToken, newPassword: pw.value()
        });
        S.resetToken = "";
        S.resetChallengeId = "";
        S.challenge = null;
        celebrate("パスワードを変えました", () => { say("新しいパスワードでログインしてください", "ok"); go("login"); });
      });
    }
    return p.view;
  }

  /* ── 5.12 画面: change-password ────────────────────────────── */

  function vChangePassword() {
    const st = (auth && auth.state) || {};
    const u = st.user || {};
    const p = panel({ view: "change-password", title: "パスワードを変える", back: true });
    const g = gradeField(gradeOf(u) || S.grade, (v) => { S.grade = v; });
    const nick = field({ label: "ニックネーム", value: nameOf(u) !== "ゲスト" ? nameOf(u) : S.nickname, autocomplete: "username", test: "auth-nickname" });
    const oldPw = field({ label: "今のパスワード", type: "password", autocomplete: "current-password", reveal: true, test: "auth-oldpassword" });
    const meter = strengthMeter(auth);
    const pw = field({
      label: "新しいパスワード", type: "password", autocomplete: "new-password", reveal: true, test: "auth-newpassword",
      onInput: (v, f) => { meter.set(v); f.setHint(!v ? "" : (v.length < MIN_PW ? "あと " + (MIN_PW - v.length) + " 文字。" : ""), v && v.length < MIN_PW ? "bad" : ""); }
    });
    const pw2 = field({
      label: "もう一度", type: "password", autocomplete: "new-password", reveal: true, test: "auth-newpassword2",
      enterKeyHint: "go", onEnter: () => submit(),
      onInput: (v, f) => f.setHint(!v ? "" : (v === pw.value() ? "一致しています。" : "2 つが違います。"), !v ? "" : (v === pw.value() ? "ok" : "bad"))
    });
    const btn = primary("変える", () => submit(), "auth-changepw-submit");
    p.body.append(g.el, nick.el, oldPw.el, pw.el, meter.el, pw2.el, btn);
    meter.set("");

    function submit() {
      if (pw.value() !== pw2.value()) { p.setError("2 つのパスワードが違います。"); shake(p.card); return; }
      run(btn, p, async () => {
        await auth.changePassword({
          gradePrefix: g.value(), nickname: nick.value(),
          oldPassword: oldPw.value(), newPassword: pw.value()
        });
        celebrate("パスワードを変えました", () => {
          say("新しいパスワードになりました", "ok");
          if ((auth.state || {}).status === "user") go("profile"); else go("login");
        });
      });
    }
    return p.view;
  }

  /* ── 5.13 画面: profile ────────────────────────────────────── */

  function nameOf(u) {
    const x = u || {};
    const n = x.nickname || x.name || x.displayName || x.username || "";
    return String(n).trim() || "ゲスト";
  }
  function gradeOf(u) {
    const x = u || {};
    return String(x.gradePrefix || x.grade_prefix || x.grade || "").trim().toUpperCase();
  }
  function gradeLabel(v) {
    const hit = GRADE_ITEMS.find((g) => g.value === String(v || "").toUpperCase());
    return hit ? hit.label : (v ? String(v) : "—");
  }

  function vProfile() {
    const st = (auth && auth.state) || {};
    const u = st.user || {};
    const p = panel({ view: "profile", title: "アカウント", back: true });
    const card = mk("div", "vqs-auth__idcard");
    const av = mk("div", "vqs-auth__avatar", nameOf(u).slice(0, 1).toUpperCase());
    const meta = mk("div", "vqs-auth__idmeta");
    meta.append(mk("strong", "vqs-auth__idname", nameOf(u)), mk("span", "vqs-auth__idgrade", gradeLabel(gradeOf(u))));
    card.append(av, meta);
    p.body.append(card);

    const rows = mk("dl", "vqs-auth__rows");
    const addRow = (k, v) => { rows.append(mk("dt", "", k), mk("dd", "", v)); };
    addRow("状態", st.status === "user" ? (st.stale ? "ログイン中（未確認・オフライン）" : "ログイン中") : (st.status === "guest" ? "ゲスト（保存はこの端末の中だけ）" : "未ログイン"));
    if (u.email) addRow("メール", String(u.email));
    if (st.expiresAt) {
      const d = new Date(Number(st.expiresAt) < 1e12 ? Number(st.expiresAt) * 1000 : Number(st.expiresAt));
      if (!Number.isNaN(d.getTime())) addRow("この端末の有効期限", d.toLocaleString("ja-JP"));
    }
    p.body.append(rows);

    if (st.status === "user") {
      p.body.append(primary("編集に戻る", () => onDone(), "auth-back-to-editor"));
      p.body.append(ghost("パスワードを変更", () => go("change-password"), "vqs-auth__btn--line", "auth-to-changepw"));
      if (st.stale) {
        p.body.append(ghost("いまの状態を確かめる", () => {
          run(null, p, async () => { await auth.refresh(); render("profile", "none"); });
        }, "vqs-auth__btn--quiet"));
      }
      p.body.append(ghost("ゲストに切り替える", () => {
        try { auth.logout({ keepGuest: true }); } catch (e) { /* noop */ }
        say("ゲストに切り替えました", "info");
        onDone();
      }, "vqs-auth__btn--quiet", "auth-to-guest"));
      p.body.append(ghost("ログアウト", () => {
        try { auth.logout({ keepGuest: false }); } catch (e) { /* noop */ }
        say("ログアウトしました", "info");
        stack.length = 0;
        show("welcome");
      }, "vqs-auth__btn--danger", "auth-logout"));
    } else {
      p.body.append(primary("ログイン", () => go("login"), "auth-to-login"));
      p.body.append(ghost("新規登録", () => go("signup"), "vqs-auth__btn--line"));
      p.body.append(ghost("編集に戻る", () => onDone(), "vqs-auth__btn--quiet"));
    }
    return p.view;
  }

  /* ── 6. 画面の差し替えと行き先 ─────────────────────────────── */

  const BUILDERS = {
    welcome: vWelcome, login: vLogin, signup: vSignup, verify: vVerify, pin: vPin,
    consent: vConsent, reset: vReset, "reset-code": vResetCode,
    "reset-password": vResetPassword, "change-password": vChangePassword, profile: vProfile
  };

  /** 別名も受ける（契約書の本文は changePassword とも書く） */
  function normalizeView(v) {
    let s = String(v === undefined || v === null ? "" : v).trim();
    if (!s) return "welcome";
    s = s.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
    if (s === "register" || s === "sign-up") s = "signup";
    if (s === "code" || s === "otp") s = "verify";
    if (s === "account" || s === "me") s = "profile";
    if (s === "forgot") s = "reset";
    return BUILDERS[s] ? s : "welcome";
  }

  /**
   * 1 枚まるごと作り直して差し替える。dir: "fwd" | "back" | "none"
   * @param {string} view @param {string} [dir]
   */
  function render(view, dir) {
    ensureRoot();
    stopTick();
    const v = normalizeView(view);
    let next;
    try {
      next = BUILDERS[v]();
    } catch (err) {
      /* 1 枚が作れなくても画面全体を白くしない（welcome へ落とす） */
      L.error("画面を作れなかった", v, err && err.message);
      next = vWelcome();
      view = "welcome";
    }
    S.view = normalizeView(view);
    const anim = dir && dir !== "none" && !reducedMotion();
    const olds = Array.prototype.slice.call(viewport.children);
    if (anim) next.classList.add(dir === "back" ? "vqs-auth__view--from-left" : "vqs-auth__view--from-right");
    viewport.append(next);
    for (const old of olds) {
      if (!anim) { try { old.remove(); } catch (e) { /* noop */ } continue; }
      old.classList.add("vqs-auth__view--leave", dir === "back" ? "vqs-auth__view--to-right" : "vqs-auth__view--to-left");
      setTimeout(() => { try { old.remove(); } catch (e) { /* noop */ } }, SLIDE_MS + 60);
    }
    if (anim) {
      requestAnimationFrame(() => {
        next.classList.remove("vqs-auth__view--from-left", "vqs-auth__view--from-right");
      });
    }
    root.setAttribute("data-view", S.view);
    try { viewport.scrollTop = 0; } catch (e) { /* noop */ }
    /* 指の端末では勝手にキーボードを出さない（6 桁入力は builder が自分で focus する） */
    const touch = (() => { try { return (navigator.maxTouchPoints || 0) > 0; } catch (e) { return false; } })();
    if (!touch) {
      const first = next.querySelector(".vqs-auth__input, .vqs-auth__select, .vqs-auth__cell");
      if (first) setTimeout(() => { try { first.focus({ preventScroll: true }); } catch (e) { /* noop */ } }, SLIDE_MS);
    }
  }

  /** 進む（history に 1 段積む） */
  function go(view) {
    const v = normalizeView(view);
    if (v === S.view) return;
    stack.push(v);
    depth = stack.length;
    try {
      const loc = globalThis.location;
      globalThis.history.pushState({ vqsAuthDepth: depth, vqsAuthView: v }, "", loc ? loc.href : "");
    } catch (e) { /* history が使えなくても画面は動く */ }
    render(v, "fwd");
  }

  /** 1 段戻る（ブラウザの戻ると同じ道を通す） */
  function goBack() {
    if (stack.length > 1) {
      try { globalThis.history.back(); return; } catch (e) { /* noop */ }
      stack.pop();
      render(stack[stack.length - 1], "back");
      return;
    }
    if (S.view !== "welcome") { stack[0] = "welcome"; render("welcome", "back"); return; }
    onDone();
  }

  function onPop(ev) {
    if (!active) return;
    const st = ev && ev.state;
    const d = Number(st && st.vqsAuthDepth);
    const target = Number.isFinite(d) && d >= 1 ? d : 1;
    if (target >= stack.length) return;      /* 私たちより前の履歴。触らない */
    stack.length = target;
    render(stack[target - 1], "back");
  }

  /* ── 7. 外の出来事（ネット・キーボード・大きさ） ─────────────── */

  function onNet() {
    if (!active) return;
    /* ネットの有無で「できること」が変わる画面だけ作り直す */
    if (S.view === "welcome" || S.view === "login" || S.view === "signup" || S.view === "reset") render(S.view, "none");
  }

  /** iOS: キーボードが出ると見える高さが縮む。CSS にその高さを渡す（§13.4） */
  function onViewport() {
    try {
      const vv = globalThis.visualViewport;
      if (!vv) return;
      root.style.setProperty("--vqs-auth-vh", Math.round(vv.height) + "px");
      root.classList.toggle("vqs-auth--kb", vv.height < (globalThis.innerHeight || vv.height) - 80);
    } catch (e) { /* noop */ }
  }

  function onResize() {
    onViewport();
    if (!active) return;
    stopBg();
    startBg();
  }

  function bind() {
    if (bound) return;
    bound = true;
    try { globalThis.addEventListener("popstate", onPop); } catch (e) { /* noop */ }
    try { globalThis.addEventListener("online", onNet); globalThis.addEventListener("offline", onNet); } catch (e) { /* noop */ }
    try { globalThis.addEventListener("resize", onResize); } catch (e) { /* noop */ }
    try { if (globalThis.visualViewport) globalThis.visualViewport.addEventListener("resize", onViewport); } catch (e) { /* noop */ }
  }

  function unbind() {
    if (!bound) return;
    bound = false;
    try { globalThis.removeEventListener("popstate", onPop); } catch (e) { /* noop */ }
    try { globalThis.removeEventListener("online", onNet); globalThis.removeEventListener("offline", onNet); } catch (e) { /* noop */ }
    try { globalThis.removeEventListener("resize", onResize); } catch (e) { /* noop */ }
    try { if (globalThis.visualViewport) globalThis.visualViewport.removeEventListener("resize", onViewport); } catch (e) { /* noop */ }
  }

  /* ── 8. 外に出す口（契約書 §10.3） ─────────────────────────── */

  /** @param {string} [view] */
  function show(view) {
    ensureRoot();
    const v = normalizeView(view);
    root.classList.remove("hidden");
    root.removeAttribute("aria-hidden");
    active = true;
    bind();
    onViewport();
    startBg();
    if (!stack.length) { stack.push(v); depth = 1; render(v, "none"); return; }
    if (v !== S.view) go(v);
  }

  function hide() {
    active = false;
    stopBg();
    stopTick();
    root.classList.add("hidden");
    root.setAttribute("aria-hidden", "true");
  }

  function dispose() {
    hide();
    unbind();
    stack.length = 0;
    S.view = "";
    S.challenge = null;
    S.registrationSession = "";
    S.pin = "";
    S.resetToken = "";
    try { root.textContent = ""; } catch (e) { /* noop */ }
    viewport = null;
    bgCanvas = null;
  }

  return {
    show, hide, dispose,
    /** 今どの画面か（通し試験と commands.js が見る） */
    view: () => S.view,
    /** 1 段戻る（他の UI から使えるように出しておく） */
    back: goBack
  };
}

export default createAuthScreen;
