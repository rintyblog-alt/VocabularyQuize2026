/* AI の作業ログの見た目を、PC と狭い画面で確かめる（AI は呼ばない）。

   Claude Code の出し方へ寄せたので、密度が上がっている。
   **狭い画面で崩れないこと**をここで見る。
     ・横スクロールが出ない
     ・長い語や長い文で行が画面からはみ出さない
     ・押せる場所（詳細を見る）が 44px 以上
     ・1 件あたりの高さが小さくなっている（前より多く並ぶ）

   実行: node vqlogui.cjs
*/
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const URL = "http://127.0.0.1:8791/?vqdev=1";
const HIDE = `#vqbFlow,#mob-tut-overlay,#mobBarTutorial,#firstLaunchOverlay,#vqOnboardingOverlay{display:none !important;}`;
const OUT = path.join(__dirname, "shots", "log");

let pass = 0, fail = 0;
const log = [];
function ok(name, cond, extra) {
  if (cond) { pass++; log.push("  ✓ " + name + (extra ? " — " + extra : "")); }
  else { fail++; log.push("  ✗ " + name + (extra ? "\n      → " + extra : "")); }
}

/* 実際に出る種類をひととおり。長い文・長い語も混ぜる（折り返しの検査）。 */
const EVENTS = [
  { kind: "document", status: "done", title: "資料を読み取りました", short: "3 件・42 ページ / 12,480 字", at: Date.now() - 90000, duration: 11200 },
  { kind: "planning", status: "done", title: "出題形式の内訳", short: "選択（1つ選ぶ）12 問 / 正誤 8 問 / 短答 6 問 / 記述 4 問" },
  { kind: "generation", status: "done", title: "大問1 を作っています（8 問・25 点）", short: "3 問ずつに分けて頼みます", duration: 143000 },
  { kind: "success", status: "done", title: "大問1 に 8 問入りました", short: "合計 8 / 30 問" },
  { kind: "warning", status: "warn", title: "正誤問題の正解がどちら側か分かりませんでした",
    short: "この枠は空のままにします。当てずっぽうで正解を決めません。" },
  { kind: "error", status: "error", title: "資料から出題できる内容が足りませんでした",
    short: "読み取れたのは約 332 字で、この資料で作れるのは目安 2 問までです。資料を足すか、問題数を減らしてください。" },
  { kind: "validation", status: "done", title: "長い語の折り返し確認",
    short: "INSUFFICIENT_EVIDENCE_evidence_gate_rejected_too_little_content_abcdefghijklmnopqrstuvwxyz0123456789" },
  { kind: "generation", status: "running", title: "大問2 を作っています", short: "3 問ずつ・2 本並行" }
];

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
    setV(document.getElementById("authLoginNickname"), "logui");
    setV(document.getElementById("authLoginPassword"), "Abcd1234");
    document.getElementById("authLoginSubmitBtn").click();
  });
  await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 30000 });
  await pg.waitForTimeout(1500);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  for (const s of [{ n: "pc", w: 1440, h: 900 }, { n: "sp390", w: 390, h: 844 }, { n: "sp320", w: 320, h: 640 }]) {
    const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 2 });
    const pg = await ctx.newPage();
    await login(pg);

    const m = await pg.evaluate(async (events) => {
      /* Quick Mock を開いて、AI パネルへ作り物の作業ログを流し込む。 */
      const app = window.__logApp = VQ2.quickMock.open({});
      await new Promise((r) => setTimeout(r, 900));
      const mobile = window.innerWidth < 900;
      /* PC はわきを開く。狭い画面は下から引き出す。 */
      const openBtn = app.root.querySelector(mobile
        ? '[data-act="qm-pane"][data-id="side"]' : '[data-act="qm-side"]');
      if (openBtn) openBtn.click();
      await new Promise((r) => setTimeout(r, 500));

      /* パネルの中身を直接組み立てる（AI を呼ばずに同じ見た目を出す） */
      const host = app.root.querySelector("#qmAi");
      const panel = new VQ2.activity.Panel({ title: "AI アクティビティ", emptyText: "" });
      panel.mount(host);
      events.forEach((e) => panel.push(e));
      await new Promise((r) => setTimeout(r, 400));

      const rows = [...app.root.querySelectorAll(".vq2-tl-i")];
      const heights = rows.map((r) => Math.round(r.getBoundingClientRect().height));
      const listBox = app.root.querySelector(".vq2-tl-list");
      const lb = listBox ? listBox.getBoundingClientRect() : null;
      /* 行が親の枠から横へ出ていないか */
      let overflowRows = 0;
      rows.forEach((r) => {
        const b = r.getBoundingClientRect();
        if (lb && (b.right > lb.right + 1 || b.left < lb.left - 1)) overflowRows++;
      });
      /* 押せる場所の大きさ（狭い画面だけ 44px を求める） */
      const small = [];
      if (mobile) app.root.querySelectorAll(".vq2-tl-more").forEach((b) => {
        const bb = b.getBoundingClientRect();
        if (bb.height > 0 && bb.height < 44) small.push(Math.round(bb.height));
      });
      return {
        rows: rows.length,
        medianH: heights.sort((a, b) => a - b)[Math.floor(heights.length / 2)] || 0,
        maxH: Math.max(...heights, 0),
        overflowRows,
        listScrollX: listBox ? Math.max(0, listBox.scrollWidth - listBox.clientWidth) : -1,
        docOverflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
        small,
        hasLead: !!app.root.querySelector(".vq2-tl-lead"),
        hasDot: !!app.root.querySelector(".vq2-tl-dot"),
        /* 種類ごとにアイコンが違うか（全部同じなら、置いてある意味がない） */
        iconKinds: new Set([...app.root.querySelectorAll(".vq2-tl-ic svg")]
          .map((x) => x.innerHTML.slice(0, 40))).size
      };
    }, EVENTS);

    console.log(`\n══ 作業ログ（${s.n} ${s.w}px）══`);
    console.log(`  行 ${m.rows} 件 / 1 行の高さ 中央値 ${m.medianH}px・最大 ${m.maxH}px`);
    ok(`${s.n}：ログが並ぶ`, m.rows >= 8, String(m.rows));
    ok(`${s.n}：横スクロールが出ない`, m.docOverflow === 0 && m.listScrollX <= 0,
       `画面 ${m.docOverflow}px / 一覧 ${m.listScrollX}px`);
    ok(`${s.n}：行が枠からはみ出さない`, m.overflowRows === 0, `${m.overflowRows} 行`);
    ok(`${s.n}：1 行が高くなりすぎない`, m.medianH <= 72, `中央値 ${m.medianH}px`);
    if (s.n !== "pc") ok(`${s.n}：押せる場所が 44px 以上`, m.small.length === 0, JSON.stringify(m.small));
    ok(`${s.n}：ぶら下げの印と状態の丸が出る`, m.hasLead && m.hasDot,
       `⎿ ${m.hasLead} / 丸 ${m.hasDot}`);
    ok(`${s.n}：種類ごとにアイコンが違う`, m.iconKinds >= 4, `${m.iconKinds} 種`);

    await pg.screenshot({ path: path.join(OUT, `log-${s.n}.png`) });
    await ctx.close();
  }

  console.log("");
  log.forEach((l) => console.log(l));
  console.log(`\n══ まとめ ══\n  合格 ${pass} / 不合格 ${fail}\n画像: ${OUT}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
