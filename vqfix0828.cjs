#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   vqfix0828.cjs — 2026-08-28 の 訴え 4 件

   ① プリセット詳細の 並び替え（問題順・選択肢）を **覚える**
   ② 「オート」…選ぶだけの 形式で、選んだら すぐ 答え合わせ → 次へ
      ・アプリの設定「答えたらすぐ解説を出す」が 入っていれば そちらが 勝つ
      ・切れていれば 詳細画面の スイッチで 決める
      ・**まちがえたら 進まない**（2026-08-19 の 決めごとを 壊さない）
   ③ 並び替えたとき、記号が A・D・C・B と 飛ばない（上から ABCD）
   ④ モバイル下部バーの 真ん中が **クイズを作る** 丸い ＋ ボタン
      ・円の 色は テーマの アクセント（標準は ラベンダー）

   本物の 出来上がり（client/js・client/index.html）を そのまま 動かす。
   本番には 一切 触らない。
   ══════════════════════════════════════════════════════════════════════ */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright");

const 根 = __dirname;
let OK = 0, NG = 0;
const ok = (n, m) => { OK++; console.log("  OK  " + n + (m ? " … " + m : "")); };
const ng = (n, m) => { NG++; console.log("  NG  " + n + (m ? " … " + m : "")); };
const 見 = (n, c, m) => (c ? ok(n, m) : ng(n, m));

function 出来上がり(前) {
  const d = path.join(根, "client", "js");
  const f = fs.readdirSync(d).find((x) => new RegExp("^" + 前 + "\\.[0-9a-f]+\\.js$").test(x));
  if (!f) throw new Error("見つからない: " + 前);
  return fs.readFileSync(path.join(d, f), "utf8");
}

(async () => {
  const app = 出来上がり("vq2-app");
  const 索 = fs.readFileSync(path.join(根, "client", "index.html"), "utf8");
  const browser = await chromium.launch();
  const srv = http.createServer((q, s) => {
    s.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    s.end("<!doctype html><meta charset=utf-8><title>t</title><body>");
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const 港 = srv.address().port;

  /* ══ ③ 記号の 並び ══════════════════════════════════════════════ */
  console.log("── ③ 並び替えても 上から ABCD ─────────────────────────");
  {
    const p = await browser.newPage();
    const 例外 = [];
    p.on("pageerror", (e) => 例外.push(String(e).slice(0, 140)));
    await p.goto("http://127.0.0.1:" + 港 + "/");
    await p.addScriptTag({ content: app });
    await p.waitForTimeout(150);
    const r = await p.evaluate(() => {
      const R = window.VQ2.qrender;
      const q = {
        id: "q1", type: "multiple_choice_single", engine: "single_choice",
        modelVersion: (window.VQ2.qmodel || {}).MODEL_VERSION,
        prompt: "つぎの うち 正しいのは どれ？",
        choices: [
          { id: "c1", label: "A", text: "あ", isCorrect: true },
          { id: "c2", label: "B", text: "い" },
          { id: "c3", label: "C", text: "う" },
          { id: "c4", label: "D", text: "え" }
        ]
      };
      const 取る = (html) => {
        const d = document.createElement("div"); d.innerHTML = html;
        return [...d.querySelectorAll(".vq2-choice")].map((b) => ({
          記号: (b.querySelector(".vq2-choice-l") || {}).textContent || "",
          文: (b.querySelector(".vq2-choice-m") || {}).textContent || ""
        }));
      };
      const 素 = 取る(R.html(q, null, {}));
      /* わざと ばらばらの 並びを 渡す（C, A, D, B） */
      const 混 = 取る(R.html(q, null, { choiceOrder: ["c3", "c1", "c4", "c2"] }));
      /* 自分で 決めた 記号（ア・イ・ウ・エ）は 動かさない */
      const q2 = JSON.parse(JSON.stringify(q));
      ["ア", "イ", "ウ", "エ"].forEach((v, i) => { q2.choices[i].label = v; });
      const 和 = 取る(R.html(q2, null, { choiceOrder: ["c3", "c1", "c4", "c2"] }));
      return { 素, 混, 和 };
    });
    await p.close();
    見("そのままなら A B C D", r.素.map((x) => x.記号).join("") === "ABCD", r.素.map((x) => x.記号).join(""));
    見("**ばらばらでも 上から A B C D**", r.混.map((x) => x.記号).join("") === "ABCD",
      r.混.map((x) => x.記号).join(""));
    見("中身は ちゃんと 混ざっている", r.混.map((x) => x.文.trim().charAt(0)).join("") === "うあえい",
      r.混.map((x) => x.文.trim().charAt(0)).join(""));
    見("自分で 決めた 記号（ア・イ…）は 動かさない",
      r.和.map((x) => x.記号).join("") === "ウアエイ", r.和.map((x) => x.記号).join(""));
    見("赤い字なし", 例外.length === 0, 例外.slice(0, 2).join(" / "));
  }

  /* ══ ①② コードの 決めごと ═══════════════════════════════════════ */
  console.log("── ①② 覚える／オート ────────────────────────────────");
  {
    const 元 = fs.readFileSync(path.join(根, "js-src",
      fs.readdirSync(path.join(根, "js-src")).find((x) => x.startsWith("vq2-app."))), "utf8");
    const 設 = fs.readFileSync(path.join(根, "js-src",
      fs.readdirSync(path.join(根, "js-src")).find((x) => x.startsWith("vq-settings-store."))), "utf8");
    見("詳細で 変えたら 覚える", 元.indexOf("function 覚える(k) {") >= 0);
    見("覚える 先は アプリの設定（二重に 持たない）",
      /shuffleQ: "learn\.shuffleQ"[\s\S]{0,80}shuffleC: "learn\.shuffleC"/.test(元));
    見("アプリの設定が 勝つ ときは 書き戻さない",
      元.indexOf('if (k === "auto" && opt.autoは設定まかせ) return;') >= 0);
    見("オートの 決め方は 3 段（設定 → 詳細 → 設定）",
      /if \(pref\.instantExplain === true\) return true;[\s\S]{0,120}if \(o\.オート != null\) return !!o\.オート;/.test(元));
    見("オートは 選ぶだけの 形式だけ",
      /if \(オート && answered && autoAdvanceable\(q\) && !hidesAnswers\(\)\)/.test(元));
    見("**まちがえたら 進まない**（答え合わせは 出す）",
      /var 見せる = 出せる && \(進むはずだった \|\| \(オート && 決まる形式\)\);/.test(元));
    見("待っている あいだに 動いたら 進めない",
      元.indexOf("if (st.index !== いま) return;") >= 0);
    見("問題を 変えたら 自動送りを 止める",
      /function goto\(i\) \{[\s\S]{0,120}自動をやめる\(\);/.test(元));
    見("設定に オートが 載っている", 設.indexOf('id: "learn.autoStep"') >= 0);
    見("試験（答えを 伏せる）では オートを 使わない", /&& !hidesAnswers\(\)\)/.test(元));
  }

  /* ══ ①② 本物の 画面で 動かす ═════════════════════════════════════ */
  console.log("── ① 詳細画面の 切り替えを 覚える（本物の画面）─────────");
  {
    const p = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    const 例外 = [];
    p.on("pageerror", (e) => 例外.push(String(e).slice(0, 160)));
    await p.goto("http://127.0.0.1:" + 港 + "/");
    /* アプリの設定を すり替えて、書き戻しを 見張る */
    await p.evaluate(() => {
      window.__覚えた = [];
      window.__値 = {};
      window.__vqSet = {
        get: function (k) { return window.__値[k]; },
        set: function (k, v) { window.__値[k] = v; window.__覚えた.push([k, v]); }
      };
    });
    await p.addScriptTag({ content: app });
    await p.waitForTimeout(200);
    const r = await p.evaluate(async () => {
      const V = window.VQ2;
      if (!V.presetDetail) return { だめ: "詳細画面が 無い" };
      const 問 = (n) => ({ id: "q" + n, type: "multiple_choice_single", prompt: n + "問目",
        choices: [{ id: "a", label: "A", text: "あ", isCorrect: true }, { id: "b", label: "B", text: "い" }] });
      const preset = { id: "pd1", name: "検査", schemaVersion: 2, ownerId: "u", questions: [問(1), 問(2)] };
      const app2 = V.presetDetail.open({ preset: preset });
      if (!app2) return { だめ: "開けない" };
      const sh = document.getElementById("vq2-preset-detail").shadowRoot;
      await new Promise((r2) => setTimeout(r2, 250));
      const 押す = (k) => {
        const e = sh.querySelector('[data-key="' + k + '"]');
        if (!e) return false;
        e.checked = !e.checked;
        e.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      };
      const ある = {
        shuffleQ: !!sh.querySelector('[data-key="shuffleQ"]'),
        shuffleC: !!sh.querySelector('[data-key="shuffleC"]'),
        auto: !!sh.querySelector('[data-key="auto"]')
      };
      押す("shuffleQ"); 押す("shuffleC"); 押す("auto");
      return { ある, 覚えた: window.__覚えた.slice(), 値: window.__値 };
    });
    await p.close();
    if (r.だめ) ng("詳細画面を 開けた", r.だめ);
    else {
      見("3 つの 切り替えが 出ている",
        r.ある.shuffleQ && r.ある.shuffleC && r.ある.auto, JSON.stringify(r.ある));
      const 表 = Object.fromEntries(r.覚えた);
      見("問題順を **覚える**", 表["learn.shuffleQ"] === true, JSON.stringify(r.覚えた));
      見("選択肢の順を **覚える**", 表["learn.shuffleC"] === true, JSON.stringify(r.覚えた));
      見("オートも **覚える**", 表["learn.autoStep"] === true, JSON.stringify(r.覚えた));
    }
    見("赤い字なし", 例外.length === 0, 例外.slice(0, 2).join(" / "));
  }

  console.log("── ② オートを 本当に 動かす ──────────────────────────");
  {
    const 走る = async (オート) => {
      const p = await browser.newPage({ viewport: { width: 1200, height: 900 } });
      const 例外 = [];
      p.on("pageerror", (e) => 例外.push(String(e).slice(0, 160)));
      await p.goto("http://127.0.0.1:" + 港 + "/");
      await p.addScriptTag({ content: app });
      await p.waitForTimeout(200);
      const out = await p.evaluate(async (オート) => {
        const V = window.VQ2;
        const 問 = (n, 正) => ({ id: "q" + n, type: "multiple_choice_single", prompt: n + "問目",
          choices: ["a", "b", "c", "d"].map((k, i) =>
            ({ id: k, label: "ABCD"[i], text: "あいうえ"[i], isCorrect: k === 正 })) });
        const preset = { id: "p1", name: "検査", schemaVersion: 2, ownerId: "u",
          questions: [問(1, "a"), 問(2, "b"), 問(3, "c")] };
        const a = V.quizPlayer.open({ preset: preset, mode: "study", オート: オート, resume: false });
        if (!a) return { だめ: "開けない" };
        const sh = document.getElementById("vq2-quiz-player").shadowRoot;
        const 待 = (ms) => new Promise((r) => setTimeout(r, ms));
        const 番 = () => { try { return V.quizNow ? V.quizNow.index : -1; } catch (e) { return -1; } };
        const 答え合わせ中 = () => /正解|あなたの答え/.test(sh.textContent || "");
        const 押 = (id) => { const e = sh.querySelector('[data-qr-choice="' + id + '"]'); if (e) e.click(); };
        await 待(300);
        const 出 = { 最初: 番() };
        押("a");                       /* 1 問目 正解 */
        await 待(250); 出.正解直後 = { 番: 番(), 答: 答え合わせ中() };
        await 待(1500); 出.正解の1_75秒後 = 番();
        if (番() === 2) {
          押("a");                     /* 2 問目 まちがい */
          await 待(250); 出.誤答直後 = { 番: 番(), 答: 答え合わせ中() };
          await 待(1800); 出.誤答の2秒後 = 番();
        }
        return 出;
      }, オート);
      await p.close();
      return { out, 例外 };
    };

    const 入 = await 走る(true);
    if (入.out.だめ) ng("オートで 開けた", 入.out.だめ);
    else {
      見("正解を 選んだ その場で 答え合わせが 出る",
        入.out.正解直後 && 入.out.正解直後.答 === true, JSON.stringify(入.out.正解直後));
      見("**少し 見せてから 自動で 次へ**",
        入.out.正解の1_75秒後 === 2, "1 問目 → " + 入.out.正解の1_75秒後 + " 問目");
      見("まちがえたら 答え合わせは 出す",
        入.out.誤答直後 && 入.out.誤答直後.答 === true, JSON.stringify(入.out.誤答直後));
      見("**まちがえたら 進まない**", 入.out.誤答の2秒後 === 2,
        "2 問目 → " + 入.out.誤答の2秒後 + " 問目");
    }
    見("オートで 赤い字なし", 入.例外.length === 0, 入.例外.slice(0, 2).join(" / "));

    const 切 = await 走る(false);
    if (!切.out.だめ) {
      見("オートを 切れば 勝手に 進まない", 切.out.正解の1_75秒後 === 1,
        "1 問目 → " + 切.out.正解の1_75秒後 + " 問目");
    }
  }

  /* ══ ④ モバイル下部バー ═══════════════════════════════════════════ */
  console.log("── ④ モバイル下部バーの 真ん中 ───────────────────────");
  {
    /* index.html の <script id="vq-mobbar"> だけ 取り出して 動かす */
    const i = 索.indexOf('<script id="vq-mobbar">');
    const j = 索.indexOf("</script>", i);
    const 帯 = 索.slice(索.indexOf(">", i) + 1, j);
    const p = await browser.newPage({ viewport: { width: 390, height: 780 } });
    const 例外 = [];
    p.on("pageerror", (e) => 例外.push(String(e).slice(0, 140)));
    await p.goto("http://127.0.0.1:" + 港 + "/");
    await p.evaluate(() => {
      document.documentElement.style.setProperty("--vq-accent", "#756DB3");
      document.documentElement.style.setProperty("--vq-accent-contrast", "#ffffff");
      document.body.setAttribute("data-ui-v2", "1");
      document.body.setAttribute("data-app-tab", "home");
      /* 旧サイドバーの 受け口（押されたか 見る） */
      const bar = document.createElement("div"); bar.id = "appTabBar";
      bar.innerHTML = '<button data-app-tab="home"></button>'
        + '<button data-app-tab="library"></button>'
        + '<button data-app-tab="chat"></button>'
        + '<button data-app-tab="notifications"></button>'
        + '<button data-v2-action="create-quiz"></button>';
      document.body.appendChild(bar);
      window.__押した = [];
      bar.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
        window.__押した.push(b.getAttribute("data-app-tab") || b.getAttribute("data-v2-action"));
      }));
    });
    await p.addScriptTag({ content: 帯 });
    await p.waitForTimeout(400);
    const r = await p.evaluate(() => {
      const h = document.getElementById("vqMobBar");
      if (!h || !h.shadowRoot) return { だめ: "帯が 立たない" };
      const btns = [...h.shadowRoot.querySelectorAll(".t")];
      const mid = btns[2];
      const circle = mid ? mid.querySelector(".circle") : null;
      const cs = circle ? getComputedStyle(circle) : null;
      return {
        数: btns.length,
        並び: btns.map((b) => b.getAttribute("aria-label")),
        真ん中は丸: !!circle,
        記号: circle ? (circle.querySelector(".ms") || {}).textContent : "",
        色: cs ? cs.backgroundColor : "",
        字の色: cs ? cs.color : "",
        丸い: cs ? cs.borderRadius : "",
        大きさ: cs ? (cs.width + "×" + cs.height) : "",
        /* 丸を 入れても **帯の 高さは 変えない**（下の余白の 計算が ずれる） */
        帯の高さ: Math.round(h.getBoundingClientRect().height),
        行の高さ: btns.map((b) => Math.round(b.getBoundingClientRect().height))
      };
    });
    if (r.だめ) ng("下部バーが 立った", r.だめ);
    else {
      見("5 つ 並ぶ", r.数 === 5, String(r.数));
      見("真ん中は「クイズを作る」", r.並び[2] === "クイズを作る", JSON.stringify(r.並び));
      見("Quick Chat は 真ん中から 外れた", r.並び.indexOf("AI Chat") < 0, JSON.stringify(r.並び));
      見("真ん中は 円", r.真ん中は丸 && r.丸い === "50%", r.丸い);
      見("中は プラス", r.記号 === "add", r.記号);
      見("円の 色は テーマの アクセント（ラベンダー）",
        r.色 === "rgb(117, 109, 179)", r.色);
      見("プラスは 白", r.字の色 === "rgb(255, 255, 255)", r.字の色);
      見("大きさは 44×44", r.大きさ === "44px×44px", r.大きさ);
      見("丸を 入れても 帯の 高さは 変わらない（65px）", r.帯の高さ === 65, r.帯の高さ + "px");
      見("5 つとも 行の 高さは 同じ 52px",
        r.行の高さ.every((x) => x === 52), JSON.stringify(r.行の高さ));
      /* 押したら 作成の 受け口へ 行く */
      await p.evaluate(() => {
        const h = document.getElementById("vqMobBar");
        h.shadowRoot.querySelectorAll(".t")[2].click();
      });
      await p.waitForTimeout(120);
      const 押 = await p.evaluate(() => window.__押した.slice());
      見("押すと **クイズを作る** 受け口を 叩く",
        押.indexOf("create-quiz") >= 0, JSON.stringify(押));
      /* テーマの 色を 変えたら 円も 変わる */
      const 色2 = await p.evaluate(() => {
        document.documentElement.style.setProperty("--vq-accent", "#2F7D58");
        const h = document.getElementById("vqMobBar");
        return getComputedStyle(h.shadowRoot.querySelector(".circle")).backgroundColor;
      });
      見("テーマの 色を 変えると 円も 変わる", 色2 === "rgb(47, 125, 88)", 色2);
    }
    見("赤い字なし", 例外.length === 0, 例外.slice(0, 2).join(" / "));
    await p.close();
  }

  srv.close();
  await browser.close();
  console.log("\n合計 OK=" + OK + " NG=" + NG);
  process.exit(NG ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
