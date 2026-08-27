#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   vqsvgsafe.cjs — SVG を 入れる前に 清められているか（VQSVG）

   訴え（2026-08-28）「SVG で 精密に 素早く 正確に 描写したり…」
   AI が 出す SVG を そのまま 画面へ 入れるので、
   **危ないものが 1 つでも 通ったら 落ちる**検査。
   本物の DOM（chromium）で 動かす。
   ══════════════════════════════════════════════════════════════════════ */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
let OK = 0, NG = 0;
const ok = (n, m) => { OK++; console.log("  OK  " + n + (m ? " … " + m : "")); };
const ng = (n, m) => { NG++; console.log("  NG  " + n + (m ? " … " + m : "")); };
const 見 = (n, c, m) => (c ? ok(n, m) : ng(n, m));

(async () => {
  const src = fs.readFileSync(path.join(__dirname, "client/core/wp/svg.js"), "utf8");
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.setContent("<!doctype html><meta charset=utf-8><body>");
  await p.addScriptTag({ content: src });

  const 清 = (s, o) => p.evaluate(([s2, o2]) => window.VQSVG.清める(s2, o2), [s, o || null]);

  console.log("── 通してよいもの ─────────────────────────────────────");
  {
    const r = await 清('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">'
      + '<rect x="0" y="0" width="200" height="100" fill="#756DB3"/>'
      + '<text x="10" y="50" fill="#fff">こんにちは</text></svg>');
    見("ふつうの SVG は 通る", r.ok === true, r.なぜ);
    見("viewBox が 付く", /viewBox="0 0 200 100"/.test(r.svg), (r.svg || "").slice(0, 80));
    /* 根（いちばん外の <svg>）だけを 見る。中の rect も width を 持つため。 */
    const 根 = (r.svg || "").slice(0, (r.svg || "").indexOf(">") + 1);
    見("width/height は 外す（箱に 合わせるため）",
      !/\swidth=/.test(根) && !/\sheight=/.test(根), 根.slice(0, 110));
    見("中身は 残る", /<rect/.test(r.svg) && /こんにちは/.test(r.svg));
    見("直した所を 教える", Array.isArray(r.直したところ) && r.直したところ.length > 0,
      JSON.stringify(r.直したところ));
  }

  console.log("── 危ないもの（1 つでも 通ったら 落ちる）───────────────");
  const 危 = [
    ["script を 入れる", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)<\/script><rect width="10" height="10"/></svg>', /<script/i],
    ["onload を 付ける", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)"><rect width="10" height="10"/></svg>', /onload/i],
    ["図形に onclick", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" onclick="alert(1)"/></svg>', /onclick/i],
    ["外の 絵を 引く", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><image href="https://evil.example.test/a.png" width="10" height="10"/></svg>', /evil\.example/i],
    ["xlink で 外へ", '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10"><use xlink:href="https://evil.example.test/x.svg#a"/></svg>', /evil\.example/i],
    ["foreignObject に HTML", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><foreignObject width="10" height="10"><img src="x" onerror="alert(1)"></foreignObject></svg>', /foreignObject|onerror/i],
    ["style で 外を 読む", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><style>@import url(https://evil.example.test/a.css);</style><rect width="10" height="10"/></svg>', /evil\.example|@import/i],
    ["style 属性で 外の 絵", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" style="fill:url(https://evil.example.test/a.png)"/></svg>', /evil\.example/i],
    ["animate で 仕掛ける", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><animate attributeName="x" onbegin="alert(1)"/><rect width="10" height="10"/></svg>', /animate|onbegin/i],
    ["javascript: の 住所", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><a href="javascript:alert(1)"><rect width="10" height="10"/></a></svg>', /javascript:/i],
    ["iframe を 埋める", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><iframe src="https://evil.example.test/"/></svg>', /iframe|evil\.example/i]
  ];
  for (const [名, s, 悪] of 危) {
    const r = await 清(s);
    const 出 = r.ok ? String(r.svg) : "";
    見(名 + " → 残らない", !悪.test(出), r.ok ? 出.slice(0, 90) : "（断った: " + r.なぜ + "）");
  }

  console.log("── 通してよい 住所 ────────────────────────────────────");
  {
    const r1 = await 清('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0" stop-color="#f00"/></linearGradient></defs><rect width="10" height="10" fill="url(#g)"/></svg>');
    見("自分の中の 参照（#g）は 通る", r1.ok && /url\(#g\)/.test(r1.svg), (r1.svg || "").slice(0, 100));
    const r2 = await 清('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><image href="/api/media/img/abc.png" width="10" height="10"/></svg>');
    見("手元の 置き場（/api/media/…）は 通る", r2.ok && /\/api\/media\/img\/abc\.png/.test(r2.svg),
      (r2.svg || "").slice(0, 100));
    const r3 = await 清('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><image href="data:image/png;base64,iVBORw0KGgo=" width="10" height="10"/></svg>');
    見("埋め込みの 絵（data:）は 通る", r3.ok && /data:image\/png/.test(r3.svg));
  }

  console.log("── AI の 出しかたの 癖 ────────────────────────────────");
  {
    const r1 = await 清('```svg\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>\n```');
    見("``` で 囲まれていても 通る", r1.ok === true, r1.なぜ);
    const r2 = await 清('はい、こちらです。\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>\nご確認ください。');
    見("前後に 文が あっても 取り出す", r2.ok === true && !/ご確認/.test(r2.svg), r2.なぜ);
    const r3 = await 清("ただの文です。");
    見("SVG でないものは 断る", r3.ok === false, r3.なぜ);
    const r4 = await 清('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect');
    見("壊れた形は 断る", r4.ok === false, r4.なぜ);
  }

  console.log("── 大きさの 歯止め ────────────────────────────────────");
  {
    const 巨 = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">'
      + '<rect width="1" height="1"/>'.repeat(7000) + "</svg>";
    const r = await 清(巨);
    見("部品が 多すぎたら 断る", r.ok === false, r.なぜ);
    /* 日本語は 1 文字 3 バイト。上限 400KB を 越えるのは 約 137,000 文字。
       文字数で 測っていると ここが 通ってしまう（それを 落とす検査）。 */
    const 長 = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><desc>'
      + "あ".repeat(150000) + "</desc></svg>";
    const r2 = await 清(長);
    見("大きすぎたら 断る（バイトで 測る）", r2.ok === false, r2.なぜ);
  }

  console.log("── 実際に 画面へ 入れて 何も 起きないこと ───────────────");
  {
    const r = await p.evaluate(() => {
      window.__やられた = 0;
      window.alert = function () { window.__やられた++; };
      const 危 = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)">'
        + '<script>alert(1)<\/script>'
        + '<rect width="10" height="10" onclick="alert(1)" onmouseover="alert(1)"/>'
        + '<image href="https://evil.example.test/a.png"/></svg>';
      const c = window.VQSVG.清める(危);
      const box = document.createElement("div");
      box.innerHTML = c.ok ? window.VQSVG.包む(c.svg) : "";
      document.body.appendChild(box);
      const rect = box.querySelector("rect");
      if (rect) { rect.dispatchEvent(new MouseEvent("click", { bubbles: true })); }
      return { ok: c.ok, やられた: window.__やられた, 中: box.innerHTML.slice(0, 200) };
    });
    見("入れても 仕掛けが 動かない", r.やられた === 0, "動いた回数 " + r.やられた);
    見("外への 参照が 残っていない", !/evil\.example/.test(r.中), r.中.slice(0, 90));
  }

  await b.close();
  console.log("\n合計 OK=" + OK + " NG=" + NG);
  process.exit(NG ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
