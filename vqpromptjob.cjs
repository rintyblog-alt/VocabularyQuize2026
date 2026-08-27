/* 資料を 1 件も付けずに、指示だけで試験を作らせる（実測）。

   確かめること:
     ・資料なしでもゲートで止まらない
     ・論点 → 出題枠 → 問題 の順で進む
     ・頼んだ数ぶん問題ができる
     ・出典（sourceReferences）と ページ番号が 1 つも作られていない
     ・問題文・選択肢・正解・解説がそろっている

   実行:
     VQ_Q=10 node vqpromptjob.cjs "高校日本史・明治維新の要点から"
*/
const http = require("node:http");
const fs = require("node:fs");

const BRIDGE = process.env.VQ_BRIDGE || "http://127.0.0.1:17891";
const COUNT = Number(process.env.VQ_Q) || 10;
const TOPIC = process.argv[2] || "高校日本史・明治維新の要点から";
const hr = () => Number(process.hrtime.bigint()) / 1e6;

const instruction = [
  TOPIC + " " + COUNT + " 問つくってください。",
  "",
  "【試験の条件】",
  "科目: 日本史",
  "学年: 高校2年",
  "試験時間: 50 分",
  "満点: 100 点",
  "大問数: 1 問",
  "設問数: 約 " + COUNT + " 問",
  "含める問題形式: 4択・正誤",
  "難易度: 易しい問題から難しい問題まで混ぜる",
  "資料は添付されていません。上の指示の範囲で、確かな内容だけから出題してください。",
  "出典・ページ番号は書かないでください（指せる資料がありません）。",
  "確かでない事実・作った固有名詞や年号で問題を作ってはいけません。"
].join("\n");

(async () => {
  console.log("資料なしで " + COUNT + " 問を頼みます（" + TOPIC + "）…\n");
  const t0 = hr();
  const body = JSON.stringify({
    message: instruction,
    attachments: [],
    options: {
      questionCount: COUNT, sectionCount: 1, structuredOutput: "mock",
      questionTypes: ["multiple_choice", "true_false"],
      scoreAuthority: "client",
      /* ここが今回の入口。資料なしで作る。 */
      promptOnly: true,
      sourceOnly: false, requireEvidence: false
    },
    stream: true
  });

  const events = [];
  let structured = null, errorEv = null;
  await new Promise((resolve, reject) => {
    const u = new URL(BRIDGE + "/chat/completions");
    const req = http.request({
      hostname: u.hostname, port: u.port, path: u.pathname, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
    }, (res) => {
      if (res.statusCode !== 200) {
        let t = ""; res.on("data", (d) => { t += d; });
        res.on("end", () => reject(new Error("要求が通りません: " + res.statusCode + " " + t.slice(0, 500))));
        return;
      }
      let buf = "", ev = null;
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        buf += chunk;
        const lines = buf.split("\n"); buf = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("event:")) ev = line.slice(6).trim();
          else if (line.startsWith("data:")) {
            let d = null; try { d = JSON.parse(line.slice(5).trim()); } catch { }
            if (!d || ev === "token") continue;
            if (ev === "structured") { structured = d; continue; }
            if (ev === "error") errorEv = d;
            events.push({ at: +(hr() - t0).toFixed(0), ev,
                          label: (d.label || d.message || "").slice(0, 78),
                          status: d.status || null,
                          detail: d.detail ? String(d.detail).slice(0, 160) : null,
                          report: d.report || null });
          }
        }
      });
      res.on("end", resolve);
      res.on("error", reject);
    });
    req.on("error", reject);
    req.end(body);
  });

  const totalMs = hr() - t0;
  console.table(events.filter((e) =>
    /orchestrator|worker|mock|schema|verify|completed|error|failed|shortfall/i.test((e.ev || "") + " " + (e.label || "")))
    .map((e) => ({ 秒: (e.at / 1000).toFixed(1), 種類: e.ev, 見出し: e.label,
                   状態: e.status, 内訳: e.detail })));

  const rep = events.filter((e) => e.report).pop();
  if (rep) { console.log("\n生成の内訳:"); console.log(JSON.stringify(rep.report, null, 1)); }
  if (errorEv) console.log("\nエラー:", JSON.stringify(errorEv).slice(0, 400));

  /* ── できたものを数える（本文は出さない）────────────────── */
  const data = structured && (structured.sections ? structured : structured.data) || null;
  const qs = data && Array.isArray(data.sections)
    ? data.sections.reduce((a, s) => a.concat(s.questions || []), []) : [];
  const has = (q, k) => !!String(q[k] || "").trim();
  const refs = qs.reduce((a, q) => a + ((q.sourceReferences || []).length), 0);
  const pages = qs.reduce((a, q) => a + ((q.sourcePageNumbers || []).length), 0);
  const badChoices = qs.filter((q) =>
    (q.type === "multiple_choice" && (q.choices || []).length !== 4)
    || (q.type === "true_false" && (q.choices || []).length !== 2)).length;
  const answerInRange = qs.filter((q) => {
    const ids = (q.choices || []).map((c) => String(c.id || "").toUpperCase());
    return !ids.length || ids.indexOf(String(q.answer || "").toUpperCase()) >= 0;
  }).length;

  console.log("\n── 結果 ──────────────────────────────");
  console.log("総時間            : " + (totalMs / 1000).toFixed(1) + " 秒");
  console.log("頼んだ数 / できた数: " + COUNT + " / " + qs.length);
  console.log("問題文あり        : " + qs.filter((q) => has(q, "question")).length + " / " + qs.length);
  console.log("正解あり          : " + qs.filter((q) => has(q, "answer")).length + " / " + qs.length);
  console.log("解説あり          : " + qs.filter((q) => has(q, "explanation")).length + " / " + qs.length);
  console.log("解答一覧          : " + ((data && data.answerKey) || []).length + " 件");
  console.log("選択肢の数が形式と合わない: " + badChoices + " 問");
  console.log("正解が選択肢の中にある    : " + answerInRange + " / " + qs.length);
  console.log("合計点            : " + (data ? data.totalScore : "-"));
  console.log("出典（作られていないこと）: " + refs + " 件  ← 0 が正しい");
  console.log("ページ番号（同上）        : " + pages + " 件  ← 0 が正しい");
  const types = {};
  qs.forEach((q) => { types[q.type] = (types[q.type] || 0) + 1; });
  console.log("形式の内訳        : " + JSON.stringify(types));
  /* 問題文そのものは出さない。長さだけ。 */
  console.log("問題文の長さ(中央値): " + (() => {
    const l = qs.map((q) => String(q.question || "").length).sort((a, b) => a - b);
    return l.length ? l[Math.floor(l.length / 2)] : 0;
  })() + " 字");

  const out = process.env.VQ_OUT || "/tmp/vqpromptjob.json";
  fs.writeFileSync(out, JSON.stringify({
    totalMs, count: COUNT, made: qs.length, refs, pages, badChoices, events
  }, null, 2));
  console.log("記録: " + out);
})();
