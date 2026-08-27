/* ページ単位 evidence・部分成功・安全対策を実際に動かして確かめる。

   ここで見たいのは 3 つ。
   ・1 ページ落ちても資料全体が捨てられないこと
   ・画像から文字が起きても「読めた」と断定していないこと
     （ok / low_confidence / no_text_detected / failed が残る）
   ・上限が実際に効いていること（これまで読まれていなかった設定がある）

   実行: node vqpage.cjs
*/
let pass = 0, fail = 0;
const failures = [];
function step(name, fn) {
  try { const m = fn(); pass++; console.log("  ok   " + name + (m ? " — " + m : "")); }
  catch (e) { fail++; failures.push(name); console.log("  NG   " + name + "\n         → " + (e && e.message)); }
}
function assert(c, m) { if (!c) throw new Error(m || "満たしていません"); }

/* ── 画像の作りもの（ヘッダだけ本物にする）───────────────── */
function png(w, h) {
  const b = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write("IHDR", 12, "ascii");
  b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b;
}
function jpeg(w, h, orientation) {
  const parts = [Buffer.from([0xff, 0xd8])];
  if (orientation) {
    const tiff = Buffer.alloc(26);
    tiff.write("II", 0, "ascii"); tiff.writeUInt16LE(42, 2); tiff.writeUInt32LE(8, 4);
    tiff.writeUInt16LE(1, 8);                        /* IFD エントリ 1 件 */
    tiff.writeUInt16LE(0x0112, 10);                  /* Orientation */
    tiff.writeUInt16LE(3, 12); tiff.writeUInt32LE(1, 14);
    /* IFD エントリは tag(2)+type(2)+count(4)+value(4)。値は 18 バイト目から。 */
    tiff.writeUInt16LE(orientation, 18);
    tiff.writeUInt32LE(0, 22);
    const payload = Buffer.concat([Buffer.from("Exif\0\0", "binary"), tiff]);
    const seg = Buffer.alloc(4);
    seg.writeUInt16BE(0xffe1, 0); seg.writeUInt16BE(payload.length + 2, 2);
    parts.push(seg, payload);
  }
  const sof = Buffer.alloc(4 + 17);
  sof.writeUInt16BE(0xffc0, 0); sof.writeUInt16BE(17, 2);
  sof.writeUInt8(8, 4); sof.writeUInt16BE(h, 5); sof.writeUInt16BE(w, 7); sof.writeUInt8(3, 9);
  parts.push(sof, Buffer.from([0xff, 0xd9]));
  return Buffer.concat(parts);
}
function webp(w, h) {
  const b = Buffer.alloc(30);
  b.write("RIFF", 0, "ascii"); b.writeUInt32LE(22, 4); b.write("WEBP", 8, "ascii");
  b.write("VP8X", 12, "ascii"); b.writeUInt32LE(10, 16);
  b.writeUIntLE(w - 1, 24, 3); b.writeUIntLE(h - 1, 27, 3);
  return b;
}

(async () => {
  const PE = await import("./local-ai/src/attachments/page-evidence.mjs");
  const AJ = await import("./local-ai/src/attachments/analysis-job.mjs");
  const IP = await import("./local-ai/src/attachments/image-probe.mjs");
  const LM = await import("./local-ai/src/attachments/limits.mjs");
  const PC = await import("./local-ai/src/attachments/page-classify.mjs");

  console.log("══ ページ単位 evidence ══");

  const FIELDS = ["attachmentId", "pageNumber", "sourceType", "extractedText", "confidence",
    "imageRef", "boundingBoxes", "headings", "tables", "figures", "status", "errorCode"];

  step("ページ 1 件が 12 項目をすべて持つ", () => {
    const r = PE.makePageEvidence({ attachmentId: "a1", pageNumber: 3, status: "ok",
      extractedText: "あ".repeat(200), sourceType: "image_analysis" });
    const missing = FIELDS.filter((k) => !(k in r));
    assert(!missing.length, "欠けている: " + missing.join(","));
    return FIELDS.length + " 項目";
  });

  /* 本文らしい文章。同じ字ばかりの文字列は「本文が薄い」と判定されるのが正しい。 */
  const BODY = "光合成は葉緑体で行われ、水と二酸化炭素から有機物と酸素を作る反応である。"
    + "明反応では光エネルギーを化学エネルギーへ変え、暗反応で炭素を固定する。"
    + "気孔の開閉は蒸散量と取り込む気体の量を左右し、温度や湿度の影響を受ける。\n"
    + "呼吸はミトコンドリアで進み、有機物を分解して生命活動に必要な energy を取り出す。"
    + "植物は昼間、光合成と呼吸の両方を行っており、見かけ上の吸収量は差として現れる。";

  step("テキスト層のページは確かさ 1 で ok になる", () => {
    const cls = PC.classifyDocument([{ pageNumber: 1, text: BODY }], LM.LOW_TEXT);
    const r = PE.fromTextLayer(cls.pages[0], { attachmentId: "a1", fileName: "理科.pdf" });
    assert(r.status === "ok", "status が " + r.status);
    assert(r.confidence === 1, "confidence が " + r.confidence);
    assert(r.sourceType === "text_layer", "sourceType が " + r.sourceType);
    return r.characterCount + " 字";
  });

  step("ページ番号だけのページは本文として数えない", () => {
    const cls = PC.classifyDocument([{ pageNumber: 7, text: "  7  " }], LM.LOW_TEXT);
    const r = PE.fromTextLayer(cls.pages[0], { attachmentId: "a1" });
    assert(r.status === "no_text_detected", "status が " + r.status);
    assert(r.extractedText === "", "本文が残っている");
    return "no_text_detected";
  });

  console.log("\n══ 読めたと断定しない ══");

  step("十分な書き起こしは ok（ただし確かさは 1 未満）", () => {
    const r = PE.fromImageAnalysis("光合成は葉緑体で行われる反応である。".repeat(12),
      { attachmentId: "a1", pageNumber: 1 });
    assert(r.status === "ok", "status が " + r.status);
    assert(r.confidence > 0 && r.confidence <= 0.9, "confidence が " + r.confidence);
    assert(r.sourceType === "image_analysis", "sourceType が " + r.sourceType);
    return "ok / confidence " + r.confidence;
  });

  step("［不明］が多い書き起こしは low_confidence（成功にしない）", () => {
    const r = PE.fromImageAnalysis("あ".repeat(100) + "［不明］".repeat(10),
      { attachmentId: "a1", pageNumber: 2 });
    assert(r.status === "low_confidence", "status が " + r.status);
    assert(r.extractedText.length > 0, "本文まで捨てている");
    return "low_confidence / confidence " + r.confidence;
  });

  step("短すぎる返答は no_text_detected（本文を残さない）", () => {
    const r = PE.fromImageAnalysis("読み取れません", { attachmentId: "a1", pageNumber: 3 });
    assert(r.status === "no_text_detected", "status が " + r.status);
    assert(r.extractedText === "", "本文が残っている");
    return "no_text_detected";
  });

  step("解析そのものが落ちたら failed と理由が残る", () => {
    const r = PE.fromImageAnalysis("", { attachmentId: "a1", pageNumber: 4, error: "analysis_timeout" });
    assert(r.status === "failed", "status が " + r.status);
    assert(r.errorCode === "analysis_timeout", "errorCode が " + r.errorCode);
    return "failed / analysis_timeout";
  });

  step("4 つの状態がすべて別物として残る", () => {
    const seen = new Set([
      PE.fromImageAnalysis("光合成の仕組みについて。".repeat(12), { pageNumber: 1 }).status,
      PE.fromImageAnalysis("あ".repeat(100) + "［不明］".repeat(10), { pageNumber: 2 }).status,
      PE.fromImageAnalysis("×", { pageNumber: 3 }).status,
      PE.fromImageAnalysis("", { pageNumber: 4, error: "render_failed" }).status
    ]);
    assert(seen.size === 4, "まとまってしまった: " + [...seen].join(","));
    return [...seen].join(" / ");
  });

  console.log("\n══ 部分成功（1 ページ落ちても捨てない）══");

  /* 48 ページ。44 ページは読めて、4 ページだけ写りが悪い。 */
  function build48() {
    const job = AJ.createAnalysisJob({ attachmentId: "doc1", name: "教材.pdf", totalPages: 48 });
    job.to("uploaded"); job.to("classifying"); job.to("extracting_text");
    job.to("rendering_pages"); job.to("running_ocr");
    const bad = new Set([12, 13, 30, 47]);
    for (let n = 1; n <= 48; n++) {
      job.setPage(bad.has(n)
        ? PE.makePageEvidence({ attachmentId: "doc1", pageNumber: n, sourceType: "image_analysis",
                                status: "failed", errorCode: "analysis_failed" })
        : PE.makePageEvidence({ attachmentId: "doc1", fileName: "教材.pdf", pageNumber: n,
                                sourceType: "text_layer", status: "ok", confidence: 1,
                                extractedText: "第" + n + "章の内容。".repeat(20) }));
    }
    return job;
  }

  let job48 = null;
  step("48 ページ中 4 ページ失敗 → partially_completed（failed にしない）", () => {
    job48 = build48();
    job48.to("building_evidence");
    const r = job48.finish();
    assert(r.ok, "終われない: " + r.error);
    assert(r.state === "partially_completed", "state が " + r.state);
    assert(r.summary.usablePages === 44, "使えるページが " + r.summary.usablePages);
    return r.summary.summary;
  });

  step("読めた 44 ページだけが出題の材料になる", () => {
    const chunks = job48.toChunks();
    assert(chunks.length === 44, "区間が " + chunks.length);
    assert(chunks.every((c) => c.text && c.page), "ページ番号か本文が欠けている");
    assert(chunks.every((c) => [12, 13, 30, 47].indexOf(c.page) < 0), "読めないページが混ざった");
    return chunks.length + " 区間 / " + chunks.reduce((a, c) => a + c.text.length, 0) + " 字";
  });

  step("やり直すのは失敗した 4 ページだけ（44 ページを読み直さない）", () => {
    const r = job48.beginRetry();
    assert(r.ok, "再解析に入れない: " + r.error);
    assert(r.pages.length === 4, "対象が " + r.pages.length + " ページ");
    assert(JSON.stringify(r.pages) === "[12,13,30,47]", "対象が違う: " + JSON.stringify(r.pages));
    assert(job48.state === "rendering_pages", "state が " + job48.state);
    return "[12,13,30,47]";
  });

  step("読み直しが通れば completed になる", () => {
    job48.to("running_ocr");
    [12, 13, 30, 47].forEach((n) => job48.setPage(PE.makePageEvidence({
      attachmentId: "doc1", fileName: "教材.pdf", pageNumber: n, sourceType: "image_analysis",
      status: "ok", confidence: 0.7, extractedText: "第" + n + "章の内容。".repeat(20) })));
    job48.to("building_evidence");
    const r = job48.finish();
    assert(r.state === "completed", "state が " + r.state);
    assert(r.summary.usablePages === 48, "使えるページが " + r.summary.usablePages);
    return "48 / 48";
  });

  step("読めないページを外すと本文が落ち、記録だけ残る", () => {
    const j = build48();
    j.to("building_evidence"); j.finish();
    j.excludePages([12, 13, 30, 47]);
    const s = PE.summarize(j.pages);
    assert(s.byStatus.excluded === 4, "外れた数が " + s.byStatus.excluded);
    assert(s.total === 48, "ページの記録が消えた（" + s.total + "）");
    assert(j.toChunks().length === 44, "区間が " + j.toChunks().length);
    return "48 ページの記録は残り、区間は 44";
  });

  step("読めるページが 1 つも無いときだけ failed", () => {
    const j = AJ.createAnalysisJob({ attachmentId: "d2", name: "写り悪い.pdf" });
    j.to("uploaded"); j.to("classifying"); j.to("rendering_pages"); j.to("running_ocr");
    for (let n = 1; n <= 5; n++) j.setPage(PE.makePageEvidence({
      pageNumber: n, status: "failed", errorCode: "analysis_failed" }));
    j.to("building_evidence");
    assert(j.finish().state === "failed", "state が " + j.state);
    return "failed";
  });

  console.log("\n══ 解析ジョブの 13 状態 ══");

  step("13 状態がそろっている", () => {
    const want = ["queued", "uploading", "uploaded", "classifying", "extracting_text",
      "rendering_pages", "running_ocr", "analyzing_figures", "building_evidence",
      "completed", "partially_completed", "failed", "canceled"];
    assert(AJ.STATES.length === 13, "数が " + AJ.STATES.length);
    const missing = want.filter((s) => AJ.STATES.indexOf(s) < 0);
    assert(!missing.length, "欠け: " + missing.join(","));
    assert(want.every((s) => AJ.STATE_LABEL[s]), "画面に出す言い方が無い状態がある");
    return "13 状態";
  });

  step("決めた道以外へは進めない", () => {
    const j = AJ.createAnalysisJob({ attachmentId: "d3" });
    const r = j.to("completed");
    assert(!r.ok && r.error === "BAD_TRANSITION", "通ってしまった: " + JSON.stringify(r));
    assert(j.state === "queued", "state が動いた（" + j.state + "）");
    return "queued → completed は拒否";
  });

  step("中止したあとは何も進まない", () => {
    const j = AJ.createAnalysisJob({ attachmentId: "d4" });
    j.to("canceled", { reason: "利用者が中止" });
    assert(!j.to("uploaded").ok, "中止後に進んでしまう");
    assert(j.canceledReason === "利用者が中止", "理由が残らない");
    return "canceled で止まる";
  });

  step("状態に応じて 4 つの操作を出し分ける", () => {
    const j = build48();
    j.to("building_evidence"); j.finish();
    const ids = j.describe().actions.map((a) => a.id);
    ["use_readable", "retry_failed", "exclude_pages", "cancel"].forEach((k) =>
      assert(ids.indexOf(k) >= 0, k + " が出ない（" + ids.join(",") + "）"));
    return ids.join(" / ");
  });

  step("画面へ渡す形に資料の本文が入らない", () => {
    const d = build48().describe();
    const s = JSON.stringify(d);
    assert(s.indexOf("第1章の内容") < 0, "本文が混ざっている");
    assert(d.pages.length === 48 && d.pages[0].status, "ページごとの状態が無い");
    return d.summary;
  });

  console.log("\n══ 安全対策 ══");

  step("PNG・JPEG・WebP の縦横をヘッダだけで読む", () => {
    assert(IP.probeImage(png(1200, 800)).width === 1200, "PNG が読めない");
    const j = IP.probeImage(jpeg(1600, 900, 0));
    assert(j.width === 1600 && j.height === 900, "JPEG が読めない: " + JSON.stringify(j));
    const w = IP.probeImage(webp(640, 480));
    assert(w.width === 640 && w.height === 480, "WebP が読めない: " + JSON.stringify(w));
    return "png 1200×800 / jpeg 1600×900 / webp 640×480";
  });

  step("EXIF の向きを読む（横倒しの写真を立て直せる）", () => {
    const info = IP.probeImage(jpeg(4000, 3000, 6));
    assert(info.orientation === 6, "orientation が " + info.orientation);
    const chk = IP.checkImage(info, { bytes: 1000 });
    assert(chk.needsRotation && chk.rotate === 90, "回す指示が出ない: " + JSON.stringify(chk));
    assert(chk.orientedWidth === 3000 && chk.orientedHeight === 4000, "回したあとの形が違う");
    return "orientation 6 → 90 度 / 3000×4000";
  });

  step("maxImageEdgePx が実際に効く（これまで誰も読んでいなかった）", () => {
    const chk = IP.checkImage(IP.probeImage(png(8000, 6000)), { bytes: 5 * 1024 * 1024 });
    assert(!chk.ok && chk.reasons.indexOf("edge") >= 0, "止まらない: " + JSON.stringify(chk.reasons));
    assert(chk.needsResize && chk.targetWidth <= LM.LIMITS.maxImageEdgePx, "縮める指示が出ない");
    return chk.message;
  });

  step("大きすぎる画像はそのまま渡さない", () => {
    const chk = IP.checkImage(IP.probeImage(png(1000, 1000)),
      { bytes: LM.LIMITS.maxImageBytesPerAttachment + 1 });
    assert(!chk.ok && chk.reasons.indexOf("bytes") >= 0, "通ってしまう");
    return chk.message;
  });

  step("1 添付から取り込む文字数に上限がある", () => {
    const c = LM.capAttachmentText("あ".repeat(LM.LIMITS.maxTextCharsPerAttachment + 5000));
    assert(c.truncated, "切っていない");
    assert(c.text.length === LM.LIMITS.maxTextCharsPerAttachment, "長さが " + c.text.length);
    return (c.limit / 10000) + "万字まで";
  });

  step("区間の数と総文字数にも上限がある", () => {
    const many = Array.from({ length: LM.LIMITS.maxChunksPerJob + 100 },
      (_, i) => ({ text: "x".repeat(100), page: i + 1 }));
    const r = LM.capTotals(many);
    assert(r.truncated, "切っていない");
    assert(r.take.length <= LM.LIMITS.maxChunksPerJob, "区間が " + r.take.length);
    assert(r.characters <= LM.LIMITS.maxTotalTextChars, "文字数が " + r.characters);
    return r.take.length + " 区間 / " + r.characters + " 字";
  });

  step("添付ぶんのメモリを見積もれる（モデルの分だけで判定しない）", () => {
    const b = LM.estimateAttachmentBytes([
      { imageBase64: "A".repeat(4 * 1024 * 1024) }, { text: "あ".repeat(100000) }
    ]);
    assert(b > 6 * 1024 * 1024, "見積もりが小さすぎる: " + b);
    return (b / 1048576).toFixed(1) + "MB と見積もる";
  });

  step("ページ数の上限は 1 か所から来て、超えた分は捨てずに残る", () => {
    assert(LM.LIMITS.maxScanPages === 200, "上限が " + LM.LIMITS.maxScanPages);
    const r = LM.fitScanPages(Array.from({ length: 260 }, (_, i) => i + 1));
    assert(r.take.length === 200 && r.skipped.length === 60, "分け方が違う");
    assert(r.truncated, "打ち切ったことが残らない");
    return "200 送信 / 60 は送らないと記録";
  });

  step("小分けにして送る（全ページを一度に展開しない）", () => {
    const b = LM.batchPages(Array.from({ length: 50 }, (_, i) => i + 1));
    assert(b.length === Math.ceil(50 / LM.LIMITS.pagesPerExtractionBatch), "分割数が " + b.length);
    assert(b[0].length === LM.LIMITS.pagesPerExtractionBatch, "1 回の枚数が " + b[0].length);
    return b.length + " 回 × " + b[0].length + " ページ";
  });

  console.log("\n結果: " + pass + " 通過 / " + fail + " 失敗");
  if (failures.length) failures.forEach((f) => console.log("  - " + f));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
