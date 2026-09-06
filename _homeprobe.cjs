"use strict";
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const pg = await (await b.newContext({ viewport: { width: Number(process.env.W||1200), height: 900 } })).newPage();
  const ex = []; pg.on("pageerror", e => ex.push(String(e.message).slice(0,160)));
  await pg.route("**/api/news/list*", async r => {
    await r.fulfill({ status:200, contentType:"application/json", body: JSON.stringify({ items: [1,2,3,4,5,6].map(i=>({
      id:"n"+i, title:"お知らせ "+i+" のみだし", body:"<p>本文 "+i+"</p>", category: i%2?"更新":"メンテ",
      publishedAt: Date.now()-i*86400000, read: i>2 })), unread: 2 }) });
  });
  await pg.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(()=>document.querySelector("#vqScreens")||document.querySelector("[data-vqs]"), null, {timeout:30000}).catch(()=>{});
  await pg.waitForTimeout(4000);
  const r = await pg.evaluate(() => {
    const hosts = Array.prototype.filter.call(document.querySelectorAll("*"), n => n.shadowRoot && n.shadowRoot.querySelector("[data-home-rec]"));
    if (!hosts.length) return { なし: true, host: Array.prototype.filter.call(document.querySelectorAll("*"), n=>n.shadowRoot).map(n=>n.id||n.tagName).slice(0,8) };
    const sr = hosts[0].shadowRoot;
    const rec = sr.querySelector("[data-home-rec]"), nw = sr.querySelector("[data-home-news]");
    return {
      おすすめ: rec ? rec.children.length : -1,
      おすすめ中: rec ? rec.innerHTML.slice(0,80) : "",
      ニュース: nw ? nw.children.length : -1,
      ニュース中: nw ? nw.innerHTML.slice(0,100) : "",
      矢印: sr.querySelectorAll(".railb").length,
      巻ける: rec ? (rec.scrollWidth - rec.clientWidth) : -1
    };
  });
  console.log(JSON.stringify(r, null, 1));
  console.log("例外:", JSON.stringify(ex));
  await b.close();
})();
