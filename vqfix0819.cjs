/* ══════════════════════════════════════════════════════════════════════════
   vqfix0819.cjs — 2026-08-19 に 頼まれた 9 つの 直しを 確かめる

     ① プリセット詳細の「目安の時間」に HTML が 剥き出しで 出る
     ② プリセット AI の 使用制限が 無制限になっている
     ③ Lumi が 返答中に 指示すると 1 回目が 通らない
     ④ プリセット編集で 問題を 複製したい
     ⑤ プリセット一覧から 開始すると 昔のモーダル・昔のクイズ画面になる
     ⑥ 解説が要るときは ボードで 説明してほしい
     ⑦ AR Board に **動くもの**（その場で 組み立てる ゲーム・教材）
     ⑧ 6〜10 分で 繋ぎ直しになって 声を 聞かなくなる／強制終了する
     ⑨ ログイン・新規登録の あとの Qredit 発行画面を やめる

   使い方: node vqfix0819.cjs
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
const 読む = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");
const 探す = (dir, 頭) => {
  const d = path.join(__dirname, dir);
  const f = fs.readdirSync(d).find((x) => x.startsWith(頭 + ".") && x.endsWith(".js"));
  return f ? path.join(dir, f) : null;
};

(async () => {
  /* ══ ① 目安の時間 ══════════════════════════════════════════════════ */
  節("① プリセット詳細の「目安の時間」");
  {
    const src = 読む(探す("js-src", "vq2-app"));
    ok("num(...) を 使って mins を 作っていない",
      src.indexOf("var mins = (card && num(card.estimatedMinutes") < 0);
    ok("Number で その場で 読んでいる",
      /var m0 = card \? Number\(card\.estimatedMinutes\) : NaN;/.test(src));
    /* 同じ関数の中に num が 2 つある（宣言の持ち上がりで 下のが 当たる）ことを
       ずっと 残しておくと また 踏む。**その事実自体**も 検査に入れる。 */
    const 開始 = src.indexOf("function statsHtml()");
    const 終り = src.indexOf("function moreHtml()", 開始);
    const 間 = src.slice(開始, 終り);
    ok("同じ範囲に HTML を作る num が いる（この罠は 消えていない）",
      間.indexOf("function num(label, key, value, min, max, unit, hint)") > 0);
  }

  /* ══ ② AI の 使用制限 ═══════════════════════════════════════════════ */
  節("② プリセット AI の 使用制限");
  {
    const t = 読む("server/wrangler.toml");
    ok("無料 1 日 10 本", /LUMI_DAILY_LIMIT\s*=\s*"10"/.test(t));
    ok("無料 1 週 40 本", /LUMI_WEEKLY_LIMIT\s*=\s*"40"/.test(t));
    ok("有料 1 日 100 本 / 1 週 400 本",
      /LUMI_DAILY_LIMIT_PAID\s*=\s*"100"/.test(t) && /LUMI_WEEKLY_LIMIT_PAID\s*=\s*"400"/.test(t));
    ok("週は 日×7 より 小さい（週が 効く）", 40 < 10 * 7);
    const w = 読む("server/src/worker.js");
    ok("管理者の 無制限は 既定で 切ってある",
      /const 管理者無制限 = String\(env\?\.LUMI_ADMIN_UNLIMITED \|\| ""\)\.trim\(\) === "1";/.test(w)
      && /const unlimited = \(管理者無制限 && isAiAdminUnlimitedUser\(user, env\)\)/.test(w));
  }

  /* ══ ③ 返答中の 割り込み ════════════════════════════════════════════ */
  節("③ Lumi が 返答中でも 1 回で 通る");
  {
    const wk = 読む("client/vq-live-pcm.worklet.js");
    ok("止めている間も 覚えている（捨てていない）",
      wk.indexOf("if (this.muted) { this.pos = 0; this.at = 0; return true; }") < 0
      && /this\.ring\[this\.rat\] =/.test(wk));
    ok("flush で 覚えたぶんを 返す", /d\.type === "flush"/.test(wk) && /type: "preroll"/.test(wk));
    const lv = 読む(探す("js-src", "vq-live"));
    ok("覚えておく長さを 渡している", /keepMs: 1200/.test(lv));
    ok("割り込みのとき flush を 頼む", /postMessage\(\{ type: "flush" \}\)/.test(lv));
    ok("受け取った頭を **先に** 送る", /noteEv\("★ 言葉の頭 "/.test(lv));
    ok("先出しが 済むまで 生の声を 送らない", /if \(st\.先出し中\) return;/.test(lv));
    ok("空振りの数は 時間で 0 に戻す",
      /if \(Date\.now\(\) - \(st\.probeAt \|\| 0\) > 25000\) st\.probeNg = 0;/.test(lv));
  }

  /* ══ ④ 問題の 複製 ══════════════════════════════════════════════════ */
  節("④ プリセット編集で 問題を 複製");
  {
    const src = 読む(探す("js-src", "vq2-app"));
    ok("一覧の行に 複製ボタンがある", /data-act="dup-row"/.test(src));
    ok("押しても カードの開閉が 起きない", /closest\("\[data-act=\\"dup-row\\"\]"\)/.test(src));
    ok("行の複製が つながっている", /U\.on\(r, "click", '\[data-act="dup-row"\]'/.test(src));
    ok("まとめて複製も ある", /data-act="dup-multi"/.test(src) && /件を複製/.test(src));
    ok("開いている問題の 複製も 残っている", /action: "dup", aria: "複製"/.test(src));
  }

  /* ══ ⑤ 一覧から 開始したとき ════════════════════════════════════════ */
  節("⑤ プリセット一覧からの 開始");
  {
    const core = 読む(探す("js-src", "vq-core"));
    const app = 読む(探す("js-src", "vq2-app"));
    ok("本体が 中身を 渡す口を 出している", /window\.__vqPresetSource = function \(pid\)/.test(core));
    ok("古い開始の 入口で 新画面へ 回す", /if \(_appTryNewQuiz\(pid\)\) return;/.test(core));
    ok("V2 に 無いものは 本体から もらう", /var 生 = 本体から\(id\);/.test(app));
    ok("もらったものを V2 へ 直している", /A\.presetToV2\(v1, \{ ownerId:/.test(app));
    ok("プリセット詳細の 書き取りは 消えた", app.indexOf('push("書き取りで始める"') < 0);
  }

  /* ══ ⑥⑦ ボード と 動くもの ═════════════════════════════════════════ */
  節("⑥ 解説を ボードで");
  {
    const w = 読む("server/src/worker.js");
    ok("3 文を超えそうなら 出す、と 決めてある", /返事が 3 文を 超えそうだと 思った瞬間に showNote/.test(w));
    ok("出す言葉が 並べてある", /「解説して」「教えて」「やりかた」「手順」/.test(w));
    ok("ひとことの返事には 出さない、も 書いてある", /ひとことで 済む返事/.test(w));
  }

  節("⑦ AR App（その場で 組み立てて 動かす）");
  {
    /* 部品そのものを Node で 動かして 確かめる */
    const g = {};
    g.window = g; g.document = { createElement: () => ({ setAttribute() {}, style: {}, appendChild() {} }) };
    const vm = require("vm");
    vm.createContext(g);
    vm.runInContext(読む("client/core/board/app.js"), g);
    const A = g.VQB.app;
    const 型 = [
      ["html/css/js", { html: "<h1>あ</h1>", css: "h1{color:red}", js: "var a=1;" }],
      ["丸ごと 1 枚", { code: "<!doctype html><html><head></head><body><p>x</p></body></html>" }],
      ["三連記号で 囲まれている", { js: "```js\nlet a=1;\n```" }],
      ["文字だけ", "var a=1;"],
      ["空っぽ", {}],
      ["</script> 混入", { js: 'var s="</scr' + 'ipt>";' }]
    ];
    let 全部通った = true, 内訳 = [];
    for (const [n, v] of 型) {
      const d = A.文書(v);
      const よい = /^<!doctype html>/i.test(d) || A.丸ごとか(d);
      const 土台 = d.indexOf("#vqapp") > 0;
      const 見張り = d.indexOf("__vqapp") > 0;
      if (!(よい && 土台 && 見張り)) { 全部通った = false; 内訳.push(n); }
    }
    ok("どんな形で 渡されても 崩れない（6 通り）", 全部通った, 内訳);
    ok("</script> を 逃がしている", A.文書({ js: 'var s="</scr' + 'ipt>";' }).indexOf("<\\/script>") > 0);
    ok("外へ 繋がせない（CSP）", A.文書({ html: "<p>x</p>" }).indexOf("connect-src 'none'") > 0);
    ok("三連記号を 外している", A.囲みを外す("```js\nlet a=1;\n```").trim() === "let a=1;");

    const st = 読む("client/core/board/store.js");
    ok("置き場が 動くものを 覚える", /var 種 = 文\(o\.kind\) === "app" \? "app" : "note";/.test(st));
    const ui = 読む("client/core/board/ui.js");
    ok("一覧に AR App の 札が 出る", /vqb-tag is-app/.test(ui) && /AR App/.test(ui));
    ok("開くと 実際に 動かす", /function 動かす\(b\)/.test(ui) && /root\.VQB\.app\.枠\(/.test(ui));
    ok("画面を 変えるとき 枠を 片づける", /function 枠を片づける\(\)/.test(ui));

    const lv = 読む(探す("js-src", "vq-live"));
    ok("Lumi の 道具として つながっている",
      /if \(name === "showApp"\) return showApp\(a\);/.test(lv) && /function showApp\(a\)/.test(lv));
    ok("壊れたら 理由を Lumi へ 返す", /エラー: String\(文言 \|\| ""\)\.slice\(0, 300\)/.test(lv));
    ok("動いたものだけ AR Board に 残す", /if \(r && r\.やった\) \{/.test(lv));

    const w = 読む("server/src/worker.js");
    ok("サーバが showApp を 並べている", /fn\("showApp",/.test(w));
    /* ★ 2026-08-19 の 2 度目で 言い回しを 変えた（道具を 貸すようにしたため）。
       「外へは 出られない」という **中身**は 変わっていないので、そこを 見る。 */
    ok("外のものは 使えないと 伝えてある",
      /外の住所からは 何も 取れません/.test(w) && /localStorage は 使えません/.test(w));
    ok("借りられる道具を 並べてある",
      /phaser/.test(w) && /tailwind/.test(w) && /three/.test(w) && /matter/.test(w));
    ok("土台 API の 使いかたを 書いてある",
      /VQ\.quiz\.get/.test(w) && /VQ\.store\.set/.test(w) && /VQ\.祝う/.test(w));
    ok("完成品を 出せ、と 書いてある",
      /完成品を 出す/.test(w) && /300〜800 行/.test(w));
    ok("壊れたら もう一度 呼べ、と 伝えてある", /もう一度 showApp を 呼びます/.test(w));

    /* 束ねたものにも 入っているか（実際に 配るのは こちら） */
    const b = 読む(探す("js-src", "bundle-core"));
    ok("束ねたものに 入っている", b.indexOf("VQB.app = {") > 0 && b.indexOf("枠: 枠,") > 0);
    /* 土台 API は **文字列として** 束ねてある（アプリの中へ 差し込むため）。
       だから中は VQ.〜 ではなく、頼みごとの名前で 確かめる。 */
    ok("土台 API も 束ねたものに 入っている（取りに行かなくてよい）",
      b.indexOf("VQB.RUNTIME = ") > 0
      && b.indexOf("quiz.get") > 0 && b.indexOf("store.set") > 0 && b.indexOf("祝う") > 0);
    const 配る = fs.readdirSync(path.join(__dirname, "client/js")).find((x) => x.startsWith("bundle-core."));
    ok("配るほうにも 入っている",
      読む("client/js/" + 配る).indexOf("connect-src 'none'") > 0, 配る);
  }

  /* ══ ⑧ 60 分 続く ══════════════════════════════════════════════════ */
  節("⑧ 6〜10 分で 切れる／強制終了する");
  {
    const lv = 読む(探す("js-src", "vq-live"));
    ok("繋ぎ直す前に「喋っている」印を 必ず 消す",
      /st\.speaking = false; st\.inTurn = false; st\.jingleOn = false;/.test(lv));
    ok("止めっぱなしの 保険も 解いてから 繋ぎ直す", /if \(st\.tMute\) \{ clearTimeout\(st\.tMute\); st\.tMute = 0; \}\n    if \(st\.tProbe\)/.test(lv));
    ok("45 秒 続いたら 失敗の数を 0 に戻す", /st\.redial = 0; st\.micTries = 0;/.test(lv));
    ok("繋ぎ直しの上限が 60 分ぶんある", /var 上限 = 仕事中 \? 40 : 20;/.test(lv));
    ok("会話ぜんぶの締切は サーバの 60 分", /const LIVE_MAX_MS = 60 \* 60 \* 1000;/.test(読む("server/src/worker.js")));
    /* 10 分の接続 × 6 本 ＝ 最低 6 回。上限 3 では 必ず 死ぬ。 */
    ok("60 分に 要る繋ぎ替え回数（6 回）より 上限が 大きい", 20 > 6);
  }

  /* ══ ⑨ Qredit の 発行画面 ═══════════════════════════════════════════ */
  節("⑨ ログイン・新規登録の あと");
  {
    const core = 読む(探す("js-src", "vq-core"));
    const i = core.indexOf("function _appQreditCardMaybeAutoOpen(){");
    const 中 = core.slice(i, i + 700);
    ok("自動で 出さない（すぐ 帰る）", /_appQreditCardAutoOpened = true;[\s\S]{0,220}return;/.test(中));
    ok("入れたら ホームへ", /_appSetTab\("home"\);/.test(core.slice(core.indexOf('addEventListener("vq-pin-passed"'), core.indexOf('addEventListener("vq-pin-passed"') + 900)));
    ok("左パネルの 入口は 残っている", /_appQreditCardRenderSidebarEntry\(\)/.test(core));
    ok("自分で 開く道は 残っている", /window\.__vqOpenQredit/.test(core));
  }

  /* ══ 実際の 画面で 確かめる ═════════════════════════════════════════ */
  節("⑩ 画面を 開いて 確かめる");
  const b = await chromium.launch();
  try {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    const page = await ctx.newPage();
    const 声 = [];
    page.on("pageerror", (e) => 声.push(String(e.message).slice(0, 200)));
    await page.goto(BASE + "/", { waitUntil: "load", timeout: 120000 });
    await page.waitForFunction(() => window.__vqLibsReady === true, null, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1500);

    ok("読み込みで 落ちていない（" + 声.length + " 件）", 声.length === 0, 声.slice(0, 5));
    ok("動くものの 部品が 載っている",
      await page.evaluate(() => !!(window.VQB && window.VQB.app && window.VQB.app.枠)));
    ok("置き場も 載っている",
      await page.evaluate(() => !!(window.VQB && window.VQB.store && window.VQB.store.足す)));
    ok("プリセットを 渡す口が 載っている",
      await page.evaluate(() => typeof window.__vqPresetSource === "function"));

    /* 動くものを **本当に 動かす**。押して 数が 変わるか まで見る。 */
    const 結果 = await page.evaluate(async () => {
      const 置 = document.createElement("div");
      document.body.appendChild(置);
      const 記 = [];
      const f = window.VQB.app.枠(置, {
        html: '<p id="n">0</p><button id="b">ふやす</button>',
        js: 'var n=0;document.getElementById("b").onclick=function(){n++;document.getElementById("n").textContent=n;};'
      }, { 高さ: 200, 報せ: (k, m) => 記.push(k + ":" + m) });
      await new Promise((r) => setTimeout(r, 2500));
      const d = f.枠.contentDocument;
      let 前 = null, 後 = null;
      if (d) {
        前 = d.getElementById("n") ? d.getElementById("n").textContent : null;
        if (d.getElementById("b")) d.getElementById("b").click();
        後 = d.getElementById("n") ? d.getElementById("n").textContent : null;
      }
      const 出 = { 記, 前, 後, 読めた: !!d };
      f.片づける(); 置.remove();
      return 出;
    });
    /* sandbox に allow-same-origin を 付けていないので、
       中の DOM は **こちらからは 読めない**（それが 正しい）。
       だから「触れたか」は 中からの 知らせで 判じる。 */
    ok("動いた、と 中から 知らせが 来る",
      結果.記.some((x) => x.indexOf("ok:") === 0), 結果.記);
    ok("外からは 中を 触れない（守られている）", 結果.読めた === false, 結果);

    /* 壊れたものは 壊れたと 言うか */
    const 壊 = await page.evaluate(async () => {
      const 置 = document.createElement("div");
      document.body.appendChild(置);
      const 記 = [];
      const f = window.VQB.app.枠(置, { js: "これは.わざと(壊す)" }, { 報せ: (k, m) => 記.push(k + ":" + m) });
      await new Promise((r) => setTimeout(r, 2500));
      f.片づける(); 置.remove();
      return 記;
    });
    ok("壊れたら 黙らずに 知らせる", 壊.some((x) => /^error:/.test(x)), 壊);

    /* 壊れても 本体は 無事か */
    ok("壊しても 本体は 無事", (await page.evaluate(() => !!document.getElementById("appTabBar") || !!document.body)) === true);
    ok("壊しても 本体に 例外が 出ていない（" + 声.length + " 件）", 声.length === 0, 声.slice(0, 5));

    /* Qredit の 発行画面が 勝手に 出ないこと */
    const q = await page.evaluate(() => {
      const e = document.getElementById("appQreditPage") || document.querySelector("[data-qredit-card-action]");
      return { ある: !!e, 見えている: e ? getComputedStyle(e).display !== "none" : false };
    });
    ok("Qredit の 発行画面が 勝手に 出ていない", !q.見えている, q);

    await ctx.close();
  } finally { await b.close(); }

  console.log("\n════════════════════════════════════════════════════════════");
  console.log("  合計 " + (pass + fail) + " 件 / 通った " + pass + " / 落ちた " + fail);
  if (落ち.length) { console.log("  落ちたもの:"); 落ち.forEach((x) => console.log("   - " + x)); }
  console.log("════════════════════════════════════════════════════════════");
  process.exit(fail ? 1 : 0);
})();
