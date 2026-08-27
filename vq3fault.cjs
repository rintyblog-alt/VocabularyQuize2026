/* 混合・障害・復旧試験（夜間 Hardening）

   壊し方を一つずつ試し、**無限ローディングにならず、原因と次の手が伝わるか** を見る。
   Bridge の停止・再起動を含むので、他の AI テストと同時に走らせないこと。

   使い方:
     node vq3fault.cjs
     node vq3fault.cjs --skip-bridge      # Bridge の停止を伴う項目を飛ばす
     node vq3fault.cjs --out artifacts/v3-overnight/test-results/fault.json */
const { chromium } = require("playwright");
const { execSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const OUT = arg("out", "artifacts/v3-overnight/test-results/fault.json");
const SKIP_BRIDGE = process.argv.includes("--skip-bridge");
const HIDE = "#vqNewAuth{display:none !important}";
const ROOT = __dirname;

let pass = 0, fail = 0;
const results = [];
async function step(name, fn) {
  const t0 = Date.now();
  try {
    const r = await fn();
    pass++; results.push({ name, ok: true, detail: r || "", ms: Date.now() - t0 });
    console.log("  ✓ " + name + (r ? " — " + r : ""));
  } catch (e) {
    fail++; results.push({ name, ok: false, detail: e.message, ms: Date.now() - t0 });
    console.log("  ✗ " + name + " — " + e.message);
  }
}
function assert(c, m) { if (!c) throw new Error(m || "assertion failed"); }

async function login(pg) {
  await pg.goto("http://127.0.0.1:8791/?vqdev=1", { waitUntil: "domcontentloaded", timeout: 30000 });
  await pg.addStyleTag({ content: HIDE });
  await pg.waitForFunction(() => document.getElementById("authLoginSubmitBtn"), { timeout: 20000 });
  await pg.evaluate(() => {
    const setV = (el, v) => {
      const p = el.tagName === "SELECT" ? HTMLSelectElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(p.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    setV(document.getElementById("authLoginGrade"), "H3");
    setV(document.getElementById("authLoginNickname"), "tester");
    setV(document.getElementById("authLoginPassword"), "Abcd1234");
    document.getElementById("authLoginSubmitBtn").click();
  });
  await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 30000 });
  await pg.waitForTimeout(1800);
}

function bridgeUp() {
  try { execSync("curl -s -m 3 http://127.0.0.1:17891/health -o /dev/null"); return true; }
  catch (e) { return false; }
}
function stopBridge() { try { execSync('pkill -f "node src/server.mjs"'); } catch (e) {} }
function startBridge() {
  const p = spawn("node", ["src/server.mjs"], {
    cwd: path.join(ROOT, "local-ai"),
    env: Object.assign({}, process.env, { VQ_BRIDGE_OPEN: "1" }),
    detached: true, stdio: "ignore"
  });
  p.unref();
}
async function waitBridge(ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < (ms || 30000)) {
    if (bridgeUp()) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

/* 1×1 の PNG（エンジンが読めない）と、まっとうな文書 */
const BAD_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const DOC = { id: "d1", name: "古代.pdf", kind: "pdf", pageCount: 1,
  extractedText: "[p.1] 645年の大化の改新。701年の大宝律令。710年の平城京遷都。" };

(async () => {
  const started = new Date();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();
  const consoleErrors = [], pageErrors = [];
  pg.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
  pg.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));
  await login(pg);

  console.log("\n══ 入力の壊れ方に耐える ══");

  await step("壊れた画像を混ぜても、文書から作れる", async () => {
    const r = await pg.evaluate(async ({ doc, png }) => {
      try {
        const res = await window.VQ2.ai.generatePreset({
          instruction: "添付した資料だけを根拠に、4択問題を2問作ってください。",
          attachments: [doc, { id: "i1", name: "板書.png", kind: "image", imageBase64: png }],
          sourceOnly: true, count: 2
        });
        const d = res.structured && res.structured.questions ? res.structured
          : (res.structured && res.structured.data ? res.structured.data : null);
        return { ok: true, n: d && d.questions ? d.questions.length : 0 };
      } catch (e) { return { ok: false, why: String((e && (e.userMessage || e.message)) || e) }; }
    }, { doc: DOC, png: BAD_PNG });
    assert(r.ok, "落ちた: " + r.why);
    assert(r.n > 0, "問題が 1 問も作れなかった");
    return r.n + " 問できた";
  });

  await step("中身の無い資料でも、無言で失敗しない", async () => {
    const r = await pg.evaluate(async () => {
      try {
        const res = await window.VQ2.ai.generatePreset({
          instruction: "添付した資料だけを根拠に、4択問題を2問作ってください。",
          attachments: [{ id: "e1", name: "空.pdf", kind: "pdf", pageCount: 0, extractedText: "" }],
          sourceOnly: true, count: 2
        });
        const d = res.structured && res.structured.questions ? res.structured
          : (res.structured && res.structured.data ? res.structured.data : null);
        return { ok: true, n: d && d.questions ? d.questions.length : 0,
                 warnings: (res.warnings || []).length, text: (res.text || "").slice(0, 80) };
      } catch (e) { return { ok: false, why: String((e && (e.userMessage || e.message)) || e) }; }
    });
    /* 作れないこと自体は正しい。**理由が伝わること** が条件。 */
    if (!r.ok) { assert(String(r.why).length > 0, "理由が空のまま失敗した"); return "失敗を明示: " + r.why.slice(0, 40); }
    return `${r.n} 問 / 注意 ${r.warnings} 件`;
  });

  await step("巨大すぎる添付は、投げる前に弾く", async () => {
    const r = await pg.evaluate(() => {
      const S = window.VQ2.schema;
      const huge = "あ".repeat(300 * 1024);
      const issues = S.validateAppearance({ icon: "", iconImage: "data:image/png;base64," + huge, banner: "" }, "appearance", []);
      return { blocked: issues.length > 0, code: issues.map((i) => i.code) };
    });
    assert(r.blocked, "大きすぎるものを受け入れてしまった");
    return "上限で拒否（" + r.code.join(",") + "）";
  });

  console.log("\n══ 連打・二重実行 ══");

  await step("同じ生成を二重に走らせない（後発は理由つきで断る）", async () => {
    const r = await pg.evaluate(async ({ doc }) => {
      const a = window.VQ2.ai.generatePreset({
        instruction: "資料から4択問題を3問作ってください。", attachments: [doc], sourceOnly: true, count: 3 });
      await new Promise((res) => setTimeout(res, 300));
      let second = null;
      try { await window.VQ2.ai.generatePreset({
        instruction: "資料から4択問題を3問作ってください。", attachments: [doc], sourceOnly: true, count: 3 });
        second = "通ってしまった";
      } catch (e) { second = String((e && (e.userMessage || e.message)) || e); }
      let first = null;
      try { const res = await a; first = "ok:" + (res.text || "").length; }
      catch (e) { first = "失敗:" + String((e && (e.userMessage || e.message)) || e).slice(0, 40); }
      return { first, second, running: window.VQ2.ai.isRunning() };
    }, { doc: DOC });
    assert(r.second !== "通ってしまった", "二重に走ってしまった");
    assert(!r.running, "終わったのに実行中のまま");
    return `後発は断られた（${String(r.second).slice(0, 30)}）／ 先発 ${r.first}`;
  });

  await step("停止したあと、実行中のまま残らない", async () => {
    const r = await pg.evaluate(async ({ doc }) => {
      const p = window.VQ2.ai.generatePreset({
        instruction: "資料から4択問題を5問作ってください。", attachments: [doc], sourceOnly: true, count: 5 });
      await new Promise((res) => setTimeout(res, 1500));
      window.VQ2.ai.cancel();
      let how = null;
      try { await p; how = "完了した"; }
      catch (e) { how = e && e.cancelled ? "止まった" : "失敗:" + String(e.userMessage || e.message).slice(0, 40); }
      await new Promise((res) => setTimeout(res, 500));
      return { how, running: window.VQ2.ai.isRunning(),
               job: localStorage.getItem("vq2.activeJob.v1") };
    }, { doc: DOC });
    assert(!r.running, "停止後も実行中のまま");
    assert(!r.job, "実行中の Job が残っている: " + r.job);
    return r.how;
  });

  console.log("\n══ 保存領域 ══");

  await step("保存領域がいっぱいでも、握りつぶさず失敗を返す", async () => {
    const r = await pg.evaluate(() => {
      const ST = window.VQ2.store;
      const key = "vq3.fill.tmp";
      let filled = 0;
      try {
        /* 空きを埋める（自分で入れたものだけを消す） */
        const chunk = "x".repeat(512 * 1024);
        for (let i = 0; i < 40; i++) { localStorage.setItem(key + i, chunk); filled++; }
      } catch (e) { /* ここで一杯になる */ }
      let res = null;
      try {
        const S = window.VQ2.schema;
        const p = S.emptyPreset({ name: "満杯テスト", questions: [S.emptyQuestion({
          prompt: "問", choices: [
            { id: "c1", label: "A", text: "正", explanation: "", isCorrect: true },
            { id: "c2", label: "B", text: "誤", explanation: "", isCorrect: false }] })] });
        res = ST.savePreset(p, {});
      } catch (e) { res = { ok: false, error: "THROWN", message: String(e).slice(0, 80) }; }
      for (let i = 0; i < filled; i++) localStorage.removeItem(key + i);
      return { filledMb: Math.round(filled * 0.5), ok: res.ok, error: res.error, message: (res.message || "").slice(0, 60) };
    });
    /* 保存できてもできてもよい。**黙って壊れないこと** が条件。 */
    assert(r.ok === true || (r.error && r.error !== "THROWN"),
      "例外が外へ漏れた: " + r.message);
    return r.ok ? `${r.filledMb}MB 埋めても保存できた` : `理由つきで失敗（${r.error}）`;
  });

  await step("壊れた保存データがあっても、起動して読み飛ばす", async () => {
    const r = await pg.evaluate(() => {
      const raw = localStorage.getItem("vq2.presets.v1");
      localStorage.setItem("vq2.presets.v1", "{壊れたJSON");
      let list = null, threw = null;
      try { list = window.VQ2.store.listPresets().length; } catch (e) { threw = String(e).slice(0, 80); }
      if (raw === null) localStorage.removeItem("vq2.presets.v1"); else localStorage.setItem("vq2.presets.v1", raw);
      return { list, threw };
    });
    assert(!r.threw, "壊れたデータで落ちた: " + r.threw);
    return "読み飛ばして " + r.list + " 件";
  });

  console.log("\n══ Bridge とモデル ══");

  if (SKIP_BRIDGE) {
    console.log("  （--skip-bridge のため飛ばしました）");
  } else {
    await step("Bridge が止まっているときは、待たせずに理由を返す", async () => {
      stopBridge();
      await new Promise((r) => setTimeout(r, 2000));
      assert(!bridgeUp(), "Bridge が止まっていない");
      const t0 = Date.now();
      const r = await pg.evaluate(async ({ doc }) => {
        const avail = await window.VQ2.ai.available();
        let genErr = null;
        try { await window.VQ2.ai.generatePreset({
          instruction: "資料から4択問題を2問作ってください。", attachments: [doc], sourceOnly: true, count: 2 }); }
        catch (e) { genErr = String((e && (e.userMessage || e.message)) || e); }
        return { availOk: avail.ok, availMsg: avail.message, genErr, running: window.VQ2.ai.isRunning() };
      }, { doc: DOC });
      const ms = Date.now() - t0;
      assert(!r.availOk, "止めたのに使えると答えた");
      assert(r.availMsg && r.availMsg.length > 0, "理由が空");
      assert(r.genErr, "生成が失敗として返らなかった");
      assert(!r.running, "実行中のまま残った");
      assert(ms < 90000, "返るまでに時間がかかりすぎ: " + ms + "ms");
      return `${Math.round(ms / 1000)}秒で理由を返す（${r.availMsg.slice(0, 30)}）`;
    });

    await step("Bridge を戻すと、そのまま使えるようになる", async () => {
      startBridge();
      const up = await waitBridge(40000);
      assert(up, "Bridge が復帰しない");
      await new Promise((r) => setTimeout(r, 3000));
      const r = await pg.evaluate(async ({ doc }) => {
        const avail = await window.VQ2.ai.available();
        if (!avail.ok) return { ok: false, why: avail.message };
        try {
          const res = await window.VQ2.ai.generatePreset({
            instruction: "資料から4択問題を2問作ってください。", attachments: [doc], sourceOnly: true, count: 2 });
          const d = res.structured && res.structured.questions ? res.structured
            : (res.structured && res.structured.data ? res.structured.data : null);
          return { ok: true, n: d && d.questions ? d.questions.length : 0 };
        } catch (e) { return { ok: false, why: String((e && (e.userMessage || e.message)) || e) }; }
      }, { doc: DOC });
      assert(r.ok, "復帰後に使えない: " + r.why);
      return "復帰して " + r.n + " 問できた";
    });
  }

  console.log("\n══ 画面の復旧 ══");

  await step("再読み込みしても「処理中」のまま固まらない", async () => {
    await pg.evaluate(() => {
      /* 実行中の Job が残った状態を作る */
      localStorage.setItem("vq2.activeJob.v1", JSON.stringify({
        jobId: "job_does_not_exist", task: "preset_generation", startedAt: new Date().toISOString() }));
    });
    await pg.reload({ waitUntil: "domcontentloaded" });
    await pg.addStyleTag({ content: HIDE });
    await pg.waitForTimeout(3500);
    const r = await pg.evaluate(async () => {
      const restored = await window.VQ2.ai.restore();
      return { restored: restored, running: window.VQ2.ai.isRunning(),
               job: localStorage.getItem("vq2.activeJob.v1") };
    });
    assert(!r.running, "存在しない Job で実行中になった");
    assert(!r.job, "存在しない Job が残り続けている");
    return "存在しない Job は片づけられる";
  });

  await step("タブを閉じても、下書きは次に開いたとき残っている", async () => {
    const id = await pg.evaluate(() => {
      const S = window.VQ2.schema, ST = window.VQ2.store;
      const p = S.emptyPreset({ name: "閉じても残る下書き" });
      p.questions = [S.emptyQuestion({ prompt: "書きかけの問題" })];
      ST.saveDraft("preset", p.id, p, {});
      return p.id;
    });
    const p2 = await ctx.newPage();
    await login(p2);
    const r = await p2.evaluate((pid) => {
      const d = window.VQ2.store.loadDraft("preset", pid);
      return { found: !!(d && d.payload), name: d && d.payload && d.payload.name };
    }, id);
    await p2.close();
    assert(r.found, "下書きが残っていない");
    return "「" + r.name + "」が残っていた";
  });

  const uiErrors = consoleErrors.filter((e) => !/favicon|net::ERR|Failed to load resource|503|404/i.test(e));
  await step("Console エラー 0 件", async () => {
    assert(uiErrors.length === 0, uiErrors.join(" / "));
    return "0 件";
  });

  const summary = {
    startedAt: started.toISOString(), finishedAt: new Date().toISOString(),
    total: pass + fail, pass, fail,
    bridgeSkipped: SKIP_BRIDGE,
    uiConsoleErrors: uiErrors, pageErrors, results
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));

  console.log(`\n結果: ${pass} / ${pass + fail} 通過` + (fail ? `（失敗 ${fail}）` : ""));
  console.log(`記録: ${OUT}`);

  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
