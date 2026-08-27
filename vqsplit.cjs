/* ══════════════════════════════════════════════════════════════════════════
   vqsplit.cjs — 画面を 外のファイルへ切り出した前後で **何も変わっていない**ことを見る

   何を見るか:
     ① window に生えた名前が 同じか（＝ JS が 同じ順で 同じだけ 動いたか）
     ② CSS の規則の数が 同じか（＝ 打ち消し合いの 前提が 崩れていないか）
     ③ 実際の見た目（主要な要素の 計算後の値）が 同じか
     ④ 新しく出た コンソールの赤い字が 無いか
     ⑤ 取りに行ったファイルが 全部 200 か

   使い方: node vqsplit.cjs
   ══════════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE || "http://127.0.0.1";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

const ROOT = path.join(__dirname, "client");
const 旧 = process.env.VQ_OLD || "/private/tmp/claude-501/-Users-user-Downloads-word-practice-v26-menu-terms-report-emailjs/ea86a79f-1ff2-4347-9303-995fcdd2a12d/scratchpad/idx.before-split.html";
const PORT = Number(process.env.VQ_PORT || 8971);
let pass = 0, fail = 0; const 落ち = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ✅ " + n); }
  else { fail++; 落ち.push(n); console.log("  ❌ " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 600) : "")); }
};
const 節 = (t) => console.log("\n■ " + t);
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png",
  ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2", ".m4a": "audio/mp4", ".wav": "audio/wav", ".jpg": "image/jpeg" };

function serve() {
  return new Promise((res) => {
    const s = http.createServer((req, rq) => {
      let p = decodeURIComponent(String(req.url).split("?")[0]);
      if (p === "/__old__") {
        rq.writeHead(200, { "Content-Type": MIME[".html"] });
        fs.createReadStream(旧).pipe(rq); return;
      }
      if (p === "/") p = "/index.html";
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rq.writeHead(404); rq.end("x"); return; }
      rq.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
      fs.createReadStream(f).pipe(rq);
    });
    s.listen(PORT, "127.0.0.1", () => res(s));
  });
}

/* 画面から 取れるだけ 取ってくる */
async function 採取(ctx, url, ラベル) {
  const page = await ctx.newPage();
  const 赤 = [], 失敗 = [];
  page.on("console", (m) => { if (m.type() === "error") 赤.push(String(m.text()).slice(0, 300)); });
  page.on("pageerror", (e) => 赤.push("pageerror: " + String(e && e.message).slice(0, 300)));
  /* 見るのは **自分のところ**だけ。外（Google の書体・Firestore など）は
     切り出しと関係なく その時々で落ちるので、ここで数えると
     テストが 天気で変わる。 */
  page.on("response", (r) => {
    const u = r.url(); const st = r.status();
    if (st < 400) return;
    if (!u.startsWith("http://127.0.0.1")) return;
    if (/\/api\//.test(u)) return;
    失敗.push(st + " " + u);
  });
  const t0 = Date.now();
  await page.goto(url, { waitUntil: "load", timeout: 120000 });
  const 読了 = Date.now() - t0;
  /* ★ 起動のあとに読むもの（vq2-app / vq-live / 道具類）が
     届き切るまで待つ。待たずに比べると「規則が減った」「要素が減った」と
     出るが、それは まだ来ていないだけで 中身の違いではない。 */
  await page.waitForTimeout(3500);
  await page.waitForFunction(() => {
    if (!window.__vqLoadLibs) return true;          /* 旧版には この仕掛けが無い */
    return window.__vqLibsReady === true;
  }, null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3000);
  const d = await page.evaluate(() => {
    const 名 = Object.getOwnPropertyNames(window).sort();
    let 規則 = 0, 枚 = 0, 読めず = 0;
    for (const ss of Array.from(document.styleSheets)) {
      枚++;
      try { 規則 += ss.cssRules.length; } catch (e) { 読めず++; }
    }
    const cs = getComputedStyle(document.body);
    const 見本 = {};
    for (const sel of ["body", "#authGate", "#appV2Sidebar", "#firstLaunchOverlay", "#appMain", ".app-mobile-bottom-bar"]) {
      const el = document.querySelector(sel);
      if (!el) { 見本[sel] = null; continue; }
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      見本[sel] = [s.display, s.backgroundColor, s.color, s.position, Math.round(r.width), Math.round(r.height)];
    }
    return {
      名, 名数: 名.length, 規則, 枚, 読めず,
      body背景: cs.backgroundColor, body色: cs.color, bodyフォント: cs.fontFamily.slice(0, 60),
      要素数: document.querySelectorAll("*").length,
      見本,
      VQ2: typeof window.VQ2, live: typeof window.__vqLive, api: String(window.API_BASE || "").slice(0, 40),
      札: document.querySelectorAll("#vq-boothold").length,
      臨界: document.querySelectorAll("#vq-critical").length,
      script: document.querySelectorAll("script[src]").length,
      link: document.querySelectorAll('link[rel="stylesheet"]').length,
      中身要素: document.querySelectorAll("*:not(script):not(link):not(style)").length,
      アイコン: (() => {
        const e = Array.from(document.querySelectorAll(".ms, .material-symbols-rounded"))
          .find((x) => (x.textContent || "").trim() && x.getBoundingClientRect().width > 0);
        if (!e) return null;
        const s2 = getComputedStyle(e), r = e.getBoundingClientRect();
        return { font: s2.fontFamily.slice(0, 40), w: Math.round(r.width), h: Math.round(r.height), size: parseFloat(s2.fontSize) || 0, 字: (e.textContent || "").trim().slice(0, 12) };
      })()
    };
  });
  console.log(`  [${ラベル}] load ${読了}ms / 要素 ${d.要素数} / window名 ${d.名数} / CSS ${d.枚}枚 ${d.規則}規則(読めず${d.読めず}) / 赤 ${赤.length} / 取得失敗 ${失敗.length}`);
  await page.close();
  return { ...d, 赤, 失敗, 読了 };
}

(async () => {
  const srv = await serve();
  const b = await chromium.launch();
  try {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
    節("① 旧版（全部インライン）を開く");
    const A = await 採取(ctx, `http://127.0.0.1:${PORT}/__old__`, "旧");
    const ctx2 = await b.newContext({ viewport: { width: 1280, height: 900 } });
    節("② 新版（外のファイルへ切り出し）を開く");
    const B = await 採取(ctx2, `http://127.0.0.1:${PORT}/`, "新");

    節("③ window に生えた名前");
    const 減 = A.名.filter((x) => !B.名.includes(x));
    const 増 = B.名.filter((x) => !A.名.includes(x));
    ok("旧にあって新に無い名前が 0（" + 減.length + "）", 減.length === 0, 減.slice(0, 40));
    /* 起動の 1 枚を「まだ しまわないで」と言う札。**これだけ**が増えてよい。
       ほかが増えていたら、切り出しの副作用なので落とす。 */
    /* ★ 2026-08-19 追加: __vqPresetSource。
       プリセット一覧から 開始したときに 昔の画面へ落ちていたのを直すため、
       本体（vq-core）が 中身を 渡す口を 出した。旧版には 無い機能なので
       「旧に無い名前が 増えた」= 正しい。 */
    /* ★ 2026-08-19（2 回目）追加:
       VQIDB           … 大きいものの 置き場（IndexedDB）。localStorage の
                         4.4MB の壁を 越えるために 足した。
       VQKOTO/_N       … 今日のことわざ（966 句）。ホームを 開いたときだけ 読む。
       どれも 旧版には 無い機能なので「増えた」が 正しい。 */
    /* ★ 2026-08-19（3 回目）追加:
       VQCLOUD … 会話（一覧と本文）を サーバへ 残す口。
                 それまで 会話は localStorage の中だけに在り、
                 上限 4.4MB に対して すでに 4.6MB 使っていたので
                 **増えるほど 静かに 消えていた**（実測）。
                 端末を 変えても 残らなかった。旧版には 無い機能。 */
    /* ★ 2026-08-19（4 回目）追加:
       VQSCAN … スキャンモード（何枚でも撮る → 読み取る → 板 / 問題 / ゲーム）。
                旧版には 無い機能。 */
    /* ★ 2026-08-20 追加:
       __vqCssArrived / __vqCssGateOff
         … 外の CSS が 届くまで 起動の 1 枚 以外を 見せない 仕組みの 合図。
           強制読み込み（Cmd+Shift+R）で 素の HTML と まっ黒な マークが
           一瞬 出ていたのを 止めるため。旧版には 無い。 */
    const 増えてよい = ["__vqLibsReady", "__vqLoadLibs", "__vqPresetSource",
                        "VQIDB", "VQKOTO", "VQKOTO_N", "VQCLOUD", "VQSCAN",
                        "__vqCssArrived", "__vqCssGateOff",
                        /* ★ 2026-08-20 追加: DM（1 対 1 のやりとり）。旧版には 無い機能。 */
                        /* __vqDmUnread は 未読を 数え終えてから 生えるので ここには 入れない
                           （この検査は「並べたものが 必ず 在る」ことも 見る）。 */
                        "__vqDM", "__vqDmInstalled", "__vqOpenDM",
                        /* ★ 2026-08-20 追加: VQK（AR App の 型）。
                           Lumi が コードを 書かずに 済むよう、確かめてある ひな型を
                           束へ 入れた。旧版には 無い機能。 */
                        "VQK",
                        /* ★ 2026-08-20 追加: Feed まわり。
                           VQBADGE … 公式マーク（金と青の 重ね / 金 / 青）。
                           VQART   … お知らせに 添える 絵 48 種。
                           どちらも 旧版には 無い機能。 */
                        "VQBADGE", "VQART",
                        /* ★ 2026-08-20 追加: ダウンタイム（サービスを 止めている 間の 1 枚）。
                           旧版には 無い機能。 */
                        "__vqDowntime", "__vqDowntimeInstalled",
                        /* ★ 2026-08-20 追加: 動画の 再生バー（Feed と News で 同じもの）。
                           旧版には 無い機能。 */
                        "VQVID"];
    const 想定外 = 増.filter((x) => 増えてよい.indexOf(x) < 0);
    ok("増えたのは vq2 の読み込み口だけ（" + 増.join(",") + "）",
       想定外.length === 0 && 増えてよい.every((x) => 増.includes(x)), { 増, 想定外 });

    節("④ CSS");
    /* 書体の CSS を Google から 手元へ写したので、規則の数は ごく僅かに動く
       （Google は 相手のブラウザごとに 違う中身を返すため）。
       大事なのは **数がぴったり同じこと**ではなく、
       打ち消し合いの前提が崩れていないことなので ±3 まで見る。
       アイコンが本当に出るかは 下の ⑨ で 別に確かめる。 */
    /* 起動画面ぶんの CSS を head へ直接置いた分（6 規則）＋ 書体の CSS の差。
       ±10 まで見る。効いているかは 下の見た目の突き合わせで確かめる。 */
    /* ★ 2026-08-19 に 見かたを変えた。
       この検査で 守りたいのは「**切り出しで CSS が 落ちていないか**」。
       新しい機能を足せば 規則は 増えるのが 当たり前なので、
       「ぴったり同じ」を求めると 機能を足すたびに 落ちて、
       本当に 落ちたときに 気づけなくなる（オオカミ少年になる）。
       ★ だから **減っていないこと**を 見る。増えるのは 通す。
         書体の CSS は 相手のブラウザで 中身が変わるので ±3 だけ 見逃す。 */
    ok(`規則が 減っていない（旧 ${A.規則} / 新 ${B.規則}）`, B.規則 >= A.規則 - 3, { 旧: A.規則, 新: B.規則 });
    /* 読めない CSS ＝ 別ドメインの書体などで、中身を覗くと例外になるもの。
       旧版にも 同じ数あるのが 正常。0 かどうかではなく **増えていないか**を見る。 */
    ok(`読めないCSSが増えていない（旧 ${A.読めず} / 新 ${B.読めず}）`, B.読めず <= A.読めず, [A.読めず, B.読めず]);
    /* +1 は <style id="vq-critical">（起動画面ぶんを head へ直接置いたもの） */
    ok(`CSSの枚数が +1 まで（旧 ${A.枚} / 新 ${B.枚}）`, B.枚 - A.枚 === 1, [A.枚, B.枚]);
    ok("増えた 1 枚は vq-critical", B.臨界 === 1 && A.臨界 === 0, { 旧: A.臨界, 新: B.臨界 });

    節("⑤ 見た目");
    ok(`body の背景が同じ（${B.body背景}）`, A.body背景 === B.body背景, [A.body背景, B.body背景]);
    ok(`body の文字色が同じ（${B.body色}）`, A.body色 === B.body色, [A.body色, B.body色]);
    ok("body の書体が同じ", A.bodyフォント === B.bodyフォント, [A.bodyフォント, B.bodyフォント]);
    /* 要素の総数は 変わってよい。読み込みのタグを まとめたり
       外へ出したりしているため（56 本を 1 本にした）。
       変わってはいけないのは **利用者が見る側の DOM**。
       そこで タグ（script / link）を 除いた数で 比べる。 */
    ok(`中身の要素数が同じ（旧 ${A.中身要素} / 新 ${B.中身要素}）`, A.中身要素 === B.中身要素, [A.中身要素, B.中身要素]);
    console.log(`     （読み込みのタグ: script ${A.script}→${B.script} 本 / stylesheet ${A.link}→${B.link} 本）`);

    節("⑨ アイコンの書体（Google から 手元へ 写したもの）");
    ok(`アイコンの書体が当たっている（${B.アイコン && B.アイコン.font}）`,
       !!(B.アイコン && /Material Symbols/.test(B.アイコン.font)), B.アイコン);
    ok("アイコンが 字ではなく 絵として出ている（横幅が 字の並びでない）",
       !!(B.アイコン && B.アイコン.w > 8 && B.アイコン.w < B.アイコン.size * 2.2), B.アイコン);
    ok("旧と同じ見え方（横幅の差が 2px 以内）",
       !!(A.アイコン && B.アイコン && Math.abs(A.アイコン.w - B.アイコン.w) <= 2), [A.アイコン, B.アイコン]);
    for (const k of Object.keys(A.見本)) {
      ok(`${k} の 表示・色・位置・大きさが同じ`, JSON.stringify(A.見本[k]) === JSON.stringify(B.見本[k]), [A.見本[k], B.見本[k]]);
    }

    節("⑥ 動いているか");
    ok(`VQ2 が居る（${B.VQ2}）`, B.VQ2 === A.VQ2 && B.VQ2 !== "undefined", [A.VQ2, B.VQ2]);
    ok(`__vqLive が居る（${B.live}）`, B.live === A.live, [A.live, B.live]);
    ok("API_BASE が同じ", A.api === B.api, [A.api, B.api]);

    節("⑦ 赤い字と 取りに行ったファイル");
    /* 外の資源が落ちたときの赤は 数えない（上と同じ理由） */
    const 外の音 = (x) => /Failed to load resource/.test(x) || /firestore|googleapis|gstatic/i.test(x);
    /* 圧縮すると 関数名が 変わるので、**呼び出しの跡は 落として** 本文だけで比べる。
       そうしないと 同じ内容の赤い字が 別物に見える。 */
    const 芯 = (x) => String(x).split("\n")[0].replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim().slice(0, 70);
    const 旧芯 = new Set(A.赤.map(芯));
    const 新赤 = B.赤.filter((x) => !外の音(x) && !旧芯.has(芯(x)));
    ok("新しく出た赤い字が 0（" + 新赤.length + "）", 新赤.length === 0, 新赤.slice(0, 10));
    ok("404 などが 0（" + B.失敗.length + "）", B.失敗.length === 0, B.失敗.slice(0, 10));

    節("⑧ 大きさ");
    const 旧B = fs.statSync(旧).size, 新B = fs.statSync(path.join(ROOT, "index.html")).size;
    console.log(`  index.html: ${旧B} → ${新B} バイト（${(新B / 旧B * 100).toFixed(1)}%）`);
    ok("index.html が 3MB 未満になった", 新B < 3 * 1024 * 1024, 新B);
  } finally {
    await b.close(); srv.close();
  }
  console.log("\n" + "═".repeat(60));
  console.log(`  合計 ${pass + fail} 件 / 通った ${pass} / 落ちた ${fail}`);
  if (落ち.length) { console.log("  落ちたもの:"); 落ち.forEach((x) => console.log("   - " + x)); }
  console.log("═".repeat(60));
  process.exit(fail ? 1 : 0);
})();
