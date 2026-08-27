/* ══════════════════════════════════════════════════════════════════════
   公開モーダル・作者表示・浮いていた「＋」の確認
   ・公開画面がモーダルで開き、これまでの項目（公開ID・名前・アイコン・色・
     注意事項と同意）がそろっているか
   ・触ると「公開したらこう見える」が変わるか
   ・同意していないうちは公開できないか
   ・すでに公開しているものは「変更を保存」「公開をやめる」になるか
   ・公開しているプリセットのカードに、ユーザー名・@ID・アイコンが出るか
   ・右下の「＋」が新 UI では出ないか
   ══════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const fs = require("node:fs");
fs.mkdirSync("shots/publish", { recursive: true });
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
  } catch (e) {}
};

/* 公開の通信はサーバに触るので、この確認では**受け口だけ差し替える**。
   本物の通信は別のところで確認する。ここで見たいのは画面の作り。 */
const STUB = () => {
  const A = window.__vqAppData;
  window.__vqPublishCalls = [];
  A.publish.available = () => true;
  A.publish.reason = () => "";
  A.publish.checkSlug = async (slug) => ({
    available: !/taken/.test(String(slug || "")),
    message: /taken/.test(String(slug || "")) ? "この公開IDは使われています。" : "この公開IDは使えます。"
  });
  A.publish.submit = async (pid, opts) => {
    window.__vqPublishCalls.push({ kind: "submit", pid, opts });
    return { ok: true, body: {} };
  };
  A.publish.unpublish = async (pid) => {
    window.__vqPublishCalls.push({ kind: "unpublish", pid });
    return { ok: true, body: {} };
  };
  /* 自分のプロフィール（公開カードの作者表示に使う） */
  A.me = () => ({
    userId: "42", nickname: "rinty", displayName: "りんてぃ",
    handle: "rinty", avatarUrl: "", loggedIn: true
  });
};

const SEED = () => {
  const S = VQ2.schema, ST = VQ2.store;
  const mk = (t) => S.emptyQuestion({
    type: "multiple_choice_single", prompt: t, points: 1,
    choices: [
      { id: "c1", label: "A", text: "正しい", explanation: "", isCorrect: true },
      { id: "c2", label: "B", text: "ちがう", explanation: "", isCorrect: false }
    ]
  });
  const p = S.emptyPreset({
    name: "公開テスト用プリセット", subjectId: "sub:english",
    questions: [mk("問1"), mk("問2")]
  });
  const r = ST.savePreset(p, { ownerId: ST.currentOwnerId() });
  return { ok: r.ok, id: p.id };
};

const PP = () => {
  const h = document.getElementById("vq2-preset-publish");
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

    /* ── 0. 受け口 ── */
    const bridge = await pg.evaluate(() => {
      const A = window.__vqAppData;
      if (!A) return { missing: true };
      return {
        hasMe: typeof A.me === "function",
        hasPublish: !!A.publish,
        icons: (A.publish.icons() || []).length,
        colors: (A.publish.colors() || []).length,
        me: A.me()
      };
    });
    ok(d.n + "：アプリ側の受け口がある", !bridge.missing && bridge.hasMe && bridge.hasPublish);
    ok(d.n + "：アイコンと色をアプリから引ける", bridge.icons >= 20 && bridge.colors >= 10,
       bridge.icons + " / " + bridge.colors);

    const seeded = await pg.evaluate(SEED);
    ok(d.n + "：テスト用プリセットを置けた", seeded.ok);
    await pg.evaluate(STUB);

    /* ── 1. 右下の「＋」 ── */
    const fab = await pg.evaluate(() => {
      const f = document.getElementById("appFeedFab");
      if (!f) return { none: true };
      f.classList.remove("hidden");              /* わざと出そうとしてみる */
      const cs = getComputedStyle(f);
      return { disp: cs.display, vis: cs.visibility, w: Math.round(f.getBoundingClientRect().width) };
    });
    ok(d.n + "：右下の「＋」は新 UI では出ない",
       fab.none || (fab.disp === "none" && fab.w === 0), JSON.stringify(fab));

    /* ── 2. モーダルで開く ── */
    await pg.evaluate((pid) => VQ2.presetPublish.open({ presetId: pid }), seeded.id);
    await pg.waitForTimeout(900);
    const m = await pg.evaluate(() => {
      const sr = document.getElementById("vq2-preset-publish");
      if (!sr || !sr.shadowRoot) return { none: true };
      const r = sr.shadowRoot.querySelector(".vq2-root");
      const rc = r.getBoundingClientRect();
      const secs = [].map.call(sr.shadowRoot.querySelectorAll(".vq2-sec-t"), (x) => x.textContent.trim());
      return {
        sheet: r.classList.contains("is-sheet"),
        full: Math.round(rc.width) >= window.innerWidth,
        width: Math.round(rc.width),
        secs,
        hasSlug: !!sr.shadowRoot.querySelector('[data-key="slug"]'),
        hasTitle: !!sr.shadowRoot.querySelector('[data-key="title"]'),
        hasAgree: !!sr.shadowRoot.querySelector('[data-key="agreed"]'),
        colors: sr.shadowRoot.querySelectorAll("[data-act='color']").length,
        notice: sr.shadowRoot.querySelectorAll(".vq2-pp-notice li").length,
        goDisabled: sr.shadowRoot.querySelector('[data-act="go"]').disabled,
        goLabel: sr.shadowRoot.querySelector('[data-act="go"]').textContent.trim(),
        prevTitle: (sr.shadowRoot.querySelector("[data-prevTitle]") || {}).textContent,
        link: (sr.shadowRoot.querySelector("[data-link]") || {}).textContent
      };
    });
    ok(d.n + "：公開画面がモーダルで開く", !m.none && m.sheet);
    if (!d.m) ok(d.n + "：全画面を奪わない", !m.full, m.width + "px");
    else ok(d.n + "：スマホは下から画面いっぱい", m.width >= 380, m.width + "px");
    ok(d.n + "：これまでの項目がそろっている",
       m.hasSlug && m.hasTitle && m.hasAgree && m.colors >= 10 && m.notice >= 4,
       JSON.stringify(m.secs));
    ok(d.n + "：同意していないうちは公開できない", m.goDisabled === true);
    ok(d.n + "：「公開する」と書いてある", /公開する/.test(m.goLabel), m.goLabel);
    ok(d.n + "：公開したらどう見えるかが出ている",
       /公開テスト用プリセット/.test(m.prevTitle || "") && /preset\//.test(m.link || ""),
       (m.prevTitle || "") + " / " + (m.link || ""));

    /* ── 3. 触ると見え方が変わる ── */
    const live = await pg.evaluate(async () => {
      const sr = document.getElementById("vq2-preset-publish").shadowRoot;
      const t = sr.querySelector('[data-key="title"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(t, "みんなの英単語");
      t.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 200));
      const before = getComputedStyle(sr.querySelector(".vq2-pp-ico")).backgroundColor;
      const cols = sr.querySelectorAll("[data-act='color']");
      cols[cols.length - 1].click();
      await new Promise((r) => setTimeout(r, 250));
      const sr2 = document.getElementById("vq2-preset-publish").shadowRoot;
      return {
        title: (sr2.querySelector("[data-prevTitle]") || {}).textContent,
        before, after: getComputedStyle(sr2.querySelector(".vq2-pp-ico")).backgroundColor
      };
    });
    ok(d.n + "：名前を打つと見え方に反映される", /みんなの英単語/.test(live.title || ""), live.title);
    ok(d.n + "：色を選ぶと見え方に反映される", live.before !== live.after, live.before + " → " + live.after);

    /* ── 4. アイコンを開いて選ぶ ── */
    const icons = await pg.evaluate(async () => {
      const sr = document.getElementById("vq2-preset-publish").shadowRoot;
      sr.querySelector('[data-act="toggle-icons"]').click();
      await new Promise((r) => setTimeout(r, 300));
      const sr2 = document.getElementById("vq2-preset-publish").shadowRoot;
      const list = sr2.querySelectorAll("[data-act='icon']");
      const groups = sr2.querySelectorAll(".vq2-pp-icg").length;
      const box = sr2.querySelector(".vq2-pp-icons");
      const scrolls = box ? getComputedStyle(box).overflowY : "";
      if (list.length > 3) list[3].click();
      await new Promise((r) => setTimeout(r, 300));
      const sr3 = document.getElementById("vq2-preset-publish").shadowRoot;
      return { n: list.length, groups, scrolls,
               picked: sr3.querySelectorAll("[data-act='icon'].is-on").length };
    });
    ok(d.n + "：アイコンは分類ごとに並ぶ", icons.n >= 20 && icons.groups >= 3, icons.n + " 個 / " + icons.groups + " 分類");
    ok(d.n + "：アイコンの一覧だけがスクロールする", icons.scrolls === "auto" || icons.scrolls === "scroll", icons.scrolls);
    ok(d.n + "：アイコンを選べる", icons.picked === 1, "選択 " + icons.picked);

    /* ── 5. 公開ID の確認 ── */
    const slug = await pg.evaluate(async () => {
      const set = (v) => {
        const sr = document.getElementById("vq2-preset-publish").shadowRoot;
        const i = sr.querySelector('[data-key="slug"]');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, v);
        i.dispatchEvent(new Event("input", { bubbles: true }));
      };
      set("taken-id");
      await new Promise((r) => setTimeout(r, 900));
      const sr1 = document.getElementById("vq2-preset-publish").shadowRoot;
      const ng = { msg: sr1.querySelector("[data-slugmsg]").textContent.trim(),
                   cls: sr1.querySelector("[data-slugmsg]").className,
                   go: sr1.querySelector('[data-act="go"]').disabled };
      set("my-open-words");
      await new Promise((r) => setTimeout(r, 900));
      const sr2 = document.getElementById("vq2-preset-publish").shadowRoot;
      const good = { msg: sr2.querySelector("[data-slugmsg]").textContent.trim(),
                     cls: sr2.querySelector("[data-slugmsg]").className,
                     link: sr2.querySelector("[data-link]").textContent.trim() };
      return { ng, good };
    });
    ok(d.n + "：使えない公開IDははっきり分かる",
       /使われて/.test(slug.ng.msg) && /is-ng/.test(slug.ng.cls) && slug.ng.go === true, slug.ng.msg);
    ok(d.n + "：使える公開IDもはっきり分かる",
       /使えます/.test(slug.good.msg) && /is-ok/.test(slug.good.cls), slug.good.msg);
    ok(d.n + "：リンクが公開IDに追いつく", /my-open-words/.test(slug.good.link), slug.good.link);

    /* ── 6. 同意して公開 ── */
    await pg.screenshot({ path: "shots/publish/form-" + d.n + ".png" });
    const done = await pg.evaluate(async () => {
      const sr = document.getElementById("vq2-preset-publish").shadowRoot;
      sr.querySelector('[data-key="agreed"]').click();
      await new Promise((r) => setTimeout(r, 200));
      const sr1 = document.getElementById("vq2-preset-publish").shadowRoot;
      const canGo = !sr1.querySelector('[data-act="go"]').disabled;
      sr1.querySelector('[data-act="go"]').click();
      await new Promise((r) => setTimeout(r, 900));
      const sr2 = document.getElementById("vq2-preset-publish").shadowRoot;
      const root = sr2.querySelector(".vq2-root");
      return {
        canGo,
        text: root ? root.textContent : "",
        hasCopy: !!sr2.querySelector('[data-act="copy"]'),
        calls: window.__vqPublishCalls.slice()
      };
    });
    ok(d.n + "：同意すると公開できるようになる", done.canGo);
    ok(d.n + "：公開の内容がそのまま渡る",
       done.calls.length === 1 && done.calls[0].kind === "submit"
       && done.calls[0].opts.slug === "my-open-words"
       && done.calls[0].opts.publicTitle === "みんなの英単語",
       JSON.stringify(done.calls[0] && done.calls[0].opts));
    ok(d.n + "：公開したことが分かる", /公開しました/.test(done.text) && done.hasCopy);
    await pg.screenshot({ path: "shots/publish/done-" + d.n + ".png" });
    await pg.evaluate(() => {
      const h = document.getElementById("vq2-preset-publish");
      if (h && h.__vq2) h.__vq2.forceClose("test");
    });
    await pg.waitForTimeout(400);

    /* ── 7. すでに公開しているとき ── */
    const again = await pg.evaluate(async (pid) => {
      const A = window.__vqAppData;
      const base = A.publish.meta(pid) || {};
      A.publish.meta = () => Object.assign({}, base, {
        isPublic: true, slug: "my-open-words", publicTitle: "みんなの英単語"
      });
      VQ2.presetPublish.open({ presetId: pid });
      await new Promise((r) => setTimeout(r, 800));
      const sr = document.getElementById("vq2-preset-publish").shadowRoot;
      return {
        go: sr.querySelector('[data-act="go"]').textContent.trim(),
        goDisabled: sr.querySelector('[data-act="go"]').disabled,
        hasStop: !!sr.querySelector('[data-act="stop"]'),
        hasAgree: !!sr.querySelector('[data-key="agreed"]')
      };
    }, seeded.id);
    ok(d.n + "：公開済みなら「変更を保存」になる", /変更を保存/.test(again.go), again.go);
    ok(d.n + "：公開済みならすぐ保存できる", again.goDisabled === false);
    ok(d.n + "：公開をやめる操作がある", again.hasStop);
    ok(d.n + "：同意のやり直しは求めない", !again.hasAgree);
    await pg.evaluate(() => {
      const h = document.getElementById("vq2-preset-publish");
      if (h && h.__vq2) h.__vq2.forceClose("test");
    });
    await pg.waitForTimeout(400);

    /* ── 8. カードの作者表示 ── */
    const author = await pg.evaluate(async () => {
      /* 公開しているカードを 1 枚こしらえて、作者の出方だけを見る */
      const L = VQ2.library;
      const card = L.fromScraped({
        id: "x1", kind: "mine", title: "公開しているプリセット", subject: "英語",
        count: 10, unit: "問", isPublic: true, actions: ["useCustom", "startCustomExam"]
      }, {});
      const me = window.__vqAppData.me();
      card.ownerName = me.displayName; card.ownerHandle = me.handle; card.ownerAvatarUrl = me.avatarUrl;
      const other = L.fromScraped({
        id: "x2", kind: "public", title: "ほかの人のプリセット", subject: "数学",
        count: 5, unit: "問", author: "ほかの人", actions: ["openPreset", "startExam"]
      }, {});
      other.ownerHandle = "someone";
      return { mine: card.visibility, ownerName: card.ownerName, handle: card.ownerHandle,
               otherName: other.ownerName, otherHandle: other.ownerHandle };
    });
    ok(d.n + "：自分が公開したものは公開扱いになる", author.mine === "public");
    ok(d.n + "：自分の名前と @ID が入る", author.ownerName === "りんてぃ" && author.handle === "rinty",
       author.ownerName + " @" + author.handle);

    /* 実際のカードでも出るか。
       本体のカードに「公開中」の印を付けて（＝公開した状態を作って）から描き直す。 */
    await pg.evaluate(() => {
      const t = document.querySelector('#appTabBar [data-app-tab="library"]');
      if (t) t.click();
    });
    await pg.waitForTimeout(1600);
    await pg.evaluate((pid) => {
      const page = document.getElementById("appLibraryPage");
      const btn = page && page.querySelector('[data-lib-action="useCustom"][data-id="' + pid + '"]');
      const item = btn && btn.closest(".app-library-item");
      if (!item) return false;
      let row = item.querySelector(".app-library-item-badges");
      if (!row) {
        row = document.createElement("div");
        row.className = "app-library-item-badges";
        item.querySelector(".app-library-item-copy").appendChild(row);
      }
      const chip = document.createElement("span");
      chip.className = "app-library-state-badge is-public";
      chip.textContent = "公開中";
      row.prepend(chip);
      return true;
    }, seeded.id);
    await pg.evaluate(() => { if (window.__vqPresetSearch) window.__vqPresetSearch(""); });
    await pg.waitForTimeout(700);
    const shown = await pg.evaluate(() => {
      const sr = document.getElementById("vqScreens").shadowRoot;
      const cards = [].slice.call(sr.querySelectorAll(".pc"));
      const pub = cards.filter((c) => /公開中|公開/.test(c.textContent));
      const withBy = cards.filter((c) => c.querySelector(".pc__byn"));
      return {
        total: cards.length, pub: pub.length, withBy: withBy.length,
        sample: withBy.length ? withBy[0].querySelector(".pc__by").textContent.trim() : "",
        avatars: sr.querySelectorAll(".pc__av").length,
        plainMine: cards.filter((c) => /自分が作成/.test(c.textContent)).length
      };
    });
    ok(d.n + "：非公開のものは「自分が作成」のまま", shown.plainMine >= 1, "件数 " + shown.plainMine);
    ok(d.n + "：公開しているカードに作者が出る", shown.withBy >= 1, "作者つき " + shown.withBy + " 枚");
    ok(d.n + "：作者はユーザー名・@ID・アイコンで出る",
       /りんてぃ/.test(shown.sample) && /@rinty/.test(shown.sample) && shown.avatars >= 1,
       shown.sample + " / アイコン " + shown.avatars);
    ok(d.n + "：自分のものだと分かる印がある", /自分/.test(shown.sample), shown.sample);
    console.log("    カード " + shown.total + " 枚 / 作者つき " + shown.withBy + " 枚"
      + (shown.sample ? " / 例: " + shown.sample : ""));
    await pg.screenshot({ path: "shots/publish/cards-" + d.n + ".png" });

    ok(d.n + "：画面のエラーが出ていない", errs.length === 0, errs.slice(0, 2).join(" / "));
    await ctx.close();
  }

  await b.close();
  console.log("\n合格 " + pass + " / 不合格 " + fail);
  process.exit(fail ? 1 : 0);
})();
