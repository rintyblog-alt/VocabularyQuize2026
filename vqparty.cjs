/* ══════════════════════════════════════════════════════════════════════════
   vqparty — **みんなで解く**（2026-09-10・訴え）

   訴え「他のユーザーとカフートのように、部屋（PINコード6桁 V から始まる）を
        作って、それを入力し、ユーザーのニックネームを設定したら始まる仕組みに」

   ★ **本物の 画面を 3 枚 開いて 通す。**
     WebSocket を 直に 叩く 検査だけでは「画面側の 道が 繋がって いるか」が
     分からない（vqsurvive2p.cjs の 但し書きと 同じ）。

   使いかた: node vqparty.cjs [--base https://www.vocabuquiz.app]
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const { chromium } = require("playwright");
const 引 = process.argv.slice(2);
const 値 = (k, d) => { const i = 引.indexOf(k); return i >= 0 && 引[i + 1] ? 引[i + 1] : d; };
const BASE = 値("--base", process.env.VQ_BASE || "https://www.vocabuquiz.app");
const 名 = process.env.VQ_USER || "lg7358830806";
const 合 = process.env.VQ_PASS || "DevAcc#2026a";
const 待 = (ms) => new Promise((r) => setTimeout(r, ms));

let ok = 0, ng = 0;
const 見る = (題, 合格, 中身) => {
  if (合格) { ok++; console.log("  ok   " + 題 + (中身 ? "  → " + 中身 : "")); }
  else { ng++; console.log("  NG   " + 題 + (中身 ? "  → " + 中身 : "")); }
};

const 問 = [
  { id: "q1", type: "single_choice", question: "日本の首都は？", choices: ["大阪", "東京", "京都", "札幌"], answer: 1 },
  { id: "q2", type: "true_false", question: "水は 100℃ で 沸騰する。", answer: true },
  { id: "q3", type: "text_input", question: "H2O の 日本語名は？", answer: ["水"] }
];

(async () => {
  const b = await chromium.launch();
  const 例外 = [];
  const 開く = async (だれ, w) => {
    const p = await b.newPage({ viewport: w || { width: 1280, height: 860 } });
    p.on("pageerror", (e) => 例外.push(だれ + ": " + String(e).slice(0, 140)));
    await p.addInitScript(() => { try { localStorage.setItem("vq.install.hide.v1", "1"); } catch (e) {} });
    await p.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 90000 });
    await p.waitForFunction(() => window.__vqParty && window.__vqParty.入る, { timeout: 90000 });
    try { await p.click("text=スキップ", { timeout: 2500 }); } catch (e) {}
    await 待(500);
    return p;
  };

  console.log("【みんなで解く】" + BASE + "\n");
  const T = await 開く("先生");
  const A = await 開く("生徒A", { width: 390, height: 840 });
  const B2 = await 開く("生徒B", { width: 390, height: 840 });
  見る("3 枚とも __vqParty が ある", true);

  /* ① 部屋を 作る */
  const pin = await T.evaluate(async ({ qs, 名, 合 }) => {
    const l = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gradePrefix: "H1", nickname: 名, password: 合 }) }).then((r) => r.json());
    if (!l.token) return "ログイン不可";
    localStorage.setItem("wordPractice400.auth.token", l.token);
    window.__vqParty.作る({ id: "t1", title: "検査", questions: qs });
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 300));
      const h = document.querySelector("#vqPartyOverlay");
      const t = h && h.shadowRoot.querySelector(".vql-code");
      if (t && t.textContent.trim()) return t.textContent.trim();
    }
    return "出ない";
  }, { qs: 問, 名, 合 });
  /* ★ PIN は **V で 始まる 6 文字**。見まちがえない 字だけ。 */
  見る("★ PIN が V で 始まる 6 文字", /^V[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/.test(pin), pin);
  if (!/^V/.test(pin)) { 終わる(b, 例外); return; }

  /* ② 入る（ログインして いない 端末から） */
  const 入る = async (p, n) => {
    await p.evaluate(() => window.__vqParty.入る());
    await 待(500);
    await p.evaluate(({ pin, n }) => {
      const sh = document.querySelector("#vqPartyOverlay").shadowRoot;
      const a = sh.querySelector("[data-pin]"), b3 = sh.querySelector("[data-nick]");
      a.value = pin; a.dispatchEvent(new Event("input", { bubbles: true }));
      b3.value = n; sh.querySelector("[data-join]").click();
    }, { pin, n });
    await 待(1800);
  };
  await 入る(A, "りんと"); await 入る(B2, "はると");
  const 生 = await A.evaluate(() => {
    const h = document.querySelector("#vqPartyOverlay");
    return h ? h.shadowRoot.querySelector(".vql-card").textContent.replace(/\s+/g, " ").slice(0, 40) : "なし";
  });
  見る("★ ログインせずに 入れる（生徒の ロビー）", 生.indexOf("入りました") === 0, 生);
  const 人 = await T.evaluate(() => document.querySelector("#vqPartyOverlay").shadowRoot.querySelectorAll(".vql-p").length);
  見る("先生の ロビーに 2 人 出る", 人 === 2, String(人) + " 人");

  /* ③ 始める */
  await T.evaluate(() => document.querySelector("#vqPartyOverlay").shadowRoot.querySelector("[data-start]").click());
  await 待(2400);
  const 面 = (p) => p.evaluate(() => {
    const h = document.querySelector("#vqPartyStage");
    if (!h) return null;
    const sh = h.shadowRoot;
    return { q: (sh.querySelector(".vqls-q") || {}).textContent,
      選: sh.querySelectorAll("[data-ch]").length,
      帯: sh.querySelectorAll(".vqlb-i").length,
      見出し: (sh.querySelector(".vqls-h") || {}).textContent };
  });
  const mT = await 面(T), mA = await 面(A);
  見る("★ 全員に 同じ 問題が 出る", !!mT && !!mA && mT.q === mA.q, mT && mT.q);
  見る("選択肢が 4 つ", mA && mA.選 === 4, mA && String(mA.選));
  見る("帯に 2 人 並ぶ", mA && mA.帯 === 2, mA && String(mA.帯));
  見る("総数が 出る（1/? に ならない）", !!mT && mT.見出し.indexOf("/ ?") < 0 && mT.見出し.indexOf("/?") < 0, mT && mT.見出し.slice(0, 24));

  /* ④ 答えが 混ざって いないか（**いちばん 大事**） */
  const 漏 = await A.evaluate(() => {
    const s = JSON.stringify((window.__vqParty.いま() || {}).q || {});
    return { answer: s.indexOf('"answer"') >= 0, expl: s.indexOf('"explanation"') >= 0 };
  });
  見る("★★ 配られた 問題に answer が 無い", !漏.answer);
  見る("★★ 配られた 問題に 解説が 無い", !漏.expl);

  /* ⑤ 見せる → 色の 点 → 回答 */
  await A.evaluate(() => document.querySelector("#vqPartyStage").shadowRoot.querySelector("[data-share]").click());
  await 待(600);
  await A.evaluate(() => document.querySelector("#vqPartyStage").shadowRoot.querySelectorAll("[data-ch]")[1].click());
  await 待(1300);
  const 見え = await T.evaluate(() => {
    const sh = document.querySelector("#vqPartyStage").shadowRoot;
    return { 点: sh.querySelectorAll("[data-dot] i").length,
      帯: [...sh.querySelectorAll(".vqlb-i")].map((x) => x.textContent.replace(/\s+/g, " ")) };
  });
  見る("★ 見せた 人の 回答が 色の 点で 出る", 見え.点 >= 1, JSON.stringify(見え.点));
  見る("★ 見せた 人は アイコンが 外れて 答えが 出る", /B/.test(見え.帯[0] || ""), JSON.stringify(見え.帯));
  見る("★ 見せて いない 人は アイコンの まま", /はる/.test(見え.帯[1] || ""), JSON.stringify(見え.帯[1]));

  /* ⑥ 採点と 順位 */
  await B2.evaluate(() => document.querySelector("#vqPartyStage").shadowRoot.querySelectorAll("[data-ch]")[0].click());
  await 待(2200);
  const 結 = await A.evaluate(() => {
    const sh = document.querySelector("#vqPartyStage").shadowRoot;
    return { 正誤: ((sh.querySelector(".vqls-rv") || {}).textContent || "").replace(/\s+/g, " "),
      順位: ((sh.querySelector(".vqls-rank") || {}).textContent || "").replace(/\s+/g, " ") };
  });
  見る("★ 正解に 点が 入る", /正解！ \+\d+ 点/.test(結.正誤), 結.正誤.slice(0, 40));
  見る("★ 順位が 出る", /1\. /.test(結.順位), 結.順位.slice(0, 50));

  /* ⑦ 次の 問題 */
  await T.evaluate(() => {
    const sh = document.querySelector("#vqPartyStage").shadowRoot;
    [...sh.querySelectorAll("[data-host]")].filter((x) => x.getAttribute("data-host") === "next")[0].click();
  });
  await 待(1600);
  const 次 = await A.evaluate(() => (document.querySelector("#vqPartyStage").shadowRoot.querySelector(".vqls-q") || {}).textContent);
  見る("次の 問題へ 進む", /沸騰/.test(次 || ""), 次);

  見る("画面の 例外 0 件", 例外.length === 0, 例外.join(" / ").slice(0, 160));
  終わる(b, 例外);
})();

function 終わる(b, 例外) {
  console.log("\n────────────────────────────────");
  console.log("  ok " + ok + " / NG " + ng);
  b.close().then(() => process.exit(ng ? 1 : 0));
}
