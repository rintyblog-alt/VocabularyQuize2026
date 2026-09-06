/* 3 枚 開いて 3 分 放っておき、裏の 定期通信を 数える。 */
const { chromium } = require("playwright");
const 待=m=>new Promise(s=>setTimeout(s,m));
const 道=/\/api\/(call\/state|dm\/sync|flags\/effective|notif|call\/ticket)/;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext();
  let n = 0; const 内訳 = {};
  const 開く = async () => {
    const pg = await ctx.newPage();
    pg.on("request", r => { const m = r.url().match(道); if (m) { n++; 内訳[m[1]] = (内訳[m[1]]||0)+1; } });
    await pg.goto("http://127.0.0.1:8791/index.html", { waitUntil: "domcontentloaded" });
    await pg.waitForFunction(()=>!!window.__vqQuiet, null, {timeout:30000});
    /* 人が 触って いる ことに する（休みに 入らせない）*/
    await pg.evaluate(()=>{ setInterval(()=>window.__vqQuiet.__触った(), 5000); });
    return pg;
  };
  const a = await 開く(), b2 = await 開く(), c = await 開く();
  console.log("3 枚 開いた。3 分 測ります…");
  await 待(180000);
  console.log("3 分・3 枚 合計:", n, "回  内訳:", JSON.stringify(内訳));
  console.log("→ 1 枚 1 時間あたり:", Math.round(n/3*20), "回   3 枚 1 日:", (n*20*24).toLocaleString(), "回");
  await b.close();
})();
