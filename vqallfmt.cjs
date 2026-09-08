/* ══════════════════════════════════════════════════════════════════════════
   vqallfmt — **全部の 形式が どんな 頼みかたでも 作れるか**（2026-09-09・訴え）

   訴え「完全に プリセットを 生成できなく なった。エラーが 出る」
       「ちゃんと 全形式が どんな プロンプト指示でも 動く ように な！」

   本番の 台帳で 分かって いた こと:
     グラフ読み取り（chart_read）が 2 回 呼んで **0 問**。
     ほかにも 同じ ものが 無いか、**15 形式 × 頼みかた**で 総当たりする。

   ★ 本物の AI を 呼ぶ。時間と 枠を 使うので、既定は 1 形式 2 問。
   使いかた:
     node vqallfmt.cjs                 全部
     node vqallfmt.cjs --形式 chart_read,table_fill
     node vqallfmt.cjs --言い方 2      頼みかたを 2 通りに 減らす
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "https://www.vocabuquiz.app";
const 名 = process.env.VQ_USER || "lg7358830806";
const 合言葉 = process.env.VQ_PASS || "DevAcc#2026a";

const 引 = process.argv.slice(2);
const 値 = (k, d) => { const i = 引.indexOf(k); return i >= 0 && 引[i + 1] ? 引[i + 1] : d; };
const 絞り = (値("--形式", "") || "").split(",").map(s => s.trim()).filter(Boolean);
const 言い方の数 = Math.max(1, Number(値("--言い方", 3)) || 3);
const 問数 = Math.max(1, Number(値("--問", 2)) || 2);

/* 形式ごとの 「その形式らしい 題材」。題材が 合わないと
   AI が 作れなくて 当たり前に なるので、そこは そろえる。 */
const 形式 = [
  ["single_choice", "4択", "中学理科の 光合成"],
  ["multi_choice", "複数選択", "日本の 都道府県と 地方区分"],
  ["true_false", "正誤", "中学歴史の 鎌倉時代"],
  ["fill_blank", "穴埋め", "中学英語の 現在完了"],
  ["text_input", "短答", "小学算数の 単位換算"],
  ["free_text", "記述", "情報Ⅰ の アルゴリズム"],
  ["reorder", "並べ替え", "英語の 語順（基本文型）"],
  ["matching", "対応づけ", "元素記号と 元素名"],
  ["classification", "分類", "セキ椎動物の 5 つの なかま"],
  ["numeric_input", "数値入力", "中学理科の オームの法則"],
  ["error_correction", "誤文訂正", "中学英語の 三人称単数"],
  ["flashcard", "暗記カード", "英単語（高校基礎）"],
  ["table_fill", "表のうめ", "日本の 気候区分と 特徴"],
  ["chart_read", "グラフの読み取り", "日本の 人口の うつりかわり"],
  ["composite", "複合問題", "中学理科の 天気"]
];

/* 頼みかた。人が 実際に 書く 3 通り。 */
const 言い方 = [
  (l, s) => `${s} について、${l}の 問題を ${問数} 問 つくって`,
  (l, s) => `${問数}問${l}で。テーマは ${s}。難易度は 難しく`,
  (l, s) => `${s} の 練習問題を お願いします。形式は ${l} で、全部で ${問数} 問。解説も つけて`
];

let 済 = 0, 落 = 0; const 落ち = [];
const 秒 = (ms) => Math.round(ms / 100) / 10;

async function 合言葉を取る() {
  const r = await fetch(BASE + "/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gradePrefix: "H1", nickname: 名, password: 合言葉 })
  }).then(x => x.json()).catch(() => ({}));
  if (!r || !r.token) { console.error("ログインできません（VQ_USER / VQ_PASS を 確かめて ください）"); process.exit(2); }
  return r.token;
}

/* ★ 試験は 同じ 口を **exam: true ＋ questionTypes** で 叩く（vq-make と 同じ）。
   聞かれ方の 型・ひっかけ・教科の 縛りが 足されるので、
   プリセットで 通っても 試験で 落ちる ことが ある。両方 見る。 */
const 試験 = 引.indexOf("--試験") >= 0;

async function 作らせる(token, prompt, id) {
  const t0 = Date.now();
  let r;
  try {
    const res = await fetch(BASE + "/api/aigen/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify(試験
        ? { prompt, count: 問数, exam: true, questionTypes: [id], subject: "理科", level: "標準" }
        : { prompt, count: 問数 })
    });
    const txt = await res.text();
    try { r = JSON.parse(txt); } catch (e) { r = { ok: false, code: "BAD_JSON", raw: txt.slice(0, 200) }; }
    r.__http = res.status;
  } catch (e) { r = { ok: false, code: "FETCH_FAILED", message: String(e && e.message) }; }
  r.__ms = Date.now() - t0;
  return r;
}

(async () => {
  const token = await 合言葉を取る();
  const 表 = 絞り.length ? 形式.filter(([id]) => 絞り.includes(id)) : 形式;
  console.log((試験 ? "【試験】" : "【プリセット】") + "本番: " + BASE + "　形式 " + 表.length + " 種 × 言い方 " + Math.min(言い方の数, 言い方.length) + " 通り\n");
  const 結果 = [];

  for (const [id, label, 題材] of 表) {
    const 行 = { id, label, 回: [] };
    for (let k = 0; k < Math.min(言い方の数, 言い方.length); k++) {
      const p = 言い方[k](label, 題材);
      const r = await 作らせる(token, p, id);
      const q = (r.questions || []);
      const 出た = q.length;
      /* 頼んだ 形式で 返って きたか（呼び名は 戻される ことが ある）。 */
      const 合致 = q.filter((x) => x && (x.type === id || x.engineType === id || x.type === label)).length;
      const m = r.metrics || {};
      行.回.push({
        言: k + 1, http: r.__http, ms: r.__ms, 出た, 合致,
        呼: m.aiCalls, 落: m.rejected,
        訳: (m.rejectReasons && Object.keys(m.rejectReasons).length ? JSON.stringify(m.rejectReasons) : "")
          || r.blockedMessage || r.message || "",
        止: r.blocked || r.code || ""
      });
      const ok = 出た > 0;
      if (ok) 済++; else { 落++; 落ち.push(id + "／言い方" + (k + 1)); }
      console.log("  " + (ok ? "✓" : "✗") + " " + id.padEnd(17) + "言" + (k + 1)
        + "  出た " + String(出た).padStart(2) + "/" + 問数
        + "  合致 " + String(合致).padStart(2)
        + "  呼" + String(m.aiCalls ?? "-").padStart(2)
        + "  落" + String(m.rejected ?? "-").padStart(2)
        + "  " + 秒(r.__ms) + "s"
        + (ok ? "" : "  ← " + String(行.回[行.回.length - 1].訳 || 行.回[行.回.length - 1].止 || "理由なし").slice(0, 120)));
    }
    結果.push(行);
  }

  console.log("\n══ まとめ ══");
  const だめ = 結果.filter((x) => x.回.every((y) => y.出た === 0));
  const むら = 結果.filter((x) => x.回.some((y) => y.出た === 0) && x.回.some((y) => y.出た > 0));
  console.log("  通った " + 済 + " / 落ちた " + 落);
  if (だめ.length) console.log("  ★ **1 度も 作れない 形式**: " + だめ.map((x) => x.id).join(" "));
  if (むら.length) console.log("  ★ 言い方で 作れたり 作れなかったり: " + むら.map((x) => x.id).join(" "));
  if (!だめ.length && !むら.length) console.log("  ぜんぶ 作れました。");
  require("fs").writeFileSync("/tmp/_allfmt.json", JSON.stringify(結果, null, 1));
  console.log("  記録 → /tmp/_allfmt.json\n");
  process.exit(落 ? 1 : 0);
})();
