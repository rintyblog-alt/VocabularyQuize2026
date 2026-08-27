/* 導線の検証。?vq2= を付けずに開き、既定の状態で入口が「見えるか」を確かめる。
   見えている UI は #vqShell（サイドバー）と #vqScreens（ホーム/プリセット）の Shadow DOM。 */
const { chromium } = require("playwright");

let pass = 0, fail = 0;
const consoleErrors = [];
async function step(name, fn) {
  try { const r = await fn(); pass++; console.log("  ✓ " + name + (r ? " — " + r : "")); }
  catch (e) { fail++; console.log("  ✗ " + name + " — " + e.message); }
}
function assert(c, m) { if (!c) throw new Error(m || "assertion failed"); }
function assertEq(a, b, m) { if (a !== b) throw new Error((m || "値が違う") + `（期待 ${JSON.stringify(b)} / 実際 ${JSON.stringify(a)}）`); }

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
  await pg.waitForTimeout(2500);
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
  await pg.evaluate(() => { const n = document.getElementById("vqNewAuth"); if (n) n.style.display = "none"; });
}

/* Shadow 内の要素が「実際に見えているか」を測る（矩形が正で、隠されていない） */
const VISIBLE = `
  const host = document.getElementById(args[0]);
  if (!host || !host.shadowRoot) return { ok:false, why:"host なし" };
  const els = host.shadowRoot.querySelectorAll(args[1]);
  const out = [];
  for (const el of els) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    out.push({ text: (el.textContent||"").trim(), w: Math.round(r.width), h: Math.round(r.height),
               vis: cs.visibility, disp: cs.display,
               shown: r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" });
  }
  return { ok:true, items: out };`;

async function probe(pg, hostId, sel) {
  return pg.evaluate(({ src, args }) => new Function("args", src)(args), { src: VISIBLE, args: [hostId, sel] });
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();
  pg.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
  pg.on("pageerror", (e) => consoleErrors.push("pageerror: " + String(e).slice(0, 200)));

  console.log("\n══ PC（1440×900）・フラグ指定なし ══");
  await login(pg, "http://127.0.0.1:8791/?vqdev=1");

  await step("既定でフラグが ON になっている", async () => {
    const a = await pg.evaluate(() => window.VQ2FLAGS.all());
    const on = Object.keys(a).filter((k) => a[k]);
    assert(on.length === 8, "ON の数が 8 でない: " + on.length);
    return on.length + " / 8 が ON";
  });

  await step("左サイドバーに Learning Workspace の項目が見えている", async () => {
    const r = await probe(pg, "vqShell", "#vq2-shell-nav .vqs-item");
    assert(r.ok, r.why);
    assert(r.items.length === 3, "項目数が違う: " + r.items.length);
    const hidden = r.items.filter((i) => !i.shown);
    assert(hidden.length === 0, "見えていない項目がある: " + JSON.stringify(hidden));
    /* クイズを解く導線はここに置かない（本体のプリセット画面が正規） */
    assert(!r.items.some((i) => /クイズを解く/.test(i.text)), "クイズ導線が二重にある");
    return r.items.map((i) => i.text).join(" / ");
  });

  await step("プリセット画面に入口バーを出していない（同じ並びを二重に見せない）", async () => {
    await pg.evaluate(() => {
      const b = document.querySelector('#appTabBar [data-app-tab="library"]');
      if (b) b.click();
    });
    await pg.waitForTimeout(1200);
    const r = await probe(pg, "vqScreens", "#vq2-screens-bar");
    assert(r.items.length === 0, "バーが残っている");
    /* 本体のプリセット画面が元の形のままであること */
    const shape = await pg.evaluate(() => {
      const sr = document.getElementById("vqScreens").shadowRoot;
      const s = sr.querySelector('[data-screen="presets"]');
      return { first: s.firstElementChild.className, kids: s.children.length };
    });
    assert(shape.first === "ph", "先頭が見出しでない: " + shape.first);
    return "先頭は見出し / 子要素 " + shape.kids + " 個（元のまま）";
  });

  await step("設定画面に Learning Workspace の項目がある", async () => {
    await pg.evaluate(() => window.__vqOpenSettings());
    await pg.waitForTimeout(500);
    const nav = await probe(pg, "vqSettings", '.nav[data-nav="workspace"]');
    assert(nav.items.length === 1, "設定にカテゴリが無い");
    await pg.evaluate(() => {
      document.getElementById("vqSettings").shadowRoot.querySelector('.nav[data-nav="workspace"]').click();
    });
    await pg.waitForTimeout(300);
    const sw = await probe(pg, "vqSettings", ".body [data-vq2flag]");
    assert(sw.items.length === 8, "スイッチ数が違う: " + sw.items.length);
    /* 実際に切り替わるか */
    const changed = await pg.evaluate(() => {
      const sr = document.getElementById("vqSettings").shadowRoot;
      sr.querySelector('.body [data-vq2flag="resultViewV2"]').click();
      return window.VQ2FLAGS.isOn("resultViewV2");
    });
    assert(changed === false, "設定から OFF にできない");
    await pg.evaluate(() => {
      document.getElementById("vqSettings").shadowRoot.querySelector('.body [data-vq2flag="resultViewV2"]').click();
      window.__vqCloseSettings();
    });
    await pg.waitForTimeout(400);
    return "8 スイッチ / 実際に切り替わる";
  });

  await step("旧ライブラリページは隠されている（＝そこに置いても見えない）", async () => {
    const v = await pg.evaluate(() => {
      const el = document.getElementById("appLibraryPage");
      return el ? getComputedStyle(el).visibility : "なし";
    });
    assert(v === "hidden", "visibility が " + v);
    return "visibility: hidden（新 UI が前面）";
  });

  await step("サイドバーの「クイズを作成」→ Preset Studio V2 が開く", async () => {
    await pg.evaluate(() => {
      const sr = document.getElementById("vqShell").shadowRoot;
      sr.querySelector('.create[data-action="create-quiz"]').click();
    });
    await pg.waitForFunction(() => {
      const h = document.getElementById("vq2-preset-studio");
      return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vq2-root"));
    }, null, { timeout: 15000 });
    const t = await pg.evaluate(() => {
      const h = document.getElementById("vq2-preset-studio");
      const el = h.shadowRoot.querySelector(".vq2-top-title");
      return el ? el.textContent.trim() : "";
    });
    await pg.evaluate(() => { const h = document.getElementById("vq2-preset-studio"); if (h && h.__vq2) h.__vq2.forceClose("test"); });
    await pg.waitForTimeout(400);
    return "画面タイトル: " + t;
  });

  await step("プリセット画面の「クイズを作成」→ Preset Studio V2 が開く", async () => {
    await pg.evaluate(() => {
      const sr = document.getElementById("vqScreens").shadowRoot;
      sr.querySelector('[data-bridge-action="create-quiz"]').click();
    });
    await pg.waitForFunction(() => {
      const h = document.getElementById("vq2-preset-studio");
      return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vq2-root"));
    }, null, { timeout: 15000 });
    await pg.evaluate(() => { const h = document.getElementById("vq2-preset-studio"); if (h && h.__vq2) h.__vq2.forceClose("test"); });
    await pg.waitForTimeout(400);
    return "旧エンジンではなく V2 が開いた";
  });

  await step("プリセットのカードを押すと詳細シートが開く（バナー・アイコン・メタ・操作）", async () => {
    await pg.evaluate(() => {
      const b = document.querySelector('#appTabBar [data-app-tab="library"]');
      if (b) b.click();
    });
    await pg.waitForTimeout(1200);
    const clicked = await pg.evaluate(() => {
      const sr = document.getElementById("vqScreens").shadowRoot;
      const card = sr.querySelector("[data-preset-select]");
      if (!card) return null;
      const id = card.getAttribute("data-preset-select");
      card.click();
      return id;
    });
    assert(clicked, "プリセットのカードが無い");
    await pg.waitForFunction(() => {
      const h = document.getElementById("vq2-preset-detail");
      return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vq2-root"));
    }, null, { timeout: 15000 });
    const d = await pg.evaluate(() => {
      const root = document.getElementById("vq2-preset-detail").shadowRoot.querySelector(".vq2-root");
      const r = root.getBoundingClientRect();
      return {
        sheet: root.classList.contains("is-sheet"),
        fullWidth: Math.round(r.width) >= window.innerWidth,
        title: (root.querySelector(".vq2-pd-t") || {}).textContent,
        /* 作り手は見出しへ移した（誰のものかは表を読む前に分かるべきなので） */
        by: ((root.querySelector(".vq2-pd-by") || {}).textContent || "").trim(),
        kinds: Array.from(root.querySelectorAll(".vq2-pd-kind")).map((e) => e.textContent.trim()),
        facts: Array.from(root.querySelectorAll(".vq2-pd-fk")).map((e) => e.textContent.trim()),
        opts: Array.from(root.querySelectorAll("[data-key]")).map((e) => e.getAttribute("data-key")),
        acts: Array.from(root.querySelectorAll(".vq2-pd-foot [data-act]")).map((e) => e.getAttribute("data-act"))
      };
    });
    assert(d.sheet, "全画面のままでシートになっていない");
    assert(!d.fullWidth, "画面幅いっぱいに広がっている");
    ["問題数", "公開範囲"].forEach((k) =>
      assert(d.facts.includes(k), k + " が出ていない: " + d.facts.join(",")));
    assert(/自分|VocabuQuiz|作成/.test(d.by), "誰が作ったか分からない: " + d.by);
    assert(d.kinds.length >= 1, "種別（自分 / 公開 / 公式）が出ていない");
    ["mode", "limit", "perQ", "limitMin"].forEach((k) =>
      assert(d.opts.includes(k), k + " を設定できない"));
    assert(d.acts.includes("start"), "クイズ開始が無い");
    assert(d.acts.includes("del"), "削除が無い");
    assert(d.acts.includes("edit"), "編集が無い");
    return d.title + " / " + d.kinds.join("・") + " / " + d.by + " / "
      + d.facts.length + " 項目 / 操作: " + d.acts.join(",");
  });

  await step("詳細の「クイズを開始」→ 新しいクイズ画面が開く", async () => {
    await pg.evaluate(() => {
      const root = document.getElementById("vq2-preset-detail").shadowRoot.querySelector(".vq2-root");
      root.querySelector('[data-act="start"]').click();
    });
    await pg.waitForFunction(() => {
      const h = document.getElementById("vq2-quiz-player");
      return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vq2-root"));
    }, null, { timeout: 15000 });
    const gone = await pg.evaluate(() => !document.getElementById("vq2-preset-detail"));
    assert(gone, "詳細シートが残っている");
    await pg.evaluate(() => { const h = document.getElementById("vq2-quiz-player"); if (h && h.__vq2) h.__vq2.forceClose("test"); });
    await pg.waitForTimeout(400);
    return "詳細は畳まれ、クイズ画面だけになった";
  });

  await step("カードの「開始」→ そのまま新しいクイズ画面が開く", async () => {
    await pg.evaluate(() => {
      const sr = document.getElementById("vqScreens").shadowRoot;
      sr.querySelector("[data-preset-start]").click();
    });
    await pg.waitForFunction(() => {
      const h = document.getElementById("vq2-quiz-player");
      return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vq2-root"));
    }, null, { timeout: 15000 });
    await pg.evaluate(() => { const h = document.getElementById("vq2-quiz-player"); if (h && h.__vq2) h.__vq2.forceClose("test"); });
    await pg.waitForTimeout(400);
    return "V1 の出題ではなく V2 が開いた";
  });

  await step("V2 のプリセット一覧画面は無くなっている", async () => {
    const gone = await pg.evaluate(() => !document.getElementById("vq2-picker"));
    assert(gone, "まだ残っている");
    const api = await pg.evaluate(() => typeof window.VQ2.open.presetStudio === "function");
    assert(api, "編集画面の入口が失われている");
    return "一覧は本体の 1 つだけ";
  });

  await step("編集画面でアイコンとバナーを設定でき、詳細に出る", async () => {
    /* 実際の保存 API を通して見た目を付ける */
    const id = await pg.evaluate(() => {
      const S = window.VQ2.schema, ST = window.VQ2.store;
      const p = S.emptyPreset({ name: "見た目つきプリセット", questions: [
        S.emptyQuestion({ prompt: "見た目の確認", choices: [
          { id: "c1", label: "A", text: "正", explanation: "", isCorrect: true },
          { id: "c2", label: "B", text: "誤", explanation: "", isCorrect: false }] })
      ]});
      /* 1×1 の PNG を data URL で持たせる（外部通信なし） */
      const px = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6X8HAoAAAAASUVORK5CYII=";
      p.appearance = { icon: "📘", iconImage: "", banner: px };
      const r = ST.savePreset(p);
      return r.ok ? r.preset.id : null;
    });
    assert(id, "見た目つきプリセットを保存できなかった");
    await pg.evaluate((pid) => window.VQ2.presetDetail.open({ preset: window.VQ2.store.getPreset(pid) }), id);
    await pg.waitForFunction(() => {
      const h = document.getElementById("vq2-preset-detail");
      return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vq2-root"));
    }, null, { timeout: 15000 });
    const shown = await pg.evaluate(() => {
      const root = document.getElementById("vq2-preset-detail").shadowRoot.querySelector(".vq2-root");
      const banner = root.querySelector(".vq2-pd-banner");
      const icon = root.querySelector(".vq2-pd-icon");
      return {
        banner: !!banner && banner.getBoundingClientRect().height > 0,
        icon: icon ? icon.textContent.trim() : "",
        title: (root.querySelector(".vq2-pd-t") || {}).textContent
      };
    });
    assert(shown.banner, "バナーが表示されていない");
    assertEq(shown.icon, "📘", "アイコンが表示されていない");
    assertEq(shown.title, "見た目つきプリセット", "タイトルが違う");
    /* 編集画面の設定シートにアイコン・バナーの入口があるか */
    await pg.evaluate(() => {
      document.getElementById("vq2-preset-detail").shadowRoot.querySelector(".vq2-root")
        .querySelector('[data-act="edit"]').click();
    });
    await pg.waitForFunction(() => {
      const h = document.getElementById("vq2-preset-studio");
      return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vq2-root"));
    }, null, { timeout: 15000 });
    await pg.evaluate(() => {
      const root = document.getElementById("vq2-preset-studio").shadowRoot.querySelector(".vq2-root");
      const b = root.querySelector('[data-act="settings"]');
      if (b) b.click();
    });
    await pg.waitForFunction(() => {
      const h = document.getElementById("vq2-preset-appearance");
      return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vq2-root"));
    }, null, { timeout: 15000 });
    const ap = await pg.evaluate(() => {
      const root = document.getElementById("vq2-preset-appearance").shadowRoot.querySelector(".vq2-root");
      return {
        pickIcon: !!root.querySelector('[data-act="pick-icon"]'),
        pickBanner: !!root.querySelector('[data-act="pick-banner"]'),
        emoji: root.querySelectorAll("[data-emoji]").length,
        bannerPrev: !!root.querySelector(".vq2-ap-bprev img")
      };
    });
    assert(ap.pickIcon && ap.pickBanner, "画像を選ぶ操作が無い");
    assert(ap.emoji > 0, "絵文字が選べない");
    assert(ap.bannerPrev, "いま設定されているバナーが出ていない");
    await pg.evaluate(() => {
      ["vq2-preset-appearance", "vq2-preset-studio"].forEach((i) => {
        const h = document.getElementById(i); if (h && h.__vq2) h.__vq2.forceClose("test");
      });
      /* 後片付け */
      window.VQ2.store.listPresets({ includeLegacy: false })
        .filter((p) => p.name === "見た目つきプリセット")
        .forEach((p) => window.VQ2.store.deletePreset(p.id));
    });
    await pg.waitForTimeout(400);
    return "アイコン📘とバナーが詳細に出る / 絵文字 " + ap.emoji + " 種と画像選択あり";
  });

  await step("サイドバーの「Quick Mock（試験）」→ 試験作成が開く", async () => {
    await pg.evaluate(() => {
      const sr = document.getElementById("vqShell").shadowRoot;
      sr.querySelector('#vq2-shell-nav [data-vq2="mock"]').click();
    });
    await pg.waitForFunction(() => {
      const h = document.getElementById("vq2-quick-mock");
      return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vq2-root"));
    }, null, { timeout: 15000 });
    await pg.evaluate(() => { const h = document.getElementById("vq2-quick-mock"); if (h && h.__vq2) h.__vq2.forceClose("test"); });
    await pg.waitForTimeout(400);
    return "Quick Mock 起動";
  });

  await step("サイドバーの「結果と分析」→ 結果が開く", async () => {
    await pg.evaluate(() => {
      const sr = document.getElementById("vqShell").shadowRoot;
      sr.querySelector('#vq2-shell-nav [data-vq2="result"]').click();
    });
    await pg.waitForFunction(() => {
      const a = document.getElementById("vq2-result-picker"), b = document.getElementById("vq2-noresult");
      const ok = (h) => h && h.shadowRoot && h.shadowRoot.querySelector(".vq2-root");
      return !!(ok(a) || ok(b));
    }, null, { timeout: 15000 });
    const which = await pg.evaluate(() => document.getElementById("vq2-result-picker") ? "一覧" : "空状態");
    await pg.evaluate(() => {
      ["vq2-result-picker", "vq2-noresult"].forEach((id) => { const h = document.getElementById(id); if (h && h.__vq2) h.__vq2.forceClose("test"); });
    });
    await pg.waitForTimeout(400);
    return which;
  });

  await step("クイズ中に進捗バーが増えていかない（毎秒の再描画で積み上がらない）", async () => {
    const id = await pg.evaluate(() => {
      const S = window.VQ2.schema, ST = window.VQ2.store;
      const qs = [];
      for (let i = 1; i <= 3; i++) {
        qs.push(S.emptyQuestion({ prompt: "進捗の確認 " + i, choices: [
          { id: "c1", label: "A", text: "正", explanation: "", isCorrect: true },
          { id: "c2", label: "B", text: "誤", explanation: "", isCorrect: false }] }));
      }
      const r = ST.savePreset(S.emptyPreset({ name: "進捗バーの確認", questions: qs }));
      return r.ok ? r.preset.id : null;
    });
    assert(id, "検証用プリセットを作れなかった");
    await pg.evaluate((pid) => {
      window.VQ2.open.quiz({ preset: window.VQ2.store.getPreset(pid), mode: "practice", resume: false });
    }, id);
    await pg.waitForFunction(() => {
      const h = document.getElementById("vq2-quiz-player");
      return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vq2-root"));
    }, null, { timeout: 15000 });
    const count = () => pg.evaluate(() => {
      const root = document.getElementById("vq2-quiz-player").shadowRoot.querySelector(".vq2-root");
      return { prog: root.querySelectorAll(".vq2-prog").length,
               tops: root.querySelectorAll(".vq2-top").length,
               h: Math.round(root.querySelector(".vq2-head").getBoundingClientRect().height) };
    });
    const before = await count();
    assertEq(before.prog, 1, "最初から進捗バーが 1 本でない");
    await pg.waitForTimeout(5200);           /* タイマーが 5 回まわる */
    const after = await count();
    assertEq(after.prog, 1, "進捗バーが増えた");
    assertEq(after.tops, 1, "上部バーが増えた");
    assertEq(after.h, before.h, "見出しの高さが変わった");
    await pg.evaluate((pid) => {
      const h = document.getElementById("vq2-quiz-player"); if (h && h.__vq2) h.__vq2.forceClose("test");
      window.VQ2.store.deletePreset(pid);
    }, id);
    await pg.waitForTimeout(400);
    return "5 秒経っても 進捗バー 1 本 / 上部バー 1 本 / 高さ " + after.h + "px のまま";
  });

  await step("画面を渡り歩いても全画面のモーダルが積み上がらない", async () => {
    const count = () => pg.evaluate(() =>
      Array.from(document.querySelectorAll("body > .vq2-host"))
        .filter((h) => getComputedStyle(h).display !== "none").map((h) => h.id));
    /* 入口 → 一覧 → 新規作成 → クイズ → 結果 と辿る */
    const seq = [];
    await pg.evaluate(() => {
      const sr = document.getElementById("vqShell").shadowRoot;
      sr.querySelector('#vq2-shell-nav [data-vq2="preset-new"]').click();
    });
    await pg.waitForTimeout(900); seq.push(await count());
    await pg.evaluate(() => {
      const sr = document.getElementById("vqScreens").shadowRoot;
      const card = sr.querySelector("[data-preset-select]"); if (card) card.click();
    });
    await pg.waitForTimeout(900); seq.push(await count());
    await pg.evaluate(() => window.VQ2.open.quickMock({}));
    await pg.waitForTimeout(900); seq.push(await count());
    await pg.evaluate(() => window.VQ2.open.result({}));
    await pg.waitForTimeout(900); seq.push(await count());
    const bad = seq.filter((s) => s.length !== 1);
    assert(bad.length === 0, "重なった: " + JSON.stringify(seq));
    await pg.evaluate(() => {
      document.querySelectorAll("body > .vq2-host").forEach((h) => { if (h.__vq2) h.__vq2.forceClose("test"); });
    });
    await pg.waitForTimeout(400);
    return "4 回の遷移とも常に 1 枚（" + seq.map((s) => s[0]).join(" → ") + "）";
  });

  await step("フラグを全 OFF にすると入口が消える", async () => {
    await pg.evaluate(() => window.VQ2FLAGS.setAll(false));
    await pg.waitForTimeout(500);
    const s = await probe(pg, "vqShell", "#vq2-shell-nav .vqs-item");
    assert(s.items.length === 0, "サイドバーに残っている: " + s.items.length);
    /* 旧導線に戻っているか */
    const back = await pg.evaluate(() => {
      const sr = document.getElementById("vqShell").shadowRoot;
      const btn = sr.querySelector('.create[data-action="create-quiz"]');
      btn.click();
      return !document.getElementById("vq2-preset-studio");
    });
    assert(back, "OFF なのに V2 が開いた");
    await pg.evaluate(() => window.VQ2FLAGS.setAll(true));
    await pg.waitForTimeout(600);
    const s2 = await probe(pg, "vqShell", "#vq2-shell-nav .vqs-item");
    assert(s2.items.length === 3, "ON に戻しても復活しない");
    return "OFF で消え、旧導線が復活。ON で戻る";
  });

  console.log("\n══ モバイル（390×844）══");
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mp = await mctx.newPage();
  mp.on("pageerror", (e) => consoleErrors.push("mobile pageerror: " + String(e).slice(0, 200)));
  await login(mp, "http://127.0.0.1:8791/?vqdev=1");

  await step("左パネル（ドロワー）にも項目が出る", async () => {
    await mp.evaluate(() => {
      document.body.classList.add("app-v2-sidebar-open");
    });
    await mp.waitForTimeout(600);
    const r = await probe(mp, "vqShell", "#vq2-shell-nav .vqs-item");
    assert(r.ok, r.why);
    assert(r.items.length === 3, "項目数が違う: " + r.items.length);
    assert(r.items.every((i) => i.shown), "見えていない項目がある");
    return r.items.length + " 項目";
  });

  await step("モバイルの設定からも Learning Workspace を開ける", async () => {
    await mp.evaluate(() => {
      document.body.classList.remove("app-v2-sidebar-open");
      window.__vqOpenSettings();
    });
    await mp.waitForTimeout(600);
    const row = await probe(mp, "vqSettings", '.mrow[data-nav="workspace"]');
    assert(row.items.length === 1 && row.items[0].shown, "一覧に出ていない");
    await mp.evaluate(() => {
      document.getElementById("vqSettings").shadowRoot.querySelector('.mrow[data-nav="workspace"]').click();
    });
    await mp.waitForTimeout(400);
    const sw = await probe(mp, "vqSettings", ".body [data-vq2flag]");
    assert(sw.items.length === 8, "スイッチ数が違う: " + sw.items.length);
    assert(sw.items.every((i) => i.shown), "見えていないスイッチがある");
    await mp.evaluate(() => window.__vqCloseSettings());
    await mp.waitForTimeout(300);
    return "一覧 → 詳細で 8 スイッチ";
  });

  await step("Console エラー 0 件", async () => {
    const v2 = consoleErrors.filter((e) => !/favicon|net::ERR|Failed to load resource/i.test(e));
    assert(v2.length === 0, v2.join(" / "));
    return "0 件";
  });

  await browser.close();
  console.log(`\n結果: ${pass} / ${pass + fail} 通過` + (fail ? `（失敗 ${fail}）` : ""));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
