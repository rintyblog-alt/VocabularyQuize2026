/* ══════════════════════════════════════════════════════════════════════
   Vocabu Workplace — パネルが「真ん中の窓」になっているかの確認

   ・Docs / Sheets / Slides / Forms の 4 つとも、同じ出方か
   ・下からせり上がる帯ではなく、画面の真ん中に出るか
   ・画面いっぱいの幅ではなく、четы角が丸いか
   ・Esc と、背景を押すと閉じるか
   ・細い画面（スマホ）でも真ん中に出るか

   使い方: node vqwpmodal.cjs
   ══════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const http = require("http"); const fs = require("fs"); const path = require("path");
const ROOT = path.join(__dirname, "client"); const PORT = Number(process.env.VQ_PORT || 8993);
const MIME = { ".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",
  ".png":"image/png",".svg":"image/svg+xml",".webmanifest":"application/manifest+json",".woff2":"font/woff2" };

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => { c ? (pass++, console.log("  ok   " + n))
  : (fail++, bad.push(n), console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 260) : ""))); };
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

/* 4 つのアプリと、パネルを開くボタン */
const APPS = [
  { name: "Docs（ワード）",     kind: "docs",   id: "vq-wp-docs",   type: "document",     act: "insert-menu" },
  { name: "Sheets（エクセル）", kind: "sheets", id: "vq-wp-sheets", type: "spreadsheet",  act: "more-tools" },
  { name: "Slides（スライド）", kind: "slides", id: "vq-wp-slides", type: "presentation", act: "more-tools" },
  { name: "Forms（アンケート）", kind: "forms",  id: "vq-wp-forms",  type: "form",         act: "theme" }
];

(async () => {
  const server = await serve();
  const browser = await chromium.launch();

  async function run(viewport, label) {
    const pg = await (await browser.newContext({ viewport })).newPage();
    const errs = [];
    pg.on("pageerror", e => errs.push(String(e.message).slice(0, 180)));
    await pg.goto(`http://127.0.0.1:${PORT}/index.html?vq2=all`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await pg.waitForFunction(() => window.VQ2 && window.VQ2.workplace && window.VQ2.workplace.home, { timeout: 40000 });
    await pg.evaluate(() => { const o = document.getElementById("firstLaunchOverlay"); if (o) o.style.display = "none"; });

    section(label + "（" + viewport.width + "×" + viewport.height + "）");

    for (const app of APPS) {
      await pg.evaluate(([k, t]) => {
        const W = window.VQ2.workplace;
        W[k].open({ item: W.model.newItem(t, { title: "パネル確認" }), content: W.model.emptyContent(t) });
      }, [app.kind, app.type]);
      await pg.waitForSelector("#" + app.id, { timeout: 15000 });
      await sleep(600);

      /* パネルを開く */
      const opened = await pg.evaluate(([id, act]) => {
        const sr = document.getElementById(id).shadowRoot;
        const b = sr.querySelector('[data-act="' + act + '"]');
        if (!b) return { err: "ボタンが見つからない: " + act };
        b.click();
        return { clicked: true };
      }, [app.id, app.act]);
      await sleep(500);

      const m = await pg.evaluate(([id]) => {
        const sr = document.getElementById(id).shadowRoot;
        const box = sr.querySelector(".wp-sheet");
        if (!box) return { none: true };
        const host = sr.querySelector(".wp-sheet-host");
        const bd = sr.querySelector(".wp-sheet-bd");
        const r = box.getBoundingClientRect();
        const br = bd ? bd.getBoundingClientRect() : null;
        const cs = getComputedStyle(box);
        return {
          x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height),
          cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2),
          vw: innerWidth, vh: innerHeight,
          pos: cs.position,
          radius: [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomLeftRadius, cs.borderBottomRightRadius],
          grip: !!box.querySelector(".wp-sheet__grip"),
          role: box.getAttribute("role"), modal: box.getAttribute("aria-modal"),
          hostPos: host ? getComputedStyle(host).position : null,
          bdFull: br ? (Math.round(br.width) >= innerWidth - 1 && Math.round(br.height) >= innerHeight - 1) : false,
          bodyScrolls: (function () { const b2 = box.querySelector(".wp-sheet__b");
            return b2 ? getComputedStyle(b2).overflowY : null; })()
        };
      }, [app.id]);

      if (m.none || opened.err) {
        ok(app.name + " のパネルが開く", false, opened.err || m);
      } else {
        ok(app.name + " のパネルが開く", true);
        ok(app.name + " — 横が真ん中", Math.abs(m.cx - m.vw / 2) <= 3, m);
        ok(app.name + " — 縦が真ん中", Math.abs(m.cy - m.vh / 2) <= 3, m);
        ok(app.name + " — 画面の下にくっついていない", m.y + m.h < m.vh - 8, m);
        ok(app.name + " — 幅が広がりすぎない", m.w <= 560 && m.w <= m.vw - 32 + 1, m);
        ok(app.name + " — 四隅が丸い", m.radius.every(v => parseFloat(v) > 0) && new Set(m.radius).size === 1, m.radius);
        ok(app.name + " — つまみ（下から出す印）が無い", m.grip === false);
        ok(app.name + " — 窓として名乗る", m.role === "dialog" && m.modal === "true", m);
        ok(app.name + " — 背景が画面全体を覆う", m.bdFull === true, m);
        ok(app.name + " — あふれたら中で送る", m.bodyScrolls === "auto" || m.bodyScrolls === "scroll", m.bodyScrolls);

        /* Esc で閉じる */
        await pg.keyboard.press("Escape");
        await sleep(250);
        const afterEsc = await pg.evaluate(([id]) =>
          !document.getElementById(id).shadowRoot.querySelector(".wp-sheet"), [app.id]);
        ok(app.name + " — Esc で閉じる", afterEsc === true);

        /* 背景を押して閉じる */
        await pg.evaluate(([id, act]) => {
          const sr = document.getElementById(id).shadowRoot;
          const b = sr.querySelector('[data-act="' + act + '"]'); if (b) b.click();
        }, [app.id, app.act]);
        await sleep(400);
        const closedByBd = await pg.evaluate(([id]) => {
          const sr = document.getElementById(id).shadowRoot;
          const bd = sr.querySelector(".wp-sheet-bd");
          if (!bd) return "パネルが開いていない";
          bd.click();
          return !sr.querySelector(".wp-sheet");
        }, [app.id]);
        ok(app.name + " — 背景を押すと閉じる", closedByBd === true, closedByBd);

        /* 開きっぱなしを残さない */
        const leftover = await pg.evaluate(([id]) =>
          document.getElementById(id).shadowRoot.querySelectorAll(".wp-sheet-host").length, [app.id]);
        ok(app.name + " — 閉じた後に残骸が無い", leftover === 0, leftover);
      }

      await pg.evaluate(() => {
        document.querySelectorAll(".vq2-host").forEach(h => { if (h.__vq2) h.__vq2.forceClose("t"); });
      });
      await sleep(400);
    }

    ok(label + " — 画面のエラーが無い", errs.length === 0, errs);
    await pg.close();
  }

  await run({ width: 1440, height: 900 }, "パソコン");
  await run({ width: 390, height: 844 }, "スマホ");

  console.log("\n  合格 " + pass + " / 不合格 " + fail);
  if (bad.length) console.log("  直すところ:\n    - " + bad.join("\n    - "));
  await browser.close(); server.close();
  process.exit(fail ? 1 : 0);
})();
