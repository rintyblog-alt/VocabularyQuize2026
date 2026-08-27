/* ══════════════════════════════════════════════════════════════════════
   検証用（dev）で、手元のローカルAIが使えるか

   https のページから 127.0.0.1 の Bridge を呼ぶには、**Bridge 側で
   その Origin を許可しておく**必要がある（VQ_BRIDGE_ALLOWED_ORIGINS）。
   許可が無いと、声・聞き取り・AI がまとめて使えなくなる。
   起動スクリプト（local-ai/scripts/start.sh）へ入れてあるので、
   ふつうに起動していれば通る。

   使い方: node vqdev.cjs
   ══════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const BASE = process.env.VQ_BASE || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  NG   " + n + (x ? "  → " + x : ""))); };
(async () => {
  const b = await chromium.launch({ args: ["--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream"] });
  const pg = await (await b.newContext({ permissions: ["microphone"] })).newPage();
  const blocked = [];
  pg.on("console", m => { if (/Mixed Content|private network|blocked by CORS/i.test(m.text())) blocked.push(m.text().slice(0,140)); });
  await pg.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.evaluate(() => { const el=document.getElementById("vqNewAuth"); if(el) el.style.display="none"; });
  await pg.waitForFunction(() => document.getElementById("authLoginSubmitBtn"), { timeout: 40000 });
  await pg.evaluate(() => { const setV=(el,v)=>{const p=el.tagName==="SELECT"?HTMLSelectElement:HTMLInputElement;
    Object.getOwnPropertyDescriptor(p.prototype,"value").set.call(el,v);
    el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));};
    setV(document.getElementById("authLoginGrade"),"H3");setV(document.getElementById("authLoginNickname"),"tester");
    setV(document.getElementById("authLoginPassword"),"Abcd1234");document.getElementById("authLoginSubmitBtn").click();});
  await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 60000 });
  await pg.waitForTimeout(2500);

  const r = await pg.evaluate(async () => {
    const out = { url: location.origin };
    try { out.bridge = await window.__vqLocalAI.discover(); } catch (e) { out.bridgeErr = String(e).slice(0,100); }
    try { const v = await window.VQ2.tts.voices({ start: 1 }); out.voices = (v.voices||[]).length; out.voicesOk = !!v.ok; }
    catch (e) { out.voicesErr = String(e).slice(0,100); }
    try { const t0 = performance.now();
      const m = await window.VQ2.tts.make("This is a test.", { voice: "kokoro:af_heart" });
      out.tts = { ok: !!m.ok, bytes: m.blob ? m.blob.size : 0, ms: Math.round(performance.now()-t0), reason: m.reason };
    } catch (e) { out.tts = { error: String(e).slice(0,100) }; }
    try { const st = await window.VQ2.stt.status();
      out.stt = { running: !!st.running, model: st.model }; } catch (e) { out.stt = { error: String(e).slice(0,80) }; }
    try { out.aiAvailable = !!window.VQ2.ai.available(); } catch (e) { out.aiErr = String(e).slice(0,80); }
    try { const c = await window.VQ2.speakContent.curriculum();
      out.content = { lessons: c.lessons.length, levels: [...new Set(c.lessons.map(l=>l.level))].length };
    } catch (e) { out.content = { error: String(e).slice(0,80) }; }
    try { const j = await (await fetch("/api/push/config")).json();
      out.push = { enabled: !!j.enabled, key: (j.publicKey||"").slice(0,10) }; }
    catch (e) { out.push = { error: String(e).slice(0,80) }; }
    try { const caps = { canPlayAudio: window.VQ2.tts.canMakeAudio(),
                         canRecord: window.VQ2.speak.canRecord(),
                         canTranscribe: (await window.VQ2.stt.status()).running };
      out.speakable = window.VQ2.speakModel.usableActivities(caps).length;
      out.voiceActs = window.VQ2.speakModel.usableActivities(caps)
        .filter(a => (window.VQ2.speakModel.activity(a)||{}).needsVoice).length;
    } catch (e) { out.capsErr = String(e).slice(0,80); }
    return out;
  });

  console.log("\n── 検証用（" + r.url + "）で使えるもの ──");
  ok("ローカルAI（Bridge）に届く", r.bridge === "http://127.0.0.1:17891", r.bridge || r.bridgeErr);
  ok("声の一覧が取れる", r.voicesOk && r.voices > 100, String(r.voices));
  ok("実際に音を作れる", r.tts && r.tts.ok && r.tts.bytes > 1000, JSON.stringify(r.tts));
  ok("聞き取り（STT）が使える", r.stt && r.stt.running, JSON.stringify(r.stt));
  ok("AI が使える", r.aiAvailable, String(r.aiAvailable));
  ok("話す練習が出せる", r.voiceActs >= 3, "声を出す形式 " + r.voiceActs + " 個 / 全 " + r.speakable + " 個");
  ok("英語教材が読める", r.content && r.content.lessons === 19 && r.content.levels === 6, JSON.stringify(r.content));
  ok("通知が使える", r.push && r.push.enabled, JSON.stringify(r.push));
  ok("本番と別の通知鍵になっている", r.push && r.push.key && r.push.key.indexOf("BM7iNBmL") !== 0, r.push && r.push.key);
  ok("止められた通信が無い", blocked.length === 0, blocked.slice(0,2).join(" / "));
  console.log("     音の生成: " + (r.tts && r.tts.bytes) + " バイト / " + (r.tts && r.tts.ms) + " ms");
  await b.close();
  console.log("\n合格 " + pass + " / 不合格 " + fail);
  process.exit(fail ? 1 : 0);
})();
