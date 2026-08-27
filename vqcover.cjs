/* ══════════════════════════════════════════════════════════════════════
   プリセットの表紙（名前・アイコン・バナー）を AI に作らせる

   これまで、AI で作ったプリセットは「新しいプリセット」のまま、
   絵もアイコンも無しで一覧に並んでいた。どれがどれだか分からない。

   決めるのは 3 つ。
     名前     … 日本語で短く（AI が考える）
     アイコン … **画面が持っている一覧から選ぶ**。新しい絵文字は作らせない
     バナー   … 画像生成（FLUX.2 klein・1024×384）。縮めるのは画面側

   ここで見るのは 3 つ。
     ・サーバが 3 つとも返す（実際に呼ぶ。作り話をしない）
     ・アイコンが **必ず一覧の中**にある
     ・人が決めた名前・アイコン・バナーを **上書きしない**

   使い方: node vqcover.cjs            （サーバ・画面の両方）
           node vqcover.cjs --no-ai    （実際に AI を呼ばない部分だけ）
   ══════════════════════════════════════════════════════════════════════ */
const fs = require("fs");
const path = require("path");
const API = process.env.VQ_API || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
const UI = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/-dev\.|127\.0\.0\.1|localhost/.test(API)) { console.error("本番では実行しません。"); process.exit(2); }
if (!/-dev\.|127\.0\.0\.1|localhost/.test(UI)) { console.error("本番では実行しません。"); process.exit(2); }

/* ★ 2026-08-19: index.html を 外へ 切り出したので、丸ごとには もう入っていない。
   アイコンの一覧は vq2-app にある。**塊で 取る。** */
const VQSRC = require("./vqsrc.cjs");
/* ★ 丸ごと() は **圧縮前（js-src）**を 返すように なった（2026-08-28）。
   前は 圧縮ずみを 返していたので、読める中身が 欲しくて 塊("vq2-app") を
   足していた。いまは 二重に なる（数を 見る検査が 2 倍に 数える）。
   実際 fillCover( が 2 か所なのに **4 と 出て** 落ちた。足さない。 */
const INDEX = VQSRC.丸ごと();
const WORKER = fs.readFileSync(path.join(__dirname, "server", "src", "worker.js"), "utf8");

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => {
  c ? (pass++, console.log("  ok   " + n))
    : (fail++, bad.push(n), console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 260) : "")));
};
const section = (t) => console.log("\n══ " + t + " ══");

/* 画面が持っているアイコンの一覧。**テスト側で書き写さない。**
   絵文字をやめて Material Symbols の名前にした（2026-08-12）。 */
function iconsFromIndex() {
  const a = INDEX.indexOf("var PRESET_ICONS = [");
  const b = INDEX.indexOf("\n  ];", a);
  if (a < 0 || b < 0) throw new Error("アイコンの一覧が見つかりません");
  const blk = INDEX.slice(a, b);
  const rows = [...blk.matchAll(/\{ g: "([^"]+)", n: "([a-z0-9_]+)", l: "([^"]+)", k: "([^"]+)" \}/g)];
  return { names: rows.map((r) => r[2]), rows: rows.map((r) => ({ g: r[1], n: r[2], l: r[3], k: r[4] })) };
}
const ICON_SET = iconsFromIndex();
const ICONS = ICON_SET.names;

/* サーバの寄せ先・名前の掃除だけを取り出して動かす（AI は呼ばない）。 */
function serverBits() {
  const s = WORKER.indexOf("const COVER_ICON_HINTS = [");
  const e = WORKER.indexOf("async function handleAigenCover");
  if (s < 0 || e < 0 || e <= s) throw new Error("表紙の部品が見つかりません");
  return new Function(WORKER.slice(s, e)
    + "\nreturn { pick: coverPickIcon, clean: coverCleanName };")();
}
const S = serverBits();

/* 画面側の「入れるかどうか」の判定だけを取り出す。 */
function clientCover() {
  const s = INDEX.indexOf("  var COVER = (function () {");
  const e = INDEX.indexOf("  /* ══════════════════════════════════════════════════════════════════════\n     書き出し（印刷・PDF");
  if (s < 0 || e < 0 || e <= s) throw new Error("画面側の表紙の部品が見つかりません");
  return new Function("root", INDEX.slice(s, e) + "\nreturn COVER;")({ atob: () => "", Uint8Array, Blob: function () {} });
}
const C = clientCover();

/* ── 1) 入れるかどうかの判定（人が決めたものを上書きしない）────── */
section("入れるかどうか（人が決めたものは触らない）");
{
  const fresh = { name: "新しいプリセット", appearance: {} };
  const n1 = C.needs(fresh);
  ok("★何も無いプリセットは 3 つとも入れる", n1.name && n1.icon && n1.banner, n1);

  ok("★名前を付けてあれば名前は入れない",
    C.needs({ name: "保健 小テスト", appearance: {} }).name === false);
  ok("★アイコンを選んであればアイコンは入れない",
    C.needs({ name: "", appearance: { icon: "🧪" } }).icon === false);
  ok("★アイコンに画像を入れてあれば触らない",
    C.needs({ name: "", appearance: { iconImage: "data:image/png;base64,x" } }).icon === false);
  ok("★バナーを入れてあればバナーは入れない",
    C.needs({ name: "", appearance: { banner: "data:image/jpeg;base64,x" } }).banner === false);
  ok("名前が空でも入れる（既定名と同じ扱い）", C.needs({ name: "   ", appearance: {} }).name === true);
}
{
  const p = { name: "新しいプリセット", appearance: {} };
  const got = C.merge(p, { name: "感染症の基本", icon: "🩺" });
  ok("★名前とアイコンが入る", p.name === "感染症の基本" && p.appearance.icon === "🩺",
    { name: p.name, icon: p.appearance.icon });
  ok("入れたものを返す", got.length === 2 && /感染症の基本/.test(got[0]), got);
}
{
  const p = { name: "自分で付けた名前", appearance: { icon: "🧪" } };
  C.merge(p, { name: "AI の名前", icon: "📘" });
  ok("★人が決めた名前とアイコンは上書きしない",
    p.name === "自分で付けた名前" && p.appearance.icon === "🧪", p);
}
{
  const p = { name: "新しいプリセット", appearance: {} };
  const got = C.merge(p, { name: "", icon: "" });
  ok("★空で返ってきたら何も入れない（作り話をしない）",
    got.length === 0 && p.name === "新しいプリセット", { got, name: p.name });
}

/* ── 2) サーバ側の寄せ先と名前の掃除 ──────────────────────────── */
section("アイコンの一覧（絵文字ではなく Material Symbols）");
ok("★絵文字を持っていない",
  ICON_SET.rows.every((r) => /^[a-z0-9_]+$/.test(r.n)),
  ICON_SET.rows.filter((r) => !/^[a-z0-9_]+$/.test(r.n)).slice(0, 3));
ok("★以前（22 個）よりずっと多い", ICONS.length >= 120, ICONS.length);
ok("同じ名前が 2 つ入っていない",
  new Set(ICONS).size === ICONS.length,
  ICONS.filter((x, i) => ICONS.indexOf(x) !== i));
ok("どれにも日本語の呼び名と手がかりが付いている",
  ICON_SET.rows.every((r) => r.l && r.k && r.g), ICON_SET.rows.filter((r) => !r.l || !r.k).slice(0, 3));
console.log("   " + ICONS.length + " 種類 / "
  + [...new Set(ICON_SET.rows.map((r) => r.g))].join("・"));

section("一覧に無いアイコンが返ったとき");
ok("★英語なら翻訳のアイコンへ寄せる", S.pick(ICONS, "英語 単語 20問") === "translate", S.pick(ICONS, "英語 単語 20問"));
ok("理科なら実験のアイコン", S.pick(ICONS, "中学理科 化学反応") === "science", S.pick(ICONS, "中学理科 化学反応"));
ok("保健なら保健のアイコン", S.pick(ICONS, "高校保健 感染症の予防") === "health_and_safety", S.pick(ICONS, "高校保健 感染症の予防"));
ok("数学なら計算", S.pick(ICONS, "数学Ⅰ 二次関数") === "calculate", S.pick(ICONS, "数学Ⅰ 二次関数"));
ok("歴史なら議事堂", S.pick(ICONS, "日本史 江戸幕府") === "account_balance", S.pick(ICONS, "日本史 江戸幕府"));
ok("音楽なら音符", S.pick(ICONS, "音楽 和音") === "music_note", S.pick(ICONS, "音楽 和音"));
ok("★寄せ先が分からなくても、必ず一覧の中から返す",
  ICONS.indexOf(S.pick(ICONS, "ぬるぽ")) >= 0, S.pick(ICONS, "ぬるぽ"));
ok("一覧が空なら空で返す（勝手に作らない）", S.pick([], "英語") === "");
/* 寄せ先の名前が一覧から外れていると、黙って「一覧の 1 個目」になる。
   気づけないので、ここで必ず突き合わせる。 */
const HINT_TARGETS = (() => {
  const a = WORKER.indexOf("const COVER_ICON_HINTS = [");
  const b = WORKER.indexOf("];", a);
  return [...WORKER.slice(a, b).matchAll(/, "([a-z0-9_]+)"\]/g)].map((m) => m[1]);
})();
ok("★寄せ先はすべて一覧の中にある",
  HINT_TARGETS.length > 10 && HINT_TARGETS.every((t) => ICONS.indexOf(t) >= 0),
  HINT_TARGETS.filter((t) => ICONS.indexOf(t) < 0));

section("名前の掃除");
ok('★かぎかっこを外す', S.clean("「感染症の基本」") === "感染症の基本", S.clean("「感染症の基本」"));
ok("引用符を外す", S.clean('"English Vocab"') === "English Vocab", S.clean('"English Vocab"'));
ok("★「〜のプリセット」を外す", S.clean("光合成のプリセット") === "光合成", S.clean("光合成のプリセット"));
ok("改行を潰す", S.clean("保健\nテスト") === "保健 テスト", S.clean("保健\nテスト"));
ok("30 字で切る", S.clean("あ".repeat(50)).length === 30);
/* 実測 2026-08-12: llama-3.3-70b が「高校保健問題집」と 1 文字だけ混ぜてきた。 */
ok("★ハングルが混ざっても落とす", S.clean("高校保健問題집") === "高校保健問題", S.clean("高校保健問題집"));
ok("日本語と英数字は残す", S.clean("英語 Unit 3 の確認") === "英語 Unit 3 の確認", S.clean("英語 Unit 3 の確認"));

/* ── 3) 画面のつなぎ ─────────────────────────────────────────── */
section("画面のつなぎ（source を読む）");
ok("生成し終えたところで名前とアイコンを付けている", /fillCover\(instruction, finalList\)/.test(INDEX));
ok("★問題を出すのを待たせていない（finishAi の前に投げるだけ）",
  INDEX.indexOf("fillCover(instruction, finalList);") < INDEX.indexOf('finishAi(finalList, "generate");'));
/* ══ 絵は 1 枚ごとに費用がかかる。**黙って作らない。** ══════════════
   自動生成の道から banner: true が出ていないことを、ここで必ず止める。 */
ok("★自動生成では絵を作らない（費用が黙って出ない）",
  (() => {
    const a = INDEX.indexOf("function fillCover(");
    const b = INDEX.indexOf("\n    function normalizeAppearance(", a);
    const blk = INDEX.slice(a, b);
    return /banner: false/.test(blk) && !/banner: true/.test(blk) && !/shrinkImage/.test(blk);
  })());
ok("★バナーは押したときだけ作る", /function makeBanner\(\)/.test(INDEX)
  && /'\[data-act="ai-banner"\]', function \(\) \{ makeBanner\(\); \}/.test(INDEX));
ok("「AI で作る」のボタンがある", /action: "ai-banner"/.test(INDEX));
ok("★作っている間は押せない", /disabled: !!draft\.bannerBusy/.test(INDEX));
ok("★できた絵は下書きに入る（やめれば残らない）",
  /draft\.appearance\.banner = res\.dataUrl;/.test(INDEX));
ok("アイコンの一覧を画面から渡している",
  /icons: PRESET_ICONS\.map\(function \(x\) \{ return x\.n; \}\)/.test(INDEX));
ok("★バナーは端末内で縮めてから入れている", /shrinkImage\(blob, "banner"\)/.test(INDEX));
ok("★アイコンは絵ではなく名前で選ばせている（data-emoji をやめた）",
  !/data-emoji/.test(INDEX) && /data-icon="/.test(INDEX),
  { 旧: /data-emoji/.test(INDEX), 新: /data-icon="/.test(INDEX) });
ok("探す欄が付いている", /data-act="icon-q"/.test(INDEX));
ok("★探している途中で全体を描き直さない（指が離れない）",
  /g\.innerHTML = iconGridHtml\(\);/.test(INDEX) && !/draft\.iconQuery = t\.value;\s*draw\(\)/.test(INDEX));
ok("★古い絵文字のプリセットも出る（3 文字以上なら名前、1〜2 文字は絵文字）",
  /a\.icon && a\.icon\.length > 2/.test(INDEX));
ok("直しのときは表紙を作らない（生成の完了だけに付けている）",
  (INDEX.match(/fillCover\(/g) || []).length === 2, (INDEX.match(/fillCover\(/g) || []).length);
ok("サーバの口が登録されている", /path === "\/api\/aigen\/cover"/.test(WORKER));
ok("使う画像モデルが FLUX.2 klein", /@cf\/black-forest-labs\/flux-2-klein-4b/.test(WORKER));
ok("★バナーの形（横長）で頼んでいる",
  /COVER_IMAGE_W = 1024/.test(WORKER) && /COVER_IMAGE_H = 384/.test(WORKER));
ok("★絵に文字・人物・ロゴを描かせない条件を必ず足している",
  /no text, no letters/.test(WORKER) && /no people, no faces/.test(WORKER));

/* ── 4) 実際に呼ぶ ──────────────────────────────────────────── */
if (process.argv.indexOf("--no-ai") >= 0) { finish(); }
else { runApi().then(runUi).then(finish).catch((e) => {
  fail++; bad.push("実際に呼ぶ");
  console.log("\n  NG   実際に呼ぶ — " + (e && e.message ? e.message : e));
  finish();
}); }

async function api(method, p, body, token) {
  const h = { "Content-Type": "application/json" };
  if (token) h.Authorization = "Bearer " + token;
  const r = await fetch(API + p, { method, headers: h,
    body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text();
  let d = null; try { d = t ? JSON.parse(t) : null; } catch (e) { d = { raw: t.slice(0, 200) }; }
  return { status: r.status, data: d || {} };
}

async function devToken() {
  const nick = "cov" + Date.now().toString(36).slice(-6);
  const reg = await api("POST", "/api/auth/register",
    { gradePrefix: "H1", nickname: nick, password: "DevCov#2026a", tosAccepted: true, tosVersion: "1" });
  if (reg.data.token) return reg.data.token;
  const a = await api("POST", "/api/auth/register/start",
    { email: nick + "@gmail.com", gradePrefix: "H1", nickname: nick, password: "DevCov#2026a" });
  const b = await api("POST", "/api/auth/register/verify",
    { challengeId: a.data.challengeId, code: a.data.devCode });
  const c = await api("POST", "/api/auth/register/consent",
    { registrationSession: b.data.registrationSession, agreeTerms: true,
      agreePrivacy: true, agreeAge: true, pin: "8306" });
  if (!c.data.token) throw new Error("検証アカウントを作れません: " + JSON.stringify(reg.data).slice(0, 160));
  return c.data.token;
}

async function runApi() {
  section("実際にサーバへ頼む（" + API + "）");
  const token = await devToken();

  /* ══ 使っているモデルが、まだ存在するか ══════════════════════════
     Groq のモデルは黙って廃止される。名前が消えていても、こちらは
     「rate limit」や「呼べなかった」としか見えないので気づけない。
     **提供元に一覧を聞いて**、使うことになっているものが居るかを確かめる。
     一覧を見るだけなので、1 日の枠は使わない。 */
  const ml = await api("POST", "/api/ai/probe", { provider: "groq", models: true }, token);
  if (ml.status === 200 && ml.data.ok) {
    const 使用中 = ml.data.使用中 || [];
    const 欠け = 使用中.filter((x) => !x.一覧にある).map((x) => x.名前);
    console.log("   Groq のモデル " + ml.data.件数 + " 件 ／ 使うもの "
      + 使用中.map((x) => x.名前 + (x.一覧にある ? "" : "（無い！）")).join(" / "));
    ok("★使うことになっているモデルが、すべて今も存在する", 欠け.length === 0, 欠け);
    /* 表紙は **問題づくりと枠を分ける**のが目的。1 番手が消えたら、
       その目的が黙って崩れる（gpt-oss-20b へ落ちて枠を食い合う）。 */
    /* ★ 2026-08-19: 1 番手だった llama-3.3-70b-versatile が **提供元から 消えた**
       （この検査が 見つけた）。名前で 縛ると、また 消えたときに 同じことが 起きる。
       守りたいのは「**1 番手が 本当に 呼べること**」なので、そこを 見る。 */
    ok("★表紙の 1 番手が 今も 呼べる",
      使用中.length > 0 && 使用中[0].一覧にある === true, 使用中);
    ok("★廃止されたモデルを使っていない",
      !使用中.some((x) => /llama-3\.1-8b-instant/.test(x.名前)),
      使用中.map((x) => x.名前));
  } else {
    console.log("   （モデル一覧を取れませんでした: " + JSON.stringify(ml.data).slice(0, 120) + "）");
  }

  const noAuth = await api("POST", "/api/aigen/cover", { instruction: "英語" });
  ok("★ログインしていなければ断る", noAuth.status === 401, noAuth.status);

  const empty = await api("POST", "/api/aigen/cover", { icons: ICONS }, token);
  ok("手がかりが無ければ断る（適当な表紙を作らない）",
    empty.status === 400 && empty.data.code === "NO_INPUT", { s: empty.status, d: empty.data.code });

  /* 絵なし。名前とアイコンだけを見る（速い） */
  const t0 = Date.now();
  const meta = await api("POST", "/api/aigen/cover", {
    instruction: "高校保健の「感染症の予防」から 20 問。難しめで。",
    subject: "保健", icons: ICONS, banner: false,
    samples: ["感染症の三原則に含まれないものはどれか。", "潜伏期間とは何か、説明しなさい。"]
  }, token);
  const ms1 = Date.now() - t0;
  console.log("   名前・アイコンだけ: " + ms1 + "ms → 名前「" + (meta.data.name || "")
    + "」／アイコン " + (meta.data.icon || "") + "／絵の指示 "
    + String(meta.data.imagePrompt || "").slice(0, 70));
  ok("返ってくる", meta.status === 200 && meta.data.ok === true, { s: meta.status, w: meta.data.warnings });
  ok("★名前が付く", String(meta.data.name || "").trim().length >= 2, meta.data.name);
  ok("名前が長すぎない（30 字まで）", String(meta.data.name || "").length <= 30, meta.data.name);
  ok("★名前に引用符やかぎかっこが残っていない",
    !/^["'「『【]/.test(String(meta.data.name || "")), meta.data.name);
  ok("★アイコンが一覧の中にある", ICONS.indexOf(String(meta.data.icon || "")) >= 0,
    { icon: meta.data.icon, 一覧: ICONS.length + "個" });
  ok("★絵の指示が英語で返る",
    /[a-z]{4}/i.test(String(meta.data.imagePrompt || "")), meta.data.imagePrompt);
  ok("絵は頼んでいないので付いてこない", !meta.data.image, !!meta.data.image);

  /* 絵つき。**実際に画像が返るか**を見る */
  const t1 = Date.now();
  const full = await api("POST", "/api/aigen/cover", {
    instruction: "中学英語の不規則動詞から 15 問",
    subject: "英語", icons: ICONS,
    samples: ["go の過去形を書きなさい。"]
  }, token);
  const ms2 = Date.now() - t1;
  const b64 = String(full.data.image || "");
  const bytes = b64 ? Buffer.from(b64, "base64") : Buffer.alloc(0);
  console.log("   バナーつき: " + ms2 + "ms → 名前「" + (full.data.name || "")
    + "」／アイコン " + (full.data.icon || "")
    + "／絵 " + (bytes.length ? Math.round(bytes.length / 1024) + "KB" : "なし")
    + (full.data.warnings || []).map((w) => "\n     注意: " + w).join(""));
  ok("返ってくる", full.status === 200 && full.data.ok === true, full.status);
  ok("★バナーの絵が実際に返る", bytes.length > 5000, bytes.length);
  /* **中身と、名乗っている型が合っていること。**
     実測 2026-08-12: このモデルは JPEG を返す。PNG と決めつけて書いていた。 */
  const sniff = bytes.length < 12 ? ""
    : (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 ? "image/png"
      : (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? "image/jpeg"
        : (bytes.slice(0, 4).toString() === "RIFF" && bytes.slice(8, 12).toString() === "WEBP"
            ? "image/webp" : "")));
  ok("★画像として読める形で返ってくる", !!sniff, bytes.slice(0, 8).toString("hex"));
  ok("★名乗っている形式が中身と合っている", full.data.mimeType === sniff,
    { 名乗り: full.data.mimeType, 中身: sniff });
  ok("アイコンが一覧の中にある", ICONS.indexOf(String(full.data.icon || "")) >= 0, full.data.icon);

  /* 画面へ渡すために、絵を残しておく */
  if (bytes.length) {
    global.__coverB64 = b64;
    global.__coverMime = full.data.mimeType || "image/png";
  }
  global.__coverName = full.data.name || "";
}

/* 画面の中で、返ってきた絵が **上限に収まるところまで縮むか**を見る。
   ここが通らないと、絵はできても入らない（バナーは 700KB まで）。 */
async function runUi() {
  const b64 = global.__coverB64;
  if (!b64) { console.log("\n   （絵が無いので画面での取り込みは省略）"); return; }
  section("画面で取り込む（" + UI + "）");
  const { chromium } = require("playwright");
  const br = await chromium.launch();
  const pg = await br.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e.message).slice(0, 160)));
  try {
    await pg.goto(UI, { waitUntil: "domcontentloaded", timeout: 40000 });
    await pg.waitForFunction(() => window.VQ2 && VQ2.presetStudio && VQ2.presetStudio.cover,
      null, { timeout: 40000 });

    ok("★画面がアイコンの一覧を持っている",
      await pg.evaluate((n) => VQ2.presetStudio.icons.length === n, ICONS.length));

    /* ══ 名前が本当に「絵」になるか ══════════════════════════════
       Material Symbols は名前（ligature）で描く。名前が 1 文字でも違うと
       **絵ではなく名前がそのまま文字で出る**（実測: 24px の絵に対して 264px）。
       目で見るまで気づけないので、幅を測って必ず落とす。 */
    await pg.evaluate(() => document.fonts.ready);
    const glyph = await pg.evaluate((names) => {
      const loaded = document.fonts.check('24px "Material Symbols Rounded"');
      const box = document.createElement("div");
      box.style.cssText = "position:fixed;left:-9999px;top:0;visibility:hidden";
      document.body.appendChild(box);
      const w = (n) => {
        const sp = document.createElement("span");
        sp.className = "ms"; sp.style.fontSize = "24px"; sp.textContent = n;
        box.appendChild(sp);
        const v = Math.round(sp.getBoundingClientRect().width);
        sp.remove();
        return v;
      };
      const bad = names.map((n) => ({ n, w: w(n) })).filter((x) => x.w > 30);
      /* 物差しそのものを確かめる。**でたらめな名前が通ってしまうなら、
         この検査は何も見ていないことになる。** */
      const sanity = w("zzz_this_is_not_an_icon");
      box.remove();
      return { loaded, bad, sanity };
    }, ICONS);
    ok("Material Symbols が読み込まれている", glyph.loaded);
    ok("★この検査が本物か（でたらめな名前は落ちる）", glyph.sanity > 30, glyph.sanity);
    ok("★" + ICONS.length + " 個すべてが絵になる（名前のまま出るものが無い）",
      glyph.bad.length === 0, glyph.bad.slice(0, 8));

    const r = await pg.evaluate(async ({ b, mime }) => {
      const COVER = VQ2.presetStudio.cover;
      const blob = COVER.blob(b, mime);
      /* 画面の縮める部品と同じ道を通す（バナーは 1280×480・上限 700KB）。 */
      const url = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => {
          const img = new Image();
          img.onload = () => {
            const cv = document.createElement("canvas");
            cv.width = 1280; cv.height = 480;
            const g = cv.getContext("2d");
            g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height);
            const s = Math.max(cv.width / img.width, cv.height / img.height);
            g.drawImage(img, (cv.width - img.width * s) / 2, (cv.height - img.height * s) / 2,
              img.width * s, img.height * s);
            let q = 0.85, u = cv.toDataURL("image/jpeg", q);
            while (u.length > 700 * 1024 && q > 0.35) { q -= 0.1; u = cv.toDataURL("image/jpeg", q); }
            res({ url: u, w: img.width, h: img.height, q });
          };
          img.onerror = () => rej(new Error("画像を読み込めません"));
          img.src = String(fr.result);
        };
        fr.onerror = () => rej(new Error("読み取れません"));
        fr.readAsDataURL(blob);
      });
      return { size: url.url.length, w: url.w, h: url.h, q: url.q,
               head: url.url.slice(0, 30), blobSize: blob.size, blobType: blob.type };
    }, { b: b64, mime: global.__coverMime });
    console.log("   届いた絵: " + r.w + "×" + r.h + " / " + Math.round(r.blobSize / 1024)
      + "KB（" + r.blobType + "）");
    console.log("   縮めたあと: " + Math.round(r.size / 1024) + "KB（画質 " + r.q.toFixed(2) + "）");
    ok("★base64 から絵に戻せる", r.blobType === global.__coverMime && r.blobSize > 5000, r);
    /* 縮める部品が受け取れる型であること（png / jpeg / webp 以外は弾かれる） */
    ok("★縮める部品が受け取れる型",
      /^image\/(png|jpeg|webp)$/.test(r.blobType), r.blobType);
    ok("★横長で返ってきている", r.w > r.h, { w: r.w, h: r.h });
    ok("★上限（700KB）に収まる", r.size <= 700 * 1024, Math.round(r.size / 1024) + "KB");
    ok("JPEG の data URL になる", /^data:image\/jpeg;base64,/.test(r.head), r.head);

    /* ── アイコンを選ぶところを、実際に開いて触る ───────────────── */
    await pg.evaluate(() => {
      document.querySelectorAll(".vq2-host").forEach((h) => h.remove());
      document.body.style.overflow = "";
      VQ2.presetStudio.open({ preset: { name: "新しいプリセット", questions: [] } });
    });
    await pg.waitForFunction(() => {
      const h = document.getElementById("vq2-preset-studio");
      return !!(h && h.shadowRoot && h.shadowRoot.querySelector('[data-act="settings"]'));
    }, null, { timeout: 20000 });
    await pg.evaluate(() => document.getElementById("vq2-preset-studio").shadowRoot
      .querySelector('[data-act="settings"]').click());
    await pg.waitForFunction(() => {
      const h = document.getElementById("vq2-preset-appearance");
      return !!(h && h.shadowRoot && h.shadowRoot.querySelector("[data-icon]"));
    }, null, { timeout: 20000 });

    const pick = await pg.evaluate(() => {
      const sr = document.getElementById("vq2-preset-appearance").shadowRoot;
      const all = [...sr.querySelectorAll("[data-icon]")];
      const groups = [...sr.querySelectorAll(".vq2-icogrid-g")].map((x) => x.textContent);
      /* 絵になっているか（span.vq2-ms の中に名前が入っている） */
      const first = all[0];
      const hasMs = !!first.querySelector(".vq2-ms");
      const glyphW = Math.round(first.querySelector(".vq2-ms").getBoundingClientRect().width);
      /* 探す */
      const q = sr.querySelector('[data-act="icon-q"]');
      q.value = "おんがく";
      q.dispatchEvent(new Event("input", { bubbles: true }));
      const afterSearch = [...sr.querySelectorAll("[data-icon]")].map((b) => b.getAttribute("data-icon"));
      /* 選ぶ */
      const target = sr.querySelector('[data-icon="music_note"]');
      if (target) target.click();
      const on = [...sr.querySelectorAll('[data-icon][aria-pressed="true"]')]
        .map((b) => b.getAttribute("data-icon"));
      const prev = sr.querySelector(".vq2-ap-prev .vq2-ms");
      return { count: all.length, groups: groups.length, hasMs, glyphW,
               afterSearch, on, prevText: prev ? prev.textContent : "" };
    });
    console.log("   選ぶところ: " + pick.count + " 個 / " + pick.groups + " まとまり");
    ok("★アイコンが並ぶ", pick.count >= 120, pick.count);
    ok("まとまりの見出しが付く", pick.groups >= 5, pick.groups);
    ok("★絵文字ではなく Material Symbols で描いている", pick.hasMs);
    ok("★選ぶところでも絵になっている（名前が文字で出ていない）",
      pick.glyphW > 0 && pick.glyphW <= 30, pick.glyphW);
    ok("★言葉で絞り込める", pick.afterSearch.length > 0 && pick.afterSearch.length < pick.count
      && pick.afterSearch.indexOf("music_note") >= 0, pick.afterSearch);
    ok("★押すと選んだ状態になる", pick.on.join() === "music_note", pick.on);
    ok("★見本にも反映される", pick.prevText === "music_note", pick.prevText);

    /* バナーは押したときだけ。ボタンがあること・自動で走っていないことを見る。 */
    const banner = await pg.evaluate(() => {
      const sr = document.getElementById("vq2-preset-appearance").shadowRoot;
      const b = sr.querySelector('[data-act="ai-banner"]');
      const prev = sr.querySelector(".vq2-ap-bprev");
      return { ある: !!b, 文字: b ? b.textContent.trim() : "",
               まだ空: prev ? /まだ設定されていません/.test(prev.textContent) : false };
    });
    ok("★「AI で作る」のボタンが出ている", banner.ある && /AI で作る/.test(banner.文字), banner);
    ok("★押すまでバナーは空のまま", banner.まだ空, banner);

    /* ══ 選んだアイコンで、実際に保存できること ══════════════════════
       実測 2026-08-12: アイコンの上限が 8 文字のままで、
       Material Symbols の名前（最長 21 文字）を選ぶと **保存のたびに**
       「長すぎます（上限 8 文字）」で止まっていた。
       絵文字をやめたのに、絵文字用の上限が残っていたのが原因。 */
    const save = await pg.evaluate((names) => {
      const S = VQ2.schema;
      const longest = names.slice().sort((a, b) => b.length - a.length)[0];
      const issues = (v) => S.validateAppearance({ icon: v }, "appearance", [])
        .map((x) => x.code + ":" + x.message);
      /* 実際に保存できるかは、画面が使う入れ物そのもので見る。
         中身が空だと別の理由（問題が 0 問）で落ちるので、1 問入れておく。 */
      const p = S.emptyPreset({ name: "確認" });
      p.appearance = { icon: longest, iconImage: "", banner: "" };
      p.questions = [VQ2.qmodel.normalize({
        type: "multiple_choice_single", prompt: "確認用の問題。", points: 1,
        choices: [{ id: "c1", text: "あ", isCorrect: true }, { id: "c2", text: "い" }],
        correctAnswer: "c1"
      })];
      let saveErrs = [];
      try {
        saveErrs = VQ2.validate.errorsOf(VQ2.validate.validatePresetForSave(p, {}))
          .map((x) => x.code + ":" + x.message);
      } catch (e) { saveErrs = ["（保存の検証を呼べません: " + e.message + "）"]; }
      return { longest, len: longest.length,
               短い: issues("eco"), 長い: issues(longest), 絵文字: issues("📘"),
               でたらめ: issues("x".repeat(80)), 保存: saveErrs };
    }, ICONS);
    console.log("   いちばん長い名前: " + save.longest + "（" + save.len + " 文字）");
    ok("★短い名前は通る", save.短い.length === 0, save.短い);
    ok("★いちばん長い名前も通る（保存できる）", save.長い.length === 0, save.長い);
    ok("★古い絵文字も通る", save.絵文字.length === 0, save.絵文字);
    ok("★でたらめに長いものは今までどおり弾く", save.でたらめ.length > 0, save.でたらめ);
    ok("★アイコンを選んだプリセットが保存の検証を通る", save.保存.length === 0, save.保存);

    ok("画面のエラーが出ていない", errs.length === 0, errs.slice(0, 2));
  } finally {
    await br.close();
  }
}

function finish() {
  console.log("\n合格 " + pass + " / 不合格 " + fail);
  if (bad.length) console.log("直すところ:\n  - " + bad.join("\n  - "));
  process.exit(fail ? 1 : 0);
}
