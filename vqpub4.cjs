/* ══════════════════════════════════════════════════════════════════════
   vqpub4.cjs — 公開プリセット・公式プリセットが **4 択で 出るか**

   訴え（2026-08-19）:
     「V2 で 公開された 公開プリセット、公式プリセットが
       全て 4 択ではなく 短答に 置き換わってしまっている。
       どうにかこうにか 4 択に 戻すことは できる？
       おそらく 4 択の データとか 残ってるよな」

   実測して 分かったこと（本番 8 件）:
     政治経済 123 問 … 選択肢は **123 問ぶん 残っていた**
     日本史探究 108 問 … 選択肢は **108 問ぶん 残っていた**
       → 失われていない。**画面が 数えていなかっただけ**
     英コミュⅢ 56 問 / Lesson1 67 問 / 保健 25 問 … 選択肢が 元から 無い
       → 公式と 同じ やり方で 作る（DB は 書き換えない）
     「穴埋めのみ」×2 … 作った人が そう決めたもの。**触らない**

   使い方: node vqpub4.cjs        （先に server/dev-local.sh echo）
   ══════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_API || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ok   " + n); }
  else { fail++; bad.push(n); console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 300) : "")); }
};
const 節 = (t) => console.log("\n══ " + t + " ══");

/* 中身（cards / words）を 数える */
function 数える(j) {
  const 並 = (j && j.cards && j.cards.length) ? j.cards : ((j && j.words) || []);
  let 四 = 0, 短 = 0, 単語 = 0, 正解ずれ = 0;
  for (const c of 並) {
    const ch = c.choices || (c.mcq && c.mcq.choices);
    const 有 = Array.isArray(ch) && ch.filter((t) => String(t || "").trim()).length >= 2;
    if (有) {
      四++;
      const ci = Number.isInteger(c.correctIndex) ? c.correctIndex
               : (c.mcq && Number(c.mcq.correctIndex));
      const 正 = String(c.back || c.meaning || "").trim();
      if (正 && ch[ci] !== 正) 正解ずれ++;
    } else 短++;
    if (c.questionKind === "vocabu") 単語++;
  }
  return { 問: 並.length, 四択: 四, 短答: 短, 単語集: 単語, 正解ずれ };
}

(async () => {
  console.log("接続先: " + BASE);

  節("① 公開プリセット（本番の 中身を この worker に 通す）");
  /* ローカルの DB には 公開プリセットが 無いので、本番の 中身で 確かめる。
     見たいのは **サーバの 組み立て**なので、同じ関数を 通せばよい。 */
  const 本番 = await (await fetch("https://www.vocabuquiz.app/api/public/presets")).json();
  const 元 = (本番.presets || 本番.items || []);
  ok("本番から 中身を 取れた", 元.length > 0, 元.length);

  const 手元 = await (await fetch(BASE + "/api/public/presets")).json();
  console.log("     （この worker の 公開プリセット: " + ((手元.presets || []).length) + " 件）");

  /* 直したあとの 組み立てを 直に 確かめる。
     worker の 関数は 外から 呼べないので、**同じ入力**を
     本番の 返事と 比べて 変化を 見る。 */
  節("② いま 本番で どう 見えているか（直す前の 姿）");
  const 表 = [];
  for (const p of 元) {
    const j = p.preset || p;
    const c = 数える(j);
    表.push({ 名: String(p.name || "").slice(0, 26), ...c });
  }
  表.forEach((r) => console.log("     " + r.名.padEnd(28)
    + " 問" + String(r.問).padStart(4) + " 四択" + String(r.四択).padStart(4)
    + " 短答" + String(r.短答).padStart(4) + " 単語集" + String(r.単語集).padStart(4)));

  const 政 = 表.find((x) => /政治経済/.test(x.名));
  const 日 = 表.find((x) => /日本史探究/.test(x.名));
  ok("★ 政治経済は 選択肢が 残っている（失われていない）", 政 && 政.四択 === 123, 政);
  ok("★ 日本史探究も 残っている", 日 && 日.四択 === 108, 日);
  const 穴 = 表.filter((x) => /穴埋めのみ/.test(x.名));
  ok("「穴埋めのみ」は 単語集では ない（触ってはいけない）",
     穴.length === 2 && 穴.every((x) => x.単語集 === 0), 穴);

  節("③ 直したあと — 単語集に 4 択が 付くか");
  /* サーバの 関数を そのまま 取り出して 動かす（本番へは 何もしない）。 */
  const fs = require("fs");
  const src = fs.readFileSync(require("path").join(__dirname, "server/src/worker.js"), "utf8");
  const 取る = (名) => {
    const i = src.indexOf("function " + 名 + "(");
    if (i < 0) throw new Error(名 + " が 見つかりません");
    let 深 = 0, j = src.indexOf("{", i);
    for (let k = j; k < src.length; k++) {
      if (src[k] === "{") 深++;
      else if (src[k] === "}") { 深--; if (!深) return src.slice(i, k + 1); }
    }
    throw new Error(名 + " の 終わりが 見つかりません");
  };
  const 組み = new Function(取る("_mixNum") + "\n" + 取る("publicCardsToChoices")
    + "\nreturn publicCardsToChoices;")();

  for (const 名 of ["英コミュⅢ", "Lesson 1", "保健"]) {
    const p = 元.find((x) => String(x.name || "").includes(名));
    if (!p) { ok(名 + " が 見つかる", false); continue; }
    const j = p.preset || p;
    const 前 = 数える(j);
    const 後 = 数える({ cards: 組み(j.cards || j.words || [], "1:" + (p.presetId || "x")) });
    console.log("     " + 名.padEnd(12) + " 四択 " + 前.四択 + " → " + 後.四択
      + "（短答 " + 前.短答 + " → " + 後.短答 + "）");
    ok(名 + ": 単語集が 4 択に なる", 後.四択 >= 前.四択 + Math.min(1, 前.短答), { 前, 後 });
    ok(名 + ": 正解が 選択肢の 中に ある", 後.正解ずれ === 0, 後);
  }

  節("④ 触ってはいけないものを 触っていないか");
  for (const 名 of ["穴埋めのみ)", "略語"]) {
    const p = 元.find((x) => String(x.name || "").includes(名));
    if (!p) continue;
    const j = p.preset || p;
    const 前 = 数える(j);
    const 後 = 数える({ cards: 組み(j.cards || j.words || [], "1:x") });
    ok("★ " + 名 + " は そのまま（穴埋め・単語集でないもの）",
       後.四択 === 前.四択 && 後.短答 === 前.短答, { 前, 後 });
  }

  節("⑤ 何度 開いても 同じ 4 択か（開くたびに 変わらない）");
  const p2 = 元.find((x) => String(x.name || "").includes("英コミュⅢ"));
  if (p2) {
    const j2 = p2.preset || p2;
    const a = 組み(j2.cards || [], "1:" + p2.presetId);
    const b = 組み(j2.cards || [], "1:" + p2.presetId);
    ok("2 回 組んでも まったく 同じ", JSON.stringify(a) === JSON.stringify(b));
    const 位置 = {};
    a.forEach((c) => { if (Number.isInteger(c.correctIndex)) 位置[c.correctIndex] = (位置[c.correctIndex] || 0) + 1; });
    ok("正解の 位置が 4 か所に ばらける", Object.keys(位置).length >= 3, 位置);
  }

  節("⑥ 公式プリセット（もとから 4 択の はず）");
  const 公 = await (await fetch("https://www.vocabuquiz.app/api/official-presets")).json();
  const 公L = 公.presets || 公.items || [];
  let 全語 = 0, 全四 = 0;
  for (const p of 公L) { const c = 数える(p); 全語 += c.問; 全四 += c.四択; }
  ok("公式は 全問 4 択（" + 全四 + " / " + 全語 + "）", 全語 > 0 && 全四 === 全語, { 全語, 全四 });

  console.log("\n════════════════════════════════════════════");
  console.log("  合計 " + (pass + fail) + " 件 / 通った " + pass + " / 落ちた " + fail);
  if (bad.length) { console.log("  落ちたもの:"); bad.forEach((b) => console.log("   - " + b)); }
  console.log("════════════════════════════════════════════");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("落ちました: " + (e && e.stack || e)); process.exit(1); });
