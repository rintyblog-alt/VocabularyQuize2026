/* 資料全体を見る（full-coverage）の決めごとを確かめる。

   見たいのは 4 つ。
   ・いつ使うか（Quick Mock / 10 問以上 / 「資料全体」の指定）
   ・18 区間を 4 つずつ、**最後まで**回すこと（4 区間で終わらない）
   ・7 つの状態を持つこと。未処理が残るうちは completed にしないこと
   ・全区間から見出し・論点・語句・図表・重複をまとめ、問題数を先に配ること

   実行: node vqcoverage.cjs
*/
let pass = 0, fail = 0;
const failures = [];
function step(name, fn) {
  try { const m = fn(); pass++; console.log("  ok   " + name + (m ? " — " + m : "")); }
  catch (e) { fail++; failures.push(name); console.log("  NG   " + name + "\n         → " + (e && e.message)); }
}
function assert(c, m) { if (!c) throw new Error(m || "満たしていません"); }

(async () => {
  const CV = await import("./local-ai/src/attachments/coverage.mjs");

  console.log("══ いつ全体を見るか ══");

  step("Quick Mock は資料全体から作る", () => {
    const r = CV.shouldFullCover({ schema: "mock", options: { questionCount: 3 } });
    assert(r.on, "使われない");
    return r.reason;
  });
  step("10 問以上なら全体から作る", () => {
    const on = CV.shouldFullCover({ schema: "preset", options: { questionCount: 10 } });
    const off = CV.shouldFullCover({ schema: "preset", options: { questionCount: 9 } });
    assert(on.on, "10 問で使われない");
    assert(!off.on, "9 問で使われてしまう");
    return "10 問 → " + on.reason + " ／ 9 問 → " + off.reason;
  });
  step("「資料全体」「全ページ」の指定で全体から作る", () => {
    ["資料全体から出してください", "全ページから均等に", "範囲全体を使って"].forEach((m, i) => {
      const r = CV.shouldFullCover({ schema: "preset", message: m, options: { questionCount: 3 } });
      if (i < 2) assert(r.on, "「" + m + "」で使われない");
    });
    const r = CV.shouldFullCover({ schema: "preset", message: "全ページから", options: {} });
    return r.reason + "（" + r.phrase + "）";
  });
  step("ふつうの少数問題では使わない（毎回重くしない）", () => {
    const r = CV.shouldFullCover({ schema: "preset", message: "3問作って", options: { questionCount: 3 } });
    assert(!r.on, "使われてしまう: " + r.reason);
    return r.reason;
  });

  console.log("\n══ 18 区間を 4 つずつ、最後まで ══");

  const chunks = Array.from({ length: 18 }, (_, i) => ({
    text: "区間 " + (i + 1) + " の本文。", page: i + 1, fileName: "資料.pdf"
  }));

  let run = null;
  step("18 区間が 5 回に分かれる（4/4/4/4/2）", () => {
    run = new CV.CoverageRun({ chunks });
    assert(run.totalChunks === 18, "区間数が " + run.totalChunks);
    assert(run.totalBatches === 5, "回数が " + run.totalBatches);
    const sizes = run.batches().map((b) => b.length);
    assert(JSON.stringify(sizes) === "[4,4,4,4,2]", "分け方が違う: " + JSON.stringify(sizes));
    const first = run.batchAt(0).map((x) => x.index + 1);
    const last = run.batchAt(4).map((x) => x.index + 1);
    assert(JSON.stringify(first) === "[1,2,3,4]", "1 回目が違う: " + JSON.stringify(first));
    assert(JSON.stringify(last) === "[17,18]", "5 回目が違う: " + JSON.stringify(last));
    return sizes.join(" / ");
  });

  step("4 区間で止まらず、18 区間すべてを処理する", () => {
    for (let i = 0; i < run.totalBatches; i++)
      run.markBatch(i, { ok: true, data: { topics: ["論点" + i] },
                         pages: run.batchAt(i).map((x) => x.chunk.page) });
    const st = run.status();
    assert(st.processedChunks === 18, "処理した区間が " + st.processedChunks);
    assert(st.coveragePercent === 100, "到達率が " + st.coveragePercent + "%");
    assert(st.state === "completed", "状態が " + st.state);
    return st.processedChunks + " / " + st.totalChunks + " 区間・" + st.coveragePercent + "%";
  });

  step("保持する状態が 7 つそろっている", () => {
    const st = run.status();
    ["totalChunks", "processedChunks", "failedChunks", "excludedChunks",
     "currentBatch", "totalBatches", "coveragePercent"].forEach((k) => {
      assert(k in st, k + " が無い");
    });
    return "totalChunks 18 / currentBatch " + st.currentBatch + " / totalBatches " + st.totalBatches;
  });

  console.log("\n══ 途中までしか読めなかったとき ══");

  step("未処理が残るうちは completed にしない", () => {
    const r = new CV.CoverageRun({ chunks });
    for (let i = 0; i < 3; i++) r.markBatch(i, { ok: true, data: {} });
    const st = r.status();
    assert(st.state !== "completed", "状態が " + st.state);
    assert(st.state === "partially_completed", "状態が " + st.state);
    assert(st.processedChunks === 12 && st.coveragePercent === 67,
      "途中経過が違う: " + st.processedChunks + " / " + st.coveragePercent);
    return st.processedChunks + " / 18 区間・" + st.coveragePercent + "% → " + st.state;
  });

  step("一部失敗は partially_completed。3 つの手が出る", () => {
    const r = new CV.CoverageRun({ chunks });
    for (let i = 0; i < 5; i++) r.markBatch(i, i === 2 ? { ok: false } : { ok: true, data: {} });
    const st = r.status();
    assert(st.state === "partially_completed", "状態が " + st.state);
    assert(st.failedChunks.length === 4, "失敗が " + st.failedChunks.length + " 区間");
    assert(JSON.stringify(r.retryable()) === "[8,9,10,11]",
      "読み直す区間が違う: " + JSON.stringify(r.retryable()));
    const ids = r.actions().map((a) => a.id);
    ["use_processed", "retry_chunks", "exclude_chunks", "cancel"].forEach((k) =>
      assert(ids.indexOf(k) >= 0, k + " が無い: " + ids.join(",")));
    return st.processedChunks + " 区間成功 / 失敗 " + st.failedChunks.length + " ／ " + ids.join(" / ");
  });

  step("読めない区間を外すと、残りで 100% になる", () => {
    const r = new CV.CoverageRun({ chunks });
    for (let i = 0; i < 5; i++) r.markBatch(i, i === 2 ? { ok: false } : { ok: true, data: {} });
    r.exclude([8, 9, 10, 11]);
    const st = r.status();
    assert(st.excludedChunks.length === 4, "外した数が " + st.excludedChunks.length);
    assert(st.failedChunks.length === 0, "失敗が残っている");
    assert(st.state === "completed", "状態が " + st.state);
    return "外した 4 区間 / 残り " + (st.totalChunks - 4) + " 区間で " + st.coveragePercent + "%";
  });

  console.log("\n══ 全区間から統合する ══");

  const results = [
    { batch: 0, pages: [1, 2, 3, 4], data: {
      headings: ["第1章 律令国家"], topics: [{ topic: "律令制", page: 2 }, { topic: "班田収授", page: 3 }],
      terms: ["班田収授法", "口分田"], figures: ["表1 官制"],
      questionCandidates: [{ question: "班田収授法とは", topic: "班田収授" }] } },
    { batch: 1, pages: [5, 6, 7, 8], data: {
      headings: ["第2章 摂関政治"], topics: [{ topic: "摂関政治", page: 6 }, { topic: "律令制", page: 7 }],
      terms: ["荘園", "口分田"], figures: [],
      questionCandidates: [{ question: "摂関政治の特徴", topic: "摂関政治" }] } },
    { batch: 2, pages: [9, 10], data: {
      headings: ["第3章 院政"], topics: [{ topic: "院政", page: 9 }],
      terms: ["知行国"], figures: ["図2 系図"], questionCandidates: [] } }
  ];
  let outline = null;
  step("見出し・ページ範囲・論点・語句・図表・重複・出題候補をまとめる", () => {
    outline = CV.mergeOutline(results);
    assert(outline.headings.length === 3, "見出しが " + outline.headings.length);
    assert(JSON.stringify(outline.pageRanges) === '[{"from":1,"to":10}]',
      "ページ範囲が違う: " + JSON.stringify(outline.pageRanges));
    /* 「律令制」は 1 回目と 2 回目の両方に出る。まとめて 1 件になるのが正しい
       （消えるのではなく、重複として印が付く）。5 件 − 重複 1 件 = 4 件。 */
    assert(outline.topics.length === 4, "論点が " + outline.topics.length);
    assert(outline.topics.filter((t) => t.label === "律令制")[0].count === 2,
      "重複した論点の回数が数えられていない");
    assert(outline.terms.length === 4, "語句が " + outline.terms.length + "（重複が消えていない）");
    assert(outline.figures.length === 2, "図表が " + outline.figures.length);
    assert(outline.candidates.length === 2, "出題候補が " + outline.candidates.length);
    return outline.topics.length + " 論点 / p." + outline.pageRanges[0].from
      + "〜" + outline.pageRanges[0].to + " / 語句 " + outline.terms.length;
  });

  step("2 か所以上に出る論点は「重複」として残す（消さない）", () => {
    const d = outline.duplicates.map((x) => x.label);
    assert(d.indexOf("律令制") >= 0, "重複が拾えていない: " + d.join(","));
    assert(outline.topics.some((t) => t.label === "律令制"), "論点そのものが消えている");
    return d.join(" / ");
  });

  console.log("\n══ 先に配る ══");

  step("30 問を論点とページ範囲へ先に配る（合計が合う）", () => {
    const a = CV.allocateQuestions(30, outline);
    assert(a.total === 30, "合計が " + a.total);
    assert(a.items.length === outline.topics.length, "配った論点が " + a.items.length);
    assert(a.items.every((x) => x.questions >= 1), "0 問の論点がある");
    const dup = a.items.filter((x) => x.duplicated)[0];
    assert(dup, "重複した論点に印が無い");
    assert(dup.questions >= 2, "何度も出る論点が " + dup.questions + " 問");
    return a.items.map((x) => x.topic + " " + x.questions).join(" / ");
  });

  step("論点より問題数が少なくても破綻しない", () => {
    const a = CV.allocateQuestions(3, outline);
    assert(a.total === 3, "合計が " + a.total);
    assert(a.items.length === 3, "配った論点が " + a.items.length);
    return a.items.map((x) => x.topic + " " + x.questions).join(" / ");
  });

  step("論点が取れなかったときは資料全体へ 1 本にまとめる", () => {
    const a = CV.allocateQuestions(5, { topics: [] });
    assert(a.total === 5 && a.items.length === 1, JSON.stringify(a));
    return a.items[0].topic + " " + a.items[0].questions + " 問";
  });

  step("配分は作成の指示へ、そのまま文章として渡る", () => {
    const a = CV.allocateQuestions(30, outline);
    const t = CV.renderCoverage(outline, a, run);
    assert(/この配分どおりに作ってください/.test(t), "配分の指示が無い");
    assert(/合計 30 問/.test(t), "合計が無い");
    assert(/ページ範囲: 1〜10/.test(t), "ページ範囲が無い: " + t.slice(0, 120));
    assert(/繰り返し出る論点/.test(t), "重複の印が無い");
    assert(/前半だけに偏らせないでください/.test(t), "偏りを止める指示が無い");
    return t.split("\n").length + " 行の地図（本文は入れない）";
  });

  step("渡す文章に資料の本文そのものは入らない", () => {
    const t = CV.renderCoverage(outline, CV.allocateQuestions(10, outline), run);
    assert(t.indexOf("区間 1 の本文") < 0, "本文が混ざっている");
    return "本文なし";
  });

  console.log("\n══ 画面に出す言い方 ══");
  step("指定どおりの文言が出る", () => {
    const want = [
      CV.LOG.split(18), CV.LOG.scanning(4, 18), CV.LOG.scanning(8, 18),
      CV.LOG.scanned(18), CV.LOG.merged(), CV.LOG.allocating(30)
    ];
    const expect = [
      "資料を18区間に分割しました", "4 / 18区間を確認しています", "8 / 18区間を確認しています",
      "18 / 18区間を確認しました", "資料全体から論点を整理しました", "30問へ配分しています"
    ];
    want.forEach((w, i) => assert(w === expect[i], "「" + w + "」≠「" + expect[i] + "」"));
    return want.join(" ／ ");
  });

  console.log("\n結果: " + pass + " 通過 / " + fail + " 失敗");
  if (failures.length) failures.forEach((f) => console.log("  - " + f));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
