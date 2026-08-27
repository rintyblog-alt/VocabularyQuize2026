/* ══════════════════════════════════════════════════════════════════════════
   vqfreespread.cjs — おまかせのときに散らしすぎない（2026-08-14）

   何が起きていたか（利用者の指摘「生成時間と質が落ちた気がする」から特定）:
     形式を書かずに頼んだとき、使う形式を **3 → 15** に増やしていた。
     ところが割り振りは「使ってよい形式へ均等」なので、
     **形式の数がそのまま AI を呼ぶ回数**になる。

       10 問 ÷ 15 形式 → 1 問ずつ 10 回

     1 回 1 問は、まとめて作るより遅く、前の回で何を作ったかも
     ほとんど伝わらないので重複も増える。
     さらに 15 個のうち 8 個は tier が strong で、モデルが
     gpt-oss-20b → 120b（Gemini は 3.1 → 3.5）に上がる。

   直したこと:
     ① おまかせで使う形式を 8 個にしぼる（重い形式・AI 採点を外す）
     ② **散らす数を問題数で決める**（5問で2 / 10問で4 / 20問で6 / 30問で8）
     ③ 削られたときに 4 択へ偏らないよう、並び順を選ぶ/書く/並べるの交互に

   ★ ②は **おまかせのときだけ**。名指しされた形式は 1 つも落とさない。
   ══════════════════════════════════════════════════════════════════════════ */
const path = require("path");

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (detail ? "  → " + detail : "")); }
};

(async function () {
  const url = "file://" + path.join(__dirname, "server", "src", "worker.js");
  const m = await import(url);
  const T = m.__testables;
  const { AIGEN_ENGINES, AIGEN_FREE_ENGINES, aigenFreeSpread, aigenParseContract } = T;

  /* 呼ぶ回数 ＝ plan に載った形式の数。ここを 1 か所で数える。 */
  const calls = (c) => Object.keys(c.plan).length;

  console.log("\n① おまかせに重い形式を混ぜない");
  {
    ok("8 個になっている", AIGEN_FREE_ENGINES.length === 8, AIGEN_FREE_ENGINES.length + "個");
    ok("全部 実在する engine",
      AIGEN_FREE_ENGINES.every((id) => !!AIGEN_ENGINES[id]),
      AIGEN_FREE_ENGINES.filter((id) => !AIGEN_ENGINES[id]).join(", "));
    /* 「全部入れる」に戻っていないこと（これが遅くなった原因そのもの） */
    ok("AIGEN_ENGINES 全部ではない",
      AIGEN_FREE_ENGINES.length < Object.keys(AIGEN_ENGINES).length,
      "engine 総数 " + Object.keys(AIGEN_ENGINES).length);
    /* 外したもの: 採点が AI 頼み・1 問が重い・数え方が変わる */
    ["free_text", "chart_read", "composite", "table_fill", "flashcard", "error_correction",
     "numeric_input"].forEach((id) => {
      ok("おまかせに入れない: " + (AIGEN_ENGINES[id] ? AIGEN_ENGINES[id].label : id),
        AIGEN_FREE_ENGINES.indexOf(id) < 0);
    });
    /* 重い形式（perQ 200 以上）が 1 つも入っていないこと */
    const heavy = AIGEN_FREE_ENGINES.filter((id) => AIGEN_ENGINES[id].perQ >= 200);
    ok("1 問が重い形式（perQ 200 以上）は入っていない", heavy.length === 0, heavy.join(", "));
  }

  console.log("\n② 削られたときに 4 択へ偏らない");
  {
    const isChoice = (id) => !!AIGEN_ENGINES[id].choiceBased;
    /* 前から順に使うので、前半に選ぶだけの形式を固めてはいけない。 */
    const first2 = AIGEN_FREE_ENGINES.slice(0, 2);
    const first4 = AIGEN_FREE_ENGINES.slice(0, 4);
    ok("先頭は 4択（いちばん確実な形式）", AIGEN_FREE_ENGINES[0] === "single_choice");
    ok("2 形式のとき、選ぶだけは 1 つまで",
      first2.filter(isChoice).length <= 1, first2.join(", "));
    ok("4 形式のとき、選ぶだけは 1 つまで",
      first4.filter(isChoice).length <= 1, first4.join(", "));
    /* strong（重いモデルを使う）も前半に固めない */
    const strong4 = first4.filter((id) => AIGEN_ENGINES[id].tier === "strong");
    ok("4 形式のとき、重いモデルを使うのは 1 つまで", strong4.length <= 1, strong4.join(", "));
  }

  console.log("\n③ 散らす数は問題数で決まる");
  {
    ok("1 問 → 1 形式", aigenFreeSpread(1) === 1, String(aigenFreeSpread(1)));
    ok("4 問 → 1 形式", aigenFreeSpread(4) === 1, String(aigenFreeSpread(4)));
    ok("5 問 → 2 形式", aigenFreeSpread(5) === 2, String(aigenFreeSpread(5)));
    ok("10 問 → 4 形式", aigenFreeSpread(10) === 4, String(aigenFreeSpread(10)));
    ok("20 問 → 6 形式", aigenFreeSpread(20) === 6, String(aigenFreeSpread(20)));
    ok("30 問 → 8 形式", aigenFreeSpread(30) === 8, String(aigenFreeSpread(30)));
    ok("100 問でも 8 形式で頭打ち", aigenFreeSpread(100) === 8, String(aigenFreeSpread(100)));
    /* おかしな値でも落ちない */
    ok("空でも落ちない", aigenFreeSpread(0) === 1 && aigenFreeSpread(null) === 1);
  }

  console.log("\n④ 実際の依頼で、呼ぶ回数が問題数を超えない");
  {
    /* ここが本題。**1 回 1 問の細切れ**になっていないこと。 */
    const cases = [
      ["日本史の鎌倉時代について 10 問つくって", 10, 4],
      ["英単語の問題を 5 問", 5, 2],
      ["生物の細胞について 3 問", 3, 1],
      ["世界史を 30 問", 30, 8]
    ];
    cases.forEach(([text, n, want]) => {
      const c = aigenParseContract(text);
      ok("「" + text + "」→ " + want + " 形式",
        calls(c) === want, "実際 " + calls(c) + " 形式 / " + JSON.stringify(c.plan));
      ok("　問題数は " + n + " 問のまま",
        Object.values(c.plan).reduce((a, b) => a + b, 0) === n,
        String(Object.values(c.plan).reduce((a, b) => a + b, 0)));
      /* 1 形式あたり 1 問しか無い、という細切れになっていないこと
         （3 問以下のときは元々 1 形式なので対象外） */
      if (n >= 5) {
        const min = Math.min(...Object.values(c.plan));
        ok("　1 形式 1 問の細切れになっていない", min >= 2, "最小 " + min + " 問");
      }
    });
  }

  console.log("\n⑤ 名指しされた形式は 1 つも落とさない");
  {
    /* ③の絞り込みは **おまかせのときだけ**。名指しは全部そのまま。 */
    const c = aigenParseContract("並べ替えと分類と穴埋めと短答と対応づけと正誤で 10 問");
    const got = Object.keys(c.plan);
    ok("名指しした 6 形式がすべて残る（10 問でも 4 形式に削られない）",
      got.length >= 5, got.length + " 形式: " + got.join(", "));
    ok("　問題数は 10 問のまま",
      Object.values(c.plan).reduce((a, b) => a + b, 0) === 10,
      String(Object.values(c.plan).reduce((a, b) => a + b, 0)));

    /* ── 3 つ並べたときに、途中の形式が消えないこと ──
       数の読み取りは形式名から 6 文字先までしか見ない。
       「並べ替えと分類と穴埋め」では「と分類と穴埋」で尽きるので、
       並べ替えだけ数が付かず、**内訳のキーだけを allowed にしていたため
       まるごと消えていた**（実測 2026-08-14）。 */
    const c3 = aigenParseContract("並べ替えと分類と穴埋めで 10 問");
    ["reorder", "classification", "fill_blank"].forEach((id) => {
      ok("　「" + AIGEN_ENGINES[id].label + "」が消えていない",
        c3.plan[id] > 0, JSON.stringify(c3.plan));
    });
  }

  console.log("\n⑥ 1 つの数を 2 形式で分け合う（頼んだ数より多く作らない）");
  {
    /* ここが「生成時間が落ちた気がする」のもう 1 つの正体。
       内訳は形式ごとに **別々に**探すので、「並べ替えと分類で 10 問」の
       「10 問」を両方が自分の数として拾い、**20 問**作っていた。 */
    const c = aigenParseContract("並べ替えと分類で 10 問");
    const n = Object.values(c.plan).reduce((a, b) => a + b, 0);
    ok("「並べ替えと分類で 10 問」→ ちょうど 10 問", n === 10, n + " 問 " + JSON.stringify(c.plan));
    ok("　2 形式に分かれている", Object.keys(c.plan).length === 2, JSON.stringify(c.plan));

    /* 「ずつ」「それぞれ」は、同じ数でも **形式ごとの数**。 */
    const cz = aigenParseContract("4択と穴埋めを5問ずつ");
    ok("「5問ずつ」→ 合わせて 10 問",
      Object.values(cz.plan).reduce((a, b) => a + b, 0) === 10, JSON.stringify(cz.plan));
    const ce = aigenParseContract("並べ替えと分類でそれぞれ5問");
    ok("「それぞれ5問」→ 合わせて 10 問",
      Object.values(ce.plan).reduce((a, b) => a + b, 0) === 10, JSON.stringify(ce.plan));

    /* 本当の内訳（別々に数が書いてある）は、これまでどおり効くこと。 */
    const cd = aigenParseContract("並び替え4問、穴埋め4問");
    ok("「並び替え4問、穴埋め4問」→ 4/4 のまま",
      cd.plan.reorder === 4 && cd.plan.fill_blank === 4, JSON.stringify(cd.plan));
    ok("　利用者が決めた内訳は pinned になる", cd.pinned === true, String(cd.pinned));
  }

  console.log("\n⑦ 打ち消しの中の数を、問題数として拾わない");
  {
    /* 禁止の文を取り除くとき、形式名だけを消していたので
       「は1問も作らないでください」が残り、その「1問」を全体の
       問題数として拾っていた（実測 2026-08-14: 10 問頼んで 1 問）。 */
    const c = aigenParseContract("4択問題は1問も作らないでください。10問つくって");
    const n = Object.values(c.plan).reduce((a, b) => a + b, 0);
    ok("「1問も作らないで」の 1 を問題数にしない", n === 10, n + " 問 " + JSON.stringify(c.plan));
    ok("　4択は作らない", !(c.plan.single_choice > 0), JSON.stringify(c.plan));

    /* 打ち消しの読み取りそのものは壊していないこと。 */
    const cc = aigenParseContract("4択にして。ただし4択は禁止");
    ok("「作れと言われ禁止もされている」は止める", cc.state === "contradictory", cc.state);
    const cs = aigenParseContract("選択肢を使わないで15問");
    ok("「選択肢を使わない」→ 選ぶ形式は 1 つも入らない",
      Object.keys(cs.plan).every((id) => !AIGEN_ENGINES[id].choiceBased), JSON.stringify(cs.plan));
    ok("　15 問のまま",
      Object.values(cs.plan).reduce((a, b) => a + b, 0) === 15, JSON.stringify(cs.plan));
    const co = aigenParseContract("並び替え以外は使わないで。10問");
    ok("「◯◯以外は使わない」→ その形式だけ 10 問",
      co.plan.reorder === 10 && Object.keys(co.plan).length === 1, JSON.stringify(co.plan));
  }

  console.log("\n⑧ 名指しすれば、おまかせに無い形式も作れる");
  {
    /* 名指しが 1 つなら、これまでどおり 1 つ。 */
    const c1 = aigenParseContract("4択だけで 20 問");
    ok("「4択だけ」→ 4択 1 形式のまま",
      Object.keys(c1.plan).join(",") === "single_choice", JSON.stringify(c1.plan));
    ok("　20 問のまま", c1.plan.single_choice === 20, String(c1.plan.single_choice));

    /* おまかせでは作らないが、**名指しすれば作れる**こと。
       利用者の「プロンプトでグラフも作れるようにして」がここ。 */
    const cg = aigenParseContract("グラフの問題を 10 問");
    ok("「グラフ」は名指しすれば作れる",
      Object.keys(cg.plan).indexOf("chart_read") >= 0, JSON.stringify(cg.plan));
    const cf = aigenParseContract("記述問題を 10 問");
    ok("「記述」は名指しすれば作れる",
      Object.keys(cf.plan).indexOf("free_text") >= 0, JSON.stringify(cf.plan));
  }

  console.log("\n⑨ 形式の言葉に触れただけの文を、注文と読まない");
  {
    /* ベンチ A1 / A1b が落ちて分かった（実測 2026-08-14）。
       「語句カードを正しい順番に並べる」は **並べ替えの説明**であって、
       暗記カードの注文ではない。「カード」を暗記カードの別名にしていた
       ため、並べ替え 10 問が 並べ替え 5 ＋ 暗記カード 5 になっていた。 */
    const a1 = aigenParseContract(
      "高校1年生向けの英文並び替え問題を10問作成してください。"
      + "全問、語句カードを正しい順番に並べる形式にしてください。"
      + "4択、穴埋め、短答、自由記述は禁止です。正答と日本語解説を付けてください。");
    ok("「語句カードを並べる」→ 並べ替えだけ 10 問",
      a1.plan.reorder === 10 && Object.keys(a1.plan).length === 1, JSON.stringify(a1.plan));
    const a1b = aigenParseContract(
      "英語の語句整序問題を10問つくってください。"
      + "単語カードを正しい順番に並べる形式だけにしてください。");
    ok("「単語カードを並べる」→ 並べ替えだけ 10 問",
      a1b.plan.reorder === 10 && Object.keys(a1b.plan).length === 1, JSON.stringify(a1b.plan));

    /* 「カード」単独を別名から外しても、本当の注文は読めること。 */
    const fc = aigenParseContract("暗記カードで20問");
    ok("「暗記カード」はこれまでどおり読める",
      fc.plan.flashcard === 20, JSON.stringify(fc.plan));
    ["フラッシュカード", "単語帳", "カード形式"].forEach(function (w) {
      const c = aigenParseContract(w + "で 10 問");
      ok("　「" + w + "」も読める", c.plan.flashcard === 10, JSON.stringify(c.plan));
    });
    ok("「カード」単独は暗記カードの別名にしない",
      AIGEN_ENGINES.flashcard.alias.indexOf("カード") < 0,
      JSON.stringify(AIGEN_ENGINES.flashcard.alias));
  }

  console.log("\n⑩ 壊していないこと");
  {
    const c = aigenParseContract("鎌倉時代について 10 問");
    ok("止まらない（valid か ambiguous）",
      c.state === "valid" || c.state === "ambiguous", c.state);
    ok("使ってよい形式は 8 のまま（絞るのは割り振りだけ）",
      c.allowed.length === 8, c.allowed.length + "個");
    /* 割り振りに載っていない形式でも、返ってきたら受け取れること
       （forbidden に入っていない＝黙って捨てない） */
    const notPlanned = c.allowed.filter((id) => !(c.plan[id] > 0));
    ok("割り振りに無い形式を禁止していない",
      notPlanned.every((id) => c.forbidden.indexOf(id) < 0),
      notPlanned.filter((id) => c.forbidden.indexOf(id) >= 0).join(", "));
    ok("散らす数を減らしても 4択 は必ず入る", c.plan.single_choice > 0, JSON.stringify(c.plan));
  }

  console.log("\n" + (fail === 0 ? "✅ 全部通りました" : "❌ 落ちています") + "  通過 " + pass + " / 失敗 " + fail);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("落ちました:", e); process.exit(1); });
