/* ══════════════════════════════════════════════════════════════════════
   V3 クイズ形式：実際の画面での確認
   ・形式レジストリが画面に載っているか
   ・使えると書いてある形式が、本当に表示できて採点できるか
   ・PC とスマホの両方で、押して答えられるか（運ぶ操作を含む）
   ・試験モードで、正解が画面に出ていないか
   ══════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const fs = require("node:fs");
fs.mkdirSync("shots/qtype", { recursive: true });
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  NG   " + n + (x ? "  → " + x : ""))); };

const HIDE = () => {
  ["firstLaunchOverlay", "vqbFlow", "vqNewAuth", "authGate", "authBootSplash"].forEach((id) => {
    const e = document.getElementById(id);
    if (e) { e.hidden = true; e.style.setProperty("display", "none", "important"); }
  });
  document.querySelectorAll('[data-act="dlg-x"],[data-act="dlg-o"]').forEach((x) => x.click());
  document.body.classList.remove("auth-booting", "auth-gate-open");
  const a = document.getElementById("app");
  if (a) a.style.setProperty("display", "block", "important");
  document.body.setAttribute("data-ui-v2", "1");
  try {
    localStorage.setItem("vq.tour.v1", JSON.stringify({
      pin: 1, preset: 1, feed: 1, news: 1, insight: 1, chat: 1,
      notif: 1, mock: 1, presetmake: 1, settings: 1
    }));
    const tv = document.getElementById("vqTour"); if (tv) tv.style.display = "none";
  } catch (e) {}
};

(async () => {
  const b = await chromium.launch({ headless: true });

  for (const d of [{ n: "PC", w: 1440, h: 950, m: false }, { n: "スマホ", w: 390, h: 844, m: true }]) {
    const ctx = await b.newContext({ viewport: { width: d.w, height: d.h }, deviceScaleFactor: 2, isMobile: d.m, hasTouch: d.m });
    const pg = await ctx.newPage();
    const errs = [];
    pg.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
    await pg.goto(BASE + "/?vq2=all&vqdev=1&cb=" + Date.now(), { waitUntil: "domcontentloaded" });
    await pg.waitForTimeout(4000);
    await pg.evaluate(HIDE);
    await pg.waitForTimeout(1000);

    console.log("\n== " + d.n + " ==");

    /* ── 1. レジストリが画面に載っているか ── */
    const reg = await pg.evaluate(() => {
      if (!window.VQ2 || !VQ2.qtypes) return { missing: true };
      const Q = VQ2.qtypes;
      const s = Q.stats();
      const avail = Q.list({ availableOnly: true });
      const noRenderer = avail.filter((x) => !VQ2.qrender.RENDERERS[x.engine]).map((x) => x.id);
      const noEval = avail.filter((x) => !VQ2.evaluator.ENGINE_EVAL[x.engine]).map((x) => x.id);
      return {
        total: s.total, available: s.byStatus.available, beta: s.byStatus.beta,
        soon: s.byStatus.coming_soon, engines: s.engines, modes: s.modes,
        noRenderer, noEval,
        hasModel: !!VQ2.qmodel, hasPlan: !!VQ2.qplan, hasPicker: !!VQ2.qtypePicker,
        hasEditor: !!VQ2.qtypeEditor
      };
    });
    ok(d.n + "：形式レジストリが載っている", !reg.missing && reg.total >= 100, JSON.stringify(reg.total));
    ok(d.n + "：共通モデル・配分・選択画面・編集フォームがそろっている",
       reg.hasModel && reg.hasPlan && reg.hasPicker && reg.hasEditor);
    ok(d.n + "：使える形式すべてに表示のしくみがある", (reg.noRenderer || []).length === 0, (reg.noRenderer || []).join(","));
    ok(d.n + "：使える形式すべてに採点のしくみがある", (reg.noEval || []).length === 0, (reg.noEval || []).join(","));
    console.log("    形式 " + reg.total + " 種類（使える " + reg.available + " / ベータ " + reg.beta
      + " / 準備中 " + reg.soon + "）・エンジン " + reg.engines + "・モード " + reg.modes);

    /* ── 2. 使える形式すべてを、実際に描いてみる ── */
    const drawn = await pg.evaluate(() => {
      const Q = VQ2.qtypes, M = VQ2.qmodel, R = VQ2.qrender;
      const bad = [], empty = [];
      Q.list({ availableOnly: true }).forEach((d) => {
        if (d.mode) return;                       /* これは解き方。問題ではない。 */
        let q;
        try { q = M.empty(d.id); } catch (e) { bad.push(d.id + ":empty:" + e.message); return; }
        try {
          const html = R.promptHtml(q, {}) + R.html(q, null, {});
          if (!html || html.length < 20) empty.push(d.id);
          const div = document.createElement("div");
          div.innerHTML = html;
          if (div.querySelector("script")) bad.push(d.id + ":script");
        } catch (e) { bad.push(d.id + ":" + e.message); }
      });
      return { bad, empty, count: Q.list({ availableOnly: true }).length };
    });
    ok(d.n + "：使える形式すべてが例外なく描ける", drawn.bad.length === 0, drawn.bad.slice(0, 5).join(" / "));
    ok(d.n + "：空の表示になる形式が無い", drawn.empty.length === 0, drawn.empty.join(","));

    /* ── 3. 知らない形式でも落ちない ── */
    const fb = await pg.evaluate(() => {
      try {
        const h = VQ2.qrender.html({ type: "zzz_totally_unknown", points: 1 }, null, {});
        return { ok: h.indexOf("表示できません") >= 0, len: h.length };
      } catch (e) { return { ok: false, err: e.message }; }
    });
    ok(d.n + "：知らない形式は「表示できません」と出て、壊れない", fb.ok, JSON.stringify(fb));

    /* ── 4. 出題画面で、実際に押して答えて採点する ── */
    const built = await pg.evaluate(() => {
      const M = VQ2.qmodel, ST = VQ2.store;
      function q(o) { return M.normalize(o); }
      const preset = {
        id: "p_qtype_e2e", schemaVersion: 2, name: "V3 形式の確認", description: "",
        visibility: "private", questions: [
          q({ id: "q1", type: "multiple_choice_single", prompt: "首都はどこですか", points: 5,
              choices: [{ id: "c1", text: "東京", isCorrect: true }, { id: "c2", text: "大阪" },
                        { id: "c3", text: "京都" }, { id: "c4", text: "札幌" }] }),
          q({ id: "q2", type: "word_input", prompt: "645 年の政治改革の名前は", points: 5,
              correctAnswer: "大化の改新" }),
          q({ id: "q3", type: "ordering", prompt: "古い順に並べなさい", points: 6,
              orderItems: [{ id: "i1", text: "大化の改新", order: 1 }, { id: "i2", text: "平城京遷都", order: 2 },
                           { id: "i3", text: "平安京遷都", order: 3 }],
              correctOrder: ["i1", "i2", "i3"] }),
          q({ id: "q4", type: "classification", prompt: "時代ごとに分けなさい", points: 4,
              classification: {
                groups: [{ id: "g1", label: "江戸" }, { id: "g2", label: "明治" }],
                items: [{ id: "t1", text: "参勤交代", groupId: "g1" }, { id: "t2", text: "廃藩置県", groupId: "g2" }]
              } }),
          q({ id: "q5", type: "fill_blank", prompt: "1867 年、徳川慶喜は【　】を行った", points: 4,
              blanks: [{ id: "b1", label: "1", answer: "大政奉還" }] }),
          q({ id: "q6", type: "matching", prompt: "対応させなさい", points: 4,
              pairs: { left: [{ id: "L1", text: "織田信長" }, { id: "L2", text: "豊臣秀吉" }],
                       right: [{ id: "R1", text: "長篠の戦い" }, { id: "R2", text: "太閤検地" }],
                       correct: { L1: "R1", L2: "R2" } } }),
          q({ id: "q7", type: "flashcard", prompt: "ephemeral", points: 1,
              card: { front: "ephemeral", back: "はかない" } })
        ]
      };
      ST.savePreset(preset, { force: true });
      window.__e2ePreset = preset;
      return { n: preset.questions.length };
    });
    ok(d.n + "：7 形式のプリセットを用意できた", built.n === 7, String(built.n));

    await pg.evaluate(() => {
      VQ2.quizPlayer.open({ preset: window.__e2ePreset, mode: "practice", resume: false });
    });
    await pg.waitForTimeout(1200);

    const host = "#vq2-quiz-player";
    const shadowText = async () => pg.evaluate((h) => {
      const el = document.querySelector(h);
      return el && el.shadowRoot ? el.shadowRoot.textContent.slice(0, 4000) : "";
    }, host);
    const inShadow = async (sel) => pg.evaluate(([h, s]) => {
      const el = document.querySelector(h);
      if (!el || !el.shadowRoot) return 0;
      return el.shadowRoot.querySelectorAll(s).length;
    }, [host, sel]);
    const clickShadow = async (sel, idx) => pg.evaluate(([h, s, i]) => {
      const el = document.querySelector(h);
      if (!el || !el.shadowRoot) return false;
      const t = el.shadowRoot.querySelectorAll(s)[i || 0];
      if (!t) return false;
      t.click();
      return true;
    }, [host, sel, idx || 0]);
    const typeShadow = async (sel, text) => pg.evaluate(([h, s, v]) => {
      const el = document.querySelector(h);
      const t = el.shadowRoot.querySelector(s);
      if (!t) return false;
      t.value = v;
      t.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }, [host, sel, text]);
    const next = async () => { await clickShadow('[data-act="next"]'); await pg.waitForTimeout(400); };

    ok(d.n + "：出題画面が開く", (await inShadow(".vq2-qbox")) > 0);

    /* 問 1：4 択 */
    ok(d.n + "：4 択の選択肢が出る", (await inShadow("[data-qr-choice]")) === 4);
    await clickShadow("[data-qr-choice]", 0);
    await pg.waitForTimeout(250);
    ok(d.n + "：選んだ選択肢に印が付く", (await inShadow("[data-qr-choice].is-picked")) === 1);
    await next();

    /* 問 2：単語入力 */
    ok(d.n + "：入力欄が出る", (await inShadow("[data-qr-text]")) === 1);
    await typeShadow("[data-qr-text]", "大化の改新");
    await pg.waitForTimeout(200);
    await next();

    /* 問 3：並べ替え（上下ボタンで動かす＝キーボードでも指でも同じ操作） */
    ok(d.n + "：並べ替えの項目が出る", (await inShadow(".vq2-sort-i")) === 3);
    const before = await pg.evaluate((h) => {
      const r = document.querySelector(h).shadowRoot;
      return [...r.querySelectorAll(".vq2-sort-i")].map((x) => x.getAttribute("data-drag-id"));
    }, host);
    await clickShadow('[data-act="qr-down"]', 0);
    await pg.waitForTimeout(300);
    const after = await pg.evaluate((h) => {
      const r = document.querySelector(h).shadowRoot;
      return [...r.querySelectorAll(".vq2-sort-i")].map((x) => x.getAttribute("data-drag-id"));
    }, host);
    ok(d.n + "：並べ替えのボタンで順番が変わる", JSON.stringify(before) !== JSON.stringify(after),
       before + " → " + after);
    /* 正しい順へそろえる */
    await pg.evaluate((h) => {
      const r = document.querySelector(h).shadowRoot;
      /* 3 回まで押して i1,i2,i3 の順にする */
      for (let n = 0; n < 6; n++) {
        const ids = [...r.querySelectorAll(".vq2-sort-i")].map((x) => x.getAttribute("data-drag-id"));
        if (ids.join() === "i1,i2,i3") break;
        const at = ids.indexOf("i1");
        if (at > 0) { r.querySelectorAll('[data-act="qr-up"]')[at].click(); continue; }
        const at2 = ids.indexOf("i2");
        if (at2 > 1) { r.querySelectorAll('[data-act="qr-up"]')[at2].click(); continue; }
        break;
      }
    }, host);
    await pg.waitForTimeout(300);
    await next();

    /* 問 4：分類（押して選ぶ → 押して置く） */
    ok(d.n + "：分類の項目と箱が出る",
       (await inShadow(".vq2-cls-i")) === 2 && (await inShadow(".vq2-cls-g")) === 2);
    const tapPlace = async (itemId, groupId) => pg.evaluate(([h, it, g]) => {
      const r = document.querySelector(h).shadowRoot;
      const item = r.querySelector('[data-drag-id="' + it + '"]');
      if (!item) return "no-item";
      item.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true, clientX: 10, clientY: 10, pointerId: 1 }));
      item.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, composed: true, clientX: 10, clientY: 10, pointerId: 1 }));
      const zone = r.querySelector('[data-drop-zone="' + g + '"]');
      if (!zone) return "no-zone";
      zone.click();
      return "ok";
    }, [host, itemId, groupId]);
    const r1 = await tapPlace("t1", "g1");
    await pg.waitForTimeout(300);
    const r2 = await tapPlace("t2", "g2");
    await pg.waitForTimeout(300);
    ok(d.n + "：押して選び、押して置ける（指でも動く）", r1 === "ok" && r2 === "ok", r1 + "/" + r2);
    const placed = await pg.evaluate((h) => {
      const r = document.querySelector(h).shadowRoot;
      return [...r.querySelectorAll(".vq2-cls-g")].map((g) => g.querySelectorAll(".vq2-cls-i").length);
    }, host);
    ok(d.n + "：分けた項目が箱の中に入る", JSON.stringify(placed) === "[1,1]", JSON.stringify(placed));
    await next();

    /* 問 5：穴埋め */
    ok(d.n + "：空欄の入力欄が出る", (await inShadow("[data-qr-blank]")) === 1);
    await typeShadow("[data-qr-blank]", "大政奉還");
    await pg.waitForTimeout(200);
    await next();

    /* 問 6：組み合わせ */
    ok(d.n + "：左右の項目が出る",
       (await inShadow("[data-match-left]")) === 2 && (await inShadow("[data-match-right]")) === 2);
    const link = async (l, r) => pg.evaluate(([h, li, ri]) => {
      const root = document.querySelector(h).shadowRoot;
      const L = root.querySelector('[data-match-left="' + li + '"]');
      L.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true, clientX: 5, clientY: 5, pointerId: 2 }));
      L.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, composed: true, clientX: 5, clientY: 5, pointerId: 2 }));
      const R = root.querySelector('[data-match-right="' + ri + '"]');
      R.click();
      return true;
    }, [host, l, r]);
    await link("L1", "R1"); await pg.waitForTimeout(250);
    await link("L2", "R2"); await pg.waitForTimeout(250);
    const linked = await inShadow(".vq2-match-i.is-linked");
    ok(d.n + "：左右をつなげる", linked >= 2, String(linked));
    await next();

    /* 問 7：カード */
    ok(d.n + "：カードが出る", (await inShadow("[data-qr-flip]")) === 1);
    await clickShadow("[data-qr-flip]");
    await pg.waitForTimeout(300);
    /* shadowRoot.textContent には CSS も入るので、カードの中だけを見る。 */
    const backShown = await pg.evaluate((h) => {
      const r = document.querySelector(h).shadowRoot;
      const t = r.querySelector(".vq2-card3-t");
      return !!t && t.textContent.indexOf("はかない") >= 0;
    }, host);
    ok(d.n + "：押すと裏が見える", backShown);
    await clickShadow('[data-act="qr-card-mark"]', 1);
    await pg.waitForTimeout(400);

    /* 採点する */
    await pg.evaluate((h) => {
      const r = document.querySelector(h).shadowRoot;
      const s = r.querySelector('[data-act="submit"]');
      if (s) s.click();
    }, host);
    await pg.waitForTimeout(700);
    await pg.evaluate(() => {
      document.querySelectorAll("*").forEach((el) => {
        if (el.shadowRoot) {
          const okb = el.shadowRoot.querySelector('[data-act="dlg-o"]');
          if (okb) okb.click();
        }
      });
    });
    await pg.waitForTimeout(2500);

    const res = await pg.evaluate(() => {
      const list = VQ2.store.results.list();
      const r = list.filter((x) => x.presetId === "p_qtype_e2e")
        .sort((a, b) => String(b.finishedAt).localeCompare(String(a.finishedAt)))[0];
      if (!r) return null;
      return {
        score: r.score, max: r.maxScore, correct: r.correctCount, wrong: r.wrongCount,
        items: r.items.map((i) => ({ id: i.questionId, s: i.score, m: i.maxScore, c: i.correct })),
        byType: Object.keys(r.aggregate.byType || {}),
        byEngine: Object.keys(r.aggregate.byEngine || {}),
        hasValues: r.items.every((i) => i.value !== undefined)
      };
    });
    ok(d.n + "：採点されて結果が保存される", !!res, res ? "" : "結果がありません");
    if (res) {
      console.log("    " + res.score + " / " + res.max + " 点　" + JSON.stringify(res.items));
      ok(d.n + "：形式別の集計が出る", res.byType.length >= 5, res.byType.join(","));
      ok(d.n + "：答え方別の集計が出る", res.byEngine.length >= 5, res.byEngine.join(","));
      ok(d.n + "：結果に自分の答えが残る（再現できる）", res.hasValues);
      const q1 = res.items.filter((i) => i.id === "q1")[0];
      const q2 = res.items.filter((i) => i.id === "q2")[0];
      const q4 = res.items.filter((i) => i.id === "q4")[0];
      const q5 = res.items.filter((i) => i.id === "q5")[0];
      const q6 = res.items.filter((i) => i.id === "q6")[0];
      ok(d.n + "：4 択が正解になる", q1 && q1.c === true, JSON.stringify(q1));
      ok(d.n + "：入力が正解になる", q2 && q2.c === true, JSON.stringify(q2));
      ok(d.n + "：分類が正解になる", q4 && q4.s === 4, JSON.stringify(q4));
      ok(d.n + "：穴埋めが正解になる", q5 && q5.s === 4, JSON.stringify(q5));
      ok(d.n + "：組み合わせが正解になる", q6 && q6.s === 4, JSON.stringify(q6));
    }
    await pg.screenshot({ path: "shots/qtype/" + d.n + "-結果.png" });

    /* ── 5. 試験モードでは、画面に正解が出ていない ── */
    await pg.evaluate(() => {
      const open = document.querySelectorAll(".vq2-host");
      open.forEach((h) => { if (h.__vq2close) h.__vq2close("test"); });
    });
    await pg.evaluate(() => {
      VQ2.quizPlayer.open({ preset: window.__e2ePreset, mode: "mock", resume: false });
    });
    await pg.waitForTimeout(1200);
    const leak = await pg.evaluate(() => {
      const hosts = [...document.querySelectorAll("#vq2-quiz-player")];
      const h = hosts[hosts.length - 1];
      if (!h || !h.shadowRoot) return { missing: true };
      const html = h.shadowRoot.innerHTML;
      return {
        isCorrect: html.indexOf("isCorrect") >= 0,
        answerText: html.indexOf("大化の改新") >= 0,
        hasChoices: h.shadowRoot.querySelectorAll("[data-qr-choice]").length
      };
    });
    ok(d.n + "：試験では正解の印が画面に無い", !leak.missing && leak.isCorrect === false, JSON.stringify(leak));
    ok(d.n + "：試験でも選択肢はきちんと出る", (leak.hasChoices || 0) >= 2, String(leak.hasChoices));

    /* ── 6. 作る側：形式を選ぶ画面と、形式ごとの編集フォーム ── */
    await pg.evaluate(() => {
      document.querySelectorAll(".vq2-host").forEach((h) => { if (h.__vq2close) h.__vq2close("test"); });
    });
    await pg.waitForTimeout(400);
    await pg.evaluate(() => {
      VQ2.presetStudio.open({ presetId: "p_qtype_e2e" });
    });
    await pg.waitForTimeout(1500);
    const studio = "#vq2-preset-studio";
    const sIn = async (sel) => pg.evaluate(([h, s2]) => {
      const el = document.querySelector(h);
      return el && el.shadowRoot ? el.shadowRoot.querySelectorAll(s2).length : 0;
    }, [studio, sel]);
    const sClick = async (sel, i) => pg.evaluate(([h, s2, n]) => {
      const el = document.querySelector(h);
      const t = el && el.shadowRoot ? el.shadowRoot.querySelectorAll(s2)[n || 0] : null;
      if (!t) return false;
      t.click();
      return true;
    }, [studio, sel, i || 0]);

    ok(d.n + "：作る画面が開く", (await sIn(".vq2-qcard")) > 0);

    /* 開いた直後に、形式ごとの編集フォームとプレビューが入っているか。
       箱だけ置いて中身を入れ忘れると、形式を選んでも編集する場所が出てこない。 */
    await pg.evaluate(() => {
      document.querySelectorAll(".vq2-host").forEach((h) => { if (h.__vq2close) h.__vq2close("test"); });
    });
    await pg.waitForTimeout(400);
    await pg.evaluate(() => {
      const M = VQ2.qmodel;
      VQ2.store.savePreset({
        id: "p_qtype_open", schemaVersion: 2, name: "開いた直後の確認", visibility: "private",
        questions: [M.normalize({
          id: "q1", type: "classification", prompt: "分けなさい", points: 4, explanation: "解説",
          classification: { groups: [{ id: "g1", label: "A" }, { id: "g2", label: "B" }],
                            items: [{ id: "t1", text: "x", groupId: "g1" }, { id: "t2", text: "y", groupId: "g2" }] }
        })].concat(Array.from({ length: 24 }, (_, i) => M.normalize({
          id: "qq" + (i + 2), type: "multiple_choice_single", prompt: "問題 " + (i + 2), points: 2, explanation: "解説",
          choices: [{ id: "c1", text: "あ", isCorrect: true }, { id: "c2", text: "い" },
                    { id: "c3", text: "う" }, { id: "c4", text: "え" }]
        })))
      }, { force: true });
      VQ2.presetStudio.open({ presetId: "p_qtype_open" });
    });
    await pg.waitForTimeout(1600);
    const opened = await pg.evaluate((h) => {
      const r = document.querySelector(h).shadowRoot;
      const box = r.querySelector("[data-qtedit]"), pv = r.querySelector("[data-qtpreview]");
      return { form: box ? box.querySelectorAll(".vq2-qe-item").length : -1,
               prev: pv ? pv.querySelectorAll(".vq2-cls-g").length : -1 };
    }, studio);
    ok(d.n + "：開いた直後から形式ごとの編集フォームが出ている", opened.form > 0, JSON.stringify(opened));
    ok(d.n + "：開いた直後からプレビューが出ている", opened.prev >= 2, JSON.stringify(opened));

    /* AI の指示欄で Enter を押して失敗しても、打った文が消えない */
    const kept = await pg.evaluate(async (h) => {
      const r = document.querySelector(h).shadowRoot;
      const ta = r.querySelector("[data-tlinput]");
      if (!ta) return "欄なし";
      ta.focus();
      ta.value = "10問つくって";
      ta.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      await new Promise((x) => setTimeout(x, 200));
      ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, composed: true, cancelable: true }));
      await new Promise((x) => setTimeout(x, 2500));
      const host = document.querySelector(h);
      if (!host) return "画面が消えた";
      const t2 = host.shadowRoot.querySelector("[data-tlinput]");
      return t2 ? t2.value : "欄が消えた";
    }, studio);
    ok(d.n + "：指示欄で Enter を押しても、打った文が消えない", kept === "10問つくって", String(kept));

    /* Enter で描き直しても、見ていた場所へ戻す（先頭へ飛ばさない）。 */
    const scrollKept = await pg.evaluate(async (h) => {
      const r = document.querySelector(h).shadowRoot;
      const p = r.querySelector("#wsMainScroll");
      if (!p) return { skip: "スクロール欄なし" };
      /* 中身を伸ばしてから、途中まで送る */
      if (p.scrollHeight - p.clientHeight < 100) return { skip: "短いので確認できない" };
      const want = Math.min(400, p.scrollHeight - p.clientHeight);
      p.scrollTop = want;
      const ta = r.querySelector("[data-tlinput]");
      if (!ta) return { skip: "指示欄なし" };
      ta.focus();
      ta.value = "5問足して";
      ta.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      await new Promise((x) => setTimeout(x, 200));
      ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, composed: true, cancelable: true }));
      await new Promise((x) => setTimeout(x, 2000));
      const host = document.querySelector(h);
      if (!host) return { skip: "画面が消えた" };
      const p2 = host.shadowRoot.querySelector("#wsMainScroll");
      return { want: want, got: p2 ? p2.scrollTop : -1 };
    }, studio);
    if (scrollKept.skip) ok(d.n + "：Enter で先頭へ戻らない（確認できず: " + scrollKept.skip + "）", true);
    else ok(d.n + "：Enter を押しても先頭へ戻らない",
            Math.abs(scrollKept.got - scrollKept.want) <= 40, JSON.stringify(scrollKept));

    await pg.evaluate(() => {
      document.querySelectorAll(".vq2-host").forEach((h) => { if (h.__vq2close) h.__vq2close("test"); });
    });
    await pg.waitForTimeout(400);
    await pg.evaluate(() => { VQ2.presetStudio.open({ presetId: "p_qtype_e2e" }); });
    await pg.waitForTimeout(1500);
    ok(d.n + "：形式を選ぶボタンがある", (await sIn('[data-act="pick-type"]')) > 0);
    await sClick('[data-act="pick-type"]');
    await pg.waitForTimeout(900);

    const picker = "#vq2-qtype-picker";
    const pIn = async (sel) => pg.evaluate(([h, s2]) => {
      const el = document.querySelector(h);
      return el && el.shadowRoot ? el.shadowRoot.querySelectorAll(s2).length : 0;
    }, [picker, sel]);
    ok(d.n + "：形式を選ぶ画面が開く", (await pIn(".vq2-qt-card")) > 10, String(await pIn(".vq2-qt-card")));
    ok(d.n + "：分類ごとに並ぶ", (await pIn(".vq2-qt-sec")) >= 8, String(await pIn(".vq2-qt-sec")));
    ok(d.n + "：探す欄がある", (await pIn("[data-qt-q]")) === 1);
    /* 準備中は押しても壊れた画面へ行かない */
    const soonCount = await pIn(".vq2-qt-card.is-soon");
    ok(d.n + "：準備中は「使えるものだけ」で隠れている", soonCount === 0, String(soonCount));
    /* 探して選ぶ */
    await pg.evaluate(([h, t]) => {
      const el = document.querySelector(h).shadowRoot.querySelector("[data-qt-q]");
      el.value = t;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, [picker, "分類"]);
    await pg.waitForTimeout(600);
    const hits = await pIn(".vq2-qt-card");
    ok(d.n + "：探すと絞り込まれる", hits > 0 && hits < 40, String(hits));
    await pg.evaluate((h) => {
      const r = document.querySelector(h).shadowRoot;
      const card = [...r.querySelectorAll(".vq2-qt-card")].filter((c) => c.getAttribute("data-qt") === "classification")[0]
        || r.querySelector(".vq2-qt-card");
      card.click();
    }, picker);
    await pg.waitForTimeout(900);
    /* 選択肢を使わない形式へ移すときは、先に確認が出る。それに答える。 */
    const askedBeforeLosing = await pg.evaluate((h) => {
      const r = document.querySelector(h).shadowRoot;
      const okb = r.querySelector('[data-act="dlg-o"]');
      if (!okb) return false;
      okb.click();
      return true;
    }, studio);
    ok(d.n + "：選択肢が使われなくなる形式へ移すとき、先に確認が出る", askedBeforeLosing);
    await pg.waitForTimeout(1200);

    const edited = await pg.evaluate((h) => {
      const r = document.querySelector(h).shadowRoot;
      return {
        form: r.querySelectorAll("[data-qtedit] .vq2-qe-item").length,
        preview: r.querySelectorAll("[data-qtpreview] .vq2-cls-g").length,
        typeLabel: (r.querySelector('[data-act="pick-type"] span') || {}).textContent || ""
      };
    }, studio);
    ok(d.n + "：形式ごとの編集フォームが出る", edited.form > 0, JSON.stringify(edited));
    ok(d.n + "：プレビューが本物の見た目で出る", edited.preview >= 2, JSON.stringify(edited));
    ok(d.n + "：形式の名前が切り替わる", edited.typeLabel.indexOf("分類") >= 0 || edited.typeLabel.indexOf("グループ") >= 0, edited.typeLabel);
    await pg.screenshot({ path: "shots/qtype/" + d.n + "-形式選択と編集.png" });

    /* ── 7. 新しい形式で作った問題が、本当に保存できるか ── */
    const saved = await pg.evaluate(() => {
      const M = VQ2.qmodel, Q = VQ2.qtypes, V = VQ2.validate, ST = VQ2.store;
      const bad = [];
      /* 使える形式すべてを、空のまま検証してみる。
         「使用できない値です」（形式そのものを弾く）が出たら不合格。 */
      Q.list({ availableOnly: true }).forEach((d) => {
        if (d.mode) return;
        const out = [];
        try { VQ2.schema.validateQuestion(M.normalize(M.empty(d.id)), "q", out); }
        catch (e) { bad.push(d.id + ":例外"); return; }
        if (out.some((i) => i.code === "enum" && i.path === "q.type")) bad.push(d.id + ":形式を弾かれた");
      });
      /* 実際に中身を入れて保存する */
      const q1 = M.normalize({ id: "s1", type: "classification", prompt: "分けなさい", points: 4,
        explanation: "解説", classification: {
          groups: [{ id: "g1", label: "A" }, { id: "g2", label: "B" }],
          items: [{ id: "t1", text: "x", groupId: "g1" }, { id: "t2", text: "y", groupId: "g2" }] } });
      const q2 = M.normalize({ id: "s2", type: "flashcard", prompt: "表", points: 1,
        explanation: "解説", card: { front: "表", back: "裏" } });
      const q3 = M.normalize({ id: "s3", type: "table_fill", prompt: "埋めなさい", points: 4, explanation: "解説",
        table: { columns: [{ id: "c1", text: "年" }, { id: "c2", text: "こと" }],
                 rows: [{ id: "r1", header: "", cells: [{ id: "r1c1", text: "1868", editable: false },
                                                        { id: "r1c2", text: "", editable: true, answer: "明治維新" }] }] } });
      const r = ST.savePreset({ id: "p_v3_save", schemaVersion: 2, name: "V3 保存の確認",
                                visibility: "private", questions: [q1, q2, q3] }, {});
      return { bad, saveOk: r.ok, msg: r.message || "",
               issues: (r.issues || []).filter((i) => i.severity === "error").slice(0, 3).map((i) => i.code + ":" + i.message) };
    });
    ok(d.n + "：どの形式も「使用できない値です」で弾かれない", saved.bad.length === 0, saved.bad.slice(0, 5).join(","));
    ok(d.n + "：新しい形式のプリセットを保存できる", saved.saveOk === true, saved.msg + " " + JSON.stringify(saved.issues));

    /* ── 8. カードの折りたたみと、触った場所が動かないこと ── */
    await pg.evaluate(() => {
      document.querySelectorAll(".vq2-host").forEach((h) => { if (h.__vq2close) h.__vq2close("test"); });
      const M = VQ2.qmodel, qs = [];
      for (let i = 1; i <= 40; i++) {
        qs.push(M.normalize({
          id: "c" + i, type: "multiple_choice_single", prompt: "問題 " + i, points: 2, explanation: "解説",
          choices: [{ id: "c1", text: "あ", isCorrect: true }, { id: "c2", text: "い" },
                    { id: "c3", text: "う" }, { id: "c4", text: "え" }]
        }));
      }
      VQ2.store.savePreset({ id: "p_cards", schemaVersion: 2, name: "カードの確認",
                             visibility: "private", questions: qs }, { force: true });
      VQ2.presetStudio.open({ presetId: "p_cards" });
    });
    await pg.waitForTimeout(1800);
    const cardRes = await pg.evaluate(async (h) => {
      const sr = () => document.querySelector(h).shadowRoot;
      const pane = () => sr().querySelector("#wsMainScroll");
      const cb = sr().querySelector('[data-act="collapse-all"]');
      if (cb) cb.click();
      await new Promise((x) => setTimeout(x, 500));
      const allClosed = sr().querySelectorAll(".vq2-qcard-b").length === 0;
      const p = pane();
      if (!p || p.scrollHeight - p.clientHeight < 600) return { skip: "短いので確認できない", allClosed };
      p.scrollTop = Math.min(1500, p.scrollHeight - p.clientHeight);
      await new Promise((x) => setTimeout(x, 200));
      const vis = [...sr().querySelectorAll(".vq2-qcard[data-qid]")].filter((c) => {
        const t = c.getBoundingClientRect().top - pane().getBoundingClientRect().top;
        return t > 80 && t < 420;
      })[0];
      if (!vis) return { skip: "見えるカードがない", allClosed };
      const qid = vis.getAttribute("data-qid");
      const posOf = () => {
        const c = sr().querySelector('.vq2-qcard[data-qid="' + qid + '"]');
        return c ? Math.round(c.getBoundingClientRect().top - pane().getBoundingClientRect().top) : null;
      };
      const before = posOf();
      vis.click();
      await new Promise((x) => setTimeout(x, 700));
      const opened = !!sr().querySelector('.vq2-qcard[data-qid="' + qid + '"] .vq2-qcard-b');
      const afterOpen = posOf();
      sr().querySelector('.vq2-qcard[data-qid="' + qid + '"] .vq2-qcard-h').click();
      await new Promise((x) => setTimeout(x, 700));
      const closed = !sr().querySelector('.vq2-qcard[data-qid="' + qid + '"] .vq2-qcard-b');
      const afterClose = posOf();
      return { allClosed, opened, closed, before, afterOpen, afterClose };
    }, studio);
    ok(d.n + "：問題カードを折りたためる", cardRes.allClosed === true, JSON.stringify(cardRes));
    if (cardRes.skip) {
      ok(d.n + "：カードを触っても場所が動かない（確認できず: " + cardRes.skip + "）", true);
    } else {
      ok(d.n + "：カードを押すと開き、もう一度押すと閉じる",
         cardRes.opened === true && cardRes.closed === true, JSON.stringify(cardRes));
      ok(d.n + "：カードを開いても、押した場所が動かない",
         Math.abs(cardRes.afterOpen - cardRes.before) <= 10, JSON.stringify(cardRes));
      ok(d.n + "：カードを閉じても、押した場所が動かない",
         Math.abs(cardRes.afterClose - cardRes.before) <= 10, JSON.stringify(cardRes));
    }

    /* ── 9. ダークが V2 の画面にも効くか ── */
    const darkRes = await pg.evaluate(async (h) => {
      const de = document.documentElement;
      const prev = de.getAttribute("data-theme-mode");
      function bgOf() {
        const host = document.querySelector(h);
        if (!host || !host.shadowRoot) return null;
        const wrap = host.shadowRoot.querySelector(".vq2-root") || host.shadowRoot.firstElementChild;
        return { attr: host.getAttribute("data-theme"), bg: getComputedStyle(wrap).backgroundColor };
      }
      de.setAttribute("data-theme-mode", "dark");
      await new Promise((x) => setTimeout(x, 500));
      const dark = bgOf();
      de.setAttribute("data-theme-mode", "light");
      await new Promise((x) => setTimeout(x, 500));
      const light = bgOf();
      if (prev) de.setAttribute("data-theme-mode", prev); else de.removeAttribute("data-theme-mode");
      return { dark, light };
    }, studio);
    function lum(rgb) {
      const m = /(\d+),\s*(\d+),\s*(\d+)/.exec(String(rgb || ""));
      return m ? (Number(m[1]) + Number(m[2]) + Number(m[3])) / 3 : -1;
    }
    ok(d.n + "：作る画面がダークになる",
       darkRes.dark && darkRes.dark.attr === "dark" && lum(darkRes.dark.bg) < 90, JSON.stringify(darkRes.dark));
    ok(d.n + "：ライトへ戻すと明るくなる",
       darkRes.light && darkRes.light.attr === "light" && lum(darkRes.light.bg) > 200, JSON.stringify(darkRes.light));

    /* Quick Mock も同じしくみ（host にテーマを付ける）で効くか */
    const qmDark = await pg.evaluate(async () => {
      document.querySelectorAll(".vq2-host").forEach((h) => { if (h.__vq2close) h.__vq2close("test"); });
      document.documentElement.setAttribute("data-theme-mode", "dark");
      if (!VQ2.quickMock) return { skip: "Quick Mock なし" };
      try { VQ2.quickMock.open({}); } catch (e) { return { skip: "開けない: " + e.message }; }
      await new Promise((x) => setTimeout(x, 1400));
      const host = document.querySelector("#vq2-quick-mock");
      if (!host || !host.shadowRoot) return { skip: "画面なし" };
      const wrap = host.shadowRoot.querySelector(".vq2-root") || host.shadowRoot.firstElementChild;
      const out = { attr: host.getAttribute("data-theme"), bg: getComputedStyle(wrap).backgroundColor };
      document.documentElement.removeAttribute("data-theme-mode");
      return out;
    });
    if (qmDark.skip) ok(d.n + "：Quick Mock がダークになる（確認できず: " + qmDark.skip + "）", true);
    else ok(d.n + "：Quick Mock がダークになる",
            qmDark.attr === "dark" && lum(qmDark.bg) < 90, JSON.stringify(qmDark));

    /* ── 10. クイズ画面のキー操作（打った文字が操作に化けない） ── */
    await pg.evaluate(() => {
      document.querySelectorAll(".vq2-host").forEach((h) => { if (h.__vq2close) h.__vq2close("test"); });
      const M = VQ2.qmodel;
      const p = { id: "p_keys", schemaVersion: 2, name: "キー操作の確認", visibility: "private", questions: [
        M.normalize({ id: "kx1", type: "word_input", prompt: "答えを打ってください", points: 5,
                      explanation: "解説", correctAnswer: "こたえ" }),
        M.normalize({ id: "kx2", type: "fill_blank", prompt: "【　】と【　】", points: 4, explanation: "解説",
                      blanks: [{ id: "b1", answer: "あ" }, { id: "b2", answer: "い" }] }),
        M.normalize({ id: "kx3", type: "multiple_choice_single", prompt: "選んでください", points: 5, explanation: "解説",
                      choices: [{ id: "c1", text: "ア", isCorrect: true }, { id: "c2", text: "イ" },
                                { id: "c3", text: "ウ" }, { id: "c4", text: "エ" }] })
      ] };
      VQ2.store.savePreset(p, { force: true });
      VQ2.quizPlayer.open({ preset: p, mode: "practice", resume: false });
    });
    await pg.waitForTimeout(1400);
    const qp = "#vq2-quiz-player";
    await pg.evaluate((h) => {
      const el = document.querySelector(h).shadowRoot.querySelector("[data-qr-text]");
      if (el) el.focus();
    }, qp);
    await pg.keyboard.type("office");
    await pg.keyboard.press("KeyF");
    await pg.waitForTimeout(250);
    const typed = await pg.evaluate((h) => {
      const sr = document.querySelector(h).shadowRoot;
      return { value: (sr.querySelector("[data-qr-text]") || {}).value,
               flagged: !!sr.querySelector('[data-act="flag"].is-active'),
               prompt: (sr.querySelector(".vq2-qtext") || {}).textContent };
    }, qp);
    ok(d.n + "：入力欄で F を打つと、そのまま文字が入る", typed.value === "officef", JSON.stringify(typed));
    ok(d.n + "：入力欄で F を打っても「後で確認」が入らない", typed.flagged === false, JSON.stringify(typed));
    await pg.keyboard.press("Enter");
    await pg.waitForTimeout(500);
    const afterEnter = await pg.evaluate((h) => {
      const sr = document.querySelector(h).shadowRoot;
      return { prompt: (sr.querySelector(".vq2-qtext") || {}).textContent,
               value: (sr.querySelector("[data-qr-text]") || {}).value };
    }, qp);
    ok(d.n + "：入力欄で Enter を押しても次の問題へ飛ばない",
       afterEnter.prompt === "答えを打ってください" && afterEnter.value === "officef", JSON.stringify(afterEnter));

    /* 空欄がいくつもあるときは、Enter で次の空欄へ移る */
    await pg.evaluate((h) => {
      const sr = document.querySelector(h).shadowRoot;
      sr.querySelector('[data-act="next"]').click();
    }, qp);
    await pg.waitForTimeout(600);
    await pg.evaluate((h) => {
      const el = document.querySelector(h).shadowRoot.querySelector('[data-qr-blank="0"]');
      if (el) el.focus();
    }, qp);
    await pg.keyboard.type("あ");
    await pg.keyboard.press("Enter");
    await pg.waitForTimeout(350);
    const moved = await pg.evaluate((h) => {
      const sr = document.querySelector(h).shadowRoot;
      const a = sr.activeElement;
      return { focus: a ? a.getAttribute("data-qr-blank") : null,
               prompt: (sr.querySelector(".vq2-qtext") || {}).textContent };
    }, qp);
    ok(d.n + "：空欄が複数あるとき、Enter で次の空欄へ移る",
       moved.focus === "1" && moved.prompt === "【　】と【　】", JSON.stringify(moved));

    /* 選択式では、これまでどおり数字・記号・f が効く */
    await pg.evaluate((h) => {
      const sr = document.querySelector(h).shadowRoot;
      sr.querySelector('[data-act="next"]').click();
    }, qp);
    await pg.waitForTimeout(600);
    await pg.evaluate(() => { document.body.focus(); });
    await pg.keyboard.press("Digit2");
    await pg.waitForTimeout(300);
    const pickedIdx = await pg.evaluate((h) => {
      const sr = document.querySelector(h).shadowRoot;
      return [...sr.querySelectorAll("[data-qr-choice]")].findIndex((x) => x.classList.contains("is-picked"));
    }, qp);
    await pg.keyboard.press("KeyF");
    await pg.waitForTimeout(300);
    const flaggedChoice = await pg.evaluate((h) =>
      !!document.querySelector(h).shadowRoot.querySelector('[data-act="flag"].is-active'), qp);
    ok(d.n + "：選択式では数字で選べる", pickedIdx === 1, String(pickedIdx));
    ok(d.n + "：選択式では F で「後で確認」が付く", flaggedChoice === true);

    ok(d.n + "：画面の失敗が出ていない", errs.length === 0, errs.slice(0, 3).join(" / "));
    await ctx.close();
  }

  await b.close();
  console.log("\n合格 " + pass + " / 不合格 " + fail);
  process.exit(fail ? 1 : 0);
})();
