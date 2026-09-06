/* ══════════════════════════════════════════════════════════════════════════
   vqresume.cjs — クイズの 中断と 再開／一覧の 進みの 棒（2026-09-03・訴え）

   訴え「クイズを いつでも 中断して、再開できるように して欲しい。
         あと 進捗を、YouTube の 再生バーのように、プリセット一覧の
         プリセットの 表示の ところに 出して欲しい。
         解いた 問題数を 再生時間みたいに 一覧の ここの プリセットに 出す 仕組み」

   直す前:
     ★ 出るときの 問いは「ここまでの 回答は 保存され、次回 続きから 再開できます」
       と 言いながら、記録を **abandoned** へ 送っていた。
       再開の 判定は ["in_progress","paused","ready"] だけで、
       abandoned は QUIZ_TRANSITIONS の 行き止まり。
       ＝ **保存されるが 二度と 開かれない**。一度も 続きから 開けなかった。
     ★ 一覧には 進みが 一切 出ていなかった（棒も 数も 無い）。

   使い方: node vqresume.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const { chromium } = require("playwright");

let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 220) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 340) : "")); }
};
const 待 = (ms) => new Promise((s) => setTimeout(s, ms));
const j = (r) => r.json().catch(() => ({}));

async function 札() {
  const 印 = Date.now().toString(36) + Math.floor(Math.random() * 9999);
  const H = { "Content-Type": "application/json" };
  const r = await fetch(BASE + "/api/auth/register/start", { method: "POST", headers: H,
    body: JSON.stringify({ email: "vqz" + 印 + "@gmail.com", gradePrefix: "H2",
      nickname: ("z" + 印).slice(0, 14), password: "Passw0rd!z3" }) }).then(j);
  const v = await fetch(BASE + "/api/auth/register/verify", { method: "POST", headers: H,
    body: JSON.stringify({ challengeId: r.challengeId, code: r.devCode }) }).then(j);
  const c = await fetch(BASE + "/api/auth/register/consent", { method: "POST", headers: H,
    body: JSON.stringify({ registrationSession: v.registrationSession, agreeTerms: true,
      agreePrivacy: true, agreeAge: true, pin: "1379" }) }).then(j);
  if (!c.token) throw new Error("札が 取れない");
  return c.token;
}

/* 影の DOM を またいで 探す。 */
const 探す = (sel) => `(function(){
  var 出 = [];
  var 潜 = function (n) {
    if (!n) return;
    if (n.querySelectorAll) Array.prototype.forEach.call(n.querySelectorAll(${JSON.stringify(sel)}), function (x) { 出.push(x); });
    var ら = n.querySelectorAll ? n.querySelectorAll("*") : [];
    Array.prototype.forEach.call(ら, function (x) { if (x.shadowRoot) 潜(x.shadowRoot); });
  };
  潜(document);
  return 出;
})()`;

(async () => {
  console.log("測る先:", BASE);
  const tok = await 札();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 940 } });
  const page = await ctx.newPage();
  const 例外 = [];
  page.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 200)));
  await page.addInitScript((t) => {
    try {
      localStorage.setItem("app.auth.token.v1", t);
      localStorage.setItem("app.auth.mode.v1", "user");
    } catch (e) {}
  }, tok);
  await page.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!(window.VQ2 && window.VQ2.quizPlayer && window.VQ2.store
    && window.VQ2.library), null, { timeout: 60000 });
  const 覆いを消す = () => page.evaluate(() => {
    ["vqLumiTour", "vqTour", "vqInstall", "vqNewsFlash", "vqPin"].forEach((id) => {
      const e = document.getElementById(id); if (e) e.remove();
    });
  });
  await 覆いを消す();

  /* ── 5 問の プリセットを 置く ── */
  await page.evaluate(() => {
    const S = window.VQ2.schema;
    const q = (i) => ({
      id: "rz-q" + i, schemaVersion: S.SCHEMA_VERSION, number: i,
      type: "multiple_choice_single", engine: "single_choice",
      prompt: "設問 " + i + "。正しい ものを 選びなさい。",
      promptRichText: null, media: [], contentBlocks: [],
      choices: [{ id: "c1", text: "あ", isCorrect: true }, { id: "c2", text: "い" },
                { id: "c3", text: "う" }, { id: "c4", text: "え" }],
      correctAnswer: null, acceptedAnswers: [], explanation: "解説。",
      choiceExplanations: null, points: 1, criterionAllocation: null, scoringRubric: null,
      estimatedSeconds: 30, difficulty: "normal", topic: "単元", tags: [],
      sourceReferences: [], requiresReview: false, confidence: null, validationIssues: []
    });
    const preset = {
      id: "rz-p", schemaVersion: S.SCHEMA_VERSION, name: "中断のたしかめ", description: "",
      ownerId: "", subjects: ["歴史"], tags: [], visibility: "private",
      appearance: { icon: "", iconImage: "", banner: "" },
      questions: [q(1), q(2), q(3), q(4), q(5)],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    window.VQ2.store.savePreset(preset, {});
    window.__rzPreset = preset;
  });

  節("① 2 問 解いて 中断する");
  await page.evaluate(() => window.VQ2.quizPlayer.open({ preset: window.__rzPreset, mode: "practice" }));
  await 待(2200);
  await 覆いを消す();

  /* 2 問 答える（本物の click → 次へ） */
  for (let n = 0; n < 2; n++) {
    await page.evaluate((sel) => {
      const 潜 = (root, out) => {
        Array.prototype.forEach.call(root.querySelectorAll("*"), (x) => {
          if (x.shadowRoot) { Array.prototype.forEach.call(x.shadowRoot.querySelectorAll(sel), (y) => out.push(y)); 潜(x.shadowRoot, out); }
        });
      };
      const out = []; 潜(document, out);
      if (out[0]) out[0].click();
    }, ".vq2-choice");
    await 待(450);
    await page.evaluate(() => {
      const 潜 = (root, out) => {
        Array.prototype.forEach.call(root.querySelectorAll("*"), (x) => {
          if (x.shadowRoot) {
            Array.prototype.forEach.call(x.shadowRoot.querySelectorAll('[data-act="next"]'), (y) => out.push(y));
            潜(x.shadowRoot, out);
          }
        });
      };
      const out = []; 潜(document, out);
      if (out[0]) out[0].click();
    });
    await 待(600);
  }
  await 待(1400);                              /* 保存は 少し 遅らせて 書く */
  const 済数 = await page.evaluate(() => {
    const s = window.VQ2.store.quizzes.list().filter((x) => x.presetId === "rz-p")[0];
    return s ? { 状態: s.state, 済: (s.answers || []).filter((a) => a && a.value != null && a.value !== "").length,
                 全: (s.questionOrder || []).length } : null;
  });
  見(!!済数 && 済数.済 === 2, "2 問 答えられた", 済数);

  /* 中断（× を 押す → 「中断する」） */
  await page.evaluate(() => {
    const 潜 = (root, out) => {
      Array.prototype.forEach.call(root.querySelectorAll("*"), (x) => {
        if (x.shadowRoot) {
          Array.prototype.forEach.call(x.shadowRoot.querySelectorAll('[data-act="exit"]'), (y) => out.push(y));
          潜(x.shadowRoot, out);
        }
      });
    };
    const out = []; 潜(document, out);
    if (out[0]) out[0].click();
  });
  await 待(700);
  const 窓の文 = () => page.evaluate(() => {
    const 出 = [];
    const 潜 = (root) => {
      Array.prototype.forEach.call(root.querySelectorAll("*"), (x) => {
        if (!x.shadowRoot) return;
        Array.prototype.forEach.call(x.shadowRoot.querySelectorAll("button"), (b) => {
          const t = (b.textContent || "").trim();
          if (t) 出.push("[btn]" + t);
        });
        /* ★ shadowRoot.textContent は **<style> の 中身まで** 拾う。
           SHELL_CSS が 丸ごと 入るので、何も 読めない（実測）。
           見出しと 本文の 部品だけを 読む。 */
        Array.prototype.forEach.call(
          x.shadowRoot.querySelectorAll(".vq2-dlg, [role='dialog'], .vq2-dlg-t, .vq2-dlg-b, .vq2-sheet"),
          (d) => {
            const t = (d.textContent || "").replace(/\s+/g, " ").trim();
            if (t) 出.push(t.slice(0, 240));
          });
        潜(x.shadowRoot);
      });
    };
    潜(document);
    return 出;
  });
  const 問 = await 窓の文();
  見(問.some((t) => /中断しますか/.test(t)), "★ 出るときの 問いが「中断」に なっている",
    問.filter((t) => !/^\[btn\]/.test(t)).slice(0, 1));
  見(問.some((t) => /2 \/ 5 問/.test(t)), "★ どこまで 解いたかを 数で 言う",
    問.filter((t) => !/^\[btn\]/.test(t)).slice(0, 1));
  見(問.indexOf("[btn]中断する") >= 0, "★ ボタンが「中断する」", 問.filter((t) => /^\[btn\]/.test(t)).slice(0, 4));

  await page.evaluate(() => {
    const 潜 = (root, out) => {
      Array.prototype.forEach.call(root.querySelectorAll("*"), (x) => {
        if (x.shadowRoot) { Array.prototype.forEach.call(x.shadowRoot.querySelectorAll("button"), (y) => out.push(y)); 潜(x.shadowRoot, out); }
      });
    };
    const out = []; 潜(document, out);
    const b = out.filter((x) => /^中断する$/.test((x.textContent || "").trim()))[0];
    if (b) b.click();
  });
  await 待(1200);

  節("② 記録が **続きから 開ける 形**で 残る");
  const 残 = await page.evaluate(() => {
    const s = window.VQ2.store.quizzes.list().filter((x) => x.presetId === "rz-p")[0];
    return s ? { 状態: s.state, 済: (s.answers || []).filter((a) => a && a.value != null && a.value !== "").length } : null;
  });
  見(!!残 && 残.状態 === "paused", "★ 状態は paused（前は abandoned で 二度と 開けなかった）", 残);
  見(!!残 && 残.済 === 2, "答えた ぶんが 残る", 残);
  const 開ける = await page.evaluate(() => {
    /* 再開の 判定と 同じ ものさしで 見る */
    return window.VQ2.store.quizzes.list().filter((x) =>
      x.presetId === "rz-p" && ["in_progress", "paused", "ready"].indexOf(x.state) >= 0).length;
  });
  見(開ける === 1, "★ 再開の ものさしに かかる", 開ける);

  節("③ もう一度 開くと「続きから」を 聞かれる");
  await page.evaluate(() => window.VQ2.quizPlayer.open({ preset: window.__rzPreset, mode: "practice" }));
  await 待(1800);
  await 覆いを消す();
  const 問2 = await 窓の文();
  見(問2.some((t) => /前回の続きから始めますか/.test(t)), "★ 「前回の続きから始めますか」が 出る",
    問2.filter((t) => !/^\[btn\]/.test(t)).slice(0, 1));
  見(問2.some((t) => /2 \/ 5 問回答済み/.test(t)), "★ 2 / 5 問まで 解いたと 出る",
    問2.filter((t) => !/^\[btn\]/.test(t)).slice(0, 1));

  /* 続きから を 押す */
  await page.evaluate(() => {
    const 潜 = (root, out) => {
      Array.prototype.forEach.call(root.querySelectorAll("*"), (x) => {
        if (x.shadowRoot) { Array.prototype.forEach.call(x.shadowRoot.querySelectorAll("button"), (y) => out.push(y)); 潜(x.shadowRoot, out); }
      });
    };
    const out = []; 潜(document, out);
    const b = out.filter((x) => /^続きから$/.test((x.textContent || "").trim()))[0];
    if (b) b.click();
  });
  await 待(1600);
  const 続 = await page.evaluate(() => {
    const s = window.VQ2.store.quizzes.list().filter((x) => x.presetId === "rz-p")[0];
    const 潜 = (root, out) => {
      Array.prototype.forEach.call(root.querySelectorAll("*"), (x) => {
        if (x.shadowRoot) { Array.prototype.forEach.call(x.shadowRoot.querySelectorAll(".vq2-top-sub, .vq2-head"), (y) => out.push(y)); 潜(x.shadowRoot, out); }
      });
    };
    const out = []; 潜(document, out);
    return { 状態: s ? s.state : null, 済: s ? (s.answers || []).filter((a) => a && a.value != null && a.value !== "").length : -1,
             見出し: out.map((x) => (x.textContent || "").replace(/\s+/g, " ").slice(0, 80))[0] || "" };
  });
  見(続.状態 === "in_progress", "★ 続きから 入ると 走っている 状態へ 戻る", 続);
  見(続.済 === 2, "★ 答えた 2 問は 消えていない", 続);

  節("④ 一覧に 進みの 棒が 出る（YouTube のように）");
  const 進 = await page.evaluate(() => {
    const L = window.VQ2.library;
    return L && L.progressOf ? L.progressOf("rz-p") : null;
  });
  見(!!進 && 進.answered === 2 && 進.total === 5, "★ 進みを 引ける（2 / 5）", 進);

  /* 画面を 閉じて 一覧へ */
  await page.evaluate(() => {
    const 潜 = (root, out) => {
      Array.prototype.forEach.call(root.querySelectorAll("*"), (x) => {
        if (x.shadowRoot) { Array.prototype.forEach.call(x.shadowRoot.querySelectorAll('[data-act="exit"]'), (y) => out.push(y)); 潜(x.shadowRoot, out); }
      });
    };
    const out = []; 潜(document, out);
    if (out[0]) out[0].click();
  });
  await 待(600);
  await page.evaluate(() => {
    const 潜 = (root, out) => {
      Array.prototype.forEach.call(root.querySelectorAll("*"), (x) => {
        if (x.shadowRoot) { Array.prototype.forEach.call(x.shadowRoot.querySelectorAll("button"), (y) => out.push(y)); 潜(x.shadowRoot, out); }
      });
    };
    const out = []; 潜(document, out);
    const b = out.filter((x) => /^中断する$/.test((x.textContent || "").trim()))[0];
    if (b) b.click();
  });
  await 待(1200);

  /* 一覧の 札を 直接 作って 測る（画面の 並びに 頼らない） */
  const 札の中身 = await page.evaluate(() => {
    const L = window.VQ2.library;
    const c = L.emptyCard();
    c.id = "rz-p"; c.title = "中断のたしかめ"; c.questionCount = 5;
    c.progress = L.progressOf("rz-p");
    return c.progress;
  });
  見(!!札の中身 && 札の中身.answered === 2, "札に 進みが 乗る", 札の中身);

  /* ★ 一覧の 札は **本体の 画面から 写して** 作る（collectDom）。
     こちらで store へ 入れただけの プリセットは そこに 並ばない（実測）。
     だから **一覧に 実際に 並んでいる 札**を 1 つ 選び、その id で
     途中まで 解いた 記録を 置いて 測る（本物の 道と 同じ）。 */
  await page.evaluate(() => {
    try {
      const b = document.querySelector('#appTabBar [data-app-tab="library"]');
      if (b) b.click(); else document.body.setAttribute("data-app-tab", "library");
    } catch (e) {}
  });
  await 待(2800);
  await 覆いを消す();
  /* ★ 「一覧」は grid の 中の 札（棚（rail）の 札とは 別に 描かれる）。 */
  const 札ら = () => page.evaluate(() => {
    const out = [];
    const 潜 = (root) => {
      Array.prototype.forEach.call(root.querySelectorAll("*"), (x) => {
        if (!x.shadowRoot) return;
        Array.prototype.forEach.call(x.shadowRoot.querySelectorAll(".pc"), (y) => out.push(y));
        潜(x.shadowRoot);
      });
    };
    潜(document);
    return out.map((c) => c.getAttribute("data-preset-select") || "").filter(Boolean);
  });
  const ら = await 札ら();
  見(ら.length > 0, "一覧に 札が 並んでいる", ら.length);
  const 的id = ら[0] || "";

  await page.evaluate((id) => {
    /* 7 問中 3 問まで 解いた 記録を 置く（本物の 形と 同じ）。 */
    const S = window.VQ2.schema;
    window.VQ2.store.quizzes.put({
      id: S.newId("quiz"), presetId: id, presetName: "一覧のたしかめ",
      mode: "practice", state: "paused",
      questionOrder: ["a", "b", "c", "d", "e", "f", "g"],
      choiceOrder: {},
      answers: [{ questionId: "a", value: "c1" }, { questionId: "b", value: "c1" },
                { questionId: "c", value: "c1" }],
      startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      stateHistory: []
    });
    /* 本物の 画面と 同じように 知らせる（控えが すぐ 捨てられる）。 */
    try { if (window.__vqProgressChanged) window.__vqProgressChanged(); } catch (e) {}
  }, 的id);
  await 待(1200);
  const しらべ = await page.evaluate((id) => ({
    id: id,
    記録: window.VQ2.store.quizzes.list().filter((x) => x.presetId === id).length,
    進み: window.VQ2.library.progressOf(id),
    札: (function () {
      try {
        var L = window.VQ2.library;
        var ら = L.collectDom(window.__vqScreensScrape ? window.__vqScreensScrape() : []);
        return ら.length;
      } catch (e) { return "ERR:" + e.message; }
    })()
  }), 的id);
  見(しらべ.記録 >= 1, "記録が 置けた", しらべ);
  見(!!しらべ.進み && しらべ.進み.answered === 3, "★ その id の 進みが 引ける（3 / 7）", しらべ);
  await page.evaluate(() => {
    try { if (window.__vqScreens && window.__vqScreens.描き直す) window.__vqScreens.描き直す(); } catch (e) {}
  });
  await 待(1200);
  const 棒 = await page.evaluate((id) => {
    const out = [];
    const 潜 = (root) => {
      Array.prototype.forEach.call(root.querySelectorAll("*"), (x) => {
        if (!x.shadowRoot) return;
        Array.prototype.forEach.call(x.shadowRoot.querySelectorAll(".pc"), (y) => out.push(y));
        潜(x.shadowRoot);
      });
    };
    潜(document);
    const 的 = out.filter((x) => x.getAttribute("data-preset-select") === id)[0];
    if (!的) return { なし: true, 札の数: out.length };
    const bar = 的.querySelector(".pc__prog");
    const fill = 的.querySelector(".pc__prog-f");
    const st = 的.querySelector(".pc__state");
    const go = 的.querySelector(".pc__go");
    return {
      棒: !!bar,
      幅: fill ? fill.style.width : "",
      valuenow: bar ? bar.getAttribute("aria-valuenow") : "",
      valuemax: bar ? bar.getAttribute("aria-valuemax") : "",
      文: st ? (st.textContent || "").replace(/\s+/g, " ").trim() : "",
      ボタン: go ? (go.textContent || "").trim() : "",
      下端: bar ? getComputedStyle(bar).bottom : "",
      高さ: bar ? getComputedStyle(bar).height : "",
      親: bar && bar.parentNode ? bar.parentNode.className : ""
    };
  }, 的id);
  if (棒 && 棒.なし) {
    見(false, "★ 一覧に その 札が ある", 棒);
  } else {
    見(棒.棒 === true, "★ 表紙の 下端に 棒が 出る", 棒);
    見(棒.幅 === "43%", "★ 3 / 7 ＝ 43% まで 伸びている", 棒.幅);
    見(棒.valuenow === "3" && 棒.valuemax === "7", "★ 読み上げにも 数が 出る", 棒);
    見(/3 \/ 7 問/.test(棒.文), "★ 解いた 問題数を 数でも 出す", 棒.文);
    見(棒.ボタン === "続きから", "★ ボタンが「続きから」に なる", 棒.ボタン);
    見(棒.下端 === "0px" && parseFloat(棒.高さ) <= 6, "★ 下端に 細く（YouTube と 同じ 置き）", 棒);
    見(/pc__ban/.test(棒.親), "★ 置き場は 表紙の 中（札の 上）", 棒.親);
  }
  /* ★ ホームの 棚（rail）の 札にも 出る（同じ 部品で 描いている）。 */
  const 棚 = await page.evaluate((id) => {
    const out = [];
    const 潜 = (root) => {
      Array.prototype.forEach.call(root.querySelectorAll("*"), (x) => {
        if (!x.shadowRoot) return;
        Array.prototype.forEach.call(x.shadowRoot.querySelectorAll(".rail .pc"), (y) => out.push(y));
        潜(x.shadowRoot);
      });
    };
    潜(document);
    const 的 = out.filter((x) => x.getAttribute("data-preset-select") === id)[0];
    if (!的) return { 棚なし: true, 数: out.length };
    return { 棒: !!的.querySelector(".pc__prog"),
             幅: (的.querySelector(".pc__prog-f") || {}).style ? 的.querySelector(".pc__prog-f").style.width : "" };
  }, 的id);
  if (棚.棚なし) 見(true, "（ホームの 棚は 出ていないので 飛ばす）", 棚);
  else 見(棚.棒 === true && 棚.幅 === "43%", "★ ホームの 棚の 札にも 同じ 棒が 出る", 棚);

  節("⑤ 1 問も 答えずに やめた ときは 残さない");
  await page.evaluate(() => {
    const S = window.VQ2.schema;
    const p2 = JSON.parse(JSON.stringify(window.__rzPreset));
    p2.id = "rz-p2"; p2.name = "空のたしかめ";
    window.VQ2.store.savePreset(p2, {});
    window.__rzPreset2 = p2;
    window.VQ2.quizPlayer.open({ preset: p2, mode: "practice" });
  });
  await 待(1800);
  await 覆いを消す();
  await page.evaluate(() => {
    const 潜 = (root, out) => {
      Array.prototype.forEach.call(root.querySelectorAll("*"), (x) => {
        if (x.shadowRoot) { Array.prototype.forEach.call(x.shadowRoot.querySelectorAll('[data-act="exit"]'), (y) => out.push(y)); 潜(x.shadowRoot, out); }
      });
    };
    const out = []; 潜(document, out);
    if (out[0]) out[0].click();
  });
  await 待(700);
  await page.evaluate(() => {
    const 潜 = (root, out) => {
      Array.prototype.forEach.call(root.querySelectorAll("*"), (x) => {
        if (x.shadowRoot) { Array.prototype.forEach.call(x.shadowRoot.querySelectorAll("button"), (y) => out.push(y)); 潜(x.shadowRoot, out); }
      });
    };
    const out = []; 潜(document, out);
    const b = out.filter((x) => /^やめる$/.test((x.textContent || "").trim()))[0];
    if (b) b.click();
  });
  await 待(1000);
  const 空 = await page.evaluate(() => ({
    記録: window.VQ2.store.quizzes.list().filter((x) => x.presetId === "rz-p2").length,
    進み: window.VQ2.library.progressOf("rz-p2")
  }));
  見(空.記録 === 0, "★ 1 問も 答えていない 記録は 残さない", 空);
  見(空.進み === null, "★ 棒も 出さない（0 問の 続きを 並べない）", 空);

  節("⑥ 設定で 正解・不正解の 動きを 切れる");
  {
    const 定 = await page.evaluate(() => {
      const PP = window.VQ2.playerPrefs;
      const d = (PP.DEFS || []).filter((x) => x.id === "answerAnim")[0] || null;
      return d ? { 名: d.label, 既定: d.def, 型: d.type, 範囲: d.scope } : null;
    });
    見(!!定 && 定.型 === "toggle" && 定.既定 === true,
      "★ 設定に「正解・不正解の動き」が ある（既定は 入）", 定);

    /* ★ CSS は 影の DOM の 中にしか 無い。**在る 影の 中**へ 差し込んで 測る
       （外へ 置いても 何も 効かないので 何も 測れない）。
       プレイヤーを 開くと SHELL_CSS の 入った 影が できる。 */
    /* 続きの 問いが 出ない よう、**まだ 解いていない** プリセットで 開く。 */
    await page.evaluate(() => {
      const p3 = JSON.parse(JSON.stringify(window.__rzPreset));
      p3.id = "rz-p3"; p3.name = "動きのたしかめ";
      window.VQ2.store.savePreset(p3, {});
      window.VQ2.quizPlayer.open({ preset: p3, mode: "practice" });
    });
    await 待(2600);
    await 覆いを消す();
    const 切ってみる = await page.evaluate(() => {
      const PP = window.VQ2.playerPrefs, PS = window.VQ2.playerShell;
      const 影ら = Array.prototype.slice.call(document.querySelectorAll("*"))
        .filter((e) => e.shadowRoot);
      const 主 = 影ら.filter((e) => Array.prototype.some.call(
        e.shadowRoot.querySelectorAll("style"),
        (st) => /vq2-choice/.test(st.textContent || "")))[0];
      if (!主) return { なし: true,
        影: 影ら.map((e) => e.id || e.tagName).slice(0, 12),
        style数: 影ら.map((e) => e.shadowRoot.querySelectorAll("style").length).slice(0, 12) };
      const 中 = document.createElement("div");
      中.className = "vq2-root";
      中.style.cssText = "position:absolute;left:-9999px;top:0";
      中.innerHTML = '<button class="vq2-choice is-correct is-mine"></button>'
        + '<button class="vq2-choice is-wrong"></button>'
        + '<div class="vq2-card vq2-jd is-ng"></div>';
      主.shadowRoot.appendChild(中);
      const 読 = () => Array.prototype.map.call(中.children,
        (x) => String(getComputedStyle(x).animationName || "none"));
      PP.set({ answerAnim: true });
      PS.applyVars(中, PP.all());
      const 入 = 読();
      const 印1 = 中.classList.contains("is-noansanim");
      PP.set({ answerAnim: false });
      PS.applyVars(中, PP.all());
      const 切 = 読();
      const 印2 = 中.classList.contains("is-noansanim");
      const 色 = getComputedStyle(中.children[1]).borderColor;
      中.remove();
      PP.set({ answerAnim: true });
      return { 入: 入, 切: 切, 印の色: 色, 印: [印1, 印2] };
    });
    if (切ってみる.なし) { 見(false, "★ 影の DOM が 見つからない", 切ってみる); }
    else {
      見(切ってみる.入.every((n) => n !== "none"), "設定が 入のときは 動く", 切ってみる.入);
      見(切ってみる.切.every((n) => n === "none"),
        "★ 設定を 切ると **動かない**", 切ってみる.切);
      見(JSON.stringify(切ってみる.印) === "[false,true]",
        "★ 切ったときだけ 印（is-noansanim）が 付く", 切ってみる.印);
      見(!!切ってみる.印の色 && 切ってみる.印の色 !== "rgba(0, 0, 0, 0)",
        "★ 切っても 色と 印は 残る（何が 合っていたかは 分かる）", 切ってみる.印の色);
    }
  }

  見(例外.length === 0, "画面の 例外 0 件", 例外.slice(0, 3));

  await browser.close();
  console.log("\n" + "─".repeat(28));
  console.log("通った: " + 済 + " / 落ちた: " + 落);
  if (落) { console.log("落ちたもの:"); 落ち.forEach((x) => console.log("  - " + x)); }
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error("落ちました:", e && e.stack || e); process.exit(1); });
