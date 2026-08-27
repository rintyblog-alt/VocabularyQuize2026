/* 「学習プレイヤー」の設定が、**本当に効いているか**を確かめる。

   置いただけで誰も読まない設定は、あるだけで嘘になる。
   だからここでは 1 項目ずつ、変えたあとの画面を見て確かめる。

     設定を変える → VQ2.playerPrefs へ届く → 解いている画面が変わる

   実行: node vqplayerset.cjs
*/
const { chromium } = require("playwright");

const URL = "http://127.0.0.1:8791/?vqdev=1";
const HIDE = `#vqbFlow,#mob-tut-overlay,#mobBarTutorial,#firstLaunchOverlay,#vqOnboardingOverlay{display:none !important;}`;

let pass = 0, fail = 0;
const log = [];
function ok(name, cond, extra) {
  if (cond) { pass++; log.push("  ✓ " + name + (extra ? " — " + extra : "")); }
  else { fail++; log.push("  ✗ " + name + (extra ? "\n      → " + extra : "")); }
}

const PRESET = {
  id: "set-preset", name: "設定の確認", ownerId: "setcheck",
  questions: [1, 2, 3, 4].map((i) => ({
    id: "q" + i, type: "multiple_choice_single", points: 10, prompt: "問題 " + i,
    choices: [{ id: "a", text: "あ", isCorrect: i % 2 === 0 }, { id: "b", text: "い", isCorrect: i % 2 === 1 }]
  }))
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
    setV(document.getElementById("authLoginNickname"), "setcheck");
    setV(document.getElementById("authLoginPassword"), "Abcd1234");
    document.getElementById("authLoginSubmitBtn").click();
  });
  await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 30000 });
  await pg.waitForTimeout(1500);
}

/* 設定を変えて、クイズを開き直し、画面から読み取る */
async function withSetting(pg, patch, read) {
  return pg.evaluate(async ({ patch, readSrc }) => {
    if (window.__setApp) { try { window.__setApp.close("test"); } catch (e) {} }
    Object.keys(patch).forEach((k) => window.__vqSet.set(k, patch[k]));
    await new Promise((r) => setTimeout(r, 120));
    window.__setApp = VQ2.quizPlayer.open({ preset: window.__setPreset, mode: "practice", resume: false });
    for (let i = 0; i < 60 && !window.__setApp.root.querySelector(".vq2-pmain"); i++)
      await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 250));
    // eslint-disable-next-line no-new-func
    return new Function("app", "return (" + readSrc + ")(app)")(window.__setApp);
  }, { patch, readSrc: read.toString() });
}

(async () => {
  const browser = await chromium.launch();
  const pg = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await login(pg);
  await pg.evaluate((p) => { window.__setPreset = p; }, PRESET);

  console.log("\n══ 学習プレイヤーの設定 ══");

  /* 1) 設定画面に出ているか */
  const listed = await pg.evaluate(() => {
    const S = window.__vqSet;
    if (!S) return null;
    const g = S.groups().filter((x) => x.id === "player")[0];
    return { group: !!g, label: g && g.label, count: S.inGroup("player").length,
             ids: S.inGroup("player").map((x) => x.id) };
  });
  ok("設定に「学習プレイヤー」の分類がある", !!(listed && listed.group), listed && listed.label);
  ok("項目が並んでいる", !!(listed && listed.count >= 15), listed && String(listed.count));

  /* 2) 設定 → playerPrefs へ届くか */
  const bridged = await pg.evaluate(async () => {
    window.__vqSet.set("player.fontSize", "large");
    await new Promise((r) => setTimeout(r, 150));
    const a = VQ2.playerPrefs.get("fontSize");
    window.__vqSet.set("player.fontSize", "standard");
    await new Promise((r) => setTimeout(r, 150));
    return { a, b: VQ2.playerPrefs.get("fontSize") };
  });
  ok("設定を変えると playerPrefs へ届く", bridged.a === "large" && bridged.b === "standard",
     JSON.stringify(bridged));

  /* 3) 文字の大きさが画面へ効くか */
  const fontStd = await withSetting(pg, { "player.fontSize": "standard" },
    (app) => getComputedStyle(app.root).getPropertyValue("--vq-pfont").trim());
  const fontXl = await withSetting(pg, { "player.fontSize": "xlarge" },
    (app) => getComputedStyle(app.root).getPropertyValue("--vq-pfont").trim());
  ok("文字の大きさが画面へ効く", fontStd === "1rem" && fontXl === "1.25rem", `${fontStd} → ${fontXl}`);

  /* 4) 問題文の幅 */
  const wNarrow = await withSetting(pg, { "player.fontSize": "standard", "player.maxWidth": "narrow" },
    (app) => Math.round(app.root.querySelector(".vq2-pmain-in").getBoundingClientRect().width));
  const wWide = await withSetting(pg, { "player.maxWidth": "wide" },
    (app) => Math.round(app.root.querySelector(".vq2-pmain-in").getBoundingClientRect().width));
  ok("問題文の幅が変わる", wWide > wNarrow + 100, `${wNarrow}px → ${wWide}px`);

  /* 5) 問題の一覧の出し入れ */
  const listOn = await withSetting(pg, { "player.maxWidth": "standard", "player.listPanel": true },
    (app) => !!app.root.querySelector(".vq2-pside"));
  const listOff = await withSetting(pg, { "player.listPanel": false },
    (app) => !!app.root.querySelector(".vq2-pside"));
  ok("問題の一覧を出す／出さないが効く", listOn === true && listOff === false, `${listOn} → ${listOff}`);

  /* 6) 集中モードは一覧を隠す */
  const focus = await withSetting(pg, { "player.listPanel": true, "player.density": "focus" },
    (app) => ({ cls: app.root.classList.contains("is-pfocus"),
                side: app.root.querySelector(".vq2-pside")
                  ? getComputedStyle(app.root.querySelector(".vq2-pside")).display : "none" }));
  ok("集中モードで右の一覧が消える", focus.cls === true && focus.side === "none", JSON.stringify(focus));

  /* 7) 進み具合・時間・保存の表示 */
  const chromeOn = await withSetting(pg, { "player.density": "standard", "player.showProgress": true, "player.showTimer": true, "player.showSave": true },
    (app) => ({ p: !!app.root.querySelector(".vq2-phead-p"),
                t: /残り|\d\d:\d\d/.test(app.root.querySelector(".vq2-top").textContent),
                s: !!app.root.querySelector(".vq2-psave") }));
  const chromeOff = await withSetting(pg, { "player.showProgress": false, "player.showTimer": false, "player.showSave": false },
    (app) => ({ p: !!app.root.querySelector(".vq2-phead-p"),
                t: /\d\d:\d\d/.test(app.root.querySelector(".vq2-top").textContent),
                s: !!app.root.querySelector(".vq2-psave") }));
  ok("進み具合を消せる", chromeOn.p === true && chromeOff.p === false, JSON.stringify([chromeOn.p, chromeOff.p]));
  ok("時間を消せる", chromeOn.t === true && chromeOff.t === false, JSON.stringify([chromeOn.t, chromeOff.t]));
  ok("保存の状態を消せる", chromeOn.s === true && chromeOff.s === false, JSON.stringify([chromeOn.s, chromeOff.s]));

  /* 8) 答えたら自動で次へ */
  const auto = await pg.evaluate(async () => {
    const step = async (on) => {
      if (window.__setApp) { try { window.__setApp.close("test"); } catch (e) {} }
      window.__vqSet.set("player.autoNext", on);
      window.__vqSet.set("player.showProgress", true);
      await new Promise((r) => setTimeout(r, 150));
      const app = window.__setApp = VQ2.quizPlayer.open({ preset: window.__setPreset, mode: "practice", resume: false });
      for (let i = 0; i < 60 && !app.root.querySelector(".vq2-prog-n"); i++)
        await new Promise((r) => setTimeout(r, 100));
      const at = () => Number((app.root.querySelector(".vq2-prog-n").textContent.match(/(\d+)/) || [])[1]);
      const before = at();
      const c = app.root.querySelector(".vq2-choice");
      if (c) c.click();
      await new Promise((r) => setTimeout(r, 500));
      return at() - before;
    };
    return { off: await step(false), on: await step(true) };
  });
  ok("既定では自動で進まない", auto.off === 0, String(auto.off));
  ok("設定を入れると答えた時点で次へ進む", auto.on === 1, String(auto.on));

  /* 後片付け（既定へ戻す） */
  await pg.evaluate(() => {
    ["player.fontSize", "player.maxWidth", "player.listPanel", "player.density",
     "player.showProgress", "player.showTimer", "player.showSave", "player.autoNext"]
      .forEach((k) => window.__vqSet.set(k, window.__vqSet.defaultOf(k)));
    if (window.__setApp) { try { window.__setApp.close("test"); } catch (e) {} }
  });

  console.log("");
  log.forEach((l) => console.log(l));
  console.log(`\n══ まとめ ══\n  合格 ${pass} / 不合格 ${fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
