/* 失敗したページを読み直したときの動きを固定する。

   これまで手で確かめていた 1 件目。見たいのは次のとおり。
   ・読み直すのは失敗したページだけ（読めているページに触らない）
   ・読めているページの本文と Evidence を失わない
   ・失敗ページが ok に変われば completed へ進む
   ・もう一度失敗しても partially_completed のまま、回数だけ増える
   ・いつまでも読み直せない（上限がある）

   実行: node vqretry.cjs
*/
let pass = 0, fail = 0;
const failures = [];
function step(name, fn) {
  try { const m = fn(); pass++; console.log("  ok   " + name + (m ? " — " + m : "")); }
  catch (e) { fail++; failures.push(name); console.log("  NG   " + name + "\n         → " + (e && e.message)); }
}
function assert(c, m) { if (!c) throw new Error(m || "満たしていません"); }

(async () => {
  const PE = await import("./local-ai/src/attachments/page-evidence.mjs");
  const AJ = await import("./local-ai/src/attachments/analysis-job.mjs");

  const BODY = (n) => "第" + n + "章の内容。生物の形をまねた技術について、"
    + "はりねずみの針や蜂の巣の六角形など、身のまわりの例をあげて説明している。";

  /* 8 ページの資料。3 ページと 6 ページだけ読めなかった状態を作る。 */
  function build() {
    const j = AJ.createAnalysisJob({ attachmentId: "doc1", name: "教材.pdf" });
    j.to("uploaded"); j.to("classifying"); j.to("rendering_pages"); j.to("running_ocr");
    for (let n = 1; n <= 8; n++) {
      const bad = n === 3 || n === 6;
      j.setPage(bad
        ? PE.makePageEvidence({ attachmentId: "doc1", fileName: "教材.pdf", pageNumber: n,
                                sourceType: "image_analysis", status: "failed",
                                errorCode: "analysis_failed" })
        : PE.makePageEvidence({ attachmentId: "doc1", fileName: "教材.pdf", pageNumber: n,
                                sourceType: "image_analysis", status: "ok", confidence: 0.9,
                                extractedText: BODY(n) }));
    }
    j.to("building_evidence"); j.finish();
    return j;
  }

  console.log("══ 読み直す前の状態 ══");
  let job = null, before = null;
  step("8 ページ中 2 ページが読めず、partially_completed になっている", () => {
    job = build();
    before = job.describe();
    assert(before.state === "partially_completed", "state が " + before.state);
    assert(before.usablePages === 6, "使えるページが " + before.usablePages);
    assert(JSON.stringify(before.failedPages) === "[3,6]",
      "失敗ページが違う: " + JSON.stringify(before.failedPages));
    assert(before.attempt === 0, "読み直し回数が " + before.attempt);
    return before.usablePages + " / 8 ページ・失敗 [3,6]";
  });

  step("添付カードは「一部読み取り」に見える状態", () => {
    assert(before.outcome === "partial", "outcome が " + before.outcome);
    const ids = before.actions.map((a) => a.id);
    assert(ids.indexOf("retry_failed") >= 0, "読み直しの手が無い: " + ids.join(","));
    return "outcome=partial ／ " + ids.join(" / ");
  });

  console.log("\n══ 失敗ページだけ読み直す ══");

  let started = null, keptText = null;
  step("読み直すのは失敗した 2 ページだけ", () => {
    keptText = job.pages.filter((p) => p.status === "ok")
      .map((p) => p.pageNumber + ":" + p.extractedText.length).join(",");
    started = job.beginRetry();
    assert(started.ok, "始められない: " + started.error);
    assert(JSON.stringify(started.pages) === "[3,6]",
      "対象が違う: " + JSON.stringify(started.pages));
    return "[3,6]（8 ページ中 2 ページ）";
  });

  step("読めているページを読み直しの対象にしない", () => {
    const pending = job.pages.filter((p) => p.status === "pending").map((p) => p.pageNumber);
    assert(JSON.stringify(pending) === "[3,6]", "待機になったページが違う: " + JSON.stringify(pending));
    const stillOk = job.pages.filter((p) => p.status === "ok").map((p) => p.pageNumber);
    assert(JSON.stringify(stillOk) === "[1,2,4,5,7,8]", "読めていたページが変わった: " + JSON.stringify(stillOk));
    return "そのまま [1,2,4,5,7,8]";
  });

  step("読めていたページの本文を失わない", () => {
    const now = job.pages.filter((p) => p.status === "ok")
      .map((p) => p.pageNumber + ":" + p.extractedText.length).join(",");
    assert(now === keptText, "本文が変わった\n           前: " + keptText + "\n           後: " + now);
    return "6 ページぶんの本文はそのまま";
  });

  step("読み直しの回数が 1 になる", () => {
    assert(job.attempt === 1, "回数が " + job.attempt);
    assert(job.pageAttempts[3] === 1 && job.pageAttempts[6] === 1,
      "ページごとの回数が違う: " + JSON.stringify(job.pageAttempts));
    return "全体 1 回 / 3 ページ目 1 回 / 6 ページ目 1 回";
  });

  console.log("\n══ 読み直しが成功したとき ══");

  let after = null;
  step("失敗ページが ok に変わり、completed へ進む", () => {
    job.to("running_ocr");
    [3, 6].forEach((n) => job.setPage(PE.makePageEvidence({
      attachmentId: "doc1", fileName: "教材.pdf", pageNumber: n, sourceType: "image_analysis",
      status: "ok", confidence: 0.7, extractedText: BODY(n) })));
    job.to("building_evidence");
    const r = job.finish();
    after = job.describe();
    assert(r.state === "completed", "state が " + r.state);
    assert(after.usablePages === 8, "使えるページが " + after.usablePages);
    assert(after.failedPages.length === 0, "失敗ページが残っている: " + JSON.stringify(after.failedPages));
    return "8 / 8 ページ・失敗 0 → completed";
  });

  step("読めるページが増えている（6 → 8）", () => {
    assert(after.usablePages > before.usablePages,
      before.usablePages + " → " + after.usablePages);
    return before.usablePages + " → " + after.usablePages + " ページ";
  });

  step("添付カードが「一部読み取り」から「文字起こし済み」へ変わる", () => {
    assert(before.state === "partially_completed" && after.state === "completed",
      before.state + " → " + after.state);
    assert(after.outcome === "complete", "outcome が " + after.outcome);
    /* 画面の対応表（preset-studio の ANALYSIS_TO_CHIP）と同じ対応で確かめる */
    const chip = { partially_completed: "partially_ready", completed: "ready" };
    return chip[before.state] + "（一部読み取り）→ " + chip[after.state] + "（文字起こし済み）";
  });

  step("読み直した内容が出題の材料へ加わる", () => {
    const chunks = job.toChunks();
    assert(chunks.length === 8, "区間が " + chunks.length);
    const pages = chunks.map((c) => c.page).sort((a, b) => a - b);
    assert(JSON.stringify(pages) === "[1,2,3,4,5,6,7,8]", "ページが揃わない: " + JSON.stringify(pages));
    assert(chunks.filter((c) => c.page === 3 || c.page === 6).every((c) => c.text.length > 20),
      "読み直したページの本文が入っていない");
    return "8 区間（3・6 ページ目を含む）";
  });

  console.log("\n══ 読み直しても、また失敗したとき ══");

  step("partially_completed のまま、回数だけ増える", () => {
    const j = build();
    const r1 = j.beginRetry();
    assert(r1.ok && j.attempt === 1, "1 回目が始まらない");
    j.to("running_ocr");
    [3, 6].forEach((n) => j.setPage(PE.makePageEvidence({
      pageNumber: n, status: "failed", errorCode: "analysis_failed" })));
    j.to("building_evidence");
    const f = j.finish();
    assert(f.state === "partially_completed", "state が " + f.state);
    assert(j.describe().usablePages === 6, "読めていたページが減った");
    const r2 = j.beginRetry();
    assert(r2.ok && j.attempt === 2, "2 回目が始まらない: " + JSON.stringify(r2));
    return "state=partially_completed / 回数 2 / 読めたページ 6 のまま";
  });

  step("いつまでも読み直せない（3 回で打ち切る）", () => {
    const j = build();
    let n = 0;
    for (let i = 0; i < 10; i++) {
      const r = j.beginRetry();
      if (!r.ok) { assert(r.error === "RETRY_LIMIT", "理由が違う: " + r.error); break; }
      n++;
      j.to("running_ocr");
      [3, 6].forEach((p) => j.setPage(PE.makePageEvidence({
        pageNumber: p, status: "failed", errorCode: "analysis_failed" })));
      j.to("building_evidence"); j.finish();
    }
    assert(n === 3, "読み直せた回数が " + n);
    assert(j.retryExhausted(), "まだ読み直せることになっている");
    const ids = j.describe().actions.map((a) => a.id);
    assert(ids.indexOf("retry_failed") < 0, "上限なのに読み直しの手が出ている: " + ids.join(","));
    return "3 回で打ち切り ／ 残る手: " + ids.join(" / ");
  });

  step("打ち切っても、読めていたページは使える", () => {
    const j = build();
    for (let i = 0; i < 5; i++) {
      const r = j.beginRetry();
      if (!r.ok) break;
      j.to("running_ocr");
      [3, 6].forEach((p) => j.setPage(PE.makePageEvidence({
        pageNumber: p, status: "failed", errorCode: "analysis_failed" })));
      j.to("building_evidence"); j.finish();
    }
    const d = j.describe();
    assert(d.usablePages === 6, "使えるページが " + d.usablePages);
    assert(j.toChunks().length === 6, "区間が " + j.toChunks().length);
    const ids = d.actions.map((a) => a.id);
    assert(ids.indexOf("use_readable") >= 0, "読めたぶんで進む手が無い: " + ids.join(","));
    return "6 ページ・6 区間は使える ／ " + ids.join(" / ");
  });

  console.log("\n結果: " + pass + " 通過 / " + fail + " 失敗");
  if (failures.length) failures.forEach((f) => console.log("  - " + f));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
