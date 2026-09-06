/* ══════════════════════════════════════════════════════════════════════════
   vqsettings.cjs — 設定画面の回帰テスト

   見るところ:
     ① 定義表から画面が作られている（束・行・種類）
     ② 触ると **本当に効く**（色・角・幅・動き・下線・枠・数字の幅）
     ③ 昔からある設定は本物のコントロールへ届く（アプリ本体の値が変わる）
     ④ 端末に残る（読み込み直しても戻らない）
     ⑤ 壊れた値は入らない
     ⑥ 束ごと既定へ戻せる
     ⑦ スマホでも一覧 → 詳細で開ける
     ⑧ アカウント同期（ログインしていれば /api/settings と往復する）

   使い方: node vqsettings.cjs          （未ログインの範囲まで）
           VQ_TOKEN=<token> node vqsettings.cjs  （同期まで）
   ══════════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const fs = require("node:fs");
fs.mkdirSync("shots/settings", { recursive: true });

const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  NG   " + n + (x ? "  → " + x : ""))); };

async function boot(pg) {
  await pg.goto(BASE + "/?vqdev=1&cb=" + Date.now(), { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(4000);
  await pg.evaluate(() => {
    ["firstLaunchOverlay", "vqbFlow", "vqNewAuth", "authGate", "authBootSplash", "vqOnboardingOverlay"].forEach((id) => {
      const e = document.getElementById(id);
      if (e) { e.hidden = true; e.style.setProperty("display", "none", "important"); }
    });
    document.querySelectorAll('[data-act="dlg-x"],[data-act="dlg-o"]').forEach((x) => x.click());
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
  });
  await pg.waitForTimeout(1800);
}
const openSet = (pg) => pg.evaluate(() => window.__vqOpenSettings && window.__vqOpenSettings());
const nav = (pg, g) => pg.evaluate((g) => {
  const r = document.getElementById("vqSettings").shadowRoot;
  const b = r.querySelector('.nav[data-nav="' + g + '"]') || r.querySelector('.mrow[data-nav="' + g + '"]');
  if (b) b.click();
  return !!b;
}, g);
const rows = (pg) => pg.evaluate(() => {
  const r = document.getElementById("vqSettings").shadowRoot;
  return Array.from(r.querySelectorAll(".body .row")).filter((x) => !x.dataset.reset).map((x) => ({
    label: (x.querySelector(".row__label") || {}).textContent || "",
    set: (x.querySelector("[data-set]") || {}).dataset ? x.querySelector("[data-set]").dataset.set : null,
    kind: x.querySelector("select.sel") ? "select" : x.querySelector(".sw") ? "toggle"
      : x.querySelector(".seg") ? "seg" : x.dataset.action ? "action" : "other"
  }));
});
const pick = (pg, id, val) => pg.evaluate(([id, val]) => {
  const r = document.getElementById("vqSettings").shadowRoot;
  const sel = r.querySelector('select.sel[data-set="' + id + '"]');
  if (sel) { sel.value = val; sel.dispatchEvent(new Event("change", { bubbles: true })); return "select"; }
  const seg = r.querySelector('.seg button[data-set="' + id + '"][data-val="' + val + '"]');
  if (seg) { seg.click(); return "seg"; }
  /* ★ 2026-09-03。選ぶ ものは 落ちる 一覧 では なく **丸（ラジオ）**に なった
     （訴え「設定の UI を 写真と ほぼ 同じに」）。ここを 足さないと
     「色が 変わらない」と 出るが、変わらないのは **検査の 押しかた**の ほう。 */
  const rr = r.querySelector('.rrow[data-set="' + id + '"][data-val="' + val + '"]');
  if (rr) { rr.click(); return "radio"; }
  const sw = r.querySelector('.sw[data-set="' + id + '"]');
  if (sw) { const on = sw.classList.contains("on"); if (on !== !!val) sw.click(); return "toggle"; }
  const num = r.querySelector('.num__i[data-num="' + id + '"]');
  if (num) { num.value = String(val); num.dispatchEvent(new Event("change", { bubbles: true })); return "number"; }
  return null;
}, [id, val]);
const cssvar = (pg, n) => pg.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), n);

(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 2 });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
  await boot(pg);

  /* ── ① 土台 ─────────────────────────────────────────────── */
  console.log("\n### 土台");
  const has = await pg.evaluate(() => !!window.__vqSet);
  ok("設定ストアが立ち上がっている", has);
  const meta = await pg.evaluate(() => ({
    groups: window.__vqSet.groups().map((g) => g.id),
    specs: window.__vqSet.specs().length,
    own: window.__vqSet.specs().filter((s) => s.kind === "own").length,
    legacy: window.__vqSet.specs().filter((s) => s.kind === "legacy").length,
    acts: window.__vqSet.specs().filter((s) => s.type === "action").length,
    infos: window.__vqSet.specs().filter((s) => s.type === "info").length
  }));
  console.log("  束 " + meta.groups.length + " / 行 " + meta.specs +
    "（自前 " + meta.own + " ・本体 " + meta.legacy + " ・操作 " + meta.acts + " ・状態 " + meta.infos + "）");
  ok("束が 10 以上ある", meta.groups.length >= 10, String(meta.groups.length));
  ok("設定が 35 行以上ある", meta.specs >= 35, String(meta.specs));

  /* 効果を書いていない設定を混ぜない（見た目だけの飾りを増やさない）
     ★ 押しもの（type:"action"）の 効果は **run**（2026-08-28 に 直した）。
       もとは apply か readBy しか 見ておらず、押しものは 全部
       「効果が 無い」と 数えられていた（voice.check など 4 件が ずっと 落ちていた）。
       押しものには run を 求める ＝ **前より 厳しい**（run の 無い
       押しものは ここで 落ちる）。 */
  const noApply = await pg.evaluate(() => window.__vqSet.specs()
    .filter((s) => {
      if (s.kind !== "own") return false;
      if (s.type === "action") return typeof s.run !== "function";
      return typeof s.apply !== "function" && !s.readBy;
    }).map((s) => s.id));
  ok("自前の設定はすべて効果(apply / readBy、押しものは run)を持つ", noApply.length === 0, noApply.join(","));
  const emptyApply = await pg.evaluate(() => window.__vqSet.specs()
    .filter((s) => s.kind === "own" && typeof s.apply === "function" && /^function\s*\(\s*\)\s*\{\s*\}$/.test(String(s.apply)))
    .map((s) => s.id));
  ok("中身の空な effect を置いていない", emptyApply.length === 0, emptyApply.join(","));
  const noBridge = await pg.evaluate(() => window.__vqSet.specs()
    .filter((s) => s.kind === "legacy" && (typeof s.lset !== "function" || typeof s.lget !== "function")).map((s) => s.id));
  ok("本体の設定はすべて橋渡しを持つ", noBridge.length === 0, noBridge.join(","));
  const dupe = await pg.evaluate(() => {
    const seen = {}, d = [];
    window.__vqSet.specs().forEach((s) => { if (seen[s.id]) d.push(s.id); seen[s.id] = 1; });
    return d;
  });
  ok("id が重複していない", dupe.length === 0, dupe.join(","));
  const orphan = await pg.evaluate(() => {
    const gs = window.__vqSet.groups().map((g) => g.id);
    return window.__vqSet.specs().filter((s) => gs.indexOf(s.group) < 0).map((s) => s.id);
  });
  ok("どの設定も束に属している", orphan.length === 0, orphan.join(","));

  /* ── ② 画面が定義表から作られる ─────────────────────────── */
  console.log("\n### 画面");
  await openSet(pg);
  await pg.waitForTimeout(500);
  ok("設定が開く", await pg.evaluate(() => window.__vqSettingsIsOpen()));
  const navCount = await pg.evaluate(() => document.getElementById("vqSettings").shadowRoot.querySelectorAll(".nav").length);
  ok("左の並びが束の数と一致", navCount === meta.groups.length, navCount + " vs " + meta.groups.length);

  for (const g of ["display", "learn", "sound", "notif", "ai", "a11y", "data", "help", "about"]) {
    ok("束「" + g + "」が開ける", await nav(pg, g));
    await pg.waitForTimeout(120);
    /* ★ 2026-09-03。選ぶ ものは 1 つの 設定が **丸の 行 N 本**に なるので、
       行を 数えても 定義の 数には ならない。見たいのは
       「定義した 設定が ぜんぶ 画面に 出ているか」なので **id で 数える**。 */
    const 出 = await pg.evaluate(() => {
      const r = document.getElementById("vqSettings").shadowRoot;
      const 表 = Object.create(null);
      r.querySelectorAll(".body [data-set],.body [data-num],.body [data-action],.body [data-run],.body [data-doc],.body [data-push]")
        .forEach((el) => {
          const id = el.getAttribute("data-set") || el.getAttribute("data-num") || "";
          if (id) 表[id] = 1;
        });
      return Object.keys(表);
    });
    const 欲 = await pg.evaluate((g) => window.__vqSet.inGroup(g)
      .filter((s) => s.type !== "action" && s.type !== "info").map((s) => s.id), g);
    const 欠 = 欲.filter((id) => 出.indexOf(id) < 0);
    ok("束「" + g + "」の設定がぜんぶ画面に出る", 欠.length === 0,
      欠.length ? 欠.join(",") : 出.length + " / " + 欲.length);
  }

  /* ── ③ 触ると本当に効く ─────────────────────────────────── */
  console.log("\n### 効果");
  await nav(pg, "display"); await pg.waitForTimeout(150);

  const accentDefault = await cssvar(pg, "--vq-accent");   /* 何も設定していないときの色 */
  const accentBefore = accentDefault;
  await pick(pg, "display.accent", "teal"); await pg.waitForTimeout(250);
  const accentAfter = await cssvar(pg, "--vq-accent");
  /* ★ 色を決め打ちしない（2026-08-18・実測）。「自動」テーマは **時刻で**
     明暗が変わる（18:00 からダーク）。ティールは 明 #3E8F86 / 暗 #7FC9BF。
     明るいほうだけを書いていたので、夕方に走らせると落ちた。
     見たいのは「選んだ色に **実際に変わる**」ことなので、両方を正とする。 */
  const ティール = ["#3e8f86", "#7fc9bf"];
  ok("アクセントの色が実際に変わる",
    accentAfter.toLowerCase() !== accentBefore.toLowerCase()
    && ティール.indexOf(accentAfter.toLowerCase()) >= 0, accentBefore + " → " + accentAfter);
  const feedAccent = await pg.evaluate(() => {
    const h = document.getElementById("vqFeed");
    if (!h || !h.shadowRoot) return null;
    const el = h.shadowRoot.querySelector("*");
    return el ? getComputedStyle(el).getPropertyValue("--vq-accent").trim() : null;
  });
  ok("Shadow DOM の層にも色が届く", feedAccent === null || feedAccent.toLowerCase() === "#3e8f86", String(feedAccent));

  await pick(pg, "display.radius", "square"); await pg.waitForTimeout(250);
  ok("角の丸みの倍率が入る", (await cssvar(pg, "--vq-r-scale")) === "0.3", await cssvar(pg, "--vq-r-scale"));
  const radFeed = await pg.evaluate(() => {
    const h = document.getElementById("vqFeed");
    const c = h && h.shadowRoot && h.shadowRoot.querySelector(".col,.card,.post");
    return c ? getComputedStyle(c).borderTopLeftRadius : null;
  });
  ok("Feed のカードの角が実際に変わる", radFeed === null || parseFloat(radFeed) < 8, String(radFeed));
  const wrapBefore = await pg.evaluate(() => {
    const h = document.getElementById("vqFeed");
    const w = h && h.shadowRoot && h.shadowRoot.querySelector(".wrap");
    return w ? getComputedStyle(w).maxWidth : null;
  });
  await pick(pg, "display.width", "wide"); await pg.waitForTimeout(300);
  ok("本文の幅の倍率が入る", (await cssvar(pg, "--vq-width-scale")) === "1.25", await cssvar(pg, "--vq-width-scale"));
  const wrapAfter = await pg.evaluate(() => {
    const h = document.getElementById("vqFeed");
    const w = h && h.shadowRoot && h.shadowRoot.querySelector(".wrap");
    return w ? getComputedStyle(w).maxWidth : null;
  });
  ok("Feed の本文の幅が実際に広がる",
    wrapBefore === null || (parseFloat(wrapAfter) > parseFloat(wrapBefore) + 1),
    wrapBefore + " → " + wrapAfter);
  await pick(pg, "display.tabularNums", true); await pg.waitForTimeout(250);
  ok("数字の幅がそろう", (await pg.evaluate(() => getComputedStyle(document.body).fontVariantNumeric)).indexOf("tabular-nums") >= 0,
    await pg.evaluate(() => getComputedStyle(document.body).fontVariantNumeric));

  await nav(pg, "a11y"); await pg.waitForTimeout(150);
  await pick(pg, "a11y.reduceMotion", true); await pg.waitForTimeout(250);
  ok("動きを減らすが当たる", await pg.evaluate(() => document.documentElement.getAttribute("data-vq-reduce-motion") === "1"));
  ok("動きを減らす CSS が入る", await pg.evaluate(() => {
    const s = document.getElementById("vqsetMotion");
    return !!s && s.textContent.indexOf("animation-duration") >= 0;
  }));
  ok("動きを減らす CSS が Shadow DOM にも入る", await pg.evaluate(() => {
    const h = document.getElementById("vqSettings");
    return !!(h && h.shadowRoot && h.shadowRoot.querySelector('style[data-vqset="vqsetMotion"]'));
  }));
  await pick(pg, "a11y.underlineLinks", true); await pg.waitForTimeout(200);
  ok("リンクの下線が入る", await pg.evaluate(() => {
    const s = document.getElementById("vqsetUnderline");
    return !!s && s.textContent.indexOf("underline") >= 0;
  }));
  await pick(pg, "a11y.focusRing", true); await pg.waitForTimeout(200);
  ok("枠を出す CSS が入る", await pg.evaluate(() => {
    const s = document.getElementById("vqsetFocus");
    return !!s && s.textContent.indexOf("outline") >= 0;
  }));
  await pick(pg, "a11y.contrast", true); await pg.waitForTimeout(200);
  /* 明 #4A4557 / 暗 #E4DFEC。どちらでも「濃くなる」ことを見る。 */
  ok("文字を濃くするが当たる",
    ["#4A4557", "#E4DFEC"].indexOf(await cssvar(pg, "--vq-text-secondary")) >= 0,
    await cssvar(pg, "--vq-text-secondary"));

  await nav(pg, "learn"); await pg.waitForTimeout(150);
  await pick(pg, "learn.focus", false); await pg.waitForTimeout(200);
  ok("まわりを隠さない設定が印になる", await pg.evaluate(() => document.documentElement.getAttribute("data-vq-quiz-focus") === "off"));
  const shellShown = await pg.evaluate(() => {
    document.body.classList.add("quiz-focus");
    const d = getComputedStyle(document.getElementById("vqShell")).display;
    document.body.classList.remove("quiz-focus");
    return d;
  });
  ok("切ると解いている間も左パネルが残る", shellShown !== "none", shellShown);
  await pick(pg, "learn.focus", true); await pg.waitForTimeout(200);
  const shellHidden = await pg.evaluate(() => {
    document.body.classList.add("quiz-focus");
    const d = getComputedStyle(document.getElementById("vqShell")).display;
    document.body.classList.remove("quiz-focus");
    return d;
  });
  ok("入れると解いている間は左パネルが隠れる", shellHidden === "none", shellHidden);
  await pick(pg, "learn.showTimer", false); await pg.waitForTimeout(200);
  ok("残り時間を隠す CSS が入る", await pg.evaluate(() => {
    const s = document.getElementById("vqsetQuiz");
    return !!s && s.textContent.indexOf("#timerPill") >= 0;
  }));

  await nav(pg, "notif"); await pg.waitForTimeout(150);
  await pick(pg, "notif.position", "br"); await pg.waitForTimeout(200);
  await pg.evaluate(() => window.__vqNotify && window.__vqNotify.start("t1", { label: "テスト" }));
  await pg.waitForTimeout(300);
  ok("通知の出る場所が変わる", await pg.evaluate(() => {
    const h = document.getElementById("vqNotifyHost");
    return !!h && h.getAttribute("data-vqn-pos") === "br";
  }));
  await pg.evaluate(() => window.__vqNotify && window.__vqNotify.remove("t1"));
  await pick(pg, "notif.enabled", false); await pg.waitForTimeout(200);
  await pg.evaluate(() => window.__vqNotify && window.__vqNotify.start("t2", { label: "出ないはず" }));
  await pg.waitForTimeout(300);
  ok("通知を切ると出ない", await pg.evaluate(() => {
    const h = document.getElementById("vqNotifyHost");
    return !h || h.querySelectorAll(".vqn").length === 0;
  }));
  await pick(pg, "notif.enabled", true); await pg.waitForTimeout(200);
  await pick(pg, "notif.duration", "short"); await pg.waitForTimeout(200);
  const gone = await pg.evaluate(async () => {
    window.__vqNotify.start("t3", { label: "短い" });
    window.__vqNotify.done("t3", { ok: true, label: "できた" });
    const t0 = Date.now();
    for (let i = 0; i < 160; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const h = document.getElementById("vqNotifyHost");
      if (!h || h.querySelectorAll(".vqn").length === 0) return Date.now() - t0;
    }
    return -1;
  });
  ok("「短い」で早く消える（3秒台）", gone > 2500 && gone < 4800, gone + " ms");

  /* readBy 型は「読む側」が見ている。実際にその参照が入っているかを確かめる。 */
  /* ★ 画面の <script> の中身を 読む方法は もう使えない（2026-08-18）。
     大きな塊は client/js へ出したので、画面から見える textContent は
     空になる。ファイル側を まとめて読む。 */
  const _src = require("./vqsrc.cjs").丸ごと();
  const reads = {
    keyboard: _src.indexOf("__vqSet") >= 0 && _src.indexOf("learn.keyboard") >= 0,
    advice: _src.indexOf("ai.advice") >= 0
  };
  ok("出題画面がキーボード設定を読んでいる", reads.keyboard);
  ok("結果画面が助言の設定を読んでいる", reads.advice);

  /* ── ④ 本体の設定へ届く ─────────────────────────────────── */
  console.log("\n### 本体の設定へ届く");
  await nav(pg, "learn"); await pg.waitForTimeout(200);
  const learnRows = await rows(pg);
  ok("出題の向きは無くなった", !learnRows.some((r) => /出題の向き/.test(r.label)),
    learnRows.map((r) => r.label).join(" / "));
  ok("EXAM / WRITE 別々の設定は無くなった",
    !learnRows.some((r) => /EXAM|WRITE/.test(r.label)),
    learnRows.map((r) => r.label).join(" / "));
  ok("問題と答えの入れ替えは 1 つにまとまった",
    learnRows.filter((r) => /入れ替え/.test(r.label)).length === 1);

  await pick(pg, "learn.questionCount", 37); await pg.waitForTimeout(500);
  ok("決め打ちに無い問題数（37）を入れられる",
    (await pg.evaluate(() => Number(window.__vqSet.appSettings().questionCount))) === 37,
    await pg.evaluate(() => String(window.__vqSet.appSettings().questionCount)));
  await pick(pg, "learn.examTime", 12); await pg.waitForTimeout(500);
  ok("決め打ちに無い制限時間（12秒）を入れられる",
    (await pg.evaluate(() => Number(window.__vqSet.appSettings().choiceTimeLimitSec))) === 12,
    await pg.evaluate(() => String(window.__vqSet.appSettings().choiceTimeLimitSec)));
  await pick(pg, "learn.examTime", 0); await pg.waitForTimeout(400);
  ok("0 のときは「制限なし」と出る", await pg.evaluate(() => {
    const r = document.getElementById("vqSettings").shadowRoot;
    const n = r.querySelector('.num__i[data-num="learn.examTime"]');
    return n && (n.parentNode.querySelector(".num__n").textContent || "").indexOf("制限なし") >= 0;
  }));
  await pick(pg, "learn.examTime", 12); await pg.waitForTimeout(400);

  /* 範囲の外は入れない（入れたらその場で直る） */
  await pg.evaluate(() => {
    const r = document.getElementById("vqSettings").shadowRoot;
    const n = r.querySelector('.num__i[data-num="learn.questionCount"]');
    n.value = "9999"; n.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await pg.waitForTimeout(400);
  ok("上限より大きい数は上限に直る",
    (await pg.evaluate(() => Number(window.__vqSet.get("learn.questionCount")))) === 500,
    await pg.evaluate(() => String(window.__vqSet.get("learn.questionCount"))));
  await pick(pg, "learn.questionCount", 37); await pg.waitForTimeout(400);

  await pick(pg, "learn.reverse", true); await pg.waitForTimeout(500);
  const rev = await pg.evaluate(() => window.__vqLearnSet.read());
  ok("入れ替えが EXAM と WRITE の両方に効く", rev.reverse === true, JSON.stringify(rev));

  await nav(pg, "sound"); await pg.waitForTimeout(150);
  await pick(pg, "sound.bgm", false); await pg.waitForTimeout(400);
  ok("BGM が本体に届く", (await pg.evaluate(() => window.__vqSet.appSettings().bgm)) === false);

  /* ── ⑤ 壊れた値を弾く ───────────────────────────────────── */
  console.log("\n### 検証");
  const bad = await pg.evaluate(() => ({
    unknownKey: window.__vqSet.set("nope.nope", true),
    badEnum: window.__vqSet.set("display.accent", "neon"),
    badType: window.__vqSet.set("display.tabularNums", "yes"),
    action: window.__vqSet.set("data.factory", true),
    info: window.__vqSet.set("about.online", true),
    goodStill: window.__vqSet.get("display.accent")
  }));
  ok("知らない鍵は入らない", bad.unknownKey === false);
  ok("選べない値は入らない", bad.badEnum === false);
  ok("違う種類の値は入らない", bad.badType === false, String(bad.badType));
  ok("操作行は値を持たない", bad.action === false);
  ok("状態行は値を持たない", bad.info === false);
  ok("弾いたあとも前の値のまま", bad.goodStill === "teal", String(bad.goodStill));

  /* ── ⑥ 端末に残る ───────────────────────────────────────── */
  console.log("\n### 残る");
  const stored = await pg.evaluate(() => JSON.parse(localStorage.getItem("vq.settings.v1") || "{}"));
  ok("端末に記録される", !!stored["display.accent"] && stored["display.accent"].v === "teal");
  ok("記録に時刻が付く", !!stored["display.accent"] && Number(stored["display.accent"].at) > 0);

  await boot(pg);   /* 読み込み直し */
  ok("読み込み直しても色が残る",
    ["#3e8f86", "#7fc9bf"].indexOf((await cssvar(pg, "--vq-accent")).toLowerCase()) >= 0,
    await cssvar(pg, "--vq-accent"));
  ok("読み込み直しても角が残る", (await cssvar(pg, "--vq-r-scale")) === "0.3", await cssvar(pg, "--vq-r-scale"));
  ok("読み込み直しても動きを減らすが残る",
    await pg.evaluate(() => document.documentElement.getAttribute("data-vq-reduce-motion") === "1"));
  ok("読み込み直しても本体の設定が残る",
    (await pg.evaluate(() => Number(window.__vqSet.appSettings().questionCount))) === 37,
    await pg.evaluate(() => String(window.__vqSet.appSettings().questionCount)));

  /* ── ⑦ 束ごと既定へ戻す ─────────────────────────────────── */
  console.log("\n### 既定へ戻す");
  await openSet(pg); await pg.waitForTimeout(400);
  await nav(pg, "display"); await pg.waitForTimeout(200);
  await pg.evaluate(() => {
    const r = document.getElementById("vqSettings").shadowRoot;
    const b = r.querySelector('[data-reset="display"]');
    if (b) b.click();
  });
  await pg.waitForTimeout(400);
  ok("束ごと既定に戻る（色）", (await cssvar(pg, "--vq-accent")) === accentDefault,
    (await cssvar(pg, "--vq-accent")) + " / 既定 " + accentDefault);
  ok("束ごと既定に戻る（角）", (await cssvar(pg, "--vq-r-scale")) === "", "「" + (await cssvar(pg, "--vq-r-scale")) + "」");
  ok("ほかの束は戻らない",
    await pg.evaluate(() => document.documentElement.getAttribute("data-vq-reduce-motion") === "1"));
  ok("本体の設定も戻らない",
    (await pg.evaluate(() => Number(window.__vqSet.appSettings().questionCount))) === 37);

  await pg.screenshot({ path: "shots/settings/設定-PC.png" });
  ok("画面の失敗が出ていない（PC）", errs.length === 0, errs.join(" / "));

  /* ── ⑧ スマホ ───────────────────────────────────────────── */
  console.log("\n### スマホ");
  const mctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const mp = await mctx.newPage();
  const merrs = [];
  mp.on("pageerror", (e) => merrs.push(String(e).slice(0, 160)));
  await boot(mp);
  await openSet(mp); await mp.waitForTimeout(600);
  const mlist = await mp.evaluate(() => {
    const r = document.getElementById("vqSettings").shadowRoot;
    const m = r.querySelector(".modal");
    return {
      detail: m.classList.contains("is-detail"),
      rows: r.querySelectorAll(".mrow").length,
      listVisible: getComputedStyle(r.querySelector(".mlist")).display !== "none"
    };
  });
  ok("スマホは一覧から開く", mlist.detail === false && mlist.listVisible, JSON.stringify(mlist));
  ok("一覧に束が全部ある", mlist.rows === meta.groups.length, mlist.rows + " vs " + meta.groups.length);
  await nav(mp, "a11y"); await mp.waitForTimeout(400);
  ok("スマホで詳細へ進む", await mp.evaluate(() => document.getElementById("vqSettings").shadowRoot
    .querySelector(".modal").classList.contains("is-detail")));
  await pick(mp, "a11y.bigTap", true); await mp.waitForTimeout(300);
  ok("スマホでも設定が効く", await mp.evaluate(() => {
    const s = document.getElementById("vqsetTap");
    return !!s && s.textContent.indexOf("min-height:52px") >= 0;
  }));
  await mp.evaluate(() => {
    const r = document.getElementById("vqSettings").shadowRoot;
    const b = r.querySelector("[data-back]"); if (b) b.click();
  });
  await mp.waitForTimeout(300);
  ok("戻るで一覧へ帰る", await mp.evaluate(() => !document.getElementById("vqSettings").shadowRoot
    .querySelector(".modal").classList.contains("is-detail")));
  const overflow = await mp.evaluate(() => {
    const r = document.getElementById("vqSettings").shadowRoot;
    const m = r.querySelector(".mscroll");
    return m ? m.scrollWidth - m.clientWidth : -1;
  });
  ok("横にはみ出していない", overflow <= 1, String(overflow));
  await mp.screenshot({ path: "shots/settings/設定-スマホ.png" });
  ok("画面の失敗が出ていない（スマホ）", merrs.length === 0, merrs.join(" / "));

  /* ── ⑨ アカウント同期（token があるときだけ） ───────────── */
  console.log("\n### アカウント同期");
  const TK = String(process.env.VQ_TOKEN || "").trim();
  if (!TK) {
    console.log("  --   VQ_TOKEN が無いので飛ばす（未ログインの範囲までは合格）");
    const label = await pg.evaluate(() => window.__vqSet.syncLabel());
    ok("未ログインだと同期しないと出る", /未ログイン/.test(label), label);
  } else {
    const a = await b.newContext({ viewport: { width: 1280, height: 900 } });
    const pa = await a.newPage();
    await pa.goto(BASE + "/?vqdev=1&cb=" + Date.now(), { waitUntil: "domcontentloaded" });
    await pa.evaluate((t) => localStorage.setItem("app.auth.token.v1", t), TK);
    await boot(pa);
    await pa.waitForTimeout(2500);
    await pa.evaluate(() => window.__vqSet.set("display.accent", "rose"));
    await pa.waitForTimeout(500);
    const pushed = await pa.evaluate(() => window.__vqSet.flush().then(() => true));
    ok("端末 A が送れる", pushed === true);

    const c = await b.newContext({ viewport: { width: 1280, height: 900 } });
    const pc = await c.newPage();
    await pc.goto(BASE + "/?vqdev=1&cb=" + Date.now(), { waitUntil: "domcontentloaded" });
    await pc.evaluate((t) => localStorage.setItem("app.auth.token.v1", t), TK);
    await boot(pc);
    await pc.waitForTimeout(3000);
    ok("端末 B に届く", (await cssvar(pc, "--vq-accent")).toLowerCase() === "#b75d77", await cssvar(pc, "--vq-accent"));
    ok("端末 B の同期表示が「そろっている」", /そろって/.test(await pc.evaluate(() => window.__vqSet.syncLabel())),
      await pc.evaluate(() => window.__vqSet.syncLabel()));

    /* 別々の鍵をいじっても片方が消えない */
    await pa.evaluate(() => window.__vqSet.set("display.radius", "round"));
    await pc.evaluate(() => window.__vqSet.set("a11y.underlineLinks", true));
    await pa.waitForTimeout(1500); await pc.waitForTimeout(1500);
    await pa.evaluate(() => window.__vqSet.sync());
    await pa.waitForTimeout(1500);
    const both = await pa.evaluate(() => ({
      radius: window.__vqSet.get("display.radius"),
      underline: window.__vqSet.get("a11y.underlineLinks"),
      accent: window.__vqSet.get("display.accent")
    }));
    ok("2 台で別々にいじっても両方残る",
      both.radius === "round" && both.underline === true && both.accent === "rose", JSON.stringify(both));

    await pa.evaluate(() => window.__vqSet.set("data.sync", false));
    await pa.waitForTimeout(400);
    ok("同期を切ると表示も変わる", /しない設定/.test(await pa.evaluate(() => window.__vqSet.syncLabel())),
      await pa.evaluate(() => window.__vqSet.syncLabel()));
    await pa.evaluate(() => window.__vqSet.set("data.sync", true));
  }

  await b.close();
  console.log("\n合格 " + pass + " / 不合格 " + fail);
  process.exit(fail ? 1 : 0);
})();
