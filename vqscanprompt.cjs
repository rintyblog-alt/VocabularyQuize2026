#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqscanprompt.cjs — スキャンで 撮り溜め → 指示文と 一緒に 投げる（2026-08-31）

   訴え:「あと スキャンできる ように しよう。写真を 撮る じゃ なくて、
         スキャンで **撮り溜め** できる ように して、何枚も スキャンして から、
         **添付させて、プロンプト（指示文章）と 投げられる** ように して ほしい。
         それを **高速で 読んで、すぐに 問題に** できる ように して ほしい。
         プロンプトに 沿って。」

   直す前の 作り（client/core/scan/mode.js）:
     ・撮り溜めと 読み取りは **もう できて いた**（撮った そばから 1 枚 1.6 秒）。
     ・足りなかったのは 2 つ:
       ① 指示（プロンプト）を 書く ところが **どこにも 無い**。
          「この資料から N 問 作ってください」の 決め打ちだった。
       ② 作る ときに **撮った 絵を そのまま 送り直して いた**。
          せっかく 文字に して あるのに 読ませ直す。しかも 生成は
          2〜5 回に 分けて 頼むので、**同じ 絵を その 回数ぶん** 送る。
     ・開く 口が Lumi しか 無く、ふつうの 作る 画面から 入れなかった。

   ここで 見るもの:
     ① 指示欄と 問題数が 画面に ある／書いた ものが 頼み文へ 入る
     ② 読み取った **文字**を 渡す（読めた ページの 絵は 送らない）
     ③ 読めなかった ページ だけは これまでどおり 絵で 送る（ふりを しない）
     ④ 作る 画面から スキャンを 開ける／読み取り済みとして 入る
     ⑤ 実際に 動かして、**送った 中身**を 数える（--実）

   使い方:
     node vqscanprompt.cjs
     VQ_BASE=http://127.0.0.1:8791 node vqscanprompt.cjs --実
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs");
const path = require("path");
let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 220) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 340) : "")); }
};
const SCAN = fs.readFileSync(path.join(__dirname, process.env.VQ_SCAN || "client/core/scan/mode.js"), "utf8");
const MAKE = fs.readFileSync(path.join(__dirname, process.env.VQ_MAKE || "js-src/vq-make.js"), "utf8");

節("① 指示（プロンプト）を 書ける");
{
  見(/id="vqscan-p"/.test(SCAN), "★ 指示を 書く 欄が ある");
  見(/id="vqscan-n"/.test(SCAN), "問題数を 決められる");
  見(/function 指示を読む\(\)/.test(SCAN), "★ 押した ときに 画面の 中身を 読む");
  見(/問題へ\(\{ 件数: 注\.件数[^\n]*指示: 注\.指示 \}\)/.test(SCAN), "★ 読んだ ものを 渡す");
  見(/var 指示 = String\(o2\.指示/.test(SCAN), "作る 側が 指示を 受け取る");
  見(/指示 \|\| "この 資料から 問題を 作って ください。"/.test(SCAN),
    "★ 書かなくても 作れる（空でも 止めない）");
  見(!/prompt: "この資料から " \+ n \+ " 問 作ってください。/.test(SCAN),
    "決め打ちの 頼み文は 残って いない");
}

節("② 読み取った 文字を 渡す（絵を 送り直さない）");
{
  見(/【資料の 本文】/.test(SCAN), "★ 読み取った 文字を 頼み文へ 入れる");
  見(/var 残り = \(状 \? 状\.ページ : \[\]\)\.filter/.test(SCAN),
    "★ 送る 絵を **読めなかった ぶんだけ**に 絞る");
  見(/p\.種 === "PDF" \|\| p\.状態 !== "済" \|\| !String\(p\.文 \|\| ""\)\.trim\(\)/.test(SCAN),
    "★ 絞りかた（PDF・失敗・文が 空 だけ 絵で 送る）");
  見(/var files = \(文 \? 残り : \(状 \? 状\.ページ : \[\]\)\)/.test(SCAN),
    "★ 1 字も 読めなかった ときは これまでどおり 絵を 送る（ふりを しない）");
  見(/読み取った 文字（" \+ 文\.length \+ " 字）で 作るので 速いです/.test(SCAN),
    "速い 道に 乗った ことを 画面に 出す");
}

節("③ 添付として 返せる（作る 画面へ 渡す）");
{
  見(/function 添付する\(\)/.test(SCAN), "★ 読み取った 中身を 呼んだ 側へ 返す");
  見(/用途: String\(o\.用途 \|\| ""\)/.test(SCAN), "開く ときに 用途を 決められる");
  見(/data-go="attach"/.test(SCAN), "「この 内容を 添付する」の ボタン");
  見(/添付する: 添付する/.test(SCAN), "外からも 呼べる");
}

節("④ 作る 画面から スキャンを 開ける");
{
  見(/data-a="scanfile"/.test(MAKE), "★ 「スキャンして 足す」の ボタン");
  見(/function スキャンして足す\(\)/.test(MAKE), "押した ときの 道");
  見(/用途: "添付"/.test(MAKE), "添付として 開く");
  見(/ocrText: 文, ocr頁: 枚 - 絵\.length/.test(MAKE),
    "★ **読み取り済み**として 入る（作る ときに 読み直さない）");
  見(/pageImages: 絵\.length \? 絵 : null/.test(MAKE), "読めなかった ページ だけ 絵で 持つ");
  見(/st\.条件\.instruction = 前 \? \(前 \+ "\\n" \+ 指\) : 指;/.test(MAKE),
    "★ スキャン画面で 書いた 指示を 注文欄へ 引き継ぐ（捨てない）");
  見(/if \(window\.VQSCAN\)/.test(MAKE), "部品が 無い ときは ボタンを 出さない");
}

/* ══ ⑤ 実際に 動かす ══════════════════════════════════════════════ */
(async () => {
  if (process.argv.indexOf("--実") >= 0) {
    節("⑤ 実際に 動かして、送った 中身を 数える");
    const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
    if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.log("  本番では 動かしません。"); }
    else {
      const { chromium } = require("playwright");
      const browser = await chromium.launch();
      const ctx = await browser.newContext({ viewport: { width: 420, height: 860 } });
      const page = await ctx.newPage();
      const 例外 = [];
      page.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 200)));

      /* 読み取りの 口を 差し替える（何回 呼ばれたかも 数える）。 */
      const 読み = { 回: 0, 枚: 0 };
      await page.route("**/api/scan/read", async (route) => {
        const b = JSON.parse(route.request().postData() || "{}");
        読み.回++; 読み.枚 += (b.images || []).length;
        await route.fulfill({ status: 200, contentType: "application/json",
          body: JSON.stringify({ ok: true, task: "ocr",
            text: "【p." + 読み.回 + "】 光合成は 葉緑体で 起こる。二酸化炭素と 水から デンプンを 作る。" }) });
      });
      /* 作る 口。**何が 届いたか**を 控える。 */
      let 届 = null;
      await page.route("**/api/aigen/questions", async (route) => {
        届 = JSON.parse(route.request().postData() || "{}");
        await route.fulfill({ status: 200, contentType: "application/json",
          body: JSON.stringify({ ok: true, status: "publishable", planned: 5, made: 5,
            questions: [1, 2, 3, 4, 5].map((i) => ({ id: "q" + i, type: "single_choice",
              question: "問" + i, choices: ["ア", "イ", "ウ", "エ"], answer: "ア", explanation: "…" })) }) });
      });

      await page.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => !!window.VQSCAN, null, { timeout: 20000 })
        .catch(() => {});
      const ある = await page.evaluate(() => !!window.VQSCAN);
      見(ある, "★ スキャンの 部品が 読み込まれて いる");
      if (ある) {
        /* 3 枚 溜めて 読み取る（カメラの 無い ところ なので _足す で 入れる）。 */
        await page.evaluate(() => {
          const 白 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==";
          window.VQSCAN.開く({ 用途: "" });
          for (let i = 0; i < 3; i++) {
            window.VQSCAN._足す({ 種: "写真", 名: "p" + (i + 1) + ".jpg", dataUrl: 白, mime: "image/jpeg" });
          }
        });
        await page.waitForTimeout(1500);
        await page.evaluate(() => window.VQSCAN.読み取る());
        await page.waitForTimeout(1200);
        見(読み.回 >= 1, "★ 撮った ぶんを 読み取る", 読み);
        見(読み.枚 === 3, "3 枚 とも 読む", 読み.枚);

        /* 指示欄が 出て いるか */
        const 欄 = await page.evaluate(() => {
          const h = document.querySelector("[data-vqscan]");
          if (!h || !h.shadowRoot) return null;
          const t = h.shadowRoot.querySelector("#vqscan-p");
          const n = h.shadowRoot.querySelector("#vqscan-n");
          return { 指示欄: !!t, 数欄: !!n, 数: n ? n.value : "" };
        });
        見(欄 && 欄.指示欄, "★ **指示を 書く 欄が 画面に 出る**", 欄);
        見(欄 && 欄.数欄, "問題数の 欄も 出る", 欄 && 欄.数);

        /* 指示を 書いて「問題を作る」を 押す */
        await page.evaluate(() => {
          const h = document.querySelector("[data-vqscan]");
          const sr = h.shadowRoot;
          sr.querySelector("#vqscan-p").value = "3 ページ目の 表から 計算問題を 中心に。記述も 2 問。";
          sr.querySelector("#vqscan-n").value = "5";
          sr.querySelector('[data-go="quiz"]').click();
        });
        await page.waitForTimeout(1500);
        見(!!届, "作りに 行った", 届 ? Object.keys(届) : null);
        if (届) {
          見(/3 ページ目の 表から 計算問題/.test(String(届.prompt || "")),
            "★★ **書いた 指示が そのまま 届く**");
          見(/【資料の 本文】/.test(String(届.prompt || "")) && /光合成/.test(String(届.prompt || "")),
            "★★ **読み取った 文字が 届く**");
          見((届.files || []).length === 0,
            "★★ **絵は 1 枚も 送らない**（ここが 速さの 正体）", (届.files || []).length);
          見(Number(届.count) === 5, "問題数も 届く", 届.count);
        }
      }
      見(例外.length === 0, "画面の 例外 0 件", 例外);
      await browser.close();
    }
  }
  console.log("\n────────────────────────────────");
  console.log("  ok " + 済 + " / NG " + 落);
  if (落) { console.log("  落ちた: " + 落ち.join(" / ")); process.exit(1); }
})();
