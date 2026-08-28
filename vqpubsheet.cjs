/* ══════════════════════════════════════════════════════════════════════════
   vqpubsheet.cjs — **人が 実際に 見る**公開の 画面（VQ2.presetPublish）

   ★ プリセットまわりは 新旧 2 つ ある。見えているのは 新しい ほう
     （vq2-app の ui/preset-publish.js）。vq-core の presetPublishOverlay は
     逃げ道。一度 旧い ほうだけ 直して 「何も 変わっていない」と 言われた。

   ここで 測ること:
     ① 1 段目: 段の しるし・**一覧の 札と 同じ 見本**・表紙の 欄・AI で 作る
     ② 公開IDの 確認が 終われば「次へ」が 押せる
     ③ 2 段目: 決まりが 出る。**下まで 読むまで 同意できない**
     ④ 画像を アイコンに したら **「見た目」は 選べなくなる**（うすい 覆い）

   本番では 走らせない。
   ══════════════════════════════════════════════════════════════════════════ */
const BASE = process.env.VQ_API || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const { chromium } = require("playwright");

let 済 = 0, 落 = 0;
const ok = (n, c, x) => {
  if (c) { 済++; console.log("  ok   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 200) : "")); }
  else { 落++; console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 300) : "")); }
};
const 節 = (t) => console.log("\n══ " + t + " ══");
async function req(path, o = {}) {
  const r = await fetch(BASE + path, { method: o.method || "GET", headers: { "content-type": "application/json" }, body: o.body ? JSON.stringify(o.body) : undefined });
  return { j: await r.json().catch(() => ({})) };
}
const 中 = (pg, fn) => pg.evaluate(function (src) {
  const h = [...document.querySelectorAll("*")].find((e) => e.id && /preset-publish/.test(e.id));
  const r = h && h.shadowRoot;
  if (!r) return null;
  return (new Function("r", "h", src))(r, h);
}, "return (" + fn.toString() + ")(r, h);");

(async () => {
  const tag = "pu" + Date.now().toString(36);
  const s = await req("/api/auth/register/start", { method: "POST", body: { email: `${tag}@gmail.com`, gradePrefix: "H2", nickname: tag, password: "Testing!2345" } });
  const v = await req("/api/auth/register/verify", { method: "POST", body: { challengeId: s.j.challengeId, code: s.j.devCode } });
  const c = await req("/api/auth/register/consent", { method: "POST", body: { registrationSession: v.j.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: "482913" } });

  const b = await chromium.launch({ headless: true });
  const pg = await (await b.newContext({ viewport: { width: 1440, height: 980 } })).newPage();
  const 例外 = []; pg.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 200)));
  await pg.addInitScript(([t]) => { try { localStorage.setItem("app.auth.token.v1", t); } catch (e) {} }, [c.j.token]);
  await pg.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await pg.addStyleTag({ content: "#vqPin,#vqTour,#vqLumiTour,#vqNewAuth,#authGate,#firstLaunchOverlay{display:none!important}" });
  await pg.waitForTimeout(7500);

  const pid = await pg.evaluate(() => {
    const ps = (window.VQ2 && window.VQ2.store && window.VQ2.store.listPresets) ? window.VQ2.store.listPresets() : [];
    return ps.length ? ps[0].id : null;
  });
  ok("たしかめる プリセットが ある", !!pid, pid);
  ok("新しい 公開の 口が ある", await pg.evaluate(() => typeof (window.VQ2 && window.VQ2.presetPublish && window.VQ2.presetPublish.open) === "function"));
  await pg.evaluate((id) => window.VQ2.presetPublish.open({ presetId: id }), pid);
  await pg.waitForTimeout(1600);

  const 面 = () => 中(pg, (r) => ({
    段: !!r.querySelector(".vq2-pp-steps"),
    新見本: !!r.querySelector(".vq2-pp-pv"),
    古見本: !!r.querySelector(".vq2-pp-card"),
    表紙: !!r.querySelector(".vq2-pp-cover"),
    AI: !!r.querySelector('[data-act="aicover"]'),
    次へ: !!r.querySelector('[data-act="next"]'),
    規約: !!r.querySelector(".vq2-pp-terms")
  }));

  節("① 1 段目");
  const a1 = await 面();
  ok("段の しるしが ある", !!a1 && a1.段, a1);
  ok("**見本が 一覧の 札と 同じ 作り**（古い 丸い 見本では ない）", !!a1 && a1.新見本 && !a1.古見本, a1);
  ok("表紙（バナー）の 欄が ある", !!a1 && a1.表紙);
  ok("AI で 作る が ある", !!a1 && a1.AI);
  ok("まだ 規約は 出ていない", !!a1 && !a1.規約);

  節("② 公開IDの 確認が 終われば 次へ");
  const 押せた = await pg.waitForFunction(() => {
    const h = [...document.querySelectorAll("*")].find((e) => e.id && /preset-publish/.test(e.id));
    const b2 = h && h.shadowRoot && h.shadowRoot.querySelector('[data-act="next"]');
    return !!b2 && !b2.disabled;
  }, null, { timeout: 20000, polling: 300 }).then(() => true, () => false);
  ok("**「次へ」が 押せるように なる**", 押せた);
  await pg.evaluate(() => {
    const h = [...document.querySelectorAll("*")].find((e) => e.id && /preset-publish/.test(e.id));
    const b2 = h.shadowRoot.querySelector('[data-act="next"]'); if (b2 && !b2.disabled) b2.click();
  });
  await pg.waitForTimeout(1000);

  節("③ 2 段目（決まり）");
  const a2 = await 面();
  ok("決まりが 出る", !!a2 && a2.規約, a2);
  ok("1 段目の 欄は 引っ込む", !!a2 && !a2.表紙 && !a2.AI, a2);
  const 前 = await 中(pg, (r) => { const cb = r.querySelector('[data-key="agreed"]'); return cb ? cb.disabled : null; });
  ok("**読む前は 同意できない**", 前 === true, 前);
  await 中(pg, (r) => { const box = r.querySelector("[data-terms]"); if (box) box.scrollTop = box.scrollHeight; return 1; });
  await pg.waitForTimeout(700);
  const 後 = await 中(pg, (r) => { const cb = r.querySelector('[data-key="agreed"]'); return cb ? cb.disabled : null; });
  ok("**下まで 読むと 同意できる**", 後 === false, 後);

  節("④ 画像を アイコンに したら「見た目」は 選べない");
  await pg.evaluate(() => {
    const h = [...document.querySelectorAll("*")].find((e) => e.id && /preset-publish/.test(e.id));
    const b2 = h.shadowRoot.querySelector('[data-act="back"]'); if (b2) b2.click();
  });
  await pg.waitForTimeout(700);
  const 前錠 = await 中(pg, (r) => {
    const w = r.querySelector(".vq2-pp-lookwrap");
    const p = r.querySelector('[data-act="toggle-icons"]');
    return { 錠: !!(w && w.classList.contains("is-locked")), 押せる: p ? !p.disabled : null };
  });
  ok("画像が 無い ときは 選べる", 前錠 && !前錠.錠 && 前錠.押せる === true, 前錠);
  /* 画像を 1 枚 入れる（本物と 同じ 道: file を 選ばせる） */
  await pg.evaluate(() => {
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const orig = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function () {
      if (this.type === "file") {
        const f = new File([Uint8Array.from(atob(png.split(",")[1]), (ch) => ch.charCodeAt(0))], "a.png", { type: "image/png" });
        const dt = new DataTransfer(); dt.items.add(f);
        Object.defineProperty(this, "files", { value: dt.files, configurable: true });
        setTimeout(() => this.onchange && this.onchange(), 10);
        return;
      }
      return orig.apply(this, arguments);
    };
    const h = [...document.querySelectorAll("*")].find((e) => e.id && /preset-publish/.test(e.id));
    const b2 = h.shadowRoot.querySelector('[data-act="pickicon"]'); if (b2) b2.click();
  });
  await pg.waitForTimeout(1800);
  const 後錠 = await 中(pg, (r) => {
    const w = r.querySelector(".vq2-pp-lookwrap");
    const inn = r.querySelector(".vq2-pp-lookin");
    const lock = r.querySelector(".vq2-pp-lock");
    const p = r.querySelector('[data-act="toggle-icons"]');
    const col = r.querySelector('[data-act="color"]');
    return {
      錠: !!(w && w.classList.contains("is-locked")),
      覆い: !!lock,
      文: lock ? (lock.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60) : "",
      うすさ: inn ? Number(getComputedStyle(inn).opacity) : null,
      触れない: inn ? getComputedStyle(inn).pointerEvents : null,
      アイコン: p ? p.disabled : null,
      色: col ? col.disabled : null
    };
  });
  ok("**選べなくなる**", !!後錠 && 後錠.錠, 後錠);
  ok("うすい 覆いが かかる", !!後錠 && 後錠.覆い && 後錠.うすさ < 0.6, 後錠 && { 覆い: 後錠.覆い, うすさ: 後錠.うすさ });
  ok("押しても 効かない（触れない）", !!後錠 && 後錠.触れない === "none", 後錠 && 後錠.触れない);
  ok("アイコンも 色も 押せない", !!後錠 && 後錠.アイコン === true && 後錠.色 === true, 後錠);
  ok("外し方が その場に 書いてある", !!後錠 && /外す/.test(後錠.文), 後錠 && 後錠.文);

  節("⑤ 例外");
  ok("画面の 例外 0 件", 例外.length === 0, 例外.slice(0, 3));

  await b.close();
  console.log("\n────────────────────────────────");
  console.log(`  ok ${済} / NG ${落}`);
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
