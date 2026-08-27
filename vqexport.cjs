/* ══════════════════════════════════════════════════════════════════════
   プリセットの書き出し（印刷・PDF / HTML / Markdown / テキスト / CSV / JSON）

   実測 2026-08-12: 書き出しのボタンを **もう使われていない画面**
   （#presetOverlay。CSS で display:none にしてある）へ付けていたため、
   利用者の画面には 1 つも出ていなかった。
   いまの編集画面は preset-studio。設定シートと右上と「…」から開ける。

   ここで見るのは 2 つ。
     ・20 のエンジンすべてで、答えと中身が正しく取り出せる（形式は 133 種ある。
       形式ごとに書き分けると必ず取りこぼすので、エンジンで見る）
     ・その口が **実際に画面から開ける**（設定 → 書き出し → 6 つの形）

   前半は AI もブラウザも使わない。後半だけ http://127.0.0.1:8791 が要る。
   使い方: node vqexport.cjs       （ブラウザまで見る）
           node vqexport.cjs --no-ui（前半だけ）
   ══════════════════════════════════════════════════════════════════════ */
const fs = require("fs");
const path = require("path");
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

const INDEX = require("./vqsrc.cjs").丸ごと();

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => {
  c ? (pass++, console.log("  ok   " + n))
    : (fail++, bad.push(n), console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 260) : "")));
};
const section = (t) => console.log("\n══ " + t + " ══");

/* 書き出しの部品だけを取り出して動かす。**テスト側へ書き写さない**（写すと古くなる）。 */
function loadExporter() {
  const s = INDEX.indexOf("  var EXPORT = (function () {");
  const e = INDEX.indexOf("  /* condition は画面を持たない部分");
  if (s < 0 || e < 0 || e <= s) throw new Error("書き出しの部品が見つかりません");
  const SHORT = {
    multiple_choice_single: "4択", multiple_choice_multiple: "複数選択", true_false: "正誤",
    short_answer: "短答", numeric: "数値", fill_blank: "穴埋め", ordering: "並べ替え",
    matching: "組み合わせ", classification: "分類", table_fill: "表完成",
    error_correction: "誤り訂正", long_answer: "記述", flashcard: "カード",
    dictation: "書き取り", image_point: "画像内の位置", image_label: "ラベル配置",
    chart_read: "図表の読み取り", composite: "複合大問"
  };
  const VQ2 = { qtypes: { shortLabel: (id) => SHORT[id] || String(id), engineOf: () => null } };
  return new Function("VQ2", INDEX.slice(s, e) + "\nreturn EXPORT;")(VQ2);
}
const X = loadExporter();

/* ── 見本のプリセット。エンジンを 18 種ならべる ─────────────────── */
const Q = (o) => Object.assign({ points: 2, prompt: "", explanation: "" }, o);
const PRESET = {
  name: "書き出しの見本 / テスト",
  description: "エンジンごとの出方を確かめるための見本です。",
  questions: [
    Q({ id: "q1", type: "multiple_choice_single", engine: "single_choice",
        prompt: "感染症の三原則に含まれないものはどれか。", correctAnswer: "c3",
        choices: [{ id: "c1", label: "ア", text: "感染源対策" }, { id: "c2", label: "イ", text: "感染経路対策" },
                  { id: "c3", label: "ウ", text: "栄養素対策", isCorrect: true }],
        explanation: "三原則は感染源・感染経路・宿主である。" }),
    Q({ id: "q2", type: "multiple_choice_multiple", engine: "multi_choice",
        prompt: "正しいものをすべて選べ。", correctAnswer: ["c1", "c3"],
        choices: [{ id: "c1", label: "ア", text: "手を洗う", isCorrect: true },
                  { id: "c2", label: "イ", text: "換気をしない" },
                  { id: "c3", label: "ウ", text: "十分に眠る", isCorrect: true }] }),
    Q({ id: "q3", type: "true_false", engine: "true_false", prompt: "潜伏期間は感染から発症までの期間である。",
        correctAnswer: "t", choices: [{ id: "t", label: "○", text: "正しい", isCorrect: true },
                                      { id: "f", label: "×", text: "誤り" }] }),
    Q({ id: "q4", type: "short_answer", engine: "text_input", prompt: "日本の初代内閣総理大臣はだれか。",
        correctAnswer: "伊藤博文", acceptedAnswers: ["いとうひろぶみ"] }),
    Q({ id: "q5", type: "numeric", engine: "numeric_input", prompt: "12 × 12 はいくつか。", correctAnswer: "144" }),
    Q({ id: "q6", type: "fill_blank", engine: "fill_blank",
        prompt: "初代は【1】で、その次は【2】である。",
        blanks: [{ id: "b1", label: "1", answer: "伊藤博文" }, { id: "b2", label: "2", answer: "黒田清隆" }] }),
    Q({ id: "q7", type: "ordering", engine: "reorder", prompt: "手を洗う順に並べ替えなさい。",
        orderItems: [{ id: "i1", text: "手をぬらす" }, { id: "i2", text: "せっけんをつける" }, { id: "i3", text: "すすぐ" }],
        correctOrder: ["i1", "i2", "i3"] }),
    Q({ id: "q8", type: "matching", engine: "matching", prompt: "用語と説明を組み合わせなさい。",
        pairs: { left: [{ id: "L1", text: "潜伏期間" }, { id: "L2", text: "不顕性感染" }],
                 right: [{ id: "R1", text: "感染から発症までの期間" }, { id: "R2", text: "症状が出ないまま経過すること" }],
                 correct: { L1: "R1", L2: "R2" } } }),
    Q({ id: "q9", type: "classification", engine: "classification", prompt: "次の語を仲間に分けなさい。",
        classification: { groups: [{ id: "g1", label: "ウイルス" }, { id: "g2", label: "細菌" }],
                          items: [{ id: "t1", text: "インフルエンザ", groupId: "g1" },
                                  { id: "t2", text: "結核", groupId: "g2" },
                                  { id: "t3", text: "はしか", groupId: "g1" }] } }),
    Q({ id: "q10", type: "table_fill", engine: "table_fill", prompt: "表の空いているところを埋めなさい。",
        table: { caption: "三大栄養素", columns: [{ id: "c1", text: "栄養素" }, { id: "c2", text: "はたらき" }],
                 rows: [{ id: "r1", header: "1", cells: [{ id: "r1c1", text: "炭水化物" },
                                                          { id: "r1c2", editable: true, answer: "おもなエネルギー源" }] },
                        { id: "r2", header: "2", cells: [{ id: "r2c1", editable: true, answer: "たんぱく質" },
                                                          { id: "r2c2", text: "からだをつくる" }] }] } }),
    Q({ id: "q11", type: "error_correction", engine: "error_correction",
        prompt: "次の文の誤りを直しなさい。 He go to school every day.",
        errorSpans: [{ id: "e1", wrong: "go", correct: "goes" }] }),
    Q({ id: "q12", type: "long_answer", engine: "free_text", points: 10,
        prompt: "感染症を防ぐために、あなたができることを 100 字程度で書きなさい。" }),
    Q({ id: "q13", type: "flashcard", engine: "flashcard", prompt: "photosynthesis",
        card: { front: "photosynthesis", back: "光合成" } }),
    Q({ id: "q14", type: "dictation", engine: "dictation", prompt: "聞こえた文を書き取りなさい。",
        correctAnswer: "She has lived here for ten years.",
        script: "She has lived here for ten years." }),
    Q({ id: "q15", type: "image_point", engine: "image_point", prompt: "心臓の位置を指しなさい。",
        hotspots: [{ id: "h1", shape: "circle", x: 0.5, y: 0.4, r: 0.05, label: "心臓", isCorrect: true }] }),
    Q({ id: "q16", type: "image_label", engine: "image_label", prompt: "各部の名前を当てはめなさい。",
        labels: { slots: [{ id: "s1", x: 0.2, y: 0.3, answerId: "lb1", hint: "上の部分" }],
                  bank: [{ id: "lb1", text: "右心房" }, { id: "lb2", text: "左心室" }] } }),
    Q({ id: "q17", type: "chart_read", engine: "chart_read", prompt: "グラフから読み取れることを答えなさい。",
        correctAnswer: "2020 年が最も多い",
        chart: { kind: "bar", title: "年ごとの件数", unit: "件", categories: ["2019", "2020", "2021"],
                 series: [{ id: "s1", name: "件数", values: [10, 30, 20] }] } }),
    Q({ id: "q18", type: "composite", engine: "composite", points: 4,
        prompt: "次の資料を読んで、あとの問いに答えなさい。", context: "（資料）ここに長文が入ります。",
        children: [
          Q({ id: "q18a", type: "multiple_choice_single", engine: "single_choice", prompt: "小問その 1。",
              correctAnswer: "a2", choices: [{ id: "a1", label: "ア", text: "あ" }, { id: "a2", label: "イ", text: "い", isCorrect: true }] }),
          Q({ id: "q18b", type: "short_answer", engine: "text_input", prompt: "小問その 2。", correctAnswer: "答え" })
        ] })
  ]
};

/* ── 1) 行の取り出し ─────────────────────────────────────────── */
section("行の取り出し（複合大問は 1-1 / 1-2 とぶら下げる）");
const rows = X.rows(PRESET);
const byId = {};
rows.forEach((r) => { byId[r.q.id] = r; });
ok("全部の問題が行になる（18 問 ＋ 小問 2）", rows.length === 20, rows.length);
ok("番号が 1 から順に振られる", rows[0].no === "1" && rows[17].no === "18", [rows[0].no, rows[17].no]);
ok("★複合大問の小問は 18-1 / 18-2 になる",
  rows[18].no === "18-1" && rows[19].no === "18-2", [rows[18].no, rows[19].no]);
ok("★複合大問そのものは「答えを持つ問題」として数えない",
  rows[17].parent === true && rows[17].answer === "", { parent: rows[17].parent, answer: rows[17].answer });
ok("小問は 1 段下げて出す", rows[18].depth === 1, rows[18].depth);

/* ── 2) エンジンごとの答え ───────────────────────────────────── */
section("エンジンごとの答え（20 種のうち中身を持つ 18 種）");
const A = (id) => byId[id].answer;
ok("単一選択 → 記号と本文", A("q1") === "ウ. 栄養素対策", A("q1"));
ok("複数選択 → すべて出す", A("q2") === "ア. 手を洗う / ウ. 十分に眠る", A("q2"));
ok("正誤", A("q3") === "○. 正しい", A("q3"));
ok("文字入力", A("q4") === "伊藤博文", A("q4"));
ok("★別解も落とさない", byId.q4.accepted.join("/") === "いとうひろぶみ", byId.q4.accepted);
ok("数値入力", A("q5") === "144", A("q5"));
ok("★穴埋め → 番号つきで 1 行ずつ", A("q6") === "1. 伊藤博文\n2. 黒田清隆", A("q6"));
ok("★並べ替え → 札の本文を矢印でつなぐ（id を出さない）",
  A("q7") === "手をぬらす → せっけんをつける → すすぐ", A("q7"));
ok("★組み合わせ → 左 → 右 の本文で出す（id を出さない）",
  A("q8") === "潜伏期間 → 感染から発症までの期間\n不顕性感染 → 症状が出ないまま経過すること", A("q8"));
ok("★分類 → グループごとにまとめる",
  A("q9") === "ウイルス：インフルエンザ・はしか\n細菌：結核", A("q9"));
ok("★表の完成 → 埋めるところだけ、行と列の名前つきで",
  A("q10") === "1 / はたらき：おもなエネルギー源\n2 / 栄養素：たんぱく質", A("q10"));
ok("誤り訂正 → 誤 → 正", A("q11") === "go → goes", A("q11"));
ok("記述は答えを持たない（作らない）", A("q12") === "", A("q12"));
ok("カード → うら", A("q13") === "光合成", A("q13"));
ok("書き取り", A("q14") === "She has lived here for ten years.", A("q14"));
ok("画像内の位置 → 印の名前", A("q15") === "心臓", A("q15"));
ok("ラベル配置 → 位置：語", A("q16") === "上の部分：右心房", A("q16"));
ok("図表の読み取り", A("q17") === "2020 年が最も多い", A("q17"));
ok("小問にもそれぞれ答えが付く", A("q18a") === "イ. い" && A("q18b") === "答え", [A("q18a"), A("q18b")]);

section("答えを作らない（持っていないものは空のまま）");
ok("★正解が空の 4 択は空のまま",
  X.answerOf({ engine: "single_choice", choices: [{ id: "c1", text: "あ" }], correctAnswer: null }) === "", "");
ok("★札が無い並べ替えは空のまま",
  X.answerOf({ engine: "reorder", orderItems: [], correctOrder: [] }) === "", "");
ok("★対応が空の組み合わせは空のまま",
  X.answerOf({ engine: "matching", pairs: { left: [{ id: "L1", text: "あ" }], right: [], correct: {} } }) === "", "");
ok("分け先が未設定の語も黙って消さない",
  /分け先が未設定/.test(X.answerOf({ engine: "classification",
    classification: { groups: [{ id: "g1", label: "ア" }], items: [{ id: "t1", text: "あ", groupId: "" }] } })));

/* ── 3) HTML ─────────────────────────────────────────────────── */
section("HTML（そのまま印刷できる紙面）");
const hWith = X.html(PRESET, { mode: "with" });
const hNone = X.html(PRESET, { mode: "none" });
const hOnly = X.html(PRESET, { mode: "only" });
/* CSS の中にも同じ語（is-on / vqx-name）が出るので、**紙面だけ**を見る。 */
const bodyOf = (h) => h.slice(h.indexOf("</style>") + 8);
const bWith = bodyOf(hWith), bNone = bodyOf(hNone), bOnly = bodyOf(hOnly);
ok("問題の数だけ <article> が出る", (hWith.match(/<article/g) || []).length === 20,
  (hWith.match(/<article/g) || []).length);
ok("印刷用の指定が入っている", /@page/.test(hWith) && /page-break-inside:avoid/.test(hWith));
ok("★問題だけのときは答えを 1 つも書かない",
  !/<b>答え<\/b>/.test(bNone) && !/is-on/.test(bNone) && !/伊藤博文/.test(bNone)
    && bNone.indexOf("栄養素対策") > 0,
  { 答え欄: /<b>答え<\/b>/.test(bNone), 正解印: /is-on/.test(bNone), 中身: /伊藤博文/.test(bNone) });
ok("★問題と答えのときは答えが入る", /<b>答え<\/b>/.test(hWith) && /伊藤博文/.test(hWith));
ok("★答えだけのときは問題文を出さない",
  !/感染症の三原則に含まれないものはどれか/.test(bOnly) && /伊藤博文/.test(bOnly));
ok("★聞き取りの原稿は、答えを出すときだけ載せる",
  /読み上げの原稿/.test(bWith) && !/She has lived here for ten years/.test(bNone),
  { 答えあり: /読み上げの原稿/.test(bWith), 問題だけ: /She has lived/.test(bNone) });
ok("★空欄の【1】は枠になる", /vqx-bm/.test(hWith));
ok("表の完成が表になる", /<table class="vqx-tbl"/.test(hWith) && /おもなエネルギー源/.test(hWith));
ok("★問題だけのときは、表の埋めるところが空になる",
  /class="vqx-td-in"><\/td>/.test(bNone) && !/おもなエネルギー源/.test(bNone),
  { 空: /class="vqx-td-in"><\/td>/.test(bNone), 答えが出ている: /おもなエネルギー源/.test(bNone) });
ok("図表が表になる", /年ごとの件数/.test(hWith) && /2020/.test(hWith));
ok("並べ替えの札が出る", /vqx-card">手をぬらす/.test(hWith));
ok("組み合わせが左右 2 列になる", /vqx-2col/.test(hWith));
ok("記述には書く場所が付く", (bNone.match(/vqx-line/g) || []).length >= 4,
  (bNone.match(/vqx-line/g) || []).length);
ok("名前を書く欄が付く（答えだけのときは付けない）",
  /vqx-name/.test(bNone) && !/vqx-name/.test(bOnly));
ok("★解答一覧を最後のページに付けられる",
  /vqx-pb/.test(X.html(PRESET, { mode: "none", answerSheet: true })));
ok("題と満点が入る", /全 19 問/.test(hWith) && /満点/.test(hWith), hWith.slice(hWith.indexOf("vqx-meta"), hWith.indexOf("vqx-meta") + 80));
ok("★危ないタグをそのまま通さない",
  X.html({ name: "<img src=x onerror=alert(1)>", questions: [] }, {}).indexOf("<img src=x") < 0);

/* ── 4) テキスト・Markdown・CSV・JSON ────────────────────────── */
section("テキスト");
const t = X.text(PRESET, { mode: "with" });
ok("題と問題数が出る", /【書き出しの見本 \/ テスト】/.test(t) && /全 19 問/.test(t));
ok("選択肢に記号が付く", /ア\. 感染源対策/.test(t));
ok("★正解の選択肢に印が付く", /ウ\. 栄養素対策  ←正解/.test(t), t.split("\n").slice(6, 12));
ok("並べ替えの札が出る", /並べ替える語句：手をぬらす ／ せっけんをつける ／ すすぐ/.test(t));
ok("表が縦線で組まれる", /｜栄養素｜はたらき｜/.test(t));
ok("問題だけのときは答えを書かない", !/答え：/.test(X.text(PRESET, { mode: "none" })));
ok("答えだけのときは 1 行 1 問", X.text(PRESET, { mode: "only" }).split("\n").filter((l) => /^問 /.test(l)).length === 19);

section("Markdown");
const md = X.markdown(PRESET, { mode: "with" });
ok("見出しになる", /^# 書き出しの見本/m.test(md) && /^## 問 1（4択/m.test(md));
ok("小問は 1 段下の見出し", /^### 問 18-1/m.test(md));
ok("資料は引用になる", /^> （資料）/m.test(md));
ok("答えだけのときは表になる", /\| 問 \| 答え \|/.test(X.markdown(PRESET, { mode: "only" })));

section("CSV");
const csv = X.csv(PRESET);
const head = csv.split("\r\n")[0];
ok("★Excel 用の目印（BOM）が先頭に付く", csv.charCodeAt(0) === 0xfeff, csv.charCodeAt(0));
ok("列は 11 個", head.split(",").length === 11, head);
ok("見出しが日本語", /"番号","形式","配点"/.test(head), head);
ok("行数は 見出し ＋ 20", csv.split("\r\n").length === 21, csv.split("\r\n").length);
ok("★引用符を二重にして閉じ込める",
  X.csv({ name: "x", questions: [{ id: "z", type: "short_answer", engine: "text_input",
    prompt: 'これは "見本" です', correctAnswer: "あ" }] }).indexOf('""見本""') > 0);
ok("★改行を含む答えでも列がずれない",
  X.csv(PRESET).split("\r\n").length === 21 && /"1\. 伊藤博文\n2\. 黒田清隆"/.test(csv));

section("JSON・ファイル名");
ok("JSON はそのまま読み直せる", JSON.parse(X.json(PRESET)).questions.length === 18);
ok("★ファイル名に使えない字を置き換える", X.safeName(PRESET) === "書き出しの見本 _ テスト", X.safeName(PRESET));
ok("名前が空でも名前を作る", X.safeName({ name: "  " }) === "preset", X.safeName({ name: "  " }));

/* ── 5) 画面に口があるか（ここが今回の不具合の本体）──────────── */
section("画面のつなぎ（source を読む）");
ok("★もう使われていない #presetOverlay に書き出しを置いていない",
  !/id="presetPrintBtn"/.test(INDEX) && !/id="presetCsvBtn"/.test(INDEX),
  { print: /id="presetPrintBtn"/.test(INDEX), csv: /id="presetCsvBtn"/.test(INDEX) });
ok("編集画面に openExport がある", /function openExport\(\)/.test(INDEX));
ok("★設定シートの中に書き出しのカードがある",
  /function exportCardHtml\(\)/.test(INDEX) && /exportCardHtml\(\)/.test(INDEX.replace("function exportCardHtml()", "")));
ok("設定シートのボタンがつながっている", /'\[data-act="open-export"\]', function \(\) \{ openExport\(\); \}/.test(INDEX));
ok("右上のボタンからも開ける", /action: "export", hideOnMobile: true/.test(INDEX)
  && /'\[data-act="export"\]', function \(\) \{ openExport\(\); \}/.test(INDEX));
ok("「…」の中にも入っている", /value: "export", label: "書き出し・印刷"/.test(INDEX)
  && /v === "export"\) openExport\(\)/.test(INDEX));
ok("テストから直に呼べるように出している", /exporter: EXPORT/.test(INDEX));

/* ── 6) 実際の画面（ブラウザ）───────────────────────────────── */
if (process.argv.indexOf("--no-ui") >= 0) {
  finish();
} else {
  runUi().then(finish).catch((e) => {
    fail++; bad.push("ブラウザでの確認");
    console.log("\n  NG   ブラウザでの確認 — " + (e && e.message ? e.message : e));
    finish();
  });
}

async function runUi() {
  const { chromium } = require("playwright");
  section("実際の画面（" + BASE + "）");
  const br = await chromium.launch();
  const pg = await br.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e.message).slice(0, 180)));
  try {
    await pg.goto(BASE, { waitUntil: "domcontentloaded", timeout: 40000 });
    await pg.waitForFunction(() => window.VQ2 && VQ2.presetStudio, null, { timeout: 40000 });

    /* 編集画面を、見本のプリセットで開く */
    await pg.evaluate((p) => {
      document.querySelectorAll(".vq2-host").forEach((h) => h.remove());
      document.body.style.overflow = "";
      VQ2.presetStudio.open({ preset: p });
    }, PRESET);
    await pg.waitForFunction(() => {
      const h = document.getElementById("vq2-preset-studio");
      return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vq2-root"));
    }, null, { timeout: 20000 });

    ok("★書き出しの部品が画面から見える",
      await pg.evaluate(() => !!(VQ2.presetStudio && VQ2.presetStudio.exporter
        && typeof VQ2.presetStudio.exporter.html === "function")));

    /* 右上のボタン → 書き出しシート */
    const opened = await pg.evaluate(() => {
      const sr = document.getElementById("vq2-preset-studio").shadowRoot;
      const b = sr.querySelector('[data-act="export"]');
      if (!b) return "ボタンが無い";
      b.click();
      return "ok";
    });
    ok("右上に書き出しのボタンがある", opened === "ok", opened);
    await pg.waitForFunction(() => {
      const h = document.getElementById("vq2-preset-export");
      return !!(h && h.shadowRoot && h.shadowRoot.querySelector('[data-act="print"]'));
    }, null, { timeout: 15000 });

    const btns = await pg.evaluate(() => {
      const sr = document.getElementById("vq2-preset-export").shadowRoot;
      return [...sr.querySelectorAll(".vq2-btn")].map((b) => (b.textContent || "").trim()).filter(Boolean);
    });
    ["印刷・PDF", "HTML", "Markdown", "テキスト", "CSV", "JSON"].forEach((label) => {
      ok("「" + label + "」のボタンが出ている", btns.indexOf(label) >= 0, btns);
    });
    ["問題だけ", "問題と答え", "答えだけ"].forEach((label) => {
      ok("「" + label + "」が選べる", btns.indexOf(label) >= 0, btns);
    });

    /* 中身の切り替えが効くか */
    const switched = await pg.evaluate(() => {
      const sr = document.getElementById("vq2-preset-export").shadowRoot;
      sr.querySelector('[data-mode="only"]').click();
      const now = [...sr.querySelectorAll('[data-mode]')]
        .filter((b) => b.getAttribute("aria-pressed") === "true")
        .map((b) => b.getAttribute("data-mode"));
      return now;
    });
    ok("★選んだ中身が押された状態になる", switched.join() === "only", switched);

    /* 実物の登録簿（133 形式）で名前が付くか */
    const real = await pg.evaluate((p) => {
      const E = VQ2.presetStudio.exporter;
      const r = E.rows(p);
      return { labels: r.slice(0, 3).map((x) => x.typeLabel),
               html: E.html(p, { mode: "with" }).length,
               csv: E.csv(p).split("\r\n").length };
    }, PRESET);
    ok("★実物の登録簿から形式の名前が付く（id のままではない）",
      real.labels.every((l) => l && !/_/.test(l)), real.labels);
    ok("画面の中でも紙面が組める", real.html > 3000, real.html);
    ok("画面の中でも CSV が組める", real.csv === 21, real.csv);

    /* 設定シートの中の入口 */
    await pg.evaluate(() => {
      const h = document.getElementById("vq2-preset-export");
      if (h && h.__vq2) h.__vq2.forceClose("test");
      document.getElementById("vq2-preset-studio").shadowRoot
        .querySelector('[data-act="settings"]').click();
    });
    await pg.waitForFunction(() => {
      const h = document.getElementById("vq2-preset-appearance");
      return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vq2-card"));
    }, null, { timeout: 15000 });
    const inSettings = await pg.evaluate(() => {
      const sr = document.getElementById("vq2-preset-appearance").shadowRoot;
      const b = sr.querySelector('[data-act="open-export"]');
      return { ある: !!b, 文字: sr.textContent.indexOf("書き出し・印刷") >= 0 };
    });
    ok("★プリセットの設定の中に「書き出しを開く」がある", inSettings.ある && inSettings.文字, inSettings);

    ok("画面のエラーが出ていない", errs.length === 0, errs.slice(0, 3));
  } finally {
    await br.close();
  }
}

function finish() {
  console.log("\n合格 " + pass + " / 不合格 " + fail);
  if (bad.length) console.log("直すところ:\n  - " + bad.join("\n  - "));
  process.exit(fail ? 1 : 0);
}
