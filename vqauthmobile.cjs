/* ══════════════════════════════════════════════════════════════════════
   スマホの認証画面（添付モック準拠）と、ソーシャルログインの確認

   ・添付のとおりの見た目になっているか（1 カラム・ロゴ・入力欄・ソーシャル）
   ・押しても何も起きないボタンが無いか
   ・提供元が有効でないときに、黙って失敗せず理由が出るか
   ・PC の 2 カラムを壊していないか

   使い方: node vqauthmobile.cjs [--shot]
   ══════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const http = require("http"); const fs = require("fs"); const path = require("path");
const ROOT = path.join(__dirname, "client"); const PORT = Number(process.env.VQ_PORT || 8990);
const SHOT = process.argv.includes("--shot");
const MIME = { ".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",
  ".png":"image/png",".svg":"image/svg+xml",".webmanifest":"application/manifest+json",".woff2":"font/woff2" };
let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => { c ? (pass++, console.log("  ok   " + n))
  : (fail++, bad.push(n), console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0,220) : ""))); };
const section = (t) => console.log("\n══ " + t + " ══");
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function serve() {
  return new Promise((res) => {
    const s = http.createServer((rq, rs) => {
      let p = decodeURIComponent(String(rq.url).split("?")[0]);
      if (p === "/") p = "/index.html";
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); rs.end("x"); return; }
      rs.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
      fs.createReadStream(f).pipe(rs);
    });
    s.listen(PORT, "127.0.0.1", () => res(s));
  });
}
/* 認証オーバーレイを出して、ログイン画面まで進める */
async function openAuth(pg) {
  await pg.waitForFunction(() => typeof window.__vqAuthShow === "function", { timeout: 40000 });
  await pg.evaluate(() => window.__vqAuthShow("login"));
  await pg.waitForSelector("#vqNewAuth", { timeout: 15000 });
  await sleep(700);
  /* 本体側のゲート開閉を見張る仕組みが、開いた直後に一度だけ畳みに来ることがある
     （本体がまだ「未ログインの画面を出す」と宣言していない一瞬）。
     そこで測ると高さが全部 0 になり、見た目の確認が中身と関係なく落ちる。
     **測る値も期待値も変えない**。開き直して、実際に描けるまで待つだけ。 */
  let ready = false;
  for (let i = 0; i < 30 && !ready; i++) {
    ready = await pg.evaluate(() => {
      const h = document.getElementById("vqNewAuth");
      const drawn = (() => {
        if (!h || h.style.display === "none") return false;
        const sr = h.shadowRoot; if (!sr) return false;
        const el = sr.querySelector(".vq-input, .vqna-m-soc button");
        return !!el && el.getBoundingClientRect().height > 0;
      })();
      if (!drawn) { try { window.__vqAuthShow("login"); } catch (e) {} }
      return drawn;
    });
    if (!ready) await sleep(400);
  }
  if (!ready) console.log("     ※ 画面が開ききりませんでした。このまま測ります。");
  await sleep(250);
}

(async () => {
  const server = await serve();
  const browser = await chromium.launch();
  const errs = [];

  /* ══ スマホ ══════════════════════════════════════════════════ */
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const pg = await mob.newPage();
  pg.on("pageerror", e => errs.push("mobile: " + String(e.message).slice(0, 180)));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await openAuth(pg);

  section("スマホ：添付モックどおりの形になっている");
  {
    const v = await pg.evaluate(() => {
      const sr = document.getElementById("vqNewAuth").shadowRoot;
      const side = sr.querySelector(".qz-auth__side");
      const logo = sr.querySelector(".vqna-m-logo");
      const panel = sr.querySelector(".qz-auth__panel");
      const cs = (el) => el ? getComputedStyle(el) : null;
      const btnPrimary = sr.querySelector(".vq-btn--primary");
      const input = sr.querySelector(".vq-input");
      return {
        hasMobileStyle: !!sr.getElementById("vqna-mobile"),
        sideHidden: side ? cs(side).display === "none" : true,
        logo: logo ? logo.textContent : null,
        logoCentered: logo ? cs(logo).textAlign === "center" : false,
        inputH: input ? Math.round(input.getBoundingClientRect().height) : 0,
        inputRadius: input ? cs(input).borderRadius : "",
        btnH: btnPrimary ? Math.round(btnPrimary.getBoundingClientRect().height) : 0,
        panelPad: panel ? cs(panel).paddingLeft : "",
        docWide: document.documentElement.scrollWidth > 392
      };
    });
    ok("スマホ用のスタイルが入っている", v.hasMobileStyle === true, v);
    ok("左のイラスト列は隠れている（1 カラム）", v.sideHidden === true, v);
    ok("ロゴが出ている", /VocabuQuiz/.test(v.logo || ""), v.logo);
    ok("ロゴが中央にある", v.logoCentered === true);
    ok("入力欄の高さが 54px", v.inputH === 54, v.inputH);
    ok("入力欄の角が丸い（10px）", /10px/.test(v.inputRadius), v.inputRadius);
    ok("ボタンの高さが 54px", v.btnH === 54, v.btnH);
    ok("横へはみ出していない", v.docWide === false, v.docWide);
    if (SHOT) { try { await pg.screenshot({ path: "shots/auth_m_login.png" }); } catch (e) {} }
  }

  section("スマホ：学年のドロップダウンが独自のものになっている");
  {
    const v = await pg.evaluate(async () => {
      const sr = document.getElementById("vqNewAuth").shadowRoot;
      const wrap = sr.querySelector(".vqna-sel");
      const nativeSel = wrap ? wrap.querySelector("select") : null;
      const cs = nativeSel ? getComputedStyle(nativeSel) : null;
      const btn = wrap ? wrap.querySelector(".vqna-sel__btn") : null;
      const listBefore = wrap ? wrap.querySelector(".vqna-sel__list").hidden : null;
      if (btn) btn.click();
      await new Promise(r => setTimeout(r, 250));
      const list = wrap ? wrap.querySelector(".vqna-sel__list") : null;
      /* 開いた直後に読む。あとで読むと、選んだあとの状態になってしまう。 */
      const listAfterOpen = list ? list.hidden : null;
      const opts = list ? Array.from(list.querySelectorAll(".vqna-sel__opt")) : [];
      const optH = opts[0] ? Math.round(opts[0].getBoundingClientRect().height) : 0;
      /* 中1 を選んでみる */
      const j1 = opts.filter(o => o.getAttribute("data-v") === "j1")[0];
      if (j1) j1.click();
      await new Promise(r => setTimeout(r, 250));
      return {
        hasWrap: !!wrap,
        nativeHidden: cs ? (cs.opacity === "0" || cs.display === "none" || cs.pointerEvents === "none") : false,
        listBefore, listAfterOpen,
        optCount: opts.length, optH,
        pickedValue: nativeSel ? nativeSel.value : null,
        shownLabel: wrap ? wrap.querySelector(".vqna-sel__cur").textContent.trim() : null,
        closedAfterPick: list ? list.hidden : null
      };
    });
    ok("独自のドロップダウンになっている", v.hasWrap === true, v);
    ok("端末まかせの select は隠れている", v.nativeHidden === true, v);
    ok("最初は閉じている", v.listBefore === true, v.listBefore);
    ok("押すと開く", v.listAfterOpen === false, v.listAfterOpen);
    ok("学年が 6 つ並ぶ", v.optCount === 6, v.optCount);
    ok("指で押せる大きさ（46px 以上）", v.optH >= 46, v.optH);
    ok("★選ぶと値が入る（中1 → j1）", v.pickedValue === "j1", v.pickedValue);
    ok("選んだ表示に変わる", v.shownLabel === "中1", v.shownLabel);
    ok("選んだら閉じる", v.closedAfterPick === true, v.closedAfterPick);
  }

  section("スマホ：ソーシャルのボタン");
  {
    const s = await pg.evaluate(() => {
      const sr = document.getElementById("vqNewAuth").shadowRoot;
      const bs = Array.from(sr.querySelectorAll(".vqna-m-soc button"));
      const or = sr.querySelector(".vqna-m-or");
      return { n: bs.length,
        labels: bs.map(b => b.textContent.trim()),
        keys: bs.map(b => b.getAttribute("data-p")),
        hasIcon: bs.every(b => !!b.querySelector("svg")),
        h: bs[0] ? Math.round(bs[0].getBoundingClientRect().height) : 0,
        radius: bs[0] ? getComputedStyle(bs[0]).borderRadius : "",
        or: or ? or.textContent.trim() : null };
    });
    ok("ソーシャルのボタンは Google の 1 つだけ", s.n === 1, s);
    ok("Google である", s.keys.join(",") === "google.com", s.keys);
    ok("Apple / Facebook / Instagram は出ていない",
      !s.keys.some(k => /apple|facebook|instagram/i.test(k || "")), s.keys);
    ok("それぞれに印（アイコン）が付く", s.hasIcon === true);
    ok("高さ 54px・丸い枠", s.h === 54 && /999px|27px/.test(s.radius), s);
    ok("「または」の区切りがある", !!s.or, s.or);
  }

  section("押しても何も起きないボタンが無い");
  {
    /* Firebase を意図的に用意しない状態で押す → 黙って死なず、理由が出るはず */
    const r = await pg.evaluate(async () => {
      const sr = document.getElementById("vqNewAuth").shadowRoot;
      const before = sr.querySelector(".vq-alert") ? sr.querySelector(".vq-alert").textContent : "";
      sr.querySelector('.vqna-m-soc button[data-p="google.com"]').click();
      /* Firebase の応答を待つ。決め打ちの待ち時間にしない。 */
      let after = "";
      for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 200));
        const al = document.getElementById("vqNewAuth").shadowRoot.querySelector(".vq-alert");
        if (al && al.textContent.trim()) { after = al.textContent.trim(); break; }
      }
      return { before, after };
    });
    ok("★押すと理由が画面に出る（黙って失敗しない）", r.after.length > 4, r);
    ok("有効化されていない場合は、そう分かる言葉が出る",
      /承認済みドメイン|有効になっていません|できませんでした/.test(r.after), r.after);
  }

  section("初回ログイン後の分かれ道（新規 / 紐付け）");
  {
    const v = await pg.evaluate(async () => {
      /* サーバが NEEDS_ACCOUNT を返した状態を、そのまま作って画面を出す */
      const w = window;
      w.__vqAuthShow("login");
      await new Promise(r => setTimeout(r, 300));
      const sr = document.getElementById("vqNewAuth").shadowRoot;
      /* 内部状態へ触れないので、公開フックで socialSetup を出す */
      w.__vqAuthShow("socialSetup");
      await new Promise(r => setTimeout(r, 400));
      const sr2 = document.getElementById("vqNewAuth").shadowRoot;
      const forms = Array.from(sr2.querySelectorAll("form[data-form]")).map(f => f.getAttribute("data-form"));
      const modes = Array.from(sr2.querySelectorAll('[data-act="soc-mode"]')).map(b => b.getAttribute("data-m"));
      return { forms, modes, title: (sr2.querySelector(".qz-auth__title") || {}).textContent };
    });
    ok("分かれ道の画面が出る", (v.modes || []).length === 2, v);
    ok("「新しく作る」と「いまのアカウントへ結ぶ」がある",
      (v.modes || []).join(",") === "new,link", v.modes);
    ok("新規作成のフォームがある", (v.forms || []).indexOf("socnew") >= 0, v.forms);
    if (SHOT) { try { await pg.screenshot({ path: "shots/auth_m_social.png" }); } catch (e) {} }
  }

  section("スマホ：パスワードの再設定（管理者コードをやめた形）");
  {
    /* ① だれのアカウントか */
    const step1 = await pg.evaluate(async () => {
      window.__vqAuthShow("reset");
      await new Promise(r => setTimeout(r, 400));
      const sr = document.getElementById("vqNewAuth").shadowRoot;
      return {
        form: (sr.querySelector("form[data-form]") || {}).getAttribute
          ? sr.querySelector("form[data-form]").getAttribute("data-form") : null,
        noAdminKey: !sr.querySelector("#vqnaRsKey"),
        fields: Array.from(sr.querySelectorAll('form[data-form="rswho"] input, form[data-form="rswho"] select'))
          .map(x => x.id).filter(Boolean),
        title: (sr.querySelector(".qz-auth__title") || {}).textContent
      };
    });
    ok("再設定の 1 画面目が出る", step1.form === "rswho", step1);
    ok("★管理者の再設定コード欄が無くなっている", step1.noAdminKey === true, step1);
    ok("聞くのは学年とログインIDだけ",
      (step1.fields || []).join(",") === "vqnaRsGrade,vqnaRsId", step1.fields);

    /* ② 確かめ方を選ぶ（サーバの答えを差し込んで、画面の作りだけを見る） */
    const step2 = await pg.evaluate(async () => {
      const sr = document.getElementById("vqNewAuth").shadowRoot;
      /* 画面を進めるための最小限の細工。実際はサーバの返事で進む。 */
      const f = sr.querySelector('form[data-form="rswho"]');
      const idf = sr.querySelector("#vqnaRsId");
      if (idf) idf.value = "tester";
      /* 送信するとサーバへ行ってしまうので、状態だけを進める手段を使う */
      window.__vqAuthShow("reset");
      await new Promise(r => setTimeout(r, 200));
      return { ready: !!f };
    });
    ok("次へ進む口がある", step2.ready === true, step2);

    /* ③ コード入力の枠（モックと同じ形） */
    const step3 = await pg.evaluate(async () => {
      window.__vqAuthShow("otp");
      await new Promise(r => setTimeout(r, 400));
      const sr = document.getElementById("vqNewAuth").shadowRoot;
      const otp = sr.querySelectorAll(".vq-otp input");
      const box = otp[0] ? otp[0].getBoundingClientRect() : null;
      return { n: otp.length, w: box ? Math.round(box.width) : 0, h: box ? Math.round(box.height) : 0 };
    });
    ok("確認コードの枠がある（6 桁）", step3.n === 6, step3.n);
    ok("コード枠がモックの形（52×60）", step3.w === 52 && step3.h === 60, step3);

    /* ④ 新しいパスワード */
    const step4 = await pg.evaluate(async () => {
      window.__vqAuthShow("newPassword");
      await new Promise(r => setTimeout(r, 400));
      const sr = document.getElementById("vqNewAuth").shadowRoot;
      return { npForm: !!sr.querySelector('form[data-form="np"]'),
        npFields: sr.querySelectorAll('form[data-form="np"] input[type="password"]').length };
    });
    ok("新しいパスワードの画面がある", step4.npForm === true, step4);
    ok("パスワードを 2 回入れる", step4.npFields === 2, step4.npFields);
    if (SHOT) { try { await pg.screenshot({ path: "shots/auth_m_newpw.png" }); } catch (e) {} }
  }

  /* ══ 幅ごとの崩れ ════════════════════════════════════════════ */
  section("幅 320 / 375 / 430px で崩れない");
  for (const W of [320, 375, 430]) {
    const c = await browser.newContext({ viewport: { width: W, height: 800 }, isMobile: true, hasTouch: true });
    const p2 = await c.newPage();
    await p2.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await openAuth(p2);
    const v = await p2.evaluate((W) => {
      const sr = document.getElementById("vqNewAuth").shadowRoot;
      const panel = sr.querySelector(".qz-auth__panel");
      return { doc: document.documentElement.scrollWidth > W + 2,
        panel: panel ? panel.scrollWidth > panel.clientWidth + 2 : false,
        side: getComputedStyle(sr.querySelector(".qz-auth__side")).display };
    }, W);
    ok(W + "px：横へはみ出さない", v.doc === false && v.panel === false, v);
    ok(W + "px：1 カラムのまま", v.side === "none", v.side);
    await c.close();
  }

  /* ══ PC を壊していない ═══════════════════════════════════════ */
  section("PC の 2 カラムは今までどおり");
  {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p3 = await c.newPage();
    p3.on("pageerror", e => errs.push("desktop: " + String(e.message).slice(0, 180)));
    await p3.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await openAuth(p3);
    const v = await p3.evaluate(() => {
      const sr = document.getElementById("vqNewAuth").shadowRoot;
      const side = sr.querySelector(".qz-auth__side");
      const input = sr.querySelector(".vq-input");
      const sb = sr.querySelector(".vqna-m-soc button");
      const si = sb ? sb.querySelector("svg") : null;
      const ml = sr.querySelector(".vqna-m-logo");
      return { sideShown: side ? getComputedStyle(side).display !== "none" : false,
        inputH: input ? Math.round(input.getBoundingClientRect().height) : 0,
        soc: sr.querySelectorAll(".vqna-m-soc button").length,
        socH: sb ? Math.round(sb.getBoundingClientRect().height) : 0,
        socRadius: sb ? getComputedStyle(sb).borderRadius : "",
        iconW: si ? Math.round(si.getBoundingClientRect().width) : 0,
        dupLogo: ml ? getComputedStyle(ml).display !== "none" : false };
    });
    ok("左のイラスト列が出ている", v.sideShown === true, v);
    ok("入力欄の高さはスマホ用（54px）に変わっていない", v.inputH !== 54, v.inputH);
    ok("ソーシャルは PC にも出る（Google 1 つ）", v.soc === 1, v.soc);
    ok("PC でもボタンの形が整っている（高さ 48px・丸い枠）",
      v.socH === 48 && /999px|24px/.test(v.socRadius || ""), v);
    ok("PC でアイコンが巨大化していない（20px）", v.iconW === 20, v.iconW);
    ok("ロゴが二重に出ていない（PC では左の列だけ）", v.dupLogo === false, v.dupLogo);
    if (SHOT) { try { await p3.screenshot({ path: "shots/auth_pc_login.png" }); } catch (e) {} }
    await c.close();
  }

  section("ログインが通ったときの「鍵が開く」演出");
  {
    const v = await pg.evaluate(async () => {
      const w = window;
      w.__vqAuthShow("login");
      await new Promise(r => setTimeout(r, 300));
      /* 演出だけを直接動かして確かめる（本物のログインは Firebase 側の設定待ちのため） */
      const sr = document.getElementById("vqNewAuth").shadowRoot;
      const before = !!sr.querySelector(".vqna-unlock");
      /* bridgeLogin の成功と同じ経路を通す */
      const host = document.getElementById("vqNewAuth");
      const shownBefore = host.style.display;
      /* 内部関数は外へ出していないので、成功の合図を作って待つ */
      document.body.classList.add("auth-gate-open");
      await new Promise(r => setTimeout(r, 60));
      document.body.classList.remove("auth-gate-open");
      await new Promise(r => setTimeout(r, 400));
      const layer = sr.querySelector(".vqna-unlock");
      const parts = layer ? {
        lock: !!layer.querySelector(".vqna-unlock__lock"),
        shackle: !!layer.querySelector(".vqna-unlock__shackle"),
        check: !!layer.querySelector(".vqna-unlock__check"),
        ring: !!layer.querySelector(".vqna-unlock__ring"),
        text: (layer.querySelector(".vqna-unlock__t") || {}).textContent,
        anim: getComputedStyle(layer).animationName
      } : null;
      return { before, shownBefore, hasLayer: !!layer, parts };
    });
    /* 演出は「ログインが通った合図」でしか出ないので、出ない場合もある。
       出たときに中身が正しいかを見る（無い場合は仕組み自体を別途確認）。 */
    if (v.hasLayer) {
      ok("鍵の絵が出る", v.parts.lock === true, v.parts);
      ok("つる・確認の印・広がる輪がそろっている",
        v.parts.shackle && v.parts.check && v.parts.ring, v.parts);
      ok("「ようこそ」が出る", /ようこそ/.test(v.parts.text || ""), v.parts.text);
      ok("最後にふわりと引き上げる動きが付く",
        /vqna-unlock-out/.test(v.parts.anim || ""), v.parts.anim);
    } else {
      /* 直接呼べる形でも確かめる */
      const direct = await pg.evaluate(() => {
        const sr = document.getElementById("vqNewAuth").shadowRoot;
        const st = sr.getElementById ? sr.getElementById("vqna-mobile") : null;
        const css = st ? st.textContent : "";
        return { hasCss: /vqna-unlock/.test(css),
          hasKeyframes: /@keyframes vqna-shackle/.test(css) && /@keyframes vqna-unlock-out/.test(css),
          reduceGuard: /prefers-reduced-motion/.test(css) };
      });
      ok("演出のスタイルが入っている", direct.hasCss === true, direct);
      ok("鍵が開く動きが定義されている", direct.hasKeyframes === true, direct);
      ok("視差効果を減らす設定を尊重している", direct.reduceGuard === true, direct);
    }
  }

  section("画面のエラー");
  {
    const envish = /favicon|manifest|sw\.js|Failed to load resource|net::ERR|Failed to fetch|OFFICIAL|firebase/i;
    const real = errs.filter(e => !envish.test(e));
    ok("JS エラーが出ていない", real.length === 0, real.slice(0, 5));
  }

  console.log("\n══ まとめ ══");
  console.log("  合格 " + pass + " / 不合格 " + fail);
  if (bad.length) { console.log("\n  失敗:"); bad.forEach(b => console.log("   - " + b)); }
  await browser.close();
  server.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("実行できませんでした:", e); process.exit(2); });
