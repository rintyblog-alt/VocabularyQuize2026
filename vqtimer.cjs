/* ══════════════════════════════════════════════════════════════════════════
   vqtimer.cjs — タイマー（2026-08-14）

   依頼:
     ・左パネルにタイマーの欄／タイマーの画面
     ・ストップウォッチ と 通常のタイマー
     ・ノーマル … モバイルは上・PC は右上に常時表示（設定があればそちら優先）
     ・集中モード … 画面に出さない（気が散ると言われているため）。
       時間が来るまで数字を見せない
     ・見た目 6 種類（1: 時計 2: 砂時計 3 以降は考える）

   ここで守りたいこと:
     ★ **タブが眠っても時間が飛ばない**（残り秒を毎秒引かない）
     ★ 数える場所は 1 つ（画面と帯で別々に数えない）
     ★ 集中モードは出さない。ただし **終わったら知らせる**
   ══════════════════════════════════════════════════════════════════════════ */
const fs = require("fs");
const path = require("path");

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (detail ? "  → " + detail : "")); }
};
const INDEX = require("./vqsrc.cjs").丸ごと();

/* 本体を実際に動かす（字面の確認では足りない）。 */
const T = (function () {
  const a = INDEX.indexOf("/* ───────── domain/timer.js ───────── */");
  const b = INDEX.indexOf("/* ───────── ui/timer.js ───────── */");
  const store = {};
  const g = { localStorage: { getItem: (k) => (k in store ? store[k] : null),
                              setItem: (k, v) => { store[k] = String(v); } } };
  new Function("globalThis", "with(globalThis){" + INDEX.slice(a, b) + "}").call(g, g);
  return g.VQ2.timer;
})();

const T0 = 1700000000000;

console.log("\n① 数えかた（タブが眠っても飛ばない）");
{
  ok("本体を読み込めた", !!(T && T.start && T.leftMs));
  let s = T.setTotal(T.blank(), 60000, T0);
  s = T.start(s, T0);
  ok("開始直後は 1:00", T.fmt(T.leftMs(s, T0)) === "1:00", T.fmt(T.leftMs(s, T0)));
  ok("30 秒後は 0:30", T.fmt(T.leftMs(s, T0 + 30000)) === "0:30", T.fmt(T.leftMs(s, T0 + 30000)));
  /* ★ ここが芯。残り秒を毎秒引く持ち方だと、眠っている間ぶんが抜ける。 */
  ok("★ 5 分眠っても 0:00（時間が飛ばない）",
    T.fmt(T.leftMs(s, T0 + 300000)) === "0:00", T.fmt(T.leftMs(s, T0 + 300000)));
  ok("終わりを見分けられる", T.isOver(s, T0 + 60001) === true);
  ok("　途中では終わっていない", T.isOver(s, T0 + 30000) === false);
  /* 終わる時刻で持っていること（実装の確認） */
  ok("★ 終わる時刻で持っている（毎秒引いていない）",
    /return Math\.max\(0, s\.endAt - t\);/.test(INDEX));
}

console.log("\n② 止める・戻す・決め直す");
{
  let s = T.setTotal(T.blank(), 60000, T0);
  s = T.start(s, T0);
  s = T.pause(s, T0 + 20000);
  ok("20 秒で止めたら 残り 0:40", T.fmt(T.leftMs(s, T0 + 20000)) === "0:40", T.fmt(T.leftMs(s, T0 + 20000)));
  ok("★ 止めている間は進まない",
    T.fmt(T.leftMs(s, T0 + 999999)) === "0:40", T.fmt(T.leftMs(s, T0 + 999999)));
  s = T.start(s, T0 + 999999);
  ok("再開して 10 秒後は 0:30",
    T.fmt(T.leftMs(s, T0 + 1009999)) === "0:30", T.fmt(T.leftMs(s, T0 + 1009999)));
  s = T.reset(s);
  ok("戻すと決めた長さに戻る", T.fmt(T.leftMs(s, T0)) === "1:00", T.fmt(T.leftMs(s, T0)));
  ok("　戻すと止まる", s.running === false);
  /* 0 のまま押しても何も起きない、を避ける */
  let z = T.setTotal(T.blank(), 60000, T0);
  z = T.start(z, T0); z = T.pause(z, T0 + 60000);
  z = T.start(z, T0 + 60000);
  ok("★ 残り 0 で押したら 決めた長さから始め直す",
    T.fmt(T.leftMs(z, T0 + 60000)) === "1:00", T.fmt(T.leftMs(z, T0 + 60000)));
}

console.log("\n③ ストップウォッチ");
{
  let s = T.setKind(T.blank(), "stopwatch");
  ok("種類が変わる", s.kind === "stopwatch");
  ok("　0 から始まる", T.fmt(T.leftMs(s, T0)) === "0:00", T.fmt(T.leftMs(s, T0)));
  s = T.start(s, T0);
  ok("90 秒後は 1:30", T.fmt(T.leftMs(s, T0 + 90000)) === "1:30", T.fmt(T.leftMs(s, T0 + 90000)));
  ok("1 時間を超えたら 時も出す",
    T.fmt(T.leftMs(s, T0 + 3661000)) === "1:01:01", T.fmt(T.leftMs(s, T0 + 3661000)));
  s = T.pause(s, T0 + 90000);
  s = T.start(s, T0 + 500000);
  ok("★ 止めた続きから増える",
    T.fmt(T.leftMs(s, T0 + 530000)) === "2:00", T.fmt(T.leftMs(s, T0 + 530000)));
  ok("★ 増える側は終わらない", T.isOver(s, T0 + 9999999) === false);
}

console.log("\n④ ノーマルと集中モード");
{
  let s = T.setTotal(T.blank(), 60000, T0);
  s = T.start(s, T0);
  s = T.setMode(s, "normal");
  ok("ノーマルは すみに出す", T.showsOverlay(s) === true);
  s = T.setMode(s, "focus");
  ok("★ 集中モードは 出さない", T.showsOverlay(s) === false);
  ok("★ 出さないだけで 裏では動いている", s.running === true
    && T.fmt(T.leftMs(s, T0 + 30000)) === "0:30");
  ok("★ 終わったときは 知らせる（見せないと気づけない）",
    T.showsFinish(s, T0 + 60001) === true);
  ok("　途中では知らせない", T.showsFinish(s, T0 + 30000) === false);
  ok("止めていれば ノーマルでも出さない",
    T.showsOverlay(T.pause(T.setMode(s, "normal"), T0 + 10000)) === false);
  /* 画面側でも数字を隠していること */
  ok("★ 画面でも 集中中は数字を見せない",
    /if \(s\.mode === "focus" && s\.running && !T\.showsFinish\(s\)\)/.test(INDEX));
  ok("　理由を画面に書いてある", /気が散る元になると言われているためです/.test(INDEX));
}

console.log("\n⑤ 出す場所（設定があればそちら優先）");
{
  ok("場所を 5 つ持っている", T.SPOTS.length === 5, T.SPOTS.length + "個");
  ok("　おまかせがある", T.SPOTS.some((x) => x.id === "auto"));
  /* ★ 依頼のとおり: モバイルは上・PC は右上。設定があればそちらが勝つ。 */
  ok("★ おまかせは スマホ=上 / PC=右上",
    /return U\.isMobile\(\) \? "top" : "topRight";/.test(INDEX));
  ok("★ 設定していれば そちらを優先",
    /if \(s\.spot && s\.spot !== "auto"\) return s\.spot;/.test(INDEX));
  ["top", "topRight", "topLeft", "bottomRight"].forEach((id) => {
    ok("　置き場所の見た目がある: " + id, new RegExp("#vq2-timer-bar\\.at-" + id + "\\{").test(INDEX));
  });
  ok("　iPhone の切り欠きを避けている", /env\(safe-area-inset-top,0px\)/.test(INDEX));
}

console.log("\n⑥ 見た目 6 種類");
{
  ok("6 種類ある", T.FACES.length === 6, T.FACES.length + "種");
  ok("　同じ id が無い", new Set(T.FACES.map((f) => f.id)).size === 6);
  ok("1 つ目は 時計", T.FACES[0].id === "digital" && T.FACES[0].name === "時計");
  ok("2 つ目は 砂時計", T.FACES[1].id === "sand" && T.FACES[1].name === "砂時計");
  ["ring", "bar", "candle", "dots"].forEach((id) => {
    ok("　3 つ目以降: " + id, T.FACES.some((f) => f.id === id));
  });
  /* 画面が 6 種類ぜんぶ描けること */
  T.FACES.forEach((f) => {
    ok("　描き分けがある: " + f.name,
      f.id === "digital" ? /vq2-tf-digital/.test(INDEX)
        : new RegExp('id === "' + f.id + '"').test(INDEX));
  });
  ok("★ 種類は 本体が唯一の出どころ（画面へ書き写していない）",
    /T\.FACES\.map\(function \(f\)/.test(INDEX));
  ok("　どれも同じ値から描く（残りと進み具合）",
    /var ms = T\.leftMs\(s\), p = T\.progress\(s\), txt = T\.fmt\(ms\);/.test(INDEX));
  /* 進み具合が 0〜1 に収まること */
  let s = T.setTotal(T.blank(), 60000, T0); s = T.start(s, T0);
  ok("進み具合は 0 から 1",
    T.progress(s, T0) === 0 && Math.abs(T.progress(s, T0 + 30000) - 0.5) < 0.01
    && T.progress(s, T0 + 99999) === 1);
}

console.log("\n⑦ 押せること（レイアウト）");
{
  /* ★ 実測 2026-08-14: どのボタンも押せなかった。
     paint() が **画面ぜんぶを 250ms ごとに作り直していた**ので、
     押した瞬間にボタンが消えてクリックが成立しなかった。 */
  ok("★ 画面ぜんぶを毎秒 作り直していない",
    !/setInterval\(paint, TICK\)/.test(INDEX));
  ok("★ 時計の面だけを書き換える", /setInterval\(refresh, TICK\)/.test(INDEX)
    && /stage\.innerHTML = viewHtml\(s\);/.test(INDEX));
  /* stage に入るのは viewHtml の中身だけ。**そこにボタンが無い**ことを、
     組み立てている関数の中身で見る（CSS の並びから数えると誤判定する）。 */
  ok("　ボタンのある所は触らない（stage の中にボタンが無い）", (function () {
    const i = INDEX.indexOf("    function viewHtml(s) {");
    const j = INDEX.indexOf("    function minsHtml(s) {");
    if (i < 0 || j < i) return false;
    const body = INDEX.slice(i, j);
    return body.indexOf("data-act=") < 0 && body.indexOf("<button") < 0;
  })());
  ok("　押して状態が変わったときだけ 全部を描き直す",
    /if \(main && \(\(main\.getAttribute\("data-act"\) === "pause"\) !== run\)\) paint\(\);/.test(INDEX));

  /* 並び: 時計が主役・操作は下端 */
  ok("★ 時計が残りぜんぶを使う", /\.vq2-tstage\{flex:1 1 auto/.test(INDEX));
  ok("★ 操作は下端に固定（縮まない）", /\.vq2-tfoot\{flex:0 0 auto/.test(INDEX));
  ok("　主ボタンが大きい（54px）", /\.vq2-tmain\{flex:1 1 auto[\s\S]{0,200}height:54px/.test(INDEX));
  ok("　iPhone の下端を避けている",
    /padding:var\(--vq-sp-4,12px\) 0 calc\(var\(--vq-sp-5,16px\) \+ env\(safe-area-inset-bottom,0px\)\)/.test(INDEX));
  ok("★ 高さ 100% を使っていない（flex の中で潰れる）",
    !/\.vq2-tw\{[^}]*height:100%/.test(INDEX));
  ok("　長さは横に流す（格子にして操作を押し出さない）",
    /\.vq2-tmins\{display:flex;gap:8px;overflow-x:auto/.test(INDEX));

  /* 設定は隠す */
  /* 面は 3 つになった（時計 / 設定 / 長さを決める）。
     どれも **時計とは別の面**であることを見る（時計を押し下げない）。 */
  ok("★ 設定は別の面（時計を押し下げない）", /function setPaneHtml\(s\)/.test(INDEX)
    && /pane === "set" \? setPaneHtml\(s\)/.test(INDEX)
    && /clockPaneHtml\(s\)/.test(INDEX));
  ok("★ 長さを決める面も別（2026-08-15）", /function customPaneHtml\(s\)/.test(INDEX)
    && /pane === "custom" \? customPaneHtml\(s\)/.test(INDEX));
  /* 属性は変数から作るので、生の data-cust="h" は本文に出ない。
     **3 つの欄を作っている所**と、決めたときの読み取りを見る。 */
  ok("★ 時・分・秒で自由に決められる",
    /fld\("h", "時間", hh, 23\)/.test(INDEX)
    && /fld\("m", "分", mm, 59\)/.test(INDEX)
    && /fld\("s", "秒", ss, 59\)/.test(INDEX)
    && /data-act="cust-apply"/.test(INDEX)
    && /get\("h"\) \* 3600 \+ get\("m"\) \* 60 \+ get\("s"\)/.test(INDEX));
  ok("　よく使う長さがある（30秒・7分・2時間など）",
    /data-cust-quick=/.test(INDEX) && /1分30秒/.test(INDEX) && /2時間/.test(INDEX));
  ok("★ ストップウォッチは 数字だけ（輪や砂を減らさない）",
    /if \(s\.kind === "stopwatch"\) return faceHtml\(s, "digital"\);/.test(INDEX));
  ok("★ 設定に 見本がある（選ぶ前に見え方が分かる）",
    /vq2-tprev/.test(INDEX) && /半分まで進んだところ/.test(INDEX));
  ok("　設定を開く・戻るボタンがある", /data-act="pane-set"/.test(INDEX)
    && /data-act="pane-clock"/.test(INDEX));
  ok("　設定の面では時計を書き換えない", /if \(pane !== "clock"\) return;/.test(INDEX));
  ok("動かしている間は 種類を変えさせない",
    /\(s\.running \? " disabled" : ""\)/.test(INDEX));
  /* 使っているアイコンが実在すること（無い名前だと絵が出ない） */
  const ICONS = (function () {
    const m = INDEX.match(/var ICONS\s*=\s*\{/);
    const seg = INDEX.slice(m.index, m.index + 9000);
    return new Set([...seg.matchAll(/(?:^|\s|,)([a-zA-Z0-9_]+)\s*:\s*[\x27"`]/g)].map((x) => x[1]));
  })();
  ["clock", "play", "pause", "refresh", "settings", "check", "chevronL"].forEach((n) => {
    ok("　アイコンが実在する: " + n, ICONS.has(n));
  });
}

console.log("\n⑧ 保存と作り");
{
  ok("開き直しても続く（保存している）", /root\.localStorage\.setItem\(KEY/.test(INDEX));
  ok("　おかしな値でも落ちない", (() => {
    const bad = T.read.call(null);
    return !!bad && typeof bad.kind === "string";
  })());
  /* ══ ★ ここを間違えて 1 回空振りした（2026-08-14）════════════════
     見えている左パネルは **#vqShell（Shadow DOM の新しいもの）**で、
     NAV_MAIN / NAV_TOOLS という **JS の一覧から作られる**。
     旧サイドバー（#appV2PrimaryNav）はデスクトップで visibility:hidden。
     旧側の HTML にボタンを足しても **画面には出ない**。 */
  /* ★ 一覧の 形が 変わった（key / path / section / order が 付いた）。
     見たいのは **タイマーが 見えている一覧に あること**なので、
     形ではなく 中身で 見る（2026-08-28）。 */
  ok("★ 見えているサイドバー（vq-shell）の一覧に入っている",
    /key: "timer", label: "タイマー", icon: "timer", path: "fn:timer"/.test(INDEX));
  ok("　押したら開く結線がある", /el\.dataset\.fn === "timer"/.test(INDEX));
  ok("　アイコンが定義されている", /\n    timer: '<circle cx="12" cy="13" r="8"\/>/.test(INDEX));
  ok("　スマホは引き出しを閉じてから開く",
    /closeDrawer\(\);\n        try \{ if \(window\.VQ2 && window\.VQ2\.timerUi\)/.test(INDEX));
  ok("旧サイドバーにも置いてある（どちらから押しても同じ）",
    /data-vq-open="timer"/.test(INDEX));
  ok("★ 画面を切り替えず 重ねて開く（勉強を中断させない）",
    /画面を切り替えない\*\*（重ねて開く）/.test(INDEX));
  ok("帯は本体の DOM へ置く（画面を閉じても残す）",
    /doc\.body\.appendChild\(barEl\);/.test(INDEX));
  ok("★ 帯は呼ばれるたびに正しい姿にする（出ている/いないを別に覚えない）",
    /if \(!show\) \{ removeBar\(\); return; \}/.test(INDEX));
  ok("見た目の CSS は mount で渡している（SHELL_CSS を触らない）",
    /css: UI_CSS,/.test(INDEX) && !/var SHELL_CSS = "[^"]*vq2-tf-sand/.test(INDEX));
  ok("動きを止める設定を尊重している", /prefers-reduced-motion:no-preference/.test(INDEX));
}

/* ══════════════════════════════════════════════════════════════════════
   ★ 実際に開いて押す（2026-08-14 に足した）

   字面の確認だけでは **「押せない」を見逃す**。実際に起きたこと:
     ・app.onClose(fn) を呼んでいた（mount の返り値にそんなものは無い）
       → 画面を開いた瞬間に例外で止まり、**どのボタンも押せなかった**
     ・字面のテストは全部通っていた
   だから、ここで本当に開いて、本当に押す。
   （--no-ui を付けると飛ばせる。ブラウザが無い環境むけ） ══════════════ */
async function runUi() {
  const UI = process.env.VQ_UI || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
  if (!/127\.0\.0\.1|localhost|-dev\./.test(UI)) { console.error("本番では実行しません。"); process.exit(2); }
  console.log("\n⑨ 実際に開いて押す（" + UI + "）");
  let br = null;
  try {
    const { chromium } = require("playwright");
    br = await chromium.launch();
    const pg = await br.newPage({ viewport: { width: 1280, height: 900 } });
    const errs = [];
    pg.on("pageerror", (e) => errs.push(String(e.message).slice(0, 160)));
    await pg.goto(UI, { waitUntil: "domcontentloaded", timeout: 60000 });
    await pg.waitForFunction(() => window.VQ2 && VQ2.timerUi && VQ2.timer, null, { timeout: 60000 });
    ok("部品が読み込めている", true);

    ok("★ 見えているサイドバーに 欄が出ている", await pg.evaluate(() => {
      const h = document.getElementById("vqShell");
      return !!(h && h.shadowRoot && h.shadowRoot.querySelector('[data-fn="timer"]'));
    }));

    /* ★ 開くところで落ちないこと。ここで落ちると全部が死ぬ。 */
    let openErr = "";
    try { await pg.evaluate(() => VQ2.timerUi.open()); }
    catch (e) { openErr = String(e.message).slice(0, 120); }
    ok("★ 開いても落ちない", !openErr, openErr);
    await pg.waitForTimeout(500);

    const box = await pg.evaluate(() => {
      const h = document.getElementById("vq2-timer");
      if (!h || !h.shadowRoot) return null;
      const b = h.shadowRoot.querySelector(".vq2-tmain");
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height),
               x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    });
    ok("主ボタンが画面に出ている", !!box, JSON.stringify(box));
    ok("　押せる大きさがある（44px 以上）", !!box && box.h >= 44, box ? box.h + "px" : "-");
    /* ★ その座標に本当に主ボタンがあるか（何かが上に被っていないか） */
    ok("★ 何かに覆われていない", await pg.evaluate(() => {
      const r = document.getElementById("vq2-timer").shadowRoot;
      const b = r.querySelector(".vq2-tmain");
      const x = b.getBoundingClientRect();
      const el = r.elementFromPoint(x.left + x.width / 2, x.top + x.height / 2);
      return !!(el && el.closest && el.closest(".vq2-tmain"));
    }));

    /* ★★ 本物のマウスで押して、状態が変わること。ここが芯。 */
    const s1 = await pg.evaluate(() => VQ2.timer.read().running);
    await pg.mouse.click(box.x, box.y);
    await pg.waitForTimeout(400);
    const s2 = await pg.evaluate(() => VQ2.timer.read().running);
    ok("★★ 本物のマウスで押すと 動き出す", s1 === false && s2 === true, s1 + " → " + s2);
    await pg.mouse.click(box.x, box.y);
    await pg.waitForTimeout(400);
    const s3 = await pg.evaluate(() => VQ2.timer.read().running);
    ok("★★ もう一度押すと 止まる", s3 === false, String(s3));

    /* 設定の面へ行って戻れること */
    ok("設定の面を開ける", await pg.evaluate(async () => {
      const r = document.getElementById("vq2-timer").shadowRoot;
      const g = r.querySelector('[data-act="pane-set"]');
      if (!g) return false;
      g.click();
      await new Promise((x) => setTimeout(x, 200));
      return !!r.querySelector('[data-face]');
    }));
    ok("　見た目を選べる", await pg.evaluate(async () => {
      const r = document.getElementById("vq2-timer").shadowRoot;
      const b = r.querySelector('[data-face="sand"]');
      if (!b) return false;
      b.click();
      await new Promise((x) => setTimeout(x, 200));
      return VQ2.timer.read().face === "sand";
    }));
    ok("　時計へ戻れる", await pg.evaluate(async () => {
      const r = document.getElementById("vq2-timer").shadowRoot;
      const b = r.querySelector('[data-act="pane-clock"]');
      if (!b) return false;
      b.click();
      await new Promise((x) => setTimeout(x, 200));
      return !!r.querySelector(".vq2-tstage");
    }));
    ok("画面のエラーが出ていない", errs.length === 0, errs.slice(0, 2).join(" / "));
  } catch (e) {
    fail++; console.log("  ✗ 実際に動かす — " + String(e && e.message).slice(0, 160));
  }
  if (br) await br.close();
}

(async function () {
  if (process.argv.indexOf("--no-ui") < 0) await runUi();
  console.log("\n" + (fail === 0 ? "✅ 全部通りました" : "❌ 落ちています") + "  通過 " + pass + " / 失敗 " + fail);
  process.exit(fail === 0 ? 0 : 1);
})();
