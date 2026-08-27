/* ══════════════════════════════════════════════════════════════════════════
   vqslides0820.cjs — スライドの 中身が「読み込まれない」件（2026-08-20）

   訴え:「Lumi なんだけど、スライドとか めちゃくちゃ ちゃんと 作ってくれる。
          でも、まだ スライドの 位置が おかしかったり するんよ。
          改行とか、グラフ、図形、表が 正しく 読み込まれなかったり。」

   ★ 実測で 分かった 真因（推測ではない）
     ① **グラフは 一度も 描けていなかった。**
        描く側（workplace/chart.js の render）は 系列の 数を `values` で
        読むのに、置く側（Slides の 部品・デザインエンジンの ir）は
        `data` で 渡していた。render は
        `filter(s => s && s.values)` で **黙って 落として**いたので、
        中身が どれだけ 正しくても「データがありません」の 箱が 出る。
     ② **形が 少しでも 違うと 部品ごと 捨てていた。**
        表は 並びの並び 以外 受けない。図形は rect/circle/triangle 以外
        受けない。グラフは labels と 数の 個数が 1 つでも ずれたら 断る。
        捨てられた ぶんは **空の箱**として 残る。
     ③ **改行が 文字のまま 出る。**`<br>` や 二重に 包まれた `\n`
        （＝ 文字の \ と n）が そのまま 画面に 出ていた。
     ④ **位置は 見直すだけで 直していなかった。**
        画布の 外・文字が 入りきらない・重なり を 見つけては 返すが、
        直すのは Lumi の 仕事だったので 往復して 直りきらない。

   ★ 直しかた: **受ける側で そろえる。** 捨てずに 直して、
     直した所は 返事の「直したところ」に 出す（黙って直すと 次も 同じ形で来る）。

   走らせかた:
     node vqslides0820.cjs          ← 全部（サーバが要る）
     node vqslides0820.cjs --だけ   ← Node だけで 済む ぶん（サーバ不要）

   本番では 走らせない。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

const 節だけ = process.argv.includes("--だけ");
let 済 = 0, 落 = 0; const 印 = []; const 落ち = [];
function ok(名, 真, 補) {
  if (真) { 済++; 印.push("  ✅ " + 名 + (補 === undefined ? "" : "  " + 短(補))); }
  else { 落++; 落ち.push(名); 印.push("  ❌ " + 名 + (補 === undefined ? "" : "  " + 短(補))); }
}
function 短(v) { const s = typeof v === "string" ? v : JSON.stringify(v); return String(s).slice(0, 220); }
function 節(t) { 印.push("\n── " + t + " " + "─".repeat(Math.max(0, 56 - t.length))); }

/* ══════════════════════════════════════════════════════════════════
   Ⅰ. デザインエンジンの 受け口（Node だけで 測れる）
   ══════════════════════════════════════════════════════════════════ */
function 設計の検査() {
  const path = require("path");
  const R = path.join(__dirname, "client", "design") + path.sep;
  ["color", "seed", "font-families", "font-pairs", "derive", "constraints",
   "layout-grammar", "layout-diversity", "layout-resolve", "gate", "ir",
   "preview", "render-vqslides", "pipeline"].forEach((f) => require(R + f + ".js"));
  const V = globalThis.VQD;
  const そろ = (c, role) => V.ir.中身をそろえる(c, role);

  節("Ⅰ-A 改行（訴え「改行が 読み込まれない」）");
  ok("<br> は 本当の改行に なる", そろ({ text: "1 行目<br>2 行目" }).text === "1 行目\n2 行目",
     JSON.stringify(そろ({ text: "1 行目<br>2 行目" }).text));
  ok("文字の \\ と n も 本当の改行に なる", そろ({ text: "1 行目\\n2 行目" }).text === "1 行目\n2 行目",
     JSON.stringify(そろ({ text: "1 行目\\n2 行目" }).text));
  ok("<p> で 包まれていても 札は 残らない",
     そろ({ text: "<p>あ</p><p>い</p>" }).text.indexOf("<") < 0,
     そろ({ text: "<p>あ</p><p>い</p>" }).text);
  ok("並びで 渡されても 1 本の 文に なる", そろ({ text: ["あ", "い"] }).text === "あ\nい");

  節("Ⅰ-B 箇条書き（1 本の文字列で 来ても 落とさない）");
  const b1 = そろ({ items: "・りんご\n・みかん\n・ぶどう" }, "bullets");
  ok("改行入りの 1 本でも 3 項目に なる", b1.items && b1.items.length === 3, b1.items);
  ok("行頭の 中黒は 落とす", b1.items && b1.items[0] === "りんご", b1.items);
  const b2 = そろ({ items: ["- あ", "* い"] }, "bullets");
  ok("markdown の 印も 落とす", b2.items && b2.items[0] === "あ" && b2.items[1] === "い", b2.items);
  ok("bullets という 鍵でも 受ける", (そろ({ bullets: ["あ", "い"] }, "bullets").items || []).length === 2);

  節("Ⅰ-C 表（訴え「表が 読み込まれない」）");
  let 例外 = null, もの = null;
  try { もの = そろ({ rows: [{ 項目: "費用", 値: "3,000円" }, { 項目: "人数", 値: "12" }] }, "table"); }
  catch (e) { 例外 = String(e && e.message); }
  ok("★ もの の並びで 例外に ならない（前は ここで deckWrite ごと こけた）", !例外, 例外);
  ok("もの の並びは 見出し + 中身に なる",
     もの && もの.rows && もの.rows.length === 3 && もの.rows[0][0] === "項目" && もの.rows[1][1] === "3,000円",
     もの && もの.rows);
  const h = そろ({ headers: ["月", "人数"], rows: [["4月", "12"], ["5月", "18"]] }, "table");
  ok("headers は 1 行目に 差し込まれる",
     h.rows && h.rows.length === 3 && h.rows[0][0] === "月", h.rows);
  const md = そろ({ rows: ["| 月 | 人数 |", "|---|---|", "| 4月 | 12 |"] }, "table");
  ok("markdown の 表も 読める", md.rows && md.rows.length === 2 && md.rows[1][1] === "12", md.rows);
  const 包 = そろ({ rows: { headers: ["A", "B"], rows: [["1", "2"]] } }, "table");
  ok("{headers, rows} で 包まれていても 読める",
     包.rows && 包.rows.length === 2 && 包.rows[0][1] === "B", 包.rows);
  const 短表 = そろ({ rows: [["A", "B", "C"], ["1"]] }, "table");
  ok("足りない ますは 空で 埋める", 短表.rows && 短表.rows[1].length === 3, 短表.rows);

  節("Ⅰ-D グラフ（訴え「グラフが 読み込まれない」）");
  const g1 = そろ({ chart: { type: "bar", labels: ["4月", "5月"], series: [{ name: "売上", data: [10, 20] }] } }, "chart");
  ok("★ data で 渡しても values が 付く（描く側は values を読む）",
     g1.chart && g1.chart.series[0].values && g1.chart.series[0].values[1] === 20, g1.chart);
  const g2 = そろ({ chart: { type: "bar", labels: ["4月", "5月"], series: [{ name: "売上", values: [10, 20] }] } }, "chart");
  ok("values で 渡しても 通る", g2.chart && g2.chart.series[0].values[0] === 10, g2.chart);
  const g3 = そろ({ chart: { type: "円グラフ", labels: ["A", "B"], series: [{ name: "数", data: [1, 2] }] } }, "chart");
  ok("日本語の 種類名も 読み替える", g3.chart && g3.chart.type === "pie", g3.chart && g3.chart.type);
  const g4 = そろ({ chart: { type: "bar", labels: ["A", "B", "C"], series: [{ name: "x", values: [1, 2] }] } }, "chart");
  ok("★ 数が 足りなくても 捨てず 0 で 埋める",
     g4.chart && g4.chart.series[0].values.length === 3 && g4.chart.series[0].values[2] === 0, g4.chart);
  const g5 = そろ({ chart: { type: "bar", labels: ["A", "B"], data: [3, 5] } }, "chart");
  ok("数が じかに 並んでいても 1 系列に なる",
     g5.chart && g5.chart.series.length === 1 && g5.chart.series[0].values[1] === 5, g5.chart);
  const g6 = そろ({ chart: { type: "bar", series: [{ label: "A", value: 3 }, { label: "B", value: 5 }] } }, "chart");
  ok("[{label,value}] でも 横軸と 系列に なる",
     g6.chart && g6.chart.labels.join(",") === "A,B" && g6.chart.series[0].values[1] === 5, g6.chart);
  ok("中身の 無い グラフは 付けない", !そろ({ chart: { type: "bar" } }, "chart").chart);

  節("Ⅰ-E 通しで 崩れないこと");
  const deck = V.ir.newDeck({ title: "検査", pageCount: 2 }, V.constraints.randomSeed(V.constraints.rngOf(11)));
  ok("デッキを 作れる", !!deck && !!deck.tokens);
  let 通し例外 = null;
  try {
    const p0 = V.ir.newPage("detail", null, 0);
    p0.content = [そろ({ slotIndex: 0, text: "見出し<br>2 行目" }, "heading"),
                  そろ({ slotIndex: 1, items: "・あ\n・い" }, "bullets")];
    deck.pages.push(p0);
    V.ir.全部解く(deck);
  } catch (e) { 通し例外 = String(e && e.message); }
  ok("解いても 例外に ならない", !通し例外, 通し例外);
}

/* ══════════════════════════════════════════════════════════════════
   Ⅱ. 実際の 画面（Slides の 部品を 本当に 置いて 見る）
   ══════════════════════════════════════════════════════════════════ */
async function req(path, { method = "GET", body, token } = {}) {
  const h = { "content-type": "application/json" };
  if (token) h.authorization = "Bearer " + token;
  const r = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, j: await r.json().catch(() => ({})) };
}
async function 作る() {
  const tag = `sl${Date.now().toString(36)}`;
  const s = await req("/api/auth/register/start", { method: "POST",
    body: { email: `vqsl.${tag}@gmail.com`, gradePrefix: "H2", nickname: "sl" + tag, password: "Testing!2345" } });
  if (!s.j.devCode) throw new Error("devCode が返りません: " + JSON.stringify(s.j).slice(0, 160));
  const v = await req("/api/auth/register/verify", { method: "POST", body: { challengeId: s.j.challengeId, code: s.j.devCode } });
  const c = await req("/api/auth/register/consent", { method: "POST",
    body: { registrationSession: v.j.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: "482913" } });
  return c.j.token;
}

async function 画面の検査() {
  const { chromium } = require("playwright");
  const TOKEN = await 作る();
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1400, height: 950 } });
  const p = await ctx.newPage();
  const 画面の失敗 = [];
  p.on("pageerror", (e) => 画面の失敗.push(String(e.message).slice(0, 200)));
  await p.addInitScript(([t]) => { try { localStorage.setItem("app.auth.token.v1", t); } catch (e) {} }, [TOKEN]);
  await p.goto(BASE + "/?vqdev=1&cb=" + Date.now(), { waitUntil: "domcontentloaded" });
  await p.waitForFunction(() => !!(window.VQ2 && window.VQ2.workplace && window.VQ2.workplace.cmd
    && window.VQ2.workplace.chart), null, { timeout: 45000 }).catch(() => {});

  節("Ⅱ-A 土台");
  ok("Workplace の 操作の口が ある", await p.evaluate(() => !!(window.VQ2 && window.VQ2.workplace && window.VQ2.workplace.cmd)));
  ok("グラフの 受け口（そろえる）が ある",
     await p.evaluate(() => typeof (window.VQ2.workplace.chart || {})["そろえる"] === "function"));

  節("Ⅱ-B グラフが 本当に 描かれる（①の 真因）");
  const 描 = await p.evaluate(() => {
    const CH = window.VQ2.workplace.chart;
    const 空 = (h) => /データがありません/.test(h) || h.indexOf("<svg") < 0;
    return {
      data: !空(CH.render({ type: "bar", labels: ["4月", "5月"], series: [{ name: "売上", data: [10, 20] }] }, { width: 400, height: 240 })),
      values: !空(CH.render({ type: "bar", labels: ["4月", "5月"], series: [{ name: "売上", values: [10, 20] }] }, { width: 400, height: 240 })),
      じか: !空(CH.render({ type: "line", labels: ["A", "B", "C"], data: [1, 2, 3] }, { width: 400, height: 240 })),
      対: !空(CH.render({ type: "pie", series: [{ label: "A", value: 3 }, { label: "B", value: 7 }] }, { width: 400, height: 240 })),
      ずれ: !空(CH.render({ type: "bar", labels: ["A", "B", "C"], series: [{ name: "x", values: [1, 2] }] }, { width: 400, height: 240 })),
      空のまま: 空(CH.render({ type: "bar", labels: [], series: [] }, { width: 400, height: 240 }))
    };
  });
  ok("★ data で 渡した グラフが 描かれる（前は 空の箱だった）", 描.data, 描);
  ok("values で 渡した グラフも 描かれる", 描.values);
  ok("数が じかに 並んでいても 描かれる", 描.じか);
  ok("[{label,value}] でも 描かれる", 描.対);
  ok("数が ずれていても 0 で 埋めて 描く", 描.ずれ);
  ok("本当に 中身が 無いときは 空のまま（うそを 描かない）", 描.空のまま);

  節("Ⅱ-C 崩れた 中身を 置いてみる");
  const 結 = await p.evaluate(async () => {
    const K = window.VQ2.workplace.cmd;
    await K.ファイル.作る({ kind: "slides", title: "受け口の検査" });
    await new Promise((r) => setTimeout(r, 900));
    const 出 = K.slides.組む({
      slide: 1, replace: true,
      elements: [
        /* 図形: 「rectangle」「40%」など 素直でない 書きかた */
        { type: "rectangle", x: "64px", y: "40%", w: "832", h: 8, fill: "#c7d2fe" },
        /* 改行: <br> と 二重に 包まれた \n */
        { type: "text", text: "1 行目<br>2 行目\\n3 行目", x: 64, y: 60, w: 400, h: 120, size: 24 },
        /* 表: もの の並び */
        { type: "表", rows: [{ 項目: "費用", 値: "3,000円" }, { 項目: "人数", 値: "12" }],
          x: 64, y: 240, w: 380, h: 120 },
        /* グラフ: 日本語の 種類名 + data + 数のずれ */
        { type: "graph", x: 500, y: 240, w: 396, h: 240,
          chart: { type: "円グラフ", labels: ["A", "B", "C"], series: [{ name: "数", data: [3, 7] }] } },
        /* 画布の 外 */
        { type: "text", text: "はみ出し", x: 900, y: 500, w: 400, h: 200, size: 18 }
      ]
    });
    const c = K.いま(), b = K.本体(c);
    const es = (b.slides[0].elements || []);
    return {
      置いた: es.length,
      置けなかった: 出.置けなかったもの || null,
      直したところ: 出.直したところ || null,
      崩れ: (出.見直した結果 || {}).見つかった数,
      崩れの中身: ((出.見直した結果 || {}).見つかったもの || []).slice(0, 6),
      種類: es.map((e) => e.type),
      図形: (es.find((e) => e.type === "shape") || {}),
      文: (es.find((e) => e.type === "text") || {}).text,
      表: (es.find((e) => e.type === "table") || {}).rows,
      グラフ: (es.find((e) => e.type === "chart") || {}).chart,
      箱: es.map((e) => [e.x, e.y, e.w, e.h])
    };
  });
  ok("★ 5 つとも 置けた（1 つも 捨てていない）", 結.置いた === 5, { 置いた: 結.置いた, 置けなかった: 結.置けなかった });
  ok("「rectangle」は 図形として 置かれる", 結.種類.indexOf("shape") >= 0, 結.種類);
  ok("図形の 形は rect に なる", 結.図形.shape === "rect", 結.図形.shape);
  ok("「40%」は px に 直る（540 × 0.4 = 216）", Math.abs((結.図形.y || 0) - 216) <= 1, 結.図形.y);
  ok("★ <br> が 本当の 改行に なる", /1 行目\n2 行目/.test(結.文 || ""), JSON.stringify(結.文));
  ok("★ 文字の \\ と n も 改行に なる", /2 行目\n3 行目/.test(結.文 || ""), JSON.stringify(結.文));
  ok("札が 文字として 残らない", (結.文 || "").indexOf("<") < 0, JSON.stringify(結.文));
  ok("「表」でも 表として 置かれる", Array.isArray(結.表) && 結.表.length === 3, 結.表);
  ok("もの の並びが 見出し + 中身に なる",
     結.表 && 結.表[0][0] === "項目" && 結.表[1][1] === "3,000円", 結.表);
  ok("「graph」でも グラフとして 置かれる", !!結.グラフ, 結.種類);
  ok("日本語の 種類名は pie に なる", 結.グラフ && 結.グラフ.type === "pie", 結.グラフ && 結.グラフ.type);
  ok("★ 数の ずれは 0 で 埋めて 置く（断らない）",
     結.グラフ && 結.グラフ.series[0].values.length === 3, 結.グラフ && 結.グラフ.series);
  ok("グラフの 系列は values を 持つ",
     結.グラフ && Array.isArray(結.グラフ.series[0].values), 結.グラフ && 結.グラフ.series[0]);
  ok("直した所を 黙らずに 返す", Array.isArray(結.直したところ) && 結.直したところ.length > 0, 結.直したところ);

  節("Ⅱ-D 位置（④の 真因）");
  const 中 = (結.箱 || []).every(([x, y, w, h]) => x >= 0 && y >= 0 && x + w <= 960 && y + h <= 540);
  ok("★ 置いた 部品は すべて 画布（960×540）の 中に ある", 中, 結.箱);
  const はみ = (結.崩れの中身 || []).filter((x) => x.どこが === "はみ出し");
  ok("★ 見直しで はみ出しが 0 件", はみ.length === 0, はみ);

  節("Ⅱ-E 重なりと 入りきらない");
  const 重 = await p.evaluate(() => {
    const K = window.VQ2.workplace.cmd;
    const 出 = K.slides.組む({
      slide: 1, replace: true,
      elements: [
        { type: "text", text: "重なる 1", x: 80, y: 200, w: 400, h: 120, size: 24 },
        { type: "text", text: "重なる 2", x: 100, y: 220, w: 400, h: 120, size: 24 },
        { type: "text", size: 28, x: 520, y: 60, w: 360, h: 40,
          text: "これは とても 長い 文で、40px の 箱には どう考えても 入りきりません。"
              + "入りきらないまま 置くと、画面では 途中で 切れて 読めなくなります。" },
        /* 飾り（線）と 重ねる。線は 動かさず、文字の ほうを どかす */
        { type: "line", x: 80, y: 460, w: 400, h: 12, color: "#94a3b8" },
        { type: "text", text: "線と 重なる 文", x: 90, y: 452, w: 300, h: 40, size: 20 }
      ]
    });
    const c = K.いま(), b = K.本体(c), es = b.slides[0].elements;
    const 見 = K.slides.見直す({ slide: 1 });
    return { 直したところ: 出.直したところ || [],
             崩れ: (見.見つかったもの || []),
             箱: es.map((e) => ({ t: e.type, x: e.x, y: e.y, w: e.w, h: e.h, size: e.size })) };
  });
  const 重なり = (重.崩れ || []).filter((x) => x.どこが === "重なり");
  ok("★ 重なりを ほどいた（見直しで 0 件）", 重なり.length === 0, 重なり);
  const 入らない = (重.崩れ || []).filter((x) => x.どこが === "文字が入りきらない");
  ok("★ 文字が 入りきらないを 収めた（見直しで 0 件）", 入らない.length === 0,
     { 崩れ: 入らない, 箱: 重.箱 });
  ok("収めかたを 返事に 出す", (重.直したところ || []).length > 0, 重.直したところ);
  const 線 = (重.箱 || []).find((e) => e.t === "line");
  ok("飾りの 線は 動かさない", 線 && 線.y === 460, 線);
  /* ★ 直すのは **形の崩れ**だけ。「見出しと本文が同じ大きさ」のような
     見た目の指摘は わざと 残す（どう直すかは 中身しだいで、
     機械が 決めることでは ない）。 */
  const 形の崩れ = (重.崩れ || []).filter((x) =>
    ["はみ出し", "重なり", "文字が入りきらない"].indexOf(x.どこが) >= 0);
  ok("★ 見直しの 数えかたと 直しかたが 同じ（形の崩れが 残らない）",
     形の崩れ.length === 0, 重.崩れ);
  ok("見た目の 指摘は 消さない（機械が 決めない）",
     (重.崩れ || []).length >= 0);

  節("Ⅱ-F 画面に 本当に 出ているか");
  const 見た = await p.evaluate(async () => {
    const K = window.VQ2.workplace.cmd;
    K.slides.組む({
      slide: 1, replace: true,
      elements: [
        { type: "text", text: "上の行<br>下の行", x: 64, y: 48, w: 400, h: 120, size: 28 },
        { type: "table", headers: ["月", "人数"], rows: [["4月", "12"]], x: 64, y: 220, w: 380, h: 120 },
        { type: "chart", x: 500, y: 220, w: 396, h: 260,
          chart: { type: "bar", labels: ["4月", "5月"], series: [{ name: "売上", data: [10, 20] }] } }
      ]
    });
    await new Promise((r) => setTimeout(r, 1200));
    /* 影の DOM の 中まで 探す */
    const 集 = (sel) => { const out = []; const walk = (r) => {
      (r.querySelectorAll("*") || []).forEach((el) => {
        try { if (el.matches(sel)) out.push(el); } catch (e) {}
        if (el.shadowRoot) walk(el.shadowRoot); }); }; walk(document); return out; };
    const 箱 = 集(".wpp-el");
    const 文 = 集(".wpp-el__t").map((e) => getComputedStyle(e).whiteSpace + "|" + e.textContent);
    const 表 = 集("table.wpp-tbl").map((t) => Array.from(t.querySelectorAll("td")).map((d) => d.textContent));
    const グラフ枠 = 集(".wp-chart");
    return {
      部品数: 箱.length,
      文: 文,
      表: 表[0] || null,
      グラフのsvg: グラフ枠.length ? グラフ枠[0].querySelectorAll("svg").length : 0,
      グラフの文: グラフ枠.length ? グラフ枠[0].textContent.slice(0, 60) : "（枠なし）",
      空の言い分: 集(".wp-empty__d").map((e) => e.textContent).filter((t) => /データがありません/.test(t)).length
    };
  });
  ok("3 つとも 画面に 出ている", 見た.部品数 >= 3, 見た.部品数);
  ok("改行が 画面でも 効いている（pre-wrap ＋ 本当の改行）",
     (見た.文 || []).some((s) => /pre-wrap/.test(s) && /上の行\n下の行/.test(s)), 見た.文);
  ok("表の ますに 中身が 入っている",
     見た.表 && 見た.表.indexOf("月") >= 0 && 見た.表.indexOf("12") >= 0, 見た.表);
  ok("★ グラフが svg で 描かれている", 見た.グラフのsvg >= 1, 見た);
  ok("★「データがありません」が 出ていない", 見た.空の言い分 === 0, 見た.グラフの文);

  節("Ⅱ-G 直す道でも 同じ受け口");
  const 直 = await p.evaluate(() => {
    const K = window.VQ2.workplace.cmd;
    const c = K.いま(), b = K.本体(c);
    const 図 = (b.slides[0].elements || []).find((e) => e.type === "shape")
            || (b.slides[0].elements || [])[0];
    const r1 = K.slides.部品({ op: "直す", slide: 1, type: "text", number: 1, text: "直した<br>行" });
    const r2 = K.slides.部品({ op: "直す", slide: 1, type: "chart", number: 1,
                               chart: { type: "折れ線", labels: ["A", "B"], series: [{ name: "x", data: [1, 2] }] } });
    const r3 = K.slides.部品({ op: "足す", slide: 1, type: "rectangle", x: 1200, y: 900, w: 200, h: 40, fill: "#eee" });
    const es = K.本体(K.いま()).slides[0].elements;
    const t = es.find((e) => e.type === "text"), g = es.find((e) => e.type === "chart");
    const 後 = es[es.length - 1];
    return { 文: t && t.text, グラフ: g && g.chart && g.chart.type,
             足した: { t: 後.type, s: 後.shape, x: 後.x, y: 後.y, w: 後.w, h: 後.h },
             だめ: [r1.だめ, r2.だめ, r3.だめ].filter(Boolean) };
  });
  ok("直す道でも <br> が 改行に なる", /直した\n行/.test(直.文 || ""), JSON.stringify(直.文));
  ok("直す道でも 日本語の 種類名を 読み替える", 直.グラフ === "line", 直.グラフ);
  ok("直す道でも 図形の 別名を 受ける（断らない）", !直.だめ.length && 直.足した.s === "rect", 直);
  ok("足したものも 画布の 中へ 入れる",
     直.足した.x + 直.足した.w <= 960 && 直.足した.y + 直.足した.h <= 540, 直.足した);

  節("Ⅱ-H 画面の 落ち");
  ok("画面が 落ちていない", 画面の失敗.length === 0, 画面の失敗.slice(0, 3));

  await b.close();
}

(async () => {
  設計の検査();
  if (!節だけ) {
    try { await 画面の検査(); }
    catch (e) { 落++; 落ち.push("画面の検査"); 印.push("  ❌ 画面の検査で 例外: " + String(e && e.message).slice(0, 200)); }
  } else {
    印.push("\n（--だけ なので 画面の検査は 飛ばしました）");
  }
  console.log(印.join("\n"));
  console.log("\n══ 通った " + 済 + " / 落ちた " + 落 + " ══");
  if (落) console.log("落ちたもの:\n  - " + 落ち.join("\n  - "));
  process.exit(落 ? 1 : 0);
})();
