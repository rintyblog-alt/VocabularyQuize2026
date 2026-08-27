#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   vqfix0827.cjs — 2026-08-27 の 訴え 7 件の 検査

   ① AR Board が スクロールできる（本物の DOM で 測る）
   ② Lumi の フチが **チカチカしない**
        ・動かすのは 透明度だけ（box-shadow を 動かさない）
        ・低スペックでは 止まる
        ・vq-ds.css の animation-duration:.08s !important が 消えている
   ③ 左パネルの プロフィールが 本体と 揃う／公式マークが 落ちない
   ④ 表紙（バナー）と 文字が 重ならない → vqbanner.cjs が 受け持つ
   ⑤ リスニングの 読み込み … play が 端末の 置き場所を 通る／先読みが 在る
   ⑥ 同期 … 大きい 荷は 小分け。断られたら 画面へ 伝える
   ⑦ ことわざ … ログインの 返事を 待ってから 決める

   本番には 一切 触らない（ファイルと 手元の DOM だけ）。
   ══════════════════════════════════════════════════════════════════════ */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const 根 = __dirname;
let OK = 0, NG = 0;
const ok = (n, m) => { OK++; console.log("  OK  " + n + (m ? " … " + m : "")); };
const ng = (n, m) => { NG++; console.log("  NG  " + n + (m ? " … " + m : "")); };
const 見る = (n, 真, m) => (真 ? ok(n, m) : ng(n, m));

function src(前, dir) {
  const d = path.join(根, dir || "js-src");
  const f = fs.readdirSync(d).find((x) => x.startsWith(前) && !x.includes(".backup"));
  if (!f) throw new Error("見つからない: " + 前 + " in " + dir);
  return fs.readFileSync(path.join(d, f), "utf8");
}
function cssFile(前) {
  const d = path.join(根, "client", "css");
  const f = fs.readdirSync(d).find((x) => x.startsWith(前) && x.endsWith(".css"));
  if (!f) throw new Error("見つからない: " + 前);
  return fs.readFileSync(path.join(d, f), "utf8");
}
/* SHELL_CSS を そのまま 取り出す */
function shellCss() {
  const s = src("vq2-app.");
  const i = s.indexOf("var SHELL_CSS =");
  const j = s.indexOf("\n", s.indexOf('";', i));
  return eval(s.slice(i, j).replace(/^var SHELL_CSS =/, "").replace(/;\s*$/, ""));
}
/* 配列で 組んである CSS を そのまま 取り出す */
function 配列CSS(s, 頭) {
  const i = s.indexOf(頭);
  if (i < 0) throw new Error("CSS の頭が 無い: " + 頭);
  let d = 0, j = i + 頭.length - 1;
  for (; j < s.length; j++) {
    const c = s[j];
    if (c === "[") d++;
    else if (c === "]") { d--; if (d === 0) { j++; break; } }
    else if (c === '"') { j++; while (j < s.length && !(s[j] === '"' && s[j - 1] !== "\\")) j++; }
  }
  return eval(s.slice(i + 頭.length - 1, j)).join("");
}

(async () => {
  const browser = await chromium.launch();

  /* ══ ① AR Board が スクロールできる ══════════════════════════════ */
  console.log("── ① AR Board の スクロール ─────────────────────────");
  {
    const SC = shellCss();
    const BOARD = 配列CSS(src("ui.js", "client/core/board"), "var CSS = [");
    const page = await browser.newPage({ viewport: { width: 390, height: 640 } });
    /* U.mount と 同じ 形（.vq2-root は flex 縦・overflow:hidden）を 作る */
    let カード = "";
    for (let i = 0; i < 24; i++) {
      カード += '<button class="vqb-card" type="button" data-b="b' + i + '">'
        + '<div class="vqb-thumb"><span class="vqb-none">ボード ' + i + "</span></div>"
        + '<div class="vqb-body"><div class="vqb-t">ボード ' + i + "</div>"
        + '<div class="vqb-m">8/27 12:00</div></div></button>';
    }
    await page.setContent(
      "<!doctype html><meta charset=utf-8><style>html,body{margin:0;height:100%}"
      + "#h{position:fixed;inset:0}</style><div id=h></div>"
      + "<script>const h=document.getElementById('h');const sh=h.attachShadow({mode:'open'});"
      + "const st=document.createElement('style');st.textContent=" + JSON.stringify(SC + BOARD) + ";sh.appendChild(st);"
      + "const w=document.createElement('div');w.className='vq2-root is-sheet is-mobile';"
      + "w.innerHTML=" + JSON.stringify('<div class="vqb-wrap"><div class="vqb-head"><h2>AR Board</h2></div><div class="vqb-grid">' + カード + "</div></div>")
      + ";sh.appendChild(w);</script>");
    await page.waitForTimeout(80);
    const r = await page.evaluate(() => {
      const sh = document.getElementById("h").shadowRoot;
      const root = sh.querySelector(".vq2-root");
      const wrap = sh.querySelector(".vqb-wrap");
      const cs = getComputedStyle(wrap);
      const 前 = wrap.scrollTop;
      wrap.scrollTop = 99999;
      const 後 = wrap.scrollTop;
      return {
        rootOverflow: getComputedStyle(root).overflowY,
        overflow: cs.overflowY,
        scrollH: wrap.scrollHeight, clientH: wrap.clientHeight,
        動いた: 後 - 前, 中身の高さ: root.scrollHeight, 枠の高さ: root.clientHeight
      };
    });
    await page.close();
    見る("外枠は はみ出しを 隠す（前提）", r.rootOverflow === "hidden", r.rootOverflow);
    見る("中身が 枠より 高い（前提）", r.scrollH > r.clientH, r.scrollH + " > " + r.clientH);
    見る("中身の枠が すべる形になっている", r.overflow === "auto" || r.overflow === "scroll", r.overflow);
    見る("実際に スクロールできた", r.動いた > 100, r.動いた + "px 動いた");
  }

  /* ══ ② Lumi の フチ ══════════════════════════════════════════════ */
  console.log("── ② Lumi の フチ（チカチカ）──────────────────────────");
  {
    const live = src("vq-live.");
    const i = live.indexOf("@keyframes vqLiveGlow");
    const 枠 = live.slice(i, i + 200);
    見る("フチの 動きは 透明度だけ", /@keyframes vqLiveGlow\{0%,100%\{opacity:0\}50%\{opacity:1\}\}/.test(枠), 枠.split('",')[0].slice(0, 70));
    見る("box-shadow を 動かしていない", !/@keyframes vqLiveGlow[\s\S]{0,300}box-shadow/.test(live));
    見る("低スペックでは フチを 止める", live.indexOf("body.low-perf #vqLiveEdge .glow::after{animation:none !important;") >= 0);
    見る("低スペックでは 点も 止める", live.indexOf("body.low-perf #vqLiveEdge .dot{animation:none !important;}") >= 0);

    /* 覚え書き（/* … *\/）の 中には わざと 昔の 書きかたを 残してある。
       消えたことを 見るときは **本文だけ**を 見る。 */
    const ds = cssFile("vq-ds.").replace(/\/\*[\s\S]*?\*\//g, "");
    見る("vq-ds から animation-duration:.08s!important が 消えている",
      !/animation-duration:\s*\.08s\s*!important/.test(ds));
    見る("transition の 短縮は 残っている（軽さは 落とさない）",
      /body\.low-perf \*\{transition-duration:\.08s !important;\}/.test(ds));
    見る("backdrop-filter 切りは 残っている",
      /body\.low-perf \*[^\n]*backdrop-filter:\s*none\s*!important/.test(ds));
  }

  /* ══ ③ 左パネルの プロフィール ═══════════════════════════════════ */
  console.log("── ③ 左パネルの プロフィールと 公式マーク ─────────────");
  {
    const shell = src("vq-shell.");
    見る("名前は 中身ごと 写す（textContent 直書きを やめた）",
      shell.indexOf("elName.textContent = n") < 0 && shell.indexOf("elName.innerHTML = 名.html") >= 0);
    見る("公式マーク（svg.vqbadge）を 拾っている", shell.indexOf('e.querySelector("svg.vqbadge")') >= 0);
    見る("本体からの 知らせを 受ける", shell.indexOf('window.addEventListener("vq-identity-changed", syncIdentity)') >= 0);
    見る("上の帯も 知らせを 受ける", shell.indexOf('window.addEventListener("vq-identity-changed", syncAva)') >= 0);
    見る("上の帯が 自分を 消さない（親の innerHTML 書き換えを やめた）",
      shell.indexOf("av.parentNode.innerHTML =") < 0);

    const core = src("vq-core.");
    見る("本体が VQBADGE を 使う", core.indexOf("function _appVqBadgeHtml(") >= 0);
    見る("印は 名前の 左", /_appVqBadgeHtml\(entity\)\}<span class="app-name-text"/.test(core));
    見る("本体が 書き換えたら 知らせる", core.indexOf('new CustomEvent("vq-identity-changed"') >= 0);

    /* 本物の DOM で、印つきの 名前を 写せるか */
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    await page.setContent('<div id="appV2SidebarName">'
      + '<svg class="vqbadge vqbadge--official" viewBox="0 0 24 24" width="18" height="18"><path d="M1 1"/></svg>'
      + '<span class="app-name-text">りんと</span></div>'
      + '<div id="appV2SidebarAvatar"><img class="app-avatar-image" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="><span class="app-avatar-fallback">R</span></div>');
    const 写 = await page.evaluate(() => {
      function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
      function 名前を写す(id) {
        const e = document.getElementById(id);
        if (!e) return { html: "", text: "" };
        const t = e.querySelector(".app-name-text") || e;
        const 字 = (t.textContent || "").trim();
        const b = e.querySelector("svg.vqbadge") || e.querySelector(".app-verified-badge");
        return { html: (b ? b.outerHTML : "") + '<span class="nm">' + esc(字) + "</span>", text: 字 };
      }
      const r = 名前を写す("appV2SidebarName");
      const src = document.getElementById("appV2SidebarAvatar");
      const img = src.querySelector("img");
      return { text: r.text, html: r.html, 絵: img ? img.getAttribute("src") : "" };
    });
    await page.close();
    見る("写した 名前に 余計な 字が 混ざらない", 写.text === "りんと", JSON.stringify(写.text));
    見る("写した 名前に 公式マークが 残る", /svg class="vqbadge/.test(写.html));
    見る("アイコンの 住所が 取れる", 写.絵.indexOf("data:image/gif") === 0);

    /* ── ここからは **本物の vq-shell を 読み込んで** 動かす ──────
       書き写した 関数では「直したつもり」が 通ってしまう。
       出来上がった client/js の ものを そのまま 動かす。 */
    const shellJs = (() => {
      const d = path.join(根, "client", "js");
      const f = fs.readdirSync(d).find((x) => /^vq-shell\.[0-9a-f]+\.js$/.test(x));
      return f ? fs.readFileSync(path.join(d, f), "utf8") : "";
    })();
    見る("出来上がった vq-shell が 在る", !!shellJs, shellJs ? (shellJs.length + " 字") : "無い");
    if (shellJs) {
      const p2 = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await p2.setContent('<!doctype html><meta charset=utf-8>'
        + '<body class="" data-ui-v2="1" data-app-tab="home">'
        + '<div id="appTabBar" style="position:relative;width:260px;height:800px"></div>'
        + '<div id="appV2SidebarName">名無し</div>'
        + '<div id="appV2SidebarAvatar">N</div>'
        + '<div id="appV2SidebarMeta">@none</div>'
        + '<div id="appV2QreditValue">Q 0</div>'
        + '<div id="appSidebarNotifyCount">0</div>');
      await p2.addScriptTag({ content: shellJs });
      await p2.waitForTimeout(400);
      const 立った = await p2.evaluate(() =>
        !!(document.getElementById("vqShell") && document.getElementById("vqShell").shadowRoot));
      見る("左パネルが 立った", 立った);
      if (立った) {
        /* ① 本体が あとから プロフィールを 書き換える（実際の 作りと 同じ形） */
        await p2.evaluate(() => {
          const a = document.getElementById("appV2SidebarAvatar");
          const img = document.createElement("img");
          img.className = "app-avatar-image";
          img.src = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
          const fb = document.createElement("span");
          fb.className = "app-avatar-fallback"; fb.textContent = "R";
          a.classList.add("has-image"); a.replaceChildren(img, fb);
          const n = document.getElementById("appV2SidebarName");
          n.innerHTML = '<svg class="vqbadge vqbadge--official" viewBox="0 0 24 24" width="18" height="18">'
            + '<path d="M1 1"/></svg><span class="app-name-text">りんと</span>';
          window.dispatchEvent(new CustomEvent("vq-identity-changed"));
        });
        await p2.waitForTimeout(200);
        const r1 = await p2.evaluate(() => {
          const sh = document.getElementById("vqShell").shadowRoot;
          const av = sh.querySelector("[data-avatar]");
          const nm = sh.querySelector("[data-name]");
          return { 絵: av.querySelector("img") ? av.querySelector("img").getAttribute("src") : "",
                   印: !!nm.querySelector("svg.vqbadge"),
                   字: (nm.querySelector(".nm") || nm).textContent.trim() };
        });
        見る("左パネルの アイコンが 本体と そろう", r1.絵.indexOf("data:image/gif") === 0, r1.絵.slice(0, 24));
        見る("左パネルに 公式マークが 出る", r1.印);
        見る("名前に 余計な 字（verified）が 出ない", r1.字 === "りんと", JSON.stringify(r1.字));

        /* ② **20 秒より あとで** 変えても 追いつくか（見回りは 止まっている） */
        await p2.evaluate(() => {
          const a = document.getElementById("appV2SidebarAvatar");
          const img = a.querySelector("img");
          img.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==";
          window.dispatchEvent(new CustomEvent("vq-identity-changed"));
        });
        await p2.waitForTimeout(200);
        const r2 = await p2.evaluate(() => {
          const sh = document.getElementById("vqShell").shadowRoot;
          const av = sh.querySelector("[data-avatar]");
          return av.querySelector("img") ? av.querySelector("img").getAttribute("src") : "";
        });
        見る("あとから 変えても 追いつく（初期のまま 残らない）",
          r2.indexOf("data:image/png") === 0, r2.slice(0, 24));
      }
      await p2.close();
    }
  }

  /* ══ ⑤ リスニングの 読み込み ═════════════════════════════════════ */
  console.log("── ⑤ リスニングの 読み込み時間 ───────────────────────");
  {
    const app = src("vq2-app.");
    見る("play が serverSpeak へ 直行しない",
      app.indexOf("if (!bridgeReady() && !o.noFallback && !o.localOnly) {") < 0);
    見る("先読みが 在る", app.indexOf("function warm(text, o) {") >= 0
      && app.indexOf("function warmQuestions(list, o) {") >= 0);
    見る("先読みを 外へ 出している", /warm: warm, warmQuestions: warmQuestions,/.test(app));
    見る("鳴らしている 最中は 先読みしない", /if \(isPlaying\(\)\) return Promise\.resolve\(\{ 頼んだ: 0, 理由: "再生中" \}\);/.test(app));
    見る("同じものを 二重に 頼まない", app.indexOf("if (先読み中[key]) return 先読み中[key];") >= 0);
    見る("クイズが 先読みを 呼ぶ", /_T\.warmQuestions\(\(session\.questionOrder \|\| \[\]\)/.test(app));
    見る("逃げ道（端末の声）は 残っている",
      app.indexOf('{ ok: true, source: "local", note: "この端末の読み上げで再生しました（声は端末のものです）。" }') >= 0);

    /* ── 本物の 出来上がりを 読み込んで、**通信の 回数を 数える** ────
       「速くなった」は 感想では 決めない。2 回目に 何回 通信したかで 決める。 */
    const appJs = (() => {
      const d = path.join(根, "client", "js");
      const f = fs.readdirSync(d).find((x) => /^vq2-app\.[0-9a-f]+\.js$/.test(x));
      return f ? fs.readFileSync(path.join(d, f), "utf8") : "";
    })();
    見る("出来上がった vq2-app が 在る", !!appJs);
    if (appJs) {
      /* ★ **本物の 住所**で 開く（2026-08-27・実測）。
         setContent だけの 素の頁は 出どころが 無い 扱いになり、
         IndexedDB が 使えない。置き場に しまえないので
         「2 回目も 通信する」ように 見えてしまう。
         この検査のためだけの 小さな 配り手を 立てる。 */
      const http = require("http");
      const 配 = http.createServer((rq, rs) => {
        rs.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        rs.end("<!doctype html><meta charset=utf-8><title>tts</title><body>");
      });
      await new Promise((r) => 配.listen(0, "127.0.0.1", r));
      const 港 = 配.address().port;
      const p3 = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      const 例外 = [];
      p3.on("pageerror", (e) => 例外.push(String(e).slice(0, 160)));
      await p3.goto("http://127.0.0.1:" + 港 + "/");
      /* 通信を すり替える。本物の 読み上げは 使わない（鍵が 要るため）。
         返すのは **本物の WAV の 形**（長さが 測れないと 別の道へ 行く）。 */
      await p3.evaluate(() => {
        window.__回数 = 0;
        const wav = (() => {
          const 秒 = 0.25, r = 8000, n = Math.floor(秒 * r);
          const b = new ArrayBuffer(44 + n * 2), v = new DataView(b);
          const put = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
          put(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); put(8, "WAVEfmt ");
          v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
          v.setUint32(24, r, true); v.setUint32(28, r * 2, true);
          v.setUint16(32, 2, true); v.setUint16(34, 16, true);
          put(36, "data"); v.setUint32(40, n * 2, true);
          for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(i / 6) * 8000, true);
          return b;
        })();
        window.__宛先 = [];
        window.fetch = function (u) {
          const 先 = String((u && u.url) || u || "");
          window.__宛先.push(先);
          /* 数えるのは **読み上げを 作る 頼み**だけ。声の 一覧などは 数えない。 */
          if (先.indexOf("/tts/speak") >= 0) window.__回数++;
          return Promise.resolve(new Response(wav, { status: 200,
            headers: { "Content-Type": "audio/wav", "X-VQ-TTS-Voice": "Kore" } }));
        };
        try { localStorage.setItem("app.auth.token.v1", "dummy-token-for-local-check"); } catch (e) {}
      });
      await p3.addScriptTag({ content: appJs });
      await p3.waitForTimeout(200);
      const 計 = await p3.evaluate(async () => {
        const T = window.VQ2 && window.VQ2.tts;
        if (!T) return { だめ: "tts が 無い" };
        const 文 = "これは 読み込み時間の 検査です。";
        const t0 = performance.now();
        const a = await T.make(文, { voice: "Kore", speed: 1 });
        const t1 = performance.now();
        const 通信A = window.__回数;
        const b = await T.make(文, { voice: "Kore", speed: 1 });
        const t2 = performance.now();
        return {
          一度目: !!a.ok, 二度目: !!b.ok,
          置き場から: !!b.cached,
          通信1: 通信A, 通信2: window.__回数 - 通信A,
          ms1: Math.round(t1 - t0), ms2: Math.round(t2 - t1),
          理由: (a.reason || "") + "/" + (b.reason || "")
        };
      });
      /* ── 先読み。次の問題を **押す前に** 手元へ入れておけるか ── */
      const 先 = await p3.evaluate(async () => {
        const T = window.VQ2 && window.VQ2.tts;
        if (!T || !T.warmQuestions) return { だめ: "先読みが 無い" };
        const 並 = [
          { id: "q1", engine: "audio_choice", script: "1 問目の 原稿です。" },
          { id: "q2", engine: "audio_choice", script: "2 問目の 原稿です。" },
          { id: "q3", engine: "audio_choice", script: "3 問目の 原稿です。" },
          { id: "q4", engine: "audio_choice", script: "4 問目の 原稿です。" },
          { id: "q5", engine: "dictation", correctAnswer: "" }
        ];
        const 前 = window.__回数;
        await T.warmQuestions(並, { from: 0, ahead: 2, preset: { audio: { voice: "Kore", speed: 1 } } });
        /* 先読みは 待たずに 走る。落ち着くまで 少し 待つ。 */
        await new Promise((r) => setTimeout(r, 700));
        const 先読みの通信 = window.__回数 - 前;
        /* いま 2 問目を 押したとする。手元に 在れば 通信 0 回。 */
        const 前2 = window.__回数;
        const r2 = await T.make("2 問目の 原稿です。", { voice: "Kore", speed: 1 });
        return {
          先読みの通信,
          二問目の通信: window.__回数 - 前2,
          二問目は手元: !!r2.cached,
          /* 原稿の 無い 問題（q5）は 数に 入らない */
          四問目の通信: await (async () => {
            const 前3 = window.__回数;
            await T.make("4 問目の 原稿です。", { voice: "Kore", speed: 1 });
            return window.__回数 - 前3;
          })()
        };
      });
      if (先.だめ) ng("先読みを 動かせた", 先.だめ);
      else {
        見る("先読みが いまの分＋2 問先まで 作る（3 本）", 先.先読みの通信 === 3, 先.先読みの通信 + " 本");
        見る("次の問題は **通信 0 回**で 鳴る", 先.二問目の通信 === 0, 先.二問目の通信 + " 回");
        見る("次の問題は 手元から 出る", 先.二問目は手元 === true);
        見る("先読みしていない 問題は ちゃんと 作りに行く", 先.四問目の通信 === 1, 先.四問目の通信 + " 回");
      }

      await p3.close();
      配.close();
      if (計.だめ) ng("読み上げを 動かせた", 計.だめ);
      else {
        見る("1 回目は 作れる", 計.一度目 === true, JSON.stringify(計));
        見る("1 回目は 通信する", 計.通信1 >= 1, 計.通信1 + " 回");
        見る("2 回目も 鳴らせる", 計.二度目 === true, JSON.stringify(計));
        見る("2 回目は **通信 0 回**", 計.通信2 === 0, 計.通信2 + " 回");
        見る("2 回目は 端末の 置き場から 出る", 計.置き場から === true);
        見る("2 回目は 1 回目より 速い",
          計.ms2 <= 計.ms1, "1 回目 " + 計.ms1 + "ms → 2 回目 " + 計.ms2 + "ms");
        console.log("      （実測: 1 回目 " + 計.ms1 + "ms / 2 回目 " + 計.ms2 + "ms・通信 "
          + 計.通信1 + " → " + 計.通信2 + " 回）");
      }
      見る("読み込みで 赤い字が 出ない", 例外.length === 0, 例外.slice(0, 2).join(" / "));
    }
  }

  /* ══ ⑥ 同期 ═════════════════════════════════════════════════════ */
  console.log("── ⑥ 同期（ストレージへ 全部 保存）───────────────────");
  {
    const cl = fs.readFileSync(path.join(根, "client/core/store/cloud.js"), "utf8");
    見る("荷を 大きさで 小分けする", cl.indexOf("function 荷を小分け(荷) {") >= 0);
    見る("1 回の 上限は サーバ（16MB）より 小さい", /var 一度に送る上限 = 7 \* 1024 \* 1024;/.test(cl));
    見る("鍵 1 つの 上限は サーバと 同じ 12MB", /var 鍵の上限 = 12 \* 1024 \* 1024;/.test(cl));
    見る("大きすぎる鍵は 送らずに 覚える", cl.indexOf("大きすぎる[k] = { バイト: 文.length, とき: Date.now() };") >= 0);
    見る("困りごとを 画面へ 知らせる", cl.indexOf('new CustomEvent("vq-sync-problem"') >= 0);
    見る("「サーバのほうが新しい」は 困りごとに しない",
      cl.indexOf('indexOf("サーバのほうが新しい") < 0') >= 0);
    見る("様子に 大きすぎる鍵が 出る", /大きすぎる: \(function \(\) \{/.test(cl));
    /* 小分けの 中身を 実際に 動かす */
    const 本体 = cl.slice(cl.indexOf("function 荷を小分け(荷) {"),
      cl.indexOf("return 束;\n  }") + "return 束;\n  }".length);
    /* 外に 置いてある 上限も 一緒に 持ち込む（本物の 値を そのまま 使う） */
    const 上限 = /var 一度に送る上限 = ([^;]+);/.exec(cl)[1];
    const 小分け = new Function("荷", "var 一度に送る上限 = " + 上限 + ";\n"
      + 本体.replace(/^function 荷を小分け\(荷\) \{/, "").replace(/\}$/, "") + "\n");
    const 作 = (n, mb) => ({ key: "k" + n, value: "x".repeat(Math.round(mb * 1024 * 1024)) });
    const 束1 = 小分け([作(1, 5), 作(2, 5), 作(3, 5)]);
    見る("5MB×3 は 1 回にまとめない", 束1.length >= 2, 束1.map((b) => b.length).join("+") + " 束");
    束1.forEach((b, i) => {
      const 計 = b.reduce((a, x) => a + x.value.length, 0);
      見る("束 " + (i + 1) + " が 上限内", 計 <= 7 * 1024 * 1024 || b.length === 1,
        Math.round(計 / 1024 / 1024) + "MB / " + b.length + " 件");
    });
    const 束2 = 小分け(Array.from({ length: 25 }, (_, i) => ({ key: "k" + i, value: "y" })));
    見る("1 束は 20 件まで", 束2.every((b) => b.length <= 20), 束2.map((b) => b.length).join("+"));
  }

  /* ══ ⑦ ことわざ ══════════════════════════════════════════════════ */
  console.log("── ⑦ 今日のことわざ ─────────────────────────────────");
  {
    const sc = src("vq-screens.");
    見る("札が 在るのに 名簿が 無いときは 決めない",
      /if \(t\.length > 20\) return "";/.test(sc));
    見る("名簿が 届いたら 描き直す", sc.indexOf("function 諺の知らせを待つ()") >= 0);
    見る("決まらないうちは 描かない", sc.indexOf("if (!印) { 諺の知らせを待つ(); return; }") >= 0);

    /* 同じ人・同じ日なら いつでも 同じ句、日が 変われば 必ず 別の句 */
    const 頭 = sc.indexOf("function 混ぜる(s) {");
    const 尻 = sc.indexOf("/* ★ q() は renderHome");
    const 部 = sc.slice(頭, 尻);
    const f = new Function(部 + "\nreturn { 今日の一句: 今日の一句 };")();
    const 全 = Array.from({ length: 966 }, (_, i) => ["句" + i, "意味" + i]);
    const 同 = f.今日の一句(全, "u123", "2026-08-27");
    const 同2 = f.今日の一句(全, "u123", "2026-08-27");
    見る("同じ人・同じ日は 同じ句", 同 && 同2 && 同.番号 === 同2.番号, "番号 " + (同 && 同.番号));
    const 別人 = f.今日の一句(全, "u999", "2026-08-27");
    見る("人が 違えば 別の句", 別人 && 別人.番号 !== 同.番号, "u123=" + 同.番号 + " / u999=" + 別人.番号);
    let 連続 = 0, 前 = -1;
    for (let d = 0; d < 400; d++) {
      const 日 = new Date(Date.UTC(2026, 7, 27) + d * 86400000).toISOString().slice(0, 10);
      const x = f.今日の一句(全, "u123", 日);
      if (x.番号 === 前) 連続++;
      前 = x.番号;
    }
    見る("400 日 続けて 一度も 同じ句が 続かない", 連続 === 0, "続いた回数 " + 連続);
  }

  await browser.close();
  console.log("\n合計 OK=" + OK + " NG=" + NG);
  process.exit(NG ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
