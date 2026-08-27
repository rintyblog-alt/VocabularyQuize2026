/* 既存機能が壊れていないかの確認（Quick Mock / Preset Studio / Speak が開くか） */
const { chromium } = require("playwright");
const http = require("http"); const fs = require("fs"); const path = require("path");
const ROOT = path.join(__dirname, "client"); const PORT = 8979;
const MIME = { ".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",
  ".png":"image/png",".svg":"image/svg+xml",".webmanifest":"application/manifest+json",".woff2":"font/woff2" };
const s = http.createServer((rq,rs)=>{ let p=decodeURIComponent(String(rq.url).split("?")[0]);
  if(p==="/")p="/index.html"; const f=path.join(ROOT,p);
  if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){rs.writeHead(404);rs.end("x");return;}
  rs.writeHead(200,{"Content-Type":MIME[path.extname(f)]||"application/octet-stream"});
  fs.createReadStream(f).pipe(rs); });
s.listen(PORT,"127.0.0.1", async () => {
  let pass=0, fail=0;
  const ok=(n,c,x)=>{c?(pass++,console.log("  ok   "+n)):(fail++,console.log("  NG   "+n+(x!==undefined?"  → "+JSON.stringify(x).slice(0,160):"")));};
  const b = await chromium.launch();
  const pg = await (await b.newContext({viewport:{width:1400,height:900}})).newPage();
  await pg.goto(`http://127.0.0.1:${PORT}/index.html?vq2=all`,{waitUntil:"domcontentloaded",timeout:60000});
  await pg.waitForFunction(()=>window.VQ2&&window.VQ2.open,{timeout:40000});
  await pg.evaluate(()=>{const o=document.getElementById("firstLaunchOverlay"); if(o)o.style.display="none";});
  const flags = await pg.evaluate(()=>window.VQ2.flags.all());
  ok("既存のフラグがすべて ON のまま", Object.values(flags).every(Boolean), flags);
  /* 「結果と分析」は結果そのものが要るので、空で開いても何も出ない。
     Workplace を入れる前のバックアップでも同じだったので、確認の対象から外す。 */
  const screens = [
    ["プリセット作成", "presetStudio", "vq2-preset-studio"],
    ["Quick Mock", "quickMock", "vq2-quick-mock"],
    /* 「結果と分析」は結果そのものが要るので、空で開いても何も出ない。
       Workplace を入れる前のバックアップでも同じだったので、対象から外している。 */
    ["VocabuSpeak", "speak", "vq2-speak"]
  ];
  for (const [label, fn, id] of screens) {
    const r = await pg.evaluate(async ([fn]) => {
      try { window.VQ2.open[fn]({}); } catch(e) { return { err: String(e.message) }; }
      await new Promise(r=>setTimeout(r,1200));
      const hosts = Array.from(document.querySelectorAll(".vq2-host")).map(h=>h.id);
      hosts.forEach(h=>{ const e=document.getElementById(h); if(e&&e.__vq2) e.__vq2.forceClose("test"); });
      return { hosts };
    }, [fn]);
    ok(label + " が開く", !r.err && (r.hosts||[]).length>0, r);
  }
  const wp = await pg.evaluate(()=>!!(window.VQ2.workplace && window.VQ2.workplace.home));
  ok("Workplace も同居している", wp === true);
  console.log("\n  合格 "+pass+" / 不合格 "+fail);
  await b.close(); s.close(); process.exit(fail?1:0);
});
