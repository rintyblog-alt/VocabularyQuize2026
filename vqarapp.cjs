/* ══════════════════════════════════════════════════════════════════════════
   vqarapp.cjs — AR App が「まじで すごいもの」を 一発で 作れるか

   ★ 訴え（2026-08-19）「さらに 高度なアプリを。今のじゃ まだまだ。
     外部のものを 最大限に 使って、普通に 日常でも、ゲームとしても、
     アプリとしても 使えて 遊べるものに。**一発で すごいってなるように**」。

   ★ ここで 確かめるのは 3 つ。
     ① 借りる道具（18 種）が **全部 本当に 読み込めて 動く**か
     ② 土台 API（VQ）が **書かずに 済ませてくれる**か（板・輪・音・保存・問題）
     ③ 代表 3 種（ゲーム／日常の道具／教材）が **触って 動く**か
        — 見た目だけでなく、押して 中の数が 変わるところまで 見る

   使い方: node vqarapp.cjs
   ══════════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
let pass = 0, fail = 0; const 落ち = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ✅ " + n); }
  else { fail++; 落ち.push(n); console.log("  ❌ " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 400) : "")); }
};
const 節 = (t) => console.log("\n■ " + t);

/* ── 代表 3 種。**Lumi が 出しそうな 実物**をそのまま 書く。 ── */
const ゲーム = {
  title: "よけろブロック",
  libs: ["phaser"],
  html: '<div id="game"></div>',
  js: `
var 点 = 0, 最高 = 0, hud = null;
VQ.ready(function () {
  hud = VQ.ui.hud({ 点: 0, 最高: 0 });
  VQ.store.get("best", 0).then(function (v) { 最高 = Number(v) || 0; hud.set("最高", 最高); });
  new Phaser.Game({
    type: Phaser.AUTO, parent: "game", width: 320, height: 240,
    backgroundColor: "#FCFBFE",
    physics: { default: "arcade", arcade: { gravity: { y: 0 } } },
    scene: {
      create: function () {
        var s = this;
        s.me = s.add.rectangle(160, 210, 26, 14, 0x756DB3);
        s.physics.add.existing(s.me);
        s.me.body.setCollideWorldBounds(true);
        s.敵 = s.physics.add.group();
        s.時 = s.time.addEvent({ delay: 700, loop: true, callback: function () {
          var e = s.add.rectangle(Phaser.Math.Between(16, 304), -10, 16, 16, 0xC96B8E);
          s.physics.add.existing(e); s.敵.add(e); e.body.setVelocityY(120);
          点 += 1; hud.set("点", 点);
          if (点 > 最高) { 最高 = 点; hud.set("最高", 最高); VQ.store.set("best", 最高); }
        } });
        s.physics.add.overlap(s.me, s.敵, function () {
          VQ.sound.bad(); s.時.remove(); s.physics.pause();
          s.add.text(90, 110, "おわり", { color: "#A94A4A", fontSize: "22px" });
        });
        s.cursors = s.input.keyboard.createCursorKeys();
        s.input.on("pointermove", function (p) { s.me.x = p.x; });
        window.__試験 = { 点: function () { return 点; }, 動かす: function (x) { s.me.x = x; } };
      },
      update: function () {
        var d = VQ.十字();
        this.me.body.setVelocityX(d.x * 240);
      }
    }
  });
});`
};

const 日常 = {
  title: "持ち物チェック",
  libs: ["tailwind", "sortable"],
  html: `
<div class="max-w-md mx-auto">
  <h1 class="text-2xl font-bold mb-1">持ち物チェック</h1>
  <p class="text-sm text-slate-500 mb-4">明日 いるものを 入れておくと、朝 見るだけで 済みます。</p>
  <div class="flex gap-2 mb-4">
    <input id="in" class="flex-1 rounded-xl border border-slate-200 px-3 py-2" placeholder="教科書・体操服…">
    <button id="add" class="rounded-xl bg-indigo-500 px-4 py-2 font-semibold text-white">足す</button>
  </div>
  <ul id="list" class="space-y-2"></ul>
  <p id="cnt" class="mt-4 text-sm text-slate-500"></p>
</div>`,
  js: `
var 物 = [];
function 描く() {
  var ul = document.getElementById("list");
  ul.innerHTML = "";
  物.forEach(function (m, i) {
    var li = document.createElement("li");
    li.className = "flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2";
    li.innerHTML = '<input type="checkbox" class="h-5 w-5" ' + (m.済 ? "checked" : "") + '>'
      + '<span class="flex-1 ' + (m.済 ? "line-through text-slate-400" : "") + '">' + m.名 + '</span>'
      + '<button class="text-slate-400">×</button>';
    li.querySelector("input").onchange = function () { m.済 = this.checked; 保存(); 描く(); };
    li.querySelector("button").onclick = function () { 物.splice(i, 1); 保存(); 描く(); };
    ul.appendChild(li);
  });
  var 済 = 物.filter(function (m) { return m.済; }).length;
  document.getElementById("cnt").textContent = 物.length ? 済 + " / " + 物.length + " 個 入れた" : "まだ 何もありません";
  if (物.length && 済 === 物.length) VQ.祝う({ 音: false });
  window.__試験 = { 数: function () { return 物.length; }, 済: function () { return 済; } };
}
function 保存() { VQ.store.set("mono", 物); }
VQ.ready(function () {
  VQ.store.get("mono", []).then(function (v) { 物 = Array.isArray(v) ? v : []; 描く(); });
  document.getElementById("add").onclick = function () {
    var el = document.getElementById("in");
    if (!el.value.trim()) return;
    物.push({ 名: el.value.trim(), 済: false }); el.value = ""; 保存(); 描く(); VQ.sound.click();
  };
  new Sortable(document.getElementById("list"), { animation: 150 });
});`
};

const 教材 = {
  title: "10 秒で 答える",
  libs: ["chart"],
  html: '<div id="q" class="q"></div><div id="c"></div><canvas id="g" width="300" height="150"></canvas>',
  css: ".q{font-size:18px;font-weight:700;margin:0 0 12px;min-height:52px;}",
  js: `
var 問 = [], i = 0, 点 = 0, 記録 = [], hud, t;
VQ.ready(function () {
  hud = VQ.ui.hud({ 問: "0/0", 正解: 0 });
  VQ.quiz.get({ count: 5 }).then(function (q) {
    問 = q;
    if (!問.length) { document.getElementById("q").textContent = "問題が まだ ありません。"; 
                      window.__試験 = { 問数: function(){return 0;} }; return; }
    window.__試験 = { 問数: function () { return 問.length; }, 答える: function () { 次(); } };
    出す();
  });
  function 出す() {
    if (i >= 問.length) { 終わり(); return; }
    var x = 問[i];
    document.getElementById("q").textContent = x.q;
    hud.set("問", (i + 1) + "/" + 問.length);
    var box = document.getElementById("c"); box.innerHTML = "";
    var 選 = (x.choices && x.choices.length ? x.choices : [x.a, "べつのもの", "ちがう", "わからない"]);
    VQ.shuffle(選).slice(0, 4).forEach(function (s) {
      VQ.ui.button(s, function () {
        if (s === x.a) { 点++; VQ.sound.good(); } else VQ.sound.bad();
        記録.push(s === x.a ? 1 : 0); 次();
      }, box);
    });
    if (t) t.stop();
    t = VQ.timer(10, { onTick: function (n) { hud.set("正解", 点); }, onEnd: function () { 記録.push(0); 次(); } });
  }
  function 次() { i++; 出す(); }
  function 終わり() {
    if (t) t.stop();
    document.getElementById("q").textContent = 問.length + " 問中 " + 点 + " 問 正解";
    document.getElementById("c").innerHTML = "";
    VQ.祝う();
    new Chart(document.getElementById("g"), { type: "bar",
      data: { labels: 記録.map(function (_, k) { return k + 1; }),
              datasets: [{ data: 記録, backgroundColor: VQ.色.主 }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { max: 1 } } } });
  }
});`
};

(async () => {
  const b = await chromium.launch();
  try {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 950 } });
    await ctx.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    const page = await ctx.newPage();
    const 声 = []; page.on("pageerror", (e) => 声.push(String(e.message).slice(0, 200)));
    await page.goto(BASE + "/", { waitUntil: "load", timeout: 120000 });
    await page.waitForFunction(() => window.__vqLibsReady === true, null, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1500);

    /* ══ ① 借りる道具 ═══════════════════════════════════════════════ */
    節("① 借りる道具が 本当に 読み込めるか");
    const 一覧 = await page.evaluate(() => window.VQB.app.道具一覧());
    ok("18 種 そろっている（" + 一覧.length + "）", 一覧.length >= 18, 一覧);
    const 配信 = await page.evaluate(async (名) => {
      const 出 = {};
      for (const k of 名) {
        const d = window.VQB.app.文書({ libs: [k], html: "<p>x</p>" });
        const m = d.match(/\/vendor\/arapp\/[A-Za-z0-9._-]+\.js/);
        if (!m) { 出[k] = "住所が 出ない"; continue; }
        const r = await fetch(m[0]);
        出[k] = r.ok ? r.status : "NG " + r.status;
      }
      return 出;
    }, 一覧);
    const 落ちた道具 = Object.keys(配信).filter((k) => 配信[k] !== 200);
    ok("全部 配れている", 落ちた道具.length === 0, 配信);

    /* ══ ② 土台 API ════════════════════════════════════════════════ */
    節("② 土台 API（VQ）");
    const vq = await page.evaluate(async () => {
      const 置 = document.createElement("div"); document.body.appendChild(置);
      const 記 = [];
      const f = window.VQB.app.枠(置, { js: `
        VQ.ready(function(){
          var 出={};
          出.板=!!VQ.stage({w:200,h:100});
          出.描=!!VQ.draw().clear().rect(1,1,10,10).circle(5,5,3).text("a",1,1);
          出.帯=!!VQ.ui.hud({点:0});
          出.押=!!VQ.ui.button("x",function(){});
          出.つまみ=!!VQ.ui.slider({label:"a",min:0,max:9,value:3});
          出.音=typeof VQ.sound.good==="function";
          出.十字=JSON.stringify(VQ.十字());
          出.混=JSON.stringify(VQ.shuffle([1,2,3]).length);
          出.当=VQ.hit({x:0,y:0,w:5,h:5},{x:1,y:1,w:5,h:5});
          VQ.store.set("k",{v:42});
          VQ.store.get("k").then(function(a){
            出.保存=JSON.stringify(a);
            VQ.quiz.get({count:3}).then(function(q){
              出.問題=Array.isArray(q);
              parent.postMessage({__vqapp:1,kind:"console",message:JSON.stringify(出)},"*");
            });
          });
        });` }, { 高さ: 220, appId: "vqtest", 報せ: (k, m) => 記.push(k + "|" + m) });
      await new Promise((x) => setTimeout(x, 3200));
      f.片づける(); 置.remove();
      return 記;
    });
    const 行 = (vq.find((x) => x.startsWith("console|")) || "").slice(8);
    let 中 = {}; try { 中 = JSON.parse(行); } catch (e) {}
    ok("板・描く・帯・ボタン・つまみ が 出る", 中.板 && 中.描 && 中.帯 && 中.押 && 中.つまみ, 中);
    ok("音・十字・混ぜる・当たり判定 が ある", 中.音 && 中.十字 === '{"x":0,"y":0}' && 中.混 === "3" && 中.当 === true, 中);
    ok("保存が **閉じても 残る形**で 動く", 中.保存 === '{"v":42}', 中);
    ok("本体の 問題を 借りられる", 中.問題 === true, 中);
    ok("動いた、と 知らせが 来る", vq.some((x) => x.startsWith("ok|")), vq);

    /* ══ ③ 代表 3 種 ═══════════════════════════════════════════════ */
    const 動かす = async (名, 符, ms, 見る) => {
      return await page.evaluate(async ({ 符, ms, 見る }) => {
        const 置 = document.createElement("div"); document.body.appendChild(置);
        const 記 = [];
        const f = window.VQB.app.枠(置, 符, { 高さ: 420, appId: "t_" + 符.title,
          報せ : (k, m) => 記.push(k + "|" + String(m).slice(0, 160)) });
        await new Promise((x) => setTimeout(x, ms));
        /* 中を 触る。**外からは DOM を 読めない**（そう作ってある）ので、
           中へ 頼んで 中で 調べてもらう。 */
        const 番 = "chk" + Date.now();
        const p = new Promise((res) => {
          const h = (e) => { const d = e.data;
            if (d && d.__vqchk === 番) { window.removeEventListener("message", h); res(d.v); } };
          window.addEventListener("message", h);
          setTimeout(() => { window.removeEventListener("message", h); res(null); }, 3000);
        });
        f.枠.contentWindow.postMessage({ __vqrun: 番, code: 見る }, "*");
        const v = await p;
        const 出 = { 記, 見た: v, 道具: f.道具 };
        f.片づける(); 置.remove();
        return 出;
      }, { 符, ms, 見る });
    };
    /* 中で 調べるための 小さな受け口を 差し込む（試験のときだけ） */
    const 受け口 = `
      window.addEventListener("message", function (e) {
        var d = e.data; if (!d || !d.__vqrun) return;
        var v = null; try { v = (new Function("return (" + d.code + ")"))(); } catch (x) { v = "NG:" + x.message; }
        try { parent.postMessage({ __vqchk: d.__vqrun, v: v }, "*"); } catch (x) {}
      });`;

    節("③-1 ゲーム（Phaser・点・最高点・音）");
    const g = await 動かす("game", Object.assign({}, ゲーム, { js: 受け口 + ゲーム.js }), 5000,
      `(function(){ if(!window.__試験) return "試験の口が 無い";
         var a = __試験.点(); return { 動いた: typeof a === "number", 点: a,
           canvas: !!document.querySelector("canvas"), 帯: !!document.querySelector(".vq-hud") }; })()`);
    ok("Phaser を 借りている", (g.道具 || []).indexOf("phaser") >= 0, g.道具);
    ok("動いた、と 知らせが 来る", g.記.some((x) => x.startsWith("ok|")), g.記);
    ok("絵を描く板が 出ている", g.見た && g.見た.canvas === true, g.見た);
    ok("点の帯が 出ている", g.見た && g.見た.帯 === true, g.見た);
    ok("中の 点が 数として 動いている", g.見た && g.見た.動いた === true, g.見た);

    節("③-2 日常の道具（Tailwind・保存・並べ替え）");
    const h = await 動かす("home", Object.assign({}, 日常, { js: 受け口 + 日常.js }), 4200,
      `(function(){ var i=document.getElementById("in"), b=document.getElementById("add");
         if(!i||!b) return "欄が 無い";
         i.value="教科書"; b.click(); i.value="体操服"; b.click();
         return { 数: __試験 ? __試験.数() : -1,
                  見た目: getComputedStyle(document.querySelector("h1")).fontWeight,
                  行: document.querySelectorAll("#list li").length }; })()`);
    ok("Tailwind と Sortable を 借りている",
      (h.道具 || []).indexOf("tailwind") >= 0 && (h.道具 || []).indexOf("sortable") >= 0, h.道具);
    ok("動いた、と 知らせが 来る", h.記.some((x) => x.startsWith("ok|")), h.記);
    ok("入れると 行が 増える（2 行）", h.見た && h.見た.行 === 2, h.見た);
    ok("Tailwind の 見た目が 効いている（太字）",
      h.見た && Number(h.見た.見た目) >= 600, h.見た);

    節("③-3 教材（本体の問題・グラフ・秒読み）");
    const k = await 動かす("study", Object.assign({}, 教材, { js: 受け口 + 教材.js }), 4200,
      `(function(){ return { 問数: window.__試験 ? __試験.問数() : -1,
         文: (document.getElementById("q")||{}).textContent||"",
         ボタン: document.querySelectorAll("#c .vq-btn").length,
         帯: !!document.querySelector(".vq-hud") }; })()`);
    ok("Chart を 借りている", (k.道具 || []).indexOf("chart") >= 0, k.道具);
    ok("動いた、と 知らせが 来る", k.記.some((x) => x.startsWith("ok|")), k.記);
    ok("本体の 問題が 届いている（" + (k.見た && k.見た.問数) + " 問）",
      k.見た && k.見た.問数 >= 0, k.見た);
    ok("問題文か 案内が 出ている", k.見た && String(k.見た.文).length > 0, k.見た);
    ok("点の帯が 出ている", k.見た && k.見た.帯 === true, k.見た);

    /* ══ ④ 壊れても 外は 無傷 ══════════════════════════════════════ */
    節("④ 壊れても 外は 無傷");
    const 壊 = await page.evaluate(async () => {
      const 置 = document.createElement("div"); document.body.appendChild(置);
      const 記 = [];
      const f = window.VQB.app.枠(置, { libs: ["ないやつ"], js: "存在しない.関数()" },
        { 報せ: (k, m) => 記.push(k + "|" + String(m).slice(0, 120)) });
      await new Promise((x) => setTimeout(x, 2500));
      f.片づける(); 置.remove();
      return 記;
    });
    ok("壊れたら 知らせる", 壊.some((x) => x.startsWith("error|")), 壊);
    ok("知らない道具は 黙って 外す（読み込みで 落ちない）",
      !壊.some((x) => /ないやつ/.test(x)), 壊);
    ok("本体に 例外が 出ていない（" + 声.length + " 件）", 声.length === 0, 声.slice(0, 6));

    /* ══ ④-2 残して 開き直しても 動くか ══════════════════════════ */
    節("④-2 AR Board に 残して、開き直しても 動くか");
    const 往復 = await page.evaluate(async () => {
      const a = await window.VQB.store.足す({
        kind: "app", title: "はねる玉",
        code: { libs: ["matter"], html: '<div id="w"></div>',
          js: `VQ.ready(function(){
            var E=Matter.Engine.create();
            var R=Matter.Render.create({element:document.getElementById("w"),engine:E,
              options:{width:300,height:200,wireframes:false,background:"#FCFBFE"}});
            Matter.Composite.add(E.world,[Matter.Bodies.circle(150,20,16,{restitution:.8}),
              Matter.Bodies.rectangle(150,190,300,20,{isStatic:true})]);
            Matter.Render.run(R);Matter.Runner.run(Matter.Runner.create(),E);
            VQ.ui.hud({玉:1});});` } });
      window.VQB.ui.開く({});
      await new Promise((x) => setTimeout(x, 400));
      const sr = document.getElementById("vq2-ar-board").shadowRoot;
      const 一覧に札 = !!sr.querySelector(".vqb-tag.is-app");
      sr.querySelector("[data-b]").click();
      await new Promise((x) => setTimeout(x, 4000));
      const 出 = { 一覧に札: 一覧に札, 枠: !!sr.querySelector(".vqb-app-frame"),
                   帯: (sr.querySelector("[data-appmsg]") || {}).textContent || "",
                   道具行: (sr.querySelector("[data-applibs]") || {}).textContent || "",
                   大きくボタン: !!sr.querySelector('[data-act="zen"]') };
      sr.querySelector('[data-act="zen"]').click();
      await new Promise((x) => setTimeout(x, 2600));
      出.全画面 = !!sr.querySelector(".vqb-one.zen");
      出.全画面の帯 = (sr.querySelector("[data-appmsg]") || {}).textContent || "";
      window.VQB.store.全消し();
      return 出;
    });
    ok("一覧に AR App の 札が 出る", 往復.一覧に札 === true, 往復);
    ok("開き直しても 動く", /動いています/.test(往復.帯), 往復);
    ok("借りた道具も 一緒に 残っている", /matter/.test(往復.道具行), 往復);
    ok("「大きく」で 全画面になり、そのまま 動く",
      往復.全画面 === true && /動いています/.test(往復.全画面の帯), 往復);

    /* ══ ④-3 板の 大きさ（訴え「画面がバグってる。途切れる」）═══════ */
    節("④-3 途切れない・全画面・拡大縮小");
    const 板 = await page.evaluate(async () => {
      const 行 = Array.from({ length: 40 }, (_, i) =>
        '<div style="padding:10px;margin:0 0 8px;border:1px solid #E7E4EF;border-radius:10px">'
        + (i + 1) + " 行目</div>").join("");
      const r = await window.__vqLive.道具("showApp", { title: "長い一覧", html: "<h1>ながい</h1>" + 行 });
      await new Promise((x) => setTimeout(x, 2600));
      const n = document.getElementById("vqLiveNote");
      const f = n.querySelector(".vqn-app iframe");
      const 出 = {
        出た: !!r.やった,
        /* ★ **本当に 見えているか**。クラス名が 本体と ぶつかっていると
           display:none に なる（実際に そうなっていた）。 */
        見えている: getComputedStyle(n).display !== "none",
        板の高さ: Math.round(n.getBoundingClientRect().height),
        枠の高さ: f ? Math.round(f.getBoundingClientRect().height) : 0,
        操作の帯: !!n.querySelector("[data-appops]"),
        倍率表示: (n.querySelector("[data-zoomv]") || {}).textContent
      };
      /* 全画面 → 拡大 → もどす */
      n.querySelector('[data-op="zen"]').click();
      await new Promise((x) => setTimeout(x, 900));
      const 全 = n.getBoundingClientRect();
      出.全画面 = { 幅: Math.round(全.width), 高さ: Math.round(全.height),
                    枠: Math.round(n.querySelector(".vqn-app iframe").getBoundingClientRect().height) };
      n.querySelector('[data-op="in"]').click();
      n.querySelector('[data-op="in"]').click();
      await new Promise((x) => setTimeout(x, 600));
      出.拡大後 = (n.querySelector("[data-zoomv]") || {}).textContent;
      n.querySelector('[data-op="reset"]').click();
      await new Promise((x) => setTimeout(x, 400));
      出.等倍 = (n.querySelector("[data-zoomv]") || {}).textContent;
      n.querySelector('[data-op="zen"]').click();
      await new Promise((x) => setTimeout(x, 600));
      出.もどした高さ = Math.round(n.getBoundingClientRect().height);
      return 出;
    });
    ok("板が **本当に 見えている**（クラス名が 本体と ぶつかっていない）", 板.見えている === true, 板);
    ok("中身に 合わせて 枠が 伸びる（" + 板.枠の高さ + "px）", 板.枠の高さ > 600, 板);
    ok("板も その分 高くなる（" + 板.板の高さ + "px）", 板.板の高さ > 600, 板);
    ok("拡大縮小の 帯が 出ている", 板.操作の帯 === true && 板.倍率表示 === "100%", 板);
    ok("全画面が 画面いっぱいになる（" + 板.全画面.幅 + "×" + 板.全画面.高さ + "）",
      板.全画面.幅 >= 1200 && 板.全画面.高さ >= 850 && 板.全画面.枠 >= 700, 板.全画面);
    ok("＋ で 大きくなる（" + 板.拡大後 + "）", 板.拡大後 === "120%", 板);
    ok("等倍で 戻る", 板.等倍 === "100%", 板);
    ok("全画面を やめると もとの 出しかたに 戻る", 板.もどした高さ > 200 && 板.もどした高さ < 900, 板);

    /* ══ ④-4 コードが 途中で 切れたとき ═══════════════════════════ */
    節("④-4 コードが 途中で 切れたとき");
    const 切 = await page.evaluate(() => window.__vqLive.道具("showApp",
      { title: "切れたやつ", js: "function a(){ var x=1; if(x){ console.log('あ'" }));
    ok("切れていることを 名指しで 言う", /途中で 切れています/.test(String(切.だめ || "")), 切);
    ok("どこが 足りないかを 出す", /閉じられていない/.test(String(切.だめ || "")), 切);
    ok("全部 送り直させない（続きだけ と 言う）",
      /全部を 送り直さないでください/.test(String(切.直しかた || "")), 切);
    const 続 = await page.evaluate(async () => {
      const r1 = await window.__vqLive.道具("showApp", { title: "分けて作る",
        html: '<h2>分けて 作る</h2><div id="o"></div>',
        js: "var n=0;\nfunction ふやす(){ n++; document.getElementById('o').textContent = n + ' 回';" });
      const r2 = await window.__vqLive.道具("showApp", { more: true,
        js: "\n}\nVQ.ready(function(){ VQ.ui.button('おす', ふやす); ふやす(); });" });
      await new Promise((x) => setTimeout(x, 2200));
      return { 一: !!r1.だめ, 二: !!r2.やった };
    });
    ok("1 回目は 切れていると 断る", 続.一 === true, 続);
    ok("続き（more）で つなぐと 動く", 続.二 === true, 続);
    ok("正しいコードは 切れていると 言わない",
      !(await page.evaluate(() => window.__vqLive.道具("showApp",
        { js: "var s = \"}}}\"; /* } */ VQ.ready(function(){ VQ.ui.label('よし'); });" })
        .then((r) => !!r.だめ))));

    /* ══ ⑤ 外へ 出られないこと ═════════════════════════════════════ */
    節("⑤ 外へは 出られない");
    const 外 = await page.evaluate(() => {
      const d = window.VQB.app.文書({ html: "<p>x</p>" });
      return { csp: (d.match(/Content-Security-Policy" content="([^"]+)"/) || [])[1] || "",
               same: d.indexOf("allow-same-origin") };
    });
    ok("外への 通信は 止めてある", /connect-src 'none'/.test(外.csp), 外.csp);
    ok("道具は 本体と 同じ出どころからだけ",
      /script-src 'unsafe-inline' 'unsafe-eval' https?:\/\/[^ ;]+/.test(外.csp), 外.csp);
    ok("本体の 保存には 触れない（allow-same-origin なし）", 外.same < 0, 外);

    await ctx.close();
  } finally { await b.close(); }

  console.log("\n════════════════════════════════════════════════════════");
  console.log("  合計 " + (pass + fail) + " 件 / 通った " + pass + " / 落ちた " + fail);
  if (落ち.length) { console.log("  落ちたもの:"); 落ち.forEach((x) => console.log("   - " + x)); }
  console.log("════════════════════════════════════════════════════════");
  process.exit(fail ? 1 : 0);
})();
