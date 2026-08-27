/* 並べ替え（ordering）が、PC でも指でも動かせるかを実測する。

   報告された不具合:
     ・文字が縦になる（1 文字ずつ改行されて縦書きのように見える）
     ・PC で「つまんで上下を入れ替える」ができない
     ・スマホで指でつまんで並び替えできない

   ここでは実際にドラッグして、**並びが変わったか**まで見る。
   「掴めた」だけでは意味がない（落とせて初めて並び替え）。

   実行: node vqorder.cjs
*/
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const URL = "http://127.0.0.1:8791/?vqdev=1";
const HIDE = `#vqbFlow,#mob-tut-overlay,#mobBarTutorial,#firstLaunchOverlay,#vqOnboardingOverlay{display:none !important;}`;
const OUT = path.join(__dirname, "shots", "order");

let pass = 0, fail = 0;
const log = [];
function ok(name, cond, extra) {
  if (cond) { pass++; log.push("  ✓ " + name + (extra ? " — " + extra : "")); }
  else { fail++; log.push("  ✗ " + name + (extra ? "\n      → " + extra : "")); }
}

/* 長めの文を入れる。短い語だけだと「縦になる」不具合が出ない。 */
const PRESET = {
  id: "ord-preset", name: "並べ替えの確認", ownerId: "ordtest",
  questions: [{
    id: "q1", type: "ordering", points: 10,
    prompt: "次の出来事を、起こった順に古いものから並べ替えなさい。",
    orderItems: [
      { id: "i1", text: "中大兄皇子と中臣鎌足が蘇我氏を倒し、大化の改新が始まった", order: 1 },
      { id: "i2", text: "大宝律令が完成し、律令国家の仕組みが整った", order: 2 },
      { id: "i3", text: "都を平城京へ移し、班田収授法が行われた", order: 3 },
      { id: "i4", text: "墾田永年私財法により、開墾地の永久私有が認められた", order: 4 }
    ],
    correctOrder: ["i1", "i2", "i3", "i4"],
    explanation: "年代順に並べる。"
  }]
};

async function login(pg) {
  await pg.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.addStyleTag({ content: HIDE });
  await pg.waitForFunction(() => document.getElementById("authLoginSubmitBtn"), { timeout: 20000 });
  await pg.evaluate(() => {
    const setV = (el, v) => {
      const p = el.tagName === "SELECT" ? HTMLSelectElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(p.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    setV(document.getElementById("authLoginGrade"), "H3");
    setV(document.getElementById("authLoginNickname"), "ordtest");
    setV(document.getElementById("authLoginPassword"), "Abcd1234");
    document.getElementById("authLoginSubmitBtn").click();
  });
  await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 30000 });
  await pg.waitForTimeout(1500);
}

async function openQuiz(pg) {
  await pg.evaluate((preset) => {
    window.__ordApp = VQ2.quizPlayer.open({ preset, mode: "practice", resume: false });
  }, PRESET);
  await pg.waitForFunction(() => {
    const a = window.__ordApp;
    return a && a.root && a.root.querySelector(".vq2-sort-i");
  }, { timeout: 20000 });
  await pg.waitForTimeout(400);
}

/* いまの並び（項目 id の列） */
const readOrder = (pg) => pg.evaluate(() =>
  [...window.__ordApp.root.querySelectorAll(".vq2-sort-i")].map((e) => e.getAttribute("data-drag-id")));

/* 行の中心座標（ページ座標） */
const boxOf = (pg, i) => pg.evaluate((idx) => {
  const e = window.__ordApp.root.querySelectorAll(".vq2-sort-i")[idx];
  const r = e.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
}, i);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  /* ══ 1) 文字が縦にならないか（PC / 390 / 320）══ */
  for (const s of [{ n: "pc", w: 1440, h: 900 }, { n: "sp390", w: 390, h: 844 }, { n: "sp320", w: 320, h: 640 }]) {
    const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 2 });
    const pg = await ctx.newPage();
    await login(pg);
    await openQuiz(pg);

    const m = await pg.evaluate(() => {
      const rows = [...window.__ordApp.root.querySelectorAll(".vq2-sort-i")];
      return rows.map((row) => {
        const m2 = row.querySelector(".vq2-sort-m");
        const span = m2 ? m2.querySelector("span:not(.vq2-choice-tag)") : null;
        const r = span ? span.getBoundingClientRect() : null;
        const cs = span ? getComputedStyle(span) : null;
        const lh = cs ? parseFloat(cs.lineHeight) || 24 : 24;
        return {
          w: r ? Math.round(r.width) : 0,
          h: r ? Math.round(r.height) : 0,
          /* 1 行の高さで割れば、およその行数。1 文字ずつ折れていれば行数が文字数に近づく */
          lines: r ? Math.round(r.height / lh) : 0,
          chars: (span ? span.textContent : "").trim().length,
          writingMode: cs ? cs.writingMode : ""
        };
      });
    });
    const worst = m.reduce((a, x) => (x.lines > a.lines ? x : a), m[0] || { lines: 0 });
    console.log(`\n══ 並べ替えの見た目（${s.n} ${s.w}px）══`);
    m.forEach((x, i) => console.log(`  行${i + 1}: 文字の幅 ${x.w}px / 高さ ${x.h}px / およそ ${x.lines} 行 / ${x.chars} 字`));
    ok(`${s.n}：文字が縦にならない`, worst.lines <= Math.max(4, Math.ceil(worst.chars / 8)),
       `いちばん折れている行が ${worst.lines} 行（${worst.chars} 字）`);
    ok(`${s.n}：文字の幅が十分ある`, m.every((x) => x.w >= Math.min(120, s.w * 0.35)),
       `最小 ${Math.min(...m.map((x) => x.w))}px`);
    ok(`${s.n}：縦書きになっていない`, m.every((x) => x.writingMode === "horizontal-tb"),
       m[0] ? m[0].writingMode : "");
    await pg.screenshot({ path: path.join(OUT, `order-${s.n}.png`) });
    await ctx.close();
  }

  /* ══ 2) PC：マウスでつまんで入れ替えられるか ══ */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pg = await ctx.newPage();
    await login(pg);
    await openQuiz(pg);
    const before = await readOrder(pg);
    const a = await boxOf(pg, 0), b = await boxOf(pg, 2);
    await pg.mouse.move(a.x, a.y);
    await pg.mouse.down();
    /* 少しずつ動かす（1 回で飛ばすと pointermove が 1 回しか出ない） */
    for (let i = 1; i <= 8; i++) {
      await pg.mouse.move(a.x, a.y + ((b.y - a.y) * i) / 8, { steps: 2 });
      await pg.waitForTimeout(20);
    }
    await pg.mouse.up();
    await pg.waitForTimeout(400);
    const after = await readOrder(pg);
    console.log(`\n══ PC：マウスで入れ替え ══\n  前 ${before.join(",")}\n  後 ${after.join(",")}`);
    ok("PC：つまんで運ぶと並びが変わる", before.join(",") !== after.join(","),
       `${before.join(",")} → ${after.join(",")}`);
    ok("PC：項目が消えたり増えたりしない", before.slice().sort().join(",") === after.slice().sort().join(","),
       after.join(","));
    await pg.screenshot({ path: path.join(OUT, "order-pc-after-drag.png") });
    await ctx.close();
  }

  /* ══ 3) スマホ：指でつまんで入れ替えられるか ══ */
  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2
    });
    const pg = await ctx.newPage();
    await login(pg);
    await openQuiz(pg);
    const before = await readOrder(pg);
    const a = await boxOf(pg, 0), b = await boxOf(pg, 2);

    /* 指の操作は CDP の touch で作る（Playwright の tap では長い drag が作れない）。 */
    const cdp = await ctx.newCDPSession(pg);
    const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", {
      type, touchPoints: type === "touchEnd" ? [] : [{ x, y, radiusX: 8, radiusY: 8, force: 1 }]
    });
    await touch("touchStart", a.x, a.y);
    await pg.waitForTimeout(60);
    for (let i = 1; i <= 8; i++) {
      await touch("touchMove", a.x, a.y + ((b.y - a.y) * i) / 8);
      await pg.waitForTimeout(30);
    }
    await touch("touchEnd", a.x, b.y);
    await pg.waitForTimeout(400);
    const after = await readOrder(pg);
    console.log(`\n══ スマホ：指で入れ替え ══\n  前 ${before.join(",")}\n  後 ${after.join(",")}`);
    ok("スマホ：指でつまんで運ぶと並びが変わる", before.join(",") !== after.join(","),
       `${before.join(",")} → ${after.join(",")}`);
    ok("スマホ：項目が消えたり増えたりしない", before.slice().sort().join(",") === after.slice().sort().join(","),
       after.join(","));
    await pg.screenshot({ path: path.join(OUT, "order-sp-after-drag.png") });
    await ctx.close();
  }

  /* ══ 4) 上下ボタンでも動く（つまむのが苦手な人のため）══ */
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const pg = await ctx.newPage();
    await login(pg);
    await openQuiz(pg);
    const before = await readOrder(pg);
    await pg.evaluate(() => {
      const b = window.__ordApp.root.querySelector('[data-act="qr-down"]');
      if (b) b.click();
    });
    await pg.waitForTimeout(350);
    const after = await readOrder(pg);
    ok("上下ボタンでも動く", before.join(",") !== after.join(","), `${before.join(",")} → ${after.join(",")}`);
    await ctx.close();
  }

  /* ══ 5) 同じ仕組みを使う他の形式も動くか ══
     落とす先を座標で探すところ（zoneAt）は、並べ替え・組み合わせ・分類・
     画像ラベルで共通。影の DOM の不具合は **全部**に効いていたはずなので、
     代表として組み合わせと分類も見る。 */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pg = await ctx.newPage();
    await login(pg);
    const kinds = [
      { name: "組み合わせ", preset: {
        id: "mt", name: "組み合わせ", ownerId: "ordtest",
        questions: [{ id: "q1", type: "matching", points: 10, prompt: "対応するものを結びなさい。",
          pairs: { left: [{ id: "L1", text: "大化の改新" }, { id: "L2", text: "大宝律令" }],
                   right: [{ id: "R1", text: "645年" }, { id: "R2", text: "701年" }],
                   correct: { L1: "R1", L2: "R2" } },
          explanation: "年で対応する。" }] } },
      { name: "分類", preset: {
        id: "cl", name: "分類", ownerId: "ordtest",
        /* 分類は q.classification の中に groups / items を持つ（renderer に合わせる）。 */
        questions: [{ id: "q1", type: "classification", points: 10, prompt: "次の語を分けなさい。",
          classification: {
            groups: [{ id: "g1", label: "奈良時代" }, { id: "g2", label: "平安時代" }],
            items: [{ id: "c1", text: "平城京", groupId: "g1" }, { id: "c2", text: "平安京", groupId: "g2" }]
          },
          explanation: "都で分ける。" }] } }
    ];
    for (const k of kinds) {
      const opened = await pg.evaluate((preset) => {
        if (window.__ordApp) { try { window.__ordApp.close("t"); } catch (e) {} }
        try { window.__ordApp = VQ2.quizPlayer.open({ preset, mode: "practice", resume: false }); }
        catch (e) { return "ERR:" + String(e && e.message).slice(0, 60); }
        return !!window.__ordApp;
      }, k.preset);
      await pg.waitForTimeout(900);
      const r = await pg.evaluate(() => {
        const root = window.__ordApp && window.__ordApp.root;
        if (!root) return null;
        const zones = root.querySelectorAll("[data-drop-zone]");
        const grabs = root.querySelectorAll("[data-drag-id]");
        if (!zones.length || !grabs.length) return { zones: zones.length, grabs: grabs.length, hit: null };
        const z = zones[zones.length - 1].getBoundingClientRect();
        const x = z.left + z.width / 2, y = z.top + z.height / 2;
        const rn = root.getRootNode();
        const el = rn.elementFromPoint ? rn.elementFromPoint(x, y) : null;
        return { zones: zones.length, grabs: grabs.length,
                 hit: el ? !!el.closest("[data-drop-zone]") : false };
      });
      ok(`${k.name}：落とす先を座標で見つけられる`,
         !!(r && r.zones > 0 && r.grabs > 0 && r.hit === true),
         r ? `置き先 ${r.zones} / つまめる ${r.grabs} / 座標で当たる ${r.hit}` : "開けなかった: " + opened);
    }
    await ctx.close();
  }

  console.log("");
  log.forEach((l) => console.log(l));
  console.log(`\n══ まとめ ══\n  合格 ${pass} / 不合格 ${fail}\n画像: ${OUT}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
