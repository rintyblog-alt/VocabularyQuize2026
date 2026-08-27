/* ══════════════════════════════════════════════════════════════════════
   名指しした形式が、不当に外れないか（形式の最終確認）

   実測 2026-08-12: 「表完成を2問」と頼んで、資料を付けたら
   「教材に表がないため外しました」で消えた。
   **表完成は表を作る形式**なので、教材に表が無くても作れる。
   （表を **読み取る** table_read は、無い表は読めないので外れてよい。）

   ここでは「頼んだ形式が残るか」と「外れるときは理由が付くか」を見る。
   外れること自体は正しい場合がある（画像がいる形式に画像が無い、など）。
   **理由なしで消えるのがいちばん困る。**

   AI は呼ばない。使い方: node vqformatpick.cjs
   ══════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => {
  c ? (pass++, console.log("  ok   " + n))
    : (fail++, bad.push(n), console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 220) : "")));
};
const section = (t) => console.log("\n══ " + t + " ══");

const RUN = () => {
  const B = VQ2.blueprint;
  const P = "保健と日本史から15問。表完成を2問、線で繋ぐを2問、フラッシュカードを2問、"
    + "グループ分類を2問、複合問題を1問、並べ替えを2問、正誤を2問、穴埋めを2問。";
  function pick(analysis, opts) {
    const req = B.extractRequirements(P, {});
    if (opts && opts.mock) req.mode = "quick_mock";
    const c = B.candidates(req, analysis, opts || {});
    return {
      requested: req.requestedTypes,
      ok: c.requested,
      ng: (c.unavailableRequested || []).map((x) => ({ type: x.type, reason: x.reason, alt: (x.alternatives || []).length }))
    };
  }
  /* 資料はあるが、表も図も年代も入っていない（ふつうの文章だけ）。 */
  const plain = { known: true, hasImage: false, hasAudio: false,
    counts: { table: 0, chart: 0, chronology: 0, passage: 3 } };
  /* 画像だけの資料。表も本文も無い。 */
  const imageOnly = { known: true, hasImage: true, hasAudio: false,
    counts: { table: 0, chart: 0, chronology: 0, passage: 0 } };
  return { noDoc: pick(null, {}), plain: pick(plain, {}), imageOnly: pick(imageOnly, {}) };
};

(async () => {
  const br = await chromium.launch();
  const pg = await br.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e.message).slice(0, 160)));
  await pg.goto(BASE, { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => window.VQ2 && VQ2.blueprint && VQ2.qtypes, null, { timeout: 30000 });
  const r = await pg.evaluate(RUN);
  await br.close();

  const has = (o, t) => o.ok.indexOf(t) >= 0;
  const why = (o, t) => (o.ng.filter((x) => x.type === t)[0] || {}).reason || "";

  section("資料なし");
  console.log("   使える: " + JSON.stringify(r.noDoc.ok));
  ["table_fill", "matching_line", "flashcard", "classification", "ordering", "true_false", "fill_blank"]
    .forEach((t) => ok(t + " が残る", has(r.noDoc, t), r.noDoc.ng));

  section("資料あり（ふつうの文章だけ・表も図も無い）");
  console.log("   使える: " + JSON.stringify(r.plain.ok));
  /* **ここが今回の本題。** 表完成は表を作る形式なので、資料に表が無くても残る。 */
  ok("★表完成が残る（表を作る形式なので教材の表は要らない）", has(r.plain, "table_fill"), why(r.plain, "table_fill"));
  ["matching_line", "flashcard", "classification", "ordering", "true_false", "fill_blank"]
    .forEach((t) => ok(t + " が残る", has(r.plain, t), why(r.plain, t)));
  ok("複合問題が残る（まとまった本文があるため）", has(r.plain, "composite"), why(r.plain, "composite"));

  section("資料あり（画像だけ・本文が無い）");
  console.log("   使える: " + JSON.stringify(r.imageOnly.ok));
  ok("★表完成は画像だけでも残る", has(r.imageOnly, "table_fill"), why(r.imageOnly, "table_fill"));
  ok("複合問題は外れる（本文が無いので当然）", !has(r.imageOnly, "composite"));
  ok("★外れるときは理由が付く（黙って消さない）",
    r.imageOnly.ng.every((x) => x.reason && x.reason !== "いまは使えません"), r.imageOnly.ng);
  ok("外れたものには代わりが添えられる", r.imageOnly.ng.every((x) => x.alt > 0), r.imageOnly.ng);

  ok("画面のエラーが出ていない", errs.length === 0, errs.slice(0, 2));
  console.log("\n合格 " + pass + " / 不合格 " + fail);
  if (bad.length) console.log("直すところ:\n  - " + bad.join("\n  - "));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("実行できませんでした:", e); process.exit(1); });
