/* AI アクティビティのタイムラインを、ダミーの出来事で描いて確かめる（Phase 1）。

   ここで見るのは見た目と操作だけ。実データとの結線は別のテストで見る。

   実行: node vqtl.cjs [出力先]
*/
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
const OUT = process.argv[2] || "shots/phase1";
fs.mkdirSync(OUT, { recursive: true });

let pass = 0, fail = 0;
async function step(name, fn) {
  try { const m = await fn(); pass++; console.log("  ok   " + name + (m ? " — " + m : "")); }
  catch (e) { fail++; console.log("  NG   " + name + "\n         → " + (e && e.message)); }
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
  await pg.waitForTimeout(1000);
}

/* ダミーの出来事。実際に AI から届く形（type / label / status / detail / current / total）に合わせる。 */
const FAKE = [
  { type: "orchestrator.route", label: "依頼の内容を読み取りました", status: "completed" },
  { type: "worker.document", label: "資料を確認しています", status: "completed",
    detail: "pageCount=17 / extractedCharacterCount=5535 / evidenceCount=17" },
  { type: "plan.create", label: "出題条件を整理しました", status: "completed",
    detail: "大問=5 / 総問数=27 / 満点=100" },
  { type: "draft.create", label: "大問 3 まで作成しました", status: "running", current: 3, total: 5 },
  { type: "schema.validate", label: "一部の問題で選択肢数が一致していません", status: "warning",
    detail: "対象=Q7,Q12 / 期待=5 / 実際=4" },
  { type: "evidence.verify", label: "25 / 27 問の正解を資料で確認しました", status: "completed",
    current: 25, total: 27 }
];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 460, height: 900 }, deviceScaleFactor: 2 });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  await login(pg);

  console.log("\n══ タイムラインをダミーで描く ══");

  /* 画面の外に自前の入れ物を作り、そこへパネルを立てる。
     Shadow DOM の中に置かないとスタイルが当たらないので、既存の画面を 1 枚開いて間借りする。 */
  await pg.evaluate(() => {
    document.querySelectorAll(".vq2-host").forEach((h) => h.remove());
    window.VQ2.quickMock.open({});
  });
  await pg.waitForFunction(() => {
    const h = document.getElementById("vq2-quick-mock");
    return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vq2-root"));
  }, { timeout: 20000 });

  const built = await pg.evaluate((fake) => {
    const sr = document.getElementById("vq2-quick-mock").shadowRoot;
    const root = sr.querySelector(".vq2-root");
    root.innerHTML = '<div class="vq2-ws" style="height:100vh">'
      + '<aside class="vq2-ws-r" id="tlbox" style="width:100%"></aside></div>';
    const A = window.VQ2.activity;
    const p = A.createPanel({
      title: "AI アクティビティ",
      onCancel: function () { window.__tlStopped = true; },
      onFollowup: function (t) { window.__tlSent = t; p.setFollowups([{ text: t, state: "pending" }]); return true; },
      onAction: function (id) { window.__tlAction = id; }
    });
    p.mount(root.querySelector("#tlbox"));
    p.setBusy(true, "大問 3 を作っています");
    p.fromActivity(fake);
    /* あなたの指示・修復のお誘い・完了 も 1 件ずつ足す */
    p.push({ kind: "user-followup", title: "追加の指示を受け取りました",
             short: "正誤問題を多めにして", status: "done" });
    p.push({ kind: "repair", title: "修復候補を用意できます",
             short: "選択肢が足りない 2 問を、AI が直せます", status: "warn",
             actions: [{ id: "repair", label: "修復する", variant: "primary", icon: "wrench" }],
             details: [{ k: "issue code", v: "MISSING_CHOICE" }, { k: "retry", v: "1" }] });
    p.push({ kind: "success", title: "解答用紙を組み立てています", status: "done", duration: 1840 });
    window.__tl = p;
    return {
      items: root.querySelectorAll(".vq2-tl-i").length,
      bash: root.querySelectorAll(".vq2-bash").length,
      nodes: root.querySelectorAll(".vq2-tl-node").length,
      kinds: Array.from(root.querySelectorAll(".vq2-tl-i")).map((li) =>
        (li.className.match(/k-[a-z-]+/) || [""])[0])
    };
  }, FAKE);

  await pg.waitForTimeout(400);

  await step("1) タイムライン形式になっている", async () =>
    assert(built.items >= 9, "件数 " + built.items) || built.items + " 件");

  await step("2) 点と線でつながって見える", async () => {
    const r = await pg.evaluate(() => {
      const sr = document.getElementById("vq2-quick-mock").shadowRoot;
      const li = sr.querySelectorAll(".vq2-tl-i");
      const first = getComputedStyle(li[0], "::before");
      const last = getComputedStyle(li[li.length - 1], "::before");
      return { firstLine: first.display !== "none", lastLine: last.display !== "none",
               nodeW: getComputedStyle(sr.querySelector(".vq2-tl-node")).width };
    });
    assert(r.firstLine, "途中の行に縦線が無い");
    assert(!r.lastLine, "最後の行にも縦線が残っている");
    return "線あり / 最終行は線なし / 点 " + r.nodeW;
  });

  await step("3) 種類ごとにアイコンが変わる", async () => {
    const uniq = Array.from(new Set(built.kinds)).filter(Boolean);
    assert(uniq.length >= 6, "種類 " + uniq.length + " 種: " + uniq.join(","));
    /* 種類のアイコンは 2026-08-04 に左の点から見出しの前（.vq2-tl-ic）へ移した。
       点は「状態」だけを色で表し、種類は形で表す。求めるもの（種類が見分けられる）は同じ。 */
    const icons = await pg.evaluate(() => {
      const sr = document.getElementById("vq2-quick-mock").shadowRoot;
      return Array.from(sr.querySelectorAll(".vq2-tl-ic svg")).map((s) =>
        (s.querySelector("path,circle,rect") || {}).outerHTML || "").filter(Boolean);
    });
    assert(new Set(icons).size >= 5, "アイコンの絵柄が " + new Set(icons).size + " 種しかない");
    return uniq.length + " 種 / 絵柄 " + new Set(icons).size + " 種";
  });

  await step("4) Bash カードが IN / OUT 付きで出る", async () => {
    assert(built.bash >= 1, "Bash カードが無い");
    const r = await pg.evaluate(() => {
      const sr = document.getElementById("vq2-quick-mock").shadowRoot;
      const b = sr.querySelector(".vq2-bash");
      b.querySelector(".vq2-bash-h").click();
      const labels = Array.from(b.querySelectorAll(".vq2-bash-l")).map((e) => e.textContent);
      return { tag: b.querySelector(".vq2-bash-tag").textContent,
               name: b.querySelector(".vq2-bash-n").textContent,
               summary: (b.querySelector(".vq2-bash-s") || {}).textContent || "",
               labels: labels,
               keys: Array.from(b.querySelectorAll(".vq2-bash-k2")).map((e) => e.textContent) };
    });
    assert(r.tag === "Bash", "見出しが Bash でない: " + r.tag);
    assert(r.labels.indexOf("OUT") >= 0, "OUT が無い: " + r.labels.join(","));
    assert(r.keys.indexOf("pageCount") >= 0, "OUT の中身が入っていない: " + r.keys.join(","));
    return r.name + " / " + r.keys.join(", ");
  });

  await step("5) Bash カードは折りたためる", async () => {
    const r = await pg.evaluate(() => {
      const sr = document.getElementById("vq2-quick-mock").shadowRoot;
      /* 押すたびに行ごと描き直されるので、毎回引き直して見る（古い節点を掴まない） */
      const open = () => {
        const b = sr.querySelector(".vq2-bash");
        return { shown: getComputedStyle(b.querySelector(".vq2-bash-b")).display !== "none",
                 aria: b.querySelector(".vq2-bash-h").getAttribute("aria-expanded") };
      };
      const before = open();
      sr.querySelector(".vq2-bash-h").click();
      const after = open();
      return { before: before.shown, after: after.shown, aria: after.aria };
    });
    assert(r.before && !r.after, "開閉していない（前 " + r.before + " → 後 " + r.after + "）");
    assert(r.aria === "false", "aria-expanded が追随していない");
    return "開 → 閉 を確認";
  });

  await step("6) 詳細を開くと開発向けの情報が出る", async () => {
    const r = await pg.evaluate(() => {
      const sr = document.getElementById("vq2-quick-mock").shadowRoot;
      const shown = () => {
        const d = sr.querySelector(".vq2-tl-d");
        return d ? getComputedStyle(d).display !== "none" : false;
      };
      const hiddenBefore = !shown();
      sr.querySelector(".vq2-tl-more").click();
      const d = sr.querySelector(".vq2-tl-d");
      return { hiddenBefore: hiddenBefore, hiddenAfter: !shown(),
               label: sr.querySelector(".vq2-tl-more").textContent.trim(),
               dt: Array.from(d.querySelectorAll("dt")).map((e) => e.textContent) };
    });
    assert(r.hiddenBefore && !r.hiddenAfter, "詳細が開かない");
    assert(r.dt.indexOf("issue code") >= 0, "issue code が見当たらない: " + r.dt.join(","));
    return "普段は隠れ、開くと " + r.dt.join(" / ");
  });

  await step("7) 追加指示欄が組み込まれている", async () => {
    const r = await pg.evaluate(() => {
      const sr = document.getElementById("vq2-quick-mock").shadowRoot;
      const box = sr.querySelector("[data-tlinput]");
      const chips = Array.from(sr.querySelectorAll("[data-tlchip]")).map((e) => e.textContent);
      sr.querySelector("[data-tlchip]").click();
      const afterChip = box.value;
      box.value = "正誤問題を多めにして";
      sr.querySelector("[data-tlsend]").click();
      return { ph: box.getAttribute("placeholder"), chips: chips, afterChip: afterChip,
               sent: window.__tlSent, fu: sr.querySelectorAll(".vq2-fu-row").length,
               cleared: box.value };
    });
    assert(/指示/.test(r.ph), "案内文が違う: " + r.ph);
    assert(r.chips.length >= 3, "例示チップが少ない");
    assert(r.afterChip, "チップを押しても入力欄に入らない");
    assert(r.sent === "正誤問題を多めにして", "送信されていない: " + r.sent);
    assert(r.fu >= 1, "送った指示の状態一覧が出ない");
    assert(r.cleared === "", "送信後に入力欄が空にならない");
    return "チップ " + r.chips.length + " 個 / 送信・状態表示 OK";
  });

  await step("8) カードの操作ボタンが呼ばれる", async () => {
    const r = await pg.evaluate(() => {
      const sr = document.getElementById("vq2-quick-mock").shadowRoot;
      const b = sr.querySelector("[data-tlaction]");
      b.click();
      return { label: b.textContent, got: window.__tlAction };
    });
    assert(r.got === "repair", "押しても伝わらない: " + r.got);
    return r.label.trim();
  });

  await step("9) 停止ボタンは動いているときだけ出る", async () => {
    const r = await pg.evaluate(() => {
      const sr = document.getElementById("vq2-quick-mock").shadowRoot;
      const s = sr.querySelector("[data-tlstop]");
      const busy = !s.hidden;
      s.click();
      window.__tl.setBusy(false);
      return { busy: busy, stopped: window.__tlStopped, idle: sr.querySelector("[data-tlstop]").hidden };
    });
    assert(r.busy, "動いているのに停止が出ていない");
    assert(r.stopped, "押しても止まらない");
    assert(r.idle, "止まったのに停止ボタンが残っている");
    return "動作中のみ表示 → 押下で停止";
  });

  await step("10) 走っている行と終わった行が見分けられる", async () => {
    /* 状態の見せ方を「輪郭」から「点の色」へ変えた（2026-08-04）。
       求めるものは同じ＝**見分けられること**。
       特定の CSS の書き方ではなく、注意と完了で色が違うことを確かめる。 */
    const r = await pg.evaluate(() => {
      const sr = document.getElementById("vq2-quick-mock").shadowRoot;
      const run = sr.querySelector(".vq2-tl-i.is-running");
      const warn = sr.querySelector(".vq2-tl-i.is-warn");
      const done = sr.querySelector(".vq2-tl-i.is-done");
      const dotColor = (row) => {
        const d = row && row.querySelector(".vq2-tl-dot");
        return d ? getComputedStyle(d).backgroundColor : "";
      };
      return { run: !!run, spin: !!(run && run.querySelector(".vq2-spin")),
               warn: !!warn, warnDot: dotColor(warn), doneDot: dotColor(done) };
    });
    assert(r.run && r.spin, "走っている行に回るしるしが無い");
    assert(r.warn, "注意の行が無い");
    assert(r.warnDot && r.doneDot && r.warnDot !== r.doneDot,
      "注意と完了で点の色が同じ（" + r.warnDot + " / " + r.doneDot + "）");
    return "実行中は回転 / 注意と完了は点の色が違う";
  });

  await step("11) 内部コードは表に出ていない", async () => {
    const txt = await pg.evaluate(() => {
      const sr = document.getElementById("vq2-quick-mock").shadowRoot;
      /* 詳細と Bash の中は「開発向け」なので対象外。表に見えている文だけを見る。 */
      return Array.from(sr.querySelectorAll(".vq2-tl-t, .vq2-tl-s"))
        .map((e) => e.textContent).join("\n");
    });
    const bad = ["validation finished", "retrieval success", "generation complete",
                 "schema.validate", "context.retrieve", "draft.create", "issue code"];
    const hit = bad.filter((b) => txt.indexOf(b) >= 0);
    assert(!hit.length, "生の語が表に出ている: " + hit.join(","));
    assert(/[ぁ-んァ-ヶ一-龠]/.test(txt), "日本語になっていない");
    return "日本語の自然文のみ";
  });

  /* スクリーンショット */
  await pg.evaluate(() => {
    const sr = document.getElementById("vq2-quick-mock").shadowRoot;
    sr.querySelectorAll(".vq2-bash-h").forEach((b, i) => { if (i === 0) b.click(); });
    window.__tl.setBusy(true, "大問 3 を作っています");
  });
  await pg.waitForTimeout(300);
  await pg.screenshot({ path: path.join(OUT, "timeline.png") });
  console.log("\n  " + path.join(OUT, "timeline.png"));

  if (errs.length) { console.log("\n  画面のエラー:"); errs.forEach((e) => console.log("   - " + e)); }
  console.log("\n結果: " + pass + " 通過 / " + fail + " 失敗");
  await browser.close();
  process.exit(fail || errs.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
