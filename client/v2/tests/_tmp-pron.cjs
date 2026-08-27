/* Kokoro で作った音を Bridge の STT へ通し、発音採点まで動かす（実測） */
const { chromium } = require("playwright");
const fs = require("fs");
const HIDE = "#vqNewAuth{display:none !important}";
const SP = "/private/tmp/claude-501/-Users-user-Downloads-word-practice-v26-menu-terms-report-emailjs/ea86a79f-1ff2-4347-9303-995fcdd2a12d/scratchpad";

async function say(text) {
  const r = await fetch("http://127.0.0.1:50121/speak", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice: "af_heart", speed: 1 }) });
  return Buffer.from(await r.arrayBuffer());
}
(async () => {
  const b = await chromium.launch();
  const pg = await (await b.newContext()).newPage();
  pg.on("pageerror", e => console.log("PAGEERROR " + e));
  await pg.goto("http://127.0.0.1:8791/?vqdev=1", { waitUntil: "domcontentloaded" });
  await pg.addStyleTag({ content: HIDE });
  await pg.waitForFunction(() => document.getElementById("authLoginSubmitBtn"), { timeout: 20000 });
  await pg.evaluate(() => { const setV=(el,v)=>{const p=el.tagName==="SELECT"?HTMLSelectElement:HTMLInputElement;
    Object.getOwnPropertyDescriptor(p.prototype,"value").set.call(el,v);
    el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));};
    setV(document.getElementById("authLoginGrade"),"H3");setV(document.getElementById("authLoginNickname"),"tester");
    setV(document.getElementById("authLoginPassword"),"Abcd1234");document.getElementById("authLoginSubmitBtn").click();});
  await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 30000 });
  await pg.waitForTimeout(1500);

  const cases = [
    ["I would like a cup of coffee, please.", "I would like a cup of coffee, please.", "そのまま言えた"],
    ["I would like a cup of coffee, please.", "I want coffee.",                        "短く言ってしまった"],
    ["Could you tell me how to get to the station?", "Could you tell me how to get to the stadium?", "1 語だけ違う"],
    ["The train leaves at ten thirty.", "The train leaves at ten thirty.",             "数字を含む"]
  ];
  console.log("目標 → 実際に言ったこと（Kokoro で合成）／採点\n");
  for (const [target, spoken, label] of cases) {
    const wav = await say(spoken);
    fs.writeFileSync(SP + "/p.wav", wav);
    const b64 = wav.toString("base64");
    const r = await pg.evaluate(async ({ b64, target }) => {
      const bin = atob(b64); const u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      const blob = new Blob([u], { type: "audio/wav" });
      const t0 = performance.now();
      const stt = await window.VQ2.stt.transcribe(blob, { kind: "audio/wav" });
      const ms = Math.round(performance.now() - t0);
      const ev = window.VQ2.pronounce.evaluate(target, stt);
      return { ms, stt: { ok: stt.ok, text: stt.text, seconds: stt.audioSeconds, words: (stt.words||[]).length }, ev };
    }, { b64, target });
    console.log("【" + label + "】");
    console.log("  目標: " + target);
    console.log("  認識: " + (r.stt.ok ? r.stt.text : "（失敗）"));
    if (r.ev.scored) {
      console.log("  総合 " + r.ev.overall + " ／ 伝わりやすさ " + r.ev.intelligibility
        + " ・ はっきりさ " + r.ev.clarity + " ・ 流暢さ " + r.ev.fluency
        + "  (" + r.stt.seconds + " 秒 → " + r.ms + " ms)");
      const ng = r.ev.wordResults.filter(w => !w.ok);
      if (ng.length) console.log("  直すところ: " + ng.map(w => w.word + (w.said ? "→" + w.said : "（言えていない）")).join(" / "));
      console.log("  助言: " + r.ev.advice.join(" "));
    } else {
      console.log("  点をつけず: " + r.ev.reason);
    }
    console.log("");
  }
  await b.close();
})();
