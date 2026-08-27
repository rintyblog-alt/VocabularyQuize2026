/* ══════════════════════════════════════════════════════════════════════════
   vqpreseticon.cjs — プリセットのアイコンが一覧に出る（2026-08-13）

   これまで一覧のアイコンは publicIcon（公開用バッジの設定。既定 open_book）
   **だけ**を見ていて、編集画面で選んだ appearance.icon を見ていなかった。
   だから何を選んでも「本」のままだった。

   新しい一覧は、この旧カードの DOM（.app-preset-card-icon .ms）を読んで
   作られる。つまり出どころは 1 か所。ここを直せば新旧どちらも直る。

   ここでは **実際にカードを組み立てて**、出た中身を見る。
   ══════════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const HTML = path.join(__dirname, "client", "index.html");

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (detail ? "  → " + detail : "")); }
};

const TINY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

(async () => {
  console.log("═══ vqpreseticon — 一覧のアイコン ═══");

  console.log("\n⓪ ソースの決まり");
  const src = require("./vqsrc.cjs").丸ごと();
  ok("カードのアイコンが appearance を受け取る", src.indexOf("opts.appearance && typeof opts.appearance") >= 0);
  ok("自分のプリセットの一覧が appearance を渡している",
    src.indexOf("{ muted: !publicMeta.isPublic, appearance: p?.appearance }") >= 0);
  ok("V2 → V1 でアイコン名を 8 文字で切らない", src.indexOf('str(a.icon).slice(0, 8)') < 0);

  const br = await chromium.launch();
  const pg = await br.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e.message).slice(0, 130)));
  await pg.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.waitForFunction(() => window.VQ2 && VQ2.library, null, { timeout: 60000 });
  await pg.waitForTimeout(2000);

  console.log("\n① カードを実際に組み立てて中身を見る");
  const cases = [
    { なに: "Material Symbols の名前（長い）", ap: { icon: "local_fire_department" }, 期待: "ms:local_fire_department" },
    { なに: "Material Symbols の名前（短い）", ap: { icon: "science" }, 期待: "ms:science" },
    { なに: "絵文字（1文字）", ap: { icon: "🔥" }, 期待: "emoji:🔥" },
    { なに: "画像", ap: { icon: "", iconImage: TINY_PNG }, 期待: "img" },
    { なに: "何も設定していない（これまで通り本）", ap: null, 期待: "ms:book_2" }
  ];
  for (const c of cases) {
    const r = await pg.evaluate((cc) => {
      const f = window.__vqPresetIconBadge;
      if (typeof f !== "function") return { 呼べない: true };
      const el = f("open_book", "blue", cc.ap ? { appearance: cc.ap } : {});
      const img = el.querySelector("img");
      if (img) return { 出た: "img" };
      const ms = el.querySelector(".ms");
      if (ms) return { 出た: "ms:" + (ms.textContent || "").trim() };
      const em = el.querySelector(".app-preset-card-icon-emoji");
      if (em) return { 出た: "emoji:" + (em.textContent || "").trim() };
      return { 出た: "(なし) " + el.innerHTML.slice(0, 60) };
    }, c);
    if (r.呼べない) { ok("  " + c.なに, false, "組み立てる関数を呼べない"); continue; }
    ok("  " + c.なに + " → " + c.期待, r.出た === c.期待, "出たのは " + r.出た);
  }

  console.log("\n② 新しい一覧も同じ字を拾えるか（DOM を読む作り）");
  const scraped = await pg.evaluate(() => {
    const f = window.__vqPresetIconBadge;
    if (typeof f !== "function") return { 呼べない: true };
    /* 一覧の 1 行を真似て置く */
    const item = document.createElement("div");
    item.className = "app-library-item";
    item.appendChild(f("open_book", "blue", { appearance: { icon: "local_fire_department" } }));
    document.body.appendChild(item);
    /* library.collectDom と同じ読み方 */
    const ico = item.querySelector(".app-preset-card-icon");
    const name = ico && ico.querySelector(".ms") ? (ico.querySelector(".ms").textContent || "").trim() : "";
    item.remove();
    return { 拾えた: name };
  });
  ok("新しい一覧が拾う字がアイコン名になっている",
    scraped.拾えた === "local_fire_department", "拾えたのは " + scraped.拾えた);

  console.log("\n③ 保存して読み直しても名前が残る");
  const rt = await pg.evaluate(() => {
    const A = VQ2.adapter;
    const v2 = { id: "p", name: "n", appearance: { icon: "local_fire_department" }, questions: [] };
    const v1 = JSON.parse(JSON.stringify(A.presetToV1(v2)));
    return { V1: (v1.appearance || {}).icon, 戻り: (A.presetToV2(v1).appearance || {}).icon };
  });
  ok("V1 の写しでも切られない", rt.V1 === "local_fire_department", rt.V1);
  ok("読み直しても切られない", rt.戻り === "local_fire_department", rt.戻り);

  ok("画面エラーが出ていない", errs.length === 0, errs.join(" / "));
  await br.close();
  console.log("\n─────────────────────────────");
  console.log("通過 " + pass + " / 失敗 " + fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("落ちた:", e); process.exit(1); });
