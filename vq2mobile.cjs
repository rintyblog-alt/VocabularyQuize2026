/* 4 画面のモバイル対応と、作り直した Quick Mock の設定画面を確かめる。
   測るのは「実際に画面へ出ている形」だけ。横あふれ・タップ領域・重なりを DOM から測る。 */
const { chromium } = require("playwright");

let pass = 0, fail = 0;
const consoleErrors = [];
async function step(name, fn) {
  try { const r = await fn(); pass++; console.log("  ✓ " + name + (r ? " — " + r : "")); }
  catch (e) { fail++; console.log("  ✗ " + name + " — " + e.message); }
}
function assert(c, m) { if (!c) throw new Error(m || "assertion failed"); }

const HIDE = "#vqNewAuth{display:none !important}";
const SIZES = [
  { name: "iPhone 12 相当 390×844", w: 390, h: 844 },
  { name: "小さい端末 320×568", w: 320, h: 568 }
];

async function login(pg) {
  await pg.goto("http://127.0.0.1:8791/?vqdev=1", { waitUntil: "domcontentloaded", timeout: 30000 });
  await pg.addStyleTag({ content: HIDE });
  await pg.waitForFunction(() => document.getElementById("authLoginSubmitBtn"), { timeout: 20000 });
  await pg.evaluate(() => {
    const setV = (el, v) => {
      const p = el.tagName === "SELECT" ? HTMLSelectElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(p.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    setV(document.getElementById("authLoginGrade"), "H3");
    setV(document.getElementById("authLoginNickname"), "tester");
    setV(document.getElementById("authLoginPassword"), "Abcd1234");
    document.getElementById("authLoginSubmitBtn").click();
  });
  await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 30000 });
  await pg.addStyleTag({ content: HIDE });
  await pg.waitForTimeout(2500);
  for (let i = 0; i < 3; i++) {
    const c = await pg.evaluate(() => {
      const bd = document.querySelector(".ui-modal-backdrop");
      if (!bd || getComputedStyle(bd).display === "none") return false;
      const b2 = document.getElementById("uiModalOk") || document.getElementById("uiModalCancel");
      if (b2) { b2.click(); return true; } return false;
    });
    if (!c) break;
    await pg.waitForTimeout(300);
  }
  await pg.evaluate(() => { const n = document.getElementById("vqNewAuth"); if (n) n.style.display = "none"; });
}

async function waitHost(pg, id, ms) {
  await pg.waitForFunction((i) => {
    const h = document.getElementById(i);
    return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vq2-root"));
  }, id, { timeout: ms || 15000 });
}
async function closeHost(pg, id) {
  await pg.evaluate((i) => { const h = document.getElementById(i); if (h && h.__vq2) h.__vq2.forceClose("test"); }, id);
  await pg.waitForTimeout(300);
}

/* 画面を一枚まるごと測る。
   ・横あふれ … .vq2-root の中で、右端が画面幅を超える要素
   ・小さすぎる操作 … 押せる要素で高さが 44px 未満のもの
   ・はみ出す文字 … 親より横に広がっているテキスト要素 */
const MEASURE = `
  const host = document.getElementById(args[0]);
  const root = host.shadowRoot.querySelector(".vq2-root");
  const W = window.innerWidth;
  const over = [], small = [];
  const all = root.querySelectorAll("*");
  for (const el of all) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.right > W + 1) over.push({ t: el.className || el.tagName, x: Math.round(r.right - W) });
    const tag = el.tagName;
    const clickable = tag === "BUTTON" || tag === "A" ||
      (tag === "INPUT" && el.type !== "hidden" && el.type !== "checkbox") || tag === "SELECT" || tag === "TEXTAREA";
    if (clickable && !el.disabled && r.height > 0 && r.height < 43.5)
      small.push({ t: (el.className || tag) + ":" + (el.textContent || "").trim().slice(0, 12), h: Math.round(r.height) });
  }
  const sc = root.querySelector(".vq2-body") || root;
  return {
    over: over.slice(0, 6), overN: over.length,
    small: small.slice(0, 6), smallN: small.length,
    docOverflow: Math.max(0, Math.round(document.documentElement.scrollWidth - W)),
    isMobile: root.classList.contains("is-mobile"),
    tabs: root.querySelectorAll(".vq2-tabs button, [data-pane], [data-act$='-tab']").length,
    panesShown: Array.from(root.querySelectorAll(".vq2-pane, #wsLeft, #wsMain"))
      .filter((p) => !p.hasAttribute("hidden") && getComputedStyle(p).display !== "none").length
  };`;

async function measure(pg, id) {
  return pg.evaluate(({ src, args }) => new Function("args", src)(args), { src: MEASURE, args: [id] });
}
function ok(m, label) {
  assert(m.isMobile, label + ": モバイル指定になっていない");
  assert(m.overN === 0, label + ": 横あふれ " + m.overN + " 件 " + JSON.stringify(m.over));
  assert(m.docOverflow === 0, label + ": ページが横に " + m.docOverflow + "px はみ出す");
  assert(m.smallN === 0, label + ": 44px 未満の操作 " + m.smallN + " 件 " + JSON.stringify(m.small));
  return "ペイン " + m.panesShown + " / タブ " + m.tabs + " / 横あふれ 0px / 小さい操作 0 個";
}

/* 検証用のデータを作る（実際の保存 API を通す） */
async function seed(pg) {
  return pg.evaluate(() => {
    const S = window.VQ2.schema, ST = window.VQ2.store;
    const qs = [];
    for (let i = 1; i <= 4; i++) {
      qs.push(S.emptyQuestion({
        prompt: "モバイル確認の問題 " + i + "。少し長めの問題文を入れて、折り返しの様子も見ます。",
        choices: [
          { id: "c1", label: "A", text: "選択肢のいち", explanation: "", isCorrect: i % 2 === 1 },
          { id: "c2", label: "B", text: "選択肢のに", explanation: "", isCorrect: i % 2 === 0 },
          { id: "c3", label: "C", text: "選択肢のさん", explanation: "", isCorrect: false }
        ]
      }));
    }
    const p = S.emptyPreset({ name: "モバイル確認プリセット", questions: qs });
    const saved = ST.savePreset(p);
    return saved.ok ? saved.preset.id : null;
  });
}

(async () => {
  const browser = await chromium.launch();

  for (const size of SIZES) {
    console.log("\n══ " + size.name + " ══");
    const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h }, isMobile: true, hasTouch: true });
    const pg = await ctx.newPage();
    pg.on("console", (m) => { if (m.type() === "error") consoleErrors.push(size.w + ": " + m.text().slice(0, 160)); });
    pg.on("pageerror", (e) => consoleErrors.push(size.w + " pageerror: " + String(e).slice(0, 160)));
    await login(pg);
    const presetId = await seed(pg);
    assert(presetId, "検証用プリセットを作れなかった");

    await step("Preset Studio", async () => {
      await pg.evaluate((id) => window.VQ2.open.presetStudio({ preset: window.VQ2.store.getPreset(id) }), presetId);
      await waitHost(pg, "vq2-preset-studio");
      await pg.waitForTimeout(500);
      const m = await measure(pg, "vq2-preset-studio");
      const r = ok(m, "Preset Studio");
      /* タブで表示が切り替わること */
      const switched = await pg.evaluate(() => {
        const root = document.getElementById("vq2-preset-studio").shadowRoot.querySelector(".vq2-root");
        const tabs = root.querySelectorAll("[data-pane]");
        if (tabs.length < 2) return -1;
        /* 最後のタブ＝AI。押すと下からシートが出て、メインは隠れる。 */
        tabs[tabs.length - 1].click();
        const sheet = root.querySelector(".vq2-ws-sheet.is-open");
        const main = root.querySelector("#wsMain");
        const mainHidden = !main || main.hasAttribute("hidden") || getComputedStyle(main).display === "none";
        return (sheet && mainHidden) ? 1 : 0;
      });
      assert(switched === 1, "タブを押しても 1 ペインにならない: " + switched);
      await closeHost(pg, "vq2-preset-studio");
      return r;
    });

    await step("プリセットの詳細（シート）", async () => {
      await pg.evaluate((id) => {
        window.VQ2.presetDetail.open({ preset: window.VQ2.store.getPreset(id) });
      }, presetId);
      await waitHost(pg, "vq2-preset-detail");
      await pg.waitForTimeout(500);
      const m = await measure(pg, "vq2-preset-detail");
      assert(m.isMobile, "モバイル指定になっていない");
      assert(m.overN === 0, "横あふれ " + m.overN + " 件 " + JSON.stringify(m.over));
      assert(m.docOverflow === 0, "ページが横に " + m.docOverflow + "px はみ出す");
      assert(m.smallN === 0, "44px 未満の操作 " + m.smallN + " 件 " + JSON.stringify(m.small));
      const g = await pg.evaluate(() => {
        const root = document.getElementById("vq2-preset-detail").shadowRoot.querySelector(".vq2-root");
        const r = root.getBoundingClientRect();
        return { sheet: root.classList.contains("is-sheet"),
                 bottom: Math.round(window.innerHeight - r.bottom),
                 h: Math.round(r.height), w: Math.round(r.width),
                 acts: root.querySelectorAll(".vq2-pd-foot [data-act]").length };
      });
      assert(g.sheet, "シートになっていない");
      assert(g.h <= size.h, "画面より高い: " + g.h);
      assert(g.acts >= 3, "操作が足りない: " + g.acts);
      /* モバイルは画面下いっぱいに出す（片手で操作できる位置） */
      assert(g.w === size.w, "画面幅いっぱいになっていない: " + g.w + " / " + size.w);
      assert(g.bottom === 0, "下端から浮いている: " + g.bottom + "px");
      await closeHost(pg, "vq2-preset-detail");
      return "下から出るシート " + g.w + "×" + g.h + " / 操作 " + g.acts + " 個 / 横あふれ 0px";
    });

    await step("Quiz Player", async () => {
      await pg.evaluate((id) => {
        window.VQ2.open.quiz({ preset: window.VQ2.store.getPreset(id), mode: "practice", resume: false });
      }, presetId);
      await waitHost(pg, "vq2-quiz-player");
      await pg.waitForTimeout(500);
      const m = await measure(pg, "vq2-quiz-player");
      const r = ok(m, "Quiz Player");
      /* 選択肢が押せる大きさか */
      const ch = await pg.evaluate(() => {
        const root = document.getElementById("vq2-quiz-player").shadowRoot.querySelector(".vq2-root");
        /* ★ 選択肢の印は data-qr-choice（ui/question-renderer.js が付ける）。
           古い data-choice は もう どこにも 付いていない（実測 2026-08-17:
           選択肢は 60px で ちゃんと出ているのに 0 件と数えていた）。 */
        const cs = Array.from(root.querySelectorAll("[data-qr-choice],[data-choice]"));
        return cs.map((c) => Math.round(c.getBoundingClientRect().height));
      });
      assert(ch.length > 0, "選択肢が出ていない");
      assert(ch.every((h) => h >= 44), "選択肢が小さい: " + ch.join(","));
      await closeHost(pg, "vq2-quiz-player");
      return r + " / 選択肢 " + ch.length + " 個すべて 44px 以上";
    });

    await step("Quick Mock（作り直した設定画面）", async () => {
      await pg.evaluate(() => window.VQ2.open.quickMock({}));
      await waitHost(pg, "vq2-quick-mock");
      await pg.waitForTimeout(500);
      const m = await measure(pg, "vq2-quick-mock");
      const r = ok(m, "Quick Mock");
      const s = await pg.evaluate(() => {
        const root = document.getElementById("vq2-quick-mock").shadowRoot.querySelector(".vq2-root");
        return {
          kinds: root.querySelectorAll("[data-kind]").length,
          accClosed: root.querySelectorAll('.vq2-acc-b').length,
          fields: root.querySelectorAll(".vq2-field").length
        };
      });
      assert(s.kinds === 4, "型カードが 4 つでない: " + s.kinds);
      assert(s.accClosed === 0, "細かい設定が最初から開いている");
      assert(s.fields <= 8, "最初から出ている入力欄が多すぎる: " + s.fields);
      return r + " / 型 4・最初の入力欄 " + s.fields + " 個・細かい設定は畳んだ状態";
    });

    await step("Quick Mock: 型を選ぶと条件が入り、細かい設定も開ける", async () => {
      const applied = await pg.evaluate(() => {
        const root = document.getElementById("vq2-quick-mock").shadowRoot.querySelector(".vq2-root");
        root.querySelector('[data-kind="quiz"]').click();
        const v = (k) => root.querySelector('[data-key="' + k + '"]').value;
        return { min: v("durationMinutes"), pts: v("totalPoints") };
      });
      assert(applied.min === "15" && applied.pts === "50", "型が反映されない: " + JSON.stringify(applied));
      const opened = await pg.evaluate(() => {
        const root = document.getElementById("vq2-quick-mock").shadowRoot.querySelector(".vq2-root");
        root.querySelector('[data-fold="detail"]').click();
        const r2 = document.getElementById("vq2-quick-mock").shadowRoot.querySelector(".vq2-root");
        return r2.querySelectorAll(".vq2-wsc-b [data-type], .vq2-acc-b [data-type]").length;
      });
      assert(opened > 0, "細かい設定が開かない");
      await pg.waitForTimeout(300);
      const m = await measure(pg, "vq2-quick-mock");
      const r = ok(m, "Quick Mock（展開後）");
      await closeHost(pg, "vq2-quick-mock");
      return "小テスト＝15分・50点 / 形式 " + opened + " 種 / " + r;
    });

    await step("Digital Exam（問題冊子と解答欄）", async () => {
      const built = await pg.evaluate(() => {
        const MB = window.VQ2.mockBuilder, S = window.VQ2.schema;
        const draft = {
          title: "モバイル確認テスト",
          sections: [
            { name: "第一問", questions: [
              { id: "1", type: "multiple_choice", question: "つぎのうち正しいものを選びなさい。", points: 20,
                choices: [{ symbol: "a", text: "ひとつめ" }, { symbol: "b", text: "ふたつめ" }], difficulty: "easy", topic: "確認" },
              { id: "2", type: "short_answer", question: "空欄に入る語を書きなさい。", points: 20,
                choices: [], difficulty: "normal", topic: "確認" }
            ]},
            { name: "第二問", questions: [
              { id: "3", type: "descriptive", question: "理由を 100 字程度で説明しなさい。", points: 60,
                choices: [], difficulty: "hard", topic: "確認", expectedChars: 100 }
            ]}
          ],
          answerKey: [
            { id: "1", answer: "a", explanation: "ひとつめが正しいです。" },
            { id: "2", answer: "こたえ", explanation: "そのままです。" },
            { id: "3", answer: "理由が書けていれば可。", explanation: "根拠が 2 つあれば満点です。" }
          ]
        };
        const spec = MB.fromDraft(draft, {
          title: "モバイル確認テスト", subject: "確認", grade: "高3",
          durationMinutes: 50, totalPoints: 100, sourceMode: "source-preferred",
          paper: S.defaultPaper(), ownerId: window.VQ2.store.currentOwnerId()
        });
        const fin = MB.finalize(spec);
        if (!fin.ok) return null;
        const plan = window.VQ2.layout.buildPlan(fin.spec);
        window.__mSpec = fin.spec; window.__mPlan = plan;
        window.VQ2.open.exam({ spec: fin.spec, manifest: window.VQ2.layout.buildManifest(fin.spec, plan), plan: plan });
        return true;
      });
      assert(built, "試験を組み立てられなかった");
      await waitHost(pg, "vq2-exam-workspace");
      await pg.waitForTimeout(900);
      const m = await measure(pg, "vq2-exam-workspace");
      const r = ok(m, "Digital Exam");
      /* 解答欄が全問ぶんあり、タブで冊子と答案を行き来できる */
      const s = await pg.evaluate(() => {
        const root = document.getElementById("vq2-exam-workspace").shadowRoot.querySelector(".vq2-root");
        const rows = root.querySelectorAll("[data-arow]").length;
        const tabs = root.querySelectorAll("[data-etab]");
        if (tabs.length) tabs[0].click();
        return { rows: rows, tabs: tabs.length };
      });
      assert(s.rows >= 3, "解答欄が足りない: " + s.rows);
      assert(s.tabs >= 2, "冊子と答案を切り替えるタブが無い: " + s.tabs);
      await pg.waitForTimeout(400);
      const m2 = await measure(pg, "vq2-exam-workspace");
      assert(m2.overN === 0 && m2.docOverflow === 0, "タブ切替後に横あふれ");
      assert(m2.panesShown === 1, "モバイルなのに 2 ペイン出ている: " + m2.panesShown);
      await closeHost(pg, "vq2-exam-workspace");
      return r + " / 解答欄 " + s.rows + " 件 / タブ " + s.tabs + " 枚";
    });

    await step("Result View", async () => {
      /* 実際に解いて結果を作る */
      await pg.evaluate((id) => {
        window.VQ2.open.quiz({ preset: window.VQ2.store.getPreset(id), mode: "exam", resume: false });
      }, presetId);
      await waitHost(pg, "vq2-quiz-player");
      for (let i = 0; i < 4; i++) {
        await pg.evaluate((last) => {
          const root = document.getElementById("vq2-quiz-player").shadowRoot.querySelector(".vq2-root");
          const c = root.querySelector("[data-choice]"); if (c) c.click();
          const b = root.querySelector('[data-act="' + (last ? "submit" : "next") + '"]'); if (b) b.click();
        }, i === 3);
        await pg.waitForTimeout(350);
      }
      await pg.evaluate(() => {
        const root = document.getElementById("vq2-quiz-player").shadowRoot.querySelector(".vq2-root");
        const b = root.querySelector('[data-act="dlg-o"]'); if (b) b.click();
      }).catch(() => {});
      await pg.waitForTimeout(1800);
      const has = await pg.evaluate(() => !!document.getElementById("vq2-result-view"));
      if (!has) {
        await pg.evaluate(() => window.VQ2.open.result({ result: window.VQ2.store.results.list()[0] }));
      }
      await waitHost(pg, "vq2-result-view");
      await pg.waitForTimeout(600);
      const m = await measure(pg, "vq2-result-view");
      const r = ok(m, "Result View");
      /* 3 つのタブがどれも横あふれしない */
      const tabs = await pg.evaluate(() => {
        const root = document.getElementById("vq2-result-view").shadowRoot.querySelector(".vq2-root");
        return root.querySelectorAll("[data-rvtab]").length;
      });
      assert(tabs === 3, "結果画面のタブが 3 枚でない: " + tabs);
      for (let i = 0; i < tabs; i++) {
        await pg.evaluate((n) => {
          const root = document.getElementById("vq2-result-view").shadowRoot.querySelector(".vq2-root");
          root.querySelectorAll("[data-rvtab]")[n].click();
        }, i);
        await pg.waitForTimeout(350);
        const mm = await measure(pg, "vq2-result-view");
        assert(mm.overN === 0 && mm.docOverflow === 0, "タブ " + (i + 1) + " で横あふれ");
      }
      await closeHost(pg, "vq2-result-view");
      return r + " / タブ " + tabs + " 枚とも横あふれ 0px";
    });

    await ctx.close();
  }

  console.log("\n══ 共通 ══");
  await step("Console エラー 0 件", async () => {
    const v2 = consoleErrors.filter((e) => !/favicon|net::ERR|Failed to load resource/i.test(e));
    assert(v2.length === 0, v2.join(" / "));
    return "0 件";
  });

  await browser.close();
  console.log(`\n結果: ${pass} / ${pass + fail} 通過` + (fail ? `（失敗 ${fail}）` : ""));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
