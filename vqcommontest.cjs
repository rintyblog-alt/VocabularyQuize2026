/* ══════════════════════════════════════════════════════════════════════════
   vqcommontest.cjs — 「共通テスト風」が **本物の 紙面と 同じ 形か**を 測る

   訴え（2026-08-30・Rinty さん）
     「共通テスト風を選ぶと、本物の紙面を参考に、そのレイアウトになるように」

   参考にした 実物
     ・情報 I100 の 問題冊子（PDF 21 ページ・添付）
     ・数学② の 表紙（画像・添付）
     ・解答群の 組みかた（画像・添付）
     ・穴埋め枠の 作法（sutasapo の TeX 記事）
     ・マークシートの 寸法（Qiita KKTeX。1 行 5.05mm / 番号 4.35mm / 帯 67.5mm）

   ここは AI も サーバも 使わない。紙面を 組んで HTML を 直に 読む。
   使い方: node vqcommontest.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const { 器 } = require("./_h.cjs");
const root = 器();
const VQ2 = root.VQ2, MC = VQ2.mockCompiler, L = VQ2.layout, R = VQ2.pdfRenderer, LP = VQ2.layoutProfiles;

let 済 = 0, 落 = 0;
const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + String(追).slice(0, 200) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + String(追).slice(0, 400) : "")); }
};

function 試験(o) {
  o = o || {};
  const p = MC.plan({ title: o.title || "情報", subject: o.subject || "情報",
    durationMinutes: 60, totalPoints: 100, sectionCount: o.sectionCount || 2,
    questionCount: o.questionCount || 6, types: { multiple_choice_single: true },
    difficulty: "mixed", allowExternalKnowledge: true, requireSources: false });
  const 記 = ["セ", "ソ", "タ", "チ", "ツ", "テ", "ト", "ナ"];
  const 語 = o.choices || [{ text: "A" }, { text: "C" }, { text: "Q" }, { text: "a" }];
  const filled = {};
  let i = 0;
  p.sections.forEach((s) => s.questions.forEach((q) => {
    const k = 記[i++ % 記.length];
    filled[q.id] = { question: "空欄【" + k + "】に入るものを一つ選べ。なお【" + k + "】は再掲である。",
      type: "multiple_choice_single", answer: 語[0].text, explanation: "かいせつ", choices: 語 };
  }));
  const a = MC.assemble(p, filled, {});
  const spec = a.spec;
  spec.id = "ct-" + Math.random().toString(36).slice(2, 8);
  spec.cover = Object.assign({
    examName: "情報", subject: "情報", paperNumber: "①", subjectDetail: "『情報Ⅰ』",
    lead: "『旧情報（仮）』の問題冊子は、出願時に受験を希望した者に配付します。",
    instructions: ["出題科目、ページ及び選択方法は、下表のとおりです。",
      "解答用紙に、正しく記入・マークされていない場合は、採点できないことがあります。"],
    noticeTable: { after: 1, header: ["出題科目", "ページ", "選択方法"],
      rows: [["『情報Ⅰ』", "3〜21", "左の科目を解答しなさい。"]] },
    bookletCode: "2604"
  }, o.cover || {});
  spec.layout = { layoutMode: "common-test",
    answerSheetMode: o.answerSheetMode || "common-test-mark", outputEngine: "current" };
  return spec;
}
function 組む(spec, kind) {
  const plan = L.buildPlan(spec);
  const b = (plan.booklets || []).filter((x) => x.kind === (kind || "question"))[0];
  return { plan: plan, html: b ? String(R.buildHtml(spec, plan, { bookletId: b.id })) : "" };
}

/* ══ ① 型が つながっている ══════════════════════════════════ */
節("① 「共通テスト風」を 選ぶと 本物の 型が 効く");
{
  const spec = 試験();
  const { plan } = 組む(spec);
  const lp = plan.layoutProfile || {};
  見(lp.layoutProfileId === "exam-common-test", "問題用紙は exam-common-test", lp.layoutProfileId);
  見(lp.coverStyle === "common-test", "★ 表紙の 組みかたが 本物へ 切り替わる", lp.coverStyle);
  見(lp.answerSheetProfileId === "exam-common-test-answer",
     "解答用紙は 共通テストの マークシート", lp.answerSheetProfileId);
  見(plan.paper.size === "B5", "問題冊子は B5（実物と 同じ）", plan.paper.size);
  const m = LP.ANSWER_SHEET_MODES.filter((x) => x.id === "common-test-mark")[0];
  見(!!m && m.ready === true, "選び口に 出る（使えるふりでは ない）", JSON.stringify(m));
}

/* ══ ② 表紙 ════════════════════════════════════════════════ */
節("② 表紙 — 実物（数学② / 情報 I100）と 同じ 並び");
{
  const spec = 試験();
  const { html } = 組む(spec);
  見(/class="sheet ct-cover"/.test(html), "共通テストの 表紙で 出る");
  見(/ct-seal[^>]*>試験開始の指示があるまで、この問題冊子の中を見てはいけません。/.test(html),
     "★ いちばん上に 開封を 止める 枠");
  見(/class="ct-title"/.test(html) && /class="ct-sp"/.test(html),
     "教科名は 中央・字間を 空ける");
  見(/class="ct-no">①/.test(html), "冊子の 丸数字（①）が 題の 右に 付く");
  見(/class="ct-sub">『情報Ⅰ』/.test(html), "科目の 内訳（『情報Ⅰ』）が 出る");
  見(/class="ct-pts"><div>100 点<\/div><div>60 分<\/div>/.test(html),
     "★ 右上の 小さな 枠に 満点と 時間（この 順）");
  見(/Ⅰ　注意事項/.test(html), "Ⅰ 注意事項");
  見(/Ⅱ　解答上の注意/.test(html), "Ⅱ 解答上の注意");
  見(/class="ct-tb"/.test(html) && /出 題 科 目/.test(html),
     "★ 注意事項の 中に 表（見出しの 字は 割る）");
  見(/3〜21/.test(html), "表の 中身が 出る");
  見(/class="ct-foot"/.test(html) && /— 1 —/.test(html), "下に ページ番号");
  見(/class="ct-code">2604/.test(html), "右下に 冊子の 記号");
  /* ★ 値が 無い ものは 出さない。 */
  const 素 = 試験({ cover: { lead: "", noticeTable: null, bookletCode: "", instructions: [] } });
  const h2 = 組む(素).html;
  見(!/class="ct-lead"/.test(h2), "リード文が 無ければ 出さない");
  見(!/class="ct-tb"/.test(h2), "表が 無ければ 出さない");
  見(!/class="ct-code"/.test(h2), "記号が 無ければ 出さない");
  見(/ct-seal/.test(h2), "開封を 止める 枠は いつも 出す（本物は 例外なく ある）");
}

/* ══ ③ 解答群 ══════════════════════════════════════════════ */
節("③ 解答群 — 枠の 上の 線を 切って 札を 乗せる");
{
  const spec = 試験();
  const { html } = 組む(spec);
  見(/class="agr"/.test(html), "解答群の 枠が 出る");
  見(/class="agr-t"><span class="agr-k">セ<\/span>の解答群/.test(html),
     "★ 札は「［セ］の解答群」");
  見(/class="agr-m">⓪</.test(html), "★ 丸数字は **⓪ から**（実物と 同じ）");
  見(/①/.test(html) && /②/.test(html), "①②… と 続く");
  見(!/class="ch c/.test(html), "ふつうの 選択肢の 並びには しない");

  /* 列の 数は 中身の 長さで 決める（実物で 数えた）。 */
  const 短 = 組む(試験({ choices: [{text:"A"},{text:"C"},{text:"Q"},{text:"a"},
    {text:"w"},{text:"4"},{text:"8"},{text:"#"}] })).html;
  見(/agr-l c4/.test(短), "★ 1 字の 選択肢は 4 列", (短.match(/agr-l c\d/) || [])[0]);
  const 中 = 組む(試験({ choices: ["0111011","0110001","0100001","0111111",
    "1100001","1011001","1010110","1011100"].map((t) => ({ text: t })) })).html;
  見(/agr-l c4/.test(中), "★ 7 字の 2 進数も 4 列（実物と 同じ）", (中.match(/agr-l c\d/) || [])[0]);
  const 長 = 組む(試験({ choices: [
    { text: "文字コードの先頭から5ビットが10100である" },
    { text: "文字コードの上位3ビットが101である" },
    { text: "文字コードから0011を引くと1010000になる" },
    { text: "文字コードに0011を加えると1010011になる" }] })).html;
  見(/agr-l c1/.test(長), "★ 長い 文は 1 列（実物と 同じ）", (長.match(/agr-l c\d/) || [])[0]);
}

/* ══ ④ 穴埋め枠 ════════════════════════════════════════════ */
節("④ 穴埋め枠 — 初めては 太く、2 度目からは 細く");
{
  const spec = 試験();
  const { html } = 組む(spec);
  const 枠 = html.match(/<span class="bx[^"]*">[^<]+<\/span>/g) || [];
  見(枠.length >= 2, "本文の【ア】が 枠に なる", 枠.length + " 個");
  見(枠.some((x) => /class="bx">/.test(x)), "★ 初めての 枠は 太い（bx だけ）");
  見(枠.some((x) => /is-again/.test(x)), "★ 2 度目からは 細い（is-again）");
  /* 書いていない 記号を 勝手に 作らない。 */
  const 無 = 試験();
  無.sections.forEach((s) => s.questions.forEach((q) => { q.prompt = "枠の 無い 問題文です。"; }));
  const h3 = 組む(無).html;
  見(!/class="bx/.test(h3), "★ 書いていなければ 枠を 作らない");
}

/* ══ ⑤ マークシート ════════════════════════════════════════ */
節("⑤ 解答用紙 — 本物の マークシート");
{
  const spec = 試験({ questionCount: 8 });
  const { html } = 組む(spec, "answer-sheet");
  見(/class="ms"/.test(html), "マークシートで 出る");
  見(/解答科目/.test(html), "解答科目の 欄");
  見(/受験番号/.test(html), "受験番号の 欄");
  見(/氏名/.test(html), "氏名の 欄");
  const 桁 = (html.match(/class="ms-exc"/g) || []).length;
  見(桁 === 8, "受験番号は 8 桁", 桁);
  const 行 = (html.match(/class="ms-r/g) || []).length;
  見(行 === 30, "★ 8 問なら 30 行（1 列ぶん。60 行 出さない）", 行);
  const 丸 = ((html.match(/class="ms-m">((?:<i>[^<]*<\/i>)+)/) || [])[1] || "").match(/<i>/g);
  見(丸 && 丸.length === 10, "1 行に ⓪〜⑨ の 10 個", 丸 ? 丸.length : 0);
  見(/--ms-h:5\.05mm/.test(html), "★ 1 行 5.05mm（実物の 再現から）");
  見(/--ms-l:4\.35mm/.test(html), "★ 番号の 欄 4.35mm");
  見(/--ms-w:67\.5mm/.test(html), "★ マークの 帯 67.5mm");
  /* 設問が 多いと 列が 増える。 */
  const 多 = 組む(試験({ questionCount: 40, sectionCount: 5 }), "answer-sheet").html;
  見((多.match(/class="ms-col"/g) || []).length === 2, "40 問なら 2 列",
     (多.match(/class="ms-col"/g) || []).length);
}

/* ══ ⑥ 落ちどころ ══════════════════════════════════════════ */
節("⑥ 落ちどころ");
{
  /* ほかの 型を 選んだら、これまでの 表紙に 戻る。 */
  const spec = 試験();
  spec.layout = { layoutMode: "standard-exam", answerSheetMode: "current", outputEngine: "current" };
  const h = 組む(spec).html;
  見(!/class="sheet ct-cover"/.test(h), "ほかの 型では 共通テストの 表紙に しない");
  見(!/<div class="agr" /.test(h), "ほかの 型では 解答群の 枠に しない");
  /* 型なし。 */
  const 無 = 試験();
  delete 無.layout;
  const h2 = 組む(無).html;
  見(!/class="sheet ct-cover"/.test(h2), "型を 選んでいなければ これまでどおり");
  見(h2.length > 500, "それでも 紙面は 出る", h2.length + " 字");
}

console.log("\n────────────────────────────────");
console.log("通った: " + 済 + " / 落ちた: " + 落);
if (落ち.length) console.log("落ちたもの:\n  - " + 落ち.join("\n  - "));
process.exit(落 ? 1 : 0);
