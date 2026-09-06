/* ══════════════════════════════════════════════════════════════════════
   プリセット一覧・詳細の作り直し：実際の画面での確認
   ・自分 / 公開 / 公式 の 3 種類が、見て区別できるか
   ・カードに表紙とアイコンが出ているか（大きな空白になっていないか）
   ・内部の ID（sub:english / summarize）が画面に出ていないか
   ・「0 で全問」のような書き方が残っていないか
   ・タブ・検索・並べ替え・区切り・URL・空の状態
   ・詳細（問題の内訳・解きかた・できることだけ出す・下に固定）
   ・スマホ（1 列・絞り込みシート）とダーク
   ・形式を選ぶモーダルが読みやすくなっているか
   ══════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const fs = require("node:fs");
fs.mkdirSync("shots/library", { recursive: true });
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

/* テスト専用のプリセットを 3 つ置く（名前で見分けが付くようにする） */
const SEED = () => {
  const S = VQ2.schema, ST = VQ2.store;
  const mkChoice = (t) => S.emptyQuestion({
    type: "multiple_choice_single", prompt: t, points: 1,
    choices: [
      { id: "c1", label: "A", text: "正しい", explanation: "", isCorrect: true },
      { id: "c2", label: "B", text: "ちがう", explanation: "", isCorrect: false }
    ]
  });
  const mkFree = (t) => {
    const q = VQ2.qmodel.empty("summarize", { points: 5 });
    q.prompt = t;
    q.modelAnswer = "要点をまとめた文";
    return q;
  };
  const mkOrder = (t) => {
    const q = VQ2.qmodel.empty("reorder_chronology", { points: 3 });
    q.prompt = t;
    return q;
  };
  const a = S.emptyPreset({
    name: "テスト用・英語プリセット", subjectId: "sub:english",
    questions: [mkChoice("問1"), mkChoice("問2"), mkFree("問3"), mkOrder("問4")]
  });
  a.description = "テストのために置いた英語の教材です。";
  const b = S.emptyPreset({
    name: "テスト用・数学プリセット", subjectId: "sub:math",
    questions: [mkChoice("計算1"), mkChoice("計算2")]
  });
  const r1 = ST.savePreset(a, { ownerId: ST.currentOwnerId() });
  const r2 = ST.savePreset(b, { ownerId: ST.currentOwnerId() });
  return { a: r1.ok, b: r2.ok, ids: [a.id, b.id] };
};

/* 影の DOM の中を読む道具 */
const SR = () => {
  const h = document.getElementById("vqScreens");
  return h && h.shadowRoot ? h.shadowRoot : null;
};

(async () => {
  const b = await chromium.launch({ headless: true });

  for (const d of [{ n: "PC", w: 1440, h: 950, m: false }, { n: "スマホ", w: 390, h: 844, m: true }]) {
    const ctx = await b.newContext({ viewport: { width: d.w, height: d.h }, deviceScaleFactor: 2, isMobile: d.m, hasTouch: d.m });
    const pg = await ctx.newPage();
    const errs = [];
    pg.on("pageerror", (e) => errs.push(String(e).slice(0, 180)));
    await pg.goto(BASE + "/?vq2=all&vqdev=1&cb=" + Date.now(), { waitUntil: "domcontentloaded" });
    await pg.waitForTimeout(4000);
    await pg.evaluate(HIDE);
    await pg.waitForTimeout(800);

    console.log("\n══ " + d.n + " ══");

    /* ── 0. 下ごしらえ ── */
    const seeded = await pg.evaluate(SEED);
    ok(d.n + "：テスト用プリセットを置けた", seeded.a && seeded.b, JSON.stringify(seeded));
    await pg.evaluate(() => {
      const t = document.querySelector('#appTabBar [data-app-tab="library"]');
      if (t) t.click();
    });
    await pg.waitForTimeout(2200);

    /* ── 1. データ層 ── */
    const lib = await pg.evaluate(() => {
      if (!window.VQ2 || !VQ2.library) return { missing: true };
      const L = VQ2.library, B = window.__vqPresets;
      const cards = B ? B.cards() : [];
      return {
        tabs: L.TABS.map((t) => t.label),
        sorts: L.SORTS.length,
        count: cards.length,
        kinds: cards.map((c) => c.kind),
        official: cards.filter((c) => c.isOfficial).length,
        mine: cards.filter((c) => c.isOwnedByCurrentUser).length,
        counts: L.counts(cards),
        /* 内部 ID がそのまま入っていないか（表示用の言葉になっているか） */
        subjectLabels: cards.map((c) => L.subjectLabel(c.subject)).filter(Boolean).slice(0, 6),
        typeSummary: (function () {
          const c = cards.filter((x) => x.questionTypeCounts)[0];
          return c ? L.typeSummary(c.questionTypeCounts, 3) : "";
        })()
      };
    });
    ok(d.n + "：データ層が載っている", !lib.missing);
    ok(d.n + "：タブは 5 つ（すべて・マイ・公開・公式・お気に入り）",
       lib.tabs && lib.tabs.length === 5 && lib.tabs[0] === "すべて" && lib.tabs[3] === "公式", JSON.stringify(lib.tabs));
    ok(d.n + "：一覧にカードが並ぶ", lib.count > 0, "件数 " + lib.count);
    ok(d.n + "：自分のプリセットが「自分のもの」として数えられている", lib.mine >= 2, "自分 " + lib.mine);
    ok(d.n + "：公式は出どころだけで決めている（自分のものが公式にならない）",
       lib.counts && lib.counts.mine >= 2 && lib.counts.official === lib.official);
    ok(d.n + "：科目は日本語で出す（sub:english を出さない）",
       (lib.subjectLabels || []).every((s) => !/^sub:/.test(s)), JSON.stringify(lib.subjectLabels));
    ok(d.n + "：形式の内訳は日本語（summarize などを出さない）",
       !!lib.typeSummary && !/summarize|multiple_choice|reorder_|_/.test(lib.typeSummary), lib.typeSummary);

    /* ── 2. カードの見た目 ── */
    const card = await pg.evaluate(() => {
      const sr = document.getElementById("vqScreens").shadowRoot;
      /* ★ 2026-09-03。ホームの 棚（.rail）も **同じ pcHTML** で 描くように
         なったので、最初の .pc は 隠れている 棚の 札に なる（0x0）。
         見たいのは **一覧の 札**なので、そちらを 先に 取る。 */
      const pc = sr.querySelector('[data-sections] .pc') || sr.querySelector("[data-grid] .pc")
        || sr.querySelector(".pc");
      if (!pc) return { none: true };
      const ban = pc.querySelector(".pc__ban");
      const ico = pc.querySelector(".pc__ico");
      const cs = ban ? getComputedStyle(ban) : null;
      const r = ban ? ban.getBoundingClientRect() : { width: 0, height: 0 };
      const icr = ico ? ico.getBoundingClientRect() : { width: 0, height: 0 };
      const kinds = [].map.call(sr.querySelectorAll(".pc__kind"), (x) => x.textContent.trim());
      return {
        cards: sr.querySelectorAll(".pc").length,
        banW: Math.round(r.width), banH: Math.round(r.height),
        banBg: cs ? cs.backgroundImage.slice(0, 24) : "",
        icoW: Math.round(icr.width), icoH: Math.round(icr.height),
        hasStart: !!pc.querySelector(".pc__go"),
        hasFav: !!pc.querySelector(".pc__fav"),
        role: pc.getAttribute("role"), tab: pc.getAttribute("tabindex"),
        kinds: kinds.slice(0, 8),
        text: (sr.querySelector('[data-screen="presets"]') || {}).textContent || ""
      };
    });
    ok(d.n + "：カードに表紙がある（空白ではない）",
       card.banH > 40 && card.banBg.indexOf("gradient") >= 0, card.banW + "x" + card.banH + " " + card.banBg);
    ok(d.n + "：表紙は 16:9 に近い", Math.abs(card.banW / Math.max(1, card.banH) - (d.m ? 2 : 16 / 9)) < 0.35,
       (card.banW / Math.max(1, card.banH)).toFixed(2));
    ok(d.n + "：カードにアイコンが重なっている", card.icoW >= 44 && card.icoH >= 44, card.icoW + "x" + card.icoH);
    ok(d.n + "：カードに種別の札が出ている",
       (card.kinds || []).some((k) => /マイプリセット|VocabuQuiz公式|公開/.test(k)), JSON.stringify(card.kinds));
    ok(d.n + "：カードから直接始められる", card.hasStart && card.hasFav);
    ok(d.n + "：カードはキーボードで押せる", card.role === "button" && card.tab === "0");
    ok(d.n + "：画面に内部の ID が出ていない",
       !/sub:english|sub:math|multiple_choice_single|summarize|choice_many/.test(card.text || ""),
       (card.text || "").match(/sub:[a-z]+|multiple_choice_single|summarize/g) + "");

    /* ── 3. タブ・検索・並べ替え・区切り ── */
    const tabs = await pg.evaluate(() => {
      const sr = document.getElementById("vqScreens").shadowRoot;
      const t = [].map.call(sr.querySelectorAll(".tab"), (x) => x.textContent.trim());
      return { labels: t, sections: sr.querySelectorAll(".psec").length,
               hasSearch: !!sr.querySelector("[data-search]"), hasSort: !!sr.querySelector("[data-sort]") };
    });
    ok(d.n + "：タブが 5 つ出ていて件数が付く", tabs.labels.length === 5 && /\d/.test(tabs.labels[0]), JSON.stringify(tabs.labels));
    const hid = await pg.evaluate(() => {
      const sr = document.getElementById("vqScreens").shadowRoot;
      const vis = (s) => { const e = sr.querySelector(s); return e ? getComputedStyle(e).display !== "none" : false; };
      return { warn: vis("[data-warn]"), fcount: vis("[data-fcount]"), empty: vis("[data-empty]") };
    });
    ok(d.n + "：隠すと言った帯は本当に隠れている", !hid.warn && !hid.fcount && !hid.empty, JSON.stringify(hid));
    ok(d.n + "：検索と並べ替えがある", tabs.hasSearch && tabs.hasSort);
    ok(d.n + "：「すべて」では区切って見せる", tabs.sections >= 1, "区切り " + tabs.sections);

    /* 検索 */
    await pg.evaluate(() => {
      const sr = document.getElementById("vqScreens").shadowRoot;
      const box = sr.querySelector("[data-search]");
      box.value = "数学";
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await pg.waitForTimeout(500);
    /* ★ 2026-09-03。ホームの 棚も 同じ pcHTML で 描くので、
       影の 根から .pc を 数えると **棚の 札まで 混ざる**（検索で 減らない）。
       見るのは 一覧（[data-sections] / [data-grid]）の 中だけ。 */
    const searched = await pg.evaluate(() => {
      const sr = document.getElementById("vqScreens").shadowRoot;
      const 一覧 = sr.querySelectorAll('[data-sections] .pc, [data-grid] .pc');
      return { n: 一覧.length,
               titles: [].map.call(一覧, (x) => {
                 const t = x.querySelector(".pc__title");
                 return t ? t.textContent.trim() : "";
               }) };
    });
    ok(d.n + "：検索で絞れる", searched.n >= 1 && searched.titles.every((t) => /数学/.test(t)),
       JSON.stringify(searched.titles));

    /* 見つからないときの案内 */
    await pg.evaluate(() => {
      const sr = document.getElementById("vqScreens").shadowRoot;
      const box = sr.querySelector("[data-search]");
      box.value = "ぜったいにない言葉xyz";
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await pg.waitForTimeout(450);
    const emptyState = await pg.evaluate(() => {
      const sr = document.getElementById("vqScreens").shadowRoot;
      const e = sr.querySelector("[data-empty]");
      return { shown: e && !e.hidden, text: e ? e.textContent.trim() : "", hasBtn: !!(e && e.querySelector("[data-clear-filter]")) };
    });
    ok(d.n + "：見つからないときは理由と次の一手を出す",
       emptyState.shown && /見つかりません/.test(emptyState.text) && emptyState.hasBtn, emptyState.text.slice(0, 40));

    /* 絞り込みを外す */
    await pg.evaluate(() => {
      const sr = document.getElementById("vqScreens").shadowRoot;
      sr.querySelector("[data-clear-filter]").click();
    });
    await pg.waitForTimeout(450);
    const cleared = await pg.evaluate(() => document.getElementById("vqScreens").shadowRoot.querySelectorAll(".pc").length);
    ok(d.n + "：絞り込みを外すと戻る", cleared > 0, "件数 " + cleared);

    /* タブ切り替えと URL */
    await pg.evaluate(() => {
      const sr = document.getElementById("vqScreens").shadowRoot;
      const t = [].filter.call(sr.querySelectorAll(".tab"), (x) => /マイプリセット/.test(x.textContent))[0];
      if (t) t.click();
    });
    await pg.waitForTimeout(700);
    const mineTab = await pg.evaluate(() => {
      const sr = document.getElementById("vqScreens").shadowRoot;
      return { n: sr.querySelectorAll(".pc").length, url: location.search,
               sel: [].filter.call(sr.querySelectorAll(".tab"), (x) => x.getAttribute("aria-selected") === "true")
                      .map((x) => x.textContent.trim())[0] || "" };
    });
    ok(d.n + "：タブを切り替えられる", /マイプリセット/.test(mineTab.sel), mineTab.sel);
    ok(d.n + "：選んだタブが URL に残る", /lib_tab=mine/.test(mineTab.url), mineTab.url);
    ok(d.n + "：マイプリセットに自分のものだけ出る", mineTab.n >= 2, "件数 " + mineTab.n);

    /* ── 4. お気に入り ── */
    const favd = await pg.evaluate(() => {
      const sr = document.getElementById("vqScreens").shadowRoot;
      const 選 = '[data-sections] .pc .pc__fav, [data-grid] .pc .pc__fav';
      const f = sr.querySelector(選) || sr.querySelector(".pc__fav");
      const id = f.getAttribute("data-fav");
      const before = f.classList.contains("on");
      f.click();
      const g = document.getElementById("vqScreens").shadowRoot
        .querySelector('.pc__fav[data-fav="' + id + '"]');
      return { before, after: g ? g.classList.contains("on") : before, id: id };
    });
    await pg.waitForTimeout(400);
    ok(d.n + "：お気に入りを付け外しできる", favd.before !== favd.after);

    /* ── 5. 詳細 ── */
    await pg.evaluate(() => {
      const sr = document.getElementById("vqScreens").shadowRoot;
      /* ★ 一覧の 札から 選ぶ（棚の 札は 隠れていて 押せない）。 */
      const 一覧 = sr.querySelectorAll('[data-sections] .pc, [data-grid] .pc');
      const pc = [].filter.call(一覧, (x) => /テスト用・英語/.test(x.textContent))[0]
              || 一覧[0] || sr.querySelector(".pc");
      pc.click();
    });
    await pg.waitForTimeout(1200);
    const det = await pg.evaluate(() => {
      const h = document.getElementById("vq2-preset-detail");
      if (!h || !h.shadowRoot) return { none: true };
      const r = h.shadowRoot.querySelector(".vq2-root");
      const txt = r ? r.textContent : "";
      const head = h.shadowRoot.querySelector(".vq2-pd-head");
      const foot = h.shadowRoot.querySelector(".vq2-pd-foot");
      const fr = foot ? foot.getBoundingClientRect() : null;
      const rr = r ? r.getBoundingClientRect() : null;
      const mix = [].map.call(h.shadowRoot.querySelectorAll(".vq2-pd-mixl"), (x) => x.textContent.trim());
      const opts = [].map.call(h.shadowRoot.querySelectorAll(".vq2-pd-optl"), (x) => x.textContent.trim());
      const limit = h.shadowRoot.querySelector('[data-key="limit"]');
      return {
        width: rr ? Math.round(rr.width) : 0,
        headH: head ? Math.round(head.getBoundingClientRect().height) : 0,
        footBottomInside: fr && rr ? Math.abs(fr.bottom - rr.bottom) < 40 : false,
        mix: mix, opts: opts,
        limitOptions: limit ? [].map.call(limit.options, (o) => o.textContent.trim()) : [],
        hasStart: !!h.shadowRoot.querySelector('[data-act="start"]'),
        hasFav: !!h.shadowRoot.querySelector('[data-act="fav"]'),
        kinds: [].map.call(h.shadowRoot.querySelectorAll(".vq2-pd-kind"), (x) => x.textContent.trim()),
        txt: txt
      };
    });
    ok(d.n + "：詳細が開く", !det.none);
    ok(d.n + "：表紙のある見出しが出る", det.headH >= 100, "高さ " + det.headH);
    ok(d.n + "：種別が詳細でも分かる", (det.kinds || []).some((k) => /マイプリセット|公式|公開/.test(k)), JSON.stringify(det.kinds));
    ok(d.n + "：問題の内訳が日本語で出る",
       det.mix && det.mix.length >= 2 && det.mix.every((m) => !/_|summarize|multiple_choice|reorder/.test(m)), JSON.stringify(det.mix));
    ok(d.n + "：解きかたの設定がある", (det.opts || []).indexOf("出題数") >= 0, JSON.stringify(det.opts));
    ok(d.n + "：出題数に「0 で全問」を使っていない",
       (det.limitOptions || []).some((o) => /^全部/.test(o)) && !/0 ?で全|0でなし|0 ?で制限/.test(det.txt || ""),
       JSON.stringify(det.limitOptions));
    ok(d.n + "：詳細に内部の ID が出ていない",
       !/sub:english|multiple_choice_single|summarize|reorder_chronology/.test(det.txt || ""));
    ok(d.n + "：操作は下に固定されている", det.footBottomInside && det.hasStart && det.hasFav);
    if (!d.m) ok(d.n + "：詳細の幅は 880〜1040px", det.width >= 860 && det.width <= 1060, det.width + "px");
    else ok(d.n + "：スマホの詳細は画面いっぱい", det.width >= 380, det.width + "px");
    await pg.screenshot({ path: "shots/library/detail-" + d.n + ".png" });

    await pg.evaluate(() => {
      const h = document.getElementById("vq2-preset-detail");
      if (h && h.__vq2) h.__vq2.forceClose("test");
    });
    await pg.waitForTimeout(500);

    /* ── 6. ダーク ── */
    const dark = await pg.evaluate(async () => {
      document.documentElement.setAttribute("data-theme-mode", "dark");
      await new Promise((r) => setTimeout(r, 500));
      const sr = document.getElementById("vqScreens").shadowRoot;
      const pc = sr.querySelector('[data-sections] .pc, [data-grid] .pc') || sr.querySelector(".pc");
      const ban = pc ? pc.querySelector(".pc__ban") : sr.querySelector(".pc__ban");
      return { card: getComputedStyle(pc).backgroundColor, ban: getComputedStyle(ban).backgroundImage.slice(0, 60) };
    });
    const lum = (s) => { const m = String(s).match(/\d+/g); return m ? (+m[0] + +m[1] + +m[2]) / 3 : 255; };
    ok(d.n + "：一覧にダークが効く", lum(dark.card) < 120, dark.card);
    await pg.screenshot({ path: "shots/library/dark-" + d.n + ".png" });
    await pg.evaluate(() => document.documentElement.setAttribute("data-theme-mode", "light"));
    await pg.waitForTimeout(400);

    /* ── 7. 並べ方（PC は複数列 / スマホは 1 列と絞り込みシート） ── */
    const layout = await pg.evaluate(() => {
      const sr = document.getElementById("vqScreens").shadowRoot;
      const grid = sr.querySelector(".pgrid");
      const cols = grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").length : 0;
      const fbtn = sr.querySelector("[data-open-filter]");
      const visible = fbtn ? getComputedStyle(fbtn).display !== "none" : false;
      const wrap = sr.querySelector(".wrap");
      const sc = sr.querySelector(".scroll");
      return { cols: cols, filterBtn: visible, wide: wrap ? wrap.classList.contains("wide") : false,
               maxw: wrap ? getComputedStyle(wrap).maxWidth : "",
               over: sc ? Math.max(0, sc.scrollWidth - sc.clientWidth) : 0 };
    });
    ok(d.n + "：一覧が横にはみ出さない", layout.over === 0, "はみ出し " + layout.over + "px");
    if (!d.m) {
      ok(d.n + "：カードは複数列に並ぶ", layout.cols >= 2, "列 " + layout.cols);
      ok(d.n + "：一覧は広く使う", layout.wide && parseInt(layout.maxw, 10) >= 1400, layout.maxw);
    } else {
      ok(d.n + "：カードは 1 列", layout.cols === 1, "列 " + layout.cols);
      ok(d.n + "：絞り込みのボタンが出る", layout.filterBtn);
      const sheet = await pg.evaluate(async () => {
        const sr = document.getElementById("vqScreens").shadowRoot;
        sr.querySelector("[data-open-filter]").click();
        await new Promise((r) => setTimeout(r, 350));
        const s = sr.querySelector("[data-sheet]");
        const on = s.classList.contains("on");
        const chips = s.querySelectorAll("[data-subj]").length;
        const sorts = s.querySelectorAll("[data-sortpick]").length;
        sr.querySelector("[data-close-filter]").click();
        await new Promise((r) => setTimeout(r, 250));
        return { on, chips, sorts, closed: !s.classList.contains("on") };
      });
      ok(d.n + "：絞り込みが下から出る", sheet.on && sheet.chips >= 1 && sheet.sorts >= 5, JSON.stringify(sheet));
      ok(d.n + "：絞り込みを閉じられる", sheet.closed);
    }

    /* ── 8. 形式を選ぶモーダル ── */
    const picker = await pg.evaluate(async () => {
      if (!window.VQ2 || !VQ2.qtypePicker) return { none: true };
      VQ2.qtypePicker.open({});
      await new Promise((r) => setTimeout(r, 700));
      const h = document.getElementById("vq2-qtype-picker");
      if (!h || !h.shadowRoot) return { none: true };
      const sr = h.shadowRoot;
      const split = sr.querySelector(".vq2-qt-split");
      const cs = split ? getComputedStyle(split).gridTemplateColumns.split(" ").length : 0;
      const rails = [].map.call(sr.querySelectorAll(".vq2-qt-rail"), (x) => x.textContent.trim());
      const card = sr.querySelector(".vq2-qt-card");
      const tags = card ? [].map.call(card.querySelectorAll(".vq2-qt-tag"), (x) => x.textContent.trim()) : [];
      const main = sr.querySelector(".vq2-qt-main");
      const count = sr.querySelector(".vq2-qt-count");
      /* 描き直すと要素が入れ替わるので、いまの値をここで読み切っておく */
      const mainScrolls = main ? getComputedStyle(main).overflowY : "";
      const rootEl = sr.querySelector(".vq2-root");
      const over = Math.max(0,
        Math.round((rootEl ? rootEl.getBoundingClientRect().right : 0) - window.innerWidth),
        main ? Math.max(0, main.scrollWidth - main.clientWidth) : 0);
      const countText = count ? count.textContent.trim() : "";
      const cards = sr.querySelectorAll(".vq2-qt-card").length;
      /* 検索してみる */
      const q = sr.querySelector("[data-qt-q]");
      q.value = "並べ替え";
      q.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 350));
      const sr2 = document.getElementById("vq2-qtype-picker").shadowRoot;
      const found = sr2.querySelectorAll(".vq2-qt-card").length;
      const foundText = (sr2.querySelector(".vq2-qt-count") || {}).textContent || "";
      return {
        cols: cs, rails: rails.slice(0, 4), railCount: rails.length,
        tags: tags, tagN: tags.length,
        mainScrolls: mainScrolls, count: countText, over: over,
        found, foundText, cards: cards
      };
    });
    ok(d.n + "：形式のモーダルが開く", !picker.none);
    if (!picker.none) {
      if (!d.m) ok(d.n + "：左に分類、右に一覧の 2 段組み", picker.cols === 2, "列 " + picker.cols);
      else ok(d.n + "：スマホは分類を上に横並び", picker.cols === 1, "列 " + picker.cols);
      ok(d.n + "：分類が数つきで並ぶ", picker.railCount >= 5 && /\d/.test(picker.rails[0] || ""), JSON.stringify(picker.rails));
      ok(d.n + "：件数が出る", /種類/.test(picker.count), picker.count);
      ok(d.n + "：札は 3 つまでにしぼってある", picker.tagN <= 3, JSON.stringify(picker.tags));
      ok(d.n + "：一覧だけがスクロールする（上の検索は残る）", picker.mainScrolls === "auto" || picker.mainScrolls === "scroll", picker.mainScrolls);
      ok(d.n + "：モーダルが横にはみ出さない", picker.over === 0, "はみ出し " + picker.over + "px");
      ok(d.n + "：モーダルの中で探せる", picker.found >= 1 && picker.found < picker.cards,
         "検索前 " + picker.cards + " → " + picker.found + "（" + picker.foundText + "）");
    }
    await pg.screenshot({ path: "shots/library/picker-" + d.n + ".png" });
    await pg.evaluate(() => {
      const h = document.getElementById("vq2-qtype-picker");
      if (h && h.__vq2) h.__vq2.forceClose("test");
    });
    await pg.waitForTimeout(400);

    /* ── 9. 画面のエラー ── */
    ok(d.n + "：画面のエラーが出ていない", errs.length === 0, errs.slice(0, 2).join(" / "));
    await pg.screenshot({ path: "shots/library/list-" + d.n + ".png", fullPage: false });
    await ctx.close();
  }

  await b.close();
  console.log("\n合格 " + pass + " / 不合格 " + fail);
  process.exit(fail ? 1 : 0);
})();
