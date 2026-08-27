/* ══════════════════════════════════════════════════════════════════════════
   vqdocs.cjs — 書類の画面（ヘルプ / 利用規約 / プライバシー / 報告）と、
                従来の設定への導線が消えていることの確認

   見るところ:
     ① 4 つとも新しい画面（vq-docs）で開く
     ② 規約とプライバシーの本文は **写しではなく** 本体（__vqLegal）から来ている
     ③ ヘルプは中を探せる
     ④ 報告は 書く → 確かめる → 送る が通り、空欄では進めない
     ⑤ 従来の設定・従来の記事へ行く道が残っていない
     ⑥ ライトでもダークでも読める（背景と文字が別の色）
   ══════════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const fs = require("node:fs");
fs.mkdirSync("shots/docs", { recursive: true });

const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  NG   " + n + (x ? "  → " + x : ""))); };

async function boot(pg) {
  await pg.goto(BASE + "/?vqdev=1&cb=" + Date.now(), { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(4200);
  await pg.evaluate(() => {
    ["firstLaunchOverlay", "vqbFlow", "vqNewAuth", "authGate", "authBootSplash", "vqOnboardingOverlay"].forEach((id) => {
      const e = document.getElementById(id);
      if (e) { e.hidden = true; e.style.setProperty("display", "none", "important"); }
    });
    document.body.classList.remove("auth-booting", "auth-gate-open");
    const a = document.getElementById("app"); if (a) a.style.setProperty("display", "block", "important");
    document.body.setAttribute("data-ui-v2", "1");
    /* 案内（vq-tour）は別のテストで見る。ここでは邪魔になるので「見たこと」にする。 */
    try {
      localStorage.setItem("vq.tour.v1", JSON.stringify({
        pin: 1, preset: 1, feed: 1, news: 1, insight: 1, chat: 1, notif: 1, mock: 1, presetmake: 1, settings: 1
      }));
      const tv = document.getElementById("vqTour"); if (tv) tv.style.display = "none";
    } catch (e) {}

    const sk = document.getElementById("vqObSkipBtn"); if (sk) sk.click();
  });
  await pg.waitForTimeout(1600);
}
const D = (pg, fn, arg) => pg.evaluate(fn, arg);
const text = (pg) => pg.evaluate(() => {
  const r = document.getElementById("vqDocs").shadowRoot;
  return (r.querySelector(".bd").textContent || "").replace(/\s+/g, " ").trim();
});
const title = (pg) => pg.evaluate(() => {
  const r = document.getElementById("vqDocs").shadowRoot;
  return (r.querySelector(".hd__t").textContent || "").trim();
});
const shown = (pg) => pg.evaluate(() => {
  const h = document.getElementById("vqDocs");
  return !!h && h.style.display !== "none";
});

(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 2 });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e).slice(0, 170)));
  await boot(pg);
  /* 起動のお知らせが重なると押し先を間違えるので、先に片付ける */
  await pg.evaluate(() => { try { window.__vqNewsFlash.close(); } catch (e) {} });

  console.log("\n### 4 つの画面");
  ok("書類の層が入っている", await pg.evaluate(() => !!window.__vqDocs));
  const want = { help: "ヘルプ", terms: "利用規約", privacy: "プライバシーポリシー", report: "報告 / お問い合わせ" };
  for (const k of Object.keys(want)) {
    await pg.evaluate((k) => window.__vqDocs.open(k), k);
    await pg.waitForTimeout(350);
    ok("「" + want[k] + "」が開く", (await shown(pg)) && (await title(pg)) === want[k], await title(pg));
    const t = await text(pg);
    if (k === "report") {
      /* 入力欄の中身は textContent に出ないので、見出しの並びで見る */
      ok("「" + want[k] + "」に入力欄がそろっている",
        await pg.evaluate(() => {
          const r = document.getElementById("vqDocs").shadowRoot;
          return ["email", "subject", "message"].every((x) => !!r.querySelector('[data-rep="' + x + '"]'));
        }));
    } else {
      ok("「" + want[k] + "」に中身がある", t.length > 200, String(t.length) + " 文字");
    }
  }

  console.log("\n### 規約とプライバシーの出どころ");
  const legal = await pg.evaluate(() => ({
    has: !!window.__vqLegal,
    terms: window.__vqLegal ? window.__vqLegal.terms.length : 0,
    privacy: window.__vqLegal ? window.__vqLegal.privacy.length : 0
  }));
  ok("本文の持ち主（__vqLegal）がある", legal.has && legal.terms > 20 && legal.privacy > 20, JSON.stringify(legal));
  await pg.evaluate(() => window.__vqDocs.open("terms"));
  await pg.waitForTimeout(300);
  const tTxt = await text(pg);
  const firstH = await pg.evaluate(() => {
    const L = window.__vqLegal.terms.filter((x) => x[0] === "h");
    return L[0] ? L[0][1] : "";
  });
  ok("規約の見出しがそのまま出ている", firstH && tTxt.indexOf(firstH) >= 0, firstH);
  await pg.evaluate(() => window.__vqDocs.open("privacy"));
  await pg.waitForTimeout(300);
  const pTxt = await text(pg);
  const pH = await pg.evaluate(() => {
    const L = window.__vqLegal.privacy.filter((x) => x[0] === "h");
    return L[0] ? L[0][1] : "";
  });
  ok("プライバシーの見出しがそのまま出ている", pH && pTxt.indexOf(pH) >= 0, pH);
  ok("規約とプライバシーは別の文章", tTxt.slice(0, 200) !== pTxt.slice(0, 200));

  console.log("\n### ヘルプ");
  await pg.evaluate(() => window.__vqDocs.open("help"));
  await pg.waitForTimeout(300);
  const secs = await pg.evaluate(() => document.getElementById("vqDocs").shadowRoot.querySelectorAll(".sec").length);
  ok("章がいくつかある", secs >= 5, String(secs));
  const openedFirst = await pg.evaluate(() => {
    const r = document.getElementById("vqDocs").shadowRoot;
    const q = r.querySelector(".qa__q");
    const before = getComputedStyle(q.parentNode.querySelector(".qa__a")).display;
    q.click();
    return { before, after: getComputedStyle(q.parentNode.querySelector(".qa__a")).display };
  });
  ok("行を押すと答えが開く", openedFirst.before === "none" && openedFirst.after !== "none", JSON.stringify(openedFirst));
  await pg.evaluate(() => {
    const r = document.getElementById("vqDocs").shadowRoot;
    const i = r.querySelector("[data-find]");
    i.value = "通知音"; i.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  });
  await pg.waitForTimeout(300);
  const found = await text(pg);
  ok("探すと絞り込まれる", found.indexOf("通知音") >= 0 && found.length < 4000, String(found.length) + " 文字");
  await pg.evaluate(() => {
    const r = document.getElementById("vqDocs").shadowRoot;
    const i = r.querySelector("[data-find]");
    i.value = "ぜったいにでてこないことば"; i.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  });
  await pg.waitForTimeout(300);
  ok("見つからないときは、そう言う", (await text(pg)).indexOf("当てはまる項目はありません") >= 0);

  console.log("\n### 報告");
  await pg.evaluate(() => window.__vqDocs.open("report"));
  await pg.waitForTimeout(300);
  await pg.evaluate(() => {
    const r = document.getElementById("vqDocs").shadowRoot;
    r.querySelector('[data-act="confirm"]').click();
  });
  await pg.waitForTimeout(250);
  const errTxt = await text(pg);
  ok("空のままでは進めない", errTxt.indexOf("件名を書いてください") >= 0 && errTxt.indexOf("もう少し書いて") >= 0, errTxt.slice(0, 120));
  await pg.evaluate(() => {
    const r = document.getElementById("vqDocs").shadowRoot;
    const set = (k, v) => { const e = r.querySelector('[data-rep="' + k + '"]'); e.value = v; e.dispatchEvent(new Event("input", { bubbles: true, composed: true })); };
    set("email", "こわれたあどれす");
    set("subject", "テスト件名");
    set("message", "これは自動での確認です。送信はしません。");
    r.querySelector('[data-act="confirm"]').click();
  });
  await pg.waitForTimeout(250);
  ok("メールの形が違うと止まる", (await text(pg)).indexOf("メールアドレスの形") >= 0);
  await pg.evaluate(() => {
    const r = document.getElementById("vqDocs").shadowRoot;
    const e = r.querySelector('[data-rep="email"]');
    e.value = "vqtest@example.com"; e.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    r.querySelector('[data-act="confirm"]').click();
  });
  await pg.waitForTimeout(300);
  const conf = await text(pg);
  ok("確認の画面へ進む", conf.indexOf("この内容で送ります") >= 0 && conf.indexOf("テスト件名") >= 0, conf.slice(0, 100));
  ok("送る口が本体につながっている", await pg.evaluate(() => typeof window.__vqReportSend === "function"));
  /* 実際の送信はしない（本物のメールが飛ぶため）。失敗したときの見え方だけ確かめる。 */
  await pg.evaluate(() => {
    window.__vqReportSend = () => Promise.reject(new Error("これは確認用の失敗です"));
    document.getElementById("vqDocs").shadowRoot.querySelector('[data-act="send"]').click();
  });
  await pg.waitForTimeout(600);
  ok("送れないときは理由を出す", (await text(pg)).indexOf("これは確認用の失敗です") >= 0, (await text(pg)).slice(0, 140));
  await pg.evaluate(() => {
    window.__vqReportSend = () => Promise.resolve({ ok: true });
    document.getElementById("vqDocs").shadowRoot.querySelector('[data-act="send"]').click();
  });
  await pg.waitForTimeout(600);
  ok("送れたら「送りました」を出す", (await text(pg)).indexOf("送りました") >= 0);

  console.log("\n### 従来の導線が消えている");
  await pg.evaluate(() => window.__vqDocs.close());
  await pg.waitForTimeout(200);
  ok("設定タブの旧一覧が見えない", await pg.evaluate(() => {
    const l = document.querySelector("#appSettingsPage .app-settings-list");
    return !l || getComputedStyle(l).display === "none";
  }));
  ok("設定の中に「従来の設定を開く」が無い", await pg.evaluate(() => {
    const r = document.getElementById("vqSettings").shadowRoot;
    return !r.querySelector("[data-open-legacy]");
  }));
  /* 旧メニューの「セッティング」「ヘルプ」「利用規約」は新しい画面へ向く */
  for (const [act, wantTitle] of [["help", "ヘルプ"], ["terms", "利用規約"]]) {
    await pg.evaluate(() => { try { window.__vqDocs.close(); } catch (e) {} });
    await pg.evaluate((a) => {
      const btn = document.querySelector('[data-menu-action="' + a + '"]');
      if (btn) btn.click();
    }, act);
    await pg.waitForTimeout(500);
    ok("旧メニューの「" + wantTitle + "」も新しい画面へ行く",
      (await shown(pg)) && (await title(pg)) === wantTitle, await title(pg));
  }
  await pg.evaluate(() => window.__vqDocs.close());
  ok("従来の設定オーバーレイは閉じたまま", await pg.evaluate(() => {
    const o = document.getElementById("settingsOverlay");
    return !o || o.classList.contains("hidden");
  }));

  console.log("\n### 色");
  for (const mode of ["LIGHT", "DARK"]) {
    await pg.evaluate((m) => {
      const s = document.getElementById("settingsThemeSelect");
      s.value = m; s.dispatchEvent(new Event("change", { bubbles: true }));
    }, mode);
    await pg.waitForTimeout(700);
    await pg.evaluate(() => window.__vqDocs.open("terms"));
    await pg.waitForTimeout(400);
    const c = await pg.evaluate(() => {
      const r = document.getElementById("vqDocs").shadowRoot;
      const w = r.querySelector(".win"), p = r.querySelector(".art p");
      return { bg: getComputedStyle(w).backgroundColor, fg: p ? getComputedStyle(p).color : "" };
    });
    const lum = (s) => { const m = s.match(/\d+/g); return m ? (Number(m[0]) + Number(m[1]) + Number(m[2])) / 3 : -1; };
    ok(mode + "：面と文字の明るさが離れている", Math.abs(lum(c.bg) - lum(c.fg)) > 60, JSON.stringify(c));
    ok(mode + "：面の明るさが向きどおり",
      mode === "DARK" ? lum(c.bg) < 90 : lum(c.bg) > 200, c.bg);
    await pg.screenshot({ path: "shots/docs/規約-" + mode + ".png" });
  }
  await pg.evaluate(() => window.__vqDocs.close());
  ok("画面の失敗が出ていない（PC）", errs.length === 0, errs.join(" / "));

  console.log("\n### スマホ");
  const mctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const mp = await mctx.newPage();
  const merrs = [];
  mp.on("pageerror", (e) => merrs.push(String(e).slice(0, 170)));
  await boot(mp);
  await mp.evaluate(() => { try { window.__vqNewsFlash.close(); } catch (e) {} });
  await mp.evaluate(() => window.__vqDocs.open("help"));
  await mp.waitForTimeout(500);
  const over = await mp.evaluate(() => {
    const r = document.getElementById("vqDocs").shadowRoot;
    const bd = r.querySelector(".bd");
    return { x: bd.scrollWidth - bd.clientWidth, full: r.querySelector(".win").getBoundingClientRect().width };
  });
  ok("スマホで横にはみ出していない", over.x <= 1, String(over.x));
  ok("スマホでは全画面になる", Math.abs(over.full - 390) < 2, String(over.full));
  await mp.screenshot({ path: "shots/docs/ヘルプ-スマホ.png" });
  ok("画面の失敗が出ていない（スマホ）", merrs.length === 0, merrs.join(" / "));

  await b.close();
  console.log("\n合格 " + pass + " / 不合格 " + fail);
  process.exit(fail ? 1 : 0);
})();
