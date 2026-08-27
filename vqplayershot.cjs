/* 学習プレイヤー（通常クイズ / VocabuSpeak）の見た目を、
   PC・390px・320px で撮って、はみ出しと隠れを数える。

   見るのは 3 つ。
     ・横スクロールが出ていないか
     ・下の固定操作が、回答欄や問題文を隠していないか
     ・押せる場所が 44px 以上あるか

   実行: node vqplayershot.cjs
*/
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const URL = "http://127.0.0.1:8791/?vqdev=1";
const HIDE = `#vqbFlow,#mob-tut-overlay,#mobBarTutorial,#firstLaunchOverlay,#vqOnboardingOverlay{display:none !important;}`;
const OUT = path.join(__dirname, "shots", "player");
const SIZES = [{ n: "pc", w: 1440, h: 900 }, { n: "sp390", w: 390, h: 844 }, { n: "sp320", w: 320, h: 640 }];

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
    setV(document.getElementById("authLoginNickname"), "playershot");
    setV(document.getElementById("authLoginPassword"), "Abcd1234");
    document.getElementById("authLoginSubmitBtn").click();
  });
  await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 30000 });
  await pg.waitForTimeout(1500);
}

/* 長さの違う問題・入力の要る問題を混ぜる（短い選択肢だけでは隠れが出ない）。 */
const PRESET = () => ({
  id: "shot-preset", name: "見た目の確認", ownerId: "playershot",
  questions: [
    { id: "q1", type: "multiple_choice_single", points: 10,
      prompt: "次の文章を読み、ドルヴァス朝の成立について正しく述べたものを一つ選びなさい。812年、ヴェルナ地方の諸侯を束ねたアスカル1世が都をリューンに置いた。",
      choices: [
        { id: "a", text: "アスカル1世は都をヴァルデに置いた", isCorrect: false },
        { id: "b", text: "アスカル1世は都をリューンに置いた", isCorrect: true },
        { id: "c", text: "ドルヴァス朝は839年に成立した", isCorrect: false },
        { id: "d", text: "ドルヴァス朝の成立時に三部会が置かれた", isCorrect: false }
      ] },
    { id: "q2", type: "long_answer", points: 20,
      prompt: "ザルカンド条約が結ばれた背景と、その内容を三点にまとめて説明しなさい。",
      correctAnswer: "牧草地戦争の消耗を背景に、国境・共同利用・関税引き下げを定めた。",
      expectedChars: 200 },
    { id: "q3", type: "short_answer", points: 10,
      prompt: "三部会を招集した王の名を答えなさい。", correctAnswer: "アスカル3世" }
  ]
});

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const report = [];

  for (const s of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 2 });
    const pg = await ctx.newPage();
    await login(pg);
    await pg.evaluate((preset) => {
      window.__shotApp = VQ2.quizPlayer.open({ preset, mode: "practice" });
    }, PRESET());
    await pg.waitForTimeout(1400);

    for (const qi of [0, 1]) {
      if (qi > 0) {
        await pg.evaluate(() => {
          const el = window.__shotApp.root.querySelector('[data-act="next"]');
          if (el) el.click();
        });
        await pg.waitForTimeout(700);
      }
      const m = await pg.evaluate(() => {
        const r = window.__shotApp.root;
        const host = r.getRootNode().host || r;
        const foot = r.querySelector("[data-qfoot]");
        /* 中身が入っている枠。共通シェルでは #pMain。
           古い名前（.vq2-pane-b / .vq2-body）だけを見ていると、
           見つからず **はみ出し 0 と出てしまう**（当たっていない検査になる）。 */
        const body = r.querySelector("#pMain")
          || r.querySelector(".vq2-pane-b") || r.querySelector(".vq2-body");
        const fr = foot ? foot.getBoundingClientRect() : null;
        /* 下の固定操作が中身を隠していないか。
           中身は自分の枠（vq2-pmain）の中でスクロールするので、
           **枠からはみ出た部分は「隠れている」ではなく「まだ下にある」**。
           それを混ぜると、長い問題がいつも失格になってしまう。
           ここでは「枠の中に見えているのに、操作列と重なっているもの」だけを数える。 */
        const scroller = r.querySelector("#pMain");
        const sr = scroller ? scroller.getBoundingClientRect() : null;
        let hidden = 0;
        if (fr && sr) {
          r.querySelectorAll(".vq2-qtext,.vq2-qanswer,.vq2-qbox input,.vq2-qbox textarea,.vq2-choice")
            .forEach((el) => {
              const b = el.getBoundingClientRect();
              if (b.height <= 0) return;
              const visibleTop = Math.max(b.top, sr.top);
              const visibleBottom = Math.min(b.bottom, sr.bottom);
              if (visibleBottom <= visibleTop) return;          /* 枠の外＝まだ見えていない */
              if (visibleBottom > fr.top + 1) hidden++;         /* 見えているのに操作列と重なる */
            });
        }
        /* 押せる場所の大きさ。44px を求めるのは **指で押す狭い画面**。
           マウスの画面では、44px 未満でも押しにくくはない。 */
        const isMobile = window.innerWidth < 900;
        const small = [];
        if (isMobile) {
          r.querySelectorAll("button").forEach((b) => {
            const bb = b.getBoundingClientRect();
            if (bb.width > 0 && (bb.height < 44 || bb.width < 44)) small.push(
              (b.getAttribute("data-act") || b.textContent.trim().slice(0, 8) || "?")
              + ":" + Math.round(bb.width) + "x" + Math.round(bb.height));
          });
        }
        return {
          /* 枠が見つからなかったら -1。0（＝合格）と混ぜない。 */
          overflowX: body ? Math.max(0, body.scrollWidth - body.clientWidth) : -1,
          docOverflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
          hiddenByFooter: hidden,
          footTop: fr ? Math.round(fr.top) : null,
          winH: window.innerHeight,
          smallTargets: small.slice(0, 8), smallCount: small.length,
          hostW: Math.round(host.getBoundingClientRect().width)
        };
      });
      report.push({ size: s.n, q: qi + 1, ...m });
      await pg.screenshot({ path: path.join(OUT, `quiz-${s.n}-q${qi + 1}.png`), fullPage: false });
    }
    await ctx.close();
  }

  console.log("\n══ 学習プレイヤーの見た目 ══");
  report.forEach((r) => {
    console.log(`  ${r.size} 問${r.q}: 横はみ出し ${r.docOverflow}px / 中身のはみ出し ${r.overflowX}px`
      + ` / 下の操作に隠れた要素 ${r.hiddenByFooter} 件 / 44px 未満の押せる場所 ${r.smallCount} 件`);
    if (r.smallCount) console.log(`      小さいもの: ${r.smallTargets.join(", ")}`);
  });
  console.log(`\n画像: ${OUT}`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
