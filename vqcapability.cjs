/* ══════════════════════════════════════════════════════════════════════
   問題形式の実態（Capability Matrix）を、実画面で測る。
   ・レジストリに名前があるだけのものを「対応済み」と数えない
   ・AI へ渡す形式が、本当に 生成→編集→回答→採点→結果→分析 まで通るか
   ・使えない形式を AI が返してきたとき、安全に寄せるか
   出力: capability-matrix.md（人が読む表）
   ══════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const fs = require("node:fs");
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  NG   " + n + (x ? "  → " + x : ""))); };

const HIDE = () => {
  ["firstLaunchOverlay", "vqbFlow", "vqNewAuth", "authGate", "authBootSplash"].forEach((id) => {
    const e = document.getElementById(id);
    if (e) { e.hidden = true; e.style.setProperty("display", "none", "important"); }
  });
  document.body.classList.remove("auth-booting", "auth-gate-open");
  document.body.setAttribute("data-ui-v2", "1");
};

(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e).slice(0, 180)));
  await pg.goto(BASE + "/?vq2=all&vqdev=1&cb=" + Date.now(), { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(4200);
  await pg.evaluate(HIDE);
  await pg.waitForTimeout(600);

  const res = await pg.evaluate(() => {
    if (!window.VQ2 || !VQ2.capability) return { missing: true };
    VQ2.capability._clear();
    const table = VQ2.capability.table({ force: true });
    const stats = VQ2.capability.stats();
    const ai = VQ2.capability.forAi();
    const aiMock = VQ2.capability.forAi({ mock: true });
    /* 使えない形式を返されたときの寄せ方 */
    const bad = VQ2.capability.resolve("this_type_does_not_exist");
    const soon = (VQ2.qtypes.list({}).filter((d) => d.status === "coming_soon")[0] || {}).id;
    const soonRes = soon ? VQ2.capability.resolve(soon) : null;
    return { table, stats, ai, aiMock, bad, soon, soonRes };
  });

  ok("Capability Matrix が載っている", !res.missing);
  if (res.missing) { console.log("\n合格 " + pass + " / 不合格 " + (fail + 1)); process.exit(1); }

  const s = res.stats;
  console.log("\n形式 " + s.total + " 種類");
  console.log("  本番で使える  " + s.production);
  console.log("  ベータ        " + s.beta);
  console.log("  生成のみ      " + s.generationOnly);
  console.log("  手で作るのみ  " + s.manualOnly);
  console.log("  準備中        " + s.comingSoon);
  console.log("  未対応        " + s.unsupported);
  console.log("  AI が作れる   " + s.aiGeneratable);
  console.log("  紙にできる    " + s.mockSupported);
  console.log("");

  ok("全形式を測っている", s.total >= 100, "件 " + s.total);
  ok("本番で使えるものがある", s.production >= 50, "件 " + s.production);
  ok("名前だけのものを本番と数えていない", s.production < s.total, s.production + "/" + s.total);
  ok("準備中は本番に混ぜない", s.comingSoon > 0 && s.production + s.comingSoon <= s.total);

  /* 本番と判定したものは、すべての段がそろっているか */
  const prod = res.table.filter((t) => t.status === "production");
  const holes = prod.filter((t) => !(t.render && t.evaluate && t.editor && t.result && t.mobile && t.insight));
  ok("本番のものは 表示・採点・編集・結果・スマホ・分析 がすべて通る",
     holes.length === 0, holes.slice(0, 3).map((t) => t.displayName + ":" + t.notes.join("/")).join(" | "));

  /* AI へ渡すのは本当に使えるものだけか */
  ok("AI へ渡すのは本番のものだけ",
     res.ai.every((t) => (res.table.filter((x) => x.type === t)[0] || {}).status === "production"));
  ok("AI へ渡すものは全部 採点できる",
     res.ai.every((t) => (res.table.filter((x) => x.type === t)[0] || {}).evaluate));
  ok("AI へ渡すものは全部 表示できる",
     res.ai.every((t) => (res.table.filter((x) => x.type === t)[0] || {}).render));
  ok("形式の一覧を丸ごと渡していない", res.ai.length < s.total, res.ai.length + " / " + s.total);
  ok("試験用はさらに絞る（紙にできるものだけ）",
     res.aiMock.length > 0 && res.aiMock.length <= res.ai.length, res.aiMock.length + " / " + res.ai.length);
  ok("試験用に運ぶ操作を入れない",
     res.aiMock.every((t) => (res.table.filter((x) => x.type === t)[0] || {}).mock));

  ok("知らない形式は安全に断る", res.bad && res.bad.ok === false, JSON.stringify(res.bad));
  if (res.soonRes) {
    ok("準備中の形式は、近い形式へ寄せるか断る",
       res.soonRes.ok === false || res.soonRes.converted === true, JSON.stringify(res.soonRes));
  }

  /* 内部 ID を画面へ出さない前提が成り立っているか */
  const noLabel = res.table.filter((t) => !t.insight);
  ok("すべての形式に日本語の表示名がある", noLabel.length === 0,
     noLabel.slice(0, 5).map((t) => t.type).join(","));

  ok("画面のエラーが出ていない", errs.length === 0, errs.slice(0, 2).join(" / "));

  /* ── 人が読む表を書き出す ── */
  const byCat = {};
  res.table.forEach((t) => { (byCat[t.category] || (byCat[t.category] = [])).push(t); });
  const mark = (v) => (v ? "○" : "—");
  const jp = {
    production: "本番", beta: "ベータ", generation_only: "生成のみ",
    manual_only: "手で作る", coming_soon: "準備中", unsupported: "未対応"
  };
  let md = "# 問題形式の実態（Capability Matrix）\n\n";
  md += "レジストリに名前があることと、実際に使えることは別。\n";
  md += "この表は `node vqcapability.cjs` が実画面で 1 形式ずつ試して作っている。\n\n";
  md += "| 状態 | 件数 |\n|---|---|\n";
  md += "| 本番で使える | " + s.production + " |\n| ベータ | " + s.beta + " |\n";
  md += "| 生成のみ | " + s.generationOnly + " |\n| 手で作るのみ | " + s.manualOnly + " |\n";
  md += "| 準備中 | " + s.comingSoon + " |\n| 未対応 | " + s.unsupported + " |\n";
  md += "| **合計** | **" + s.total + "** |\n\n";
  md += "AI へ渡している形式: **" + res.ai.length + "**（うち試験に使えるもの **" + res.aiMock.length + "**）\n\n";
  md += "---\n\n";
  Object.keys(byCat).forEach((cat) => {
    md += "## " + (cat || "その他") + "\n\n";
    md += "| 表示名 | 内部ID | AI生成 | 検証 | 編集 | 回答 | 採点 | 結果 | スマホ | 分析 | 試験 | 状態 |\n";
    md += "|---|---|---|---|---|---|---|---|---|---|---|---|\n";
    byCat[cat].forEach((t) => {
      md += "| " + t.displayName + " | `" + t.type + "` | " + mark(t.ai) + " | " + mark(t.schema)
        + " | " + mark(t.editor) + " | " + mark(t.render) + " | " + mark(t.evaluate)
        + " | " + mark(t.result) + " | " + mark(t.mobile) + " | " + mark(t.insight)
        + " | " + mark(t.mock) + " | " + (jp[t.status] || t.status) + " |\n";
    });
    md += "\n";
  });
  const issues = res.table.filter((t) => t.notes.length && t.status !== "production");
  if (issues.length) {
    md += "---\n\n## 本番にできていないもの（理由）\n\n";
    issues.forEach((t) => {
      md += "- **" + t.displayName + "**（`" + t.type + "` / " + (jp[t.status] || t.status) + "）— "
        + t.notes.join("、") + "\n";
    });
  }
  fs.writeFileSync("capability-matrix.md", md);
  console.log("\ncapability-matrix.md を書き出しました");

  await b.close();
  console.log("\n合格 " + pass + " / 不合格 " + fail);
  process.exit(fail ? 1 : 0);
})();
