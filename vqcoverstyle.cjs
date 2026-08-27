/* ══════════════════════════════════════════════════════════════════════════
   vqcoverstyle.cjs — バナーが「シンプルで単調」だったのを直す（2026-08-14）

   何が起きていたか（実物 5 枚を見て特定）:
     ・5 枚中 3 枚が **ほぼ真っ白**（一覧に並べると空白に見える）
     ・5 枚中 3 枚が **同じ波の形**
     ・絵の指示文 5 件中 4 件が "a serene …" で始まっていた

   原因は **モデルではなく、こちらの指示**だった:
     ・全部の絵に固定で足していた文が
         "flat minimal editorial illustration, soft muted palette,
          generous negative space"
       ＝ 平坦に・色を薄く・余白を大きく、と毎回命令していた
     ・指示文を書かせる側にも「落ち着いた抽象的なイラスト」と書いていた

   直したこと:
     ① 守り（文字・人物・ロゴを描かせない）と 見た目（絵柄）を **分けた**
     ② 絵柄を 12 種類にし、**題材から決める**（同じプリセットなら毎回同じ）
     ③ 指示文を書く側には「何を描くか」だけを書かせる（雰囲気の語を禁止）

   ★ 一度やりすぎて 2 枚壊したので、その回帰も見る:
     ・"technical blueprint" … 崩れた数式で画面が埋まった
     ・"jewel-like colors" 系 … ネオン寄りで DS の方針から外れた
   ══════════════════════════════════════════════════════════════════════════ */
const fs = require("fs");
const path = require("path");

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (detail ? "  → " + detail : "")); }
};
const WORKER = fs.readFileSync(path.join(__dirname, "server", "src", "worker.js"), "utf8");

(async function () {
  const T = (await import("file://" + path.join(__dirname, "server", "src", "worker.js"))).__testables;
  const { COVER_IMAGE_STYLES: ST, COVER_IMAGE_SAFE: SAFE, coverStyleFor: pick } = T;

  console.log("\n① 単調にする言葉を、もう毎回付けていない");
  {
    ok("守りの文がある", typeof SAFE === "string" && SAFE.length > 0);
    ["flat minimal", "soft muted palette", "generous negative space"].forEach((w) => {
      ok("　「" + w + "」を全部の絵に付けていない", SAFE.indexOf(w) < 0, SAFE.slice(0, 60));
    });
    /* 絵柄側にも入っていないこと（付け替えただけでは意味がない） */
    ["soft muted palette", "generous negative space"].forEach((w) => {
      ok("　絵柄にも入れていない: " + w, !ST.some((x) => x.indexOf(w) >= 0));
    });
  }

  console.log("\n② 守りは残っている（むしろ強めた）");
  {
    ["no text", "no letters", "no numbers", "no logos", "no people", "no faces",
     "no brand", "no watermark"].forEach((w) => {
      ok("　" + w, SAFE.indexOf(w) >= 0);
    });
    /* 実測で漏れたもの。名指しで断る。 */
    ["no equations", "no formulas", "no labels", "no book titles",
     "no calligraphy", "no writing"].forEach((w) => {
      ok("★ 実測で漏れたぶんも断っている: " + w, SAFE.indexOf(w) >= 0);
    });
    ok("横長の構図を指定している", /horizontal banner composition/.test(SAFE));
    ok("★ 画面いっぱいに描かせる（白っぽさ対策）", /fills the frame edge to edge/.test(SAFE));
  }

  console.log("\n③ 絵柄が題材ごとに変わる");
  {
    ok("絵柄が 10 種類以上ある", ST.length >= 10, ST.length + "種");
    ok("同じものが無い", new Set(ST).size === ST.length);
    /* ★ 同じ題材なら毎回同じ絵柄（作り直すたびに雰囲気が変わらない） */
    ok("★ 同じ題材なら 同じ絵柄", pick("日本史の鎌倉時代") === pick("日本史の鎌倉時代"));
    ok("　空でも落ちない", typeof pick("") === "string" && pick("") .length > 0);
    ok("　必ず一覧の中から選ぶ", ST.indexOf(pick("なにか適当な題材")) >= 0);
    /* ★ 題材が違えば散らばること。よく使う教科で数える。 */
    const subjects = ["日本史", "世界史", "英単語", "古文", "漢文", "数学Ⅰ", "数学A",
      "生物基礎", "化学基礎", "物理基礎", "地理", "政治経済", "現代文", "情報", "英文法"];
    const got = new Set(subjects.map(pick));
    ok("★ 15 教科で 5 種類以上に散る", got.size >= 5, got.size + "種");
  }

  console.log("\n④ やりすぎて壊した 2 つを戻していない");
  {
    ok("★ 設計図（注記が付き物）を使わない",
      !ST.some((x) => /blueprint/i.test(x)), ST.filter((x) => /blueprint/i.test(x)).join(""));
    ok("★ 宝石色・ステンドグラス（ネオン寄り）を使わない",
      !ST.some((x) => /jewel|stained|neon|glow/i.test(x)),
      ST.filter((x) => /jewel|stained|neon|glow/i.test(x)).join(""));
    /* DS の禁止（派手なグラデーション・ネオン）に触れていないこと */
    ok("　けばけばしい語が入っていない",
      !ST.some((x) => /vivid|vibrant|neon|electric|psychedelic/i.test(x)));
  }

  console.log("\n⑤ 指示文の書かせ方");
  {
    ok("★ 雰囲気の語を禁止している（serene が 4 回出ていた）",
      /serene \/ calm \/ soft \/ minimal \/ abstract といった雰囲気の語は使わない/.test(WORKER));
    ok("　何を描くかだけを書かせる", /\*\*何を描くか（もの・情景）だけ\*\*を書く/.test(WORKER));
    ok("　具体的なものを挙げさせる", /その教科ならではの \*\*具体的なもの\*\*を 2〜3 つ挙げる/.test(WORKER));
    ok("★ 文字が書かれるものを頼ませない",
      /\*\*文字が書かれるもの\*\*は挙げない/.test(WORKER));
    ok("　絵柄はこちらで決めると書いてある", /絵柄・色・雰囲気は書かない/.test(WORKER));
  }

  console.log("\n⑥ 組み立ての順");
  {
    ok("絵柄を題材から決めて足している",
      /coverStyleFor\(seed\)/.test(WORKER));
    ok("★ 守りは いちばん最後（最後の指示がいちばん効く）",
      /imagePrompt \+ ", " \+ coverStyleFor\(seed\) \+ COVER_IMAGE_SAFE/.test(WORKER));
    ok("古い固定文（COVER_IMAGE_GUARD）は残っていない",
      WORKER.indexOf("COVER_IMAGE_GUARD") < 0);
    ok("大きさは 1024×384 のまま",
      /COVER_IMAGE_W = 1024/.test(WORKER) && /COVER_IMAGE_H = 384/.test(WORKER));
  }

  console.log("\n" + (fail === 0 ? "✅ 全部通りました" : "❌ 落ちています") + "  通過 " + pass + " / 失敗 " + fail);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("落ちました:", e); process.exit(1); });
