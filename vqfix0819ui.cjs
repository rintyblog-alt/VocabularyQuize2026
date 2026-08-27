/* ══════════════════════════════════════════════════════════════════════════
   vqfix0819ui.cjs — 2026-08-19 の直しを **画面で** 確かめる
     ① プリセット詳細の「目安の時間」に <label が 出ないこと
     ④ 問題の 複製ボタンが 実際に 1 問 増やすこと
     ⑤ 単語帳しか無いプリセットでも 新しいクイズ画面が 開くこと
   使い方: node vqfix0819ui.cjs
   ══════════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
let pass = 0, fail = 0; const 落ち = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ✅ " + n); }
  else { fail++; 落ち.push(n); console.log("  ❌ " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 500) : "")); }
};
const 節 = (t) => console.log("\n■ " + t);

(async () => {
  const b = await chromium.launch();
  try {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 950 } });
    await ctx.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    const page = await ctx.newPage();
    const 声 = [];
    page.on("pageerror", (e) => 声.push(String(e.message).slice(0, 200)));
    await page.goto(BASE + "/", { waitUntil: "load", timeout: 120000 });
    await page.waitForFunction(() => window.__vqLibsReady === true, null, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1800);

    /* ══ ① 目安の時間 ══════════════════════════════════════════════ */
    節("① プリセット詳細の「目安の時間」");
    const 目安 = await page.evaluate(async () => {
      const V = window.VQ2;
      const p = {
        id: "p_test_0819", schemaVersion: 2, name: "たしかめ用", description: "",
        visibility: "private", subjectId: "sub:english", subjects: [], tagIds: [], tags: [],
        appearance: {}, revision: 1,
        questions: [1, 2, 3, 4, 5].map((i) => ({
          id: "q" + i, questionNumber: i, schemaVersion: 2, type: "short_answer",
          prompt: "問題 " + i, choices: [], correctAnswer: "こたえ", acceptedAnswers: ["こたえ"],
          explanation: "", points: 1, difficulty: "normal", media: []
        }))
      };
      const app = V.presetDetail.open({ preset: p, presetId: p.id,
        card: { id: p.id, title: "たしかめ用", questionCount: 5, estimatedMinutes: 12, countUnit: "問" } });
      await new Promise((r) => setTimeout(r, 500));
      const host = document.getElementById("vq2-preset-detail");
      const sr = host && host.shadowRoot;
      const el = sr && sr.querySelector(".vq2-pd-stats");
      const 出 = { あった: !!el, 字: el ? el.textContent.replace(/\s+/g, " ").trim() : "" };
      try { app.close("test"); } catch (e) {}
      return 出;
    });
    ok("大きい枠が 出ている", 目安.あった, 目安);
    ok("「約 12 分」と 出ている", /約\s*12\s*分/.test(目安.字), 目安.字);
    ok("<label が 剥き出しで 出ていない", 目安.字.indexOf("<label") < 0 && 目安.字.indexOf("vq2-pd-opt") < 0, 目安.字);
    ok("目安の時間、という 名前も 出ている", 目安.字.indexOf("目安の時間") >= 0, 目安.字);

    /* ══ ④ 問題の 複製 ══════════════════════════════════════════════ */
    節("④ 問題の 複製");
    const 複製 = await page.evaluate(async () => {
      const V = window.VQ2;
      const p = {
        id: "p_dup_0819", schemaVersion: 2, name: "複製ためし", description: "",
        visibility: "private", subjectId: "sub:english", subjects: [], tagIds: [], tags: [],
        appearance: {}, revision: 1,
        questions: [1, 2].map((i) => ({
          id: "q" + i, questionNumber: i, schemaVersion: 2, type: "short_answer",
          prompt: "もんだい " + i, choices: [], correctAnswer: "こたえ" + i,
          acceptedAnswers: ["こたえ" + i], explanation: "", points: 1, difficulty: "normal", media: []
        }))
      };
      V.presetStudio.open({ preset: p, startAt: "editor" });
      await new Promise((r) => setTimeout(r, 900));
      const host = document.getElementById("vq2-preset-studio");
      const sr = host && host.shadowRoot;
      if (!sr) return { だめ: "画面が 出ない" };
      const 数える = () => sr.querySelectorAll(".vq2-qcard[data-qid]").length;
      const 前 = 数える();
      const btn = sr.querySelector('[data-act="dup-row"]');
      if (!btn) return { だめ: "複製ボタンが 無い", 前 };
      /* 開閉が 起きないことも 見る */
      const 開く前 = sr.querySelectorAll(".vq2-qcard.is-open").length;
      btn.click();
      await new Promise((r) => setTimeout(r, 500));
      const 後 = 数える();
      const 文 = Array.from(sr.querySelectorAll(".vq2-item-t")).map((x) => x.textContent.trim());
      return { 前, 後, 文, 開く前 };
    });
    ok("複製ボタンが 一覧の行に ある", !複製.だめ, 複製);
    ok("押すと 1 問 増える（" + 複製.前 + " → " + 複製.後 + "）", 複製.後 === 複製.前 + 1, 複製);
    ok("中身が 同じものが 増えている",
      Array.isArray(複製.文) && 複製.文.filter((x) => x === "もんだい 1").length === 2, 複製.文);

    /* ══ ⑤ 単語帳しか無いものでも 新しいクイズ画面 ══════════════════ */
    節("⑤ 一覧からの 開始（単語帳しか 無いもの）");
    const 開始 = await page.evaluate(async () => {
      /* 本体が「単語しか持っていない」プリセットを 返す状況を 作る。
         **本番と同じ口**（__vqPresetSource）に 差し込む。 */
      const 元 = window.__vqPresetSource;
      window.__vqPresetSource = function (pid) {
        if (String(pid) !== "eiken:test") return 元 ? 元(pid) : null;
        return { id: "eiken:test", official: true, name: "収録教材ためし", subjectId: "sub:english",
                 cards: [], words: [
                   { id: 1, word: "apple", meaning: "りんご" },
                   { id: 2, word: "book", meaning: "本" },
                   { id: 3, word: "cat", meaning: "ねこ" }
                 ] };
      };
      const V = window.VQ2;
      const v1 = window.__vqPresetSource("eiken:test");
      const v2 = V.adapter.presetToV2(v1, {});
      const 出 = { 問数: (v2.questions || []).length,
                   型: (v2.questions || []).map((q) => q.type),
                   答: (v2.questions || []).map((q) => q.correctAnswer) };
      /* 実際に 新しいクイズ画面が 開くか */
      V.quizPlayer.open({ preset: v2, mode: "practice", resume: false });
      await new Promise((r) => setTimeout(r, 900));
      const 新 = document.getElementById("vq2-quiz-player");
      出.新画面 = !!(新 && 新.shadowRoot);
      出.文字 = 新 && 新.shadowRoot ? 新.shadowRoot.textContent.replace(/\s+/g, " ").slice(0, 160) : "";
      /* 古い画面（EXAM のモーダル）が 出ていないこと */
      const 古 = document.getElementById("appExamSetupModal") || document.getElementById("appQuizModal");
      出.古画面 = !!(古 && getComputedStyle(古).display !== "none");
      try { 新.__vq2.close("test"); } catch (e) {}
      window.__vqPresetSource = 元;
      return 出;
    });
    ok("単語 3 つが 3 問に なった", 開始.問数 === 3, 開始);
    ok("答えが 引き継がれている", JSON.stringify(開始.答) === JSON.stringify(["りんご", "本", "ねこ"]), 開始.答);
    ok("新しいクイズ画面が 開いた", 開始.新画面 === true, 開始);
    ok("昔のモーダルは 出ていない", 開始.古画面 === false, 開始);

    /* ══ ⑦ showApp を **本番と同じ口**で 呼ぶ ═══════════════════════ */
    節("⑦ Lumi の showApp（会話を通さずに 同じ口を 叩く）");
    const 良 = await page.evaluate(async () => {
      const r = await window.__vqLive.道具("showApp", {
        title: "1 次関数",
        html: '<p>傾きを 動かしてみて</p><input id="s" type="range" min="-5" max="5" value="1">'
            + '<canvas id="c" width="280" height="180"></canvas>',
        js: 'var c=document.getElementById("c").getContext("2d");'
          + 'function d(){var a=+document.getElementById("s").value;c.clearRect(0,0,280,180);'
          + 'c.beginPath();c.moveTo(0,90-a*70);c.lineTo(280,90+a*70);c.stroke();}'
          + 'document.getElementById("s").oninput=d;d();'
      });
      const n = document.getElementById("vqLiveNote");
      const r2 = n ? n.getBoundingClientRect() : null;
      return { r, 板: !!n,
               /* ★ クラス名は namespace 付き。"app" は 本体の CSS と ぶつかる
                  （2026-08-19・実測で 板が 丸ごと 消えた）。 */
               印: n ? n.classList.contains("vqn-appmode") : false,
               古い印: n ? n.classList.contains("app") : false,
               見えている: n ? getComputedStyle(n).display !== "none" : false,
               幅: r2 ? Math.round(r2.width) : 0,
               枠: !!(n && n.querySelector(".vqn-app iframe")),
               帯: n && n.querySelector("[data-appmsg]") ? n.querySelector("[data-appmsg]").textContent.trim() : "" };
    });
    ok("動いた、と 返る", !!(良.r && 良.r.やった), 良.r);
    ok("板が 動くもの用に 広がっている（見えていて 広い）",
      良.板 && 良.印 && 良.見えている && 良.幅 > 600, 良);
    ok("本体と ぶつかる名前（app）を 使っていない", 良.古い印 === false, 良);
    ok("中に 枠が 出ている", 良.枠, 良);
    ok("帯が「動いています」に なっている", /動いています/.test(良.帯), 良.帯);
    ok("コードを 読み上げるな、と 返している", /読み上げないでください/.test(String(良.r && 良.r.つぎ)), 良.r);

    const 悪 = await page.evaluate(() =>
      window.__vqLive.道具("showApp", { title: "こわれ", js: "これは.わざと(壊す)" }));
    ok("壊れたら だめ、と 返る", !!(悪 && 悪.だめ), 悪);
    ok("壊れた理由が そのまま 返る", /is not defined/.test(String(悪 && 悪.エラー)), 悪);
    ok("もう一度 呼べ、と 書いてある", /もう一度 showApp を 呼んで/.test(String(悪 && 悪.直しかた)), 悪);

    const 空2 = await page.evaluate(() => window.__vqLive.道具("showApp", {}));
    ok("中身が 無ければ 何もしない", /何もしていません/.test(String(空2 && 空2.だめ)), 空2);

    /* ★ **勝手に 残さなくなった**（2026-08-19・訴え
       「AR Board は、ユーザーが 保存した時だけ 一覧に 追加しよう」）。
       前は 出した瞬間に 一覧へ 入っていたので、試しに 出したものまで
       全部 溜まり、要るものが 埋もれていた。
       いまは 見出しの 右の 保存ボタンを 押したときだけ 入る。 */
    const 残 = await page.evaluate(async () => {
      await new Promise((x) => setTimeout(x, 700));
      const 前 = window.VQB.store.一覧().length;
      /* 保存ボタンを 押す → そこで はじめて 入る */
      const d = document.getElementById("vqLiveNote");
      const b = d && d.querySelector(".vqn-s");
      if (b) b.click();
      await new Promise((x) => setTimeout(x, 700));
      const 後 = window.VQB.store.一覧().map((x) => ({ t: x.title, k: x.kind }));
      window.VQB.store.全消し();
      return { 前, 後 };
    });
    ok("★ 出しただけでは AR Board に 入らない", 残.前 === 0, 残);
    ok("保存ボタンを 押すと 入る（動くものとして）",
      残.後.length === 1 && 残.後[0].k === "app" && 残.後[0].t === "1 次関数", 残);

    ok("ここまでで 例外が 出ていない（" + 声.length + " 件）", 声.length === 0, 声.slice(0, 6));
    await ctx.close();
  } finally { await b.close(); }

  console.log("\n════════════════════════════════════════════════════════");
  console.log("  合計 " + (pass + fail) + " 件 / 通った " + pass + " / 落ちた " + fail);
  if (落ち.length) { console.log("  落ちたもの:"); 落ち.forEach((x) => console.log("   - " + x)); }
  console.log("════════════════════════════════════════════════════════");
  process.exit(fail ? 1 : 0);
})();
