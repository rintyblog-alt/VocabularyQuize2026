/* Quick Mock の耐久性の実測。
   「資料をたくさん入れても、構成案から試験作成まで通るか」を測る。

   使い方:
     node vq2stress.cjs                 # 既定（資料 8 本・48 ページ相当 ＋ 画像 2 枚）
     node vq2stress.cjs --docs 14 --pages 8 --images 4 --sections 5 --per 4

   測るもの:
     ・構成案までの時間と、読めた大問数
     ・大問ごとの生成が何回通り、何問できたか（1 回失敗しても他が残るか）
     ・最終的に「正解・解説・出典」がそろっている割合
     ・満点にぴったり収束したか／保存できる状態か
   本体は http://127.0.0.1:8791 で動いていることが前提。 */
const { chromium } = require("playwright");

function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  return i > 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : def;
}
const DOCS = arg("docs", 8);
const PAGES = arg("pages", 6);
const IMAGES = arg("images", 2);
const SECTIONS = arg("sections", 4);
const PER = arg("per", 4);

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
  await pg.waitForTimeout(2000);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));

  await login(pg, "http://127.0.0.1:8791/?vqdev=1");

  console.log(`\n耐久テスト: 資料 ${DOCS} 本 × ${PAGES} ページ ＋ 画像 ${IMAGES} 枚 / 大問 ${SECTIONS} × ${PER} 問`);

  const t0 = Date.now();
  const out = await pg.evaluate(async (cfg) => {
    /* ── 資料を作る（実際の教材に近い密度の合成データ）── */
    const TOPICS = [
      ["古代", ["645年の大化の改新", "701年の大宝律令", "710年の平城京遷都", "743年の墾田永年私財法",
                "班田収授法と口分田", "遣唐使の派遣", "国分寺の建立", "万葉集の成立"]],
      ["平安", ["794年の平安京遷都", "摂関政治と藤原道長", "国風文化と仮名文字", "荘園の拡大",
                "武士団の形成", "院政の開始", "平氏政権の成立", "浄土信仰の広まり"]],
      ["中世", ["1185年の守護地頭", "1232年の御成敗式目", "元寇と防塁", "建武の新政",
                "勘合貿易", "応仁の乱", "分国法と戦国大名", "惣村と一揆"]],
      ["近世", ["楽市楽座", "太閤検地と刀狩", "1600年の関ヶ原", "参勤交代の制度",
                "鎖国と四つの口", "享保の改革", "田沼政治", "寛政の改革"]],
      ["近代", ["ペリー来航", "五箇条の御誓文", "廃藩置県", "地租改正",
                "自由民権運動", "大日本帝国憲法", "日清戦争", "日露戦争"]]
    ];
    const attachments = [];
    for (let d = 0; d < cfg.docs; d++) {
      const [name, facts] = TOPICS[d % TOPICS.length];
      let text = "";
      for (let p = 1; p <= cfg.pages; p++) {
        text += "[p." + p + "] " + name + "の学習（第" + (d + 1) + "回・" + p + "ページ）\n";
        for (let l = 0; l < 12; l++) {
          const f = facts[(p * 3 + l) % facts.length];
          text += "・" + f + "について、背景・経過・結果を整理する。"
            + "この事項は" + name + "の理解に欠かせない。関連する語句を確認しておくこと。\n";
        }
      }
      attachments.push({
        id: "doc" + d, name: name + "プリント" + (d + 1) + ".pdf", kind: "pdf",
        pageCount: cfg.pages, extractedText: text
      });
    }
    /* 画像（1×1 の PNG。Vision へ渡る経路が生きているかを見るためのもの） */
    const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    for (let i = 0; i < cfg.images; i++)
      attachments.push({ id: "img" + i, name: "板書" + (i + 1) + ".png", kind: "image", imageBase64: PNG });

    const bytes = attachments.reduce((a, x) => a + (x.extractedText || "").length + (x.imageBase64 || "").length, 0);
    const log = [];
    const mark = (t) => log.push(t);

    /* ── 1) 構成案 ── */
    const bpT0 = Date.now();
    let blueprint = null, bpText = "", bpErr = null;
    try {
      const res = await window.VQ2.ai.generateBlueprint({
        instruction: "添付した資料だけを根拠に、高校生向けの定期考査を作ってください。\n"
          + "満点 100 点、試験時間 50 分、大問 " + cfg.sections + " 問。\n"
          + "各設問には、根拠にした資料の箇所を必ず示してください。",
        attachments: attachments, totalPoints: 100, sourceOnly: true
      });
      bpText = res.text || "";
      blueprint = window.VQ2.mockBuilder.parseBlueprint(bpText);
    } catch (e) { bpErr = String((e && (e.userMessage || e.message)) || e); }
    const bpMs = Date.now() - bpT0;
    mark("構成案 " + Math.round(bpMs / 1000) + "秒 "
      + (blueprint && blueprint.ok ? "大問 " + blueprint.sections.length
         : bpErr ? "失敗: " + bpErr
         : "読み取れず（本文 " + bpText.length + " 字: " + bpText.slice(0, 120).replace(/\n/g, " ") + "）"));

    /* ── 2) 大問ごとに作る ── */
    const plan = (blueprint && blueprint.ok && blueprint.sections.length)
      ? blueprint.sections.map((s, i) => ({
          number: s.number || i + 1, title: s.title || "",
          count: Math.min(6, Math.max(1, s.count || cfg.per)),
          points: s.points || Math.round(100 / blueprint.sections.length)
        }))
      : Array.from({ length: cfg.sections }, (_, i) =>
          ({ number: i + 1, title: "", count: cfg.per, points: Math.round(100 / cfg.sections) }));

    const MUST = "\n【1 問ごとに必ず書くこと】問題文／正解／解説／選択問題は選択肢 2 つ以上"
      + "／根拠にした資料の箇所（分からなければ書かない）\n";
    const sections = [], keys = [], rounds = [];
    for (let i = 0; i < plan.length; i++) {
      const p = plan[i];
      const rt0 = Date.now();
      let n = 0, err = null;
      try {
        const res = await window.VQ2.ai.generateMock({
          instruction: "添付した資料だけを根拠に、高校生向けの定期考査を作ってください。" + MUST
            + "【この回で作るもの】大問" + p.number + (p.title ? "「" + p.title + "」" : "")
            + " だけを " + p.count + " 問、" + p.points + " 点で作ってください。"
            + "**この大問だけ**を sections に 1 つ返してください。"
            + (sections.length
                ? "\nすでに次の設問を作ってあります。同じ内容は作らないでください。\n"
                  + sections.flatMap((s) => s.questions.map((q) => String(q.question || "").slice(0, 40)))
                      .slice(-20).map((t, k) => (k + 1) + ". " + t).join("\n")
                : ""),
          attachments: attachments, sourceOnly: true, count: p.count,
          skipDocumentAnalysis: i > 0
        });
        const d = res.structured && res.structured.sections ? res.structured
                : (res.structured && res.structured.data ? res.structured.data : null);
        const secs = d && Array.isArray(d.sections) ? d.sections : [];
        n = secs.reduce((a, x) => a + (x.questions || []).length, 0);
        if (n) {
          /* UI と同じで、頼んだ数を超えたぶんは外す */
          let qs = secs.reduce((a, x) => a.concat(x.questions || []), []);
          if (qs.length > p.count) qs = qs.slice(0, p.count);
          const keep = new Set(qs.map((q) => String(q.id)));
          n = qs.length;
          sections.push({ name: p.title || (secs[0] && secs[0].name) || ("大問" + p.number),
                          score: p.points, questions: qs });
          keys.push(...(d.answerKey || []).filter((k) => keep.has(String(k.id))));
        }
      } catch (e) { err = String((e && (e.userMessage || e.message)) || e); }
      const ms = Date.now() - rt0;
      rounds.push({ n: p.number, q: n, ms: ms, err: err });
      mark("大問" + p.number + " " + Math.round(ms / 1000) + "秒 " + (n ? n + " 問" : "失敗:" + (err || "0 問")));
    }

    if (!sections.length) return { ok: false, why: "1 大問も作れなかった", log: log, bpErr: bpErr, bytes: bytes, rounds: rounds };

    /* ── 3) 試験にまとめる（不備の検出・自動修復・配点収束）── */
    const MB = window.VQ2.mockBuilder, V = window.VQ2.validate;
    const spec = MB.fromDraft({ sections: sections, answerKey: keys },
      { title: "耐久テスト", totalPoints: 100, durationMinutes: 50, sourceMode: "source-only" });
    const rep = MB.repairSpec(spec, { requireSources: true });
    const fin = MB.finalize(rep.spec);
    const qs = fin.spec.sections.reduce((a, s) => a.concat(s.questions), []);
    const has = (f) => qs.filter(f).length;

    return {
      ok: true, log: log, bytes: bytes, rounds: rounds, bpMs: bpMs,
      blueprintOk: !!(blueprint && blueprint.ok),
      sections: fin.spec.sections.length,
      questions: qs.length,
      withAnswer: has((q) => (q.choices || []).some((c) => c.isCorrect) || String(q.correctAnswer || "").trim()),
      withExplanation: has((q) => String(q.explanation || "").trim()),
      withSource: has((q) => (q.sourceReferences || []).length),
      answerable: has((q) => {
        if (window.VQ2.schema.hasChoices(q.type)) {
          if (q.type === "matching" || q.type === "ordering") return true;
          return (q.choices || []).filter((c) => String(c.text || "").trim()).length >= 2;
        }
        return true;
      }),
      fixed: rep.fixed.length,
      remaining: rep.audit.total,
      blocking: rep.audit.blocking,
      totalPoints: qs.reduce((a, q) => a + q.points, 0),
      saveOk: fin.ok,
      errs: V.errorsOf(fin.issues).map((e) => e.code)
    };
  }, { docs: DOCS, pages: PAGES, images: IMAGES, sections: SECTIONS, per: PER });

  const secs = Math.round((Date.now() - t0) / 1000);
  console.log("");
  out.log.forEach((l) => console.log("  " + l));
  console.log("");

  if (!out.ok) {
    console.log("結果: 失敗 — " + out.why);
    console.log("入力 " + Math.round(out.bytes / 1024) + "KB / 所要 " + secs + "秒");
    await browser.close();
    process.exit(1);
  }

  const pct = (n) => out.questions ? Math.round((n / out.questions) * 100) + "%" : "-";
  console.log("入力       : " + Math.round(out.bytes / 1024) + "KB（資料 " + DOCS + " 本・画像 " + IMAGES + " 枚）");
  console.log("所要       : " + secs + "秒（構成案 " + Math.round(out.bpMs / 1000) + "秒）");
  console.log("通った回   : " + out.rounds.filter((r) => r.q).length + " / " + out.rounds.length + " 大問");
  console.log("できた試験 : " + out.sections + " 大問 " + out.questions + " 問 ／ 合計 " + out.totalPoints + " 点");
  console.log("解答欄あり : " + out.answerable + "（" + pct(out.answerable) + "）");
  console.log("正解あり   : " + out.withAnswer + "（" + pct(out.withAnswer) + "）");
  console.log("解説あり   : " + out.withExplanation + "（" + pct(out.withExplanation) + "）");
  console.log("出典あり   : " + out.withSource + "（" + pct(out.withSource) + "）");
  console.log("自動修復   : " + out.fixed + " 件 ／ 残る不備 " + out.remaining + " 問（受験できない " + out.blocking + " 問）");
  console.log("保存できる : " + (out.saveOk ? "はい" : "いいえ（" + out.errs.join(",") + "）"));
  console.log("pageerror  : " + JSON.stringify(errs));

  await browser.close();
  /* 「途中で全部失う」ことが無いか＝1 大問でも通って、満点に収束していること */
  const ok = out.sections >= 1 && out.totalPoints === 100 && out.answerable === out.questions;
  console.log("\n判定: " + (ok ? "通過" : "要確認"));
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
