/* ══════════════════════════════════════════════════════════════════════
   §52 Quick Mock を狭い画面で開く（320 / 375 / 390 / 430px）

   既にある quick-mock-mobile.test.mjs は「出題形式のチェック」1 か所だけを
   切り出して測っている。ここでは **画面そのものを本物のブラウザで開き**、
   仕様が挙げている段階をひととおり出して横スクロールが無いことを見る。

     条件設定 ／ 資料追加（解析状態つき） ／ 構成案 ／ 問題編集 ／
     レイアウト選択 ／ プレビュー（紙面） ／ 完成（成果物）

   測るのは 2 つ。
     ① 画面全体（app.root）の scrollWidth が画面幅を超えていないか
     ② 中の 1 つ 1 つの箱が画面の右端からはみ出していないか
   合計だけを見ると、1 個だけ長いものがあっても気づけないので両方見る。

   Playwright が無い環境では、確かめられないことを言って落とす（黙って通さない）。
   ══════════════════════════════════════════════════════════════════════ */
import { group, test, assert, assertEq, report } from "./harness.mjs";
import { launch } from "./browser.mjs";

const WIDTHS = [320, 375, 390, 430];
/* 仕様 §52 が挙げている画面。id は下の evaluate が知っている名前。 */
const SCREENS = [
  { id: "setup",     label: "条件設定" },
  { id: "sources",   label: "資料追加と解析状態" },
  { id: "blueprint", label: "構成案" },
  { id: "questions", label: "問題編集" },
  { id: "layout",    label: "レイアウト選択" },
  { id: "paper",     label: "プレビュー（紙面）" },
  { id: "artifacts", label: "完成（成果物）" }
];

const B = await launch();

if (!B) {
  group("§52 狭い画面（320 / 375 / 390 / 430）");
  test("Playwright が無いので確かめられない", () => {
    assert(false, "playwright が入っていないため、横スクロールを確かめられませんでした");
  });
  process.exit(report("Quick Mock 狭い画面の全画面") ? 1 : 0);
}

/* 1 つの幅で全画面を回り、各画面の測定値を返す。 */
async function measure(width) {
  const page = await B.page({ width, height: 780 });
  const res = await page.evaluate(async ({ screens }) => {
    const V = window.VQ2;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));

    /* 資料は差し替える（ファイル選択の口はこの経路だけ）。
       名前はわざと長くする。**折り返さない長い名前ではみ出さないか**を見るため。 */
    V.ui.pickAttachments = () => Promise.resolve({
      attachments: [{ id: "att-1", attachmentId: "att-1", jobId: "j1",
        name: "2026年度_1学期_中間考査_理科_授業配布プリント_第3章_光合成と呼吸.pdf",
        kind: "pdf", pageCount: 4, included: true }],
      display: [], failed: []
    });
    /* 解析結果と、外したページ。サーバが送ってくるのと同じ形。 */
    const analysisEvent = {
      type: "attachment.analysis", label: "資料の読み取り状況", status: "running",
      current: 3, total: 4,
      analysis: [{
        attachmentId: "att-1",
        name: "2026年度_1学期_中間考査_理科_授業配布プリント_第3章_光合成と呼吸.pdf",
        state: "partially_completed", label: "一部のページを読み取れませんでした",
        documentKind: "mixed", totalPages: 4, usablePages: 3, characterCount: 900,
        byKind: { text: 2, low_text: 1, empty: 1 },
        pageKinds: [
          { pageNumber: 1, pageKind: "low_text", why: "too_few_chars", whyLabel: "本文と呼べる量がありません" },
          { pageNumber: 2, pageKind: "text", why: null, whyLabel: null },
          { pageNumber: 3, pageKind: "text", why: null, whyLabel: null },
          { pageNumber: 4, pageKind: "empty", why: "analysis_failed", whyLabel: "読み取れませんでした" }
        ],
        failedPages: [4], lowConfidencePages: [], outcome: "partial",
        summary: "3 / 4 ページから内容を取り出しました（1 ページは読み取れていません）"
      }]
    };
    const reportEvent = {
      type: "mock.report", label: "生成の内訳", status: "completed",
      report: {
        pageKinds: { documentKind: "mixed", totals: { total: 4, text: 2, lowText: 1, empty: 1 } },
        includeChromePages: false, excludeRestored: false,
        excludedPages: [
          { page: 1, fileName: "2026年度_1学期_中間考査_理科_授業配布プリント_第3章_光合成と呼吸.pdf",
            reason: "cover_page", pageState: "low_text", evidenceIds: ["e1"] },
          { page: 4, fileName: "2026年度_1学期_中間考査_理科_授業配布プリント_第3章_光合成と呼吸.pdf",
            reason: "empty_page", pageState: "empty", evidenceIds: ["e9"] }
        ],
        thinEvidence: []
      }
    };
    V.ai.generateBlueprint = (o) => {
      if (o.onActivity) { o.onActivity([], analysisEvent); o.onActivity([], reportEvent); }
      return Promise.resolve({
        text: "大問1 光合成 / 4問 / 40点\n大問2 呼吸 / 3問 / 60点", warnings: [] });
    };

    /* 問題ができている状態を作る（生成は走らせない）。 */
    const draft = {
      title: "2026年度 1学期中間考査 理科（光合成と呼吸）", subject: "理科", grade: "中2",
      durationMinutes: 50, totalScore: 100,
      sections: [
        { name: "大問1 光合成のはたらきと、そのしくみについて", score: 60, questions: [
          { id: "1", type: "multiple_choice",
            question: "光合成にどうしても必要なものを、次のうちからすべて選びなさい。", points: 30,
            choices: [{ id: "a", text: "光" }, { id: "b", text: "音" }, { id: "c", text: "二酸化炭素" }],
            topic: "植物" },
          { id: "2", type: "short_answer", question: "気孔の役割を答えなさい。", points: 30,
            choices: [], topic: "植物" }
        ] },
        { name: "大問2 呼吸", score: 40, questions: [
          { id: "3", type: "descriptive",
            question: "蒸散のしくみを、水の通り道にふれながら説明しなさい。", points: 40,
            choices: [], topic: "植物", expectedChars: 120 }
        ] }
      ],
      answerKey: [
        { id: "1", answer: "a, c", explanation: "光と二酸化炭素が要ります。" },
        { id: "2", answer: "気体の出入り口", explanation: "蒸散もここから起こります。" },
        { id: "3", answer: "根から吸った水が道管を通り…", explanation: "気孔から出ていきます。" }
      ]
    };
    const spec = V.mockBuilder.fromDraft(draft, {});
    V.store.mocks.put({ id: spec.id, spec });

    const app = V.quickMock.open({ mockId: spec.id });
    const $ = (s) => app.root.querySelector(s);
    await wait(60);

    /* 資料と解析結果をそろえる（教材の段階に中身がある状態にする）。 */
    $('[data-act="attach"]').click();
    await wait(60);
    const box = $('[data-key="instruction"]');
    if (box) {
      box.value = "配ったプリントの範囲で作ってください。";
      box.dispatchEvent(new Event("input", { bubbles: true }));
    }
    $('[data-act="blueprint"]').click();
    await wait(200);

    /* 1 画面ぶんの測り方。app.root は影の DOM の中なので、そこから測る。

       数えるのは「いま画面に見えている箱」だけ。
       狭い画面では、いま出していないペイン（条件の欄・AI の欄）を
       画面の外へ寄せてある。外に置いてあるものは切り取られていて
       横スクロールの原因にならないので、これを数えると
       **どの画面でも必ず失敗する**（測っていることにならない）。
       見分け方は「左端が画面の中にあるか」。外へ寄せたペインは
       左端そのものが画面の外にある。 */
    function measureNow() {
      const root = app.root;
      const rr = root.getBoundingClientRect();
      const w = rr.width;
      let worst = null, considered = 0, skippedOffscreen = 0;
      root.querySelectorAll("*").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        if (typeof el.checkVisibility === "function"
            && !el.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true })) return;
        /* 画面の外へ寄せてあるもの（左端が右の端より外）は数えない */
        if (r.left >= rr.right - 1 || r.right <= rr.left + 1) { skippedOffscreen++; return; }
        /* 自分の中で横に流す箱（タブの帯・表）の**中身**は数えない。
           はみ出しているのはその箱の中だけで、画面は横に動かない。
           箱そのものは数えるので、帯が画面より広ければちゃんと落ちる。 */
        let inScroller = false;
        for (let a = el.parentElement; a && a !== root; a = a.parentElement) {
          const ox = getComputedStyle(a).overflowX;
          if (ox === "auto" || ox === "scroll") { inScroller = true; break; }
        }
        if (inScroller) { skippedOffscreen++; return; }
        considered++;
        const over = Math.round(r.right - rr.right);
        if (over > 1 && (!worst || over > worst.over)) {
          worst = { over, tag: el.tagName.toLowerCase(),
                    cls: String(el.className || "").slice(0, 60),
                    text: (el.textContent || "").trim().slice(0, 40) };
        }
      });
      return {
        viewport: Math.round(w),
        scrollWidth: root.scrollWidth,
        docScrollWidth: document.documentElement.scrollWidth,
        docClientWidth: document.documentElement.clientWidth,
        considered, skippedOffscreen, worst
      };
    }

    const out = {};
    for (const s of screens) {
      if (s.id === "setup") {
        $('[data-step="setup"]').click(); await wait(60);
        /* 細かい設定・紙面設定を開いた「いちばん横に並ぶ」状態で測る */
        const folds = app.root.querySelectorAll('[data-act="qm-fold"]');
        for (const f of folds) { f.click(); await wait(20); }
        const accs = app.root.querySelectorAll("[data-acc]");
        for (const a of accs) { a.click(); await wait(20); }
      } else if (s.id === "sources") {
        $('[data-step="sources"]').click(); await wait(60);
        const pg = app.root.querySelector('[data-act="qm-pages"]');
        if (pg) { pg.click(); await wait(40); }
      } else if (s.id === "blueprint") {
        $('[data-step="blueprint"]').click(); await wait(80);
      } else if (s.id === "questions") {
        $('[data-step="review"]').click(); await wait(80);
        const q = app.root.querySelector("[data-q]");
        if (q) { q.click(); await wait(60); }
      } else if (s.id === "layout") {
        $('[data-step="paper"]').click(); await wait(80);
      } else if (s.id === "paper") {
        const b = app.root.querySelector('[data-act="artifacts"]');
        if (b) { b.click(); await wait(700); }
      } else if (s.id === "artifacts") {
        const t = app.root.querySelector('[data-act="qm-tab"][data-tab="artifacts"]');
        if (t) { t.click(); await wait(200); }
      }
      await wait(40);
      out[s.id] = measureNow();
      out[s.id].hasLayoutCards = app.root.querySelectorAll('[data-act="qm-layout"]').length;
      out[s.id].text = app.root.textContent.slice(0, 4000);
    }
    return out;
  }, { screens: SCREENS });
  const errors = (page.__vqErrors || []).slice();
  await page.close();
  return { res, errors };
}

const measured = {};
for (const w of WIDTHS) measured[w] = await measure(w);
await B.close();

group("§52 狭い画面で横スクロールが出ない（Quick Mock 全画面）");

WIDTHS.forEach((w) => {
  test(w + "px：画面が例外を出していない", () => {
    assertEq(measured[w].errors.join(" / "), "");
  });
});

SCREENS.forEach((s) => {
  WIDTHS.forEach((w) => {
    test(w + "px：" + s.label + " が横スクロールしない", () => {
      const m = measured[w].res[s.id];
      assert(m, s.label + " を測れていません");
      /* 1px は端数（境界線）で出るので許す。2px 以上は本物のはみ出し。 */
      assert(m.scrollWidth - m.viewport <= 1,
        s.label + " の中身が " + (m.scrollWidth - m.viewport) + "px はみ出しています"
          + (m.worst ? "（いちばん出ているのは " + m.worst.tag + "." + m.worst.cls
              + "：" + m.worst.text + "）" : ""));
      assert(m.docScrollWidth - m.docClientWidth <= 1,
        s.label + " でページ全体が横に伸びています（"
          + (m.docScrollWidth - m.docClientWidth) + "px）");
    });

    test(w + "px：" + s.label + " の中の箱が右端からはみ出さない", () => {
      const m = measured[w].res[s.id];
      /* 何も数えていないのに「はみ出していません」と言わない。 */
      assert(m.considered >= 20,
        s.label + " で数えた箱が " + m.considered + " 個しかありません（測れていません）");
      assert(!m.worst, s.label + " で "
        + (m.worst ? m.worst.tag + "." + m.worst.cls + " が " + m.worst.over
            + "px はみ出しています：" + m.worst.text : ""));
    });
  });
});

/* 測れていることの確認。空の画面を測って「はみ出していません」と言わないため。 */
group("測れていることの確認（空の画面を測っていない）");

test("レイアウト選択の画面に、紙面デザインのカードが実際に並んでいる", () => {
  WIDTHS.forEach((w) => {
    assert(measured[w].res.layout.hasLayoutCards > 0,
      w + "px でカードが 1 枚も無い状態を測っています");
  });
});

test("資料の画面に、ページごとの見立てが実際に出ている", () => {
  WIDTHS.forEach((w) => {
    assert(measured[w].res.sources.text.indexOf("3 / 4 ページ") >= 0,
      w + "px で解析結果の出ていない画面を測っています");
  });
});

test("問題の画面に、実際に設問が出ている", () => {
  WIDTHS.forEach((w) => {
    assert(measured[w].res.questions.text.indexOf("気孔の役割") >= 0,
      w + "px で問題の無い画面を測っています");
  });
});

process.exit(report("Quick Mock 狭い画面の全画面") ? 1 : 0);
