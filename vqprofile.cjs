/* 起動中に **どの関数が どれだけ CPU を食っているか** を実際に取る。 */
const { chromium } = require("playwright");
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const 引 = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : d; };
const CPU = 引("--cpu", 8), 秒 = 引("--秒", 20);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
  await cdp.send("Profiler.start");
  await page.goto(BASE + "/", { waitUntil: "commit", timeout: 300000 });
  await page.waitForTimeout(秒 * 1000);
  const { profile } = await cdp.send("Profiler.stop");
  await b.close();

  const byId = new Map();
  for (const n of profile.nodes) byId.set(n.id, n);
  const self = new Map();
  const hit = profile.samples || [];
  const dt = profile.timeDeltas || [];
  for (let i = 0; i < hit.length; i++) {
    const n = byId.get(hit[i]); if (!n) continue;
    const f = n.callFrame;
    const 名 = (f.functionName || "(無名)") + " @ " + String(f.url || "").replace(/^https?:\/\/[^/]+/, "").split("?")[0] + ":" + (f.lineNumber + 1);
    self.set(名, (self.get(名) || 0) + Math.max(0, dt[i] || 0));
  }
  const 総 = [...self.values()].reduce((a, x) => a + x, 0);
  console.log(`■ CPU ${CPU} 倍遅く / ${秒} 秒ぶん / 取れた合計 ${(総 / 1e6).toFixed(1)} 秒\n`);
  console.log("  ── CPU を食っている順（自分自身の時間）──");
  [...self.entries()].sort((a, b2) => b2[1] - a[1]).slice(0, 22)
    .forEach(([k, v]) => console.log(`   ${(v / 1e6).toFixed(2).padStart(6)}秒  ${(v / 総 * 100).toFixed(1).padStart(5)}%  ${k.slice(0, 96)}`));
  /* ファイルごとの合計 */
  const byFile = new Map();
  for (const [k, v] of self) {
    const f = (k.split(" @ ")[1] || "?").split(":")[0];
    byFile.set(f, (byFile.get(f) || 0) + v);
  }
  console.log("\n  ── ファイルごと ──");
  [...byFile.entries()].sort((a, b2) => b2[1] - a[1]).slice(0, 12)
    .forEach(([k, v]) => console.log(`   ${(v / 1e6).toFixed(2).padStart(6)}秒  ${(v / 総 * 100).toFixed(1).padStart(5)}%  ${k || "(内蔵)"}`));
})();
