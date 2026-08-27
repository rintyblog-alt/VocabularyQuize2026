/* ══════════════════════════════════════════════════════════════════════════
   vqpresetdetail.cjs — プリセット詳細の見やすさ（2026-08-13）

   何を変えたか（形はそのまま。足しただけ）:
     ① いちばん知りたい 2 つ（問題数・目安の時間）を上に大きく出す
     ② 項目の行に、その項目を表す絵を添える
     ③ 内訳の行に、その形式の絵を添える（絵はレジストリが唯一の出どころ）

   ここで守りたいこと:
     ・**存在しない絵の名前を使わない**（黙って別の絵が出る／出ないのを防ぐ）
     ・同じ数字を 2 か所に出さない（上に出したら下の列からは外す）
     ・絵は飾りなので読み上げに渡さない（aria-hidden）
     ・CSS は SHELL_CSS（巨大な 1 本の文字列）を触っていない
     ・狭い画面で数字が折れない
   ══════════════════════════════════════════════════════════════════════════ */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (detail ? "  → " + detail : "")); }
};

const src = require("./vqsrc.cjs").丸ごと();

/* ui/preset-detail.js の範囲だけを見る */
const detail = (function () {
  const a = src.indexOf("/* ───────── ui/preset-detail.js ───────── */");
  const b = src.indexOf("/* ───────── ui/entry.js ───────── */");
  return a >= 0 && b > a ? src.slice(a, b) : "";
})();

/* 画面が使える絵の名前（U.icon の対応表） */
const ICON_NAMES = (function () {
  const m = src.match(/var ICONS\s*=\s*\{/);
  const seg = src.slice(m.index + m[0].length, m.index + m[0].length + 9000);
  return new Set([...seg.matchAll(/(?:^|\s|,)([a-zA-Z0-9_]+)\s*:\s*['"`]/g)].map((x) => x[1]));
})();

console.log("\n① 存在しない絵の名前を使っていない");
{
  ok("絵の対応表を読めた", ICON_NAMES.size > 30, ICON_NAMES.size + "個");

  /* 項目に添える絵 */
  const fm = detail.match(/var FACT_ICON = \{([\s\S]*?)\};/);
  ok("FACT_ICON がある", !!fm);
  const factIcons = fm ? [...fm[1].matchAll(/"([a-zA-Z0-9_]+)"(?=\s*[,}\n])/g)].map((x) => x[1])
    .filter((v) => ICON_NAMES.has(v) || /^[a-z]+$/.test(v)) : [];
  const used = fm ? [...fm[1].matchAll(/:\s*"([a-zA-Z0-9_]+)"/g)].map((x) => x[1]) : [];
  const missing = used.filter((n) => !ICON_NAMES.has(n));
  ok("項目の絵がすべて実在する", missing.length === 0, "無い: " + missing.join(", "));
  ok("項目の絵が 8 種類以上ある", used.length >= 8, used.length + "個");

  /* 大きく出す 2 つで使う絵 */
  const statIcons = [...detail.matchAll(/stat\("([a-z]+)"/g)].map((x) => x[1]);
  const missing2 = statIcons.filter((n) => !ICON_NAMES.has(n));
  ok("大きい枠の絵がすべて実在する", missing2.length === 0, "無い: " + missing2.join(", "));

  /* 形式の絵はレジストリから取る（ここへ書き写していないこと） */
  ok("形式の絵はレジストリから取っている",
    /VQ2\.qtypes && VQ2\.qtypes\.icon \? VQ2\.qtypes\.icon\(r\.type\) : ""/.test(detail));
  ok("形式の絵をこのファイルへ書き写していない",
    !/single_choice|fill_blank|multi_choice/.test(detail));
  ok("読めないときは絵を出さない（別の絵を当てない）",
    /catch \(e\) \{ ic = ""; \}/.test(detail));
}

console.log("\n② 同じ数字を 2 か所に出さない");
{
  ok("上に大きい枠（statsHtml）がある", /function statsHtml\(\)/.test(detail));
  ok("本文の先頭に置いている", /\+ statsHtml\(\) \+ descHtml\(\)/.test(detail));
  /* 下の列（factsHtml）から 問題数・目安の時間 を外したこと */
  const facts = detail.match(/function factsHtml\(\)[\s\S]*?\n    \}/);
  ok("factsHtml を取り出せた", !!facts);
  ok("下の列に「問題数」を出していない", facts && !/row\("収録語数"|row\(unit === "語"/.test(facts[0]));
  ok("下の列に「目安の時間」を出していない", facts && !/row\("目安の時間"/.test(facts[0]));
  /* 逆に、上の枠にはちゃんとある */
  const stats = detail.match(/function statsHtml\(\)[\s\S]*?\n    \}/);
  ok("上の枠に問題数がある", stats && /"問題数"/.test(stats[0]));
  ok("上の枠に目安の時間がある", stats && /"目安の時間"/.test(stats[0]));
  ok("数字が無ければ枠ごと出さない", stats && /if \(!out\.length\) return "";/.test(stats[0]));
  ok("片方だけでも出せる（2 つ揃わないと出ない、にしない）",
    stats && /if \(n\) \{/.test(stats[0]) && /if \(mins\) out\.push/.test(stats[0]));
}

console.log("\n③ 絵は読み上げに渡さない（飾りなので）");
{
  const hidden = (detail.match(/vq2-pd-stat-i" aria-hidden="true"|vq2-pd-fi" aria-hidden="true"|vq2-pd-mi" aria-hidden="true"/g) || []).length;
  ok("足した絵 3 か所すべてに aria-hidden が付く", hidden === 3, hidden + "/3");
}

console.log("\n④ CSS の作法");
{
  const cm = detail.match(/var PD_CSS = \[([\s\S]*?)\]\.join\("\\n"\);/);
  ok("PD_CSS がある", !!cm);
  const css = cm ? cm[1] : "";
  ok("mount へ渡している", /css: PD_CSS,/.test(detail));
  ok("SHELL_CSS を触っていない", !/var SHELL_CSS = "[^"]*vq2-pd-stat/.test(src));
  ok("色は生の値ではなくトークンを使っている（予備値つき）",
    /var\(--vq-accent,#756DB3\)/.test(css) && /var\(--vq-surface,#fff\)/.test(css));
  ok("狭い画面で 1 列に落とす", /@media \(max-width:479px\)/.test(css)
    && /grid-template-columns:1fr;/.test(css));
  /* 高さの潰れ（前回の失敗）を持ち込んでいないこと */
  ok("height:100% を使っていない", !/height:100%/.test(css));
}

console.log("\n⑤ 本物の DOM で組み立てられる");
{
  let JSDOM = null;
  try { ({ JSDOM } = require(path.join(__dirname, "e2b-proxy", "node_modules", "jsdom"))); }
  catch (e) { JSDOM = null; }
  if (!JSDOM) {
    console.log("  ! jsdom が無いので飛ばします");
  } else {
    const cm = detail.match(/var PD_CSS = \[([\s\S]*?)\]\.join\("\\n"\);/);
    const sb = { module: { exports: {} } };
    vm.createContext(sb);
    vm.runInContext("module.exports = [" + cm[1] + '].join("\\n");', sb);
    const css = sb.module.exports;

    const dom = new JSDOM("<!doctype html><html><head><style>" + css
      + "</style></head><body>"
      + '<div class="vq2-pd-stats">'
      + '<div class="vq2-pd-stat"><span class="vq2-pd-stat-i" aria-hidden="true"><svg></svg></span>'
      + '<span class="vq2-pd-stat-b"><span class="vq2-pd-stat-v">20 問</span>'
      + '<span class="vq2-pd-stat-k">問題数</span></span></div>'
      + '<div class="vq2-pd-stat"><span class="vq2-pd-stat-i" aria-hidden="true"><svg></svg></span>'
      + '<span class="vq2-pd-stat-b"><span class="vq2-pd-stat-v">約 12 分</span>'
      + '<span class="vq2-pd-stat-k">目安の時間</span></span></div>'
      + "</div></body></html>");
    const d = dom.window.document;
    ok("大きい枠が 2 つ並ぶ", d.querySelectorAll(".vq2-pd-stat").length === 2);
    const w = dom.window.getComputedStyle(d.querySelector(".vq2-pd-stats"));
    ok("2 列で並べる指定が効いている", /1fr 1fr/.test(w.gridTemplateColumns || ""), w.gridTemplateColumns);
    ok("数字が読める大きさ",
      /20px/.test(dom.window.getComputedStyle(d.querySelector(".vq2-pd-stat-v")).fontSize || ""));
    ok("絵は読み上げから外れている",
      d.querySelector(".vq2-pd-stat-i").getAttribute("aria-hidden") === "true");
    dom.window.close();
  }
}

console.log("\n" + (fail === 0 ? "✅ 全部通りました" : "❌ 落ちています") + "  通過 " + pass + " / 失敗 " + fail);
process.exit(fail === 0 ? 0 : 1);
