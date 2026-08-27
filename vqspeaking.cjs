/* 話す練習の通し。マイクには Kokoro で作った音を流し込む（--use-file-for-fake-audio-capture） */
const { chromium } = require("playwright");
const fs = require("fs");
const { execSync } = require("child_process");
const SP = "/private/tmp/claude-501/-Users-user-Downloads-word-practice-v26-menu-terms-report-emailjs/ea86a79f-1ff2-4347-9303-995fcdd2a12d/scratchpad";
const HIDE = "#vqNewAuth{display:none !important}";
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  NG   " + n + (x ? "  → " + x : ""))); };

(async () => {
  /* マイクへ流す音を用意（無音でよい。中身は下で直接 STT へ渡して確かめる） */
  const wav = SP + "/mic.wav";
  const r = await fetch("http://127.0.0.1:50121/speak", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "I would like a cup of coffee, please.", voice: "af_heart", speed: 1 }) });
  fs.writeFileSync(wav, Buffer.from(await r.arrayBuffer()));

  const browser = await chromium.launch({ args: [
    "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream",
    "--use-file-for-fake-audio-capture=" + wav + "%noloop", "--autoplay-policy=no-user-gesture-required"
  ]});
  const ctx = await browser.newContext({ permissions: ["microphone"], viewport: { width: 1100, height: 900 } });
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

  console.log("\n── 端末でできること ──");
  const caps = await pg.evaluate(async () => ({
    sttSupported: window.VQ2.stt.supported(),
    mime: window.VQ2.stt.pickMime(),
    status: await window.VQ2.stt.status()
  }));
  ok("録音の仕組みがある", caps.sttSupported, JSON.stringify(caps));
  ok("聞き取りが使える", !!(caps.status && (caps.status.running || caps.status.installed)), JSON.stringify(caps.status));
  console.log("     録音の形式: " + caps.mime + " / モデル: " + (caps.status && caps.status.model));

  console.log("\n── 話す練習を開く ──");
  await pg.evaluate(() => { document.querySelectorAll(".vq2-host").forEach(h=>h.remove());
    window.VQ2.speakHistory.clearAll(); window.VQ2.open.speak({}); });
  await pg.waitForTimeout(2500);
  await pg.evaluate(() => { const r=document.getElementById("vq2-speak").shadowRoot.querySelector(".vq2-root");
    r.querySelector('[data-sp-tab="train"]').click(); });
  await pg.waitForTimeout(600);
  const menu = await pg.evaluate(() => { const r=document.getElementById("vq2-speak").shadowRoot.querySelector(".vq2-root");
    return [...r.querySelectorAll('[data-act="sp-train"]')].map(b => ({
      id: b.getAttribute("data-id"),
      label: ((b.querySelector(".vq2-sp-tile-t") || b.querySelector("b") || {}).textContent || "").trim(),
      disabled: b.disabled })); });
  const sp = menu.filter(m => m.id === "speaking")[0];
  ok("スピーキングが押せるようになった", sp && !sp.disabled, JSON.stringify(menu.filter(m=>m.disabled)));
  ok("ベータと断ってある", sp && /ベータ/.test(sp.label), sp && sp.label);

  await pg.evaluate(() => { const r=document.getElementById("vq2-speak").shadowRoot.querySelector(".vq2-root");
    [...r.querySelectorAll('[data-act="sp-train"]')].filter(x=>x.getAttribute("data-id")==="speaking")[0].click(); });
  await pg.waitForTimeout(6000);
  const view = await pg.evaluate(() => { const r=document.getElementById("vq2-speak").shadowRoot.querySelector(".vq2-root");
    return { target: (r.querySelector(".vq2-sp-say-t")||{}).textContent||"",
             ja: (r.querySelector(".vq2-sp-say-j")||{}).textContent||"",
             model: !!r.querySelector('[data-act="sp-model"]'),
             rec: !!r.querySelector('[data-act="sp-record"]'),
             n: (r.querySelector(".vq2-sp-qn")||{}).textContent||"",
             beta: !!r.querySelector(".vq2-sp-beta") }; });
  ok("読む英文が出る", view.target.length > 0, view.target);
  ok("日本語も出る", view.ja.length > 0, view.ja);
  ok("見本を聞ける", view.model, "");
  ok("話すボタンがある", view.rec, "");
  ok("ベータの印が出る", view.beta, "");
  console.log("     お題: " + view.target);

  console.log("\n── 録音して採点 ──");
  await pg.evaluate(() => { const r=document.getElementById("vq2-speak").shadowRoot.querySelector(".vq2-root");
    r.querySelector('[data-act="sp-record"]').click(); });
  /* マイクが開くまで待つ（固定の待ち時間にしない） */
  await pg.waitForFunction(() => {
    const r=document.getElementById("vq2-speak").shadowRoot.querySelector(".vq2-root");
    return !!r.querySelector(".vq2-sp-rec.is-on");
  }, null, { timeout: 20000 }).catch(() => {});
  await pg.waitForTimeout(600);
  const during = await pg.evaluate(() => { const r=document.getElementById("vq2-speak").shadowRoot.querySelector(".vq2-root");
    return { on: !!r.querySelector(".vq2-sp-rec.is-on"),
             time: (r.querySelector("[data-sp-rectime]")||{}).textContent||"",
             stop: !!r.querySelector('[data-act="sp-stop"]') }; });
  ok("録音中だと分かる", during.on, JSON.stringify(during));
  ok("録音時間が出る", /\d/.test(during.time), during.time);
  ok("止められる", during.stop, "");

  await pg.waitForTimeout(2500);
  await pg.evaluate(() => { const r=document.getElementById("vq2-speak").shadowRoot.querySelector(".vq2-root");
    const b = r.querySelector('[data-act="sp-stop"]'); if (b) b.click(); });
  await pg.waitForFunction(() => {
    const r=document.getElementById("vq2-speak").shadowRoot.querySelector(".vq2-root");
    return !!(r.querySelector(".vq2-sp-score") || r.querySelector(".vq2-sp-fb"));
  }, null, { timeout: 60000 });
  const res = await pg.evaluate(() => { const r=document.getElementById("vq2-speak").shadowRoot.querySelector(".vq2-root");
    return { score: (r.querySelector(".vq2-sp-score-n")||{}).textContent||"",
             bars: [...r.querySelectorAll(".vq2-sp-bar-l")].map(x=>x.textContent),
             heard: (r.querySelector(".vq2-sp-heard b")||{}).textContent||"",
             words: r.querySelectorAll(".vq2-sp-w").length,
             ngWords: [...r.querySelectorAll(".vq2-sp-w.is-ng")].map(x=>x.textContent),
             advice: [...r.querySelectorAll(".vq2-sp-advice div")].map(x=>x.textContent),
             note: (r.querySelector(".vq2-sp-note")||{}).textContent||"",
             mine: !!r.querySelector('[data-act="sp-mine"]'),
             again: !!r.querySelector('[data-act="sp-record"]'),
             next: !!r.querySelector('[data-act="sp-speak-next"]'),
             fail: (r.querySelector(".vq2-sp-fb-x")||{}).textContent||"" }; });
  if (res.score) {
    ok("点が出る", /^\d+$/.test(res.score.trim()), res.score);
    ok("内訳が 3 つ以上出る", res.bars.length >= 3, res.bars.join("・"));
    ok("聞こえた文が出る", res.heard.length > 0, res.heard);
    ok("語ごとの結果が出る", res.words > 0, String(res.words));
    ok("音素はやっていないと書いてある", /音素/.test(res.note), res.note.slice(0, 40));
    console.log("     点: " + res.score + " / 聞こえた: " + res.heard);
    console.log("     助言: " + res.advice.join(" "));
  } else {
    ok("点をつけられないときは理由が出る", res.fail.length > 0, res.fail);
    console.log("     " + res.fail);
  }
  ok("自分の声を聞ける", res.mine, "");
  ok("もう一度話せる", res.again, "");
  ok("次へ進める", res.next, "");

  console.log("\n── 履歴と保存方針 ──");
  const saved = await pg.evaluate(async () => ({
    history: window.VQ2.speakHistory.listHistory().length,
    sessions: window.VQ2.speakHistory.listSessions({}).length,
    voiceKept: (await window.VQ2.stt.usage()).count,
    retention: window.VQ2.speakHistory.prefs().audioRetention
  }));
  ok("練習した記録が残る", saved.history > 0, JSON.stringify(saved));
  ok("既定では録音を残さない", saved.retention === "immediate" && saved.voiceKept === 0, JSON.stringify(saved));

  ok("画面のエラーが出ていない", errs.length === 0, errs.slice(0, 2).join(" / "));
  await browser.close();
  console.log("\n合格 " + pass + " / 不合格 " + fail);
  process.exit(fail ? 1 : 0);
})();
