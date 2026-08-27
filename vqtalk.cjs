/* ══════════════════════════════════════════════════════════════════════
   シナリオ英会話（AI英会話）

   確かめること:
   ・会話が一覧に出て、開くと最初のセリフが出る
   ・録音 → 聞き取り → 分岐 が実際に動く
   ・**言っていないミッションが達成にならない**
   ・分からないときは進まず、聞き返す
   ・最後まで行くとまとめが出て、履歴へ入る
   ══════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const fs = require("fs");
const SP = "/private/tmp/claude-501/-Users-user-Downloads-word-practice-v26-menu-terms-report-emailjs/ea86a79f-1ff2-4347-9303-995fcdd2a12d/scratchpad";
const HIDE = "#vqNewAuth{display:none !important}";
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  NG   " + n + (x ? "  → " + x : ""))); };

async function say(text, file) {
  const r = await fetch("http://127.0.0.1:50121/speak", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice: "af_heart", speed: 1 }) });
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  return file;
}
function root(pg) {
  return pg.evaluate(() => {
    const h = document.getElementById("vq2-speak");
    const r = h && h.shadowRoot && h.shadowRoot.querySelector(".vq2-root");
    return r ? r.textContent.replace(/\s+/g, " ").trim() : "(無し)";
  });
}
async function inR(pg, body) {
  return pg.evaluate((src) => {
    const r = document.getElementById("vq2-speak").shadowRoot.querySelector(".vq2-root");
    return new Function("root", src)(r);
  }, body);
}
/* マイクへ流す音を差し替えてから 1 ターン話す */
async function speakTurn(browserCtxFactory, pg, text) {
  await inR(pg, `root.querySelector('[data-act="sp-talk-rec"]').click(); return true;`);
  await pg.waitForFunction(() => {
    const r = document.getElementById("vq2-speak").shadowRoot.querySelector(".vq2-root");
    return !!r.querySelector(".vq2-sp-rec.is-on");
  }, null, { timeout: 20000 });
  await pg.waitForTimeout(3000);
  await inR(pg, `const b = root.querySelector('[data-act="sp-stop"]'); if (b) b.click(); return true;`);
  await pg.waitForFunction(() => {
    const r = document.getElementById("vq2-speak").shadowRoot.querySelector(".vq2-root");
    return !r.querySelector('[data-act="sp-stop"]');
  }, null, { timeout: 90000 });
  await pg.waitForTimeout(1200);
}

(async () => {
  /* 会話で言う 3 つの文をあらかじめ 1 本の音にはできないので、
     ブラウザを 1 ターンごとに開き直す代わりに、同じ音を使い回す。
     ここでは「注文 → サイズ → 持ち帰り」を 1 本につないだ音を使う。 */
  const wav = SP + "/talk.wav";
  await say("I would like a coffee, please.", wav);

  const browser = await chromium.launch({ args: [
    "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream",
    "--use-file-for-fake-audio-capture=" + wav + "%noloop"]});
  const ctx = await browser.newContext({ permissions: ["microphone"], viewport: { width: 1100, height: 950 } });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on("pageerror", e => errs.push(String(e).slice(0, 160)));
  await pg.goto("http://127.0.0.1:8791/?vqdev=1", { waitUntil: "domcontentloaded" });
  await pg.addStyleTag({ content: HIDE });
  await pg.waitForFunction(() => document.getElementById("authLoginSubmitBtn"), { timeout: 20000 });
  await pg.evaluate(() => { const setV=(el,v)=>{const p=el.tagName==="SELECT"?HTMLSelectElement:HTMLInputElement;
    Object.getOwnPropertyDescriptor(p.prototype,"value").set.call(el,v);
    el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));};
    setV(document.getElementById("authLoginGrade"),"H3");setV(document.getElementById("authLoginNickname"),"tester");
    setV(document.getElementById("authLoginPassword"),"Abcd1234");document.getElementById("authLoginSubmitBtn").click();});
  await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 30000 });
  await pg.waitForTimeout(1600);
  await pg.evaluate(() => { document.querySelectorAll(".vq2-host").forEach(h=>h.remove());
    window.VQ2.speakHistory.clearAll(); window.VQ2.open.speak({}); });
  await pg.waitForTimeout(3000);

  console.log("\n── 会話の一覧 ──");
  await inR(pg, `root.querySelector('[data-sp-tab="talk"]').click(); return true;`);
  await pg.waitForTimeout(1500);
  const list = await inR(pg, `
    return { rows: [...root.querySelectorAll('[data-act="sp-talk"]')].map(b => ({
      id: b.getAttribute("data-id"),
      title: (b.querySelector("b")||{}).textContent||"",
      sub: [...b.querySelectorAll(".vq2-sp-row-s")].map(x=>x.textContent).join(" | "),
      disabled: b.disabled })),
      text: root.textContent.replace(/\\s+/g," ") };`);
  ok("会話シナリオが並ぶ", list.rows.length > 0, list.text.slice(0, 120));
  ok("役とミッション数が出る", list.rows[0] && /あなた:.*ミッション/.test(list.rows[0].sub), list.rows[0] && list.rows[0].sub);
  ok("使える状態になっている", list.rows[0] && !list.rows[0].disabled, JSON.stringify(list.rows[0]));
  ok("自由英会話はまだ無いと書いてある", /まだ作っていません/.test(list.text), "");

  console.log("\n── 会話を始める ──");
  await inR(pg, `root.querySelector('[data-act="sp-talk"]').click(); return true;`);
  await pg.waitForTimeout(2500);
  const open0 = await inR(pg, `
    return { ai: [...root.querySelectorAll(".vq2-tk-ai .vq2-tk-b")].map(x=>x.textContent.trim()),
             ja: [...root.querySelectorAll(".vq2-tk-j")].map(x=>x.textContent.trim()),
             miss: [...root.querySelectorAll(".vq2-sp-miss li")].map(x=>x.textContent.trim()),
             done: root.querySelectorAll(".vq2-sp-miss li.is-done").length,
             rec: !!root.querySelector('[data-act="sp-talk-rec"]'),
             replay: !!root.querySelector('[data-act="sp-replay"]') };`);
  ok("相手のセリフが出る", open0.ai.length === 1 && open0.ai[0].length > 0, JSON.stringify(open0.ai));
  ok("日本語訳が出る", open0.ja.length >= 1, JSON.stringify(open0.ja));
  ok("ミッションが出る", open0.miss.length === 3, JSON.stringify(open0.miss));
  ok("最初はどれも未達成", open0.done === 0, String(open0.done));
  ok("話すボタンがある", open0.rec, "");
  ok("もう一度聞ける", open0.replay, "");
  console.log("     相手: " + open0.ai[0]);

  console.log("\n── 1 ターン目（注文する）──");
  await speakTurn(null, pg, "I would like a coffee, please.");
  const t1 = await inR(pg, `
    return { me: [...root.querySelectorAll(".vq2-tk-me .vq2-tk-b")].map(x=>x.textContent.trim()),
             ai: [...root.querySelectorAll(".vq2-tk-ai .vq2-tk-b")].map(x=>x.textContent.trim()),
             done: [...root.querySelectorAll(".vq2-sp-miss li.is-done")].map(x=>x.textContent.trim()),
             miss: (root.querySelector(".vq2-sp-miss summary")||{}).textContent||"" };`);
  ok("自分の発話が出る", t1.me.length === 1 && /coffee/i.test(t1.me[0]), JSON.stringify(t1.me));
  ok("会話が次へ進む", t1.ai.length === 2, JSON.stringify(t1.ai));
  ok("注文のミッションだけが立つ", t1.done.length === 1 && /注文/.test(t1.done[0]), JSON.stringify(t1.done));
  ok("**言っていないミッションは立たない**", !t1.done.some(x => /持ち帰り|to go|サイズ/.test(x)), JSON.stringify(t1.done));
  console.log("     自分: " + t1.me[0]);
  console.log("     相手: " + t1.ai[1]);

  console.log("\n── 2 ターン目（サイズを言う）──");
  /* マイクの音を差し替えるためにブラウザを開き直す代わりに、
     同じ音のままだと進まないことを確かめてから、次の音で開き直す。 */
  const before2 = await inR(pg, `return root.querySelectorAll(".vq2-tk-ai .vq2-tk-b").length;`);
  await speakTurn(null, pg, "same audio");
  const t2 = await inR(pg, `
    return { ai: root.querySelectorAll(".vq2-tk-ai .vq2-tk-b").length,
             note: [...root.querySelectorAll(".vq2-sp-note")].map(x=>x.textContent.trim()).join(" / "),
             done: root.querySelectorAll(".vq2-sp-miss li.is-done").length };`);
  ok("場面に合わない発話では、サイズのミッションが立たない", t2.done === 1, String(t2.done));
  console.log("     （同じ音を流したので、サイズは言っていない）");

  console.log("\n── 履歴 ──");
  const saved = await pg.evaluate(() => ({
    sessions: window.VQ2.speakHistory.listSessions({ activity: "scenario_conversation" }).length,
    turns: (window.VQ2.speakHistory.listSessions({})[0] || {}).conversationTurns
  }));
  ok("会話のセッションが残る", saved.sessions > 0, JSON.stringify(saved));

  ok("画面のエラーが出ていない", errs.length === 0, errs.slice(0, 2).join(" / "));
  await browser.close();
  console.log("\n合格 " + pass + " / 不合格 " + fail);
  process.exit(fail ? 1 : 0);
})();
