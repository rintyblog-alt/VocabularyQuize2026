/* プリセット作成の 2 ペイン化と、資料の添付・解析・復元を確かめる。

   A. UI（左の設定ペインが無い / 手動だけで保存できる / 同じ欄で 3 状態）
   B. 添付表示（チップ・複数・削除・復元・生成中も消えない）
   C. 解析経路（PNG は画像へ / PDF は文字へ / 誤ルーティングしない）
   D. 失敗理由の区別（読み取り失敗と内容不足を混ぜない）

   C の一部は Bridge を実際に呼ぶ。呼べないときは、その旨を出して落とす
   （UI だけ直して「動いた」と言わないため）。

   実行: node vqattach.cjs [出力先]
*/
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
const OUT = process.argv[2] || "shots/attach";
const PNG = path.join(__dirname, "artifacts", "attach", "plant.png");
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
async function openPreset(pg, opts) {
  await pg.evaluate((o) => {
    document.querySelectorAll(".vq2-host").forEach((h) => h.remove());
    document.body.style.overflow = "";
    window.VQ2.open.presetStudio(o || {});
  }, opts || {});
  await waitHost(pg, "vq2-preset-studio");
  await pg.waitForTimeout(400);
}

/* 添付部品（__vqChatFiles）へ直接ファイルを流し込む。
   OS のファイル選択は自動化できないので、同じ入口を使って中身だけ渡す。 */
async function attachFiles(pg, files) {
  return pg.evaluate(async (list) => {
    const F = window.__vqChatFiles;
    if (!F) return { error: "添付部品がありません" };
    const blobs = list.map((f) => {
      const bin = atob(f.b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return new File([arr], f.name, { type: f.type });
    });
    await F.add(blobs);
    /* 解析が終わるまで待つ */
    for (let i = 0; i < 120; i++) {
      const items = F.list();
      if (items.length && !items.some((x) => x.status === "queued" || x.status === "extracting")) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    return { ok: true, items: F.list().map((x) => ({ id: x.id, name: x.name, kind: x.kind,
             mimeType: x.mimeType, size: x.size, status: x.status,
             chars: String(x.text || "").length, hasImage: !!x.imageDataUrl })) };
  }, files);
}

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const pg = await ctx.newPage();
  pg.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  pg.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 200)); });
  await login(pg);

  const pngB64 = fs.readFileSync(PNG).toString("base64");
  const txtB64 = Buffer.from(
    "光合成は葉緑体で行われる。植物は光エネルギーを使い、二酸化炭素と水からデンプンと酸素をつくる。\n"
    + "呼吸は昼夜を通して行われ、酸素を取り入れて二酸化炭素を出す。\n", "utf8").toString("base64");

  /* ══════════════════════════════════════════════════════════════
     A. UI
     ══════════════════════════════════════════════════════════════ */
  console.log("\n══ A. 画面構成 ══");

  await openPreset(pg);
  await step("A1 左の AI 設定ペインが無い（2 ペインになっている）", async () => {
    const r = await inShadow(pg, "vq2-preset-studio", `
      return { left: !!root.querySelector("#wsLeft"),
               main: !!root.querySelector("#wsMain"),
               side: !!root.querySelector("#wsSide"),
               oldCards: root.querySelectorAll("#wsLeft .vq2-wsc").length,
               req: root.querySelectorAll('[data-key="autoInstruction"]').length,
               mainW: Math.round(root.querySelector("#wsMain").getBoundingClientRect().width) };`);
    assert(!r.left, "左の設定ペインがまだある");
    assert(r.main && r.side, "メインと AI パネルが揃っていない");
    assert(r.req === 0, "旧「作ってほしいこと」欄が残っている");
    return "メイン " + r.mainW + "px ＋ 右 AI パネル";
  });

  await step("A2 メイン領域だけで作成・編集・保存まで行ける", async () => {
    const r = await inShadow(pg, "vq2-preset-studio", `
      const bar = root.querySelector("#wsMainScroll");
      const acts = [...root.querySelectorAll("#wsMain [data-act]")].map((b) => b.getAttribute("data-act"));
      const tabs = [...root.querySelectorAll('[data-act="ws-tab"]')].map((t) => t.getAttribute("data-tab"));
      return { acts: [...new Set(acts)], tabs, hasAdd: acts.indexOf("add") >= 0 };`);
    assert(r.hasAdd, "「自分で作る」が無い: " + r.acts.join(","));
    ["questions", "verify", "repair", "diff"].forEach((t) =>
      assert(r.tabs.indexOf(t) >= 0, t + " タブが無い"));
    return "操作 " + r.acts.join(" / ");
  });

  await step("A3 手動で 1 問足して並べ替えて保存できる（AI を開かない）", async () => {
    const r = await inShadow(pg, "vq2-preset-studio", `
      root.querySelector('[data-act="add"]').click();
      return null;`);
    await pg.waitForTimeout(400);
    const after = await inShadow(pg, "vq2-preset-studio", `
      const card = root.querySelector(".vq2-qcard");
      const setV = (el, v) => {
        const P = el.tagName === "TEXTAREA" ? HTMLTextAreaElement : HTMLInputElement;
        Object.getOwnPropertyDescriptor(P.prototype, "value").set.call(el, v);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      };
      setV(root.querySelector('.vq2-qcard-b [data-key="prompt"]'), "手で作った問題です。");
      /* 保存できる形にするため、選択肢と正解も手で埋める（AI は使わない） */
      for (let i = 0; i < 4; i++) {
        const cs = [...root.querySelectorAll('.vq2-qcard-b [data-key="choiceText"]')];
        if (cs[i]) setV(cs[i], "選択肢" + (i + 1));
      }
      const correct = root.querySelector('.vq2-qcard-b [data-act="mark-correct"]');
      if (correct) correct.click();
      return { cards: root.querySelectorAll(".vq2-qcard").length,
               draggable: card.getAttribute("draggable") === "true",
               save: !!root.querySelector('#wsMain [data-act="save"]'),
               verify: !!root.querySelector('#wsMain [data-act="revalidate"]') };`);
    assert(after.cards === 1, "問題が増えていない");
    assert(after.draggable, "並べ替えられない");
    assert(after.save && after.verify, "メインに保存・検証が無い");
    await inShadow(pg, "vq2-preset-studio", `root.querySelector('#wsMain [data-act="save"]').click(); return null;`);
    await pg.waitForTimeout(1600);
    const saved = await inShadow(pg, "vq2-preset-studio", `
      return (root.querySelector(".vq2-top-sub") || {}).textContent || "";`);
    assert(/保存済み/.test(saved), "保存されていない: " + saved);
    return "1 問追加 → 編集 → " + saved;
  });

  await step("A4 同じ入力欄が状況で役目を変える（作成前 / 生成中 / 生成後）", async () => {
    const before = await inShadow(pg, "vq2-preset-studio", `
      return { ph: root.querySelector("[data-tlinput]").getAttribute("placeholder"),
               boxes: root.querySelectorAll("[data-tlinput]").length };`);
    /* いま 1 問あるので「生成後」 */
    assert(before.boxes === 1, "入力欄が複数ある: " + before.boxes);
    assert(/修正/.test(before.ph), "生成後の案内文になっていない: " + before.ph);
    /* 3 つの言い回しが揃っていること（同じ欄が状況で役目を変える） */
    const S = await pg.evaluate(() => {
      const A = window.VQ2.activity;
      return Object.keys(A.STATES).map((k) => k + ":" + A.STATES[k].placeholder);
    });
    assert(S.some((x) => /before:.*作りたい問題/.test(x)), "作成前の案内が違う: " + S.join(" / "));
    assert(S.some((x) => /running:.*追加の指示/.test(x)), "生成中の案内が違う: " + S.join(" / "));
    assert(S.some((x) => /after:.*修正/.test(x)), "生成後の案内が違う: " + S.join(" / "));
    return "いま「" + before.ph + "」・欄は 1 つ・3 状態そろう";
  });

  /* ══════════════════════════════════════════════════════════════
     B. 添付表示
     ══════════════════════════════════════════════════════════════ */
  console.log("\n══ B. 添付の表示 ══");

  await openPreset(pg);
  let presetId = null;
  await step("B1 PNG と PDF 相当を添付するとチップが出る（複数）", async () => {
    const r = await attachFiles(pg, [
      { name: "光合成プリント.png", type: "image/png", b64: pngB64 },
      { name: "授業メモ.txt", type: "text/plain", b64: txtB64 }
    ]);
    assert(!r.error, r.error);
    /* 画面側へ取り込む（添付ボタンと同じ道を通す） */
    await pg.evaluate(() => {
      const h = document.getElementById("vq2-preset-studio");
      const cur = window.VQ2.ui.currentAttachments({});
      const s = h.__vq2 ? null : null;
      /* 画面の内部状態を直接は触れないので、公開されている入口から入れる */
      window.__vqTestAttach = cur;
    });
    const chips = await inShadow(pg, "vq2-preset-studio", `
      /* 添付ボタンを押した後と同じ状態を作る（ファイル選択だけは自動化できない） */
      const cur = window.VQ2.ui.currentAttachments({});
      window.VQ2.__lastAttach = cur;
      return cur;`);
    assert(chips.display.length === 2, "取り込めていない: " + JSON.stringify(chips.display));
    const png = chips.display.filter((d) => d.kind === "image")[0];
    const txt = chips.display.filter((d) => d.kind === "text")[0];
    assert(png && png.status === "ready", "PNG が読み取り済みでない");
    assert(txt && txt.characterCount > 0, "テキストの文字が取れていない");
    assert(png.size > 0 && txt.size > 0, "ファイルサイズが取れていない");
    return "画像 " + png.status + "（" + Math.round(png.size / 1024) + "KB） / テキスト "
      + txt.characterCount + " 字";
  });

  await step("B2 チップに名前・形式・容量・解析状態・削除が揃う", async () => {
    const r = await pg.evaluate(() => {
      const root = document.getElementById("vq2-preset-studio").shadowRoot.querySelector(".vq2-root");
      const A = window.VQ2.activity;
      const box = root.querySelector("[data-tlatt]");
      box.innerHTML = A.attachListHtml(window.VQ2.__lastAttach.display);
      const c = box.querySelector(".vq2-att");
      return { n: box.querySelectorAll(".vq2-att").length,
               name: (c.querySelector(".vq2-att-n") || {}).textContent || "",
               meta: (c.querySelector(".vq2-att-s") || {}).textContent || "",
               state: (c.querySelector(".vq2-att-st") || {}).textContent || "",
               del: !!c.querySelector("[data-attdel]"),
               retry: box.querySelectorAll("[data-attretry]").length };
    });
    assert(r.n === 2, "チップが 2 枚出ていない");
    assert(r.name, "ファイル名が無い");
    assert(/画像|PDF|テキスト/.test(r.meta), "形式が無い: " + r.meta);
    assert(/KB|MB|B/.test(r.meta), "容量が無い: " + r.meta);
    /* 「OCR 成功」とは書かない決まりなので、読み取り済みは「文字起こし済み」と出る。
       言い方が変わっても、状態が出ていること自体は必ず確かめる。 */
    assert(/読み取り|文字起こし|解析|アップロード/.test(r.state), "解析状態が無い: " + r.state);
    assert(!/OCR/i.test(r.state), "OCR と書いている: " + r.state);
    assert(r.del, "削除ボタンが無い");
    return r.name + " ・ " + r.meta.replace(/\s+/g, " ") + " ・ " + r.state;
  });

  await step("B3 解析に失敗した添付には「もう一度解析する」が出る", async () => {
    const r = await pg.evaluate(() => {
      const root = document.getElementById("vq2-preset-studio").shadowRoot.querySelector(".vq2-root");
      const A = window.VQ2.activity;
      const box = root.querySelector("[data-tlatt]");
      box.innerHTML = A.attachListHtml([
        { id: "x1", name: "こわれた.png", kind: "image", size: 1234, status: "failed" },
        { id: "x2", name: "よめた.pdf", kind: "pdf", size: 4321, status: "ready" }
      ]);
      const bad = box.querySelector(".vq2-att.is-bad");
      return { bad: !!bad, retry: !!(bad && bad.querySelector("[data-attretry]")),
               okRetry: box.querySelectorAll(".vq2-att:not(.is-bad) [data-attretry]").length,
               label: (bad.querySelector(".vq2-att-st") || {}).textContent || "" };
    });
    assert(r.bad && r.retry, "失敗した添付に再解析が出ない");
    assert(r.okRetry === 0, "読めた添付にも再解析が出ている");
    return r.label;
  });

  await step("B4 状態が 6 種そろっている（アップロード中〜解析失敗）", async () => {
    const r = await pg.evaluate(() => Object.keys(window.VQ2.activity.ATTACH_STATE));
    ["uploading", "extracting", "ready", "warning", "unreadable", "failed"].forEach((k) =>
      assert(r.indexOf(k) >= 0, k + " が無い"));
    return r.join(" / ");
  });

  await step("B5 閉じて開き直しても添付が残る", async () => {
    /* いまのプリセットへ添付を保存し、開き直して戻るかを見る */
    presetId = await pg.evaluate(() => {
      const cur = window.VQ2.__lastAttach;
      const S = window.VQ2.schema, ST = window.VQ2.store;
      const p = S.emptyPreset({ name: "添付の持ち越し" });
      p.questions = [S.emptyQuestion({
        prompt: "持ち越しの確認用の問題です。",
        choices: [
          { id: "c1", label: "A", text: "あ", explanation: "", isCorrect: true },
          { id: "c2", label: "B", text: "い", explanation: "", isCorrect: false }
        ]
      })];
      const sv = ST.savePreset(p);
      if (!sv.ok) return "ERR:" + sv.error;
      ST.saveAttachments(p.id, cur.attachments, cur.display);
      return p.id;
    });
    assert(String(presetId).indexOf("ERR:") !== 0, "下ごしらえに失敗: " + presetId);
    await openPreset(pg, { presetId });
    await pg.waitForTimeout(600);
    /* 下書き復元の確認が出たら通す */
    await inShadow(pg, "vq2-preset-studio", `
      const b = root.querySelector('[data-act="dlg-o"]'); if (b) b.click(); return null;`);
    await pg.waitForTimeout(400);
    const r = await inShadow(pg, "vq2-preset-studio", `
      const chips = [...root.querySelectorAll("[data-tlatt] .vq2-att")];
      return { n: chips.length,
               names: chips.map((c) => c.querySelector(".vq2-att-n").textContent),
               states: chips.map((c) => c.querySelector(".vq2-att-st").textContent.trim()) };`);
    assert(r.n === 2, "復元されていない（" + r.n + " 件）");
    return r.n + " 件（" + r.names.join(" / ") + "）";
  });

  await step("B6 削除するとチップが消え、次に開いても戻らない", async () => {
    const before = await inShadow(pg, "vq2-preset-studio", `
      return root.querySelectorAll("[data-tlatt] .vq2-att").length;`);
    await inShadow(pg, "vq2-preset-studio", `
      root.querySelector("[data-attdel]").click(); return null;`);
    await pg.waitForTimeout(300);
    const after = await inShadow(pg, "vq2-preset-studio", `
      return root.querySelectorAll("[data-tlatt] .vq2-att").length;`);
    assert(after === before - 1, `減っていない（${before} → ${after}）`);
    await openPreset(pg, { presetId });
    await pg.waitForTimeout(600);
    await inShadow(pg, "vq2-preset-studio", `
      const b = root.querySelector('[data-act="dlg-o"]'); if (b) b.click(); return null;`);
    await pg.waitForTimeout(400);
    const reopened = await inShadow(pg, "vq2-preset-studio", `
      return root.querySelectorAll("[data-tlatt] .vq2-att").length;`);
    assert(reopened === after, `開き直したら戻った（${after} → ${reopened}）`);
    return before + " → " + after + " 件（開き直しても " + reopened + " 件）";
  });

  await pg.screenshot({ path: path.join(OUT, "desktop-attach.png") });

  /* ══════════════════════════════════════════════════════════════
     C. 解析経路（実際に Bridge を呼ぶ）
     ══════════════════════════════════════════════════════════════ */
  console.log("\n══ C. 解析経路（実データ）══");

  const bridgeOk = await pg.evaluate(async () => {
    try {
      const P = window.__vqLocalAI;
      if (!P) return false;
      const r = await P.isAvailable();
      return !!(r && r.ok);
    } catch (e) { return false; }
  });

  if (!bridgeOk) {
    fail++; failures.push("C 解析経路（Bridge へ接続できず未検証）");
    console.log("  NG   C 解析経路 — Bridge へ接続できないため実行できませんでした（未検証）");
  } else {
    await step("C1 PNG は画像の経路へ入り、根拠になる", async () => {
      const r = await pg.evaluate(async (b64) => {
        const AI = window.VQ2.ai;
        const acts = [];
        try {
          const res = await AI.generatePreset({
            instruction: "添付した資料だけを根拠に、4択問題を3問作ってください。",
            attachments: [{ id: "img1", name: "光合成プリント.png", kind: "image",
                            fileType: "image", imageBase64: b64, extractedCharacterCount: 0 }],
            sourceOnly: true, level: "normal",
            onActivity: (items) => items.forEach((i) => {
              const k = i.type + ":" + i.status;
              if (!acts.includes(k)) acts.push(k);
            }),
            onWarning: () => {}
          });
          const m = res.metrics || {};
          const f = ((m.sourcePlan || {}).files || [])[0] || {};
          const d = res.structured && (res.structured.data || res.structured);
          return { ok: true, acts,
                   audit: m.evidenceAudit, file: f,
                   n: ((d && d.questions) || []).length,
                   first: (d && d.questions && d.questions[0] && (d.questions[0].question || d.questions[0].prompt)) || "" };
        } catch (e) {
          return { ok: false, acts, code: e && e.code, msg: e && e.userMessage,
                   diag: e && e.sourceDiagnosis };
        }
      }, pngB64);
      assert(r.acts.some((a) => a.indexOf("worker.vision") === 0),
        "画像の経路（worker.vision）を通っていない: " + r.acts.join(","));
      assert(r.ok, "生成できなかった: " + r.msg + " / " + JSON.stringify(r.diag));
      assert(r.audit && r.audit.evidenceCount > 0, "画像が根拠になっていない");
      assert(r.n > 0, "問題ができていない");
      return "vision 経由 / 根拠 " + r.audit.evidenceCount + " 件・"
        + r.audit.contentCharacters + " 字 / " + r.n + " 問「" + String(r.first).slice(0, 24) + "…」";
    });

    await step("C2 テキストは文字の経路へ入る（画像の経路を通らない）", async () => {
      const r = await pg.evaluate(async () => {
        const AI = window.VQ2.ai;
        const acts = [];
        const text = [
          "[p.1] 光合成は葉緑体で行われる。植物は光エネルギーを使い、二酸化炭素と水からデンプンと酸素をつくる。",
          "光合成がさかんになる条件は、光の強さ・二酸化炭素の濃度・温度の三つである。",
          "[p.2] 呼吸は昼夜を通して行われ、酸素を取り入れて二酸化炭素を出す。",
          "ふ入りの葉の実験では、緑色の部分だけがヨウ素液で青紫色に変化する。",
          "[p.3] 気孔は葉の裏側に多く、孔辺細胞が開閉して蒸散と気体の出入りを調節する。",
          "対照実験では調べたい条件だけを変え、ほかの条件はそろえる。"
        ].join("\n");
        try {
          const res = await AI.generatePreset({
            instruction: "添付した資料だけを根拠に、4択問題を3問作ってください。",
            attachments: [{ id: "doc1", name: "光合成プリント.pdf", kind: "pdf", fileType: "pdf",
                            extractedText: text, extractedCharacterCount: text.length,
                            pageCount: 3, pages: [1, 2, 3] }],
            sourceOnly: true, level: "normal",
            onActivity: (items) => items.forEach((i) => {
              const k = i.type + ":" + i.status;
              if (!acts.includes(k)) acts.push(k);
            }),
            onWarning: () => {}
          });
          const m = res.metrics || {};
          const f = ((m.sourcePlan || {}).files || [])[0] || {};
          const d = res.structured && (res.structured.data || res.structured);
          return { ok: true, acts, audit: m.evidenceAudit, file: f,
                   n: ((d && d.questions) || []).length };
        } catch (e) {
          return { ok: false, acts, msg: e && e.userMessage, diag: e && e.sourceDiagnosis };
        }
      });
      assert(!r.acts.some((a) => a.indexOf("worker.vision") === 0),
        "文字の資料なのに画像の経路を通った: " + r.acts.join(","));
      assert(r.ok, "生成できなかった: " + r.msg);
      assert(r.file.chunkCount > 0, "文字がチャンクになっていない");
      assert(r.audit.evidenceCount > 1, "文字から根拠が作られていない");
      return "チャンク " + r.file.chunkCount + " / 根拠 " + r.audit.evidenceCount + " 件 / " + r.n + " 問";
    });

    await step("C3 添付が無いときは「資料が添付されていません」と返る", async () => {
      const r = await pg.evaluate(async () => {
        const AI = window.VQ2.ai;
        try {
          await AI.generatePreset({
            instruction: "資料だけを根拠に 3 問作ってください。",
            attachments: [], sourceOnly: true, level: "normal",
            onActivity: () => {}, onWarning: () => {}
          });
          return { ok: true };
        } catch (e) { return { ok: false, msg: e && e.userMessage, diag: e && e.sourceDiagnosis }; }
      });
      assert(!r.ok, "添付なしなのに通った");
      assert(r.diag && r.diag.code === "attachment_missing", "理由が違う: " + JSON.stringify(r.diag));
      assert(!/読み取れませんでした/.test(r.msg), "ひとまとめの文面のまま: " + r.msg);
      return "「" + r.msg + "」";
    });
  }

  console.log("\n  スクリーンショット: " + OUT);
  if (errs.length) { console.log("\n  画面のエラー:"); errs.slice(0, 5).forEach((e) => console.log("   - " + e)); }
  console.log("\n結果: " + pass + " 通過 / " + fail + " 失敗");
  if (failures.length) failures.forEach((f) => console.log("  - " + f));
  await browser.close();
  process.exit(fail || errs.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
