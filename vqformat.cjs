/* ══════════════════════════════════════════════════════════════════════
   LUMI が **利用者の言ったとおりに作るか**を、実物で測る。

   見るのは 6 つ。
     ① ちゃんとした頼み方   … 素直な指示が通るか
     ② 複雑で曖昧な頼み方   … 条件が重なっても崩れないか
     ③ 適当な頼み方         … 短く雑でも通るか
     ④ 解説の細かさ         … 具体的に／短く、の注文を守るか
     ⑤ 直せる崩れ           … 直せるはずの崩れを直して返しているか
     ⑥ 問題数を言わないとき … 勝手に少なくしないか

   ★ 「守れた」の基準は **利用者が読める言い方**で書く。
     内部の型名で合わせると、直したつもりで直っていないことに気づけない。
   ★ 落ちた分は必ず中身を出す。数だけ見ても直せない。

   使い方:
     node vqformat.cjs               … 全部
     node vqformat.cjs 1 3           … ① と ③ だけ
     VQ_ROUNDS=2 node vqformat.cjs   … 各件 2 回ずつ
   ══════════════════════════════════════════════════════════════════════ */
const BASE = process.env.VQ_BASE || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

const ROUNDS = Math.max(1, Number(process.env.VQ_ROUNDS || 1));
const CONC = Math.max(1, Math.min(4, Number(process.env.VQ_CONC || 3)));   /* 実AIなので広げない */
const ONLY = process.argv.slice(2).filter((x) => /^[1-6]$/.test(x)).map(Number);

/* ── 出た問題の「形式」を、利用者の言い方で言い直す ───────────────── */
function kindOf(q) {
  const t = String(q.type || q.engine || "");
  if (t) return t;
  if (Array.isArray(q.choices) && q.choices.length) return "single_choice";
  if (typeof q.answer === "boolean") return "true_false";
  return "unknown";
}
function choiceCount(q) { return Array.isArray(q.choices) ? q.choices.length : 0; }
function blanks(q) {
  const m = String(q.question || "").match(/【\s*\d+\s*】/g);
  return m ? m.length : 0;
}
function expLen(q) { return String(q.explanation || "").length; }

/* ══ 検査の部品。true を返せば守れている。 ═══════════════════════════ */
const CHECK = {
  形式: (want) => (qs) => {
    const bad = qs.filter((q) => kindOf(q) !== want);
    return bad.length ? ("形式が違う " + bad.length + "/" + qs.length
      + "（出たもの: " + [...new Set(bad.map(kindOf))].join("・") + "）") : null;
  },
  形式のどれか: (list) => (qs) => {
    const bad = qs.filter((q) => list.indexOf(kindOf(q)) < 0);
    return bad.length ? ("頼んでいない形式 " + bad.length + "/" + qs.length
      + "（" + [...new Set(bad.map(kindOf))].join("・") + "）") : null;
  },
  数: (n) => (qs) => qs.length === n ? null : ("問題数が " + qs.length + "（頼んだのは " + n + "）"),
  数は以上: (n) => (qs) => qs.length >= n ? null : ("問題数が " + qs.length + "（" + n + " 以上ほしい）"),
  選択肢: (n) => (qs) => {
    const bad = qs.filter((q) => choiceCount(q) !== n);
    return bad.length ? ("選択肢が " + n + " 個でないもの " + bad.length + "/" + qs.length
      + "（出た数: " + [...new Set(bad.map(choiceCount))].join("・") + "）") : null;
  },
  解説が上限内: (n) => (qs) => {
    const bad = qs.filter((q) => expLen(q) > n);
    return bad.length ? ("解説が " + n + " 字を超えたもの " + bad.length + "/" + qs.length
      + "（最長 " + Math.max(...qs.map(expLen)) + " 字）") : null;
  },
  解説が下限以上: (n) => (qs) => {
    const bad = qs.filter((q) => expLen(q) < n);
    return bad.length ? ("解説が " + n + " 字未満のもの " + bad.length + "/" + qs.length
      + "（最短 " + Math.min(...qs.map(expLen)) + " 字）") : null;
  },
  解説がある: () => (qs) => {
    const bad = qs.filter((q) => !String(q.explanation || "").trim());
    return bad.length ? ("解説が無いもの " + bad.length + "/" + qs.length) : null;
  },
  空欄が複数: () => (qs) => {
    const bad = qs.filter((q) => blanks(q) < 2);
    return bad.length ? ("空欄が 2 つ未満のもの " + bad.length + "/" + qs.length) : null;
  },
  内訳: (spec) => (qs) => {
    /* spec: { single_choice: 6, fill_blank: 4 } */
    const got = {};
    qs.forEach((q) => { const k = kindOf(q); got[k] = (got[k] || 0) + 1; });
    const miss = Object.keys(spec).filter((k) => (got[k] || 0) !== spec[k]);
    return miss.length
      ? ("内訳が違う（頼んだ " + JSON.stringify(spec) + " / 出た " + JSON.stringify(got) + "）")
      : null;
  },
  答えが数字: () => (qs) => {
    const bad = qs.filter((q) => !/^-?[0-9]+(\.[0-9]+)?$/.test(String(q.answer || "").trim()));
    return bad.length ? ("答えが数でないもの " + bad.length + "/" + qs.length) : null;
  },
  答えが英字: () => (qs) => {
    const bad = qs.filter((q) => !/[A-Za-z]/.test(String(q.answer || "")));
    return bad.length ? ("答えに英字が無いもの " + bad.length + "/" + qs.length) : null;
  },
  問題文が違う: () => (qs) => {
    const s = new Set(qs.map((q) => String(q.question || "").trim()));
    return s.size === qs.length ? null : ("同じ問題文がある（" + qs.length + " 問で " + s.size + " 通り）");
  },
  作らない: () => (qs, j) => (j.status === "contradictory" || j.status === "unsupported" || qs.length === 0)
    ? null : ("矛盾しているのに " + qs.length + " 問 作ってしまった"),
  資料の語がある: (words) => (qs) => {
    const all = JSON.stringify(qs).toLowerCase();
    return words.some((w) => all.indexOf(w.toLowerCase()) >= 0)
      ? null : ("資料の言葉がどこにも出ていない（" + words.slice(0, 3).join("・") + " など）");
  }
};

/* ══ 出す指示（実際に人が打つ言い方で書く）═══════════════════════════ */
const SUITES = [
  { no: 1, name: "① ちゃんとした頼み方", cases: [
    { p: "日本の歴史から4択問題を8問つくってください。", c: [CHECK.形式("single_choice"), CHECK.数(8), CHECK.選択肢(4)] },
    { p: "英単語の穴埋め問題を6問おねがいします。", c: [CHECK.形式("fill_blank"), CHECK.数(6)] },
    { p: "生物の正誤問題を10問つくって。", c: [CHECK.形式("true_false"), CHECK.数(10)] },
    { p: "化学の短答問題を7問。", c: [CHECK.形式("text_input"), CHECK.数(7)] },
    { p: "世界史の年代順並べ替えを5問つくってください。", c: [CHECK.形式("reorder"), CHECK.数(5)] },
    { p: "国語の対応づけ問題を4問。", c: [CHECK.形式("matching"), CHECK.数(4)] },
    { p: "数学の数値入力問題を6問つくって。", c: [CHECK.形式("numeric_input"), CHECK.数(6), CHECK.答えが数字()] },
    { p: "物理の自由記述を4問おねがいします。", c: [CHECK.形式("free_text"), CHECK.数(4)] },
    { p: "地理の分類問題を4問。", c: [CHECK.形式("classification"), CHECK.数(4)] },
    { p: "英文法の誤文訂正を6問つくってください。", c: [CHECK.形式("error_correction"), CHECK.数(6)] },
    { p: "古文単語の暗記カードを12問つくって。", c: [CHECK.形式("flashcard"), CHECK.数(12)] },
    { p: "政治経済の5択問題を6問。", c: [CHECK.形式("single_choice"), CHECK.数(6), CHECK.選択肢(5)] },
    { p: "日本史で複数選択の問題を5問つくって。", c: [CHECK.形式("multi_choice"), CHECK.数(5)] },
    { p: "英単語のスペリング問題を8問。", c: [CHECK.形式("text_input"), CHECK.数(8), CHECK.答えが英字()] },
    { p: "生物のグラフ読み取りを4問つくってください。", c: [CHECK.形式("chart_read"), CHECK.数(4)] }
  ] },

  { no: 2, name: "② 複雑で曖昧な頼み方", cases: [
    { p: "日本史で4択を6問と穴埋めを4問、あわせて10問つくってください。解説は必ず入れて。",
      c: [CHECK.数(10), CHECK.内訳({ single_choice: 6, fill_blank: 4 }), CHECK.解説がある()] },
    { p: "英語のテスト対策。単語の意味を問うのを中心に、でも文法も少し。ぜんぶで12問くらいで。",
      c: [CHECK.数は以上(10)] },
    { p: "生物基礎の細胞のところ。むずかしめで、正誤とちがう形式をまぜて8問。",
      c: [CHECK.数(8), CHECK.形式のどれか(["single_choice", "fill_blank", "text_input", "multi_choice",
        "matching", "classification", "free_text", "reorder", "numeric_input", "flashcard", "error_correction"])] },
    { p: "化学の計算問題を5問。答えは数字だけで、解説は短めに60字以内でおねがい。",
      c: [CHECK.数(5), CHECK.解説が上限内(60)] },
    { p: "誤っているものを選ばせる問題を5択で6問つくって。同じ問題文にしないで。",
      c: [CHECK.数(6), CHECK.選択肢(5), CHECK.問題文が違う()] },
    { p: "世界史の並べ替えを4問と、対応づけを3問。並べ替えは古い順で。",
      c: [CHECK.数(7), CHECK.内訳({ reorder: 4, matching: 3 })] },
    { p: "英作文の並べ替えを5問。ただし選択肢はつけないで、解説は120字以上で書いて。",
      c: [CHECK.形式("reorder"), CHECK.数(5), CHECK.解説が下限以上(100)] },
    { p: "4択だけで10問。でも4択は使わないで。",
      c: [CHECK.作らない()] },
    { p: "日本史の鎌倉時代について、穴埋めで空欄が2つ以上あるものを5問。",
      c: [CHECK.形式("fill_blank"), CHECK.数(5), CHECK.空欄が複数()] },
    { p: "数学の二次関数。まず基本を3問、そのあと応用を3問、最後に難問を2問で計8問。",
      c: [CHECK.数(8)] }
  ] },

  { no: 3, name: "③ 適当な頼み方", cases: [
    { p: "英単語20こ", c: [CHECK.数(20)] },
    { p: "かんじのよみ 15もん", c: [CHECK.数(15)] },
    { p: "れきし よんたく 8", c: [CHECK.数(8), CHECK.選択肢(4)] },
    { p: "生物 まるばつ 12", c: [CHECK.形式("true_false"), CHECK.数(12)] },
    { p: "すうがく けいさん 6こ", c: [CHECK.数(6)] },
    { p: "えいご あなうめ ７もん", c: [CHECK.形式("fill_blank"), CHECK.数(7)] },
    { p: "地理3択5問", c: [CHECK.数(5), CHECK.選択肢(3)] },
    { p: "化学 カード 10", c: [CHECK.形式("flashcard"), CHECK.数(10)] },
    { p: "ならべかえ4つ", c: [CHECK.形式("reorder"), CHECK.数(4)] },
    { p: "たんとう 9もん りか", c: [CHECK.形式("text_input"), CHECK.数(9)] },
    { p: "英語のやつ てきとうに", c: [CHECK.数は以上(5)] },
    { p: "むずかしいの 6", c: [CHECK.数(6)] }
  ] },

  { no: 4, name: "④ 解説の細かさ", cases: [
    { p: "日本史の4択を6問。解説はできるだけ具体的に、200字以上で書いてください。",
      c: [CHECK.数(6), CHECK.解説が下限以上(150)] },
    { p: "生物の4択を6問。解説は40字以内で短くまとめて。",
      c: [CHECK.数(6), CHECK.解説が上限内(40)] },
    { p: "化学の短答を8問。解説は要点だけ、80字以内で。",
      c: [CHECK.数(8), CHECK.解説が上限内(80)] },
    { p: "英文法の4択を5問。解説には他の選択肢がなぜ違うのかも必ず書いて。",
      c: [CHECK.数(5), CHECK.解説が下限以上(60)] },
    { p: "物理の計算を4問。解説は途中の式まで書いて、150字以上で。",
      c: [CHECK.数(4), CHECK.解説が下限以上(120)] },
    { p: "地理の正誤を10問。解説を全部に入れて。ただし50字以内で。",
      c: [CHECK.数(10), CHECK.解説が上限内(50), CHECK.解説がある()] },
    { p: "せかいし よんたく 6もん かいせつ 30じいない",
      c: [CHECK.数(6), CHECK.解説が上限内(30)] }
  ] },

  { no: 5, name: "⑤ 直せる崩れを直しているか", cases: [
    /* どれも「AI がよく崩す所」を、こちらから狙って踏ませる。
       サーバが直して返せていれば、利用者には崩れが届かない。 */
    { p: "数学の数値入力を8問。単位もつけて。", c: [CHECK.形式("numeric_input"), CHECK.数(8), CHECK.答えが数字()] },
    { p: "英単語の穴埋めを8問。空欄は1つずつで。", c: [CHECK.形式("fill_blank"), CHECK.数(8)] },
    { p: "生物の分類問題を5問。グループは3つ以上で。", c: [CHECK.形式("classification"), CHECK.数(5)] },
    { p: "日本史の対応づけを5問。左右5個ずつで。", c: [CHECK.形式("matching"), CHECK.数(5)] },
    { p: "国語の並べ替えを6問。文になるように。", c: [CHECK.形式("reorder"), CHECK.数(6)] },
    { p: "理科のグラフ読み取りを5問。棒グラフで。", c: [CHECK.形式("chart_read"), CHECK.数(5)] },
    { p: "英文の誤文訂正を8問。どこが誤りかも示して。", c: [CHECK.形式("error_correction"), CHECK.数(8)] },
    { p: "社会の表のうめ問題を4問。", c: [CHECK.形式("table_fill"), CHECK.数(4)] },
    { p: "国語の複合問題を3問。小問は2つ以上で。", c: [CHECK.形式("composite"), CHECK.数(3)] },
    { p: "英単語の暗記カードを20問。表は英語、裏は日本語で。", c: [CHECK.形式("flashcard"), CHECK.数(20)] }
  ] },

  { no: 6, name: "⑥ 問題数を言わないとき", cases: [
    { p: "日本史の4択問題をつくってください。", c: [CHECK.形式("single_choice"), CHECK.数は以上(5)] },
    { p: "英単語の暗記カードをつくって。", c: [CHECK.形式("flashcard"), CHECK.数は以上(5)] },
    { p: "生物の正誤問題おねがい。", c: [CHECK.形式("true_false"), CHECK.数は以上(5)] },
    { p: "化学の穴埋めを作って", c: [CHECK.形式("fill_blank"), CHECK.数は以上(5)] },
    { p: "地理のテストつくって", c: [CHECK.数は以上(5)] },
    { p: "数学の計算問題", c: [CHECK.数は以上(5)] }
  ] }
];

/* ══ 実行 ═══════════════════════════════════════════════════════════ */
async function token() {
  const nick = "fm" + Date.now().toString(36).slice(-6) + Math.random().toString(36).slice(2, 5);
  const r = await fetch(BASE + "/api/auth/register", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gradePrefix: "H1", nickname: nick, password: "DevGen#2026a",
      tosAccepted: true, tosVersion: "1" }) });
  const j = await r.json();
  return j.token || "";
}
async function ask(tk, prompt) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 240000);
  const t0 = Date.now();
  try {
    const r = await fetch(BASE + "/api/aigen/questions", { method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + tk },
      body: JSON.stringify({ prompt: prompt }), signal: ac.signal });
    const txt = await r.text();
    let j = null; try { j = JSON.parse(txt); } catch (e) {}
    if (!j) return { err: "JSONでない: " + txt.slice(0, 120), ms: Date.now() - t0 };
    return { j: j, qs: Array.isArray(j.questions) ? j.questions : [], ms: Date.now() - t0 };
  } catch (e) {
    return { err: String(e.message || e).slice(0, 120), ms: Date.now() - t0 };
  } finally { clearTimeout(timer); }
}

(async () => {
  const tk = await token();
  if (!tk) { console.log("アカウントが作れません"); process.exit(2); }

  const suites = SUITES.filter((s) => !ONLY.length || ONLY.indexOf(s.no) >= 0);
  const jobs = [];
  suites.forEach((s) => s.cases.forEach((c) => {
    for (let r = 0; r < ROUNDS; r++) jobs.push({ s: s, c: c, round: r + 1 });
  }));

  const results = [];
  let at = 0;
  async function worker() {
    while (at < jobs.length) {
      const job = jobs[at++];
      const res = await ask(tk, job.c.p);
      const bad = [];
      if (res.err) bad.push("届かなかった: " + res.err);
      else {
        const j = res.j, qs = res.qs;
        if (!j.ok) bad.push("ok でない: " + String(j.message || j.reason || "").slice(0, 80));
        else for (const fn of job.c.c) {
          const why = fn(qs, j);
          if (why) bad.push(why);
        }
      }
      results.push({ suite: job.s, prompt: job.c.p, round: job.round, bad: bad,
                     n: res.qs ? res.qs.length : 0, ms: res.ms, qs: res.qs || [] });
      process.stdout.write(bad.length ? "✗" : "✓");
    }
  }
  const t0 = Date.now();
  await Promise.all(Array.from({ length: CONC }, worker));
  console.log("\n");

  let pass = 0, fail = 0;
  suites.forEach((s) => {
    const mine = results.filter((r) => r.suite.no === s.no);
    const ng = mine.filter((r) => r.bad.length);
    pass += mine.length - ng.length; fail += ng.length;
    console.log("■ " + s.name + "  " + (mine.length - ng.length) + " / " + mine.length);
    ng.forEach((r) => {
      console.log("   ✗ 「" + r.prompt.slice(0, 46) + "」" + (ROUNDS > 1 ? "（" + r.round + "回目）" : ""));
      r.bad.forEach((b) => console.log("      ・" + b));
      if (r.qs.length) {
        const q = r.qs[0];
        console.log("      見本: type=" + kindOf(q) + " 選択肢=" + choiceCount(q)
          + " 解説=" + expLen(q) + "字  「" + String(q.question || "").replace(/\s+/g, " ").slice(0, 40) + "」");
      }
    });
  });
  const total = pass + fail;
  console.log("\n" + (fail ? "❌" : "✅") + " 守れた " + pass + " / " + total
    + "（" + Math.round(pass / Math.max(1, total) * 100) + "%）"
    + "  かかった時間 " + Math.round((Date.now() - t0) / 1000) + " 秒");
  process.exit(fail ? 1 : 0);
})();
