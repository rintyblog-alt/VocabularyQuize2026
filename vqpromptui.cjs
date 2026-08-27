/* Quick Mock を資料 0 件で開いたときの画面を、実際のブラウザで見る。

   確かめること:
     ・資料カードが「資料は任意」と言う（出典が付かないことも先に言う）
     ・効かない設定（資料だけを根拠にする／出典を残す）が押せない
     ・何も書かずに「一気に作る」を押すと、資料ではなく**題材**を求められる
     ・題材を書いて押すと、資料が無くても生成へ進む（NO_SOURCE で止まらない）
     ・横はみ出しと JS エラーが無い

   実行: node vqpromptui.cjs [出力先]
*/
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
const OUT = process.argv[2] || "shots/promptui";
fs.mkdirSync(OUT, { recursive: true });

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  NG   " + name + (extra ? "  → " + extra : "")); }
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();
  const errors = [];
  pg.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));

  await pg.goto(BASE + "/?vqdev=1&vq2=all&cb=" + Date.now(),
    { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.waitForTimeout(2500);

  /* Quick Mock を開く（テスト専用の名前空間で、保存物には触らない）。
     V2 の画面は Shadow DOM の中にある。#vq2-quick-mock の shadowRoot が入口。 */
  await pg.evaluate(() => {
    window.__qmRoot = function () {
      const h = document.getElementById("vq2-quick-mock");
      return h && h.shadowRoot ? h.shadowRoot : null;
    };
  });
  const opened = await pg.evaluate(() => {
    const QM = window.VQ2 && window.VQ2.quickMock;
    if (!QM || !QM.open) return { ok: false, why: "quickMock が見つかりません" };
    QM.open({});
    return { ok: true };
  });
  if (!opened.ok) { console.log("  NG   Quick Mock を開けません: " + opened.why); process.exit(1); }
  await pg.waitForTimeout(1200);

  console.log("\n== 資料 0 件のときの表示 ==");
  const view = await pg.evaluate(() => {
    const root = window.__qmRoot();
    if (!root) return { missing: true };
    const txt = (root.querySelector(".vq2-root") || root).innerText || "";
    const boxes = [...root.querySelectorAll('input[data-key="sourceOnly"], input[data-key="requireSources"]')]
      .map((b) => ({ key: b.getAttribute("data-key"), disabled: b.disabled }));
    return {
      saysOptional: txt.indexOf("資料は任意です") >= 0,
      saysNoCitation: txt.indexOf("出典は付きません") >= 0,
      stillSaysMissing: txt.indexOf("使用する資料がありません") >= 0,
      boxes
    };
  });
  ok("画面が開いている", !view.missing);
  ok("「資料は任意です」と書いてある", view.saysOptional);
  ok("出典が付かないことを先に言う", view.saysNoCitation);
  ok("「使用する資料がありません」は出ない", !view.stillSaysMissing);
  ok("資料だけを根拠にする が押せない",
    view.boxes.some((b) => b.key === "sourceOnly" && b.disabled),
    JSON.stringify(view.boxes));

  console.log("\n== 題材が空のまま押したとき ==");
  const empty = await pg.evaluate(async () => {
    const root = window.__qmRoot();
    const btn = root.querySelector('[data-act="generate-direct"]');
    if (!btn) return { ok: false, why: "「一気に作る」が見つかりません" };
    btn.click();
    await new Promise((r) => setTimeout(r, 900));
    const dlg = root.querySelector(".vq2-dialog, .vq2-dialog-l");
    const t = dlg ? (dlg.innerText || "") : "";
    return { ok: true, shown: !!dlg, text: t.slice(0, 400) };
  });
  ok("押したときに何か出る", empty.shown, JSON.stringify(empty).slice(0, 200));
  ok("資料ではなく題材を求める",
    /どんな問題を作るのか|何を出題する/.test(empty.text), empty.text.slice(0, 160));
  ok("資料を足せとは言わない", !/資料を追加/.test(empty.text), empty.text.slice(0, 160));
  ok("書き方の例を出す", /明治維新|例/.test(empty.text), empty.text.slice(0, 160));
  await pg.screenshot({ path: path.join(OUT, "01-no-topic.png") });

  /* 出たものを閉じる */
  await pg.evaluate(() => {
    const root = window.__qmRoot();
    const b = root && root.querySelector('[data-act="dlg-o"]');
    if (b) b.click();
  });
  await pg.waitForTimeout(600);

  console.log("\n== 題材を書いて押したとき ==");
  const withTopic = await pg.evaluate(async () => {
    const root = window.__qmRoot();
    const ta = root.querySelector("textarea");
    if (!ta) return { ok: false, why: "指示欄が見つかりません" };
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, "value").set;
    setter.call(ta, "高校日本史・明治維新の要点から 4 問つくって");
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));

    /* サーバへは行かせない。どんな要求を作ったかだけを見る。 */
    const sent = [];
    const AI = window.VQ2 && window.VQ2.ai;
    const orig = AI && AI.generateMock;
    if (!orig) return { ok: false, why: "AI.generateMock が見つかりません" };
    AI.generateMock = function (o) {
      sent.push({ promptOnly: o.promptOnly, sourceOnly: o.sourceOnly,
                  requireEvidence: o.requireEvidence,
                  instruction: String(o.instruction || "").slice(0, 900),
                  attachments: (o.attachments || []).length });
      return Promise.reject(Object.assign(new Error("test"), { cancelled: true }));
    };
    const btn = root.querySelector('[data-act="generate-direct"]');
    btn.click();
    await new Promise((r) => setTimeout(r, 1500));
    AI.generateMock = orig;
    const dlg = root.querySelector(".vq2-dialog");
    return { ok: true, sent, blocked: !!dlg, dlgText: dlg ? (dlg.innerText || "").slice(0, 200) : "" };
  });

  if (!withTopic.ok) { console.log("  NG   " + withTopic.why); }
  else {
    ok("止められずに生成へ進む", withTopic.sent.length > 0,
      "blocked=" + withTopic.blocked + " " + withTopic.dlgText);
    const s = withTopic.sent[0] || {};
    ok("promptOnly を立てて送る", s.promptOnly === true, JSON.stringify(s).slice(0, 200));
    ok("sourceOnly を立てない", s.sourceOnly === false);
    ok("requireEvidence を立てない", s.requireEvidence === false);
    ok("資料は 0 件で送る", s.attachments === 0);
    ok("指示に題材が入っている", /明治維新/.test(s.instruction || ""));
    ok("指示に「資料だけを根拠に」を入れない",
      !/添付した資料だけを根拠/.test(s.instruction || ""));
    ok("指示に出典を書かせない旨が入る",
      /出典・ページ番号は書かないでください/.test(s.instruction || ""));
    ok("必須項目から出典の行が外れている",
      !/根拠にした資料の箇所/.test(s.instruction || ""));
  }
  await pg.screenshot({ path: path.join(OUT, "02-prompt-only.png") });

  console.log("\n== 見た目 ==");
  const layout = await pg.evaluate(() => ({
    overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)
  }));
  ok("横はみ出し 0px", layout.overflow === 0, layout.overflow + "px");
  ok("JS エラーなし", errors.length === 0, errors.join(" / "));

  console.log("\n合格 " + pass + " / 不合格 " + fail);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
