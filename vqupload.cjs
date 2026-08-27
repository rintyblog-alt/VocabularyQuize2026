/* 分割アップロードを Bridge へ実際に流して確かめる。

   見るのは 5 つ。
   ・100MB 超の疑似ファイルが JSON を通らずに入ること
   ・中断して、途中から再開できること
   ・失敗したパートだけ送り直せること
   ・上限を超えたら 413 と「いま何 MB／上限は何 MB」が返ること
   ・期限切れ・破棄でジョブ領域が消えること

   実行: node vqupload.cjs
*/
const BRIDGE = process.env.VQ_BRIDGE || "http://127.0.0.1:17891";

let pass = 0, fail = 0;
const failures = [];
async function step(name, fn) {
  try { const m = await fn(); pass++; console.log("  ok   " + name + (m ? " — " + m : "")); }
  catch (e) { fail++; failures.push(name); console.log("  NG   " + name + "\n         → " + (e && e.message)); }
}
function assert(c, m) { if (!c) throw new Error(m || "満たしていません"); }

const J = (p, body, method) => fetch(BRIDGE + p, {
  method: method || "POST", headers: { "Content-Type": "application/json" },
  body: body ? JSON.stringify(body) : undefined
}).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));

async function putPart(job, id, index, buf) {
  const r = await fetch(`${BRIDGE}/attachments/part?job=${job}&id=${id}&index=${index}`, {
    method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: buf
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

(async () => {
  console.log("══ 分割アップロード ══");

  const lim = await J("/attachments/limits", null, "GET");
  const L = lim.json.limits;
  console.log(`  上限: 1 ファイル ${(L.maxFileBytes / 1048576).toFixed(0)}MiB / `
    + `パート ${(L.uploadPartBytes / 1048576).toFixed(0)}MiB / ジョブ合計 ${(L.maxTotalBytesPerJob / 1048576).toFixed(0)}MiB`);

  let jobId = null, attId = null;
  const TOTAL = 96 * 1024 * 1024;                  /* 96MiB。100MiB の上限内で、分割が必要な大きさ */
  const PART = L.uploadPartBytes;
  const parts = Math.ceil(TOTAL / PART);

  await step("100MB 級のファイルを受け付ける（本体は JSON に載せない）", async () => {
    const r = await J("/attachments/init", { name: "大きな資料.pdf", kind: "pdf",
      mimeType: "application/pdf", bytes: TOTAL, partSize: PART });
    assert(r.status === 200, "init が " + r.status + ": " + JSON.stringify(r.json).slice(0, 120));
    jobId = r.json.jobId; attId = r.json.attachmentId;
    assert(jobId && attId, "ID が返らない");
    return `${(TOTAL / 1048576).toFixed(0)}MB を ${parts} パートに分ける`;
  });

  await step("途中まで送って中断し、続きから再開できる", async () => {
    const half = Math.floor(parts / 2);
    const buf = Buffer.alloc(PART, 0x41);
    for (let i = 0; i < half; i++) {
      const r = await putPart(jobId, attId, i, buf);
      assert(r.status === 200, `パート ${i} が ${r.status}`);
    }
    /* ここで「中断」。状態を引き直して、どこまで入ったかが分かること。 */
    const st = await J(`/attachments/status?job=${jobId}`, null, "GET");
    const f = st.json.job.files.find((x) => x.attachmentId === attId);
    assert(f.receivedParts === half, `受信数が合わない（${f.receivedParts} / ${half}）`);
    /* 続きから */
    for (let i = half; i < parts; i++) {
      const size = i === parts - 1 ? TOTAL - PART * (parts - 1) : PART;
      const r = await putPart(jobId, attId, i, Buffer.alloc(size, 0x42));
      assert(r.status === 200, `再開後のパート ${i} が ${r.status}`);
    }
    return `${half} パートで中断 → ${parts} まで再開`;
  });

  await step("失敗したパートだけ送り直せる（全部やり直しにならない）", async () => {
    const before = await J(`/attachments/status?job=${jobId}`, null, "GET");
    const b = before.json.job.files.find((x) => x.attachmentId === attId).bytes;
    const r = await putPart(jobId, attId, 3, Buffer.alloc(PART, 0x43));
    assert(r.status === 200, "再送が " + r.status);
    const after = await J(`/attachments/status?job=${jobId}`, null, "GET");
    const a = after.json.job.files.find((x) => x.attachmentId === attId);
    assert(a.bytes === b, `合計が二重に増えた（${b} → ${a.bytes}）`);
    assert(a.receivedParts === parts, "パート数が変わった");
    return `3 番だけ差し替え・合計 ${(a.bytes / 1048576).toFixed(1)}MB のまま`;
  });

  await step("結合して attachmentId が確定する", async () => {
    const r = await J("/attachments/complete", { jobId, attachmentId: attId, totalParts: parts });
    assert(r.status === 200, "complete が " + r.status + ": " + JSON.stringify(r.json).slice(0, 160));
    assert(r.json.bytes === TOTAL, `結合後のサイズが違う（${r.json.bytes} / ${TOTAL}）`);
    assert(!r.json.path, "サーバ内のパスを返している（外へ出さない）");
    return `${(r.json.bytes / 1048576).toFixed(1)}MB`;
  });

  await step("パートが欠けていれば、どれが足りないかを返す", async () => {
    const i = await J("/attachments/init", { jobId, name: "欠け.pdf", kind: "pdf", bytes: 3 });
    await putPart(jobId, i.json.attachmentId, 0, Buffer.from("x"));
    const r = await J("/attachments/complete",
      { jobId, attachmentId: i.json.attachmentId, totalParts: 3 });
    assert(r.status === 409, "状態が " + r.status);
    assert(JSON.stringify(r.json.missing) === "[1,2]", "欠けの中身が違う: " + JSON.stringify(r.json.missing));
    return "409・欠け [1,2]";
  });

  await step("上限超過は 413 で「いまの大きさ・上限・すすめ方」を返す", async () => {
    const r = await J("/attachments/init",
      { name: "特大.pdf", kind: "pdf", bytes: L.maxFileBytes + 1 });
    assert(r.status === 413, "状態が " + r.status);
    assert(/MB です/.test(r.json.message), "いまの大きさが出ない: " + r.json.message);
    assert(r.json.limitBytes === L.maxFileBytes, "上限が出ない");
    assert(r.json.advice, "次にどうすればいいかが無い");
    return r.json.message;
  });

  await step("大きすぎるパートは 413（受け切ってから測らない）", async () => {
    const i = await J("/attachments/init", { jobId, name: "太い.bin", bytes: 100 });
    const r = await putPart(jobId, i.json.attachmentId, 0, Buffer.alloc(L.maxPartBytes + 1024, 1));
    assert(r.status === 413, "状態が " + r.status);
    assert(r.json.error === "PART_TOO_LARGE", "理由が違う: " + r.json.error);
    return `パート上限 ${(r.json.limitBytes / 1048576).toFixed(0)}MiB`;
  });

  await step("生成要求の JSON が大きすぎれば 413 になる（500 にしない）", async () => {
    const body = JSON.stringify({ message: "あ".repeat(15 * 1024 * 1024), attachments: [] });
    const r = await fetch(BRIDGE + "/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json" }, body });
    const j = await r.json().catch(() => ({}));
    assert(r.status === 413, "状態が " + r.status);
    assert(j.code === "BODY_TOO_LARGE", "コードが違う: " + j.code);
    assert(/分割アップロード/.test(j.message || ""), "案内が無い: " + j.message);
    return "413・" + j.message.slice(0, 30) + "…";
  });

  await step("破棄するとジョブ領域ごと消える", async () => {
    const r = await J("/attachments/drop", { jobId });
    assert(r.status === 200 && r.json.removed, "破棄できない");
    const after = await J(`/attachments/status?job=${jobId}`, null, "GET");
    assert(after.status === 404, "消したのに引ける（" + after.status + "）");
    return "破棄 → 404";
  });

  console.log("\n結果: " + pass + " 通過 / " + fail + " 失敗");
  if (failures.length) failures.forEach((f) => console.log("  - " + f));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
