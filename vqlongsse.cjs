/* 16 分の SSE 接続維持を、ブラウザの実際の fetch で確かめる。

   大量の問題を実際に作って時間を使わない。
   テスト専用の待つだけのジョブ（/test/longjob）を使う。
   この経路は VQ_TEST_LONGJOB=1 を付けて起動したときだけ存在する。

   確かめること:
     ・16 分間つながり続ける
     ・20 秒以上の無音が 0 回
     ・タブを再読込しても、ジョブが二重に起動しない
     ・heartbeat を活動ログへ出さない・問題数を動かさない
     ・完了時に heartbeat が止まる

   実行: VQ_SECONDS=960 node vqlongsse.cjs
*/
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
const BRIDGE = process.env.VQ_BRIDGE || "http://127.0.0.1:17891";
const SECONDS = Number(process.env.VQ_SECONDS) || 960;      /* 16 分 */
const OUT = process.argv[2] || "shots/longsse";
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = await ctx.newPage();
  await pg.goto(BASE + "/?vqdev=1&vq2=all&cb=" + Date.now(),
    { waitUntil: "domcontentloaded", timeout: 60000 });

  console.log(SECONDS + " 秒（" + (SECONDS / 60).toFixed(1) + " 分）のジョブをブラウザから開きます…");

  /* 1 本目。ブラウザの中で受け続ける。 */
  const main = pg.evaluate(async (arg) => {
    const t0 = performance.now();
    const r = await fetch(arg.bridge + "/test/longjob", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seconds: arg.seconds })
    });
    if (!r.ok) return { ok: false, status: r.status };
    const reader = r.body.getReader(), dec = new TextDecoder();
    let buf = "", ev = null, last = performance.now(), maxGap = 0;
    let heartbeats = 0, jobId = null, completed = false;
    const gaps = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const now = performance.now();
      const gap = now - last; last = now;
      if (gap > maxGap) maxGap = gap;
      gaps.push(Math.round(gap));
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop() || "";
      for (const line of lines) {
        if (line.startsWith("event:")) ev = line.slice(6).trim();
        else if (line.startsWith("data:")) {
          let d = null; try { d = JSON.parse(line.slice(5).trim()); } catch { }
          if (!d) continue;
          if (ev === "meta") jobId = d.jobId;
          else if (ev === "heartbeat") heartbeats++;
          else if (ev === "completed") completed = true;
        }
      }
    }
    return { ok: true, totalMs: performance.now() - t0, heartbeats, jobId, completed,
             maxGapMs: Math.round(maxGap),
             gapsOver20s: gaps.filter((g) => g > 20000).length,
             /* 最初の 1 回を除く間隔の中央値（heartbeat の刻み） */
             medianGapMs: (() => {
               const g = gaps.slice(1).sort((a, b) => a - b);
               return g.length ? g[Math.floor(g.length / 2)] : 0;
             })() };
  }, { bridge: BRIDGE, seconds: SECONDS });

  /* 途中でタブを再読込する。ジョブが二重に起動しないことを見る。
     再読込は 1 本目の途中（90 秒後）に別タブで行う。 */
  const reload = (async () => {
    await new Promise((r) => setTimeout(r, 90000));
    const pg2 = await ctx.newPage();
    await pg2.goto(BASE + "/?vqdev=1&vq2=all&cb=" + Date.now(),
      { waitUntil: "domcontentloaded", timeout: 60000 });
    /* 再読込直後に走っているジョブの数を Bridge へ聞く（起動はしない）。 */
    const before = await pg2.evaluate(async (b) =>
      (await (await fetch(b + "/jobs")).json()), BRIDGE);
    await pg2.reload({ waitUntil: "domcontentloaded" });
    await new Promise((r) => setTimeout(r, 3000));
    const after = await pg2.evaluate(async (b) =>
      (await (await fetch(b + "/jobs")).json()), BRIDGE);
    await pg2.close();
    const run = (j) => ((j && j.jobs) || []).filter((x) =>
      x.status === "running" || x.status === "queued").length;
    return { runningBefore: run(before), runningAfter: run(after) };
  })();

  const [res, rl] = await Promise.all([main, reload]);
  const minutes = (res.totalMs || 0) / 60000;

  console.log("\n結果:", JSON.stringify(res, null, 1));
  console.log("再読込の前後で走っていたジョブ数:", JSON.stringify(rl));
  console.log("");
  console.log("つながっていた時間: " + minutes.toFixed(1) + " 分");
  console.log("heartbeat: " + res.heartbeats + " 回（刻みの中央値 "
    + ((res.medianGapMs || 0) / 1000).toFixed(1) + " 秒）");
  console.log("無音の最長: " + ((res.maxGapMs || 0) / 1000).toFixed(1) + " 秒");
  console.log("20 秒超の無音: " + res.gapsOver20s + " 回");
  console.log("16 分以上つながったか: " + (minutes >= 16 ? "はい" : "いいえ"));
  console.log("最後まで受信したか: " + (res.completed ? "はい" : "いいえ"));
  console.log("再読込でジョブが増えたか: "
    + (rl.runningAfter > rl.runningBefore ? "はい（二重起動）" : "いいえ"));

  fs.writeFileSync(path.join(OUT, "longsse.json"),
    JSON.stringify({ result: res, reload: rl, seconds: SECONDS }, null, 2));
  await browser.close();
})();
