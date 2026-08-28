/* ══════════════════════════════════════════════════════════════════════════
   vqwphuman.cjs — Workplace の 文が **人が 書いたように** なったかを
   本物の AI で 作らせて 数える。

   訴え（2026-08-28）:「文章を 人間らしく。抽象化しすぎない」

   数えかた（好みでは なく、**数えられる もの**だけを 見る）:
     ① 逃げ language の 数 … 「効率化」「最適化」「向上」「推進」「強化」
        「活性化」「重要です」「求められます」「と言えるでしょう」
        → **1 つの 書類に 2 つ まで**（0 が 理想だが 0 を 強いると 不自然になる）
     ② 具体（数・日付・固有名）が 入っている かたまりの 割合 → **4 割 以上**
     ③ 1 文が 長すぎない … 90 字を 超える 文が 全体の 2 割 未満
     ④ 表が 向く 頼みでは 表が 入る

   使い方: VQ_TOKEN=<札> node vqwphuman.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) {
  console.error("本番では実行しません。"); process.exit(2);
}
const token = process.env.VQ_TOKEN;
if (!token) { console.error("VQ_TOKEN を 渡してください。"); process.exit(2); }
const H = { "Content-Type": "application/json", Authorization: "Bearer " + token };

const 逃げ = /(効率化|最適化|向上させ|向上を|推進|強化|活性化|重要です|重要である|求められます|求められる|と言えるでしょう|が大切です|に努め)/g;
const 具体 = /([0-9０-９]|年|月|日|時|分|円|人|％|%|第[一二三四五六七八九十]|[A-Za-z]{3,})/;

const 頼み = [
  { ask: "文化祭の 実行委員会に 出す 企画書。クラスで たこ焼きの 店を 出す",
    表: true },
  { ask: "中学 2 年に 向けた「光合成の しくみ」の まとめプリント", 表: false }
];

function 文にわける(t) {
  return String(t || "").split(/[。！？\n]/).map((x) => x.trim()).filter((x) => x.length > 1);
}

(async () => {
  let 落 = 0;
  const 見 = (ok, 名, 追) => { console.log((ok ? "✓ " : "✗ ") + 名 + (追 !== undefined ? " → " + JSON.stringify(追).slice(0, 240) : "")); if (!ok) 落++; };

  for (const t of 頼み) {
    const r = await fetch(BASE + "/api/wp/make", {
      method: "POST", headers: H,
      body: JSON.stringify({ kind: "document", instruction: t.ask })
    }).then((x) => x.json());
    const blocks = (r && r.content && r.content.blocks) || (r && r.blocks) || [];
    if (!blocks.length) {
      console.log("── " + t.ask);
      console.log("  返り:", JSON.stringify(r).slice(0, 300));
      見(false, "書類が 作れた");
      continue;
    }
    const 文字 = blocks.map((b) => String(b.text || "")).join("\n");
    const 逃 = (文字.match(逃げ) || []);
    const 中身 = blocks.filter((b) => ["paragraph", "bullet", "number", "callout", "quote"].indexOf(b.type) >= 0);
    const 具 = 中身.filter((b) => 具体.test(String(b.text || "")));
    const 文 = 文にわける(文字);
    const 長 = 文.filter((x) => x.length > 90);
    const 表 = blocks.filter((b) => b.type === "table").length;

    console.log("\n── " + t.ask);
    console.log("  かたまり " + blocks.length + " ／ 表 " + 表
      + " ／ 逃げ語 " + 逃.length + (逃.length ? "（" + [...new Set(逃)].join("・") + "）" : "")
      + " ／ 具体つき " + 具.length + "/" + 中身.length
      + " ／ 90 字超え " + 長.length + "/" + 文.length);
    console.log("  例: " + (中身[0] ? String(中身[0].text).slice(0, 70) : "-"));
    console.log("      " + (中身[1] ? String(中身[1].text).slice(0, 70) : "-"));

    見(逃.length <= 2, "① 逃げ語が 2 つ 以下（" + 逃.length + "）", [...new Set(逃)]);
    見(中身.length ? 具.length / 中身.length >= 0.4 : false,
       "② 具体（数・日付・固有名）が 4 割 以上（"
         + Math.round((具.length / Math.max(1, 中身.length)) * 100) + "%）");
    見(文.length ? 長.length / 文.length < 0.2 : false,
       "③ 長すぎる 文が 2 割 未満（" + 長.length + "/" + 文.length + "）");
    if (t.表) 見(表 > 0, "④ 表が 向く 頼みでは 表が 入る", 表);
  }
  console.log(`\n落ち ${落} 件`);
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error("✗ 途中で 落ちた:", e && e.message); process.exit(1); });
