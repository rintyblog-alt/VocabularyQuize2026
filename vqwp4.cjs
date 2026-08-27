/* ══════════════════════════════════════════════════════════════════════════
   vqwp4.cjs — Lumi が「言われたとおりに」4 種類ぜんぶ 作れるか（2026-08-26）

   訴え:「ワード、シート、スライド、フォームに対して、Lumi が しっかり
          ユーザーの指示どおりに 対応できるかを 必ずテスト、改善してください」

   ★ 考えかた
     Lumi は **形を まちがえる**。まちがえた ぶんを 黙って 落とすと、
     画面には 空の箱だけが 残り、利用者からは「作ってくれない」に 見える。
     この検査は **わざと 崩れた 渡しかた**をして、
       ① 捨てずに 直して 入るか
       ② 直した所を 返事に 出しているか（黙って 直すと 次も 同じ形で来る）
       ③ 画面に 本当に 出ているか
     を 実測する。

   ★ ここで 使う「崩れた 渡しかた」は 全部、実際の LLM が よく出す形。
     - 型の名前ちがい（h1 / rectangle / mcq / 表）
     - markdown を そのまま 1 本の文字列で 渡す
     - 表を もの の並び／{headers, rows}／| 区切り で 渡す
     - グラフの 数を data / values / じか並び で 渡す
     - 正解を **番号**で 渡す
     - 選択肢を 1 本の文字列で 渡す

   本番では 走らせない。   使いかた: node vqwp4.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const { chromium } = require("playwright");

let 済 = 0, 落 = 0; const 印 = []; const 落ち = [];
function ok(名, 真, 補) {
  if (真) { 済++; 印.push("  ✅ " + 名 + (補 === undefined ? "" : "  " + 短(補))); }
  else { 落++; 落ち.push(名); 印.push("  ❌ " + 名 + (補 === undefined ? "" : "  " + 短(補))); }
}
function 短(v) { const s = typeof v === "string" ? v : JSON.stringify(v); return String(s).slice(0, 240); }
function 節(t) { 印.push("\n── " + t + " " + "─".repeat(Math.max(0, 56 - t.length))); }

async function req(path, { method = "GET", body, token } = {}) {
  const h = { "content-type": "application/json" };
  if (token) h.authorization = "Bearer " + token;
  const r = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, j: await r.json().catch(() => ({})) };
}
async function 作る() {
  const tag = `w4${Date.now().toString(36)}`;
  const s = await req("/api/auth/register/start", { method: "POST",
    body: { email: `vqw4.${tag}@gmail.com`, gradePrefix: "H2", nickname: "w4" + tag, password: "Testing!2345" } });
  if (!s.j.devCode) throw new Error("devCode が返りません: " + JSON.stringify(s.j).slice(0, 160));
  const v = await req("/api/auth/register/verify", { method: "POST",
    body: { challengeId: s.j.challengeId, code: s.j.devCode } });
  const c = await req("/api/auth/register/consent", { method: "POST",
    body: { registrationSession: v.j.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: "482913" } });
  return c.j.token;
}
/* 影の DOM の 中まで 探す */
const 深く = `(sel) => { const out=[]; const walk=(r)=>{ (r.querySelectorAll("*")||[]).forEach(el=>{ try{ if(el.matches(sel)) out.push(el); }catch(e){} if(el.shadowRoot) walk(el.shadowRoot); }); }; walk(document); return out; }`;

(async () => {
  const TOKEN = await 作る();
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1400, height: 950 } });
  const p = await ctx.newPage();
  const 画面の失敗 = [];
  p.on("pageerror", (e) => 画面の失敗.push(String(e.message).slice(0, 200)));
  await p.addInitScript(([t]) => { try { localStorage.setItem("app.auth.token.v1", t); } catch (e) {} }, [TOKEN]);
  await p.goto(BASE + "/?vqdev=1&cb=" + Date.now(), { waitUntil: "domcontentloaded" });
  await p.waitForFunction(() => !!(window.VQ2 && window.VQ2.workplace && window.VQ2.workplace.cmd),
    null, { timeout: 45000 }).catch(() => {});

  節("土台");
  ok("Workplace の 操作の口が ある",
     await p.evaluate(() => !!(window.VQ2 && window.VQ2.workplace && window.VQ2.workplace.cmd)));
  const 口 = await p.evaluate(() => Object.keys((window.VQ2.workplace.cmd || {})["受け口"] || {}));
  ok("受け口（形をそろえる道具）が 出ている", 口.length >= 8, 口);

  /* ══════════════════════════════════════════════════════════════
     ① ワード（Docs）
     ══════════════════════════════════════════════════════════════ */
  節("① ワード — 型の名前ちがい・markdown・表");
  const D = await p.evaluate(async () => {
    const K = window.VQ2.workplace.cmd;
    await K.ファイル.作る({ kind: "docs", title: "受け口の検査（文書）" });
    await new Promise((r) => setTimeout(r, 900));
    const 出 = K.docs.まとめて({
      replace: true,
      blocks: [
        /* 型の名前ちがい */
        { type: "h1", text: "夏の 計画" },
        { type: "見出し2", text: "やること" },
        /* markdown を 1 本の文字列で 丸ごと */
        { type: "paragraph", text: "## ねらい\n- 早起き\n- 毎日 30 分\n1. 朝\n2. 夜\n> 続けることが 大事\n\n| 月 | 回数 |\n|---|---|\n| 7月 | 20 |\n| 8月 | 25 |" },
        /* 表を もの の並びで */
        { type: "表", rows: [{ 項目: "費用", 値: "3,000円" }, { 項目: "人数", 値: "12" }] },
        /* 行内 markdown（1 行だけ。複数行は かたまりへ 割れるのが 正しい） */
        { type: "本文", text: "**太字**と *斜体* と `コード`" },
        /* 並びで 渡した 1 かたまり ＝ 中で 改行（<br>） */
        { type: "paragraph", text: ["1 行目", "2 行目"] },
        /* 知らない型でも 文があるなら 捨てない */
        { type: "hero", text: "知らない型の 文" }
      ]
    });
    const c = K.いま(), body = K.本体(c);
    return {
      出た: (body.blocks || []).map((x) => ({ t: x.type, s: String(x.text || "").slice(0, 40), rows: x.rows })),
      直したところ: 出.直したところ || null,
      入れられなかった: 出.入れられなかったもの || null
    };
  });
  const 型 = D.出た.map((x) => x.t);
  ok("h1 → heading1 に なる", 型.indexOf("heading1") >= 0, 型);
  ok("「見出し2」→ heading2 に なる（2 個目そのもの）", D.出た[1] && D.出た[1].t === "heading2",
     D.出た.slice(0, 3));
  ok("★ markdown の 見出しが かたまりに ほどける",
     D.出た.some((x) => x.t === "heading2" && /ねらい/.test(x.s)), D.出た.slice(0, 12));
  ok("★ markdown の 箇条書きが bullet に なる",
     D.出た.filter((x) => x.t === "bullet").length >= 2, 型);
  ok("★ markdown の 番号付きが number に なる",
     D.出た.filter((x) => x.t === "number").length >= 2, 型);
  ok("markdown の 引用が quote に なる", 型.indexOf("quote") >= 0, 型);
  ok("★ markdown の 表が table に なる",
     D.出た.some((x) => x.t === "table" && x.rows && x.rows.length === 3), D.出た.filter((x) => x.t === "table"));
  ok("★ もの の並びの 表が 見出し + 中身に なる",
     D.出た.some((x) => x.t === "table" && x.rows && x.rows[0] && x.rows[0][0] === "項目"),
     D.出た.filter((x) => x.t === "table").map((x) => x.rows));
  ok("★ 「## ねらい」が 生のまま 出ていない",
     !D.出た.some((x) => /^#/.test(x.s)), D.出た.map((x) => x.s).slice(0, 12));
  ok("行内の **太字** が 文字飾りに なる",
     D.出た.some((x) => /<strong>/.test(x.s)), D.出た.map((x) => x.s).slice(0, 12));
  ok("★ 1 かたまりの 中の 改行は <br>（画面が HTML なので \\n では 効かない）",
     D.出た.some((x) => /1 行目<br>2 行目/.test(x.s)), D.出た.map((x) => x.s));
  ok("★ 何行もの 文は かたまりへ 割る（1 本の 長い段落に しない）",
     D.出た.filter((x) => x.t === "bullet").length >= 2
     && D.出た.filter((x) => x.t === "number").length >= 2, D.出た.map((x) => x.t));
  ok("知らない型でも 捨てない", D.出た.some((x) => /知らない型/.test(x.s)), D.出た.map((x) => x.s));
  ok("直した所を 黙らずに 返す", Array.isArray(D.直したところ) && D.直したところ.length > 0, D.直したところ);

  節("① ワード — 画面に 出ているか");
  const D2 = await p.evaluate(async (深く) => {
    await new Promise((r) => setTimeout(r, 900));
    const 集 = eval(深く);
    return {
      かたまり: 集("[data-id]").length,
      表: 集("table.wpd-tbl").length,
      生markdown: 集("[data-id]").map((e) => e.textContent).filter((t) => /^#{1,4}\s/.test(t)).length
    };
  }, 深く);
  ok("文書の かたまりが 画面に 出ている", D2.かたまり >= 8, D2);
  ok("表が 画面に 出ている", D2.表 >= 2, D2);
  ok("★ 生の markdown が 画面に 出ていない", D2.生markdown === 0, D2);

  /* ══════════════════════════════════════════════════════════════
     ② シート（Sheets）
     ══════════════════════════════════════════════════════════════ */
  節("② シート — 表を そのまま 渡す・番地の ゆらぎ");
  const S1 = await p.evaluate(async () => {
    const K = window.VQ2.workplace.cmd;
    await K.ファイル.作る({ kind: "sheets", title: "受け口の検査（表）" });
    await new Promise((r) => setTimeout(r, 900));
    /* ★ 「この表を 入れて」= cells では なく rows で 来る */
    const 出1 = K.sheets.セル({ rows: [["月", "人数", "売上"], ["4月", 12, 30000], ["5月", 18, 52000]] });
    /* ★ もの の形 {A5:"合計"} */
    const 出2 = K.sheets.セル({ cells: { A5: "合計", B5: "=SUM(B2:B3)" } });
    /* ★ 番地の ゆらぎ（小文字・範囲・cell という鍵・式に = が無い） */
    const 出3 = K.sheets.セル({ cells: [
      { cell: "a7", value: "小文字の 番地" },
      { ref: "A8:B9", value: "範囲で 来た" },
      { ref: "B7", formula: "SUM(C2:C3)" }
    ] });
    const c = K.いま(), body = K.本体(c);
    const sh = body.sheets[body.activeSheet || 0];
    const 読 = (r) => (sh.cells[r] || {}).v !== undefined ? sh.cells[r].v : (sh.cells[r] || {}).f;
    return {
      だめ: [出1.だめ, 出2.だめ, 出3.だめ].filter(Boolean),
      直し: [出1.直したところ, 出2.直したところ, 出3.直したところ].filter(Boolean),
      A1: 読("A1"), B2: 読("B2"), C3: 読("C3"),
      A5: 読("A5"), B5: 読("B5"),
      A7: 読("A7"), A8: 読("A8"), B7: 読("B7"),
      計算: 出2.計算した結果 || null
    };
  });
  ok("★ 表（rows）を そのまま 渡しても 断らない", S1.だめ.length === 0, S1.だめ);
  ok("表の 左上が A1 に 入る", S1.A1 === "月", S1);
  ok("表の 中身が 番地へ ほどける", S1.B2 === "12" && S1.C3 === "52000", S1);
  ok("もの の形 {A5:…} でも 入る", S1.A5 === "合計", S1);
  ok("小文字の 番地でも 入る", S1.A7 === "小文字の 番地", S1);
  ok("範囲（A8:B9）で 来たら 左上へ 入れる", S1.A8 === "範囲で 来た", S1);
  ok("★ 式の 先頭の = が 抜けていても 式として 入る", /^=/.test(String(S1.B7 || "")), S1.B7);
  ok("直した所を 黙らずに 返す", S1.直し.length > 0, S1.直し);
  ok("式が 計算される", S1.計算 && Object.keys(S1.計算).length > 0, S1.計算);

  /* ══════════════════════════════════════════════════════════════
     ③ スライド（Slides）— 詳しくは vqslides0820.cjs
     ══════════════════════════════════════════════════════════════ */
  節("③ スライド — 通しの 確かめ（詳細は vqslides0820.cjs）");
  const SL = await p.evaluate(async () => {
    const K = window.VQ2.workplace.cmd;
    await K.ファイル.作る({ kind: "slides", title: "受け口の検査（スライド）" });
    await new Promise((r) => setTimeout(r, 900));
    const 出 = K.slides.組む({
      slide: 1, replace: true,
      elements: [
        { type: "text", text: "まとめ<br>2 行目", x: 64, y: 48, w: 500, h: 120, size: 30, bold: true },
        { type: "表", rows: [{ 月: "4月", 人数: "12" }], x: 64, y: 220, w: 380, h: 110 },
        { type: "graph", x: 500, y: 220, w: 396, h: 250,
          chart: { type: "円グラフ", labels: ["A", "B"], series: [{ name: "数", data: [3, 7] }] } },
        { type: "rectangle", x: "10%", y: 480, w: 800, h: 6, fill: "#c7d2fe" }
      ]
    });
    const c = K.いま(), b2 = K.本体(c), es = b2.slides[0].elements;
    return { 置いた: es.length, 種類: es.map((e) => e.type),
             崩れ: ((出.見直した結果 || {}).見つかったもの || [])
               .filter((x) => ["はみ出し", "重なり", "文字が入りきらない"].indexOf(x.どこが) >= 0).length,
             文: (es.find((e) => e.type === "text") || {}).text,
             グラフ: (es.find((e) => e.type === "chart") || {}).chart };
  });
  ok("4 つとも 置けた", SL.置いた === 4, SL);
  ok("形の崩れが 0", SL.崩れ === 0, SL.崩れ);
  ok("<br> が 改行に なる", /まとめ\n2 行目/.test(SL.文 || ""), JSON.stringify(SL.文));
  ok("グラフが values を 持つ",
     SL.グラフ && SL.グラフ.series && Array.isArray(SL.グラフ.series[0].values), SL.グラフ);

  /* ══════════════════════════════════════════════════════════════
     ④ フォーム（Forms）
     ══════════════════════════════════════════════════════════════ */
  節("④ フォーム — 型の名前ちがい・選択肢・正解の番号");
  const F = await p.evaluate(async () => {
    const K = window.VQ2.workplace.cmd;
    await K.ファイル.作る({ kind: "forms", title: "受け口の検査（フォーム）" });
    await new Promise((r) => setTimeout(r, 900));
    const 出 = K.forms.まとめて({
      replace: true,
      fields: [
        /* 型の名前ちがい + 選択肢を 1 本の文字列 + 正解を 番号（0 から） */
        { type: "multiple_choice", question: "日本の 首都は？",
          options: "大阪\n東京\n京都\n名古屋", correct: 1, points: 2 },
        /* mcq + 読点区切り + 正解を 1 から の 番号 */
        { type: "mcq", label: "いちばん 大きい 数は？", choices: "3、7、5", correct: "2" },
        /* 日本語の 型名 */
        /* correctIndex は 0 から と 決まっている */
        { type: "選択", label: "好きな 果物は？", options: ["りんご", "みかん", "ぶどう"], correctIndex: 1 },
        { type: "長文", label: "感想を 書いてください" },
        { type: "星", label: "満足度" },
        { type: "日付", label: "いつ 行きますか" },
        /* 選択肢が 1 つしか 無い（前は 丸ごと 捨てていた） */
        { type: "single_choice", label: "ひとつしか 無い", options: ["はい"] },
        /* label ではなく title */
        { type: "short_text", title: "お名前" }
      ]
    });
    const c = K.いま(), b3 = K.本体(c);
    const fs = (b3.sections[0].fields || []);
    return {
      数: fs.length,
      型: fs.map((f) => f.type),
      問: fs.map((f) => f.label),
      一問目: fs[0] ? { opts: (fs[0].options || []).map((o) => o.label), correct: fs[0].correct, points: fs[0].points } : null,
      二問目: fs[1] ? { opts: (fs[1].options || []).map((o) => o.label), correct: fs[1].correct } : null,
      三問目: fs[2] ? { opts: (fs[2].options || []).map((o) => o.label), correct: fs[2].correct } : null,
      採点: !!(b3.settings && b3.settings.graded),
      直したところ: 出.直したところ || null,
      入れられなかった: 出.入れられなかったもの || null
    };
  });
  ok("★ 8 問とも 入った（1 問も 捨てていない）", F.数 === 8, { 数: F.数, だめ: F.入れられなかった });
  ok("multiple_choice → single_choice に なる", F.型[0] === "single_choice", F.型);
  ok("mcq → single_choice に なる", F.型[1] === "single_choice", F.型);
  ok("「長文」→ long_text に なる", F.型[3] === "long_text", F.型);
  ok("「星」→ star に なる", F.型[4] === "star", F.型);
  ok("「日付」→ date に なる", F.型[5] === "date", F.型);
  ok("★ 選択肢を 1 本の文字列（改行）で 渡しても 4 つに なる",
     F.一問目 && F.一問目.opts.length === 4, F.一問目);
  ok("★ 正解の 番号（0 から）を 選択肢の 文に 直す",
     F.一問目 && F.一問目.correct === "東京", F.一問目);
  ok("読点区切りの 選択肢も ほどける", F.二問目 && F.二問目.opts.length === 3, F.二問目);
  ok("★ 番号は 0 から を 先に 読む（correctIndex と 同じ約束）",
     F.二問目 && F.二問目.correct === "5", F.二問目);
  ok("★ correctIndex（0 から）は 迷わず 当てる",
     F.三問目 && F.三問目.correct === "みかん", F.三問目);
  ok("★ 選択肢が 足りない 問いは 捨てずに 短文へ 落とす", F.型[6] === "short_text", F.型);
  ok("label でなく title でも 問いに なる", F.問[7] === "お名前", F.問);
  ok("正解を 入れたら 自動採点に なる", F.採点 === true, F.採点);
  ok("直した所を 黙らずに 返す", Array.isArray(F.直したところ) && F.直したところ.length >= 3, F.直したところ);

  節("④ フォーム — 画面に 出ているか");
  const F2 = await p.evaluate(async (深く) => {
    await new Promise((r) => setTimeout(r, 1000));
    const 集 = eval(深く);
    return { 質問: 集("[data-fid]").length, 入力: 集("input,textarea,select").length };
  }, 深く);
  ok("質問が 画面に 出ている", F2.質問 >= 5, F2);

  節("⑤ 画面の 落ち");
  ok("画面が 落ちていない", 画面の失敗.length === 0, 画面の失敗.slice(0, 3));

  await b.close();
  console.log(印.join("\n"));
  console.log("\n══ 通った " + 済 + " / 落ちた " + 落 + " ══");
  if (落) console.log("落ちたもの:\n  - " + 落ち.join("\n  - "));
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error("例外: " + (e && e.stack || e)); process.exit(1); });
