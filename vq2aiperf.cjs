/* AI 経路の所要時間を実測する（Bridge へ直接。UI の描画時間を含めない） */
const BASE = "http://127.0.0.1:17891";
const HEAD = { "Content-Type": "application/json", Origin: "http://127.0.0.1:8791" };

const 教材 = `
【第1章 律令国家の成立】
1. 645年、中大兄皇子と中臣鎌足は蘇我氏を倒し、大化の改新と呼ばれる政治改革を始めた。
2. 大宝律令は701年に完成し、律（刑法）と令（行政法）から成る国家の基本法典となった。
3. 710年、元明天皇は都を藤原京から平城京へ移した。平城京は唐の長安を手本にしている。
4. 班田収授法により、6歳以上の男女に口分田が与えられ、死後は国へ返された。
5. 743年の墾田永年私財法により開墾地の永久私有が認められ、荘園の発生につながった。
【第2章 摂関政治】
6. 藤原道長は4人の娘を天皇の后とし、1016年に摂政となって権勢を極めた。
7. 御成敗式目は1232年、北条泰時により制定された武家最初の体系的法典である。
`.trim();

async function sse(body, label) {
  const t0 = Date.now();
  let firstToken = null, chars = 0, calls = 0, structured = null, err = null;
  const acts = [];
  const res = await fetch(BASE + "/chat/completions", { method: "POST", headers: HEAD, body: JSON.stringify(body) });
  if (!res.ok) return { label, ok: false, err: "HTTP " + res.status };
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = "", ev = "", data = "";
  while (true) {
    const c = await reader.read();
    if (c.done) break;
    buf += dec.decode(c.value, { stream: true });
    const lines = buf.split("\n"); buf = lines.pop() || "";
    for (const L of lines) {
      if (L.startsWith("event: ")) { ev = L.slice(7).trim(); continue; }
      if (L.startsWith("data: ")) { data = L.slice(6); continue; }
      if (L === "") {
        if (!ev) continue;
        let j = null; try { j = JSON.parse(data); } catch (e) {}
        if (j) {
          if (ev === "token") { if (firstToken === null) firstToken = Date.now() - t0; chars += (j.text || "").length; }
          if (ev === "usage") calls = j.modelCalls || 0;
          if (ev === "structured") structured = j;
          if (ev === "error") err = j.message || j.code;
          if (ev === "activity" && j.status === "completed") acts.push(j.label);
        }
        ev = ""; data = "";
      }
    }
  }
  return { label, ok: !err, err, totalMs: Date.now() - t0, firstTokenMs: firstToken, chars, calls, structured, acts };
}

function attach(text) {
  return [{ id: "a1", name: "授業プリント.pdf", kind: "pdf", extractedText: "[p.1] " + text, pageCount: 1 }];
}

(async () => {
  const runs = [];

  console.log("── プリセット生成（資料あり・5問）");
  runs.push(await sse({
    requestId: "p1", message: "添付した資料だけを根拠に、高校生向けの4択問題を5問作ってください。全選択肢に解説をつけてください。",
    modelId: "standard", thinkingLevel: "normal", attachments: attach(教材),
    options: { structuredOutput: "preset", sourceOnly: true, requireCitations: true }
  }, "プリセット生成 5問（標準）"));

  console.log("── 試験の構成案");
  runs.push(await sse({
    requestId: "b1", message: "添付した資料だけを根拠に、50分100点、大問2問の期末考査の構成案だけを作ってください。まだ問題文は作らないでください。",
    modelId: "standard", thinkingLevel: "normal", attachments: attach(教材),
    options: { sourceOnly: true }
  }, "試験の構成案（標準）"));

  console.log("── MockSpec 生成（試験本体）");
  runs.push(await sse({
    requestId: "m1", message: "添付した資料だけを根拠に、50分100点、大問2問の期末考査を作ってください。選択・短答・記述を含めてください。",
    modelId: "standard", thinkingLevel: "normal", attachments: attach(教材),
    options: { structuredOutput: "mock", sourceOnly: true, requireCitations: true }
  }, "試験生成（標準）"));

  console.log("── 記述の AI 採点（1問）");
  runs.push(await sse({
    requestId: "g1", message: "記述式の解答を採点してください。", modelId: "standard", thinkingLevel: "normal",
    options: { workspaceTask: "ai_grading", payload: { targets: [{
      questionId: "q1", question: "御成敗式目の意義を100字程度で説明せよ。",
      modelAnswer: "武家最初の体系的法典として、御家人の争いを裁く基準を示した。",
      answer: "御成敗式目は1232年に北条泰時が定めた武家最初の体系的な法典であり、御家人どうしの争いを裁く基準を示した点に意義がある。",
      points: 20, subject: "日本史探究", grade: "高3",
      rubric: [
        { id: "r1", description: "問われている内容に答えている", points: 12, criterionLabel: "思考・判断・表現" },
        { id: "r2", description: "根拠や用語が正しい", points: 8, criterionLabel: "知識・技能" }
      ]}]}}
  }, "記述の AI 採点 1問（標準）"));

  console.log("── 学習分析");
  runs.push(await sse({
    requestId: "a1", message: "答案を分析してください。", modelId: "standard", thinkingLevel: "normal",
    options: { workspaceTask: "learning_analysis", payload: {
      title: "期末考査", subject: "日本史探究", totalScore: 62, totalMax: 100,
      byCriterion: [{ label: "知識・技能", score: 40, max: 50 }, { label: "思考・判断・表現", score: 22, max: 50 }],
      byTopic: [{ topic: "古代", score: 40, max: 50, count: 5 }, { topic: "中世", score: 22, max: 50, count: 3 }],
      items: [
        { questionId: "q1", answered: true, correct: true, score: 10, maxScore: 10, topic: "古代", type: "multiple_choice_single", difficulty: "easy", timeMs: 30000 },
        { questionId: "q2", answered: true, correct: false, score: 0, maxScore: 10, topic: "中世", type: "short_answer", difficulty: "hard", timeMs: 180000 },
        { questionId: "q3", answered: false, correct: false, score: 0, maxScore: 20, topic: "中世", type: "long_answer", difficulty: "hard", timeMs: 0 }
      ],
      wrongDetails: "- q2「御成敗式目を定めたのは誰か」正解: 北条泰時\n- q3「荘園の発生を説明せよ」未回答",
      behavior: "1問あたりの中央値 30 秒 / 時間をかけて誤答: q2 / 未回答: 1 問"
    }}
  }, "学習分析（標準）"));

  console.log("── 試験の品質分析（deep）");
  runs.push(await sse({
    requestId: "q1", message: "この試験の品質を確認してください。", modelId: "standard", thinkingLevel: "deep",
    options: { workspaceTask: "mock_quality_review", payload: {
      title: "期末考査", subject: "日本史探究", durationMinutes: 50, totalPoints: 100, sampleSize: 1,
      sectionIds: ["s1"],
      difficultyDistribution: "易しい 1 問 / 標準 1 問 / 難しい 1 問",
      topicDistribution: "古代 1 問 / 中世 2 問", typeDistribution: "選択 1 問 / 短答 1 問 / 記述 1 問",
      questions: [
        { id: "q1", question: "大化の改新の年は？", points: 10, type: "multiple_choice_single", difficulty: "easy", topic: "古代", accuracy: 1, sourceCount: 1 },
        { id: "q2", question: "御成敗式目を定めたのは誰か", points: 10, type: "short_answer", difficulty: "hard", topic: "中世", accuracy: 0, sourceCount: 1 },
        { id: "q3", question: "荘園の発生を説明せよ", points: 80, type: "long_answer", difficulty: "hard", topic: "中世", accuracy: 0, sourceCount: 0, rubricItems: 2, answerLines: 2 }
      ]
    }}
  }, "試験の品質分析（深い）"));

  console.log("\n══ AI 経路の実測 ══\n");
  console.log("| 処理 | 所要 | 初トークン | モデル呼出 | 出力 | 結果 |");
  console.log("|---|---:|---:|---:|---:|---|");
  runs.forEach((r) => {
    let detail = r.ok ? "成功" : "失敗: " + r.err;
    if (r.structured && r.structured.data) {
      const d = r.structured.data;
      if (d.grades) detail = d.graded + "/" + d.total + " 問を採点";
      else if (d.findings) detail = d.findings.length + " 件の指摘";
      else if (d.weaknesses) detail = "強み " + (d.strengths || []).length + " / 弱み " + (d.weaknesses || []).length;
    } else if (r.structured && r.structured.questions) {
      detail = r.structured.questions.length + " 問を生成";
    } else if (r.structured && r.structured.sections) {
      const n = r.structured.sections.reduce((a, s) => a + (s.questions || []).length, 0);
      detail = "大問 " + r.structured.sections.length + " / " + n + " 問";
    }
    console.log("| " + r.label + " | " + (r.totalMs / 1000).toFixed(1) + " s | "
      + (r.firstTokenMs === null ? "－" : (r.firstTokenMs / 1000).toFixed(1) + " s") + " | "
      + r.calls + " | " + r.chars + " 字 | " + detail + " |");
  });

  const st = await (await fetch(BASE + "/status")).json();
  console.log("\n── 実測メモリ ──");
  console.log("  総 " + (st.resources.memTotalBytes / 1e9).toFixed(0) + "GB / 空き "
    + (st.resources.memFreeBytes / 1e9).toFixed(1) + "GB / 使用率 " + st.resources.memUsedPct + "%");
  const m = await (await fetch(BASE + "/models")).json();
  const arr = Array.isArray(m) ? m : (Array.isArray(m.models) ? m.models : []);
  console.log("── モデル ──");
  arr.filter(Boolean).forEach((x) => console.log("  " + (x.id || x.name || x.ref)
    + " installed=" + (x.installed ? "yes" : "no") + " loaded=" + (x.loaded ? "yes" : "no")
    + (x.sizeVram ? " " + (x.sizeVram / 1e9).toFixed(1) + "GB" : "")));
})().catch((e) => { console.error("計測エラー:", e); process.exit(1); });
