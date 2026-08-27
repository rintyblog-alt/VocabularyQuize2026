/* 「頼んだ問題数」と「実際に返ってくる数」を実測する。

   仮説: JSON Schema の minItems / maxItems が実際には効いておらず、
        少ない方向のずれが直されないまま通っている。

   実行: node vqcountprobe.cjs [回数] [1回あたりの問題数]
*/
const { chromium } = require("playwright");

const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
const RUNS = Number(process.argv[2] || 6);
const WANT = Number(process.argv[3] || 5);

async function login(pg) {
  await pg.goto(BASE + "/?vqdev=1&vq2=all&cb=" + Date.now(), { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.addStyleTag({ content: "#vqNewAuth{display:none !important}" });
  await pg.waitForFunction(() => document.getElementById("authLoginSubmitBtn"), { timeout: 30000 });
  await pg.evaluate((c) => {
    const setV = (el, v) => {
      const P = el.tagName === "SELECT" ? HTMLSelectElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(P.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    setV(document.getElementById("authLoginGrade"), c.grade);
    setV(document.getElementById("authLoginNickname"), c.nick);
    setV(document.getElementById("authLoginPassword"), c.pw);
    document.getElementById("authLoginSubmitBtn").click();
  }, { grade: process.env.VQ_GRADE || "H3", nick: process.env.VQ_NICK || "tester",
       pw: process.env.VQ_PW || "Abcd1234" });
  await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 30000 });
  await pg.waitForTimeout(1200);
}

(async () => {
  const browser = await chromium.launch();
  const pg = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await login(pg);

  console.log(`条件: 1 大問あたり ${WANT} 問を ${RUNS} 回。資料なし・同じ指示文。\n`);
  const results = [];
  for (let i = 1; i <= RUNS; i++) {
    const t0 = Date.now();
    const r = await pg.evaluate(async (want) => {
      const AI = window.VQ2.ai;
      try {
        const res = await AI.generateMock({
          instruction: "中学理科（光合成と呼吸）の問題を作ってください。すべて4択にしてください。",
          attachments: [], sourceOnly: false, allowExternal: true,
          count: want, sectionCount: 1,
          onActivity: () => {}, onWarning: () => {}
        });
        const d = res.structured && (res.structured.sections ? res.structured : (res.structured.data || null));
        const secs = (d && d.sections) || [];
        const n = secs.reduce((a, s) => a + ((s.questions || []).length), 0);
        return { ok: true, got: n, sections: secs.length,
                 perSection: secs.map((s) => (s.questions || []).length),
                 gate: res.qualityGate || null };
      } catch (e) {
        return { ok: false, error: (e && (e.userMessage || e.message)) || String(e) };
      }
    }, WANT);
    const ms = Date.now() - t0;
    results.push(r);
    if (r.ok) {
      const diff = r.got - WANT;
      console.log(`  ${String(i).padStart(2)} 回目: ${String(r.got).padStart(2)} 問`
        + ` （頼んだ ${WANT} 問 / ${diff === 0 ? "一致" : (diff > 0 ? "+" + diff : String(diff))}）`
        + ` 大問 ${r.sections} つ [${r.perSection.join(",")}] ${(ms / 1000).toFixed(1)}秒`
        + (r.gate && r.gate.truncated ? " ※出力上限で途中終了" : ""));
    } else {
      console.log(`  ${String(i).padStart(2)} 回目: 失敗 — ${r.error}`);
    }
  }

  const okRuns = results.filter((r) => r.ok);
  const exact = okRuns.filter((r) => r.got === WANT).length;
  const under = okRuns.filter((r) => r.got < WANT);
  const over = okRuns.filter((r) => r.got > WANT);
  console.log("\n── まとめ ──");
  console.log(`  成功 ${okRuns.length} / ${RUNS} 回`);
  console.log(`  ちょうど ${WANT} 問: ${exact} 回`);
  console.log(`  足りない: ${under.length} 回` + (under.length ? `（${under.map((r) => r.got).join(", ")} 問）` : ""));
  console.log(`  多すぎる: ${over.length} 回` + (over.length ? `（${over.map((r) => r.got).join(", ")} 問）` : ""));
  if (okRuns.length) {
    console.log(`  一致率: ${Math.round(100 * exact / okRuns.length)}%`);
  }
  console.log("\n  ※ 多い方向はクライアントが切って直します。足りない方向は直されません。");

  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
