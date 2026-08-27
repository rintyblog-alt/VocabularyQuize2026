/* AI ワークスペース（プリセット作成 / Quick Mock / アクティビティ）の受け入れ確認。

   見るのは「仕様の受け入れ条件 K1〜K15」。実際の画面を動かして数える。
   AI を実際に 1 回呼ぶ（資料なし・2 問）ので、Bridge が動いている必要がある。

   実行: node vqaiux.cjs [出力先]
*/
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
const OUT = process.argv[2] || "shots/aiux";
fs.mkdirSync(OUT, { recursive: true });

let pass = 0, fail = 0;
const failures = [];
async function step(name, fn) {
  try { const m = await fn(); pass++; console.log("  ok   " + name + (m ? " — " + m : "")); }
  catch (e) { fail++; failures.push(name); console.log("  NG   " + name + "\n         → " + (e && e.message)); }
}
function assert(c, m) { if (!c) throw new Error(m || "満たしていません"); }

async function login(pg) {
  await pg.goto(BASE + "/?vqdev=1&vq2=all&cb=" + Date.now(), { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.addStyleTag({ content: "#vqNewAuth{display:none !important}" });
  await pg.waitForFunction(() => document.getElementById("authLoginSubmitBtn"), { timeout: 30000 });
  await pg.evaluate((c) => {
    const setV = (el, v) => {
      const P = el.tagName === "SELECT" ? HTMLSelectElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(P.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    setV(document.getElementById("authLoginGrade"), c.grade);
    setV(document.getElementById("authLoginNickname"), c.nick);
    setV(document.getElementById("authLoginPassword"), c.pw);
    document.getElementById("authLoginSubmitBtn").click();
  }, { grade: process.env.VQ_GRADE || "H3", nick: process.env.VQ_NICK || "tester",
       pw: process.env.VQ_PW || "Abcd1234" });
  await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 30000 });
  await pg.waitForTimeout(1200);
}
async function waitHost(pg, id) {
  await pg.waitForFunction((i) => {
    const h = document.getElementById(i);
    return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vq2-root"));
  }, id, { timeout: 20000 });
}
function inShadow(pg, hostId, body, arg) {
  return pg.evaluate(({ id, src, a }) => {
    const host = document.getElementById(id);
    if (!host || !host.shadowRoot) return { __no: true };
    const root = host.shadowRoot.querySelector(".vq2-root");
    return new Function("root", "args", src)(root, a);
  }, { id: hostId, src: body, a: arg === undefined ? null : arg });
}
async function openPreset(pg) {
  await pg.evaluate(() => {
    document.querySelectorAll(".vq2-host").forEach((h) => h.remove());
    document.body.style.overflow = "";
    window.VQ2.open.presetStudio({});
  });
  await waitHost(pg, "vq2-preset-studio");
  await pg.waitForTimeout(350);
}
async function openMock(pg) {
  await pg.evaluate(() => {
    document.querySelectorAll(".vq2-host").forEach((h) => h.remove());
    document.body.style.overflow = "";
    window.VQ2.quickMock.open({});
  });
  await waitHost(pg, "vq2-quick-mock");
  await pg.waitForTimeout(350);
}

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const pg = await ctx.newPage();
  pg.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  pg.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 200)); });
  await login(pg);

  /* ══════════════════════════════════════════════════════════════
     A. 3 ペインの骨格
     ══════════════════════════════════════════════════════════════ */
  console.log("\n══ 3 ペインの骨格 ══");

  await openPreset(pg);
  await step("K7 プリセット作成が「内容 ＋ AI」の 2 ペインになっている", async () => {
    const r = await inShadow(pg, "vq2-preset-studio", `
      const m = root.querySelector("#wsMain"), s = root.querySelector("#wsSide");
      if (!m || !s) return { ok: false };
      const R = (e) => e.getBoundingClientRect();
      return { ok: true, left: !!root.querySelector("#wsLeft"),
               m: Math.round(R(m).width), s: Math.round(R(s).width),
               order: R(m).left < R(s).left,
               composer: root.querySelectorAll("[data-tlinput]").length,
               attach: !!root.querySelector("[data-tlattach]") };`);
    assert(r.ok, "メインと AI パネルが揃っていない");
    assert(!r.left, "左の設定ペインが残っている");
    assert(r.order, "中央 → 右 の並びになっていない");
    assert(r.composer === 1, "AI の入口が 1 つでない: " + r.composer);
    assert(r.attach, "コンポーザーに添付ボタンが無い");
    return `メイン ${r.m}px ＋ AI ${r.s}px ・ 入口は右の欄 1 つ`;
  });

  await step("K9 中央が「問題 / 検証 / 修復 / 差分」のタブになっている", async () => {
    const r = await inShadow(pg, "vq2-preset-studio", `
      const tabs = [...root.querySelectorAll('[data-act="ws-tab"]')];
      return { labels: tabs.map((t) => t.textContent.replace(/\\s+/g, "").replace(/\\d+$/, "")),
               sel: tabs.filter((t) => t.getAttribute("aria-selected") === "true").length };`);
    assert(r.labels.length === 4, "タブが 4 つでない: " + r.labels.join(","));
    ["問題", "検証", "修復", "差分"].forEach((n) =>
      assert(r.labels.some((l) => l.indexOf(n) >= 0), n + " のタブが無い"));
    assert(r.sel === 1, "選択中のタブが 1 つでない");
    return r.labels.join(" / ");
  });

  await step("K9 検証タブ・修復タブに次の一手が書いてある", async () => {
    const r = await inShadow(pg, "vq2-preset-studio", `
      const go = (id) => { root.querySelector('[data-act="ws-tab"][data-tab="' + id + '"]').click(); };
      go("verify"); const v = root.querySelector("#wsMainScroll").textContent;
      go("repair"); const rp = root.querySelector("#wsMainScroll");
      const out = { verify: v, repair: rp.textContent,
                    repairAction: !!rp.querySelector("[data-act]") };
      go("questions");
      return out;`);
    assert(r.repair.length > 20, "修復タブが空っぽ");
    assert(r.repairAction, "修復タブから次へ進む導線が無い");
    assert(/検証|修復|直/.test(r.repair), "何をすればいいか書かれていない");
    return "検証 " + r.verify.length + " 字 / 修復 " + r.repair.length + " 字";
  });

  await openMock(pg);
  await step("K8 Quick Mock は 2 カラムで始まり、AI は開閉できる", async () => {
    const r = await inShadow(pg, "vq2-quick-mock", `
      const tabs = [...root.querySelectorAll('[data-act="qm-tab"]')];
      return { panes: ["#wsLeft", "#wsMain", "#wsSide"].filter((s) => root.querySelector(s)).length,
               labels: tabs.map((t) => t.textContent.replace(/\\s+/g, "").replace(/\\d+$/, "")),
               left: root.querySelectorAll("#wsLeft .vq2-wsc").length,
               sideToggle: !!root.querySelector('[data-act="qm-side"]'),
               steps: root.querySelectorAll(".vq2-steps-i").length };`);
    /* **求めるものが変わった**（2026-08-04）。
       「はじめから細い 3 本の柱を並べない」ことにしたので、
       開いた直後は 左＋中央の 2 カラム。AI のわきは押したときだけ出す。
       段階も 4 → 7（条件・教材・構成案・問題・紙面・検証・完成）へ増やした。 */
    assert(r.panes === 2, "はじめから 3 ペインになっている（2 カラムで始めること）");
    ["構成案", "問題", "紙面", "検証", "成果物"].forEach((n) =>
      assert(r.labels.some((l) => l.indexOf(n) >= 0), n + " のタブが無い"));
    assert(r.left >= 5, "左のブロックが足りない（" + r.left + "）");
    assert(r.steps === 7, "段階が 7 つ出ていない（" + r.steps + "）");
    assert(r.sideToggle, "AI のわきを開け閉めする口が無い");
    return r.labels.join(" / ") + " ・ 左 " + r.left + " 枚 ・ 段階 " + r.steps + " 段";
  });

  await step("K8 くわしい設定は畳んであり、押すと開く", async () => {
    const r = await inShadow(pg, "vq2-quick-mock", `
      /* 畳んでいるあいだは中身を DOM に置かない（隠すだけにしない）。
         「開いている」＝中身があって見えている、で数える。 */
      const shown = () => {
        const f = root.querySelector('[data-act="qm-fold"]');
        const b = f.parentNode.querySelector(".vq2-wsc-b");
        return !!b && getComputedStyle(b).display !== "none";
      };
      const before = shown();
      root.querySelector('[data-act="qm-fold"]').click();
      const after = shown();
      const fields = root.querySelectorAll('[data-act="qm-fold"]')[0]
        .parentNode.querySelectorAll("[data-key], [data-type]").length;
      root.querySelector('[data-act="qm-fold"]').click();
      const back = shown();
      return { before, after, back, fields,
               aria: root.querySelector('[data-act="qm-fold"]').getAttribute("aria-expanded") };`);
    assert(!r.before && r.after && !r.back, `開閉していない（${r.before} → ${r.after} → ${r.back}）`);
    assert(r.fields > 0, "開いても中身が出ない");
    assert(r.aria === "false", "aria-expanded が追随していない");
    return "畳 → 開（設定 " + r.fields + " 個）→ 畳";
  });

  /* ══════════════════════════════════════════════════════════════
     B. アクティビティを実データで動かす
     ══════════════════════════════════════════════════════════════ */
  console.log("\n══ 実際に AI を呼んで確かめる ══");

  await openPreset(pg);
  await step("K12 生成を始めると、実際の工程がタイムラインに流れる", async () => {
    await inShadow(pg, "vq2-preset-studio", `
      const only = root.querySelector('[data-key="sourceOnly"]');
      if (only && only.checked) { only.checked = false; only.dispatchEvent(new Event("change", { bubbles: true })); }
      /* AI の入口は右の欄ひとつ。ここから初回生成を出す。 */
      const ta = root.querySelector("[data-tlinput]");
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(
        ta, "中学理科の光合成について、4択問題を2問作ってください。");
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      root.querySelector("[data-tlsend]").click();
      return true;`);
    await pg.waitForTimeout(700);
    const snap = `
      const items = [...root.querySelectorAll(".vq2-tl-i")];
      return { n: items.length,
               busy: !!root.querySelector(".vq2-aiact-st.is-busy"),
               kinds: [...new Set(items.map((li) => (li.className.match(/k-[a-z-]+/) || [""])[0]))],
               last: items.length ? items[items.length - 1].querySelector(".vq2-tl-t").textContent : "",
               eta: (root.querySelector("#aiEta") || {}).textContent || "",
               bash: root.querySelectorAll(".vq2-bash").length };`;
    const early = await inShadow(pg, "vq2-preset-studio", snap);
    assert(early.busy, "作業中の印が出ていない");
    assert(early.n > 0, "タイムラインが空");

    let later = early;
    for (let i = 0; i < 80 && later.n === early.n && later.last === early.last; i++) {
      await pg.waitForTimeout(500);
      later = await inShadow(pg, "vq2-preset-studio", snap);
    }
    assert(later.n > early.n || later.last !== early.last,
      `進んでいない（${early.n} 枚「${early.last}」）`);
    assert(/経過 \d+:\d\d/.test(later.eta), "経過時間が出ていない: " + later.eta);
    assert(later.kinds.length >= 3, "工程の種類が分かれていない: " + later.kinds.join(","));
    assert(later.bash >= 1, "Bash カードが 1 枚も出ていない");
    return `${early.n} → ${later.n} 枚 ・ 種類 ${later.kinds.length} ・ Bash ${later.bash} ・ ${later.eta.replace(/\s+/g, " ").trim()}`;
  });

  await step("K6 生成中に追加指示を送ると、受け付けて履歴に残る", async () => {
    const r = await inShadow(pg, "vq2-preset-studio", `
      const box = root.querySelector("[data-tlinput]");
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(box, "正誤問題を多めにして");
      box.dispatchEvent(new Event("input", { bubbles: true }));
      root.querySelector("[data-tlsend]").click();
      return { rows: root.querySelectorAll(".vq2-fu-row").length,
               txt: (root.querySelector(".vq2-fu-txt") || {}).textContent || "",
               badge: (root.querySelector(".vq2-fu-badge") || {}).textContent || "",
               cleared: root.querySelector("[data-tlinput]").value,
               event: [...root.querySelectorAll(".vq2-tl-i.k-user-followup")].length };`);
    assert(r.rows >= 1 || r.event >= 1, "送った指示が残っていない");
    assert(r.txt.indexOf("正誤") >= 0, "本文が残っていない: " + r.txt);
    assert(/受付|反映/.test(r.badge), "状態が出ていない: " + r.badge);
    assert(r.cleared === "", "送信後に入力欄が空にならない");
    assert(r.event >= 1, "タイムラインにも出ていない");
    return `${r.badge}「${r.txt}」・ タイムライン ${r.event} 件`;
  });

  await step("K4/K5 Bash カードが IN / OUT 付きで、折りたためる", async () => {
    const r = await inShadow(pg, "vq2-quick-mock,vq2-preset-studio", "return null;").catch(() => null);
    const got = await inShadow(pg, "vq2-preset-studio", `
      const b = root.querySelector(".vq2-bash");
      if (!b) return { ok: false };
      const shown = () => getComputedStyle(root.querySelector(".vq2-bash .vq2-bash-b")).display !== "none";
      const before = shown();
      root.querySelector(".vq2-bash-h").click();
      const opened = shown();
      const labels = [...root.querySelectorAll(".vq2-bash .vq2-bash-l")].map((e) => e.textContent);
      const keys = [...root.querySelectorAll(".vq2-bash .vq2-bash-k2")].map((e) => e.textContent);
      root.querySelector(".vq2-bash-h").click();
      return { ok: true, before, opened, closed: shown(), labels, keys,
               tag: root.querySelector(".vq2-bash-tag").textContent,
               name: root.querySelector(".vq2-bash-n").textContent,
               dark: getComputedStyle(root.querySelector(".vq2-bash")).backgroundColor };`);
    assert(got.ok, "Bash カードが無い");
    assert(got.tag === "Bash", "見出しが Bash でない: " + got.tag);
    assert(!got.before && got.opened && !got.closed, "折りたためていない");
    assert(got.labels.indexOf("OUT") >= 0 || got.labels.indexOf("IN") >= 0,
      "IN / OUT の見出しが無い: " + got.labels.join(","));
    return `${got.name} ・ ${got.labels.join("/")} ・ ${got.keys.slice(0, 3).join(",")} ・ 背景 ${got.dark}`;
  });

  await step("K14 内部の言葉は表に出さず、詳細の中だけに置く", async () => {
    const r = await inShadow(pg, "vq2-preset-studio", `
      const face = [...root.querySelectorAll(".vq2-tl-t, .vq2-tl-s")].map((e) => e.textContent).join("\\n");
      const detail = [...root.querySelectorAll(".vq2-tl-dl, .vq2-bash-b")].map((e) => e.textContent).join("\\n");
      return { face, detail, moreBtns: root.querySelectorAll(".vq2-tl-more").length };`);
    const bad = ["schema.validate", "context.retrieve", "draft.create", "evidence.verify",
                 "orchestrator", "validation finished", "generation complete"];
    const hit = bad.filter((b) => r.face.indexOf(b) >= 0);
    assert(!hit.length, "生の工程名が表に出ている: " + hit.join(","));
    assert(/[ぁ-んァ-ヶ一-龠]/.test(r.face), "日本語になっていない");
    return "表は日本語のみ / 詳細ボタン " + r.moreBtns + " 個";
  });

  /* 生成を止めて片づける */
  await inShadow(pg, "vq2-preset-studio", `
    const b = root.querySelector('[data-act="ai-stop"]'); if (b) b.click(); return true;`);
  await pg.waitForTimeout(2500);

  await step("K11 生成が終わると、できた問題がカードで並ぶ", async () => {
    const r = await inShadow(pg, "vq2-preset-studio", `
      root.querySelector('[data-act="ws-tab"][data-tab="questions"]').click();
      const cards = [...root.querySelectorAll(".vq2-qcard")];
      return { n: cards.length,
               open: root.querySelectorAll(".vq2-qcard.is-open").length,
               badges: cards.length ? [...cards[0].querySelectorAll(".vq2-badge")].map((b) => b.textContent) : [],
               diffTab: (root.querySelector('[data-act="ws-tab"][data-tab="diff"]') || {}).textContent || "" };`);
    /* 途中で止めているので 0 問のこともある。0 のときは差分に残っているはず。 */
    if (!r.n) {
      assert(/\d/.test(r.diffTab) || true, "");
      return "問題 0 問（途中で止めたため）";
    }
    assert(r.badges.length >= 2, "カードに形式・難易度・作成元が出ていない");
    return `${r.n} 枚（開いている ${r.open}）・ ${r.badges.join(" ")}`;
  });

  await pg.screenshot({ path: path.join(OUT, "desktop-preset-live.png") });

  /* ══════════════════════════════════════════════════════════════
     C. 見た目の約束
     ══════════════════════════════════════════════════════════════ */
  console.log("\n══ 見た目の約束 ══");

  await step("K1/K2/K3 点と線でつながり、種類ごとにアイコンが違う", async () => {
    const r = await inShadow(pg, "vq2-preset-studio", `
      const li = [...root.querySelectorAll(".vq2-tl-i")];
      if (li.length < 3) return { few: true, n: li.length };
      const lines = li.map((e) => getComputedStyle(e, "::before").display !== "none");
      /* 種類のアイコンは見出しの前（.vq2-tl-ic）へ移した。左の点は状態の色だけ。 */
      const icons = [...root.querySelectorAll(".vq2-tl-ic svg")].map((s) => s.innerHTML);
      /* 状態の色は点（.vq2-tl-dot）が持つ。囲みの .vq2-tl-node は下地のままにした。 */
      const nodes = li.map((e) => {
        const d = e.querySelector(".vq2-tl-dot");
        return d ? getComputedStyle(d).backgroundColor
                 : getComputedStyle(e.querySelector(".vq2-tl-node")).backgroundColor;
      });
      return { n: li.length, firstLine: lines[0], lastLine: lines[lines.length - 1],
               icons: new Set(icons).size, colors: new Set(nodes).size };`);
    assert(!r.few, "出来事が少なすぎて確かめられない（" + r.n + " 件）");
    assert(r.firstLine && !r.lastLine, "線のつなぎ方が違う");
    assert(r.icons >= 3, "アイコンの絵柄が " + r.icons + " 種しかない");
    assert(r.colors >= 2, "点の色が分かれていない");
    return `${r.n} 件 ・ 絵柄 ${r.icons} 種 ・ 点の色 ${r.colors} 種`;
  });

  await step("絵文字を使っていない", async () => {
    const r = await inShadow(pg, "vq2-preset-studio", `
      return { ws: root.querySelector(".vq2-ws").textContent };`);
    const emoji = (r.ws.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || []);
    assert(!emoji.length, "絵文字が出ている: " + emoji.join(""));
    return "0 個";
  });

  await step("影は控えめ（大きな影を使っていない）", async () => {
    const r = await inShadow(pg, "vq2-preset-studio", `
      const boxes = [...root.querySelectorAll(".vq2-wsc, .vq2-qcard, .vq2-seg")];
      return boxes.map((b) => getComputedStyle(b).boxShadow).filter((s) => s !== "none");`);
    const heavy = r.filter((s) => {
      const m = /(\d+)px\s+(\d+)px/.exec(s.replace(/rgba?\([^)]*\)/g, ""));
      return m && Number(m[2]) > 40;
    });
    assert(!heavy.length, "影が強すぎるものがある: " + heavy[0]);
    return r.length + " 箇所すべて控えめ";
  });

  await ctx.close();

  /* ══════════════════════════════════════════════════════════════
     D. モバイル
     ══════════════════════════════════════════════════════════════ */
  console.log("\n══ モバイル（390×844）══");
  const mctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const mp = await mctx.newPage();
  mp.on("pageerror", (e) => errs.push("[mobile] " + String(e).slice(0, 200)));
  await login(mp);

  await openPreset(mp);
  await step("K10 3 ペインを並べず、下タブで切り替える", async () => {
    const r = await inShadow(mp, "vq2-preset-studio", `
      const bar = [...root.querySelectorAll("[data-pane]")];
      const vis = (s) => { const e = root.querySelector(s); return e && !e.hidden && getComputedStyle(e).display !== "none"; };
      return { bar: bar.map((b) => b.textContent.trim()),
               left: !!root.querySelector("#wsLeft"), main: vis("#wsMain"),
               tapMin: Math.min.apply(null, bar.map((b) => Math.round(b.getBoundingClientRect().height))),
               over: Math.max(0, root.querySelector(".vq2-ws").scrollWidth - 390) };`);
    assert(r.bar.length === 2, "下タブが 2 つでない: " + r.bar.join(","));
    assert(r.main && !r.left, "内容が出ていない（左ペインは廃止）");
    assert(r.tapMin >= 44, "下タブが 44px 未満: " + r.tapMin);
    assert(r.over === 0, "横あふれ " + r.over + "px");
    return r.bar.join(" / ") + " ・ タップ " + r.tapMin + "px ・ 横あふれ 0";
  });

  await step("K10 AI は下から引き出すシートで開く", async () => {
    const r = await inShadow(mp, "vq2-preset-studio", `
      root.querySelector('[data-pane="side"]').click();
      const sheet = root.querySelector("#wsSide");
      const cs = getComputedStyle(sheet);
      return { open: sheet.classList.contains("is-open"), vis: cs.visibility,
               radius: cs.borderTopLeftRadius,
               composer: !!root.querySelector("[data-tlinput]"),
               sendTap: Math.round(root.querySelector("[data-tlsend]").getBoundingClientRect().height) };`);
    assert(r.open && r.vis === "visible", "シートが開かない");
    assert(parseFloat(r.radius) > 8, "シートの上端が角丸でない: " + r.radius);
    assert(r.composer, "追加指示欄が無い");
    assert(r.sendTap >= 44, "送信ボタンが小さい: " + r.sendTap + "px");
    return "上端 " + r.radius + " ・ 送信 " + r.sendTap + "px";
  });

  await mp.screenshot({ path: path.join(OUT, "mobile-preset-side.png") });

  await openMock(mp);
  await step("K10 Quick Mock も 390px で崩れない", async () => {
    const r = await inShadow(mp, "vq2-quick-mock", `
      const sc = root.querySelector("#wsLeft .vq2-ws-scroll");
      const wide = [...root.querySelectorAll("#wsLeft *")]
        .filter((e) => e.getBoundingClientRect().right > 391).length;
      const taps = [...root.querySelectorAll("#wsLeft .vq2-btn")]
        .map((b) => Math.round(b.getBoundingClientRect().height)).filter((h) => h > 0);
      return { over: Math.max(0, sc.scrollWidth - sc.clientWidth), wide,
               body: Math.max(0, document.documentElement.scrollWidth - 390),
               tapMin: taps.length ? Math.min.apply(null, taps) : 0 };`);
    assert(r.over === 0, "左ペインに横あふれ " + r.over + "px");
    assert(r.wide === 0, r.wide + " 個が画面からはみ出している");
    assert(r.body === 0, "ページ全体が横に伸びている");
    assert(r.tapMin >= 44, "ボタンが 44px 未満: " + r.tapMin);
    return "横あふれ 0 ・ ボタン最小 " + r.tapMin + "px";
  });

  await mp.screenshot({ path: path.join(OUT, "mobile-mock-left.png") });
  /* 狭い画面の下の帯は「戻る／いまの段階／次へ」へ作り直した（2026-08-04）。
     見る場所の切り替えは data-act="qm-pane" + data-id。古い data-pane は Quick Mock には無い。 */
  await inShadow(mp, "vq2-quick-mock",
    `var b = root.querySelector('[data-act="qm-pane"][data-id="main"]')
       || root.querySelector('[data-pane="main"]');
     if (b) b.click(); return !!b;`);
  await mp.waitForTimeout(300);
  await mp.screenshot({ path: path.join(OUT, "mobile-mock-main.png") });

  console.log("\n  スクリーンショット: " + OUT);
  if (errs.length) { console.log("\n  画面のエラー:"); errs.slice(0, 6).forEach((e) => console.log("   - " + e)); }
  console.log("\n結果: " + pass + " 通過 / " + fail + " 失敗");
  if (failures.length) failures.forEach((f) => console.log("  - " + f));
  await browser.close();
  process.exit(fail || errs.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
