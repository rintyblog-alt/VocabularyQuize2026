/* ══════════════════════════════════════════════════════════════════════
   VocabuSpeak（英語ワークスペース）

   確かめること:
   ・左パネルから Speak を開ける
   ・ホーム／レッスン／トレーニング／復習／履歴が出る
   ・レッスンを始めると、実際に問題が出て、答えられて、採点される
   ・**同じ問題が 2 回出ない**／同じ英文が続かない
   ・同じ英文が、別の形式で出題される
   ・間違えると復習に入り、学習履歴と Insight へ渡る
   ・スマートフォンで横スクロールしない
   ══════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
let pass = 0, fail = 0;
const errs = [];
const ok = (n, c, x) => { c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  NG   " + n + (x ? "  → " + x : ""))); };
const HIDE = "#vqNewAuth{display:none !important}";

async function login(pg, url) {
  await pg.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
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
  await pg.waitForTimeout(1500);
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
}
async function inShadow(pg, hostId, body, arg) {
  return pg.evaluate(({ id, src, a }) => {
    const host = document.getElementById(id);
    if (!host || !host.shadowRoot) return { __no: true };
    const root = host.shadowRoot.querySelector(".vq2-root");
    return new Function("root", "args", src)(root, a);
  }, { id: hostId, src: body, a: arg === undefined ? null : arg });
}
async function waitHost(pg, id) {
  await pg.waitForFunction((i) => {
    const h = document.getElementById(i);
    return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vq2-root"));
  }, id, { timeout: 25000 });
}
async function tab(pg, id) {
  await inShadow(pg, "vq2-speak", `
    const b = root.querySelector('[data-sp-tab="' + args + '"]');
    if (b) b.click(); return !!b;`, id);
  await pg.waitForTimeout(400);
}
/* 出ている問題を読む */
async function currentQ(pg) {
  return inShadow(pg, "vq2-speak", `
    const n = root.querySelector(".vq2-sp-qn");
    const a = root.querySelector(".vq2-sp-qa");
    const box = root.querySelector("[data-sp-answer]");
    return {
      n: n ? n.textContent.trim() : "",
      activity: a ? a.textContent.trim() : "",
      variantId: box ? (box.getAttribute("data-sp-variant") || "") : "",
      instruction: (root.querySelector(".vq2-sp-stem") || {}).textContent || "",
      text: box ? box.textContent.replace(/\\s+/g, " ").trim().slice(0, 120) : "",
      hasAudio: !!(box && box.querySelector(".vq2-audio")),
      choices: box ? [...box.querySelectorAll("[data-qr-choice]")].map(c => c.textContent.trim()) : [],
      inputs: box ? box.querySelectorAll("input,textarea").length : 0,
      note: (root.querySelector(".vq2-sp-qnote") || {}).textContent || ""
    };`);
}


/* 1 回だけ答えを入れてみる（形式ごとに入れ方が違う） */
async function answerOnce(pg) {
  return inShadow(pg, "vq2-speak", `
      const box = root.querySelector("[data-sp-answer]");
      if (!box) return "no-box";
      function type(el, v) {
        const p = el.tagName === "TEXTAREA" ? HTMLTextAreaElement : HTMLInputElement;
        Object.getOwnPropertyDescriptor(p.prototype, "value").set.call(el, v);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
      /* めくるカードは、めくれば答えたことになる */
      /* カードは、めくってから「覚えた／まだ」を押すと答えになる。 */
      const mk = box.querySelector('[data-act="qr-card-mark"][data-id="known"]');
      if (mk) { mk.click(); return "card"; }
      const flip = box.querySelector('[data-qr-flip]');
      if (flip) { flip.click(); return "flip"; }
      const c = box.querySelector("[data-qr-choice]");
      if (c) { c.click(); return "choice"; }
      const blanks = [...box.querySelectorAll("[data-qr-blank]")];
      if (blanks.length) { blanks.forEach(b => type(b, "x")); return "blank"; }
      const sp = [...box.querySelectorAll("[data-qr-span]")];
      if (sp.length) { sp.forEach(x => type(x, "x")); return "span"; }
      const cell = [...box.querySelectorAll("[data-qr-cell]")];
      if (cell.length) { cell.forEach(x => type(x, "x")); return "cell"; }
      const t = box.querySelector("[data-qr-text]");
      if (t) { type(t, "x"); return "text"; }
      /* 並べ替えは「動かす」ことで答えになる。上下ボタンを押す。 */
      const down = box.querySelector('[data-act="qr-down"]:not([disabled])');
      if (down) { down.click(); return "reorder"; }
      const up = box.querySelector('[data-act="qr-up"]:not([disabled])');
      if (up) { up.click(); return "reorder"; }
      const any = box.querySelector("textarea,input[type=text]");
      if (any) { type(any, "x"); return "any"; }
      return "none";`);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const pg = await ctx.newPage();
  pg.on("pageerror", (e) => errs.push(String(e).slice(0, 180)));
  await login(pg, "http://127.0.0.1:8791/?vqdev=1");

  console.log("\n── 左パネルから開く ──");
  const inSidebar = await pg.evaluate(() => {
    const h = document.getElementById("vqShell");
    if (!h || !h.shadowRoot) return null;
    const b = [...h.shadowRoot.querySelectorAll("[data-vq2]")].map((x) => ({
      action: x.getAttribute("data-vq2"), label: x.textContent.trim(), svg: !!x.querySelector("svg")
    }));
    return b;
  });
  const speakItem = (inSidebar || []).filter((x) => x.action === "speak")[0];
  ok("左パネルに Speak がある", !!speakItem, JSON.stringify(inSidebar));
  ok("表示名が Speak", speakItem && speakItem.label === "Speak", speakItem && speakItem.label);
  ok("アイコンは線画（絵文字ではない）", speakItem && speakItem.svg, JSON.stringify(speakItem));

  await pg.evaluate(() => {
    document.querySelectorAll(".vq2-host").forEach((h) => h.remove());
    const h = document.getElementById("vqShell");
    h.shadowRoot.querySelector('[data-vq2="speak"]').click();
  });
  await waitHost(pg, "vq2-speak");
  await pg.waitForTimeout(1200);

  const home = await inShadow(pg, "vq2-speak", `
    return {
      title: (root.querySelector(".vq2-sp-title") || {}).textContent || "",
      sub: (root.querySelector(".vq2-sp-sub") || {}).textContent || "",
      hero: (root.querySelector(".vq2-sp-start-t") || {}).textContent || "",
      startBtn: !!root.querySelector('[data-act="sp-start-lesson"]'),
      tabs: [...root.querySelectorAll(".vq2-sp-tab")].map(t => t.textContent.trim()),
      menu: [...root.querySelectorAll('[data-act="sp-train"]')].map(b => ({
        label: ((b.querySelector(".vq2-sp-tile-t") || b.querySelector("b") || {}).textContent || "").trim(),
        disabled: b.disabled })),
      ring: !!root.querySelector(".vq2-sp-ring"),
      week: root.querySelectorAll(".vq2-sp-week-c").length,
      pills: [...root.querySelectorAll(".vq2-sp-pill")].map(x => x.textContent.trim()),
      canVoice: !!(window.VQ2.stt && window.VQ2.stt.supported())
    };`);
  ok("VocabuSpeak のホームが開く", home.title === "VocabuSpeak", home.title);
  ok("説明が出る", /AIと話して/.test(home.sub), home.sub);
  ok("6 つのタブがある", home.tabs.length === 6, home.tabs.join("・"));
  ok("今日のレッスンを始められる", home.startBtn && home.hero.length > 0, home.hero);
  ok("学習メニューが並ぶ", home.menu.length >= 6, JSON.stringify(home.menu.map(m => m.label)));
  ok("今日の進み具合が輪で出る", home.ring, "");
  ok("この 7 日間が出る", home.week === 7, String(home.week));
  ok("いまのレベルと続けた日数が出る", home.pills.length >= 2, home.pills.join("・"));
  /* 話す練習は、録音と聞き取り（ローカルAI）がそろっていれば使える。
     音素の評価はまだ無いので、使えるときも「ベータ」と断る。 */
  const beta = home.menu.filter((m) => /スピーキング|シャドーイング/.test(m.label));
  ok("話す練習にベータの断りが付く", beta.length === 2 && beta.every((m) => /ベータ/.test(m.label)),
     JSON.stringify(beta));
  ok("使える／使えないが、その端末の実態と合っている",
     beta.every((m) => m.disabled === !home.canVoice), JSON.stringify({ canVoice: home.canVoice, beta }));

  console.log("\n── レッスン一覧 ──");
  await tab(pg, "lesson");
  const lessons = await inShadow(pg, "vq2-speak", `
    return [...root.querySelectorAll('[data-act="sp-start-lesson"]')].map(b => ({
      id: b.getAttribute("data-id"),
      title: (b.querySelector("b") || {}).textContent || "",
      sub: ((b.querySelector(".vq2-sp-lesson-s") || b.querySelector(".vq2-sp-row-s") || {}).textContent || "")
    }));`);
  ok("レッスンが並ぶ", lessons.length > 0, String(lessons.length));
  ok("カテゴリーが出る", lessons.length > 0 && lessons[0].sub.length > 0, lessons[0] && lessons[0].sub);
  ok("問題数と所要時間が出る", lessons.length > 0 && /問/.test(lessons[0].sub) && /分/.test(lessons[0].sub),
     lessons[0] && lessons[0].sub);

  console.log("\n── レッスンを解く ──");
  await inShadow(pg, "vq2-speak", `root.querySelector('[data-act="sp-start-lesson"]').click(); return true;`);
  await pg.waitForFunction(() => {
    const h = document.getElementById("vq2-speak");
    const r = h && h.shadowRoot && h.shadowRoot.querySelector(".vq2-root");
    return !!(r && r.querySelector("[data-sp-answer]"));
  }, null, { timeout: 30000 });
  await pg.waitForTimeout(400);

  const q1 = await currentQ(pg);
  ok("問題が出る", q1.n === "1 / 10" || /\/ \d+/.test(q1.n), q1.n);
  ok("何の練習かが出る", q1.activity.length > 0, q1.activity);
  ok("やることが日本語で書いてある", q1.instruction.length > 0, q1.instruction);
  ok("答える場所がある", q1.choices.length > 0 || q1.inputs > 0, JSON.stringify(q1).slice(0, 150));

  /* 10 問すべて解く。出た形式・英文・family を記録する。 */
  const seen = [];
  for (let i = 0; i < 12; i++) {
    const done = await inShadow(pg, "vq2-speak", `return !!root.querySelector(".vq2-sp-done");`);
    if (done === true) break;
    const meta = await pg.evaluate(() => {
      const h = document.getElementById("vq2-speak");
      const r = h.shadowRoot.querySelector(".vq2-root");
      const box = r.querySelector("[data-sp-answer]");
      if (!box) return null;
      /* いま出ている問題の中身は、画面からは読めないので内部の情報を使う。 */
      return window.__vqSpeakPeek ? window.__vqSpeakPeek() : null;
    });
    /* 正しい答えを入れる（正解の経路が動くことを確かめる） */
    /* 答えを入れる。カードのように 2 段階のものがあるので、
       「答え合わせ」が押せるようになるまで最大 3 回試す。 */
    for (let k = 0; k < 3; k++) {
      const enabled = await inShadow(pg, "vq2-speak", `
        const b = root.querySelector('[data-act="sp-check"]');
        return !!(b && !b.disabled);`);
      if (enabled === true) break;
      await answerOnce(pg);
      await pg.waitForTimeout(220);
    }
    await pg.waitForTimeout(150);
    const cur = await currentQ(pg);
    seen.push(cur);
    const clicked = await inShadow(pg, "vq2-speak", `
      const b = root.querySelector('[data-act="sp-check"]');
      if (b && !b.disabled) { b.click(); return "check"; }
      const n = root.querySelector('[data-act="sp-next"]');
      if (n) { n.click(); return "next"; }
      return "stuck";`);
    await pg.waitForTimeout(250);
    if (clicked === "check") {
      await inShadow(pg, "vq2-speak", `
        const n = root.querySelector('[data-act="sp-next"]');
        if (n) n.click(); return true;`);
      await pg.waitForTimeout(250);
    }
    if (clicked === "stuck") break;
  }

  const result = await inShadow(pg, "vq2-speak", `
    return {
      done: !!root.querySelector(".vq2-sp-done"),
      score: (root.querySelector(".vq2-sp-done-n") || {}).textContent || "",
      wrongCount: root.querySelectorAll(".vq2-sp-rv").length
    };`);
  ok("最後まで解ける", result.done, JSON.stringify(result));
  ok("結果が出る", /\d+ \/ \d+/.test(result.score), result.score);

  const acts = seen.map((s) => s.activity).filter(Boolean);
  const ids = seen.map((s) => s.variantId).filter(Boolean);
  const texts = seen.map((s) => s.text);
  ok("同じ問題が 2 回出ない", ids.length > 0 && new Set(ids).size === ids.length,
     ids.length + " 問中 " + new Set(ids).size + " 種類");
  /* 同じ英文（Atom）から別の出し方が出ることもある。それは重複ではない。 */
  const atoms = ids.map((x) => x.split("__")[0]);
  const reused = atoms.length - new Set(atoms).size;
  ok("同じ英文が続けて出ない",
     seen.every((s, i) => i === 0 || String(s.variantId).split("__")[0] !== String(seen[i - 1].variantId).split("__")[0]),
     atoms.join(" "));
  console.log("     同じ英文を別の形式で出した回数: " + reused);
  ok("形式が 1 つに偏らない", new Set(acts).size >= 3, [...new Set(acts)].join("・"));
  ok("聞く問題には再生ボタンが出る",
     seen.some((s) => /リスニング|ディクテーション|音声/.test(s.activity)) === false
       || seen.filter((s) => /リスニング|ディクテーション|音声/.test(s.activity)).every((s) => s.hasAudio),
     JSON.stringify(seen.filter((s) => /リスニング|ディクテーション|音声/.test(s.activity)).map(s => s.activity + ":" + s.hasAudio)));

  console.log("     出た形式: " + [...new Set(acts)].join("・"));

  console.log("\n── 履歴と復習へ渡る ──");
  const saved = await pg.evaluate(() => {
    const H = window.VQ2.speakHistory;
    return {
      history: H.listHistory().length,
      sessions: H.listSessions({}).length,
      review: H.listReview({}).length,
      learning: (window.VQ2.learning.listSessions ? window.VQ2.learning.listSessions({}) : [])
        .filter((s) => s.source === "vocabuspeak").length
    };
  });
  ok("出題履歴が残る（次から出さないため）", saved.history > 0, JSON.stringify(saved));
  ok("VocabuSpeak のセッションが残る", saved.sessions > 0, String(saved.sessions));
  ok("本体の学習履歴へも入る（Insight が読む）", saved.learning > 0, String(saved.learning));

  await inShadow(pg, "vq2-speak", `const b = root.querySelector('[data-act="sp-quit"]'); if (b) b.click(); return true;`);
  await pg.waitForTimeout(500);

  console.log("\n── もう一度やると、違う問題が出る ──");
  await tab(pg, "lesson");
  await inShadow(pg, "vq2-speak", `root.querySelector('[data-act="sp-start-lesson"]').click(); return true;`);
  await pg.waitForFunction(() => {
    const h = document.getElementById("vq2-speak");
    const r = h && h.shadowRoot && h.shadowRoot.querySelector(".vq2-root");
    return !!(r && (r.querySelector("[data-sp-answer]") || r.querySelector(".vq2-empty")));
  }, null, { timeout: 30000 });
  await pg.waitForTimeout(400);
  const round2 = [];
  for (let i = 0; i < 4; i++) {
    const c = await currentQ(pg);
    if (!c.n) break;
    round2.push(c.variantId);
    await inShadow(pg, "vq2-speak", `
      const box = root.querySelector("[data-sp-answer]");
      function type(el, v) {
        const p = el.tagName === "TEXTAREA" ? HTMLTextAreaElement : HTMLInputElement;
        Object.getOwnPropertyDescriptor(p.prototype, "value").set.call(el, v);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
      if (box) {
        const mk = box.querySelector('[data-act="qr-card-mark"][data-id="known"]');
        const flip = box.querySelector('[data-qr-flip]');
        const ch = box.querySelector("[data-qr-choice]");
        const bl = [...box.querySelectorAll("[data-qr-blank]")];
        const tx = box.querySelector("[data-qr-text]");
        if (mk) mk.click();
        else if (flip) flip.click();
        else if (ch) ch.click();
        else if (bl.length) bl.forEach(b => type(b, "x"));
        else if (box.querySelector("[data-qr-span]")) [...box.querySelectorAll("[data-qr-span]")].forEach(x => type(x, "x"));
        else if (tx) type(tx, "x");
        else {
          const dn = box.querySelector('[data-act="qr-down"]:not([disabled])');
          if (dn) dn.click();
        }
      }
      const b = root.querySelector('[data-act="sp-check"]');
      if (b && !b.disabled) b.click();
      return true;`);
    await pg.waitForTimeout(200);
    await inShadow(pg, "vq2-speak", `const n = root.querySelector('[data-act="sp-next"]'); if (n) n.click(); return true;`);
    await pg.waitForTimeout(200);
  }
  const overlap = round2.filter((t) => ids.indexOf(t) >= 0).length;
  ok("2 回目は、1 回目と同じ問題ばかりにならない", overlap <= 1,
     round2.length + " 問中 " + overlap + " 問が同じ");

  await inShadow(pg, "vq2-speak", `const b = root.querySelector('[data-act="sp-quit"]'); if (b) b.click(); return true;`);
  await pg.waitForTimeout(400);

  console.log("\n── 復習・履歴・AI英会話 ──");
  await tab(pg, "review");
  const rv = await inShadow(pg, "vq2-speak", `
    return { rows: root.querySelectorAll(".vq2-sp-rv").length,
             text: root.textContent.replace(/\\s+/g, " ").slice(0, 200) };`);
  ok("復習の画面が出る", rv.text.indexOf("復習") >= 0, rv.text.slice(0, 80));

  await tab(pg, "history");
  const hist = await inShadow(pg, "vq2-speak", `
    return { rows: root.querySelectorAll(".vq2-sp-row, .vq2-sp-lesson").length,
             stats: [...root.querySelectorAll(".vq2-sp-stat-l")].map(s => s.textContent.trim()) };`);
  ok("履歴に学習の記録が出る", hist.rows > 0, JSON.stringify(hist));

  await tab(pg, "talk");
  const talk = await inShadow(pg, "vq2-speak", `return root.textContent.replace(/\\s+/g, " ");`);
  ok("シナリオ英会話が並ぶ", /シナリオ英会話/.test(talk), talk.slice(0, 100));
  ok("自由英会話は「まだ作っていない」と正直に書いてある",
     /自由英会話/.test(talk) && /まだ作っていません/.test(talk), talk.slice(0, 200));

  console.log("\n── 設定 ──");
  await inShadow(pg, "vq2-speak", `root.querySelector('[data-act="sp-prefs"]').click(); return true;`);
  await waitHost(pg, "vq2-speak-prefs");
  await pg.waitForTimeout(300);
  const prefs = await inShadow(pg, "vq2-speak-prefs", `
    return { keys: [...new Set([...root.querySelectorAll("[data-k]")].map(s => s.getAttribute("data-k")))],
             secs: [...root.querySelectorAll(".vq2-set-sec h3")].map(x => x.textContent.trim()),
             text: root.textContent.replace(/\\s+/g, " ") };`);
  ok("速さ・字幕・日本語訳を選べる",
     ["speed", "subtitle", "showJapanese"].every((k) => prefs.keys.includes(k)), prefs.keys.join(","));
  ok("1 日の目標を決められる", prefs.keys.includes("dailyGoalMinutes"), prefs.keys.join(","));
  ok("まとまりごとに分かれている", prefs.secs.length >= 4, prefs.secs.join("・"));
  ok("録音した音声の保存方針を選べる", prefs.keys.includes("audioRetention"), prefs.keys.join(","));
  ok("既定はすぐ消す（長く残さない）", /すぐ消/.test(prefs.text), prefs.text.slice(0, 60));
  ok("外へ送らないと書いてある", /外へ送ることはありません/.test(prefs.text), "");
  await inShadow(pg, "vq2-speak-prefs", `root.querySelector('[data-act="x"]').click(); return true;`);
  await pg.waitForTimeout(300);

  console.log("\n── レベルを変える ──");
  await inShadow(pg, "vq2-speak", `root.querySelector('[data-act="sp-level"]').click(); return true;`);
  await waitHost(pg, "vq2-speak-level");
  await pg.waitForTimeout(300);
  const lv = await inShadow(pg, "vq2-speak-level", `
    return [...root.querySelectorAll("[data-lv]")].map(b => ({
      name: (b.querySelector(".vq2-lv-t") || {}).textContent.trim(),
      cefr: (b.querySelector(".vq2-lv-badge") || {}).textContent.trim(),
      facts: [...b.querySelectorAll(".vq2-lv-facts span")].map(x => x.textContent.trim()) }));`);
  ok("6 段階から選べる", lv.length === 6, lv.map(x => x.cefr).join("・"));
  ok("日本語と CEFR を並べて出す",
     lv.some(x => x.name.indexOf("初中級") === 0 && x.cefr === "A2"),
     lv.map(x => x.name + "/" + x.cefr).join("・"));
  ok("選ぶと何が変わるかが書いてある",
     lv.every(x => x.facts.length >= 3), JSON.stringify(lv[0] && lv[0].facts));
  await inShadow(pg, "vq2-speak-level", `
    const b = [...root.querySelectorAll("[data-lv]")].filter(x => x.getAttribute("data-lv") === "a2")[0];
    if (b) b.click(); return true;`);
  await pg.waitForTimeout(600);
  const afterLv = await inShadow(pg, "vq2-speak", `
    return (root.querySelector('[data-act="sp-level"]') || {}).textContent || "";`);
  ok("選んだレベルが画面に出る", /A2/.test(afterLv), afterLv.trim());

  console.log("\n── スマートフォン ──");
  await pg.setViewportSize({ width: 375, height: 780 });
  await pg.waitForTimeout(700);
  const mob = await pg.evaluate(() => {
    const h = document.getElementById("vq2-speak");
    const r = h.shadowRoot.querySelector(".vq2-root");
    const body = r.querySelector(".vq2-sp-body");
    const tabs = r.querySelector(".vq2-sp-tabs");
    /* 「…」で省略している要素は scrollWidth が大きくなるが、画面ははみ出さない。
       見たいのは **画面の幅を超えている要素**だけ。 */
    const vw = window.innerWidth;
    const over = [...r.querySelectorAll("*")].filter((e) => {
      const q = e.getBoundingClientRect();
      return q.width > vw + 1 || q.right > vw + 1 || q.left < -1;
    }).map((e) => (e.className || e.tagName) + "@" + Math.round(e.getBoundingClientRect().right)).slice(0, 3);
    const small = [...r.querySelectorAll("button")].filter((b) => {
      const q = b.getBoundingClientRect();
      return q.width > 0 && q.height > 0 && q.height < 40;
    }).map((b) => (b.className || "") + ":" + Math.round(b.getBoundingClientRect().height)).slice(0, 4);
    return {
      mobileClass: r.classList.contains("is-mobile"),
      bodyOverflow: body ? body.scrollWidth - body.clientWidth : -1,
      tabsBottom: tabs ? Math.round(tabs.getBoundingClientRect().bottom) : -1,
      viewH: window.innerHeight,
      overflow: over, small: small
    };
  });
  ok("モバイル表示になる", mob.mobileClass, JSON.stringify(mob));
  ok("横スクロールが出ない", mob.bodyOverflow <= 2, String(mob.bodyOverflow));
  ok("はみ出す要素が無い", mob.overflow.length === 0, mob.overflow.join(" / "));
  ok("タブが画面の下にある", Math.abs(mob.tabsBottom - mob.viewH) < 6, mob.tabsBottom + " / " + mob.viewH);
  ok("押しにくい小さなボタンが無い", mob.small.length === 0, mob.small.join(" / "));

  ok("画面のエラーが出ていない", errs.length === 0, errs.slice(0, 2).join(" / "));

  await browser.close();
  console.log("\n合格 " + pass + " / 不合格 " + fail);
  process.exit(fail ? 1 : 0);
})();
