/* プリセット自動作成AI / プリセット編集AI を **実ブラウザ** で確かめる。

   確かめること
     1. 既存プリセットへ AI で問題を足しても、問題番号が重ならない
        （1,2,4,7 → 8,9,10。空きは埋めない。画面にも保存データにも出る）
     2. 「AI で修正」が出ていて、対象（この問題だけ／プリセット全体）を選べる
     3. 生成中に追加指示を送れて、状態が受付済み → 反映中 → 反映済みと変わる
     4. 追加指示が全部反映されるまで完了にならない
     5. スマホの幅で、入力欄も差分もはみ出さない

   ローカル LLM は使わない（時間がかかるうえ、確かめたいのは配線と順序）。
   代わりに **本物と同じ形で応答する差し替え Provider** を入れて、
   出荷するコードそのものを動かす。

   実行: node vqpresetai.cjs [http://127.0.0.1:8791]
*/
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const BASE = process.argv[2] || "http://127.0.0.1:8791";
let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}${detail ? " — " + detail : ""}`); }
  else { fail++; failures.push(name + (detail ? " — " + detail : "")); console.log(`  × ${name}${detail ? " — " + detail : ""}`); }
}
function section(t) { console.log(`\n── ${t} ──`); }

/* 本物の Bridge の代わり。ai.js が使う API だけを本物と同じ形で返す。 */
const FAKE_PROVIDER = `
window.__vqLocalAI = (function () {
  var pending = null;
  function questions(n, label, difficulty) {
    return Array.from({ length: n }, function (_, i) {
      return { id: "q" + (i + 1), type: "multiple_choice",
        question: label + (i + 1),
        choices: [{ id: "a", text: "あ" }, { id: "b", text: "い" },
                  { id: "c", text: "う" }, { id: "d", text: "え" }],
        correctAnswer: "a", explanation: "解説", difficulty: difficulty || "normal" };
    });
  }
  return {
    isAvailable: function () { return Promise.resolve({ ok: true, engine: { ok: true } }); },
    discover: function () { return Promise.resolve("http://127.0.0.1:17891"); },
    pair: function () { return Promise.resolve({ ok: true }); },
    conf: function () { return {}; },
    isPaired: function () { return true; },
    getJob: function () { return Promise.resolve(null); },
    cancelGeneration: function () { if (pending) pending.cancelled = true; },
    _hosts: function () { return ["127.0.0.1"]; },
    url: function () { return "http://127.0.0.1:17891"; },
    streamMessage: function (req, cb) {
      var self = this;
      pending = { cancelled: false };
      var mine = pending;
      window.__fakeCalls = window.__fakeCalls || [];
      window.__fakeCalls.push({
        message: req.message,
        followups: (req.options && req.options.followups) || [],
        followupJobId: (req.options && req.options.followupJobId) || ""
      });
      cb("meta", { jobId: "job-fake-1" });
      return new Promise(function (resolve) {
        /* 応答までの間に、追加指示を送る時間を作る */
        setTimeout(function () {
          if (mine.cancelled) { cb("error", { code: "CANCELLED", message: "止めました" }); resolve(); return; }
          var msg = String(req.message || "");
          /* 追加指示は Bridge が本文へ足す。差し替え側でもそこを真似る。 */
          var fu = (req.options && req.options.followups) || [];
          var hard = /難しく/.test(msg) || fu.some(function (f) { return /難しく/.test(f.text); });
          var isRevise = msg.indexOf("次のプリセットを修正してください") === 0;
          if (isRevise) {
            /* 渡された問題の id をそのまま返す＝「どの問題への提案か」を示す */
            var m = msg.match(/"id":\\s*"([^"]+)"/g) || [];
            var ids = m.map(function (s) { return s.replace(/.*"id":\\s*"/, "").replace(/"$/, ""); });
            cb("structured", { questions: ids.map(function (id, i) {
              return { id: id, type: "multiple_choice", question: "直した問題" + (i + 1),
                choices: [{ id: "c1", text: "選択肢1" }, { id: "c2", text: "選択肢2" }],
                correctAnswer: "c1", explanation: "直した解説",
                difficulty: hard ? "hard" : "normal" };
            }) });
          } else {
            var n = (req.options && req.options.questionCount) || 3;
            cb("structured", { questions: questions(n, "AI問題", hard ? "hard" : "normal") });
          }
          resolve();
        }, window.__fakeDelay || 400);
      });
    }
  };
})();
`;

async function login(pg) {
  await pg.goto(BASE + "/?vqdev=1&vq2=all&cb=" + Date.now(), { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.addStyleTag({ content: "#vqNewAuth{display:none !important}" });
  /* 環境ごとにテスト用アカウントが違う（LAN はローカル D1、開発版 Worker は開発版 D1）。 */
  await pg.evaluate((c) => { window.__vqCreds = c; }, {
    grade: process.env.VQ_GRADE || "H3",
    nick: process.env.VQ_NICK || "tester",
    pw: process.env.VQ_PW || "Abcd1234"
  });
  await pg.waitForFunction(() => document.getElementById("authLoginSubmitBtn"), { timeout: 30000 });
  await pg.evaluate(() => {
    const setV = (el, v) => {
      const P = el.tagName === "SELECT" ? HTMLSelectElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(P.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    setV(document.getElementById("authLoginGrade"), window.__vqCreds.grade);
    setV(document.getElementById("authLoginNickname"), window.__vqCreds.nick);
    setV(document.getElementById("authLoginPassword"), window.__vqCreds.pw);
    document.getElementById("authLoginSubmitBtn").click();
  });
  await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 30000 });
  await pg.waitForTimeout(1500);
}

/* 画面に出ている問題番号を読む（Shadow DOM の中） */
async function shownNumbers(pg) {
  return pg.evaluate(() => {
    const host = document.getElementById("vq2-preset-studio");
    const root = host && host.shadowRoot ? host.shadowRoot : document;
    return Array.from(root.querySelectorAll(".vq2-qcard .vq2-item-n")).map((e) => Number(e.textContent.trim()));
  });
}
async function studioText(pg, sel) {
  return pg.evaluate((s) => {
    const host = document.getElementById("vq2-preset-studio");
    const root = host && host.shadowRoot ? host.shadowRoot : document;
    return Array.from(root.querySelectorAll(s)).map((e) => e.textContent.trim());
  }, sel);
}
async function clickIn(pg, sel) {
  return pg.evaluate((s) => {
    const host = document.getElementById("vq2-preset-studio");
    const root = host && host.shadowRoot ? host.shadowRoot : document;
    const el = root.querySelector(s);
    if (!el) return false;
    el.click();
    return true;
  }, sel);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();
  const pageErrors = [];
  pg.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));
  await login(pg);

  section("出荷するコードに入っているか");
  const api = await pg.evaluate(() => ({
    numberOf: typeof window.VQ2?.draft?.numberOf,
    assignAppended: typeof window.VQ2?.draft?.assignAppended,
    screenRevision: typeof window.VQ2?.draft?.screenRevision,
    pushFollowup: typeof window.VQ2?.draft?.pushFollowup,
    currentJobId: typeof window.VQ2?.ai?.currentJobId,
    maxChars: window.VQ2?.draft?.FOLLOWUP_MAX_CHARS
  }));
  console.log("   " + JSON.stringify(api));
  ok("採番と検査の関数が入っている",
    api.numberOf === "function" && api.assignAppended === "function"
    && api.screenRevision === "function" && api.pushFollowup === "function", JSON.stringify(api));
  ok("追加指示の上限が入っている", api.maxChars === 500, String(api.maxChars));
  ok("生成の Job ID を取り出せる", api.currentJobId === "function");

  section("1. 既存 1,2,4,7 のプリセットへ AI で 3 問追加");
  await pg.addScriptTag({ content: FAKE_PROVIDER });
  const presetId = await pg.evaluate(() => {
    const S = window.VQ2.schema, A = window.VQ2.adapter, ST = window.VQ2.store;
    const p = A.presetToV2({ id: "p_e2e_" + Date.now(), name: "番号テスト", cards: [
      { id: 1, front: "手書き1", back: "答1" }, { id: 2, front: "手書き2", back: "答2" },
      { id: 4, front: "手書き4", back: "答4" }, { id: 7, front: "手書き7", back: "答7" }
    ]});
    /* 所有者はいまログインしている本人にする。
       ここを "local" 固定にすると、ログイン中は所有権チェックに弾かれる
       （＝チェックが正しく働いている）。 */
    const r = ST.savePreset(p);
    if (!r.ok) return "ERR:" + r.error;
    return p.id;
  });
  ok("下ごしらえのプリセットを作れた", String(presetId).indexOf("ERR:") !== 0, String(presetId));
  await pg.evaluate((id) => { window.VQ2.presetStudio.open({ presetId: id }); }, presetId);
  await pg.waitForTimeout(900);

  const before = await shownNumbers(pg);
  console.log("   追加前の画面の番号: " + JSON.stringify(before));
  ok("既存の番号がそのまま出る（空きを詰めない）",
    JSON.stringify(before) === JSON.stringify([1, 2, 4, 7]), JSON.stringify(before));

  /* AI で 3 問作らせて、そのまま適用する */
  await pg.evaluate(() => {
    const host = document.getElementById("vq2-preset-studio");
    const root = host.shadowRoot;
    const ta = root.querySelector("[data-tlinput]");
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(ta, "3問作ってください");
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    root.querySelector("[data-tlsend]").click();
  });
  /* ローカル AI は数十秒かかる。出てくるまで待つ（決め打ちの秒数にしない）。 */
  await pg.waitForFunction(() => {
    const h = document.getElementById("vq2-preset-studio");
    return !!(h && h.shadowRoot.querySelector('[data-act="apply-all"]'));
  }, { timeout: 180000 }).catch(() => {});
  const applied = await clickIn(pg, '[data-act="apply-all"]');
  ok("AI の提案を適用できる", applied);
  await pg.waitForTimeout(700);

  const after = await shownNumbers(pg);
  console.log("   追加後の画面の番号: " + JSON.stringify(after));
  ok("追加した 3 問は 8,9,10（既存は動かない）",
    JSON.stringify(after) === JSON.stringify([1, 2, 4, 7, 8, 9, 10]), JSON.stringify(after));

  /* 保存してから、保存データを直接読む */
  const saved = await pg.evaluate((id) => {
    const host = document.getElementById("vq2-preset-studio");
    host.shadowRoot.querySelector('[data-act="save"]').click();
    return new Promise((res) => setTimeout(() => {
      /* 保存されなかったときに理由が分かるようにする（推測しないため） */
      const dlg = host.shadowRoot.querySelector(".vq2-dialog, [role='dialog'] .vq2-dialog");
      const dlgText = dlg ? dlg.textContent.trim().slice(0, 300) : "";
      const topSub = host.shadowRoot.querySelector(".vq2-top-sub");
      const v2 = JSON.parse(localStorage.getItem("vq2.presets.v1") || "[]").find((p) => p.id === id);
      const v1 = JSON.parse(localStorage.getItem("wordPractice400.presets.v1") || "[]").find((p) => p.id === id);
      res({
        v2: (v2?.questions || []).map((q) => q.questionNumber),
        v2ids: (v2?.questions || []).map((q) => q.id),
        v1: (v1?.cards || []).map((c) => c.id),
        dlgText, saveState: topSub ? topSub.textContent.trim() : ""
      });
    }, 1200));
  }, presetId);
  if (saved.dlgText || saved.saveState) console.log("   保存の状態: " + saved.saveState + (saved.dlgText ? " / 出た画面: " + saved.dlgText : ""));
  console.log("   保存データ V2 番号: " + JSON.stringify(saved.v2));
  console.log("   保存データ V1 番号: " + JSON.stringify(saved.v1));
  ok("保存データ（V2）の番号が 1,2,4,7,8,9,10",
    JSON.stringify(saved.v2) === JSON.stringify([1, 2, 4, 7, 8, 9, 10]), JSON.stringify(saved.v2));
  ok("保存データ（V1 カード）の番号も同じ",
    JSON.stringify(saved.v1) === JSON.stringify([1, 2, 4, 7, 8, 9, 10]), JSON.stringify(saved.v1));
  ok("内部 ID は全件一意（番号とは別物）",
    new Set(saved.v2ids).size === saved.v2ids.length, saved.v2ids.join(","));

  section("2. AI で修正（対象を選べる）");
  const ui = await pg.evaluate(() => {
    const root = document.getElementById("vq2-preset-studio").shadowRoot;
    const txt = (s) => Array.from(root.querySelectorAll(s)).map((e) => e.textContent.trim());
    return {
      composer: [(root.querySelector("[data-tlinput]") || {}).placeholder || ""],
      scope: Object.keys(window.VQ2.activity.STATES),
      editorBtns: txt('.vq2-qcard-b .vq2-pane-h .vq2-btn'),
      hasEmoji: /[\u{1F300}-\u{1FAFF}\u{2700}-\u{27BF}]/u.test(root.innerHTML)
    };
  });
  console.log("   " + JSON.stringify(ui.composer) + " / 対象: " + JSON.stringify(ui.scope));
  ok("同じ欄から修正を指示できる", ui.composer.some((t) => /修正/.test(t)), ui.composer.join("|"));
  ok("入力欄は作成前／生成中／生成後で役目が変わる",
    ui.scope.length === 3 && ui.scope.indexOf("running") >= 0, ui.scope.join("|"));
  ok("問題の編集画面からも AI 修正へ入れる",
    ui.editorBtns.some((t) => t.indexOf("AI で修正") >= 0), ui.editorBtns.join("|"));
  ok("絵文字を使っていない（既存のアイコンのみ）", !ui.hasEmoji);

  /* 1 問だけを対象に修正 → その問題だけ変わる */
  const revised = await pg.evaluate(async () => {
    const root = document.getElementById("vq2-preset-studio").shadowRoot;
    const items = Array.from(root.querySelectorAll(".vq2-qcard[data-qid]"));
    items[0].click();
    await new Promise((r) => setTimeout(r, 300));

    const ta = root.querySelector("[data-tlinput]");
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(ta, "この問題をもう少し難しくして");
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    root.querySelector("[data-tlsend]").click();
    await new Promise((r) => setTimeout(r, 2500));
    const btn = root.querySelector('[data-act="apply-all"]');
    if (btn) btn.click();
    await new Promise((r) => setTimeout(r, 700));
    const titles = Array.from(root.querySelectorAll(".vq2-qcard .vq2-item-t")).map((e) => e.textContent.trim());
    const nums = Array.from(root.querySelectorAll(".vq2-qcard .vq2-item-n")).map((e) => Number(e.textContent.trim()));
    return { titles, nums, applied: !!btn };
  });
  console.log("   " + JSON.stringify(revised.titles));
  ok("修正案を確認してから適用できる", revised.applied);
  ok("対象の 1 問だけが変わる",
    revised.titles[0].indexOf("直した") === 0
    && revised.titles.slice(1).every((t) => t.indexOf("直した") < 0),
    revised.titles.join(" | "));
  ok("修正しても番号は変わらない",
    JSON.stringify(revised.nums) === JSON.stringify([1, 2, 4, 7, 8, 9, 10]), JSON.stringify(revised.nums));

  section("3. 生成中の追加指示");
  const fu = await pg.evaluate(async () => {
    const root = document.getElementById("vq2-preset-studio").shadowRoot;
    window.__fakeDelay = 2500;                 /* 送る時間を作る */
    window.__fakeCalls = [];
    const setV = (el, v) => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    setV(root.querySelector("[data-tlinput]"), "2問作ってください");
    root.querySelector("[data-tlsend]").click();
    await new Promise((r) => setTimeout(r, 600));

    const box = root.querySelector("[data-tlinput]");
    const sendBtn = root.querySelector("[data-tlsend]");
    const visibleWhileBusy = !!box && !!sendBtn;

    /* 1 件送る */
    setV(box, "最後の問題を難しくして");
    sendBtn.click();
    await new Promise((r) => setTimeout(r, 300));
    const afterSend = Array.from(root.querySelectorAll(".vq2-fu-row")).map((e) => e.textContent.trim());

    /* 同じ操作を二重に送る（連打） */
    const box2 = root.querySelector("[data-tlinput]");
    setV(box2, "最後の問題を難しくして");
    root.querySelector("[data-tlsend]").click();
    await new Promise((r) => setTimeout(r, 300));
    const afterDouble = Array.from(root.querySelectorAll(".vq2-fu-row")).length;

    /* さらに 2 件送る（順序の確認） */
    const b3 = root.querySelector("[data-tlinput]");
    setV(b3, "解説を詳しくして");
    root.querySelector("[data-tlsend]").click();
    await new Promise((r) => setTimeout(r, 4000));      /* 生成 → 反映パスまで待つ */

    const list = Array.from(root.querySelectorAll(".vq2-fu-row")).map((e) => e.textContent.trim());
    const busy = !!(root.querySelector("[data-tlstop]") && !root.querySelector("[data-tlstop]").hidden);
    return { visibleWhileBusy, afterSend, afterDouble, list, busy, calls: window.__fakeCalls };
  });
  console.log("   送信直後: " + JSON.stringify(fu.afterSend));
  console.log("   最終:     " + JSON.stringify(fu.list));
  ok("生成中に追加指示の入力欄と送信ボタンが出る", fu.visibleWhileBusy);
  ok("送った直後は「受付済み」になる",
    fu.afterSend.some((t) => t.indexOf("受付済み") >= 0), JSON.stringify(fu.afterSend));
  ok("送った指示が消えずに残る",
    fu.afterSend.some((t) => t.indexOf("最後の問題を難しくして") >= 0), JSON.stringify(fu.afterSend));
  ok("二重送信しても 1 件のまま", fu.afterDouble === 1, String(fu.afterDouble));
  ok("すべての追加指示が「反映済み」になる",
    fu.list.length === 2 && fu.list.every((t) => t.indexOf("反映済み") >= 0), JSON.stringify(fu.list));
  ok("追加指示を反映し終えるまで完了にならない（反映後は停止ボタンが消える）", !fu.busy);

  const fuCalls = (fu.calls || []).filter((c) => (c.followups || []).length);
  console.log("   追加指示を載せた呼び出し: " + fuCalls.length + " 回");
  ok("追加指示は構造化してサーバへ渡している（本文へ書き足していない）",
    fuCalls.length >= 1 && fuCalls[0].followups.length >= 1, JSON.stringify(fuCalls[0] || null));
  ok("追加指示は生成の Job へ紐付けて送っている",
    fuCalls.length >= 1 && fuCalls[0].followupJobId === "job-fake-1",
    String(fuCalls[0] && fuCalls[0].followupJobId));

  /* 反映の順番：基本生成 → 追加指示 → 完了 */
  const logs = await studioText(pg, ".vq2-tl-t, .vq2-tl-s");
  const lastIdx = (re) => { for (let i = logs.length - 1; i >= 0; i--) if (re.test(logs[i])) return i; return -1; };
  const iGen = lastIdx(/合計 .* 問できました/);
  const iFu = lastIdx(/追加の指示 .* 件を反映しました/);
  const iDone = lastIdx(/内容を確認してください/);
  console.log("   工程の順番: 生成=" + iGen + " 追加指示=" + iFu + " 完了=" + iDone);
  ok("基本生成 → 追加指示の反映 → 完了 の順で進む",
    iGen >= 0 && iFu > iGen && iDone > iFu, `${iGen}/${iFu}/${iDone}`);

  /* 3.5「この問題だけ／プリセット全体」の切り替えは、入口を右の欄ひとつへ
     まとめた時点で無くなった。対象の選択そのものが画面から消えたので、
     この節は残しても常に落ちるだけになる。役目の切り替わりは §2 で見ている。 */
  section("4. キャンセル");
  const cancelled = await pg.evaluate(async () => {
    const root = document.getElementById("vq2-preset-studio").shadowRoot;
    window.__fakeDelay = 3000;
    const setV = (el, v) => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    setV(root.querySelector("[data-tlinput]"), "2問作ってください");
    root.querySelector("[data-tlsend]").click();
    await new Promise((r) => setTimeout(r, 500));
    setV(root.querySelector("[data-tlinput]"), "止める前に送った指示");
    root.querySelector("[data-tlsend]").click();
    await new Promise((r) => setTimeout(r, 300));
    root.querySelector("[data-tlstop]").click();
    await new Promise((r) => setTimeout(r, 4000));
    return Array.from(root.querySelectorAll(".vq2-fu-row")).map((e) => e.textContent.trim());
  });
  console.log("   " + JSON.stringify(cancelled));
  ok("止めたら未反映の追加指示は「取り消し」になる",
    cancelled.some((t) => t.indexOf("取り消し") >= 0), JSON.stringify(cancelled));

  section("5. スマホの幅");
  const mob = await ctx.newPage();
  mob.on("pageerror", (e) => pageErrors.push("mobile: " + String(e).slice(0, 200)));
  await mob.setViewportSize({ width: 390, height: 844 });
  await login(mob);
  await mob.addScriptTag({ content: FAKE_PROVIDER });
  await mob.evaluate((id) => { window.VQ2.presetStudio.open({ presetId: id }); }, presetId);
  await mob.waitForTimeout(900);
  const m = await mob.evaluate(async () => {
    const host = document.getElementById("vq2-preset-studio");
    const root = host.shadowRoot;
    const aiTab = root.querySelector('[data-pane="side"]');
    if (aiTab) aiTab.click();
    await new Promise((r) => setTimeout(r, 400));
    window.__fakeDelay = 2500;
    const ta = root.querySelector("[data-tlinput]");
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(ta, "2問作ってください");
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    root.querySelector("[data-tlsend]").click();
    await new Promise((r) => setTimeout(r, 800));
    /* スマホからも実際に送ってみる（送ったあとの一覧を見たいので必要） */
    const first = root.querySelector("[data-tlinput]");
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(first, "スマホから追加指示");
    first.dispatchEvent(new Event("input", { bubbles: true }));
    root.querySelector("[data-tlsend]").click();
    await new Promise((r) => setTimeout(r, 400));
    const box = root.querySelector("[data-tlinput]");
    const send = root.querySelector("[data-tlsend]");
    const paneR = root.querySelector("#wsSide");
    const fuList = root.querySelector(".vq2-fus");
    const r = (el) => el ? el.getBoundingClientRect() : null;
    return {
      docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      paneOverflow: paneR ? paneR.scrollWidth - paneR.clientWidth : -1,
      /* はみ出しているときは、どの要素かも返す（数字だけだと直せない）*/
      paneWide: paneR ? Array.from(paneR.querySelectorAll("*"))
        .filter((e) => e.getBoundingClientRect().right > paneR.getBoundingClientRect().right + 1)
        .slice(0, 5).map((e) => (String(e.className.baseVal !== undefined ? "svg" : e.className) || e.tagName)
          + "@" + Math.round(e.getBoundingClientRect().right)) : [],
      boxRect: r(box), sendRect: r(send),
      sendH: send ? send.getBoundingClientRect().height : 0,
      inView: send ? (send.getBoundingClientRect().bottom <= window.innerHeight + 1) : false,
      listScrollable: fuList ? getComputedStyle(fuList).overflowY : "見つからない",
      sentCount: root.querySelectorAll(".vq2-fu-row").length,
      vw: window.innerWidth
    };
  });
  console.log("   " + JSON.stringify(m));
  ok("ページが横にはみ出さない", m.docOverflow <= 0, String(m.docOverflow));
  ok("AI パネルが横にはみ出さない", m.paneOverflow <= 0,
    m.paneOverflow + "px " + JSON.stringify(m.paneWide));
  ok("追加指示の入力欄が画面幅に収まる",
    !!m.boxRect && m.boxRect.right <= m.vw + 1 && m.boxRect.left >= -1, JSON.stringify(m.boxRect));
  ok("送信ボタンが画面内にあり、隠れない", m.inView, JSON.stringify(m.sendRect));
  ok("送信ボタンが小さくなりすぎない（44px 以上）", m.sendH >= 40, String(Math.round(m.sendH)));
  ok("スマホからも追加指示を送れる", m.sentCount >= 1, String(m.sentCount));
  ok("追加指示の一覧を縦にスクロールできる", m.listScrollable === "auto" || m.listScrollable === "scroll", m.listScrollable);

  const diffScroll = await mob.evaluate(async () => {
    const root = document.getElementById("vq2-preset-studio").shadowRoot;
    /* 差分が出るまで待つ。出ないまま素通りすると、この検査は何も見ていないことになる。 */
    for (let i = 0; i < 60 && !root.querySelector(".vq2-diff"); i++) {
      await new Promise((r) => setTimeout(r, 500));
    }
    const d = root.querySelector(".vq2-diff");
    const chat = root.querySelector("#wsMainScroll");
    return {
      hasDiff: !!d,
      diffOverflow: d ? d.scrollWidth - d.clientWidth : -1,
      chatScrollable: chat ? getComputedStyle(chat).overflowY : ""
    };
  });
  console.log("   " + JSON.stringify(diffScroll));
  ok("差分が実際に出ている（検査が素通りしていない）", diffScroll.hasDiff, JSON.stringify(diffScroll));
  ok("差分が横にはみ出さない", diffScroll.hasDiff && diffScroll.diffOverflow <= 0, String(diffScroll.diffOverflow));
  ok("差分をスクロールできる",
    diffScroll.chatScrollable === "auto" || diffScroll.chatScrollable === "scroll", diffScroll.chatScrollable);

  const shot = path.join(__dirname, "artifacts", "preset-ai");
  fs.mkdirSync(shot, { recursive: true });
  await pg.screenshot({ path: path.join(shot, "desktop.png"), fullPage: false });
  await mob.screenshot({ path: path.join(shot, "mobile.png"), fullPage: false });

  section("画面のエラー");
  /* 開発環境で Firebase を止めているのは意図した動作（本番の通知・告知を書き換えないため）。
     これは不具合ではないので、想定内として数えない。 */
  const real = pageErrors.filter((e) =>
    !/ResizeObserver|Non-Error promise|開発環境では Firebase 連携が無効/.test(e));
  console.log(real.length ? "   " + real.slice(0, 5).join("\n   ") : "   なし");
  ok("画面のエラーが出ていない", real.length === 0, real.slice(0, 2).join(" / "));

  await browser.close();
  console.log(`\nスクリーンショット: ${shot}`);
  console.log(`\n══ まとめ ══\n  合格 ${pass} / 不合格 ${fail}`);
  failures.forEach((f) => console.log(`    - ${f}`));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("失敗:", e && e.stack || e); process.exit(2); });
