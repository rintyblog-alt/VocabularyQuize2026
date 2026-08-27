/* ══════════════════════════════════════════════════════════════════════════
   vqfeednews.cjs — Feed の 公式マークと お知らせ、設定の 見やすさを
                    本物の Chromium で 確かめる（2026-08-20）

   訴え:
     ・「rinty_0401 には プロフィールに 公式マークを。名前の 左に つけて」
     ・「News が 更新された場合に マークダウンありで feed に 投稿される。
        あらかじめ SVG を 用意しておいて…メッセージ本文の 下に その SVG を」
     ・「設定の 見やすさ・ストレージの アイコンが 英語向きだし」

   ★ お知らせの 投稿は **先に node vqofficial.cjs** が 作る。
     見つからないときは、そう言って 止まる（黙って 通さない）。

   本番では 走らせない。
   ══════════════════════════════════════════════════════════════════════════ */
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const { chromium } = require("playwright");

let 済 = 0, 落 = 0; const 印 = []; const 落ち = [];
function ok(名, 真, 補) {
  if (真) { 済++; 印.push("  ✅ " + 名 + (補 === undefined ? "" : "  " + 短(補))); }
  else { 落++; 落ち.push(名); 印.push("  ❌ " + 名 + (補 === undefined ? "" : "  " + 短(補))); }
}
function 短(v) { const s = typeof v === "string" ? v : JSON.stringify(v); return String(s).slice(0, 170); }
function 節(t) { 印.push("\n── " + t + " " + "─".repeat(Math.max(0, 54 - t.length))); }

async function req(path, { method = "GET", body, token } = {}) {
  const h = { "content-type": "application/json" };
  if (token) h.authorization = "Bearer " + token;
  const r = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, j: await r.json().catch(() => ({})) };
}
async function 作る(名) {
  const tag = `fn${Date.now().toString(36)}`;
  const s = await req("/api/auth/register/start", { method: "POST",
    body: { email: `vqfn.${tag}@gmail.com`, gradePrefix: "H2", nickname: 名 + tag, password: "Testing!2345" } });
  if (!s.j.devCode) throw new Error("devCode が返りません: " + JSON.stringify(s.j).slice(0, 160));
  const v = await req("/api/auth/register/verify", { method: "POST", body: { challengeId: s.j.challengeId, code: s.j.devCode } });
  const c = await req("/api/auth/register/consent", { method: "POST",
    body: { registrationSession: v.j.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: "482913" } });
  const me = await req("/api/auth/me", { token: c.j.token });
  return { token: c.j.token, uid: Number(me.j?.user?.id || me.j?.id || 0), nickname: 名 + tag };
}
function 明るさ(c) {
  const m = /rgba?\(([^)]+)\)/.exec(String(c || ""));
  if (!m) return -1;
  const [r, g, b] = m[1].split(",").map((x) => Number(x.trim()));
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function 比(a, b) {
  const x = 明るさ(a), y = 明るさ(b);
  if (x < 0 || y < 0) return 0;
  const h = Math.max(x, y), l = Math.min(x, y);
  return (h + 0.05) / (l + 0.05);
}

(async () => {
  const U = await 作る("fnu");
  const f0 = await req("/api/posts/feed?limit=30", { token: U.token });
  /* ★ お知らせは いくつも 並ぶ。**見出しや 箇条書きの 入ったもの**を 選ぶ
     （ほかの 検証が 作った お知らせを 拾うと、形の 検査が 落ちる。実測）。 */
  const 全部 = (f0.j.posts || []).filter((x) => x.cardType === "news");
  const お知らせ = 全部.filter((x) => /^#\s/m.test(String(x.body || ""))
    && /\*\*/.test(String(x.body || "")) && /^-\s/m.test(String(x.body || "")))[0] || 全部[0];
  if (!お知らせ) {
    console.error("お知らせの 投稿が ありません。先に  node vqofficial.cjs  を 走らせてください。");
    process.exit(2);
  }

  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const 画面の失敗 = [];
  p.on("pageerror", (e) => 画面の失敗.push(String(e.message).slice(0, 160)));
  await p.addInitScript(([t]) => { try { localStorage.setItem("app.auth.token.v1", t); } catch (e) {} }, [U.token]);
  await p.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await p.waitForFunction(() => !!window.VQART && !!window.VQBADGE, null, { timeout: 30000 }).catch(() => {});

  節("① 部品が 届いている");
  ok("公式マークの 部品（VQBADGE）が ある", await p.evaluate(() => !!(window.VQBADGE && window.VQBADGE.印)));
  ok("お知らせの 絵（VQART）が ある", await p.evaluate(() => !!(window.VQART && window.VQART.作る)));
  ok("絵は 48 種", await p.evaluate(() => window.VQART.かず()) === 48, await p.evaluate(() => window.VQART.かず()));
  ok("マークダウンの 部品（VQMD）が ある", await p.evaluate(() => !!(window.VQMD && window.VQMD.render)));

  節("② Feed を 開く");
  /* ★ 本体が 立ち上がりきる前に タブを 変えると、Feed は 描かれるのに
     **幅 0 のまま**に なる（実測: .wrap が 0px）。
     「並んだ」だけでなく **本当に 場所を 取っている**ことを 待つ。 */
  await p.waitForTimeout(3500);
  await p.evaluate(() => { document.body.setAttribute("data-app-tab", "inbox"); });
  await p.waitForFunction(() => {
    const h = document.getElementById("vqFeed");
    if (!h || !h.shadowRoot) return false;
    const w = h.shadowRoot.querySelector(".wrap");
    return !!(w && w.getBoundingClientRect().width > 200 && h.shadowRoot.querySelector(".post"));
  }, null, { timeout: 40000 }).catch(() => {});
  const 出た = await p.evaluate(() => {
    const h = document.getElementById("vqFeed");
    if (!h || !h.shadowRoot) return { なし: true };
    const w = h.shadowRoot.querySelector(".wrap");
    return { 数: h.shadowRoot.querySelectorAll(".post").length, 幅: w ? Math.round(w.getBoundingClientRect().width) : 0 };
  });
  ok("Feed に 投稿が 出る", (出た.数 || 0) > 0, 出た);
  ok("Feed が 本当に 場所を 取っている（幅 0 で 通さない）", (出た.幅 || 0) > 200, 出た);
  /* 出たては 演出（fadein）の 途中。落ち着くまで 待つ。 */
  await p.waitForTimeout(900);

  節("③ お知らせの 見た目");
  const 中 = await p.evaluate(([pid]) => {
    const r = document.getElementById("vqFeed").shadowRoot;
    const el = r.querySelector('[data-post="' + pid + '"]');
    if (!el) return { なし: true, 全: Array.from(r.querySelectorAll(".post")).map((x) => x.dataset.post) };
    const md = el.querySelector(".txt.vqmd");
    const art = el.querySelector(".news-art svg");
    const box = art ? art.getBoundingClientRect() : null;
    const 本文 = el.querySelector(".txt");
    const 名 = el.querySelector(".name");
    const 印 = 名 ? 名.querySelector("svg.vqbadge") : null;
    return {
      ある: true,
      マークダウン: !!md,
      見出し: !!(md && md.querySelector("h1,h2,h3")),
      太字: !!(md && md.querySelector("strong")),
      箇条書き: !!(md && md.querySelector("ul li")),
      生の記号: /(\*\*|^#\s)/m.test(本文 ? (本文.textContent || "") : ""),
      絵: !!art,
      絵の幅: box ? Math.round(box.width) : 0,
      絵の高さ: box ? Math.round(box.height) : 0,
      絵の中身: art ? art.children.length : 0,
      本文の下: !!(art && 本文 && (art.compareDocumentPosition(本文) & Node.DOCUMENT_POSITION_PRECEDING)),
      印: !!印,
      印が左: !!(印 && 名.firstElementChild === 印),
      印のラベル: 印 ? 印.getAttribute("aria-label") : "",
      名前: 名 ? (名.textContent || "").trim() : ""
    };
  }, [お知らせ.id]);
  ok("お知らせの 投稿が 画面に ある", 中.ある === true, 中.全);
  ok("マークダウンとして 描かれている", 中.マークダウン === true);
  ok("見出しが 形に なっている", 中.見出し === true);
  ok("太字が 形に なっている", 中.太字 === true);
  ok("箇条書きが 形に なっている", 中.箇条書き === true);
  ok("生の記号（** や #）が そのまま 出ていない", 中.生の記号 === false);
  ok("本文の 下に 絵が 出る", 中.絵 === true && 中.本文の下 === true, 中.絵 + " / " + 中.本文の下);
  ok("絵に 幅と 高さが ある", 中.絵の幅 > 200 && 中.絵の高さ > 40, 中.絵の幅 + "×" + 中.絵の高さ);
  ok("絵の 中身が 空でない", 中.絵の中身 >= 2, 中.絵の中身);
  ok("送り主に 公式マークが 付く", 中.印 === true);
  ok("公式マークは 名前の **左**", 中.印が左 === true);
  ok("色だけで 伝えていない（言葉が 付く）", /公式/.test(中.印のラベル || ""), 中.印のラベル);
  ok("送り主は VocabuQuiz", /VocabuQuiz/.test(中.名前 || ""), 中.名前);

  節("④ 48 種 ぜんぶ 描いてみる");
  const 描き = await p.evaluate(() => {
    const 箱 = document.createElement("div");
    箱.style.cssText = "position:fixed;left:-9999px;top:0;width:700px";
    document.body.appendChild(箱);
    const 悪い = [];
    const 名 = window.VQART.名前();
    for (const k of 名) {
      for (let s = 0; s < 3; s++) {
        箱.innerHTML = window.VQART.作る(k, "t" + s);
        const svg = 箱.querySelector("svg");
        if (!svg) { 悪い.push(k + "/" + s + " svg なし"); continue; }
        if (svg.children.length < 2) 悪い.push(k + "/" + s + " 中身なし");
        const r = svg.getBoundingClientRect();
        if (r.width < 100 || r.height < 20) 悪い.push(k + "/" + s + " 大きさ " + Math.round(r.width) + "×" + Math.round(r.height));
        if (svg.querySelector("image,use[href^='http'],foreignObject")) 悪い.push(k + "/" + s + " 外を読んでいる");
      }
    }
    箱.remove();
    return { 数: 名.length, 悪い };
  });
  ok("48 種 × 3 通り すべて 描ける", 描き.悪い.length === 0, 描き.悪い.slice(0, 5));
  ok("外の 画像に 頼っていない", 描き.悪い.filter((x) => /外を読んでいる/.test(x)).length === 0);

  節("⑤ お知らせの 一覧へ 飛べる");
  const 飛べる = await p.evaluate(([pid]) => {
    const r = document.getElementById("vqFeed").shadowRoot;
    const el = r.querySelector('[data-post="' + pid + '"] .att[data-a="news"]');
    if (!el) return { なし: true };
    el.click();
    return { ある: true, 行き先: document.body.getAttribute("data-app-tab") };
  }, [お知らせ.id]);
  ok("お知らせへの 入口が ある", 飛べる.ある === true, 飛べる);
  ok("押すと お知らせの 画面へ 行く", 飛べる.行き先 === "news", 飛べる.行き先);

  節("⑥ 設定の 見やすさ");
  await p.evaluate(() => { document.body.setAttribute("data-app-tab", "home"); });
  await p.waitForTimeout(400);
  await p.evaluate(() => { if (window.__vqOpenSettings) window.__vqOpenSettings(); });
  await p.waitForTimeout(1200);
  const 設定 = await p.evaluate(() => {
    const h = document.getElementById("vqSettings");
    if (!h || !h.shadowRoot) return { なし: true };
    const r = h.shadowRoot;
    const navs = Array.from(r.querySelectorAll(".nav"));
    const 印 = {};
    navs.forEach((nv) => {
      const t = (nv.textContent || "").trim();
      const sv = nv.querySelector("svg");
      印[t] = sv ? sv.innerHTML.slice(0, 60) : "";
    });
    return { ある: true, 並び: Object.keys(印), 印 };
  });
  ok("設定が 開く", 設定.ある === true, 設定);
  const ストレージ = Object.keys(設定.印 || {}).filter((k) => /ストレージ/.test(k))[0] || "";
  const つまみ = Object.keys(設定.印 || {}).filter((k) => /詳細|管理/.test(k))[0] || "";
  ok("ストレージの 行が ある", !!ストレージ, 設定.並び);
  ok("ストレージに 専用の 印が 付いた（「つまみ」の 使い回しでない）",
    !!ストレージ && !!つまみ && 設定.印[ストレージ] !== 設定.印[つまみ],
    設定.印[ストレージ] + " / " + 設定.印[つまみ]);

  const 読める = await p.evaluate(() => {
    const r = document.getElementById("vqSettings").shadowRoot;
    r.querySelectorAll(".nav").forEach((nv) => { if (/ストレージ/.test(nv.textContent || "")) nv.click(); });
    return true;
  });
  await p.waitForTimeout(2500);
  const 字 = await p.evaluate(() => {
    const r = document.getElementById("vqSettings").shadowRoot;
    const 地 = getComputedStyle(r.querySelector(".modal")).backgroundColor;
    const 見 = (sel) => {
      const e = r.querySelector(sel);
      if (!e) return null;
      const cs = getComputedStyle(e);
      return { 字: cs.color, 大きさ: parseFloat(cs.fontSize) };
    };
    const 全文 = (r.querySelector(".body") || {}).textContent || "";
    return {
      地,
      説明: 見(".row__desc"), 見出し: 見(".gttl"), 値: 見(".rval"), 注: 見(".note"),
      生の記号: /\*\*/.test(全文),
      英語の鍵: /wordPractice400\.|vq2\.arboards|app\.auth\.token/.test(全文)
    };
  });
  ok("読み込めた", !!字.説明 || !!字.注, 字);
  if (字.説明) {
    ok("説明の 文字が 読める（4.5 以上）", 比(字.説明.字, 字.地) >= 4.5,
      字.説明.字 + " / " + 字.地 + " = " + 比(字.説明.字, 字.地).toFixed(2));
    ok("説明の 文字が 12px 以上", 字.説明.大きさ >= 12, 字.説明.大きさ);
  }
  if (字.見出し) ok("束の 見出しが 読める（4.5 以上）", 比(字.見出し.字, 字.地) >= 4.5,
    字.見出し.字 + " = " + 比(字.見出し.字, 字.地).toFixed(2));
  if (字.値) ok("値の 文字が 読める（4.5 以上）", 比(字.値.字, 字.地) >= 4.5,
    字.値.字 + " = " + 比(字.値.字, 字.地).toFixed(2));
  if (字.注) ok("注意書きが 読める（4.5 以上）", 比(字.注.字, 字.地) >= 4.5,
    字.注.字 + " = " + 比(字.注.字, 字.地).toFixed(2));
  ok("マークダウンの 記号（**）が そのまま 出ていない", 字.生の記号 === false);
  ok("英語の 鍵を そのまま 並べていない", 字.英語の鍵 === false);
  void 読める;

  ok("画面の 失敗が 出ていない", 画面の失敗.length === 0, 画面の失敗.slice(0, 3).join(" / "));

  await b.close();
  console.log(印.join("\n"));
  console.log("\n通った " + 済 + "/" + (済 + 落));
  if (落ち.length) console.log("落ちた: " + 落ち.join(" / "));
  process.exit(落 ? 1 : 0);
})().catch((e) => {
  console.log(印.join("\n"));
  console.error("\n途中で 止まりました: " + (e && e.message ? e.message : e));
  process.exit(2);
});
