/* ══════════════════════════════════════════════════════════════════════════
   vqsidefold.cjs — 左のパネルを 畳む／開く（パソコンだけ）

   ★ 畳む 仕組み（幅・記憶・狭い ときの 巻き戻し）は **本体側が 持ち主**
     （index.html の #appV2SidebarCollapseBtn ＋ vq.sidebar.collapsed.v1）。
     新しい 左パネル（#vqShell・影の DOM）は **押すだけ**。
     ここで 別に 状態を 持つと、画面の 幅が 変わった ときに 本体の
     syncCollapse に 上書きされて 畳んだ ことが 消える（実測で そうなった）。

   測ること:
     ① 開いている ときは 幅 300・字が 見える
     ② 押すと 76 に なり、字が 消えて 絵だけに なる
     ③ 右の 画面（#vqScreens）と 本文も 一緒に 寄る
     ④ 読み込み直しても 畳んだまま
     ⑤ 狭く すると 開いた 形へ 戻り、畳む ボタンは 隠れる
     ⑥ 広く 戻すと **畳んだ 形が 戻る**
     ⑦ もう一度 押すと 開く

   本番では 走らせない。
   ══════════════════════════════════════════════════════════════════════════ */
const BASE = process.env.VQ_API || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const { chromium } = require("playwright");

let 済 = 0, 落 = 0;
const ok = (n, c, x) => {
  if (c) { 済++; console.log("  ok   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 180) : "")); }
  else { 落++; console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 300) : "")); }
};
const 節 = (t) => console.log("\n══ " + t + " ══");
async function req(path, o = {}) {
  const r = await fetch(BASE + path, { method: o.method || "GET", headers: { "content-type": "application/json" }, body: o.body ? JSON.stringify(o.body) : undefined });
  return { j: await r.json().catch(() => ({})) };
}

(async () => {
  const tag = "sf" + Date.now().toString(36);
  const s = await req("/api/auth/register/start", { method: "POST", body: { email: `${tag}@gmail.com`, gradePrefix: "H2", nickname: tag, password: "Testing!2345" } });
  const v = await req("/api/auth/register/verify", { method: "POST", body: { challengeId: s.j.challengeId, code: s.j.devCode } });
  const c = await req("/api/auth/register/consent", { method: "POST", body: { registrationSession: v.j.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: "482913" } });

  const b = await chromium.launch({ headless: true });
  const pg = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const 例外 = []; pg.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 160)));
  await pg.addInitScript(([t]) => { try { localStorage.setItem("app.auth.token.v1", t); } catch (e) {} }, [c.j.token]);
  const 開く = async () => {
    await pg.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
    await pg.addStyleTag({ content: "#vqPin,#vqTour,#vqLumiTour,#vqNewAuth,#authGate,#firstLaunchOverlay{display:none!important}" });
    await pg.waitForTimeout(8000);
  };
  await 開く();

  const 測 = () => pg.evaluate(() => {
    const bar = document.getElementById("appTabBar");
    const sr = (document.getElementById("vqShell") || {}).shadowRoot;
    const scr = document.getElementById("vqScreens");
    const bt = sr && sr.querySelector('[data-fn="fold"]');
    const nm = sr && sr.querySelector(".brand__name");
    const lbl = sr && sr.querySelector(".vqs-item__l");
    const item = sr && sr.querySelector(".vqs-item");
    return {
      幅: bar ? Math.round(bar.getBoundingClientRect().width) : null,
      畳: document.body.classList.contains("app-v2-sidebar-collapsed"),
      ボタン見える: bt ? getComputedStyle(bt).display !== "none" : null,
      名前: nm ? getComputedStyle(nm).display : null,
      項目名: lbl ? getComputedStyle(lbl).display : null,
      札: item ? item.getAttribute("title") : null,
      画面左: scr ? scr.style.left : null,
      本文左: getComputedStyle(document.querySelector("main") || document.body).paddingLeft
    };
  });
  const 押す = async () => {
    await pg.evaluate(() => document.getElementById("vqShell").shadowRoot.querySelector('[data-fn="fold"]').click());
    await pg.waitForTimeout(900);
  };

  節("① 開いている とき");
  const a = await 測();
  ok("幅が 広い（250 以上）", a.幅 >= 250, a.幅);
  ok("畳んでいない", a.畳 === false);
  ok("畳む ボタンが 見える（パソコン）", a.ボタン見える === true);
  ok("名前も 項目名も 見えている", a.名前 !== "none" && a.項目名 !== "none", a);

  節("② 押して 畳む");
  await 押す();
  const b1 = await 測();
  ok("**細く なる（100 未満）**", b1.幅 !== null && b1.幅 < 100, b1.幅);
  ok("印が 付く", b1.畳 === true);
  ok("**字が 消えて 絵だけに なる**", b1.名前 === "none" && b1.項目名 === "none", b1);
  ok("当てたら 何か 分かる（title が ある）", !!b1.札, b1.札);

  節("③ 右の 画面も 一緒に 寄る");
  ok("一覧の 画面が 左へ 寄る", b1.画面左 && parseInt(b1.画面左, 10) < parseInt(a.画面左 || "999", 10), { 前: a.画面左, 後: b1.画面左 });
  ok("本文も 左へ 寄る", parseInt(b1.本文左, 10) < parseInt(a.本文左, 10), { 前: a.本文左, 後: b1.本文左 });

  節("④ 読み込み直しても 畳んだまま");
  await 開く();
  const c1 = await 測();
  ok("**覚えている**", c1.畳 === true && c1.幅 < 100, c1.幅);

  節("⑤ 狭く したら 開いた 形へ");
  await pg.setViewportSize({ width: 700, height: 900 });
  await pg.waitForTimeout(900);
  const d = await 測();
  ok("畳んだ 印が 外れる", d.畳 === false, d);
  ok("畳む ボタンは 隠れる（引き出しなので）", d.ボタン見える === false, d.ボタン見える);

  節("⑥ 広く 戻すと 畳んだ 形が 戻る");
  await pg.setViewportSize({ width: 1440, height: 900 });
  await pg.waitForTimeout(1000);
  const e = await 測();
  ok("**畳んだ 形に 戻る**", e.畳 === true && e.幅 < 100, e);

  節("⑦ もう一度 押すと 開く");
  await 押す();
  const f = await 測();
  ok("開く", f.畳 === false && f.幅 >= 250, f.幅);
  ok("字が 戻る", f.名前 !== "none" && f.項目名 !== "none", f);

  節("⑧ 例外");
  ok("画面の 例外 0 件", 例外.length === 0, 例外.slice(0, 3));

  await b.close();
  console.log("\n────────────────────────────────");
  console.log(`  ok ${済} / NG ${落}`);
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
