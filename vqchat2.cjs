/* Quick Chat の改善点の検証（実ブラウザ）
   ① 添付が履歴に残る ② 待ち時間の文言 ③ 波打つ文字 ④ アクティビティ
   ⑤ 最新へ戻るボタン ⑥ 点滅とスクロール ⑦ 選択パネルの位置
   実行: node vqchat2.cjs */
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const TMP = require("path").join(__dirname, "_fixtures", "vqchat2");
const HIDE = `#vqbFlow,#mob-tut-overlay,#mobBarTutorial,#firstLaunchOverlay,#vqOnboardingOverlay{display:none !important;}`;
let pass = 0, fail = 0;
const errs = [];

async function step(name, fn) {
  try { const d = await fn(); pass++; console.log("  ✓ " + name + (d ? " — " + d : "")); }
  catch (e) { fail++; console.log("  ✗ " + name + " — " + (e.message || e).split("\n")[0]); }
}
function assert(c, m) { if (!c) throw new Error(m || "assertion failed"); }

async function login(pg) {
  await pg.goto("http://127.0.0.1:8791/?vqdev=1", { waitUntil: "domcontentloaded", timeout: 30000 });
  await pg.addStyleTag({ content: HIDE });
  await pg.waitForFunction(() => document.getElementById("authLoginSubmitBtn"), { timeout: 20000 });
  await pg.evaluate(() => {
    const setV = (el, v) => { const p = el.tagName === "SELECT" ? HTMLSelectElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(p.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); };
    setV(document.getElementById("authLoginGrade"), "H3");
    setV(document.getElementById("authLoginNickname"), "tester");
    setV(document.getElementById("authLoginPassword"), "Abcd1234");
    document.getElementById("authLoginSubmitBtn").click();
  });
  await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 30000 });
  await pg.addStyleTag({ content: HIDE });
  await pg.waitForTimeout(2200);
  for (let i = 0; i < 3; i++) {
    const c = await pg.evaluate(() => { const bd = document.querySelector(".ui-modal-backdrop");
      if (!bd || getComputedStyle(bd).display === "none") return false;
      const b2 = document.getElementById("uiModalOk") || document.getElementById("uiModalCancel");
      if (b2) { b2.click(); return true; } return false; });
    if (!c) break; await pg.waitForTimeout(400);
  }
  await pg.evaluate(() => { const n = document.getElementById("vqNewAuth"); if (n) n.style.display = "none"; });
  await pg.evaluate(() => { const e = document.querySelector('#appTabBar [data-app-tab="chat"]'); if (e) e.click(); });
  await pg.waitForTimeout(1800);
}
const SR = "document.getElementById('vqChat').shadowRoot";

(async () => {
  fs.mkdirSync(TMP, { recursive: true });
  fs.writeFileSync(path.join(TMP, "note.txt"), "ヴェルナ王国のメモ\n812年 建国\n840年 遷都\n", "utf8");

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();
  pg.on("pageerror", e => errs.push(String(e).slice(0, 160)));
  pg.on("console", m => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
  await login(pg);

  console.log("\n══ ① 添付が履歴に残る ══");
  await step("ファイルを添付できる", async () => {
    const [ch] = await Promise.all([
      pg.waitForEvent("filechooser"),
      pg.evaluate(() => document.getElementById("vqChat").shadowRoot.querySelector('[data-a="attach"]').click())
    ]);
    await ch.setFiles([path.join(TMP, "note.txt")]);
    await pg.waitForFunction(() => {
      const r = document.getElementById("vqChat").shadowRoot;
      return r.querySelectorAll(".file").length > 0 && !r.querySelector(".vq2-spin");
    }, null, { timeout: 60000 });
    const n = await pg.evaluate(() => document.getElementById("vqChat").shadowRoot.querySelectorAll(".file").length);
    return n + " 件が入力欄に出た";
  });

  await step("送信すると入力欄からは消え、履歴に残る", async () => {
    await pg.evaluate(() => {
      const r = document.getElementById("vqChat").shadowRoot;
      const ta = r.querySelector(".ta");
      ta.value = "このメモを要約して";
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await pg.evaluate(() => document.getElementById("vqChat").shadowRoot.querySelector(".send").click());
    await pg.waitForTimeout(2500);
    const o = await pg.evaluate(() => {
      const r = document.getElementById("vqChat").shadowRoot;
      const saved = JSON.parse(localStorage.getItem("vq.chat.msgfiles.v2") || "{}");
      const keys = Object.keys(saved);
      /* 添付は「このメモを要約して」と送った発言に付いていないといけない */
      const users = Array.from(r.querySelectorAll(".msg.user"));
      const withFiles = users.filter(u => u.querySelector(".mfile"));
      const onRightMsg = withFiles.length === 1 &&
        /このメモを要約して/.test(withFiles[0].textContent || "");
      return {
        composerFiles: r.querySelectorAll(".composer .file").length,
        histFiles: r.querySelectorAll(".msg.user .mfile").length,
        names: Array.from(r.querySelectorAll(".msg.user .mfile__n")).map(e => e.textContent),
        onRightMsg,
        stored: keys.map(k => k + ":" + Object.keys(saved[k]).length).join(",")
      };
    });
    assert(o.composerFiles === 0, "入力欄に添付が残っている: " + o.composerFiles);
    assert(o.histFiles >= 1, "履歴に添付が出ていない");
    assert(o.names.some(n => n.indexOf("note") >= 0), "ファイル名が出ていない: " + o.names.join("/"));
    assert(o.onRightMsg, "添付が、送った発言ではない別の発言に付いている");
    return "入力欄 0 / 履歴 " + o.histFiles + " 件（" + o.names.join("・") + "）保存=" + o.stored;
  });

  await step("再読み込みしても履歴の添付が残る", async () => {
    await pg.reload({ waitUntil: "domcontentloaded" });
    await pg.addStyleTag({ content: HIDE });
    await pg.waitForTimeout(3000);
    await pg.evaluate(() => { const e = document.querySelector('#appTabBar [data-app-tab="chat"]'); if (e) e.click(); });
    await pg.waitForTimeout(2200);
    const n = await pg.evaluate(() => {
      const r = document.getElementById("vqChat");
      return r && r.shadowRoot ? r.shadowRoot.querySelectorAll(".msg.user .mfile").length : -1;
    });
    assert(n >= 1, "再読み込み後に消えた: " + n);
    return n + " 件残った";
  });

  console.log("\n══ 添付できる大きさ ══");
  await step("種類ごとの上限（PDF 512MB / 画像 20MB / CSV 50MB）", async () => {
    const o = await pg.evaluate(() => {
      const L = window.__vqChatFiles.LIMITS;
      const mb = (n) => Math.round(n / 1024 / 1024);
      return { doc: mb(L.maxBytesByKind.document), img: mb(L.maxBytesByKind.image),
               sheet: mb(L.maxBytesByKind.sheet), files: L.maxFiles,
               total: mb(L.maxTotalBytes), pages: L.maxPdfPages, tok: L.maxTokensPerFile };
    });
    assert(o.doc === 512, "ドキュメントが 512MB でない: " + o.doc);
    assert(o.img === 20, "画像が 20MB でない: " + o.img);
    assert(o.sheet === 50, "CSV が 50MB でない: " + o.sheet);
    return `PDF/文書 ${o.doc}MB / 画像 ${o.img}MB / 表 ${o.sheet}MB / 合計 ${o.total}MB / ${o.files}件 / PDF ${o.pages}ページ / ${o.tok / 10000}万トークン`;
  });

  await step("上限は Quick Chat・プリセット・Quick Mock で共通", async () => {
    const o = await pg.evaluate(() => {
      /* V2（プリセット / Quick Mock）は独自の添付実装を持たず __vqChatFiles を使う */
      const same = !!(window.VQ2 && window.VQ2.files ? window.VQ2.files === window.__vqChatFiles : true);
      return { shared: same, has: !!window.__vqChatFiles };
    });
    assert(o.has, "共通の添付モジュールが無い");
    return "同じ __vqChatFiles を参照";
  });

  console.log("\n══ ②③ 待ち時間の文言と波打つ文字 ══");
  await step("状態の文言が出せる（考えています／ファイル読み込み）", async () => {
    const o = await pg.evaluate(() => {
      const w = window.__vqChatFiles;
      const api = document.getElementById("vqChat");
      /* 実イベントを立てて、その時の文言を見る */
      w.beginRun();
      const a = w.emit("response.generate", { status: "running", label: "回答を生成しています" });
      const gen = window.__vqChat.thinkingLine();
      w.update(a, { status: "completed" });
      const b2 = w.emit("pdf.extract", { status: "running", label: "PDFから文字情報を抽出しています", current: 1, total: 3 });
      const read = window.__vqChat.thinkingLine();
      w.update(b2, { status: "completed" });
      w.endRun();
      return { gen, read };
    });
    assert(o.gen === "考えています", "生成中の文言が違う: " + o.gen);
    assert(/件のファイルを読み込んでいます/.test(o.read || ""), "読み込み中の文言が違う: " + o.read);
    return o.gen + " / " + o.read;
  });

  await step("波打つアニメーションが当たっている", async () => {
    const o = await pg.evaluate(() => {
      const r = document.getElementById("vqChat").shadowRoot;
      const d = document.createElement("div");
      d.className = "think__l"; d.innerHTML = '<span class="wave">考えています</span>';
      r.querySelector(".thread").appendChild(d);
      const cs = getComputedStyle(d.querySelector(".wave"));
      const out = { anim: cs.animationName, dur: cs.animationDuration, clip: cs.webkitBackgroundClip || cs.backgroundClip };
      d.remove();
      return out;
    });
    assert(o.anim === "vq-wave", "アニメ名が違う: " + o.anim);
    assert(o.clip === "text", "文字でクリップしていない: " + o.clip);
    return o.anim + " " + o.dur + " / clip=" + o.clip;
  });

  console.log("\n══ ④ アクティビティ ══");
  await step("段階的に出て、線で繋がり、完了で時間が止まる", async () => {
    const o = await pg.evaluate(async () => {
      const r = document.getElementById("vqChat").shadowRoot;
      const w = window.__vqChatFiles;
      r.querySelector('[data-a="toggleAct"]').click();
      w.beginRun();
      const e1 = w.emit("file.read", { status: "running", label: "資料を読み込んでいます" });
      await new Promise(s => setTimeout(s, 500));
      w.update(e1, { status: "completed", label: "資料を読み込みました" });
      const e2 = w.emit("response.generate", { status: "running", label: "回答を生成しています" });
      await new Promise(s => setTimeout(s, 600));
      w.update(e2, { status: "completed", label: "回答を生成しました" });
      w.endRun();
      await new Promise(s => setTimeout(s, 300));
      const rows = r.querySelectorAll(".arow");
      const line = rows.length ? getComputedStyle(rows[0], "::before").width : "0px";
      const t1 = r.querySelector(".act__e").textContent;
      await new Promise(s => setTimeout(s, 1500));
      const t2 = r.querySelector(".act__e").textContent;
      /* 完了の締めくくりが作り直されていないか（ぴょんぴょん跳ねる原因）を見る */
      const d0 = r.querySelector(".adone");
      if (d0) d0.setAttribute("data-probe", "1");
      const y0 = d0 ? Math.round(d0.getBoundingClientRect().top) : -1;
      await new Promise(s => setTimeout(s, 2600));       /* 900ms 周期を数回またぐ */
      const d1 = r.querySelector(".adone");
      const kept = !!(d1 && d1.getAttribute("data-probe") === "1");
      const y1 = d1 ? Math.round(d1.getBoundingClientRect().top) : -1;
      const dsvg = r.querySelector(".adone svg");
      const dr = dsvg ? dsvg.getBoundingClientRect() : null;
      return {
        rows: rows.length,
        staggered: Array.from(rows).map(x => x.style.animationDelay).filter(Boolean).length,
        line, done: !!r.querySelector(".adone"),
        doneText: (r.querySelector(".adone") || {}).textContent || "",
        doneIcon: dr ? { w: Math.round(dr.width), h: Math.round(dr.height) } : null,
        dupDone: Array.from(rows).filter(x => /処理が完了しました/.test(x.textContent)).length,
        doneKept: kept, doneMoved: Math.abs(y1 - y0),
        t1, t2
      };
    });
    assert(o.rows >= 2, "行が出ていない: " + o.rows);
    assert(o.doneIcon && o.doneIcon.w <= 20 && o.doneIcon.h <= 20,
      "完了アイコンが大きすぎる: " + JSON.stringify(o.doneIcon));
    assert(o.dupDone === 0, "「処理が完了しました」が行として重複している: " + o.dupDone);
    assert(o.doneKept, "完了の締めくくりが毎回作り直されている（ぴょんぴょん跳ねる原因）");
    assert(o.doneMoved <= 2, "完了の締めくくりが動いている: " + o.doneMoved + "px");
    assert(o.line !== "0px" && o.line !== "auto", "つなぎ線が無い: " + o.line);
    assert(o.done, "完了の締めくくりが出ていない");
    assert(o.t1 === o.t2, "完了後もタイマーが動いている: " + o.t1 + " → " + o.t2);
    return o.rows + "行 / 遅延つき" + o.staggered + " / 線" + o.line + " / " + o.doneText.replace(/\s+/g, " ").trim() + " / 停止 " + o.t1;
  });

  await step("まとめて届いても順に出る（一気に出さない）", async () => {
    const o = await pg.evaluate(async () => {
      const r = document.getElementById("vqChat").shadowRoot;
      const w = window.__vqChatFiles;
      w.beginRun();
      /* 同じ瞬間に 4 件まとめて立てる（実際に起きていた「一気に出る」状況） */
      const evs = [];
      for (let i = 0; i < 4; i++) evs.push(w.emit("burst.step" + i, { status: "completed", label: "処理 " + (i + 1) }));
      await new Promise(s => setTimeout(s, 250));
      const rows = Array.from(r.querySelectorAll(".arow"));
      const fresh = rows.filter(x => x.classList.contains("in"));
      const delays = fresh.map(x => x.style.animationDelay);
      w.endRun();
      return { fresh: fresh.length, delays: delays.join(","), anim: fresh.length ? getComputedStyle(fresh[0]).animationName : "" };
    });
    assert(o.fresh >= 4, "まとめて届いた行が出ていない: " + o.fresh);
    const uniq = new Set(o.delays.split(","));
    assert(uniq.size >= 3, "全部が同時に出ている（遅延が付いていない）: " + o.delays);
    assert(o.anim === "vq-arow-in", "浮かび上がるアニメが無い: " + o.anim);
    return o.fresh + "行が " + o.delays + " でずれて出る / " + o.anim;
  });

  console.log("\n══ ⑤⑥ スクロールと点滅 ══");
  await step("上へ行くと ↓ が出て、下端では消える", async () => {
    /* この会話はローカル保存側に実体がある（readMessages はそちらを優先して読む）。
       DOM へ足しても無視されるので、保存側へ足して描き直す。 */
    await pg.evaluate(() => {
      const cid = (document.querySelector("#appChatSessionList .app-chat-session-item.is-active") || {})
        .getAttribute ? document.querySelector("#appChatSessionList .app-chat-session-item.is-active").getAttribute("data-chat-ids") : "";
      const all = JSON.parse(localStorage.getItem("vq.chat.localconv.v1") || "{}");
      const arr = all[cid] || [];
      for (let i = 0; i < 30; i++) {
        arr.push({ id: "s" + i, role: i % 2 ? "ai" : "user",
                   text: "スクロール用のメッセージ " + i + "。".padEnd(40, "あ"), status: "done" });
      }
      all[cid] = arr;
      localStorage.setItem("vq.chat.localconv.v1", JSON.stringify(all));
    });
    await pg.reload({ waitUntil: "domcontentloaded" });
    await pg.addStyleTag({ content: HIDE });
    await pg.waitForTimeout(3000);
    await pg.evaluate(() => { const e = document.querySelector('#appTabBar [data-app-tab="chat"]'); if (e) e.click(); });
    await pg.waitForTimeout(2200);
    const o = await pg.evaluate(async () => {
      const r = document.getElementById("vqChat").shadowRoot;
      const sc = r.querySelector(".scroll"), jp = r.querySelector(".jump");
      sc.scrollTop = sc.scrollHeight; await new Promise(s => setTimeout(s, 300));
      const atEnd = jp.classList.contains("on");
      sc.scrollTop = 0; sc.dispatchEvent(new Event("scroll")); await new Promise(s => setTimeout(s, 300));
      const up = jp.classList.contains("on");
      const cs = getComputedStyle(jp);
      const rect = jp.getBoundingClientRect();
      const comp = r.querySelector(".composer").getBoundingClientRect();
      return { atEnd, up, radius: cs.borderRadius, opacity: cs.opacity,
               hasTransition: cs.transition.indexOf("opacity") >= 0,
               aboveComposer: Math.round(rect.bottom) <= Math.round(comp.top) + 2,
               w: Math.round(rect.width), h: Math.round(rect.height) };
    });
    assert(!o.atEnd, "下端なのに ↓ が出ている");
    assert(o.up, "上へ行っても ↓ が出ない");
    assert(o.hasTransition, "ふわっと出ない（transition が無い）");
    assert(o.aboveComposer, "PCで入力欄の上に無い");
    return "下端で非表示 / 上で表示 / 丸 " + o.radius + " " + o.w + "×" + o.h + " / 入力欄の上";
  });

  await step("↓ は PC でもモバイルでも入力欄の真上・中央に出る", async () => {
    const out = [];
    for (const [label, vp] of [["PC", { width: 1440, height: 900 }], ["モバイル", { width: 390, height: 844 }]]) {
      await pg.setViewportSize(vp);
      await pg.waitForTimeout(400);
      const o = await pg.evaluate(async () => {
        const r = document.getElementById("vqChat").shadowRoot;
        const sc = r.querySelector(".scroll"), jp = r.querySelector(".jump");
        sc.scrollTop = 0; sc.dispatchEvent(new Event("scroll"));
        await new Promise(s => setTimeout(s, 250));
        const j = jp.getBoundingClientRect(), c = r.querySelector(".composer").getBoundingClientRect();
        return { on: jp.classList.contains("on"),
                 above: Math.round(c.top - j.bottom),
                 dxCenter: Math.round((j.left + j.width / 2) - (c.left + c.width / 2)),
                 w: Math.round(j.width) };
      });
      assert(o.on, label + "：↓ が出ていない");
      assert(o.above >= 0, label + "：入力欄の上に無い（" + o.above + "px）");
      assert(Math.abs(o.dxCenter) <= 2, label + "：中央からずれている（" + o.dxCenter + "px）");
      out.push(label + " 上に" + o.above + "px・中央ズレ" + o.dxCenter + "px・" + o.w + "px");
    }
    await pg.setViewportSize({ width: 1440, height: 900 });
    await pg.waitForTimeout(300);
    return out.join(" / ");
  });

  await step("チャットを開くと必ず最下部が出る（PC・モバイル）", async () => {
    const out = [];
    for (const [label, vp] of [["PC", { width: 1440, height: 900 }], ["モバイル", { width: 390, height: 844 }]]) {
      await pg.setViewportSize(vp);
      await pg.waitForTimeout(300);
      /* 上まで戻してから、別タブ→チャットへ戻る */
      await pg.evaluate(async () => {
        const r = document.getElementById("vqChat").shadowRoot;
        const sc = r.querySelector(".scroll");
        sc.scrollTop = 0; sc.dispatchEvent(new Event("scroll"));
        await new Promise(s => setTimeout(s, 200));
      });
      await pg.evaluate(() => { const e = document.querySelector('#appTabBar [data-app-tab="home"]'); if (e) e.click(); });
      await pg.waitForTimeout(700);
      await pg.evaluate(() => { const e = document.querySelector('#appTabBar [data-app-tab="chat"]'); if (e) e.click(); });
      await pg.waitForTimeout(1800);
      const o = await pg.evaluate(() => {
        const r = document.getElementById("vqChat").shadowRoot;
        const sc = r.querySelector(".scroll");
        return { gap: Math.round(sc.scrollHeight - sc.scrollTop - sc.clientHeight), h: Math.round(sc.scrollHeight) };
      });
      assert(o.gap <= 8, label + "：最下部になっていない（残り " + o.gap + "px）");
      out.push(label + " 残り" + o.gap + "px");
    }
    await pg.setViewportSize({ width: 1440, height: 900 });
    await pg.waitForTimeout(300);
    return out.join(" / ");
  });

  await step("上へスクロールしたまま再描画されても引き戻されない", async () => {
    const o = await pg.evaluate(async () => {
      const r = document.getElementById("vqChat").shadowRoot;
      const sc = r.querySelector(".scroll");
      sc.scrollTop = 200; sc.dispatchEvent(new Event("scroll"));
      await new Promise(s => setTimeout(s, 200));
      const before = sc.scrollTop;
      /* 実DOMを触って再描画を誘発する */
      const list = document.getElementById("appChatList");
      const d = document.createElement("div");
      d.className = "app-chat-msg is-ai"; d.setAttribute("data-chat-msg-id", "extra1");
      d.innerHTML = '<div class="app-chat-bubble">追加のメッセージ</div>';
      list.appendChild(d);
      await new Promise(s => setTimeout(s, 900));
      return { before, after: sc.scrollTop };
    });
    assert(Math.abs(o.after - o.before) < 40, "引き戻された: " + o.before + " → " + o.after);
    return o.before + " → " + o.after + "（保持）";
  });

  await step("再描画で既存メッセージのDOMが作り直されない（点滅の原因）", async () => {
    const o = await pg.evaluate(async () => {
      const r = document.getElementById("vqChat").shadowRoot;
      const first = r.querySelector(".msg");
      first.setAttribute("data-probe", "1");
      const list = document.getElementById("appChatList");
      for (let i = 0; i < 3; i++) {
        const d = document.createElement("div");
        d.className = "app-chat-msg is-ai"; d.setAttribute("data-chat-msg-id", "burst" + i);
        d.innerHTML = '<div class="app-chat-bubble">連続更新 ' + i + '</div>';
        list.appendChild(d);
        await new Promise(s => setTimeout(s, 220));
      }
      await new Promise(s => setTimeout(s, 600));
      const still = r.querySelector('.msg[data-probe="1"]');
      return { kept: !!still, total: r.querySelectorAll(".msg").length };
    });
    assert(o.kept, "既存メッセージのDOMが作り直された（＝毎回総入れ替え＝点滅する）");
    return "既存ノードは保持 / 全 " + o.total + " 件";
  });

  console.log("\n══ ⑦ 選択パネルの位置 ══");
  for (const [label, vp] of [["PC", { width: 1440, height: 900 }], ["モバイル", { width: 390, height: 844 }]]) {
    await step(label + "：思考レベルがボタンの真上に出て画面内に収まる", async () => {
      await pg.setViewportSize(vp);
      await pg.waitForTimeout(500);
      const o = await pg.evaluate(() => {
        const r = document.getElementById("vqChat").shadowRoot;
        const dd = r.querySelector('[data-dd="think"]');
        const btn = r.querySelector('[data-a="thinkMenu"]');
        if (dd.classList.contains("on")) btn.click();      /* 開きっぱなしなら一度閉じる */
        btn.click();
        const a = dd.getBoundingClientRect(), br = btn.getBoundingClientRect();
        const comp = r.querySelector(".composer").getBoundingClientRect();
        return { open: dd.classList.contains("on"),
                 gap: Math.round(br.top - a.bottom), offBottom: Math.round(Math.max(0, a.bottom - innerHeight)),
                 offTop: Math.round(Math.max(0, -a.top)),
                 /* 問題は「入力欄の下端より下へ潜ること」。上へ被さるのは正常な開き方。 */
                 belowComposer: Math.round(a.bottom - comp.bottom),
                 items: dd.querySelectorAll("button").length };
      });
      assert(o.open, "パネルが開いていない");
      assert(o.offBottom === 0, "画面下にはみ出す: " + o.offBottom + "px");
      assert(o.offTop === 0, "画面上にはみ出す: " + o.offTop + "px");
      assert(o.gap >= 0 && o.gap <= 12, "ボタンの真上に無い（すき間 " + o.gap + "px）");
      assert(o.belowComposer <= 0, "入力欄の下へ潜っている: " + o.belowComposer + "px");
      return o.items + "項目 / ボタンとのすき間 " + o.gap + "px / 入力欄下端より " + (-o.belowComposer) + "px 上";
    });
  }

  await step("Console エラー 0 件", async () => {
    const real = errs.filter(e => !/favicon|net::ERR|Failed to load resource|503|404/i.test(e));
    assert(real.length === 0, real.join(" / "));
    return "0 件";
  });

  await b.close();
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\n結果: ${pass} / ${pass + fail} 通過` + (fail ? `（失敗 ${fail}）` : ""));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
