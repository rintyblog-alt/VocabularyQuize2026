/* プリセット自動作成が「資料つき」で止まる原因を突き止める。

   報告:
     ・資料なしなら作れる
     ・PDF や PNG（写真・スキャン）を付けると作れない。「論点がどうのこうの」で止まる

   画面の流れは
     論点の洗い出し（planTopics）→ 5 問ずつ生成
   で、**資料限定のときは論点が 2 つ未満だとそこで止める**作りになっている。
   だからまず「論点が取れているか」を、資料の種類ごとに測る。

   実行: node vqpresetsrc.cjs
*/
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const URL = "http://127.0.0.1:8791/?vqdev=1";
const HIDE = `#vqbFlow,#mob-tut-overlay,#mobBarTutorial,#firstLaunchOverlay,#vqOnboardingOverlay{display:none !important;}`;
const DOC = fs.readFileSync(path.join(__dirname, "tmp_exam_build", "nihonshi-large.txt"), "utf8");
const PNG = path.join(__dirname, "tmp_pdfs", "p1-page.png");

let pass = 0, fail = 0;
const log = [];
function ok(name, cond, extra) {
  if (cond) { pass++; log.push("  ✓ " + name + (extra ? " — " + extra : "")); }
  else { fail++; log.push("  ✗ " + name + (extra ? "\n      → " + extra : "")); }
}

async function login(pg) {
  await pg.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.addStyleTag({ content: HIDE });
  await pg.waitForFunction(() => document.getElementById("authLoginSubmitBtn"), { timeout: 20000 });
  await pg.evaluate(() => {
    const setV = (el, v) => {
      const p = el.tagName === "SELECT" ? HTMLSelectElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(p.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    setV(document.getElementById("authLoginGrade"), "H3");
    setV(document.getElementById("authLoginNickname"), "psrc");
    setV(document.getElementById("authLoginPassword"), "Abcd1234");
    document.getElementById("authLoginSubmitBtn").click();
  });
  await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 30000 });
  await pg.waitForTimeout(1500);
}

(async () => {
  const browser = await chromium.launch();
  const pg = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await login(pg);

  const imgB64 = fs.existsSync(PNG) ? fs.readFileSync(PNG).toString("base64") : null;
  console.log(`\n══ 論点の洗い出しが、資料の種類ごとに通るか ══`);
  console.log(`  画像の資料: ${imgB64 ? Math.round(imgB64.length / 1024) + " KB (base64)" : "（無いので飛ばす）"}`);

  const CASES = [
    { name: "文字の資料（.txt）", kind: "text" },
    { name: "画像の資料（.png）", kind: "image" },
    /* 中身が空の添付。**論点が出てはいけない**（出たら作り話）。 */
    { name: "中身の無い資料", kind: "empty", expectNone: true }
  ];

  for (const c of CASES) {
    if (c.kind === "image" && !imgB64) continue;
    const t0 = Date.now();
    const r = await pg.evaluate(async ({ c, doc, imgB64 }) => {
      const AI = VQ2.ai;
      const att = c.kind === "empty"
        ? [{ id: "a1", name: "からの資料.pdf", kind: "pdf", pageCount: 1 }]
        : c.kind === "text"
        ? [{ id: "a1", name: "資料.txt", kind: "text", extractedText: doc, pageCount: 1 }]
        : [{ id: "a1", name: "資料.png", kind: "image", pageCount: 1,
             imageBase64: imgB64 }];
      try {
        /* skipDocumentAnalysis は ai.js が添付の中身から自動で決める。
           ここで指定しないのは、**その判断そのものを見たい**から。 */
        const res = await AI.planTopics({
          instruction: "この資料から出題してください。", attachments: att,
          count: 10, sourceOnly: true
        });
        const topics = AI.parseTopics(res.text || "");
        return { ok: true, topics: topics.length, sample: topics.slice(0, 3),
                 textLen: String(res.text || "").length };
      } catch (e) {
        return { ok: false, why: String((e && e.userMessage) || (e && e.message)).slice(0, 90) };
      }
    }, { c, doc: DOC, imgB64 });
    const ms = Math.round((Date.now() - t0) / 1000);
    console.log(`\n  ${c.name}  ${ms}秒`);
    if (!r.ok) { console.log(`    失敗: ${r.why}`); }
    else {
      console.log(`    論点 ${r.topics} 個（返信 ${r.textLen} 字）`);
      if (r.sample.length) console.log(`    例: ${r.sample.join(" / ")}`);
    }
    /* 資料限定では「論点が 2 個未満」だと画面はそこで止まる。 */
    if (c.expectNone) {
      /* 読めていないのに論点を並べるのは作り話。**出ないのが正解。** */
      ok(`${c.name}：作り話をしない（論点を並べない）`, !!(!r.ok || r.topics < 2),
         r.ok ? r.topics + " 個も出た: " + (r.sample || []).join(" / ") : "止まった: " + r.why);
    } else {
      ok(`${c.name}：論点が 2 個以上とれる`, !!(r.ok && r.topics >= 2),
         r.ok ? r.topics + " 個" : r.why);
    }
  }

  console.log("");
  log.forEach((l) => console.log(l));
  console.log(`\n══ まとめ ══\n  合格 ${pass} / 不合格 ${fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
