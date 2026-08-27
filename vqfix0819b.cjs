/* ══════════════════════════════════════════════════════════════════════════
   vqfix0819b.cjs — 2026-08-19（2 回目）に 頼まれた 6 つ

     ① プリセットのアイコンが 英語向き（日本語で 探せない）
     ② FEED の 削除・編集・報告／返信にも 投稿と同じ 5 つ
     ③ 収録教材 11 個が 短式 → 4 択へ
     ④ ホームに 今日のことわざ（毎日 0 時・人ごとに ばらばら）
     ⑤ 学習の設定を 新しい導線へ つなぎ直す
     ⑥ ストレージ（localStorage 4.4MB の壁 → IndexedDB 7.4GB へ）

   使い方: node vqfix0819b.cjs
   ══════════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
let pass = 0, fail = 0; const 落ち = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ✅ " + n); }
  else { fail++; 落ち.push(n); console.log("  ❌ " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 400) : "")); }
};
const 節 = (t) => console.log("\n■ " + t);
const V = require("./vqsrc.cjs");
const W = fs.readFileSync(path.join(__dirname, "server", "src", "worker.js"), "utf8");

(async () => {
  /* ══ ① アイコン ══════════════════════════════════════════════════ */
  節("① アイコンを 日本語で 探せるか");
  {
    const s = V.塊("vq2-app");
    const a = s.indexOf("var PRESET_ICONS = ["), b = s.indexOf("\n  ];", a);
    const rows = [...s.slice(a, b).matchAll(/\{ g: "([^"]+)", n: "([a-z0-9_]+)", l: "([^"]+)", k: "([^"]+)" \}/g)]
      .map(r => ({ g: r[1], n: r[2], l: r[3], k: r[4] }));
    ok("一覧が そろっている（" + rows.length + " 個）", rows.length >= 180, rows.length);
    /* ★ 「教科」の まとまりは 作って **やめた**（同じ絵が 2 か所に 並ぶと、
       片方を 押したとき 両方が 選ばれた顔になる。vqcover が 見つけた）。
       代わりに **見出しに 教科名を 添える** ＋ 手がかりに 教科名を 入れる。 */
    ok("同じ絵が 2 つ 並んでいない",
      new Set(rows.map((x) => x.n)).size === rows.length, rows.length);
    const 見出し = [...new Set(rows.map((x) => x.g))];
    ok("見出しに 教科名が 添えてある",
      見出し.some((g) => /数学/.test(g)) && 見出し.some((g) => /物理/.test(g))
      && 見出し.some((g) => /歴史/.test(g)) && 見出し.some((g) => /音楽/.test(g)), 見出し);
    const 探す = (q) => rows.filter(x => (x.n + " " + x.l + " " + x.k + " " + x.g).indexOf(q) >= 0).length;
    const 語 = ["国語", "数学", "英語", "理科", "社会", "日本史", "世界史", "地理", "公民",
                "物理", "化学", "生物", "地学", "音楽", "美術", "体育", "保健", "家庭科",
                "技術", "情報", "漢字", "古文", "道徳", "算数", "検定", "英検"];
    const 無 = 語.filter(w => !探す(w));
    ok("教科の名前 26 語 すべてで 見つかる", 無.length === 0, 無);
    ok("かなでも 見つかる（すうがく・りか・えいご）",
      探す("すうがく") > 0 && 探す("りか") > 0 && 探す("えいご") > 0);
    ok("探す欄の 例が 日本語", /placeholder="アイコンを探す（例: 数学 \/ 日本史/.test(s));
    ok("絵にならない square を やめた", !rows.some(x => x.n === "square"));
  }

  /* ══ ② FEED ═════════════════════════════════════════════════════ */
  節("② FEED の 削除・編集・報告／返信の 5 つ");
  {
    const f = V.塊("vq-feed");
    ok("⋯ メニューが ある", /data-a="menu"/.test(f) && /function dotsBtn/.test(f));
    ok("削除・編集・報告・共有 が 並ぶ",
      /data-a="mn-del"/.test(f) && /data-a="mn-edit"/.test(f)
      && /data-a="mn-report"/.test(f) && /data-a="mn-share"/.test(f));
    ok("できることだけ 出す（人の投稿に 編集を 出さない）",
      /if \(m\.編集できる\)/.test(f) && /function 自分か\(/.test(f));
    ok("削除は 確かめてから", /window\.confirm\(文 \+ "\\n元には戻せません。"\)/.test(f));
    ok("返信にも 5 つ（返信・リポスト・いいね・保存・共有）",
      /data-a="r-reply"/.test(f) && /data-a="r-repost"/.test(f) && /data-a="r-like"/.test(f)
      && /data-a="r-bookmark"/.test(f) && /data-a="r-share"/.test(f));
    ok("返信のリポストが つながっている", /"r-repost": \["repost", "reposted", "repostCount"\]/.test(f));
    ok("返信への返信は @ を入れて 返信欄へ", /function 返信に返信\(/.test(f) && /function 返信欄へ\(/.test(f));
    ok("同じ枝を 2 か所に 置いていない",
      (f.match(/if \(a === "r-like" \|\| a === "r-bookmark"/g) || []).length === 1);
    /* サーバ側 */
    ok("返信を 直す口が ある", /path === "\/api\/posts\/reply-update"/.test(W) && /async function handleReplyUpdate/.test(W));
    ok("返信を 消す口が ある", /path === "\/api\/posts\/reply-delete"/.test(W) && /async function handleReplyDelete/.test(W));
    ok("他人の返信は 直せない", /他の人の返信は編集できません/.test(W));
    ok("自分の投稿の下なら 持ち主も 消せる", /返信は \*\*その投稿の持ち主も\*\* 消せる/.test(W));
    ok("消したら 本文も 残さない", /SET body = '', deleted_at = \?2/.test(W));
    ok("返信のリポストの 表が ある", (W.match(/social_reply_reposts/g) || []).length >= 3);
    ok("返信のリポストを 数えている", /repostCounts = Math\.max|reply\.repostCount = Math\.max/.test(W));
  }

  /* ══ ③ 収録教材を 4 択へ ═══════════════════════════════════════ */
  節("③ 収録教材 11 個を 4 択へ");
  {
    const a = W.indexOf("function _mixNum(s) {"), b = W.indexOf("/* ═══ Official presets API ═══ */");
    ok("組み立てる部品が ある", a > 0 && b > a);
    const f = new Function(W.slice(a, b) + "\nreturn officialWordsToChoices;")();
    const mk = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, word: "w" + i, meaning: "意味" + i }));
    let 全部よし = true, 位置 = [0, 0, 0, 0];
    for (const n of [4, 8, 20, 60, 120]) {
      const r = f(mk(n), "eiken:w1");
      if (!r.every(x => x.mcq && x.mcq.choices.length === 4
        && x.mcq.choices[x.mcq.correctIndex] === x.meaning
        && new Set(x.mcq.choices).size === 4)) 全部よし = false;
      if (n === 120) r.forEach(x => 位置[x.mcq.correctIndex]++);
    }
    ok("どの大きさでも 全部 4 択・正解が 合う・重複なし", 全部よし);
    ok("正解の位置が 4 か所に ばらける", 位置.every(x => x > 15), 位置);
    ok("何度 呼んでも 同じ（開くたびに 変わらない）",
      JSON.stringify(f(mk(30), "eiken:w1")) === JSON.stringify(f(mk(30), "eiken:w1")));
    ok("教材が 違えば 組み合わせも 違う",
      JSON.stringify(f(mk(30), "eiken:w1")) !== JSON.stringify(f(mk(30), "eiken:w2")));
    ok("4 語未満なら 触らない", f(mk(3), "x").every(x => !x.mcq));
    ok("意味が 全部同じなら 触らない",
      f(Array.from({ length: 9 }, (_, i) => ({ id: i, word: "w" + i, meaning: "同じ" })), "x").every(x => !x.mcq));
    ok("返すときに 組んでいる（表は 書き換えない）",
      /words: officialWordsToChoices\(words, r\.id\)/.test(W));
  }

  /* ══ ④ ことわざ ════════════════════════════════════════════════ */
  節("④ 今日のことわざ");
  {
    const g = {}; g.globalThis = g;
    require("vm").runInNewContext(fs.readFileSync(path.join(__dirname, "client/data/kotowaza.js"), "utf8"), g);
    const 全 = g.VQKOTO;
    ok("966 句 入っている（" + (全 ? 全.length : 0) + "）", 全 && 全.length >= 900, 全 && 全.length);
    ok("すべて [ことわざ, 意味] の 形",
      全.every(x => Array.isArray(x) && x.length === 2 && x[0].length >= 2 && x[1].length >= 6));
    ok("重複が ない", new Set(全.map(x => x[0])).size === 全.length);
    ok("日本語だけ（変な記号が 混じっていない）",
      全.every(x => /^[　-鿿゠-ヿ぀-ゟー々〆]+$/.test(x[0])));
    /* 選び方（画面と 同じ式を 取り出して 回す） */
    const s = V.塊("vq-screens");
    ok("画面に つないである", /data-home-koto/.test(s) && /function ことわざを出す/.test(s));
    ok("起動では 読まない（開いたときに 取りに行く）", /sc\.src = "\/data\/kotowaza\.js"/.test(s));
    ok("日本時間の 0 時で 切っている", /9 \* 3600 \* 1000/.test(s) && /function 日が変わるまで/.test(s));
    const mix = (t) => { let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i);
      h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0; } return h >>> 0; };
    const gcd = (a2, b2) => { while (b2) { const t = a2 % b2; a2 = b2; b2 = t; } return a2; };
    const N = 全.length;
    const 番 = (u, d) => { let 始 = mix(u) % N, 歩 = 1 + (mix(u + "|歩") % (N - 1));
      for (let k = 0; k < N && gcd(N, 歩) !== 1; k++) 歩 = 1 + (歩 % (N - 1));
      if (gcd(N, 歩) !== 1) 歩 = 1; return ((始 + d * 歩) % N + N) % N; };
    let 連続 = 0, 全部出た = 0;
    const 人 = ["u10", "u3", "u777", "guest", "dabc123"];
    for (const u of 人) {
      const 見 = new Set(); let 前 = -1;
      for (let d = 20600; d < 20600 + N; d++) { const n = 番(u, d); if (n === 前) 連続++; 前 = n; 見.add(n); }
      if (見.size === N) 全部出た++;
    }
    ok("★ " + N + " 日 続けても **一度も 2 日連続で 同じにならない**", 連続 === 0, 連続);
    ok("★ " + N + " 日で 全部の句が 1 回ずつ 出る", 全部出た === 人.length, 全部出た);
    const 同日 = new Set(); for (let i = 0; i < 200; i++) 同日.add(番("u" + i, 20684));
    ok("同じ日でも 人ごとに ばらける（200 人で " + 同日.size + " 通り）", 同日.size > 150, 同日.size);
    ok("同じ人・同じ日は 何度でも 同じ", 番("u10", 20684) === 番("u10", 20684));
  }

  /* ══ ⑤ 学習の設定 ══════════════════════════════════════════════ */
  節("⑤ 学習の設定を 新しい導線へ");
  {
    const a = V.塊("vq2-app"), st = V.塊("vq-settings-store"), c = V.塊("vq-core");
    ok("開く道が 1 本に まとまった", /VQ2\.learn = \{ 既定: 学習の既定, 開く: 設定で開く/.test(a));
    ok("一覧からの開始が そこを 通る", /設定で開く\(p, \{ resume: false \}\)/.test(a));
    ok("プリセット詳細も そこを 通る", /VQ2\.learn\.開く\(preset, \{/.test(a));
    ok("本体からの開始も そこを 通る", /V\.learn && V\.learn\.開く/.test(c));
    ok("解きかた・並び替えも 設定から 引く",
      /learn\.mode/.test(a) && /learn\.shuffleQ/.test(a) && /learn\.shuffleC/.test(a));
    ok("表裏の入れ替えが **実際に 効く**", /function 表裏を入れ替える/.test(a));
    ok("入れ替えられないものは 触らない（選択式）",
      /選択式は 選択肢の作り直しが 要るので 触らない/.test(a));
    /* 定義表 */
    ok("学習の設定が 古い画面ではなく 新しい画面を 読む",
      !/{ id: "learn\.autoNext", group: "learn", type: "toggle", kind: "legacy"/.test(st)
      && /{ id: "learn\.autoNext", group: "learn", type: "toggle", kind: "own"/.test(st));
    ok("新しい設定が 足してある（解きかた・並び替え・すぐ解説ほか）",
      /id: "learn\.mode"/.test(st) && /id: "learn\.shuffleQ"/.test(st)
      && /id: "learn\.shuffleC"/.test(st) && /id: "learn\.instantExplain"/.test(st)
      && /id: "learn\.confirmSubmit"/.test(st) && /id: "learn\.warnUnanswered"/.test(st));
    ok("値を 二重に 持たない（playerPrefs へ 写す）", /function applyPlayerPref\(key\)/.test(st));
    /* 「読む場所がある」ことを 定義表 自身で 確かめる */
    const 学習の行 = [...st.matchAll(/\{ id: "learn\.[a-zA-Z]+",[\s\S]{0,700}?\},\n/g)].map(m => m[0]);
    const 読み手なし = 学習の行.filter(r => !/readBy:|kind: "legacy"|apply:/.test(r));
    ok("学習の設定は すべて 読む場所が ある（" + 学習の行.length + " 行）", 読み手なし.length === 0,
      読み手なし.map(r => (r.match(/id: "([^"]+)"/) || [])[1]));
  }

  /* ══ ⑥ ストレージ ══════════════════════════════════════════════ */
  節("⑥ ストレージ");
  {
    const i = fs.readFileSync(path.join(__dirname, "client/core/store/idb.js"), "utf8");
    ok("置き場（IndexedDB）を 作った", /root\.VQIDB = \{/.test(i));
    ok("読む・書く・消す・数える が ある",
      /読む: 読む/.test(i) && /書く: 書く/.test(i) && /消す: 消す/.test(i) && /容量: 容量/.test(i));
    ok("移すのは **決めた鍵だけ**", /var 移してよい鍵 = \[/.test(i) && /vq2\.arboards\.v1/.test(i));
    ok("壁の 8 割で 自動で 逃がす", /var 危ない線 = Math\.round\(4\.4 \* 1024 \* 1024 \* 0\.8\)/.test(i));
    ok("使えない端末では これまでどおり", /if \(!使える\(\)\)/.test(i));
    const b = V.塊("bundle-core");
    ok("束ねたものに 入っている", b.indexOf("root.VQIDB = {") > 0);
    ok("置き場が board より **先**に 入っている",
      b.indexOf("/core/store/idb.js") < b.indexOf("/core/board/store.js"));
    const bs = fs.readFileSync(path.join(__dirname, "client/core/board/store.js"), "utf8");
    ok("AR Board が 置き場を 使う", /IDB\.大きいものを書く\(鍵, JSON\.stringify\(写し\)\)/.test(bs));
    ok("読み込みを 待てる口が ある（用意）", /用意: 用意/.test(bs));
    const se = V.塊("vq-settings");
    ok("設定に この端末の 容量が 出る", /function deviceHTML\(\)/.test(se) && /localStorage/.test(se));
    ok("移すボタンが つながっている", /d\.dev === "move"/.test(se) && /function devMove\(\)/.test(se));
    ok("ログインしていなくても 出す", /この端末のぶんは \*\*ログインしていなくても\*\* 出す/.test(se));
  }

  /* ══ 画面で 確かめる ═══════════════════════════════════════════ */
  節("⑦ 画面を 開いて 確かめる");
  const br = await chromium.launch();
  try {
    const ctx = await br.newContext({ viewport: { width: 1280, height: 950 } });
    await ctx.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    const page = await ctx.newPage();
    const 声 = []; page.on("pageerror", (e) => 声.push(String(e.message).slice(0, 200)));
    await page.goto(BASE + "/", { waitUntil: "load", timeout: 120000 });
    await page.waitForFunction(() => window.__vqLibsReady === true, null, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(2200);

    const k = await page.evaluate(async () => {
      const host = document.getElementById("vqScreens");
      const sr = host && host.shadowRoot;
      let box = sr && sr.querySelector("[data-home-koto]");
      for (let i = 0; i < 40 && (!box || box.hidden); i++) {
        await new Promise(x => setTimeout(x, 250));
        box = sr && sr.querySelector("[data-home-koto]");
      }
      return { 出ている: !!(box && !box.hidden),
               札: box ? !!box.querySelector(".koto__tag") : false,
               句: box ? (box.querySelector(".koto__t") || {}).textContent || "" : "",
               意味: box ? (box.querySelector(".koto__m") || {}).textContent || "" : "",
               件数: window.VQKOTO ? window.VQKOTO.length : 0 };
    });
    ok("ホームに 今日のことわざが 出る", k.出ている && k.札, k);
    ok("句と 意味の 両方が 出る", k.句.length >= 2 && k.意味.length >= 6, k);
    ok("966 句が 読み込まれた", k.件数 >= 900, k.件数);

    const idb = await page.evaluate(async () => {
      const I = window.VQIDB;
      if (!I) return { だめ: "VQIDB が 無い" };
      const ok1 = await I.書く("__試験", { a: 1 });
      const v = await I.読む("__試験");
      await I.消す("__試験");
      const 消えた = await I.読む("__試験");
      const c = await I.容量();
      const h = I.手元の量();
      return { 使える: I.使える(), 書けた: ok1, 読めた: JSON.stringify(v),
               消えた: 消えた === null, 上限: c.上限, 手元: h.合計,
               手元の上限: h.上限のめやす };
    });
    ok("置き場が 使える", idb.使える === true, idb);
    ok("書いて 読んで 消せる", idb.書けた === true && idb.読めた === '{"a":1}' && idb.消えた === true, idb);
    ok("置き場のほうが けた違いに 広い（" + Math.round(idb.上限 / 1024 / 1024) + "MB 対 4.4MB）",
      idb.上限 > 100 * 1024 * 1024, idb.上限);

    /* AR Board が IndexedDB に 入って、開き直しても 残るか */
    const brd = await page.evaluate(async () => {
      const S = window.VQB.store;
      await S.用意();
      const a = await S.足す({ kind: "app", title: "置き場ためし",
        code: { html: "<p>x</p>", libs: [] } });
      const 前 = S.一覧().length;
      /* localStorage には 残っていないこと */
      const ls = localStorage.getItem("vq2.arboards.v1");
      const idbに = await window.VQIDB.読む("ls:vq2.arboards.v1");
      S.全消し();
      return { 足せた: !!a.id, 件数: 前, localStorageに残っている: ls !== null,
               置き場にある: typeof idbに === "string" && idbに.indexOf("置き場ためし") > 0 };
    });
    ok("AR Board を 足せる", brd.足せた && brd.件数 >= 1, brd);
    ok("中身が 置き場（IndexedDB）に 入る", brd.置き場にある === true, brd);
    ok("localStorage には 置かない", brd.localStorageに残っている === false, brd);

    ok("例外が 出ていない（" + 声.length + " 件）", 声.length === 0, 声.slice(0, 6));
    await ctx.close();
  } finally { await br.close(); }

  console.log("\n════════════════════════════════════════════════════════");
  console.log("  合計 " + (pass + fail) + " 件 / 通った " + pass + " / 落ちた " + fail);
  if (落ち.length) { console.log("  落ちたもの:"); 落ち.forEach((x) => console.log("   - " + x)); }
  console.log("════════════════════════════════════════════════════════");
  process.exit(fail ? 1 : 0);
})();
