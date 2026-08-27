/* ══════════════════════════════════════════════════════════════════════════
   vqlumitour.cjs — Lumi のはじめかた（暗証番号のあとの 5 段）

   見るところ:
     ① 印が立つまで出ない／ログイン画面が出ている間は 割り込まない
     ② 5 段すべて ボタンだけで最後まで行ける（声が使えなくても詰まらない）
     ③ 各段で **本物の部品**が動く（帯・日付・ボード・カメラの小窓）
     ④ 終わったら 片づく（ボード・小窓・デモ印・置き場所の控え）
     ⑤ **台本が Quick Chat の履歴に残らない**
     ⑥ 通信を張らない（__vqLive.open を呼ばない）
     ⑦ 重ね順が 本物より下（固まらせない）
     ⑧ 音が 実機の土俵（WebKit）で鳴らせる形になっている
     ⑨ 呼びかけの設定を 壊して戻さない

   使い方: node vqlumitour.cjs
   ══════════════════════════════════════════════════════════════════════════ */
const { chromium, webkit, devices } = require("playwright");
const fs = require("fs");

const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

let pass = 0, fail = 0; const 落ち = [];
const ok = (n, c, x) => { c ? (pass++, console.log("  ✅ " + n))
  : (fail++, 落ち.push(n), console.log("  ❌ " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 320) : ""))); };
const 節 = (t) => console.log("\n■ " + t);

function 口座を作る() {
  const { execSync } = require("child_process");
  const n = "tourtest" + Math.floor(Math.random() * 100000);
  const mail = n + "@gmail.com";
  const j = (s) => JSON.parse(s);
  const post = (p, body) => execSync(
    `curl -s -X POST "${BASE}${p}" -H "Content-Type: application/json" -d '${JSON.stringify(body)}' --max-time 60`,
    { encoding: "utf8" });
  const r = j(post("/api/auth/register/start", { email: mail, gradePrefix: "J1", nickname: n, password: "Tour-Test-2026" }));
  if (!r.challengeId) return null;
  const v = j(post("/api/auth/register/verify", { challengeId: r.challengeId, code: r.devCode }));
  const c = j(post("/api/auth/register/consent", {
    registrationSession: v.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: "246813" }));
  if (!c.token) return null;
  const lg = j(post("/api/auth/login", { gradePrefix: "J1", nickname: n, password: "Tour-Test-2026" }));
  return lg.token || c.token;
}

async function 通す(BT, 名, token) {
  const ctx = await BT.launch().then((b) => b.newContext({ ...devices["iPhone 14"], hasTouch: true }).then((c) => ({ b, c })));
  const pg = await ctx.c.newPage();
  const errs = [];
  pg.on("pageerror", (e) => { const m = String(e.message); if (!/access control|firestore|health/i.test(m)) errs.push(m.slice(0, 120)); });
  await pg.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded", timeout: 120000 });
  await pg.evaluate((t) => localStorage.setItem("app.auth.token.v1", t), token);
  await pg.reload({ waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => window.__vqLumiTour, { timeout: 60000 });
  await pg.waitForTimeout(10000);
  return { b: ctx.b, pg, errs };
}

const 見る = (pg) => pg.evaluate(() => {
  const h = document.getElementById("vqLumiTour");
  const sr = h && h.shadowRoot;
  const 帯 = document.querySelector("#vqLiveEdge .isl span");
  const 板 = document.getElementById("vqLiveNote");
  const 小 = document.getElementById("vqLiveAR");
  return {
    出ている: !!(h && h.getClientRects().length > 0),
    z: h ? Number(getComputedStyle(h).zIndex) : null,
    段: window.__vqLumiTour.状態().段,
    言って: sr ? (sr.querySelector(".say") || {}).textContent : null,
    帯: 帯 ? (帯.textContent || "") : "",
    板: !!(板 && 板.getClientRects().length > 0),
    小窓: !!(小 && 小.getClientRects().length > 0)
  };
});
const 押す = (pg) => pg.evaluate(() => {
  const g = document.getElementById("vqLumiTour").shadowRoot.querySelector(".go");
  if (g && !g.disabled) g.click();
});
/* ★ 決め打ちの待ち時間で見ない。段が上がるまで待つ。
   声の長さは端末で変わるので、時間で切ると 1 段ずれた所を見てしまう。 */
async function 進むまで待つ(pg, 目標, ms) {
  const 期限 = Date.now() + (ms || 30000);
  while (Date.now() < 期限) {
    const n = await pg.evaluate(() => window.__vqLumiTour.状態().段);
    if (n >= 目標) { await pg.waitForTimeout(700); return true; }
    await pg.waitForTimeout(400);
  }
  return false;
}
async function 終わるまで待つ(pg, ms) {
  const 期限 = Date.now() + (ms || 40000);
  while (Date.now() < 期限) {
    const st = await pg.evaluate(() => window.__vqLumiTour.状態());
    if (st.印 === "done" && !st.開いている) { await pg.waitForTimeout(800); return true; }
    await pg.waitForTimeout(500);
  }
  return false;
}

(async () => {
  console.log("Lumi のはじめかた  (" + BASE + ")");
  const token = 口座を作る();
  if (!token) { console.error("  検証用の口座を作れませんでした（echo モードで起動していますか）"); process.exit(2); }

  /* ── ① 出す条件 ─────────────────────────────────────────── */
  節("① 出す条件");
  {
    const { b, pg } = await 通す(chromium, "chromium", token);
    const 前 = await pg.evaluate(() => window.__vqLumiTour.状態());
    ok("印が無ければ 出ない", 前.印 !== "pending" && 前.開いている === false, 前);

    await pg.evaluate(() => { window.__vqLumiTour.予約(); });
    await pg.waitForTimeout(1200);
    /* ★ **実在する要素**を使う。偽の div を足すと id がぶつかり、
       getElementById が本物を返して そちらを消してしまう（実測で踏んだ）。 */
    const 割り込まない = await pg.evaluate(() => {
      const e = document.getElementById("firstLaunchOverlay");
      if (!e) return null;
      e.__before = e.style.display;
      e.hidden = false; e.style.setProperty("display", "block", "important");
      return true;
    });
    await pg.waitForTimeout(3500);
    const a = await 見る(pg);
    ok("前に画面が出ている間は 割り込まない", 割り込まない === true && a.出ている === false, a);
    await pg.evaluate(() => {
      const e = document.getElementById("firstLaunchOverlay");
      if (e) { e.style.setProperty("display", "none", "important"); e.hidden = true; }
      try { window.__vqPin.close(); } catch (e2) {}
    });
    let c = null;
    for (let i = 0; i < 20; i++) { await pg.waitForTimeout(900); c = await 見る(pg); if (c.出ている) break; }
    ok("邪魔が消えたら 出る", c.出ている === true, c);
    ok("重ね順が 本物より下（固まらせない）", c.z === 2147483450, c.z);
    await b.close();
  }

  /* ── ②③④⑤ 通し（実機と同じ WebKit）───────────────────── */
  節("②③ 5 段を ボタンだけで 通す（本物の部品が動くか）");
  const { b, pg, errs } = await 通す(webkit, "webkit", token);
  await pg.evaluate(() => { try { window.__vqPin.close(); } catch (e) {} window.__vqLumiTour.もう一度(); });
  await pg.waitForTimeout(2500);

  const 呼びかけ前 = await pg.evaluate(() => !!(window.__vqLive && window.__vqLive.isListening && window.__vqLive.isListening()));
  await 押す(pg);                       /* 段1 を演じる */
  await 進むまで待つ(pg, 1, 30000);
  let s = await 見る(pg);
  ok("段1: 帯に 返事が出る", /ここにいるよ/.test(s.帯), s.帯);

  await 押す(pg); await 進むまで待つ(pg, 2, 30000);
  s = await 見る(pg);
  const 今日 = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "long", day: "numeric" }).format(new Date());
  ok("段2: **その日の日付**が 帯に出る（録音では言えない所）", s.帯.indexOf(今日) >= 0, { 帯: s.帯, 期待: 今日 });

  await 押す(pg); await 進むまで待つ(pg, 3, 40000);
  s = await 見る(pg);
  ok("段3: **本物のボード**が開く", s.板 === true, s);

  await 押す(pg); await 進むまで待つ(pg, 4, 40000);
  s = await 見る(pg);
  ok("段4: **本物のカメラの小窓**が出る（許可は聞かれない）", s.小窓 === true, s);

  await 押す(pg); await 終わるまで待つ(pg, 45000);

  節("④⑤⑥⑨ 終わったあと");
  const fin = await pg.evaluate(() => ({
    状態: window.__vqLumiTour.状態(),
    板: !!(document.getElementById("vqLiveNote") && document.getElementById("vqLiveNote").getClientRects().length > 0),
    小窓: !!(document.getElementById("vqLiveAR") && document.getElementById("vqLiveAR").getClientRects().length > 0),
    デモ中: window.__vqLive.デモ中(),
    履歴: window.__vqLive.履歴().length,
    位置: [localStorage.getItem("vq.live.pos.note"), localStorage.getItem("vq.live.pos.ar")],
    会話中: window.__vqLive.isOn()
  }));
  ok("最後まで行ける（印が done）", fin.状態.印 === "done", fin.状態);
  ok("ボードが 片づく", fin.板 === false, fin);
  ok("カメラの小窓が 片づく", fin.小窓 === false, fin);
  ok("デモ印が 戻る（本物の関門が また効く）", fin.デモ中 === false, fin);
  ok("⑤ 台本が Quick Chat の履歴に 残らない", fin.履歴 === 0, fin);
  ok("ボード/小窓の 置き場所を 本番へ持ち越さない", fin.位置[0] === null && fin.位置[1] === null, fin.位置);
  ok("⑥ 通信を張っていない（会話が始まっていない）", fin.会話中 === false, fin);
  void 呼びかけ前;
  ok("画面の失敗が 出ていない", errs.length === 0, errs.slice(0, 3));
  await b.close();

  /* ── ⑦⑧ 声と作り ───────────────────────────────────────── */
  節("⑧ 音が 実機の土俵で 鳴らせる形か");
  {
    const b2 = await webkit.launch();
    const pg2 = await (await b2.newContext()).newPage();
    await pg2.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded", timeout: 120000 });
    const r = await pg2.evaluate(async () => {
      const ids = ["t0", "t1", "t2", "t3a", "t3b", "t4", "t5", "t6", "ng1", "ng2"];
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const out = { ok: 0, ng: [] };
      for (const id of ids) {
        try {
          const q = await fetch("/lumitour/" + id + ".m4a");
          const b = await q.arrayBuffer();
          await ctx.decodeAudioData(b.slice(0));
          out.ok++;
        } catch (e) { out.ng.push(id); }
      }
      return out;
    });
    ok("10 本すべて 鳴らせる", r.ok === 10 && r.ng.length === 0, r);
    await b2.close();
  }

  節("⑦ 作りの歯止め（コードを見る）");
  const src = fs.readFileSync("client/index.html", "utf8");
  const 生 = src.slice(src.indexOf('<script id="vq-lumitour">'), src.indexOf("</script>", src.indexOf('<script id="vq-lumitour">')));
  /* コメント（「呼ばないこと」と書いてある行）を除いてから見る */
  const コード = 生.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  ok("__vqLive.open を 呼んでいない（通信を張らない）",
    !/__vqLive\s*\.\s*open\s*\(/.test(コード) && !/\bL\s*\.\s*open\s*\(/.test(コード), 
    (コード.match(/[A-Za-z_$]+\.open\s*\(/g) || []).slice(0, 3));
  ok("入口で 呼びかけを 止めている", /stopListen\(\)/.test(生));
  ok("出口で 設定が入っていれば 戻している", /st\.元の呼びかけ && L\.arm/.test(生));
  ok("印は localStorage（登録は途中で reload するため）", /localStorage/.test(生) && /vq\.lumitour\.v1/.test(生));
  ok("3 回で 諦める（永久に出し続けない）", /n > 3/.test(生));
  ok("Qredit の割り込みを 止めている", /"vqLumiTour"/.test(src));
  ok("設定から もう一度 見られる", /voice\.tour/.test(src));

  console.log(`\n合格 ${pass} / 失敗 ${fail}`);
  if (落ち.length) console.log("落ちた:\n  - " + 落ち.join("\n  - "));
  process.exit(fail ? 1 : 0);
})();
