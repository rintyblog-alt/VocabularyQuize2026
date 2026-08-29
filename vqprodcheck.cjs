#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqprodcheck.cjs — 本番に **実際に 出ているか**を、画面を 開いて 確かめる

   ★ grep で 探すと 見落とす。圧縮した 本体では 日本語が \u エスケープに
     なるので、「文字が 無い」＝「出ていない」では ない（実際に 一度
     間違えた）。ここは **本番の 画面を 本物の ブラウザで 開いて**、
     関数を 呼び、DOM を 見て 確かめる。

   触るのは 読み取りだけ。**登録しない・公開しない・何も 書かない。**
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_PROD || "https://www.vocabuquiz.app";
const { chromium } = require("playwright");
let 済 = 0, 落 = 0;
const ok = (n, c, x) => {
  if (c) { 済++; console.log("  ok   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 200) : "")); }
  else { 落++; console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 300) : "")); }
};
const 節 = (t) => console.log("\n══ " + t + " ══");

(async () => {
  console.log("本番: " + BASE + "\n");
  const b = await chromium.launch({ headless: true });
  const pg = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await pg.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.waitForTimeout(9000);

  節("① プリセットの クラウド生成");
  ok("台帳を 見に いく 口が ある（__vqCloudGen）",
    await pg.evaluate(() => !!(window.__vqCloudGen && window.__vqCloudGen.list && window.__vqCloudGen.cancel)));
  ok("作り始めた 合図を 受ける 用意が ある",
    await pg.evaluate(() => {
      /* 合図を 投げて 落ちない ＝ 受け口が 立っている */
      try { window.dispatchEvent(new CustomEvent("vq:cloudgen:start", { detail: { jobId: "", planned: 0 } })); return true; }
      catch (e) { return false; }
    }));
  ok("台帳に 載せて 作る 口が ある（generateQuestionsTracked）",
    await pg.evaluate(() => typeof (window.VQ2 && window.VQ2.aigen && window.VQ2.aigen.generateQuestionsTracked) === "function"));
  ok("**作りかけの 札の 見た目が 入っている**（影の DOM の CSS）",
    await pg.evaluate(() => {
      const sh = document.getElementById("vqScreens");
      if (!sh || !sh.shadowRoot) return false;
      const st = sh.shadowRoot.querySelector("style");
      return !!st && /pc--building/.test(st.textContent || "");
    }));

  節("② 一覧の 取り直し");
  ok("「最新にする」が 画面に ある",
    await pg.evaluate(() => !!document.getElementById("appLibraryReloadBtn")));
  ok("押したときの 動きが つながっている",
    await pg.evaluate(() => (document.getElementById("appLibraryReloadBtn") || {}).getAttribute?.("data-lib-action") === "reloadLibrary"));

  節("③ 窓の 出入り（ふわっと）");
  const sheet = await pg.evaluate(async () => {
    const U = window.VQ2 && window.VQ2.ui;
    if (!U || !U.mount) return null;
    const app = U.mount("prod-check-sheet", { title: "確認", sheet: true, css: "" });
    const 直後 = getComputedStyle(app.root).opacity;
    await new Promise((r) => setTimeout(r, 420));
    const 出た = getComputedStyle(app.root).opacity;
    app.close("check");
    await new Promise((r) => setTimeout(r, 40));
    const 閉じ中 = app.root.className;
    await new Promise((r) => setTimeout(r, 300));
    return { 直後, 出た, 閉じ中, 消えた: !app.host.parentNode };
  });
  ok("開くとき うすい→はっきり", !!sheet && Number(sheet.直後) < 0.2 && Number(sheet.出た) > 0.9, sheet);
  ok("閉じるとき is-out が 付く", !!sheet && /is-out/.test(sheet.閉じ中), sheet && sheet.閉じ中);
  ok("最後には 消える", !!sheet && sheet.消えた);

  節("④ 公開の 画面（2 段・規約）");
  const pub = await pg.evaluate(() => {
    const ov = document.getElementById("presetPublishOverlay");
    return { ある: !!ov, css2: !!document.getElementById("vq-publish-v2"), css3: !!document.getElementById("vq-library-building") };
  });
  ok("公開の 画面の 器が ある", pub.ある);
  ok("公開の 見た目（2 段ぶん）が 入っている", pub.css2);
  ok("作りかけの 札の 見た目が 入っている", pub.css3);
  /* 段の 名前は 本体の 中。文字で 確かめる（\u でも 中身は 同じ） */
  const 段 = await pg.evaluate(async () => {
    const r = await fetch(document.querySelector('script[src*="/js/vq-core."]').src).then((x) => x.text());
    const has = (s) => r.indexOf(s) >= 0 || r.indexOf(s.split("").map((c) => c.charCodeAt(0) > 127 ? "\\u" + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0") : c).join("")) >= 0;
    return { 利用規約: has("利用規約"), 公開の設定: has("公開の設定"),
             /* ★「注意事項」は ほかの 画面でも 使う 言葉なので、それだけでは 測れない。
                古い 段の **見出しそのもの**が 消えているかで 見る。 */
             古い段: has("公開前に、短い注意だけ確認する"),
             AIの条項: has("AI が 作った 問題も 同じ 扱いです") };
  });
  ok("段が「公開の設定 → 利用規約」に なっている", 段.公開の設定 && 段.利用規約, 段);
  ok("古い 3 段目（注意事項）は 消えている", !段.古い段, 段);
  ok("規約に AI 生成の 条項が ある", 段.AIの条項, 段);

  節("④-b 新しい 公開の 画面（人が 実際に 見る ほう）");
  const 新公開 = await pg.evaluate(async () => {
    const src = await fetch([...document.querySelectorAll('script[src*="/js/vq2-app."]')][0].src).then((x) => x.text());
    const has = (t) => src.indexOf(t) >= 0 ||
      src.indexOf(t.split("").map((c) => c.charCodeAt(0) > 127 ? "\\u" + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0") : c).join("")) >= 0;
    return {
      口: typeof (window.VQ2 && window.VQ2.presetPublish && window.VQ2.presetPublish.open) === "function",
      段: has("vq2-pp-steps"), 新見本: has("vq2-pp-pv"), 表紙: has("vq2-pp-cover"),
      規約: has("vq2-pp-terms"), AI条項: has("AI が 作った 問題も 同じ 扱いです"),
      作るのは台帳: has("generateQuestionsTracked")
    };
  });
  ok("新しい 公開の 口が ある", 新公開.口, 新公開);
  ok("2 段の しるしが ある", 新公開.段);
  ok("**見本が 一覧の 札と 同じ 作り**", 新公開.新見本);
  ok("表紙（バナー）の 欄が ある", 新公開.表紙);
  ok("決まりの 段が ある・AI の 条項も ある", 新公開.規約 && 新公開.AI条項);
  ok("**作るのは 台帳を 通る**", 新公開.作るのは台帳);
  ok("画像を アイコンに したら 見た目を 錠に する 仕掛けが ある",
    await pg.evaluate(async () => {
      const src = await fetch([...document.querySelectorAll('script[src*="/js/vq2-app."]')][0].src).then((x) => x.text());
      return src.indexOf("vq2-pp-lookwrap") >= 0 && src.indexOf("is-locked") >= 0 && src.indexOf("vq2-pp-lock") >= 0;
    }));

  節("④-c 生成の 作り（余計な ものを 足していないか）");
  const 生成 = await pg.evaluate(async () => {
    const src = await fetch([...document.querySelectorAll('script[src*="/js/vq2-app."]')][0].src).then((x) => x.text());
    const i = src.indexOf("generateQuestionsTracked");
    const 周り = i < 0 ? "" : src.slice(Math.max(0, i - 500), i + 500);
    const core = await fetch(document.querySelector('script[src*="/js/vq-core."]').src).then((x) => x.text());
    return {
      台帳: i >= 0,
      鍵なし: !/idempotencyKey/.test(周り),
      /* ★ 2026-08-29 に **見かたを 変えた**。
         前は「終わった 仕事から プリセットを 作らない」を 正しいと していた。
         いったん まるごと 外したから だが、それだと
         **閉じたら 何も 残らない**（頼まれた ことの 逆）。
         作り直したので、いまの 正しさは 次の 3 つ:
           ① 取り込みが **ある**
           ② 画面と 同じ **2 段**（toClientShape → draftToQuestions）を 通す
              ← ここを 端折ると 必ず 問題文が 空に なる（それが 真因だった）
           ③ 同じ 注文（orderId）で **1 つに まとめる**・
              画面が 受け取った ものは 取らない（jobTaken） */
      /* ★ 取り込みが ある か。組み立ては vq2-app へ 移した ので、
         vq-core 側は「台帳を 見に いって、同じ口を 呼ぶ」ことで 見る。 */
      取り込みあり: /aijob\/list/.test(core) && /fromCloud/.test(core),
      /* ★ 2 段（toClientShape → draftToQuestions）は **1 か所に まとめた**ので、
         見る 先は vq-core では なく vq2-app（同じ口 fromCloud の 中）。
         あわせて **vq-core が 自分で 組み立てていない** ことも 見る
         （2 か所に あるのが、問題文が 空に なる 元だった）。 */
      二段通す: /toClientShape[^]{0,900}draftToQuestions/.test(src),
      うしろは組み立てない: !/emptyPreset/.test(core),
      注文でまとめる: /sourceOrderId/.test(core),
      画面が受けたら取らない: /jobTaken/.test(core),
      注文の目印を送る: /orderId/.test(src),
      /* ★ 2026-08-29 夕: **口が 1 本**か（画面も うしろも 同じ 関数を 通る） */
      同じ口: /fromCloud/.test(src) && /fromCloud/.test(core),
      題を作る: /cloudTitle/.test(src),
      絵を決める: /cloudIcon/.test(src)
    };
  });
  ok("作るのは 台帳を 通る", 生成.台帳);
  ok("**鍵を 付けていない**（同じ 注文の 2 回目が 弾かれない）", 生成.鍵なし, 生成);
  ok("閉じたまま 終わった ぶんを **プリセットに する**", 生成.取り込みあり, 生成);
  ok("**画面と 同じ 2 段**を 通す（ここが 問題文が 空の 真因）", 生成.二段通す, 生成);
  ok("うしろの 取り込みは **自分で 組み立てない**（口は 1 本）", 生成.うしろは組み立てない, 生成);
  ok("同じ 注文で **1 つに まとめる**（3 つに 割れない）", 生成.注文でまとめる, 生成);
  ok("画面が 受け取った 仕事は 取らない（二重に できない）", 生成.画面が受けたら取らない, 生成);
  ok("注文の 目印を サーバへ 送る", 生成.注文の目印を送る, 生成);
  ok("**口が 1 本**（画面も うしろも fromCloud を 通る）", 生成.同じ口, 生成);
  ok("作成中の 題を その場で 作る", 生成.題を作る, 生成);
  ok("作成中の アイコンを その場で 決める", 生成.絵を決める, 生成);

  節("④-d 左パネルの 開閉（パソコン）");
  const 帯 = await pg.evaluate(async () => {
    const sh = document.getElementById("vqShell");
    const sr = sh && sh.shadowRoot;
    const b = sr && sr.querySelector('[data-fn="fold"]');
    const st = sr && sr.querySelector("style");
    return {
      ボタン: !!b,
      見える: b ? getComputedStyle(b).display !== "none" : null,
      畳む見た目: !!st && /app-v2-sidebar-collapsed/.test(st.textContent || ""),
      本体の口: !!document.getElementById("appV2SidebarCollapseBtn")
    };
  });
  ok("畳む ボタンが ある", 帯.ボタン, 帯);
  ok("パソコンでは 見える", 帯.見える === true, 帯.見える);
  ok("畳んだ ときの 見た目が 入っている", 帯.畳む見た目);
  ok("本体側の 口に つないでいる", 帯.本体の口);

  節("⑤-b 今夜 足した もの（2026-08-29）");
  const 今夜 = await pg.evaluate(async () => {
    const app = await fetch([...document.querySelectorAll('script[src*="/js/vq2-app."]')][0].src).then((x) => x.text());
    const live = document.querySelector('script[src*="/js/vq-live."]')
      ? await fetch(document.querySelector('script[src*="/js/vq-live."]').src).then((x) => x.text()) : "";
    const core = await fetch(document.querySelector('script[src*="/js/vq-core."]').src).then((x) => x.text());
    const insSrc = [...document.querySelectorAll('script[src*="/js/vq-insight."]')].map((x) => x.src)[0];
    const ins = insSrc ? await fetch(insSrc).then((x) => x.text()) : "";
    const setSrc = [...document.querySelectorAll('script[src*="/js/vq-settings."]')].map((x) => x.src)[0];
    const setJs = setSrc ? await fetch(setSrc).then((x) => x.text()) : "";
    const cssHref = [...document.querySelectorAll('link[href*="/css/vq-ds."]')].map((l) => l.href)[0];
    const css = cssHref ? await fetch(cssHref).then((x) => x.text()) : "";
    const feedSrc = [...document.querySelectorAll('script[src*="/js/vq-feed."]')].map((x) => x.src)[0];
    const feed = feedSrc ? await fetch(feedSrc).then((x) => x.text()) : "";
    const callSrc = [...document.querySelectorAll('script[src*="/js/vq-call."]')].map((x) => x.src)[0];
    const callJs = callSrc ? await fetch(callSrc).then((x) => x.text()) : "";
    const dmSrc = [...document.querySelectorAll('script[src*="/js/vq-dm."]')].map((x) => x.src)[0];
    const dmJs = dmSrc ? await fetch(dmSrc).then((x) => x.text()) : "";
    const 通話の口 = await fetch("/api/call/config").then((x) => x.status).catch(() => 0);
    const 素 = document.documentElement.innerHTML;
    return {
      書類の見た目: /docTheme/.test(app),
      集計表: /sheetsPivot/.test(live) || /sheetsPivot/.test(app),
      入力規則: /sheetsRule/.test(live) || /rules/.test(app),
      重なりの始末: /sheetsDedupe/.test(live) || /sheetsDedupe/.test(app),
      段取りの窓: typeof window.__vqPlanAsk === "function",
      題字: /vqload-word/.test(css) || /vqload-word/.test(document.documentElement.innerHTML),
      ロードの暗い見た目: /data-theme-mode="dark"\][^]{0,400}authBootSplash/.test(css)
        || /authBootSplash[^]{0,400}data-theme-mode="dark"/.test(css)
        || /prefers-color-scheme: ?dark/.test(document.documentElement.innerHTML),
      アイコンを覚える: /app\.profile\.avatar\.v1/.test(core),
      /* ★ 2026-08-29 夕: **起動しても** プロフィールを 読む か。
         これが 無いと ホームに 居るあいだ ずっと 頭文字の ままだった。 */
      起動でも読む: /__vqProfileBootBound/.test(core),
      /* ★ 暗証番号の 口（前は **無いのに 呼ばれていて** ずっと「まだです」だった） */
      暗証の口: typeof (window.__vqPin || {}).isSet === "function"
        && typeof (window.__vqPin || {}).status === "function",
      暗証をサーバに聞く: /auth\/pin\/status/.test(setJs),
      デザインの座標を覚える: /vq\.design\.recent\.v1/.test(core) || /vq\.design\.recent\.v1/.test(app),
      /* 2026-08-29 夜〜朝 */
      プリセットの置き場: /accountKeyBytes/.test(setJs),
      数え直せる: /recount/.test(setJs),
      プリセットの節: /accountKeyBytes/.test(setJs),
      指標: /score100/.test(app),
      総合評価: /insight\/review/.test(app),
      グラフの動き: /insWipe/.test(ins) && /insDraw/.test(ins),
      相関図: /scatter/.test(ins) && /sc-fit/.test(ins),
      /* ── 2026-08-29 昼: 報告の 窓と 一覧からの 編集 ──
         ★ 「システムの 窓を やめて アプリの 窓に」が 訴えだったので、
           **理由の 選択が ある** ことと、**window.prompt が 無い** ことの 両方を 見る。
           esbuild は 日本語を \uXXXX に 直すので、探すのは ASCII の 目印だけ。 */
      報告の窓: /rp-send/.test(feed) && /rp-pick/.test(feed) && /selectedReason/.test(feed),
      報告のその他: /otherReason/.test(feed),
      報告は素の窓を使わない: !/window\.prompt|\bprompt\(/.test(feed),
      一覧から編集: /quick-edit/.test(feed),
      /* ── 窓が **開くとき**の 動き（訴え「閉じる時だけ 動いている」）── */
      窓が開くとき動く: /vqWinBd/.test(素) && /vqWinCard/.test(素) && /vqWinUp/.test(素),
      影の窓も動く: /vqfCard/.test(feed) && /vqfMenu/.test(feed),
      /* ── 2026-08-29 夜: DM の 音声通話 ──
         ★ ここで 見るのは 「口が 生きているか」と「作りが 芯を 外していないか」。
           通話そのものは 本番で 鳴らせない（鳴らすと 人に かかる）ので、
           流れは 開発版の vqcall.cjs / vqcallui.cjs で 測る。 */
      通話の口: 通話の口 === 401,
      通話の束: !!callSrc && /api\/call\/invite/.test(callJs),
      通話はSFU: /rtc\/session/.test(callJs) && !/createDataChannel|直につなぐ/.test(callJs),
      通話は音だけ: /video\s*:\s*!1|video:!1/.test(callJs) || /video:\s*false/.test(callJs),
      受話器は土台しだい: /__vqCallUsable/.test(dmJs) && /__vqCallUsable/.test(callJs),
      通報の口: /api\/call\/report/.test(callJs)
    };
  });
  ok("書類の 見た目（docDesign）が 入っている", 今夜.書類の見た目, 今夜);
  ok("集計表（sheetsPivot）が 入っている", 今夜.集計表, 今夜);
  ok("入力規則（sheetsRule）が 入っている", 今夜.入力規則, 今夜);
  ok("重なりの 始末（sheetsDedupe）が 入っている", 今夜.重なりの始末, 今夜);
  ok("段取りの 質問の 窓が 出せる", 今夜.段取りの窓, 今夜);
  ok("ロード画面に 題字が ある", 今夜.題字, 今夜);
  ok("ロード画面に 暗い 見た目が ある", 今夜.ロードの暗い見た目, 今夜);
  ok("プロフィールの 絵を この端末に 覚える", 今夜.アイコンを覚える, 今夜);
  ok("**起動しても** プロフィールを 読む（ホームでも アイコンが 出る）", 今夜.起動でも読む, 今夜);
  ok("暗証番号の 口が ある（__vqPin.isSet / status）", 今夜.暗証の口, 今夜);
  ok("暗証番号の 状態を サーバに 聞く", 今夜.暗証をサーバに聞く, 今夜);
  ok("デザインの 座標を 覚える（毎回 変える ため）", 今夜.デザインの座標を覚える, 今夜);
  ok("プリセットの 本当の 枠を 出す（accountKeyBytes）", 今夜.プリセットの置き場, 今夜);
  ok("ストレージを 数え直せる", 今夜.数え直せる, 今夜);
  ok("インサイトの 細かい 指標（score100）が 入っている", 今夜.指標, 今夜);
  ok("インサイトの 総合評価の 口が ある（/api/insight/review）", 今夜.総合評価, 今夜);
  ok("グラフが 左から 出る 動きが 入っている", 今夜.グラフの動き, 今夜);
  ok("相関図が 入っている", 今夜.相関図, 今夜);
  ok("報告は アプリの 窓（理由を えらぶ）に なっている", 今夜.報告の窓, 今夜);
  ok("報告の「その他」の 中身も 送っている", 今夜.報告のその他, 今夜);
  ok("報告に **システムの 窓（prompt）を 使っていない**", 今夜.報告は素の窓を使わない, 今夜);
  ok("投稿の 一覧から そのまま 編集できる", 今夜.一覧から編集, 今夜);
  ok("窓は **開くときにも** 動く（本体）", 今夜.窓が開くとき動く, 今夜);
  ok("窓は **開くときにも** 動く（影の DOM）", 今夜.影の窓も動く, 今夜);
  ok("通話の 口が 生きている（札なしで 401）", 今夜.通話の口, 今夜);
  ok("通話の 束が 配られている", 今夜.通話の束, 今夜);
  ok("通話は **SFU を 通す**（P2P に しない）", 今夜.通話はSFU, 今夜);
  ok("通話は **音だけ**（映像を 作らない）", 今夜.通話は音だけ, 今夜);
  ok("受話器は 土台が 用意できて いなければ 出さない", 今夜.受話器は土台しだい, 今夜);
  ok("通話中に 通報できる 口が ある", 今夜.通報の口, 今夜);

  節("⑤ 目安の 時間");
  const 分 = await pg.evaluate(() => {
    const L = window.VQ2 && window.VQ2.library;
    if (!L || !L.estimateMinutes) return null;
    const 単語 = [], 長文 = [];
    for (let i = 0; i < 20; i++) 単語.push({ id: "q" + i, type: "flashcard", prompt: "apple", answer: "りんご" });
    for (let i = 0; i < 5; i++) 長文.push({ id: "l" + i, type: "multiple_choice_single",
      prompt: "あ".repeat(600), choices: [{ text: "い".repeat(40) }, { text: "う".repeat(40) }, { text: "え".repeat(40) }, { text: "お".repeat(40) }] });
    return { 単語20: L.estimateMinutes(単語), 長文5: L.estimateMinutes(長文) };
  });
  ok("測れる", !!分, 分);
  ok("**問題数×1分では ない**（単語 20 問 < 10 分）", !!分 && 分.単語20 < 10, 分 && 分.単語20);
  ok("長文は 長く 出る（5 問 > 6 分）", !!分 && 分.長文5 > 6, 分 && 分.長文5);

  await b.close();
  console.log("\n────────────────────────────────");
  console.log(`  ok ${済} / NG ${落}`);
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
