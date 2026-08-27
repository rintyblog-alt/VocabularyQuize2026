/* 順番待ちの帯・アプリ内通知・添付の手動クリアを、実画面で確かめる。

   ここは AI を動かさない。順番待ちの状態を直接与えて、
   3画面それぞれの入力欄の真上に帯が出るか（＝置き場所が正しいか）を見る。
   実際に人が並んだときの数字は Bridge から来るので、その配線は
   「queue.wait を1件流したら帯が出る」ことで確かめる。

   実行: node vqqueue.cjs
*/
const { chromium } = require("playwright");
const fs = require("fs");
const os = require("os");
const path = require("path");
const URL = "http://127.0.0.1:8791/?vqdev=1";
const SAMPLE = path.join(os.tmpdir(), "vqqueue-sample.txt");
fs.writeFileSync(SAMPLE, "これは検証用の資料です。ザルカンド条約は839年に結ばれた。\n".repeat(20), "utf8");
const HIDE = `#vqbFlow,#mob-tut-overlay,#mobBarTutorial,#firstLaunchOverlay,#vqOnboardingOverlay{display:none !important;}`;

let pass = 0, fail = 0;
const log = [];
function ok(name, cond, extra) {
  if (cond) { pass++; log.push("  ok   " + name); }
  else { fail++; log.push("  FAIL " + name + (extra ? "\n         → " + extra : "")); }
}

async function login(pg) {
  await pg.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.addStyleTag({ content: HIDE });
  await pg.waitForFunction(() => document.getElementById("authLoginSubmitBtn"), { timeout: 30000 });
  await pg.evaluate(() => {
    const setV = (el, v) => {
      const p = el.tagName === "SELECT" ? HTMLSelectElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(p.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    setV(document.getElementById("authLoginGrade"), "H3");
    setV(document.getElementById("authLoginNickname"), "tester");
    setV(document.getElementById("authLoginPassword"), "Abcd1234");
    document.getElementById("authLoginSubmitBtn").click();
  });
  await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 60000 });
  await pg.addStyleTag({ content: HIDE });
  await pg.waitForTimeout(2200);
  for (let i = 0; i < 3; i++) {
    const c = await pg.evaluate(() => {
      const bd = document.querySelector(".ui-modal-backdrop");
      if (!bd || getComputedStyle(bd).display === "none") return false;
      const b = document.getElementById("uiModalOk") || document.getElementById("uiModalCancel");
      if (b) { b.click(); return true; }
      return false;
    });
    if (!c) break;
    await pg.waitForTimeout(400);
  }
  await pg.evaluate(() => { const n = document.getElementById("vqNewAuth"); if (n) n.style.display = "none"; });
}

/* 帯が「入力欄より上」に出ているかを、実際の座標で見る */
function PROBE(sel) {
  const host = document.querySelector(sel.host);
  const r = host && host.shadowRoot ? host.shadowRoot : document;
  const b = r.querySelector("[data-vq-queue]");
  const inp = r.querySelector(sel.input);
  if (!b || !inp) return { found: !!b, input: !!inp, display: "missing" };
  const cs = getComputedStyle(b);
  const rb = b.getBoundingClientRect(), ri = inp.getBoundingClientRect();
  return {
    found: true, input: true,
    display: cs.display,
    text: (b.textContent || "").replace(/\s+/g, " ").trim(),
    bar: !!b.querySelector(".vqq-fill"),
    width: b.querySelector(".vqq-fill") ? b.querySelector(".vqq-fill").style.width : "",
    aboveInput: rb.bottom <= ri.top + 1,
    height: Math.round(rb.height)
  };
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();
  pg.on("pageerror", (e) => log.push("  [pageerror] " + e.message));

  try {
    await login(pg);

    /* ── 0. 部品が載っているか ─────────────────────────── */
    const mods = await pg.evaluate(() => ({
      queue: !!window.__vqQueue, notify: !!window.__vqNotify,
      clearFn: !!(window.VQ2 && window.VQ2.ui && typeof window.VQ2.ui.clearAttachments === "function")
    }));
    ok("__vqQueue が載っている", mods.queue);
    ok("__vqNotify が載っている", mods.notify);

    /* ── 1. Quick Chat ────────────────────────────────── */
    await pg.evaluate(() => {
      const e = document.querySelector('#appTabBar [data-app-tab="chat"]');
      if (e) e.click();
    });
    await pg.waitForTimeout(1500);

    let before = await pg.evaluate(PROBE, { host: "#vqChat", input: ".ta" });
    ok("Quick Chat: 待っていないときは出ない", before.found && before.display === "none",
       JSON.stringify(before));

    await pg.evaluate(() => window.__vqQueue.set({ position: 2, queued: 3, running: 2, limit: 2 }));
    await pg.waitForTimeout(300);
    let q = await pg.evaluate(PROBE, { host: "#vqChat", input: ".ta" });
    ok("Quick Chat: 帯が出る", q.display === "block", JSON.stringify(q));
    ok("Quick Chat: 「2番目 / 5人中」が出る", /2番目 \/ 5人中/.test(q.text || ""), q.text);
    ok("Quick Chat: 進捗バーがある", q.bar === true, JSON.stringify(q));
    ok("Quick Chat: 入力欄の真上にある", q.aboveInput === true, JSON.stringify(q));

    /* 実イベント（server と同じ形）を1件流す */
    await pg.evaluate(() => window.__vqQueue.clear());
    await pg.evaluate(() => window.__vqQueue.note({
      type: "queue.wait", status: "running", label: "順番待ちです（3番目）",
      current: 3, total: 4, running: 2, limit: 2
    }));
    await pg.waitForTimeout(200);
    q = await pg.evaluate(PROBE, { host: "#vqChat", input: ".ta" });
    ok("queue.wait を1件流すと帯が出る", q.display === "block" && /3番目 \/ 6人中/.test(q.text || ""), q.text);

    /* 生成が始まったら消える */
    await pg.evaluate(() => window.__vqQueue.note({
      type: "local.bridge.connect", status: "completed", label: "接続しました"
    }));
    await pg.waitForTimeout(200);
    q = await pg.evaluate(PROBE, { host: "#vqChat", input: ".ta" });
    ok("順番が来たら帯が消える", q.display === "none", JSON.stringify(q));

    /* 心拍が途切れたら消える（45秒待たずに時計を進める代わりに直接確かめる） */
    const stale = await pg.evaluate(async () => {
      window.__vqQueue.set({ position: 1, queued: 1, running: 2, limit: 2 });
      const s = window.__vqQueue.get();
      s.beat = Date.now() - 60000;            /* 1分前を最後の心拍にする */
      await new Promise((r) => setTimeout(r, 900));
      return window.__vqQueue.get().on;
    });
    ok("心拍が途切れたら出しっぱなしにしない", stale === false, "on=" + stale);

    /* ── 2. アプリ内通知 ───────────────────────────────── */
    await pg.evaluate(() => window.__vqNotify.start("t1", { label: "試験を作っています" }));
    await pg.waitForTimeout(1200);
    const n1 = await pg.evaluate(() => {
      const h = document.getElementById("vqNotifyHost");
      const el = h && h.querySelector(".vqn");
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { text: (el.textContent || "").replace(/\s+/g, " ").trim(),
               right: Math.round(window.innerWidth - r.right), top: Math.round(r.top),
               spin: !!el.querySelector(".vqn-i.is-run") };
    });
    ok("通知が出る（PCは右上）", !!n1 && n1.right < 40 && n1.top < 60, JSON.stringify(n1));
    ok("通知に何をしているかと経過時間が出る",
       !!n1 && /試験を作っています/.test(n1.text) && /経過/.test(n1.text), n1 && n1.text);
    ok("生成中は回っている印が出る", !!n1 && n1.spin === true);

    await pg.evaluate(() => window.__vqNotify.done("t1", { ok: true, label: "試験ができました" }));
    await pg.waitForTimeout(300);
    const n2 = await pg.evaluate(() => {
      const el = document.querySelector("#vqNotifyHost .vqn");
      return el ? { text: (el.textContent || "").replace(/\s+/g, " ").trim(),
                    ok: !!el.querySelector(".vqn-i.is-ok") } : null;
    });
    ok("終わったら「できました」に変わる",
       !!n2 && /試験ができました/.test(n2.text) && n2.ok === true, JSON.stringify(n2));
    ok("かかった時間が出る", !!n2 && /かかりました/.test(n2.text), n2 && n2.text);
    await pg.waitForTimeout(5400);
    const n3 = await pg.evaluate(() => !!document.querySelector("#vqNotifyHost .vqn"));
    ok("通知は自分で消える", n3 === false);

    /* モバイル幅では上部中央（左右いっぱい） */
    await pg.setViewportSize({ width: 390, height: 844 });
    await pg.evaluate(() => window.__vqNotify.start("t2", { label: "問題を作っています" }));
    await pg.waitForTimeout(300);
    const nm = await pg.evaluate(() => {
      const el = document.querySelector("#vqNotifyHost .vqn");
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(window.innerWidth - r.right), top: Math.round(r.top) };
    });
    ok("モバイルは上部に横いっぱいで出る",
       !!nm && nm.left <= 14 && nm.right <= 14 && nm.top < 60, JSON.stringify(nm));
    await pg.evaluate(() => window.__vqNotify.remove("t2"));
    await pg.setViewportSize({ width: 1440, height: 900 });

    /* ── 3. プリセット作成 ─────────────────────────────── */
    await pg.evaluate(() => window.VQ2.presetStudio.open({}));
    await pg.waitForTimeout(1500);
    await pg.evaluate(() => window.__vqQueue.set({ position: 1, queued: 2, running: 2, limit: 2 }));
    await pg.waitForTimeout(300);
    const ps = await pg.evaluate(PROBE, { host: ".vq2-host", input: '[data-key="autoInstruction"]' });
    ok("プリセット作成: 帯が入力欄の真上に出る",
       ps.display === "block" && ps.aboveInput === true, JSON.stringify(ps));
    ok("プリセット作成: 「1番目 / 4人中」が出る", /1番目 \/ 4人中/.test(ps.text || ""), ps.text);

    /* 画面を描き直しても帯は残る（innerHTML を作り直す作りなので、ここが要点） */
    const survived = await pg.evaluate(async () => {
      const host = document.querySelector(".vq2-host");
      const r = host.shadowRoot;
      const ta = r.querySelector('[data-key="autoInstruction"]');
      ta.value = "テスト"; ta.dispatchEvent(new Event("input", { bubbles: true }));
      /* 資料モードの切り替えで AI 欄が描き直される */
      const b = r.querySelector('[data-act="mode-manual"]');
      if (b) b.click();
      await new Promise((x) => setTimeout(x, 200));
      const b2 = r.querySelector('[data-act="mode-auto"]');
      if (b2) b2.click();
      await new Promise((x) => setTimeout(x, 900));
      const el = r.querySelector("[data-vq-queue]");
      return el ? getComputedStyle(el).display : "missing";
    });
    ok("描き直しても帯は残る", survived === "block", "display=" + survived);

    await pg.evaluate(() => window.__vqQueue.clear());

    /* ── 4. Quick Mock ────────────────────────────────── */
    await pg.evaluate(() => window.VQ2.quickMock.open({}));
    await pg.waitForTimeout(1800);
    await pg.evaluate(() => window.__vqQueue.set({ position: 4, queued: 4, running: 2, limit: 2 }));
    await pg.waitForTimeout(300);
    const qm = await pg.evaluate(PROBE, { host: ".vq2-host", input: '[data-key="instruction"]' });
    ok("Quick Mock: 帯が入力欄の真上に出る",
       qm.display === "block" && qm.aboveInput === true, JSON.stringify(qm));
    ok("Quick Mock: 「4番目 / 6人中」が出る", /4番目 \/ 6人中/.test(qm.text || ""), qm.text);
    await pg.evaluate(() => window.__vqQueue.clear());

    /* ── 5. 添付は送っても残る／手動で外せる ───────────── */
    /* 実際の選択画面から入れる（画面が持つ st.attachments へ入るのはこの経路だけ） */
    pg.once("filechooser", async (fc) => { await fc.setFiles(SAMPLE); });
    await pg.evaluate(() => {
      const r = document.querySelector(".vq2-host").shadowRoot;
      const b = r.querySelector('[data-act="attach"]');
      if (b) b.click();
    });
    await pg.waitForFunction(() => {
      const h = document.querySelector(".vq2-host");
      return !!(h && h.shadowRoot.querySelector(".vq2-attach-i"));
    }, { timeout: 30000 }).catch(() => {});
    await pg.waitForTimeout(600);

    const shown = await pg.evaluate(() => {
      const r = document.querySelector(".vq2-host").shadowRoot;
      return {
        items: r.querySelectorAll(".vq2-attach-i").length,
        del: r.querySelectorAll('[data-act="attach-del"]').length,
        clear: r.querySelectorAll('[data-act="attach-clear"]').length,
        head: !!r.querySelector(".vq2-attach-c"),
        headText: (r.querySelector(".vq2-attach-c") || {}).textContent || ""
      };
    });
    ok("Quick Mock: 添付の札が出る", shown.items > 0, JSON.stringify(shown));
    ok("Quick Mock: 1件ずつ外せる（×）", shown.del > 0, JSON.stringify(shown));
    ok("Quick Mock: 「すべて外す」がある", shown.clear > 0, JSON.stringify(shown));
    ok("Quick Mock: 次も使うと書いてある", /次に作るときも使います/.test(shown.headText), shown.headText);

    /* 送っても消えないことを、生成せずに確かめる:
       AI の欄と設定の欄を行き来しても札が残っているか（描き直しでも消えない） */
    const kept = await pg.evaluate(async () => {
      const r = document.querySelector(".vq2-host").shadowRoot;
      const t = r.querySelector('[data-key="instruction"]');
      if (t) { t.value = "テスト指示"; t.dispatchEvent(new Event("input", { bubbles: true })); }
      await new Promise((x) => setTimeout(x, 500));
      return r.querySelectorAll(".vq2-attach-i").length;
    });
    ok("入力しても札は残る", kept > 0, "items=" + kept);

    const cleared = await pg.evaluate(async () => {
      const r = document.querySelector(".vq2-host").shadowRoot;
      const b = r.querySelector('[data-act="attach-clear"]');
      if (!b) return { err: "no button" };
      b.click();
      await new Promise((x) => setTimeout(x, 700));
      return { items: r.querySelectorAll(".vq2-attach-i").length,
               store: (window.__vqChatFiles.list() || []).length };
    });
    ok("「すべて外す」で画面から消える", cleared.items === 0, JSON.stringify(cleared));
    ok("「すべて外す」で保管からも消える", cleared.store === 0, JSON.stringify(cleared));

  } catch (e) {
    fail++;
    log.push("  FAIL 実行中に例外\n         → " + (e && e.stack ? e.stack.split("\n").slice(0, 3).join(" / ") : e));
  }

  await browser.close();
  console.log("\n順番待ち・通知・添付\n" + log.join("\n"));
  console.log(`\n  ${pass} / ${pass + fail}\n`);
  process.exit(fail ? 1 : 0);
})();
