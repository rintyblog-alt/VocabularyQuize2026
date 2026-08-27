/* ══════════════════════════════════════════════════════════════════════════
   vqvariants.cjs — 形式の細かい違いを、AI まで届ける（2026-08-14）

   数えて分かったこと:
     画面の形式 133 … AI が作れる 98 / 画像・音声が要る 27 / 復習モード 8
     ところが AI へ渡る指示文は **14 通り**しかなかった。
       single_choice 13 形式 → 指示は 1 つ（「choices は 4 個。」）
       free_text     23 形式 → 指示は 1 つ
       text_input    18 形式 → 指示は 1 つ

   「5択と指示したのに4択になった」の正体はこれ。バグではなく、
   choice_5 がサーバで single_choice に読み替えられた時点で
   「5」という情報が消えていた。

   直したところ:
     ① 形式ごとの違いを持つ表（AIGEN_VARIANTS）を足した
     ② 「5択」「要約」「漢字入力」を **形式の名指し**として読むようにした
     ③ 「N 択」は数から直接読む（6択・7択・二択も）
     ④ 指示文（rule / shape / 見出し）と **検査**の両方に効かせた
   ══════════════════════════════════════════════════════════════════════════ */
const fs = require("fs");
const path = require("path");

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (detail ? "  → " + detail : "")); }
};

(async function () {
  const m = await import("file://" + path.join(__dirname, "server", "src", "worker.js"));
  const T = m.__testables;
  const { AIGEN_ENGINES, AIGEN_VARIANTS, aigenVariantOf, aigenChoiceCountIn,
          aigenRuleOf, aigenShapeOf, aigenValidateOf, aigenParseContract } = T;

  const specOf = (text, eng) => (aigenParseContract(text).specs || {})[eng] || null;

  console.log("\n① 選択肢の数が、そのまま届く");
  {
    [[2, "二択で10問"], [3, "3択で10問"], [4, "4択で10問"], [5, "5択で10問"],
     [6, "6択で10問"], [7, "７択で10問"], [8, "八択で10問"]].forEach(([n, text]) => {
      const sp = specOf(text, "single_choice");
      ok("「" + text + "」→ choices は " + n + " 個", sp && sp.choices === n,
        sp ? String(sp.choices) : "違いが拾えていない");
      /* 指示文に数が入っていること（ここが本丸） */
      ok("　指示文が「ちょうど " + n + " 個」になっている",
        aigenRuleOf("single_choice", sp).indexOf("ちょうど " + n + " 個") >= 0,
        aigenRuleOf("single_choice", sp).slice(0, 40));
      /* 形の見本の選択肢も n 個 */
      const shape = aigenShapeOf("single_choice", sp);
      const chosen = (shape.match(/"choices":\[(.*?)\]/) || ["", ""])[1].split(",").length;
      ok("　形の見本も " + n + " 個", chosen === n, String(chosen));
    });
    /* 数を書かなければ、これまでどおり engine の既定（4 個） */
    ok("数を書かなければ既定のまま",
      aigenRuleOf("single_choice", null) === AIGEN_ENGINES.single_choice.rule);
  }

  console.log("\n② 数が違えば、検査で落ちる（4 択が返っても通さない）");
  {
    const sp5 = specOf("5択で10問", "single_choice");
    const four = { id: "q1", type: "single_choice", question: "問",
      choices: ["ア", "イ", "ウ", "エ"], answer: "ア", explanation: "解説" };
    const five = { id: "q1", type: "single_choice", question: "問",
      choices: ["ア", "イ", "ウ", "エ", "オ"], answer: "ア", explanation: "解説" };
    ok("5 択を頼んで 4 択が返ったら落とす",
      aigenValidateOf("single_choice", sp5, four) === "choices が 5 個でない",
      String(aigenValidateOf("single_choice", sp5, four)));
    ok("5 択が返れば通す", aigenValidateOf("single_choice", sp5, five) === null,
      String(aigenValidateOf("single_choice", sp5, five)));
    /* 違いが無いときは、これまでどおり engine の検査だけ */
    ok("違いが無ければ 4 択も 5 択も通る（既定は数を見ない）",
      aigenValidateOf("single_choice", null, four) === null
      && aigenValidateOf("single_choice", null, five) === null);
    /* engine の検査は残っている（緩めていない） */
    ok("answer が choices に無ければ、これまでどおり落ちる",
      aigenValidateOf("single_choice", sp5,
        Object.assign({}, five, { answer: "カ" })) === "answer が choices の中に無い");
  }

  console.log("\n③ 問い方と数を、重ねて頼める");
  {
    const sp = specOf("誤っているものを5択で10問", "single_choice");
    ok("「誤っているものを5択で」→ 5 個", sp && sp.choices === 5, sp ? String(sp.choices) : "無し");
    ok("　問い方（誤っているものを1つ）も残っている",
      aigenRuleOf("single_choice", sp).indexOf("誤っているものを 1 つだけ") >= 0,
      aigenRuleOf("single_choice", sp).slice(0, 80));
    ok("　見出しは「誤っているものを選択」のまま",
      sp && sp.label === "誤っているものを選択", sp ? sp.label : "無し");
    /* 数を書かなければ、問い方だけが効く（既定 4 個） */
    const sp2 = specOf("誤っているものを選ぶ問題を10問", "single_choice");
    ok("数を書かなければ 4 個のまま", sp2 && sp2.choices === 4, sp2 ? String(sp2.choices) : "無し");

    /* ── 問題文が毎回同じにならないようにする ──────────────────
       single_choice には dedupe が無く、**問題文で**同じ問題を見分ける。
       そのため「誤っているものはどれか。」だけの問題文だと 6 問とも
       同じ文になり、1 問を残して全部 重複として捨てられていた
       （実測 2026-08-14: 6 問頼んで 1 問。選択肢の数は合っていた）。 */
    ok("★ single_choice は問題文で重複を見分ける（前提の確認）",
      !AIGEN_ENGINES.single_choice.dedupe);
    ["誤っているものを5択で10問", "最適解選択で10問"].forEach((text) => {
      const r = aigenRuleOf("single_choice", specOf(text, "single_choice"));
      ok("「" + text + "」の指示に『何について問うのか』がある",
        r.indexOf("何について問うのか") >= 0, r.slice(0, 60));
      ok("　問題ごとに違う題材にさせている",
        /問題ごとに違う題材/.test(r), r.slice(0, 60));
    });
  }

  console.log("\n④ 「5択」「要約」も 形式の名指しとして読む");
  {
    /* ここが抜けていたので、「5択で10問」がおまかせ扱いになり
       4 形式へ散らばっていた（実測 2026-08-14）。 */
    const c = aigenParseContract("5択で10問");
    ok("「5択で10問」→ 4択の形式だけ 10 問",
      Object.keys(c.plan).join(",") === "single_choice" && c.plan.single_choice === 10,
      JSON.stringify(c.plan));
    [["要約で10問", "free_text", "summarize"],
     ["英作文で10問", "free_text", "english_writing"],
     ["漢字入力で10問", "text_input", "kanji_input"],
     ["読み仮名入力で10問", "text_input", "reading_input"],
     ["年代順並べ替えで10問", "reorder", "reorder_chronology"],
     ["多肢選択で10問", "single_choice", "choice_many"]].forEach(([text, eng, vid]) => {
      const cc = aigenParseContract(text);
      ok("「" + text + "」→ " + eng + " だけ 10 問",
        Object.keys(cc.plan).join(",") === eng && cc.plan[eng] === 10, JSON.stringify(cc.plan));
      ok("　違いは " + vid, (cc.specs || {})[eng] && cc.specs[eng].id === vid,
        JSON.stringify(Object.keys(cc.specs || {}).map((k) => cc.specs[k].id)));
    });
  }

  console.log("\n⑤ 内訳・禁止も、同じ言い方で読める");
  {
    /* 「5択」が別名表に無かったので、内訳の 6 問が丸ごと落ちていた。 */
    const c = aigenParseContract("5択を6問と穴埋めを4問");
    ok("「5択を6問と穴埋めを4問」→ 6/4 になる",
      c.plan.single_choice === 6 && c.plan.fill_blank === 4, JSON.stringify(c.plan));
    ok("　5択の指定も効いている",
      (c.specs || {}).single_choice && c.specs.single_choice.choices === 5,
      JSON.stringify(c.specs && c.specs.single_choice ? c.specs.single_choice.choices : null));
    /* 禁止も同じ表で読む */
    const cb = aigenParseContract("5択は禁止。10問");
    ok("「5択は禁止」→ 選ぶ形式を作らない",
      !(cb.plan.single_choice > 0), JSON.stringify(cb.plan));
  }

  console.log("\n⑥ 画面から来る id でも引ける");
  {
    /* 画面は choice_5 / kanji_input のような **レジストリの id** を送る。
       ここがずれると、黙って既定（4 択）に落ちて直ったように見えない。 */
    [["choice_5", "single_choice", 5], ["choice_2", "single_choice", 2],
     ["multiple_choice_single", "single_choice", 4], ["choice_many", "single_choice", 8]]
      .forEach(([id, eng, n]) => {
        const v = aigenVariantOf(id);
        ok("id 「" + id + "」→ " + eng + " / " + n + " 個",
          v && v.engine === eng && v.choices === n, JSON.stringify(v && v.choices));
      });
    ["kanji_input", "reading_input", "summarize", "english_writing", "proof",
     "reorder_chronology", "matching_country_capital"].forEach((id) => {
      ok("id 「" + id + "」が引ける", !!aigenVariantOf(id));
    });
  }

  console.log("\n⑦ 表と画面のレジストリが食い違っていない");
  {
    /* ★ キーは画面の id と同じでなければならない。ずれると黙って
       既定に落ちるので、**気づけない**。ここで突き合わせる。 */
    const html = require("./vqsrc.cjs").丸ごと();
    const a = html.indexOf("/* ───────── domain/qtypes.js ───────── */");
    const b = html.indexOf("/* ───────── domain/qdescriptor.js ───────── */");
    const g = {};
    new Function("globalThis", "with(globalThis){" + html.slice(a, b) + "}").call(g, g);
    const Q = g.VQ2.qtypes;
    const byId = {};
    Q.all().forEach((d) => { byId[d.id] = d; });

    const unknown = Object.keys(AIGEN_VARIANTS).filter((k) => !byId[k]);
    ok("表のキーがすべて画面のレジストリにある", unknown.length === 0, unknown.join(", "));

    const wrongEngine = Object.keys(AIGEN_VARIANTS)
      .filter((k) => byId[k] && byId[k].engine !== AIGEN_VARIANTS[k].engine);
    ok("engine の割り当てが画面と一致している", wrongEngine.length === 0,
      wrongEngine.map((k) => k + ": 画面=" + byId[k].engine + " / こちら=" + AIGEN_VARIANTS[k].engine).join(" / "));

    /* 選択肢の数も、画面の defaults と合っていること */
    const wrongCount = Object.keys(AIGEN_VARIANTS).filter((k) => {
      const want = byId[k] && byId[k].defaults ? byId[k].defaults.choiceCount : 0;
      const got = AIGEN_VARIANTS[k].choices;
      return want && got && want !== got;
    });
    ok("選択肢の数が画面と一致している", wrongCount.length === 0,
      wrongCount.map((k) => k + ": 画面=" + byId[k].defaults.choiceCount
        + " / こちら=" + AIGEN_VARIANTS[k].choices).join(" / "));

    /* 画面も数を渡していること（幅ではなく数） */
    ok("画面の指示文が「ちょうど N 個」を渡している",
      /選択肢の数（必ず守る）: /.test(html) && /ちょうど " \+ g\.choiceCount \+ " 個/.test(html));
    ok("画面が choiceCount を渡している",
      /choiceCount: \(d\.defaults && d\.defaults\.choiceCount\) \|\| 0,/.test(html));
  }

  console.log("\n⑧ 壊していないこと");
  {
    /* 違いを渡さない形式は、これまでどおり engine の決まりのまま。 */
    ["fill_blank", "true_false", "numeric_input", "composite"].forEach((id) => {
      ok(AIGEN_ENGINES[id].label + " は既定のまま",
        aigenRuleOf(id, null) === AIGEN_ENGINES[id].rule
        && aigenShapeOf(id, null) === AIGEN_ENGINES[id].shape);
    });
    /* 知らない形式でも落ちない */
    ok("知らない形式でも落ちない",
      aigenRuleOf("nope", null) === "" && aigenShapeOf("nope", null) === ""
      && aigenValidateOf("nope", null, {}) === "知らない形式");
    /* 違いの検査が落ちても、生成を止めない */
    ok("違いの検査が例外を投げても通す",
      aigenValidateOf("single_choice", { check: () => { throw new Error("x"); } },
        { id: "q", type: "single_choice", question: "問", choices: ["ア", "イ"], answer: "ア" }) === null);
    /* おまかせは、これまでどおり違いを付けない */
    ok("おまかせには違いを付けない",
      Object.keys(aigenParseContract("日本史を10問").specs || {}).length === 0);
    ok("N 択の読み取りは 2〜8 だけ",
      aigenChoiceCountIn("1択") === 0 && aigenChoiceCountIn("9択") === 0
      && aigenChoiceCountIn("5択") === 5 && aigenChoiceCountIn("") === 0);
  }

  console.log("\n" + (fail === 0 ? "✅ 全部通りました" : "❌ 落ちています") + "  通過 " + pass + " / 失敗 " + fail);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("落ちました:", e); process.exit(1); });
