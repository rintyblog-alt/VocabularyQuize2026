/* ══════════════════════════════════════════════════════════════════════════
   vqdm2.cjs — DM の 直した所を 本物の Chromium で 確かめる（2026-08-20）

   訴え:
     ・「DM の メッセージ画面の 下部が モバイルだと 低すぎる」
     ・「メッセージボックスを 既存の Lumi の 下部と 同じようにして欲しい。
        そこに 写真、音声、プリセット、絵文字を 選べるように」
     ・「DM の 背景を 設定から 設定できるように。テンプレートを 8 つくらい」
     ・「DM から アイコンをタップして プロフィールに 飛べるように」
     ・「ブロック機能、ミュート（通知を受け取らない）機能も」

   本番では 走らせない。
   ══════════════════════════════════════════════════════════════════════════ */
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const { chromium } = require("playwright");

let 済 = 0, 落 = 0; const 印 = []; const 落ち = [];
function ok(名, 真, 補) {
  if (真) { 済++; 印.push("  ✅ " + 名 + (補 === undefined ? "" : "  " + 短(補))); }
  else { 落++; 落ち.push(名); 印.push("  ❌ " + 名 + (補 === undefined ? "" : "  " + 短(補))); }
}
function 短(v) { const s = typeof v === "string" ? v : JSON.stringify(v); return String(s).slice(0, 170); }
function 節(t) { 印.push("\n── " + t + " " + "─".repeat(Math.max(0, 54 - t.length))); }

async function req(path, { method = "GET", body, token } = {}) {
  const h = { "content-type": "application/json" };
  if (token) h.authorization = "Bearer " + token;
  const r = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, j: await r.json().catch(() => ({})) };
}
let n = 0;
async function 作る(名) {
  n++;
  const tag = `d2${Date.now().toString(36)}${n}`;
  const s = await req("/api/auth/register/start", { method: "POST",
    body: { email: `vqdm2.${tag}@gmail.com`, gradePrefix: "H2", nickname: 名 + tag, password: "Testing!2345" } });
  if (!s.j.devCode) throw new Error("devCode が返りません: " + JSON.stringify(s.j).slice(0, 160));
  const v = await req("/api/auth/register/verify", { method: "POST", body: { challengeId: s.j.challengeId, code: s.j.devCode } });
  const c = await req("/api/auth/register/consent", { method: "POST",
    body: { registrationSession: v.j.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: "482913" } });
  const me = await req("/api/auth/me", { token: c.j.token });
  return { token: c.j.token, uid: Number(me.j?.user?.id || me.j?.id || 0), nickname: 名 + tag };
}

/* 色の 比（WCAG） */
function 明るさ(c) {
  const m = /rgba?\(([^)]+)\)/.exec(String(c || ""));
  if (!m) return -1;
  const [r, g, b] = m[1].split(",").map((x) => Number(x.trim()));
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function 比(a, b) {
  const x = 明るさ(a), y = 明るさ(b);
  if (x < 0 || y < 0) return 0;
  const h = Math.max(x, y), l = Math.min(x, y);
  return (h + 0.05) / (l + 0.05);
}

(async () => {
  const A = await 作る("d2a");
  const B = await 作る("d2b");
  /* 先に 部屋を 作って 1 件 送っておく（画面の 手数を 減らす） */
  const o = await req("/api/dm/open", { method: "POST", body: { userId: B.uid }, token: A.token });
  const TID = o.j.threadId;
  await req("/api/dm/send", { method: "POST", body: { threadId: TID, kind: "text", body: "こんにちは" }, token: A.token });
  /* ★ 相手の 吹き出し（.m.you）が 無いと 背景の 検査が 自分の 吹き出しで 通ってしまう。 */
  await req("/api/dm/send", { method: "POST", body: { threadId: TID, kind: "text", body: "やあ、こんにちは" }, token: B.token });

  const b = await chromium.launch({ headless: true });
  /* いちばん多い 大きさ（iPhone くらい）で 見る。下部の 訴えは ここで 起きる。 */
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const 画面の失敗 = [];
  p.on("pageerror", (e) => 画面の失敗.push(String(e.message).slice(0, 160)));
  await p.addInitScript(([t]) => { try { localStorage.setItem("app.auth.token.v1", t); } catch (e) {} }, [A.token]);
  await p.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await p.waitForFunction(() => !!window.__vqOpenDM, null, { timeout: 25000 }).catch(() => {});

  await p.evaluate(([t]) => window.__vqOpenDM(t), [TID]);
  await p.waitForTimeout(1400);

  節("① 送る所が Lumi の 下部と 同じ 形");
  const 形 = await p.evaluate(() => {
    const r = document.getElementById("vqDM").shadowRoot;
    const row = r.querySelector(".crow"), ta = r.querySelector(".ta"), send = r.querySelector(".sendb");
    if (!row || !ta || !send) return { なし: true };
    const cs = getComputedStyle(row), cts = getComputedStyle(ta), css = getComputedStyle(send);
    const ico = Array.from(row.querySelectorAll(".iconb")).map((e) => (e.getAttribute("aria-label") || ""));
    return {
      丸: cs.borderRadius, 枠: cs.borderTopWidth, 影: cs.boxShadow !== "none",
      字: cts.fontSize, 送る丸: css.borderRadius,
      送る幅: Math.round(send.getBoundingClientRect().width),
      道具: ico
    };
  });
  ok("1 本の 丸いバーに なっている", parseFloat(形.丸) >= 99, 形.丸);
  ok("枠と 影が 付いている（Lumi と 同じ）", parseFloat(形.枠) > 0 && 形.影 === true, 形.枠 + " / 影" + 形.影);
  ok("送るボタンも 丸い", parseFloat(形.送る丸) >= 99, 形.送る丸);
  ok("文字は 16px 以上（iPhone が 勝手に 拡大しない）", parseFloat(形.字) >= 16, 形.字);
  ok("道具は 4 つ", (形.道具 || []).length === 4, 形.道具);
  ok("写真が 選べる", (形.道具 || []).some((x) => /写真/.test(x)), 形.道具);
  ok("音声が 選べる", (形.道具 || []).some((x) => /音声/.test(x)), 形.道具);
  ok("プリセットが 選べる", (形.道具 || []).some((x) => /プリセット/.test(x)), 形.道具);
  ok("絵文字が 選べる", (形.道具 || []).some((x) => /絵文字/.test(x)), 形.道具);

  節("② 下が 低すぎない");
  const 下 = await p.evaluate(() => {
    const h = document.getElementById("vqDM"), r = h.shadowRoot;
    const comp = r.querySelector(".comp"), row = r.querySelector(".crow"), send = r.querySelector(".sendb");
    const cs = getComputedStyle(comp);
    const 全 = Array.from(r.querySelectorAll("style")).map((s) => s.textContent).join("");
    return {
      下余白: parseFloat(cs.paddingBottom),
      バー下端: Math.round(row.getBoundingClientRect().bottom),
      送る下端: Math.round(send.getBoundingClientRect().bottom),
      画面: window.innerHeight,
      安全域: /env\(safe-area-inset-bottom/.test(全),
      キーボード: /var\(--kb/.test(全)
    };
  });
  ok("下の 余白が 16px 以上 ある", 下.下余白 >= 16, 下.下余白 + "px");
  ok("iPhone の 下の 帯（安全域）を 見ている", 下.安全域 === true);
  ok("キーボードのぶんも 持ち上げる 作りが ある", 下.キーボード === true);
  ok("送るボタンが 画面の 外へ 出ていない", 下.送る下端 <= 下.画面, 下.送る下端 + " / " + 下.画面);
  ok("バーの 下に 余白が 残っている", 下.画面 - 下.バー下端 >= 10, (下.画面 - 下.バー下端) + "px");

  節("③ 背景の テンプレート（8 種）");
  const 背景 = await p.evaluate(() => window.__vqDM.背景の名());
  ok("8 種 ある", (背景 || []).length === 8, 背景);
  const 見た = [];
  for (const k of 背景) {
    const r = await p.evaluate(([k2]) => {
      window.__vqDM.背景(k2);
      const rt = document.getElementById("vqDM").shadowRoot;
      const m = rt.querySelector(".msgs");
      const 相手 = rt.querySelector(".m.you .bub"), 自分 = rt.querySelector(".m.me .bub");
      const 日 = rt.querySelector(".daysep");
      const cs = getComputedStyle(m);
      const 読み = function (e) { return e ? { 地: getComputedStyle(e).backgroundColor, 字: getComputedStyle(e).color } : null; };
      return {
        鍵: document.getElementById("vqDM").getAttribute("data-bg"),
        地: cs.backgroundColor, 絵: cs.backgroundImage,
        相手: 読み(相手), 自分: 読み(自分), 日: 読み(日)
      };
    }, [k]);
    見た.push({ k, ...r });
  }
  ok("どれも 当たる", 見た.every((x) => x.鍵 === x.k), 見た.map((x) => x.鍵).join(","));
  ok("無地 以外は 見た目が 変わる",
    見た.filter((x) => x.k !== "plain").every((x) => x.絵 !== "none" || x.地 !== 見た[0].地),
    見た.filter((x) => x.k !== "plain" && x.絵 === "none" && x.地 === 見た[0].地).map((x) => x.k));
  ok("相手の 吹き出しが 実際に ある（自分のだけで 通していない）", 見た.every((x) => !!x.相手));
  const 読めない = [];
  見た.forEach(function (x) {
    [["相手の吹き出し", x.相手], ["自分の吹き出し", x.自分], ["日付の区切り", x.日]].forEach(function (pair) {
      if (!pair[1]) return;
      const c = 比(pair[1].字, pair[1].地);
      if (c < 4.5) 読めない.push(x.k + "/" + pair[0] + " " + c.toFixed(2));
    });
  });
  ok("どの 背景でも 字が 読める（吹き出し 両方・日付の区切り・4.5 以上）", 読めない.length === 0, 読めない);
  await p.evaluate(() => window.__vqDM.背景("plain"));

  節("④ 設定から 選べる");
  const 設定 = await p.evaluate(() => {
    if (!window.__vqSet) return { なし: true };
    const sp = window.__vqSet.spec("display.dmBackground");
    return { ある: !!sp, 数: sp ? sp.opts.length : 0, 既定: sp ? sp.def : "", 束: sp ? sp.group : "" };
  });
  ok("設定の 定義表に 載っている", 設定.ある === true, 設定);
  ok("選べるのは 8 つ", 設定.数 === 8, 設定.数);
  ok("既定は 無地", 設定.既定 === "plain", 設定.既定);
  const つながる = await p.evaluate(() => {
    window.__vqSet.set("display.dmBackground", "night");
    return document.getElementById("vqDM").getAttribute("data-bg");
  });
  ok("設定を 変えると DM の 背景も 変わる", つながる === "night", つながる);
  await p.evaluate(() => window.__vqSet.set("display.dmBackground", "plain"));

  節("⑤ 相手を 押すと プロフィールへ");
  const 飛ぶ = await p.evaluate(() => {
    let 呼ばれた = "";
    const 元 = window.__vqOpenProfile;
    window.__vqOpenProfile = function (uid) { 呼ばれた = String(uid || ""); };
    const r = document.getElementById("vqDM").shadowRoot;
    const w = r.querySelector(".chead .who");
    const 押せる = !!w;
    if (w) w.click();
    window.__vqOpenProfile = 元;
    return { 押せる, 呼ばれた, 閉じた: document.getElementById("vqDM").getAttribute("data-open") };
  });
  ok("上の 相手が 押せる", 飛ぶ.押せる === true);
  ok("プロフィールを 開く口を 呼ぶ", /^[0-9]+$/.test(飛ぶ.呼ばれた), 飛ぶ.呼ばれた);
  ok("DM は 閉じる（重ねない）", 飛ぶ.閉じた === "0", 飛ぶ.閉じた);

  await p.evaluate(([t]) => window.__vqOpenDM(t), [TID]);
  await p.waitForTimeout(900);

  節("⑥ 部屋の メニュー");
  const 品 = await p.evaluate(() => {
    const r = document.getElementById("vqDM").shadowRoot;
    r.querySelector('[data-a="tmenu"]').click();
    const m = r.querySelector(".menu");
    return m ? Array.from(m.querySelectorAll("button")).map((x) => (x.textContent || "").trim()) : [];
  });
  ok("プロフィールを見る が ある", 品.some((x) => /プロフィール/.test(x)), 品);
  ok("ミュート（知らせを止める）が ある", 品.some((x) => /ミュート|知らせ/.test(x)), 品);
  ok("ブロックが ある", 品.some((x) => /ブロック/.test(x)), 品);
  ok("報告が ある", 品.some((x) => /報告/.test(x)), 品);

  節("⑦ ブロックしたら 送れなくなる");
  await req("/api/dm/block", { method: "POST", body: { threadId: TID, on: true }, token: A.token });
  await p.evaluate(([t]) => window.__vqOpenDM(t), [TID]);
  await p.waitForTimeout(1400);
  const 止 = await p.evaluate(() => {
    const r = document.getElementById("vqDM").shadowRoot;
    const bar = r.querySelector(".blockbar"), ta = r.querySelector(".ta"), send = r.querySelector(".sendb");
    return {
      帯: !!bar, 文: bar ? (bar.textContent || "").trim() : "",
      止まった: !!(ta && ta.disabled) && !!(send && send.disabled),
      解除: !!r.querySelector('[data-a="unblock"]')
    };
  });
  ok("ブロック中の 帯が 出る", 止.帯 === true, 止.文);
  ok("書けなくなる・送れなくなる", 止.止まった === true);
  ok("その場から 解除できる", 止.解除 === true);
  const 解けた = await p.evaluate(() => {
    document.getElementById("vqDM").shadowRoot.querySelector('[data-a="unblock"]').click();
    return true;
  });
  await p.waitForTimeout(1200);
  const 後 = await p.evaluate(() => {
    const r = document.getElementById("vqDM").shadowRoot;
    return { 帯: !!r.querySelector(".blockbar"), 書ける: !r.querySelector(".ta").disabled };
  });
  ok("解除の ボタンが 効く", 解けた === true);
  ok("解除したら 帯が 消える", 後.帯 === false);
  ok("解除したら また 書ける", 後.書ける === true);

  節("⑧ せまい画面でも はみ出さない");
  const はみ = await p.evaluate(() => {
    const r = document.getElementById("vqDM").shadowRoot;
    return {
      横: r.querySelector(".sheet").scrollWidth > window.innerWidth + 2,
      バー: r.querySelector(".crow").scrollWidth > r.querySelector(".crow").clientWidth + 2
    };
  });
  ok("横に はみ出さない", はみ.横 === false);
  ok("送る所も はみ出さない", はみ.バー === false);
  ok("画面の 失敗が 出ていない", 画面の失敗.length === 0, 画面の失敗.slice(0, 3).join(" / "));

  await b.close();
  console.log(印.join("\n"));
  console.log("\n通った " + 済 + "/" + (済 + 落));
  if (落ち.length) console.log("落ちた: " + 落ち.join(" / "));
  process.exit(落 ? 1 : 0);
})().catch((e) => {
  console.log(印.join("\n"));
  console.error("\n途中で 止まりました: " + (e && e.message ? e.message : e));
  process.exit(2);
});
