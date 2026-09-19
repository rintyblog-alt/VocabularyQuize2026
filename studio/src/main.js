/* ══════════════════════════════════════════════════════════════════════════
   studio/src/main.js — VQ Studio の起動（唯一の入口）

   ★ ここでやること
     ① 設定（API 基点・?debug など）を読む
     ② 保存庫（IndexedDB）とアカウントを起こす
     ③ 「アカウント画面 → プロジェクト一覧 → 編集画面」の行き先を決める
     ④ 落ちたときに **画面を真っ黒にしない**（原因を出して、できる所まで動かす）

   ★ なぜ動的 import（await import）なのか
     部品は多く、1 つの読み込み失敗で全部が黒画面になるのが最悪。
     必須（core）は need()、欠けても編集を続けられる物は want() で読み、
     欠けた物は window.VQSTUDIO.failures に残して selftest.html で見られるようにする。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

const BOOT = document.getElementById("boot");
const BOOT_MSG = document.getElementById("bootMsg");
const failures = [];

function say(msg) { if (BOOT_MSG) BOOT_MSG.textContent = msg; }

/** 欠けてはいけない物 */
async function need(path) {
  try { return await import(path); }
  catch (e) { failures.push({ path, required: true, message: String(e && e.message || e) }); throw e; }
}
/** 欠けても続ける物 */
async function want(path) {
  try { return await import(path); }
  catch (e) { failures.push({ path, required: false, message: String(e && e.message || e) }); return null; }
}

function readConfig() {
  const q = new URLSearchParams(location.search);
  const pub = (typeof window !== "undefined" && window.__PUBLIC_CONFIG__) || {};
  const apiBase = String(
    q.get("api") ||
    (pub.api && pub.api.base) ||
    window.VQ_API_BASE ||
    "https://vocabuquiz-api.rintyblog.workers.dev"
  ).replace(/\/+$/, "");
  return {
    apiBase,
    debug: q.get("debug") === "1",
    projectId: q.get("project") || "",
    startNew: q.has("new"),
    demo: q.get("demo") === "1"
  };
}

/** 落ちたときの最後の砦（真っ黒にしない） */
function fatal(err, where) {
  const msg = String(err && err.stack || err && err.message || err);
  try { console.error("[VQS:fatal]", where, err); } catch (e) { /* noop */ }
  if (BOOT) {
    BOOT.classList.remove("hidden");
    BOOT.innerHTML = "";
    const box = document.createElement("div");
    box.className = "vqs-boot__fatal";
    const h = document.createElement("h1");
    h.textContent = "起動できませんでした";
    const p = document.createElement("p");
    p.textContent = "原因: " + (where || "不明");
    const pre = document.createElement("pre");
    pre.textContent = msg.slice(0, 1200);
    const a = document.createElement("a");
    a.href = "./selftest.html";
    a.textContent = "自己診断を開く";
    a.className = "vqs-btn";
    const r = document.createElement("button");
    r.className = "vqs-btn vqs-btn--primary";
    r.textContent = "もう一度試す";
    r.addEventListener("click", () => location.reload());
    box.append(h, p, pre, r, a);
    BOOT.append(box);
  }
}

async function boot() {
  const cfg = readConfig();
  if (cfg.debug) { try { localStorage.setItem("vqstudio.debug", "1"); } catch (e) { /* noop */ } }

  say("土台を読み込んでいます…");
  const [schema, storeMod, opsMod] = await Promise.all([
    need("./core/schema.js"), need("./core/store.js"), need("./core/ops.js")
  ]);
  const persist = await want("./core/persist.js");
  const authMod = await want("./core/auth.js");

  say("保存庫を開いています…");
  let storage = null;
  if (persist && persist.openStorage) {
    try { storage = await persist.openStorage(); }
    catch (e) { failures.push({ path: "core/persist.js#open", required: false, message: String(e && e.message || e) }); }
  }

  say("アカウントを確かめています…");
  let auth = null;
  if (authMod && authMod.createAuth) {
    try {
      auth = authMod.createAuth({ apiBase: cfg.apiBase });
      await auth.boot();
    } catch (e) {
      failures.push({ path: "core/auth.js#boot", required: false, message: String(e && e.message || e) });
    }
  }

  say("画面を組み立てています…");
  const appMod = await need("./ui/app.js");
  const app = await appMod.createApp({ cfg, schema, storeMod, opsMod, storage, auth, failures });

  window.VQSTUDIO = { app, cfg, storage, auth, schema, store: () => app.store, failures, version: "1.0.0" };

  /* 起動の幕を外す */
  if (BOOT) { BOOT.classList.add("hidden"); }
  document.documentElement.classList.add("vqs-ready");

  /* 拾い切れなかった失敗は静かに知らせる（編集は続ける） */
  if (failures.length) {
    const soft = failures.filter((f) => !f.required);
    if (soft.length && app.toast) {
      app.toast("一部の機能を読み込めませんでした（" + soft.length + " 件）", { kind: "warn", ms: 6000 });
    }
  }

  await app.start();
}

window.addEventListener("error", (ev) => {
  if (!document.documentElement.classList.contains("vqs-ready")) return;
  try { console.error("[VQS:window.error]", ev.error || ev.message); } catch (e) { /* noop */ }
});
window.addEventListener("unhandledrejection", (ev) => {
  try { console.error("[VQS:unhandled]", ev.reason); } catch (e) { /* noop */ }
});

boot().catch((e) => fatal(e, "起動処理"));
