/* 添付（画像 / PDF 相当のテキスト）が、実際に出題の根拠として使われるかを
   Bridge へ直接投げて確かめる。UI は通さない。

   ここで見るのは 3 つ。
   ・画像が Evidence になるか（evidenceCount が 0 でなくなるか）
   ・資料限定のゲートを通って生成まで進むか
   ・落ちたときに、理由が 7 種のどれとして返るか

   実行: node vqattachprobe.cjs [image|text|none|unsupported]
*/
const fs = require("node:fs");
const path = require("node:path");

const BRIDGE = process.env.VQ_BRIDGE || "http://127.0.0.1:17891";
const MODE = process.argv[2] || "image";
const IMG = path.join(__dirname, "artifacts", "attach", "plant.png");

function attachmentsFor(mode) {
  if (mode === "none") return [];
  if (mode === "unsupported") {
    return [{ id: "a1", name: "資料.xyz", kind: "binary", fileType: "binary",
              extractedText: "", extractedCharacterCount: 0 }];
  }
  if (mode === "text") {
    const text = [
      "[p.1] 光合成は葉緑体で行われる。植物は光エネルギーを使い、二酸化炭素と水から",
      "デンプンと酸素をつくる。光合成がさかんになる条件は、光の強さ・二酸化炭素の濃度・温度の三つである。",
      "[p.2] 呼吸は昼夜を通して行われ、酸素を取り入れて二酸化炭素を出す。",
      "昼は光合成のほうがさかんなので、見かけ上は二酸化炭素を吸収しているように見える。",
      "ふ入りの葉の実験では、緑色の部分だけがヨウ素液で青紫色に変化する。",
      "[p.3] 葉の断面には、表皮・柵状組織・海綿状組織・葉脈がある。気孔は葉の裏側に多く分布し、",
      "蒸散と気体の出入りを行う。孔辺細胞が水を吸って膨らむと気孔が開き、水が出ていくと閉じる。",
      "[p.4] 対照実験では、調べたい条件だけを変え、ほかの条件はそろえる。",
      "アルミはくで包んだ葉と包まない葉を比べると、光が必要であることを確かめられる。",
      "湯せんしたエタノールで葉の緑色を抜いてから、ヨウ素液をかけて色の変化を見る。"
    ].join("\n");
    return [{ id: "a1", name: "光合成プリント.pdf", kind: "pdf", fileType: "pdf",
              extractedText: text, extractedCharacterCount: text.length,
              pageCount: 2, pages: [1, 2] }];
  }
  const b64 = fs.readFileSync(IMG).toString("base64");
  if (mode === "pages") {
    /* 資料 1 冊のうち、1 ページは読める・1 ページは真っ白。
       1 ページ落ちたときに資料ごと捨てていないかを見るための組み合わせ。 */
    return [
      { id: "doc1", name: "理科プリント.pdf", kind: "pdf", fileType: "pdf",
        extractedText: "", extractedCharacterCount: 0, pageCount: 2 },
      { id: "doc1-p1", parentAttachmentId: "doc1", pageNumber: 1,
        name: "理科プリント.pdf（1ページ）", kind: "image", fileType: "image",
        imageBase64: b64, extractedCharacterCount: 0 },
      { id: "doc1-p2", parentAttachmentId: "doc1", pageNumber: 2,
        name: "理科プリント.pdf（2ページ）", kind: "image", fileType: "image",
        imageBase64: blankPng(), extractedCharacterCount: 0 }
    ];
  }
  return [{ id: "a1", name: "光合成プリント.png", kind: "image", fileType: "image",
            imageBase64: b64, extractedCharacterCount: 0 }];
}

/* 何も書いていない 256×256 の白紙。読み取れるものが無いページの代わり。 */
function blankPng() {
  const zlib = require("node:zlib");
  const W = 256, H = 256;
  const raw = Buffer.alloc((W * 3 + 1) * H, 0xff);
  for (let y = 0; y < H; y++) raw[y * (W * 3 + 1)] = 0;      /* フィルタ種別 */
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(body) : crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))
  ]);
  return png.toString("base64");
}
let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

const req = {
  message: "添付した資料だけを根拠に、中学理科の4択問題を" + (Number(process.env.VQ_Q) || 3) + "問作ってください。",
  thinkingLevel: "normal",
  attachments: attachmentsFor(MODE),
  taskHint: "preset_generation",
  options: {
    sourceOnly: true,
    requireEvidence: true,
    questionCount: Number(process.env.VQ_Q) || 3,
    schema: "preset"
  },
  plan: "free",
  ownerId: "probe"
};

(async () => {
  console.log("条件: " + MODE + " / 資料限定 ON / 3 問");
  const t0 = Date.now();
  const res = await fetch(BRIDGE + "/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req)
  });
  if (!res.ok) { console.log("HTTP " + res.status + " " + (await res.text()).slice(0, 200)); process.exit(1); }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", ev = null;
  const acts = [], out = { error: null, metrics: null, structured: null };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) {
      if (line.startsWith("event:")) { ev = line.slice(6).trim(); continue; }
      if (!line.startsWith("data:")) continue;
      let j = null;
      try { j = JSON.parse(line.slice(5).trim()); } catch (e) { continue; }
      if (ev === "activity") acts.push(j.type + " [" + j.status + "] " + (j.label || ""));
      else if (ev === "error") out.error = j;
      else if (ev === "metrics") out.metrics = j;
      else if (ev === "structured") out.structured = j;
    }
  }

  console.log("\n── 工程 ──");
  acts.filter((a) => /vision|context|worker|preset|mock|schema|evidence/.test(a))
      .forEach((a) => console.log("  " + a));

  const m = out.metrics || {};
  const sp = m.sourcePlan || {};
  console.log("\n── 資料の扱い ──");
  (sp.files || []).forEach((f) => console.log("  " + JSON.stringify({
    name: f.fileName, type: f.fileType, pageCount: f.pageCount,
    chars: f.extractedCharacterCount, chunks: f.chunkCount, evidence: f.evidenceCount
  })));
  console.log("  chunkCount: " + sp.chunkCount + " / selectedChunks: " + sp.selectedChunks);
  console.log("  evidenceAudit: " + JSON.stringify(m.evidenceAudit));
  console.log("  evidence 行数: " + ((m.evidence || []).length));

  /* ページごとの読み取り結果。1 ページ落ちたときに資料が捨てられていないかを見る。 */
  const aa = m.attachmentAnalysis || (out.error && out.error.sourceDiagnosis
    && out.error.sourceDiagnosis.images && out.error.sourceDiagnosis.images.jobs);
  if (aa && aa.length) {
    console.log("\n── ページごとの読み取り ──");
    aa.forEach((j) => {
      console.log("  " + j.name + ": " + j.state + "（" + j.label + "）");
      console.log("    " + j.summary);
      console.log("    " + j.pages.map((p) => "p" + p.pageNumber + "=" + p.status
        + (p.confidence != null ? "(" + p.confidence + ")" : "")).join(" "));
      console.log("    できること: " + j.actions.map((a) => a.id).join(" / "));
    });
  }

  console.log("\n── 結果 ──");
  if (out.error) {
    console.log("  失敗: " + out.error.code);
    console.log("  文面: " + out.error.message);
    console.log("  detail: " + out.error.detail);
    console.log("  診断: " + JSON.stringify(out.error.sourceDiagnosis, null, 1));
  } else {
    const d = out.structured && (out.structured.data || out.structured);
    const qs = (d && (d.questions || (d.sections || []).flatMap((s) => s.questions || []))) || [];
    console.log("  ✓ 生成できました: " + qs.length + " 問");
    qs.slice(0, 3).forEach((q, i) => console.log("   " + (i + 1) + ". "
      + String(q.question || q.prompt || "").slice(0, 60)));
  }
  console.log("  所要 " + ((Date.now() - t0) / 1000).toFixed(1) + " 秒");
})().catch((e) => { console.error(e); process.exit(1); });
