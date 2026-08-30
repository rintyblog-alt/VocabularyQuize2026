/* ══════════════════════════════════════════════════════════════════════════
   vqlayouts.cjs — **紙面と 解答用紙の 型を 1 つずつ** 組んで 確かめる

   依頼（2026-08-30・Rinty さん）
     「共通テスト風 以外の 問題用紙と 解答用紙を 作り込もう。
       既存の 全ての 種類を 作り込んで ください。1 つ 1 つ 丁寧に」

   直す前に 測って 分かった こと:
     ★ **解答用紙の 型は 1 つも 効いていなかった。**
       問題用紙が「現在の形式」だと 丸ごと 帰る 作りで、
       9 種類 どれを 選んでも 中身は 同じ 1,624 字だった。
     ★ 解答用紙は **問題用紙の 紙**に 乗っていた。
       共通テストの マークシート（A4 横）が B5 縦に 出ていた。
     ★ 問題用紙の 型の 違いは **余白と 文字の 大きさ だけ**。
       組みかたは 12 種類 とも 同じで、刷り上がりを 並べても 見分けが
       つかなかった（class の 並びが 共通テスト 以外 全部 同じ）。
     ★ 3 種類（2 カラム・語彙の 表・冊子）と 縦書きは 名前だけで 中身が 無かった。
     ★ ページ分けが 高さを 22% 少なく 見積もっていた
       （設問の 空きが **上マージン**で 付いているのに 下マージンだけ 足していた）。
     ★ 「AI おまかせ」は 一覧の 先頭を 返すだけで、教科を 見ていなかった。

   使い方: VQ_BASE=http://127.0.0.1:8791 node vqlayouts.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const { chromium } = require("playwright");
const { 器 } = require("./_h.cjs");
const root = 器();
const VQ2 = root.VQ2, MC = VQ2.mockCompiler, L = VQ2.layout, R = VQ2.pdfRenderer,
      AG = VQ2.aigen, LP = VQ2.layoutProfiles;

let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + String(追).slice(0, 190) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + String(追).slice(0, 320) : "")); }
};

/* ── 測る 元に する 試験。どの 型でも 同じ 中身で 組む ───────────── */
function 試験(o) {
  o = o || {};
  const p = MC.plan({ seed: o.seed || "lay", title: "たしかめ試験", subject: o.subject || "地理総合",
    durationMinutes: 50, totalPoints: 60, sectionCount: 2, questionCount: o.n || 14,
    types: o.types || { multiple_choice_single: true, fill_blank: true,
                        short_answer: true, long_answer: true },
    difficulty: "mixed", allowExternalKnowledge: true, requireSources: false });
  const qs = p.sections.reduce((a, s) => a.concat(s.questions), []);
  const f = {};
  qs.forEach((q, i) => {
    const b = { id: "x" + i, explanation: "解説を 書く。".repeat(3),
                question: "設問 " + (i + 1) + " の 本文を 読んで 答えよ。".repeat(2) };
    if (q.type === "long_answer") f[q.id] = Object.assign(b, { type: "long_answer", answer: "答え", expectedChars: 120 });
    else if (q.type === "short_answer") f[q.id] = Object.assign(b, { type: "short_answer", answer: "こたえ" });
    else if (q.type === "numeric") f[q.id] = Object.assign(b, { type: "numeric", answer: "12" });
    else if (q.type === "english_writing") f[q.id] = Object.assign(b, { type: "english_writing", answer: "a", expectedChars: 200 });
    else if (q.type === "source_analysis") f[q.id] = Object.assign(b, { type: "source_analysis", answer: "a", expectedChars: 150 });
    else if (q.type === "fill_blank") f[q.id] = Object.assign(b, { type: "fill_blank",
      question: "本文の 【ア】・【イ】 に 入る 語を 選べ。", answer: ["母集団", "標本"],
      blanks: [{ answer: "母集団" }, { answer: "標本" }],
      choices: ["母集団", "標本", "度数", "階級", "中央値", "相対度数"] });
    else f[q.id] = Object.assign(b, { type: "single_choice",
      choices: ["ああああ", "いいいい", "うううう", "ええええ"], answer: "ああああ" });
    /* ★ 図と 資料は **形式に よらず** 付ける（2026-08-30）。
       単一選択の ときだけ 付けていたので、枠の 割り当てしだいで
       図が 1 枚も 出ない 回が あった。 */
    if (i === 2) f[q.id].materials = [{ type: "chart", chartType: "bar", caption: "図1 人数",
      labels: ["A", "B"], series: [{ name: "人", values: [3, 6] }] }];
    if (i === 5) f[q.id].materials = [{ type: "source", text: "資料の 本文。".repeat(8), caption: "資料1" }];
    f[q.id] = AG.toClientShape(f[q.id], i);
  });
  const sp = MC.assemble(p, f, {}).spec;
  sp.cover = { examName: "たしかめ試験", subject: o.subject || "地理総合", grade: "高校2年",
               examDate: "2026年8月30日",
               instructions: ["開始の 合図が あるまで 開いては いけません。",
                              "解答は すべて 解答用紙に 記入しなさい。",
                              "試験時間は 50 分です。"],
               studentFields: ["年", "組", "番", "氏名"] };
  sp.layout = { layoutMode: o.mode || "current", answerSheetMode: o.as || "current",
                outputEngine: "current", layoutSeed: "s1" };
  return sp;
}

/* 実際に 置いて 測る（ページ分けは script が やるので 画面が 要る）。 */
async function 組む(page, sp, kind) {
  const plan = L.buildPlan(sp);
  const bk = (plan.booklets || []).find((b) => b.kind === (kind || "question"));
  if (!bk) return null;
  const html = String(R.buildHtml(sp, plan, { bookletId: bk.id }));
  await page.setContent(html, { waitUntil: "load" });
  await new Promise((r) => setTimeout(r, 500));
  const m = await page.evaluate(() => {
    const mm = 96 / 25.4;
    const pages = Array.from(document.querySelectorAll(".page"));
    const sh0 = document.querySelector('.page:not([data-cover]) .sheet') || document.querySelector(".sheet");
    const 縦 = !!sh0 && getComputedStyle(sh0).writingMode.indexOf("vertical") === 0;
    return {
      ページ: pages.length,
      表紙: document.querySelectorAll('[data-cover="1"]').length,
      はみ出し: document.querySelectorAll("[data-overflowing]").length,
      中身: pages.map((p) => {
        const sh = p.querySelector(".sheet");
        if (!sh) return { h: 0, w: 0 };
        return { h: Math.round(sh.scrollHeight / mm), w: Math.round(sh.scrollWidth / mm),
                 表紙: p.getAttribute("data-cover") === "1" };
      }),
      縦書き: 縦,
      クラス: Array.from(document.querySelectorAll(".page,.sheet"))
        .map((e) => e.className).filter((c) => /ps-|as-/.test(c))[0] || "",
      html: document.body.innerHTML
    };
  });
  /* ★ 見るのは **組み上がった あと**の HTML（m.html）。
     buildHtml の 返り値は ページ分けの 前なので、2 段の .cols は まだ 無い。 */
  return { plan, m, html: m.html, 生: html };
}

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1100, height: 1500 } });
  const page = await ctx.newPage();
  const 例外 = [];
  page.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 200)));

  /* ══ ① 解答用紙の 型が **単独で** 効く ══════════════════════════ */
  節("① 解答用紙の 型が 単独で 効く（前は 1 つも 効いていなかった）");
  {
    const 出 = {};
    for (const m of LP.ANSWER_SHEET_MODES) {
      const r = await 組む(page, 試験({ mode: "current", as: m.id }), "answer-sheet");
      出[m.id] = r ? r.m.html.replace(/\s+/g, "").length : 0;
    }
    const 種類 = new Set(Object.values(出));
    見(種類.size >= 6, "★ 9 種類が それぞれ 別の 中身に なる（前は 全部 同じ）",
       JSON.stringify(出));
    見(出["current"] !== 出["grid-standard"], "★ 問題用紙が「現在の形式」でも 解答用紙が 変わる",
       出["current"] + " → " + 出["grid-standard"]);
  }

  /* ══ ② 解答用紙は **自分の 用紙**で 組む ═══════════════════════ */
  節("② 解答用紙は 自分の 用紙で 組む");
  {
    const sp = 試験({ mode: "common-test", as: "common-test-mark" });
    const plan = L.buildPlan(sp);
    const ab = (plan.booklets || []).find((x) => x.kind === "answer-sheet");
    const h = String(R.buildHtml(sp, plan, { bookletId: ab.id }));
    const size = (h.match(/@page \{\s*size: ([^;]+);/) || [])[1] || "";
    見(/297mm 210mm/.test(size), "★ 共通テストの マークシートは A4 横（前は B5 縦だった）", size);
    const qb = (plan.booklets || []).find((x) => x.kind === "question");
    const hq = String(R.buildHtml(sp, plan, { bookletId: qb.id }));
    const sq = (hq.match(/@page \{\s*size: ([^;]+);/) || [])[1] || "";
    見(/182mm 257mm/.test(sq), "問題用紙は これまでどおり B5 縦", sq);
  }

  /* ══ ③ 問題用紙の 型を 1 つずつ ════════════════════════════════ */
  節("③ 問題用紙の 型を 1 つずつ");
  const 見どころ = {
    "standard-exam":      { 型: "ps-standard",  見: (h) => /class="name-box"/.test(h), 何: "氏名欄が ある" },
    "compact-exam":       { 型: "ps-compact",   見: (h) => /class="exam-meta"/.test(h), 何: "見出しに 教科・満点が 並ぶ" },
    "two-column":         { 型: "ps-twocol",    見: (h) => /class="cols"/.test(h) && /class="col"/.test(h), 何: "2 列に 割れる" },
    "spacious-worksheet": { 型: "ps-worksheet", 見: (h) => /class="q"/.test(h), 何: "設問が 出る" },
    "entrance-exam":      { 型: "ps-entrance",  見: (h) => !/class="name-box"/.test(h), 何: "本文に 氏名欄を 出さない" },
    "source-based-exam":  { 型: "ps-source",    見: (h) => /class="src/.test(h), 何: "資料の 枠が 出る" },
    "english-test":       { 型: "ps-english",   見: (h) => /class="q"/.test(h), 何: "設問が 出る" },
    "math-test":          { 型: "ps-math",      見: (h) => /class="q"/.test(h), 何: "設問が 出る" },
    "vocabulary-test":    { 型: "ps-vocab",     見: (h) => /class="vt-r"/.test(h) && /class="vt-a"/.test(h), 何: "1 行 1 問の 表＋解答欄" },
    "booklet":            { 型: "ps-booklet",   見: (h) => /is-verso/.test(h), 何: "のどが 見開きで 入れ替わる" },
    "minimal-premium":    { 型: "ps-minimal",   見: (h) => /class="q"/.test(h), 何: "設問が 出る" },
    "school-science-figure": { 型: "ps-figure", 見: (h) => /class="fig"/.test(h) || /class="qfg/.test(h), 何: "図が 出る" },
    "vertical-japanese":  { 型: "ps-vertical",  見: (h) => /class="sec-no">[一二三]/.test(h), 何: "大問が 漢数字" },
    "common-test":        { 型: "",             見: (h) => /ct-run|ct-cover/.test(h), 何: "共通テストの 組み" }
  };
  for (const [mode, k] of Object.entries(見どころ)) {
    const sp = 試験({ mode: mode, as: "current" });
    const r = await 組む(page, sp, "question");
    const prof = (r.plan.layoutProfile && r.plan.layoutProfile.layoutProfileId) || "-";
    見(prof !== "-", mode + "：型の 中身が ある", prof);
    if (k.型) 見(r.m.クラス.indexOf(k.型) >= 0, mode + "：紙に 型の 名札が 付く", r.m.クラス);
    見(k.見(r.html), mode + "：" + k.何);
    /* 紙から はみ出していない（ページ分けの 数え違いを 見つける）。 */
    const p = r.plan.paper;
    const 縦 = p.writingDirection === "vertical";
    const 限 = 縦 ? (p.widthMm - p.margins.left - p.margins.right)
                  : (p.heightMm - p.margins.top - p.margins.bottom);
    const 超 = r.m.中身.filter((x) => !x.表紙 && (縦 ? x.w : x.h) > 限 + 2);
    見(超.length === 0, mode + "：どの ページも 紙から はみ出さない",
       "上限 " + 限 + "mm ／ " + r.m.中身.map((x) => (縦 ? x.w : x.h)).join(","));
    見(r.m.はみ出し === 0, mode + "：1 つの かたまりが 紙より 大きい ものは 無い");
  }

  /* ══ ④ 型どうしが 見分けられる ════════════════════════════════ */
  節("④ 型どうしが 見分けられる（前は 余白しか 違わなかった）");
  {
    const 印 = {};
    for (const mode of Object.keys(見どころ)) {
      const sp = 試験({ mode: mode, as: "current" });
      const plan = L.buildPlan(sp);
      const bk = (plan.booklets || []).find((x) => x.kind === "question");
      const h = String(R.buildHtml(sp, plan, { bookletId: bk.id }));
      const css = (h.match(/<style[\s\S]*?<\/style>/) || [""])[0];
      印[mode] = (css.match(/\.(ps-[a-z]+|ct-[a-z]+)/g) || []).length;
    }
    const 効いた = Object.entries(印).filter(([, n]) => n > 0);
    見(効いた.length === Object.keys(見どころ).length,
       "★ 14 種類 すべてに 型ごとの 組みかたが 入る",
       JSON.stringify(印));
  }

  /* ══ ⑤ 解答用紙の 型を 1 つずつ ═══════════════════════════════ */
  節("⑤ 解答用紙の 型を 1 つずつ");
  const 解の見どころ = {
    "grid-standard":  { 型: "as-gridstd",   見: (h) => /agc-wide/.test(h), 何: "罫線の 欄" },
    "grid-dense":     { 型: "as-griddense", 見: (h) => /agc-wide/.test(h), 何: "詰めた 罫線の 欄" },
    "written-heavy":  { 型: "as-written",   見: (h) => (h.match(/agc-line"/g) || []).length >= 8, 何: "記述の 行が 多い" },
    "math-work":      { 型: "as-mathwork",  見: (h) => (h.match(/agc-line"/g) || []).length >= 8, 何: "計算の 行が ある" },
    "english-boxes":  { 型: "as-engbox",    見: (h) => /agc-sq/.test(h), 何: "連続マス" },
    "mark-sheet":     { 型: "as-markonly",  見: (h) => /agc-mark is-circle/.test(h), 何: "丸の マーク" },
    "common-test-mark": { 型: "as-ctmark",  見: (h) => /ms-o/.test(h), 何: "⓪〜⑨ の 丸" }
  };
  for (const [as, k] of Object.entries(解の見どころ)) {
    const sp = 試験({ mode: "current", as: as, subject: "数学I",
      types: { multiple_choice_single: true, short_answer: true, long_answer: true, numeric: true } });
    const r = await 組む(page, sp, "answer-sheet");
    見(!!r, as + "：解答用紙が 組める");
    if (!r) continue;
    見(r.m.クラス.indexOf(k.型) >= 0, as + "：紙に 型の 名札が 付く", r.m.クラス);
    見(k.見(r.html), as + "：" + k.何);
    見((r.html.match(/class="exam-head"/g) || []).length === 0,
       as + "：見出しが 二重に ならない");
    if (as !== "common-test-mark") {
      見(/ags-l/.test(r.html), as + "：氏名の 欄が ある");
      見(/agf-tl/.test(r.html), as + "：合計の 欄に 札が ある");
    }
  }

  /* ══ ⑥ 解答欄の 数が 設問の 数と 合う ══════════════════════════ */
  節("⑥ 解答欄の 数が 設問の 数と 合う");
  for (const as of ["grid-standard", "grid-dense", "written-heavy", "math-work", "english-boxes", "mark-sheet"]) {
    const sp = 試験({ mode: "current", as: as });
    const 問 = sp.sections.reduce((a, s) => a + s.questions.length, 0);
    const plan = L.buildPlan(sp);
    const ab = (plan.booklets || []).find((x) => x.kind === "answer-sheet");
    const h = String(R.buildHtml(sp, plan, { bookletId: ab.id }));
    const 欄 = (h.match(/data-binding="/g) || []).length;
    見(欄 === 問, as + "：解答欄 " + 欄 + " ／ 設問 " + 問);
  }

  /* ══ ⑦ AI おまかせが 中身で 選ぶ ══════════════════════════════ */
  節("⑦ AI おまかせが 中身で 選ぶ（前は いつも 同じ 紙面）");
  {
    const 表 = [
      ["数学I", { numeric: true, short_answer: true }],
      ["英語", { english_writing: true, multiple_choice_single: true }],
      ["国語", { long_answer: true, source_analysis: true }]
    ].map(([sub, t]) => {
      const sp = 試験({ mode: "auto", as: "auto", subject: sub, types: t, n: 10 });
      const plan = L.buildPlan(sp);
      const lp = plan.layoutProfile || {};
      return [sub, lp.layoutProfileId || "-", lp.answerSheetProfileId || "-"];
    });
    const 紙 = new Set(表.map((x) => x[1])), 解 = new Set(表.map((x) => x[2]));
    見(紙.size === 3, "★ 教科ごとに 別の 問題用紙を 選ぶ", JSON.stringify(表.map((x) => x[0] + "→" + x[1])));
    見(解.size >= 2, "★ 教科ごとに 別の 解答用紙を 選ぶ", JSON.stringify(表.map((x) => x[0] + "→" + x[2])));
    見(表[0][1] === "exam-math", "数学は 数学の 紙面", 表[0][1]);
    見(表[1][1] === "exam-english", "英語は 英語の 紙面", 表[1][1]);
  }

  /* ══ ⑧ 2 カラムの 中身 ════════════════════════════════════════ */
  節("⑧ 2 カラムの 中身");
  {
    const sp = 試験({ mode: "two-column", as: "current", n: 20,
      types: { multiple_choice_single: true, short_answer: true } });
    const r = await 組む(page, sp, "question");
    const 列 = await page.evaluate(() => {
      const mm = 96 / 25.4;
      return Array.from(document.querySelectorAll(".page")).map((p) => {
        const cs = Array.from(p.querySelectorAll(".col"));
        return { 数: cs.length, 高: cs.map((c) => Math.round(c.scrollHeight / mm)),
                 中: cs.map((c) => c.children.length) };
      });
    });
    const 本 = 列.filter((x) => x.数 > 0);
    見(本.length >= 1, "2 列の ページが できる", JSON.stringify(列));
    見(本.every((x) => x.数 === 2), "どの ページも 2 列");
    const 限 = 297 - 20 - 18;
    見(本.every((x) => x.高.every((h) => h <= 限 + 2)), "★ 列が 紙から はみ出さない",
       JSON.stringify(本.map((x) => x.高)));
    const 最後 = 本[本.length - 1];
    見(最後.中[1] > 0, "★ 最後の ページも 2 列を 埋める（右が 真っ白に ならない）",
       JSON.stringify(最後.中));
  }

  /* ══ ⑨ 冊子の 中身 ════════════════════════════════════════════ */
  節("⑨ 冊子の 中身");
  {
    const sp = 試験({ mode: "booklet", as: "current" });
    const r = await 組む(page, sp, "question");
    見(r.m.表紙 === 2, "★ 表紙 と 注意事項の ページが 分かれる", r.m.表紙);
    const のど = await page.evaluate(() => Array.from(document.querySelectorAll(".page .sheet"))
      .map((s) => { const c = getComputedStyle(s);
        return Math.round(parseFloat(c.paddingLeft)) + "/" + Math.round(parseFloat(c.paddingRight)); }));
    見(のど.length >= 4 && のど[0] !== のど[1], "★ のどが 見開きで 入れ替わる", のど.join(" "));
  }

  /* ══ ⑩ 縦書きの 中身 ══════════════════════════════════════════ */
  節("⑩ 縦書きの 中身");
  {
    const sp = 試験({ mode: "vertical-japanese", as: "current", subject: "国語" });
    const r = await 組む(page, sp, "question");
    見(r.m.縦書き, "★ 右から 左へ 組む");
    const v = await page.evaluate(() => {
      const mm = 96 / 25.4;
      const ps = Array.from(document.querySelectorAll('.page:not([data-cover])'));
      return { 幅: ps.map((p) => Math.round(p.querySelector(".sheet").scrollWidth / mm)),
               大問: Array.from(document.querySelectorAll(".sec-no")).map((e) => e.textContent.trim()),
               表紙は横: (() => { const c = document.querySelector('[data-cover] .sheet');
                 return c ? getComputedStyle(c).writingMode : ""; })() };
    });
    見(v.大問.every((x) => /^[一二三四五六七八九十]+$/.test(x)), "★ 大問が 漢数字", v.大問.join(","));
    見(v.幅.every((w) => w <= 182 - 18 - 18 + 2), "★ ページが 紙から はみ出さない（幅で 数える）",
       v.幅.join(","));
    見(/horizontal/.test(v.表紙は横), "表紙は 横に 組む（実物も そう）", v.表紙は横);
  }

  節("⑪ 例外");
  見(例外.length === 0, "画面の 例外 0 件", 例外.slice(0, 3).join(" / "));

  console.log("\n────────────────────────────────");
  console.log("通った: " + 済 + " / 落ちた: " + 落);
  if (落) console.log("落ちたもの:\n  - " + 落ち.join("\n  - "));
  await b.close();
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
