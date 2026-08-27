/* ══════════════════════════════════════════════════════════════════════════
   vqscroll.cjs — スマホで指を動かしたときに、ちゃんと巻物が動くか

   ここは **本物の指の操作**（CDP の touch ジェスチャ）で確かめる。
   scrollTop に数を代入するだけでは「指では動かない」不具合を見逃す。

   見るところ:
     ① どの画面でも、指で上へはらうと中身が動く
     ② 設定は 一覧 も 詳細 も動く
     ③ Quick Chat の三本線は スマホでは出ない（PC では出る）
     ④ Feed で いいね を押しても、画面を作り直さない（見ていた位置が飛ばない）
   ══════════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const fs = require("node:fs");
fs.mkdirSync("shots/scroll", { recursive: true });

const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  NG   " + n + (x ? "  → " + x : ""))); };

async function boot(pg) {
  await pg.goto(BASE + "/?vqdev=1&cb=" + Date.now(), { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(4300);
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
    try { window.__vqNewsFlash.close(); } catch (e) {}
  });
  await pg.waitForTimeout(1700);
  /* 上に載っている確認ダイアログを片付ける（指の行き先を奪うため） */
  await pg.evaluate(() => {
    document.querySelectorAll('[data-act="dlg-x"],[data-act="dlg-o"],#uiModalOk,.ui-modal-backdrop').forEach((x) => { try { x.click(); } catch (e) {} });
    const m = document.getElementById("uiModal");
    if (m) m.style.setProperty("display", "none", "important");
  });
  await pg.waitForTimeout(400);
}

/* 指ではらう */
async function swipe(cdp, y, dist) {
  await cdp.send("Input.synthesizeScrollGesture", {
    x: 195, y: y || 500, xDistance: 0, yDistance: -(dist || 320),
    gestureSourceType: "touch", speed: 1500
  });
}
/* いま画面に見えている巻物が、どれだけ動いたか（画面全体でも層の中でもよい） */
const scrolled = (pg) => pg.evaluate(() => {
  let n = document.documentElement.scrollTop + document.body.scrollTop;
  const els = document.querySelectorAll("*");
  for (let i = 0; i < els.length; i++) {
    const sr = els[i].shadowRoot;
    if (!sr) continue;
    sr.querySelectorAll("*").forEach((x) => { n += x.scrollTop; });
  }
  return n;
});
const resetScroll = (pg) => pg.evaluate(() => {
  document.documentElement.scrollTop = 0; document.body.scrollTop = 0;
  document.querySelectorAll("*").forEach((e) => {
    if (e.shadowRoot) e.shadowRoot.querySelectorAll("*").forEach((x) => { x.scrollTop = 0; });
  });
});

(async () => {
  const b = await chromium.launch({ headless: true });

  console.log("\n### スマホ：指で動かす");
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mp = await ctx.newPage();
  const cdp = await ctx.newCDPSession(mp);
  const errs = [];
  mp.on("pageerror", (e) => errs.push(String(e).slice(0, 170)));
  await boot(mp);

  const TABS = [["home", "ホーム"], ["library", "プリセット"], ["news", "NEWS"],
                ["notifications", "通知"], ["inbox", "Feed"], ["insight", "Insights"]];
  for (const [tab, name] of TABS) {
    await mp.evaluate((t) => document.body.setAttribute("data-app-tab", t), tab);
    await mp.waitForTimeout(2000);
    await resetScroll(mp);
    /* 中身が画面より長いときだけ意味のある確認になる */
    /* 「動かせる余地」で見る。中身が画面に収まっている画面は、動かなくて当たり前。 */
    const room = await mp.evaluate(() => {
      const d = document.documentElement;
      let max = Math.max(d.scrollHeight - d.clientHeight, document.body.scrollHeight - document.body.clientHeight);
      document.querySelectorAll("*").forEach((e) => {
        if (!e.shadowRoot) return;
        e.shadowRoot.querySelectorAll("*").forEach((x) => {
          const of = getComputedStyle(x).overflowY;
          if (!/auto|scroll/.test(of)) return;
          const r = x.scrollHeight - x.clientHeight;
          if (r > max) max = r;
        });
      });
      return max;
    });
    if (room < 200) { console.log("  --   " + name + " は中身が画面に収まっているので飛ばす（余地 " + room + "px）"); continue; }
    await swipe(cdp, 500, 320);
    await mp.waitForTimeout(800);
    const n = await scrolled(mp);
    ok(name + " は指で動く", n > 80, n + "px しか動かない");
  }
  await mp.screenshot({ path: "shots/scroll/スマホ.png" });

  console.log("\n### 設定");
  await mp.evaluate(() => document.body.setAttribute("data-app-tab", "settings"));
  await mp.waitForTimeout(1500);
  ok("設定が開く", await mp.evaluate(() => window.__vqSettingsIsOpen()));
  await resetScroll(mp);
  await swipe(cdp, 500, 320);
  await mp.waitForTimeout(800);
  ok("設定の一覧が指で動く",
    (await mp.evaluate(() => document.getElementById("vqSettings").shadowRoot.querySelector(".mscroll").scrollTop)) > 40,
    String(await mp.evaluate(() => document.getElementById("vqSettings").shadowRoot.querySelector(".mscroll").scrollTop)));
  await mp.evaluate(() => {
    const r = document.getElementById("vqSettings").shadowRoot;
    r.querySelector('.mrow[data-nav="display"]').click();
  });
  await mp.waitForTimeout(700);
  const box = await mp.evaluate(() => {
    const b2 = document.getElementById("vqSettings").shadowRoot.querySelector(".body");
    return { sh: b2.scrollHeight, ch: b2.clientHeight };
  });
  ok("設定の詳細に巻ける余地がある", box.sh > box.ch + 20, JSON.stringify(box));
  await swipe(cdp, 500, 320);
  await mp.waitForTimeout(800);
  const detTop = await mp.evaluate(() => document.getElementById("vqSettings").shadowRoot.querySelector(".body").scrollTop);
  ok("設定の詳細が指で動く", detTop > 40, String(detTop));
  await mp.screenshot({ path: "shots/scroll/設定-スマホ.png" });

  console.log("\n### スマホ：引き出しは選んだら閉じる");
  await mp.evaluate(() => { try { window.__vqCloseSettings(); } catch (e) {} });
  await mp.waitForTimeout(600);
  for (const label of ["設定", "プロフィール", "NEWS"]) {
    await mp.evaluate(() => {
      const tb = document.getElementById("vqTopbar");
      const bt = tb && tb.shadowRoot ? tb.shadowRoot.querySelector("button") : null;
      if (bt) bt.click(); else { const t = document.getElementById("appV2SidebarToggle"); if (t) t.click(); }
    });
    await mp.waitForTimeout(900);
    const opened = await mp.evaluate(() => document.body.classList.contains("app-v2-sidebar-open"));
    ok("「" + label + "」の前に引き出しが開く", opened === true);
    await mp.evaluate((l) => {
      const r = document.getElementById("vqShell").shadowRoot;
      const it = Array.from(r.querySelectorAll(".vqs-item")).find((x) => (x.innerText || "").trim().indexOf(l) === 0);
      if (it) it.click();
    }, label);
    await mp.waitForTimeout(1600);
    ok("「" + label + "」を選ぶと引き出しが閉じる",
      (await mp.evaluate(() => document.body.classList.contains("app-v2-sidebar-open"))) === false);
    await mp.evaluate(() => { try { window.__vqCloseSettings(); } catch (e) {} });
    await mp.waitForTimeout(500);
  }

  console.log("\n### 上が隠れていないか（スマホ）");
  /* 前の節で開いた設定を閉じてから測る（開いたままだと後ろの画面が測れない） */
  await mp.evaluate(() => { try { window.__vqCloseSettings(); } catch (e) {} });
  await mp.waitForTimeout(800);
  /* 上に浮いている三本線のピルが、その画面の見出しにかぶっていないか。 */
  for (const [tab, host, sel, name] of [
    ["news", "vqNews", "h1", "NEWS"],
    ["insight", "vqInsight", "h1", "Insights"],
    ["notifications", "vqNotif", "h1", "通知"],
    ["inbox", "vqFeed", ".tabs", "Feed"]
  ]) {
    await mp.evaluate((t) => {
      const x = document.querySelector('#appTabBar [data-app-tab="' + t + '"]');
      if (x) x.click(); else document.body.setAttribute("data-app-tab", t);
    }, tab);
    await mp.waitForTimeout(2200);
    /* 層が組み上がるまで待つ（描き終える前に測ると 0 が返る） */
    for (let i = 0; i < 12; i++) {
      const ready = await mp.evaluate(([h, s2]) => {
        const el = document.getElementById(h);
        const f = el && el.shadowRoot ? el.shadowRoot.querySelector(s2) : null;
        return !!f && f.getBoundingClientRect().height > 0;
      }, [host, sel]);
      if (ready) break;
      await mp.waitForTimeout(500);
    }
    await mp.evaluate(() => { document.documentElement.scrollTop = 0; document.body.scrollTop = 0; });
    await mp.waitForTimeout(500);
    const r = await mp.evaluate(([h, s2]) => {
      const tb = document.getElementById("vqTopbar");
      let pillBottom = 0;
      if (tb && getComputedStyle(tb).display !== "none" && tb.shadowRoot) {
        const bar = tb.shadowRoot.querySelector(".bar");
        if (bar) pillBottom = Math.round(bar.getBoundingClientRect().bottom);
      }
      const el = document.getElementById(h);
      const f = el && el.shadowRoot ? el.shadowRoot.querySelector(s2) : null;
      return { pillBottom, firstY: f ? Math.round(f.getBoundingClientRect().top) : null };
    }, [host, sel]);
    ok(name + "：上の三本線が見出しにかぶっていない",
      r.firstY === null || r.firstY >= r.pillBottom - 1,
      "見出し y=" + r.firstY + " / 三本線の下端 " + r.pillBottom);
  }

  console.log("\n### Quick Chat（スマホ）");
  await mp.evaluate(() => { try { window.__vqCloseSettings(); } catch (e) {} });
  await mp.evaluate(() => {
    const t = document.querySelector('#appTabBar [data-app-tab="chat"]');
    if (t) t.click(); else document.body.setAttribute("data-app-tab", "chat");
  });
  await mp.waitForTimeout(2500);
  await mp.evaluate(() => {
    const sk = document.getElementById("vqObSkipBtn"); if (sk) sk.click();
    const o = document.getElementById("vqOnboardingOverlay"); if (o) o.remove();
  });
  await mp.waitForTimeout(2500);
  const spTop = await mp.evaluate(() => {
    const tb = document.getElementById("vqTopbar");
    const h = document.getElementById("vqChat");
    const own = h && h.shadowRoot ? h.shadowRoot.querySelector('.sbtn[data-a="openSide"]') : null;
    const ownR = own ? own.getBoundingClientRect() : null;
    return {
      appBar: tb ? getComputedStyle(tb).display : "なし",
      own: own ? getComputedStyle(own).display : "なし",
      ownAt: ownR ? { x: Math.round(ownR.left), y: Math.round(ownR.top) } : null,
      /* Quick Chat の見出しが読めるか（かぶられていないか） */
      title: (function () {
        if (!h || !h.shadowRoot) return null;
        const t2 = h.shadowRoot.querySelector(".top__t");
        if (!t2) return null;
        const r = t2.getBoundingClientRect();
        const at = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
        return { text: (t2.textContent || "").trim(), coveredBy: at ? (at.id || at.tagName) : "" };
      })()
    };
  });
  ok("スマホ：アプリの上バー（三本線）が出ない", spTop.appBar === "none", String(spTop.appBar));
  ok("スマホ：Quick Chat 自身の三本線は残る", spTop.own !== "none" && spTop.own !== "なし", String(spTop.own));
  ok("スマホ：見出しが何にもかぶられていない",
    !!spTop.title && spTop.title.coveredBy === "vqChat", JSON.stringify(spTop.title));
  const spChatTop = await mp.evaluate(() => {
    const sr = document.getElementById("vqChat").shadowRoot;
    const t = sr.querySelector(".top");
    return { padTop: getComputedStyle(t).paddingTop, y: Math.round(t.getBoundingClientRect().top) };
  });
  ok("スマホ：Quick Chat の見出しが画面のふちにくっついていない",
    parseFloat(spChatTop.padTop) >= 10, JSON.stringify(spChatTop));
  /* 会話が長いとき、上まで巻き戻せるか */
  const chatScroll = await mp.evaluate(async () => {
    const sr = document.getElementById("vqChat").shadowRoot;
    const th = sr.querySelector(".thread"), sc = sr.querySelector(".scroll"), hero = sr.querySelector(".hero");
    if (hero) hero.style.display = "none";
    if (sc) sc.style.display = "";
    let s2 = "";
    for (let i = 0; i < 40; i++) s2 += '<div class="msg user"><div class="b">確認用の会話 ' + i + '</div></div>';
    th.innerHTML = s2;
    await new Promise((r) => setTimeout(r, 300));
    sc.scrollTop = sc.scrollHeight;
    return { top: sc.scrollTop, sh: sc.scrollHeight, ch: sc.clientHeight };
  });
  await swipe(cdp, 400, -900);
  await mp.waitForTimeout(900);
  const chatBack = await mp.evaluate(() => document.getElementById("vqChat").shadowRoot.querySelector(".scroll").scrollTop);
  ok("スマホ：会話を上まで巻き戻せる", chatBack < chatScroll.top - 200,
    chatScroll.top + " → " + chatBack);
  await mp.screenshot({ path: "shots/scroll/QuickChat-スマホ.png" });
  ok("画面の失敗が出ていない（スマホ）", errs.length === 0, errs.join(" / "));

  console.log("\n### PC");
  const pctx = await b.newContext({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 2 });
  const pg = await pctx.newPage();
  const perrs = [];
  pg.on("pageerror", (e) => perrs.push(String(e).slice(0, 170)));
  await boot(pg);
  await pg.evaluate(() => {
    const t = document.querySelector('#appTabBar [data-app-tab="chat"]');
    if (t) t.click(); else document.body.setAttribute("data-app-tab", "chat");
  });
  await pg.waitForTimeout(3000);
  await pg.evaluate(() => {
    const sk = document.getElementById("vqObSkipBtn"); if (sk) sk.click();
    const o = document.getElementById("vqOnboardingOverlay"); if (o) o.remove();
  });
  await pg.waitForTimeout(2000);
  const pcBefore = await pg.evaluate(() => {
    const sh = document.getElementById("vqShell");
    const h = document.getElementById("vqChat");
    const x = h && h.shadowRoot ? h.shadowRoot.querySelector('[data-a="closeSide"]') : null;
    return {
      tab: document.body.getAttribute("data-app-tab"),
      shellX: Math.round(sh.getBoundingClientRect().left),
      closeLabel: x ? x.getAttribute("aria-label") : "なし",
      burger: (function () {
        const bt = h && h.shadowRoot ? h.shadowRoot.querySelector('.sbtn[data-a="openSide"]') : null;
        return bt ? getComputedStyle(bt).display : "なし";
      })()
    };
  });
  ok("PC：Quick Chat 中はアプリの左パネルが画面の外にいる", pcBefore.shellX < 0, String(pcBefore.shellX));
  ok("PC：三本線は残っている", pcBefore.burger !== "none" && pcBefore.burger !== "なし", String(pcBefore.burger));
  ok("PC：× の言い方が「アプリのメニューを出す」", pcBefore.closeLabel === "アプリのメニューを出す", String(pcBefore.closeLabel));
  await pg.evaluate(() => {
    document.getElementById("vqChat").shadowRoot.querySelector('[data-a="closeSide"]').click();
  });
  await pg.waitForTimeout(900);
  const pcOpen = await pg.evaluate(() => {
    const sh = document.getElementById("vqShell");
    const cs = getComputedStyle(sh);
    const nb = document.getElementById("vqChatNavBack");
    return {
      tab: document.body.getAttribute("data-app-tab"),
      shellX: Math.round(sh.getBoundingClientRect().left),
      opacity: getComputedStyle(document.getElementById("appTabBar")).opacity,
      vis: cs.visibility,
      back: nb ? getComputedStyle(nb).display : "なし",
      chat: getComputedStyle(document.getElementById("vqChat")).display,
      atLeft: (function () { const e = document.elementFromPoint(150, 300); return e ? (e.id || e.tagName) : ""; })()
    };
  });
  ok("PC：× でアプリの左パネルが出てくる", pcOpen.shellX === 0 && pcOpen.opacity === "1" && pcOpen.atLeft === "vqShell",
    JSON.stringify(pcOpen));
  ok("PC：Quick Chat から出ていない（そのまま）", pcOpen.tab === "chat" && pcOpen.chat === "block",
    JSON.stringify({ tab: pcOpen.tab, chat: pcOpen.chat }));
  ok("PC：うしろが暗くなる", pcOpen.back === "block", String(pcOpen.back));
  await pg.screenshot({ path: "shots/scroll/QuickChat-左パネル-PC.png" });
  await pg.evaluate(() => document.getElementById("vqChatNavBack").click());
  await pg.waitForTimeout(700);
  const pcClosed = await pg.evaluate(() => ({
    shellX: Math.round(document.getElementById("vqShell").getBoundingClientRect().left),
    back: getComputedStyle(document.getElementById("vqChatNavBack")).display,
    tab: document.body.getAttribute("data-app-tab")
  }));
  ok("PC：うしろを押すと引っ込む", pcClosed.shellX < 0 && pcClosed.back === "none", JSON.stringify(pcClosed));
  ok("PC：引っ込めても Quick Chat のまま", pcClosed.tab === "chat", pcClosed.tab);
  /* 行き先を選んだら、そこで初めて画面が変わる */
  await pg.evaluate(() => {
    document.getElementById("vqChat").shadowRoot.querySelector('[data-a="closeSide"]').click();
  });
  await pg.waitForTimeout(700);
  await pg.evaluate(() => {
    const r = document.getElementById("vqShell").shadowRoot;
    const it = Array.from(r.querySelectorAll(".vqs-item")).find((x) => (x.innerText || "").trim().indexOf("ホーム") === 0);
    if (it) it.click();
  });
  await pg.waitForTimeout(2000);
  const pcGone = await pg.evaluate(() => ({
    tab: document.body.getAttribute("data-app-tab"),
    chat: getComputedStyle(document.getElementById("vqChat")).display,
    back: getComputedStyle(document.getElementById("vqChatNavBack")).display
  }));
  ok("PC：行き先を選ぶとそこへ移る", pcGone.tab === "home" && pcGone.chat === "none", JSON.stringify(pcGone));
  ok("PC：移ったらメニューは引っ込む", pcGone.back === "none", pcGone.back);

  console.log("\n### 設定を変えても画面が飛ばない");
  /* まず本物のタブでホームへ戻す。data-app-tab を直接書くと本体側の
     「いまどのタブか」がずれ、本番と違う道になってしまう。 */
  await pg.evaluate(() => {
    const t = document.querySelector('#appTabBar [data-app-tab="home"]');
    if (t) t.click();
  });
  await pg.waitForTimeout(1500);
  /* 本物の導線（左パネルの「設定」）から開く。
     data-app-tab を直接書くと本体の _appCurrentTab がずれて、本番と違う道になる。 */
  await pg.evaluate(() => {
    const r = document.getElementById("vqShell");
    const items = r && r.shadowRoot ? Array.from(r.shadowRoot.querySelectorAll(".vqs-item")) : [];
    const s2 = items.find((x) => (x.innerText || "").trim().indexOf("設定") === 0);
    if (s2) s2.click(); else window.__vqOpenSettings();
  });
  await pg.waitForTimeout(1500);
  ok("設定が開く（PC）", await pg.evaluate(() => window.__vqSettingsIsOpen()));
  const tabAtOpen = await pg.evaluate(() => document.body.getAttribute("data-app-tab"));
  /* 本体の設定（テーマ）を変えると、本体は画面を作り直して data-app-tab を書き直す。
     そこで設定が閉じてホームへ戻ってしまうのが元の不具合。 */
  for (const [id, val] of [["display.theme", "DARK"], ["learn.questionCount", 42], ["display.fontSize", "LARGE"]]) {
    await pg.evaluate(([i, v]) => {
      const r = document.getElementById("vqSettings").shadowRoot;
      const nav = r.querySelector('.nav[data-nav="' + (i.split(".")[0] === "learn" ? "learn" : "display") + '"]');
      if (nav) nav.click();
      setTimeout(() => {
        const sel = r.querySelector('select.sel[data-set="' + i + '"]');
        if (sel) { sel.value = String(v); sel.dispatchEvent(new Event("change", { bubbles: true })); return; }
        const num = r.querySelector('.num__i[data-num="' + i + '"]');
        if (num) { num.value = String(v); num.dispatchEvent(new Event("change", { bubbles: true })); }
      }, 200);
    }, [id, val]);
    await pg.waitForTimeout(1400);
    ok("「" + id + "」を変えても設定が開いたまま",
      await pg.evaluate(() => window.__vqSettingsIsOpen()),
      "tab=" + (await pg.evaluate(() => document.body.getAttribute("data-app-tab"))));
    ok("「" + id + "」で画面が勝手に移らない",
      (await pg.evaluate(() => document.body.getAttribute("data-app-tab"))) === tabAtOpen,
      tabAtOpen + " → " + (await pg.evaluate(() => document.body.getAttribute("data-app-tab"))));
  }
  await pg.evaluate(() => {
    const r = document.getElementById("vqSettings").shadowRoot;
    const s = r.querySelector('select.sel[data-set="display.theme"]');
    if (s) { s.value = "LIGHT"; s.dispatchEvent(new Event("change", { bubbles: true })); }
  });
  await pg.waitForTimeout(800);
  await pg.evaluate(() => window.__vqCloseSettings());

  console.log("\n### Feed：いいねで作り直さない");
  const TK = String(process.env.VQ_TOKEN || "").trim();
  if (!TK) {
    console.log("  --   VQ_TOKEN が無いので飛ばす");
  } else {
    const fctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
    const fp = await fctx.newPage();
    const ferrs = [];
    fp.on("pageerror", (e) => ferrs.push(String(e).slice(0, 170)));
    await fp.goto(BASE + "/?vqdev=1&cb=" + Date.now(), { waitUntil: "domcontentloaded" });
    await fp.evaluate((t) => localStorage.setItem("app.auth.token.v1", t), TK);
    await boot(fp);
    await fp.evaluate(() => document.body.setAttribute("data-app-tab", "inbox"));
    await fp.waitForTimeout(3000);
    const has = await fp.evaluate(() => {
      const r = document.getElementById("vqFeed").shadowRoot;
      return r.querySelectorAll('.act[data-a="like"]').length;
    });
    if (!has) {
      console.log("  --   投稿が無いので飛ばす");
    } else {
      /* 押す前に、記事の要素そのものへ印を付ける。作り直されたら印は消える。 */
      await fp.evaluate(() => {
        const r = document.getElementById("vqFeed").shadowRoot;
        r.querySelector("article").dataset.vqmark = "1";
        const w = r.querySelector(".wrap");
        w.scrollTop = 0;
      });
      /* 「入れる向き」で試したいので、すでに いいね 済みなら先に外す */
      const wasOn = await fp.evaluate(() => {
        const r = document.getElementById("vqFeed").shadowRoot;
        return r.querySelector('.act[data-a="like"]').getAttribute("aria-pressed") === "true";
      });
      if (wasOn) {
        await fp.evaluate(() => document.getElementById("vqFeed").shadowRoot.querySelector('.act[data-a="like"]').click());
        await fp.waitForTimeout(1500);
      }
      const before = await fp.evaluate(() => {
        const r = document.getElementById("vqFeed").shadowRoot;
        const btn = r.querySelector('.act[data-a="like"]');
        return { pressed: btn.getAttribute("aria-pressed"), n: btn.querySelector(".n").textContent };
      });
      await fp.evaluate(() => {
        const r = document.getElementById("vqFeed").shadowRoot;
        r.querySelector('.act[data-a="like"]').click();
      });
      await fp.waitForTimeout(300);
      const mid = await fp.evaluate(() => {
        const r = document.getElementById("vqFeed").shadowRoot;
        const btn = r.querySelector('.act[data-a="like"]');
        return {
          mark: !!r.querySelector("article[data-vqmark]"),
          pop: btn.classList.contains("is-pop"),
          pressed: btn.getAttribute("aria-pressed"),
          n: btn.querySelector(".n").textContent
        };
      });
      ok("いいねで一覧を作り直さない", mid.mark === true, "作り直された");
      ok("いいねでその場が跳ねる", mid.pop === true);
      ok("いいねの見た目がすぐ変わる", mid.pressed !== before.pressed, before.pressed + " → " + mid.pressed);
      ok("数もすぐ変わる", mid.n !== before.n, before.n + " → " + mid.n);
      await fp.waitForTimeout(1500);
      const after = await fp.evaluate(() => {
        const r = document.getElementById("vqFeed").shadowRoot;
        return { mark: !!r.querySelector("article[data-vqmark]"),
                 pressed: r.querySelector('.act[data-a="like"]').getAttribute("aria-pressed") };
      });
      ok("返事が来ても作り直さない", after.mark === true, "作り直された");
      ok("返事のあとも いいね のまま", after.pressed === mid.pressed, mid.pressed + " → " + after.pressed);
      /* 元に戻す */
      await fp.evaluate(() => document.getElementById("vqFeed").shadowRoot.querySelector('.act[data-a="like"]').click());
      await fp.waitForTimeout(1200);
      ok("Feed で画面の失敗が出ていない", ferrs.length === 0, ferrs.join(" / "));
    }
  }
  ok("画面の失敗が出ていない（PC）", perrs.length === 0, perrs.join(" / "));

  await b.close();
  console.log("\n合格 " + pass + " / 不合格 " + fail);
  process.exit(fail ? 1 : 0);
})();
