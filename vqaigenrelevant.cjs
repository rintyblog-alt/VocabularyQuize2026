/* ══════════════════════════════════════════════════════════════════════════
   vqaigenrelevant.cjs — **頼んだ題から 外れた 問題が 混ざらないか**を
   本物の AI で 何回か 回して 確かめる。

   訴え（2026-08-29）:
     「ルミAIで、ユーザーのプロンプトとは関係ない問題入れないこと。
       これは厳格にお願いしたい」

   見かた: 題ごとに「この語のどれかが 問題文・選択肢・解説・topic に
   出てくること」を 決めておき、1 つも 出てこない 問題を 外れとして 数える。
   （語の 一覧は 甘めに 広く 取る。厳しくしすぎると こちらの 数えかたが 悪くなる）

   使い方: VQ_TOKEN=<札> node vqaigenrelevant.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) {
  console.error("本番では実行しません。"); process.exit(2);
}
const token = process.env.VQ_TOKEN;
if (!token) { console.error("VQ_TOKEN を 渡してください。"); process.exit(2); }
const H = { "Content-Type": "application/json", Authorization: "Bearer " + token };

const 題 = [
  { ask: "米津玄師の楽曲について 4択で 5問",
    語: /米津|ハチ|Lemon|レモン|パプリカ|感電|KICK BACK|馬と鹿|アイネクライネ|打上花火|ピースサイン|楽曲|曲|歌|シングル|アルバム|ボカロ|ボーカロイド/i },
  { ask: "鎌倉時代の政治について 4択で 5問",
    語: /鎌倉|源|北条|執権|御家人|守護|地頭|承久|元寇|幕府|将軍|六波羅|御成敗|貞永|得宗|文永|弘安/ },
  { ask: "スタジオジブリの映画について 4択で 5問",
    語: /ジブリ|宮崎|高畑|鈴木敏夫|トトロ|千と千尋|もののけ|ラピュタ|ナウシカ|ハウル|魔女の宅急便|紅の豚|ポニョ|かぐや姫|映画|作品|監督|主題歌/ }
];

function 中身(q) {
  const a = [q.question || "", q.explanation || "", q.topic || ""];
  (q.choices || []).forEach((c) => a.push(typeof c === "string" ? c : (c && c.text) || ""));
  if (Array.isArray(q.items)) q.items.forEach((x) => a.push(typeof x === "string" ? x : JSON.stringify(x)));
  a.push(typeof q.answer === "string" ? q.answer : JSON.stringify(q.answer || ""));
  return a.join(" ");
}

(async () => {
  let 落 = 0, 外れ合計 = 0, 問合計 = 0;
  for (const t of 題) {
    const r = await fetch(BASE + "/api/aigen/questions", {
      method: "POST", headers: H, body: JSON.stringify({ prompt: t.ask, count: 5 })
    }).then((x) => x.json());
    const qs = Array.isArray(r.questions) ? r.questions : [];
    const 外れ = qs.filter((q) => !t.語.test(中身(q)));
    問合計 += qs.length; 外れ合計 += 外れ.length;
    console.log("── " + t.ask);
    console.log("   できた " + qs.length + " 問 ／ 外れ " + 外れ.length + " 問"
      + (r.metrics && r.metrics.rejectReasons ? "  弾いた理由: " + JSON.stringify(r.metrics.rejectReasons) : ""));
    qs.forEach((q, i) => {
      const ng = !t.語.test(中身(q));
      console.log("   " + (ng ? "✗" : " ") + " " + (i + 1) + ". " + String(q.question || "").slice(0, 46));
    });
    if (外れ.length) 落++;
  }
  console.log("\n合計: " + 問合計 + " 問中 外れ " + 外れ合計 + " 問");
  console.log(落 === 0 ? "✓ どの題も 外れ 0 問" : "✗ 外れが ある 題が " + 落 + " 件");
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error("✗ 途中で 落ちた:", e && e.message); process.exit(1); });
