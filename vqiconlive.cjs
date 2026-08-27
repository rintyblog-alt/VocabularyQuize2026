/* 実際のブラウザで、タブのアイコンとホーム画面用が読めているかを見る（検証版のみ） */
const { chromium } = require("playwright");
const BASE = process.env.VQ_BASE || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
let pass=0, fail=0;
const ok=(n,c,x)=>{c?(pass++,console.log("  ok   "+n)):(fail++,console.log("  NG   "+n+(x!==undefined?"  → "+String(x).slice(0,160):"")));};
(async()=>{
  const b=await chromium.launch({headless:true});
  const pg=await(await b.newContext()).newPage();
  const got=[];
  pg.on("response",(r)=>{ if(/assets\/icon\//.test(r.url())) got.push({u:r.url().split("/").pop().split("?")[0],s:r.status(),t:r.headers()["content-type"]||""}); });
  await pg.goto(BASE+"/?vqdev=1&cb="+Date.now(),{waitUntil:"domcontentloaded",timeout:180000});
  await pg.waitForTimeout(6000);
  const links=await pg.evaluate(()=>Array.from(document.querySelectorAll('link[rel*="icon"]')).map(l=>({rel:l.rel,sizes:l.getAttribute("sizes")||"",href:l.href})));
  ok("タブのアイコンが宣言されている", links.some(l=>/favicon-32\.png/.test(l.href)), JSON.stringify(links.map(l=>l.rel)));
  ok("iPhone 用が宣言されている", links.some(l=>/apple-touch-icon-180\.png/.test(l.href)));
  /* 画面の無いブラウザはタブを描かないので、favicon を自分からは取りに行かない。
     そこで、宣言されている URL を **ページの中から**取りに行って確かめる。
     これで「タブに出る URL が本当に画像を返すか」は同じように確認できる。 */
  const fetched=await pg.evaluate(async(hrefs)=>{
    const out=[];
    for(const h of hrefs){
      try{ const r=await fetch(h,{cache:"no-store"});
        const buf=new Uint8Array(await r.arrayBuffer());
        const png=buf[0]===0x89&&buf[1]===0x50&&buf[2]===0x4e&&buf[3]===0x47;
        out.push({h:h.split("/").pop(),s:r.status,type:r.headers.get("content-type")||"",png});
      }catch(e){ out.push({h:h.split("/").pop(),err:String(e)}); }
    }
    return out;
  }, links.map(l=>l.href));
  ok("★宣言した URL がすべて画像を返す", fetched.length>0 && fetched.every(f=>f.s===200&&f.png), JSON.stringify(fetched));
  const mf=await pg.evaluate(async()=>{const l=document.querySelector('link[rel="manifest"]');if(!l)return null;
    const r=await fetch(l.href);return r.ok?await r.json():null;});
  ok("manifest が読める", !!mf && Array.isArray(mf.icons), mf?"":"読めない");
  ok("manifest のアイコンが 4 枚", mf && mf.icons.length===4, mf?mf.icons.length:"-");
  const theme=await pg.evaluate(()=>{const m=document.querySelector('meta[name="theme-color"]');return m?m.content:"";});
  ok("タブの色がブランドの色", theme.toUpperCase()==="#756DB3", theme);
  console.log("\n合格 "+pass+" / 不合格 "+fail);
  await b.close(); process.exit(fail?1:0);
})();
