/* ══════════════════════════════════════════════════════════════════════════
   vqquiz0820.cjs — 出題まわりの 2 つの 訴え（2026-08-20）

     ①「プリセットなんだけどさ、間違えを 認識すると すぐ 答え合わせ
        してしまう バグがあるから、コレも 修正して」
     ②「あと 公式プリセット まだ 4 択に なってない」

   ★ ① の 真因
     答えが 変わるたび（＝短答・穴埋めは **1 文字 打つたび**）に 正誤を 見て、
     まちがいなら その場で 解説を 出して 画面ごと 描き直していた。
     1 文字目は たいてい 不正解なので、書き終える前に 答えが 出て、
     入力欄も 作り直されて 打てなくなっていた。
     → 見るのは **押した時点で 答えが 決まる 形式（4 択・正誤）だけ**。

   ★ ② の 真因
     サーバは /api/official-presets で 4 択を 組んで 返している。
     ところが vq-core の getPresetWords が 公式の語を
     **{id, word, meaning} だけに 写して mcq を 捨てて**いた。

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
function 短(v) { const s = typeof v === "string" ? v : JSON.stringify(v); return String(s).slice(0, 200); }
function 節(t) { 印.push("\n── " + t + " " + "─".repeat(Math.max(0, 54 - t.length))); }

async function req(path, { method = "GET", body, token } = {}) {
  const h = { "content-type": "application/json" };
  if (token) h.authorization = "Bearer " + token;
  const r = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, j: await r.json().catch(() => ({})) };
}
async function 作る() {
  const tag = `qz${Date.now().toString(36)}`;
  const s = await req("/api/auth/register/start", { method: "POST",
    body: { email: `vqqz.${tag}@gmail.com`, gradePrefix: "H2", nickname: "qz" + tag, password: "Testing!2345" } });
  if (!s.j.devCode) throw new Error("devCode が返りません: " + JSON.stringify(s.j).slice(0, 160));
  const v = await req("/api/auth/register/verify", { method: "POST", body: { challengeId: s.j.challengeId, code: s.j.devCode } });
  const c = await req("/api/auth/register/consent", { method: "POST",
    body: { registrationSession: v.j.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: "482913" } });
  return c.j.token;
}

/* 出題画面は 影の DOM では ない（本体の中）。深くまで 探す。 */
const 深く = `(sel) => { const out=[]; const walk=(r)=>{ (r.querySelectorAll("*")||[]).forEach(el=>{ try{ if(el.matches(sel)) out.push(el); }catch(e){} if(el.shadowRoot) walk(el.shadowRoot); }); }; walk(document); return out; }`;

(async () => {
  const TOKEN = await 作る();
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const 画面の失敗 = [];
  p.on("pageerror", (e) => 画面の失敗.push(String(e.message).slice(0, 200)));
  await p.addInitScript(([t]) => { try { localStorage.setItem("app.auth.token.v1", t); } catch (e) {} }, [TOKEN]);
  await p.goto(BASE + "/?vqdev=1&cb=" + Date.now(), { waitUntil: "domcontentloaded" });
  await p.waitForFunction(() => !!(window.VQ2 && window.VQ2.quizPlayer && window.VQ2.adapter), null, { timeout: 40000 }).catch(() => {});

  節("① 土台");
  ok("出題画面の 口が ある", await p.evaluate(() => !!(window.VQ2 && window.VQ2.quizPlayer && window.VQ2.quizPlayer.open)));
  ok("形をそろえる 口が ある", await p.evaluate(() => !!(window.VQ2 && window.VQ2.adapter && window.VQ2.adapter.presetToV2)));

  /* 邪魔な 覆いを 外す */
  await p.evaluate(() => {
    ["firstLaunchOverlay", "vqbFlow", "vqNewAuth", "authGate", "authBootSplash"].forEach((id) => {
      const e = document.getElementById(id);
      if (e) { e.hidden = true; e.style.setProperty("display", "none", "important"); }
    });
    document.body.classList.remove("auth-booting", "auth-gate-open");
  });

  /* ── 検証に 使う プリセットを その場で 作る ───────────────────── */
  await p.evaluate(() => {
    const A = window.VQ2.adapter;
    window.__短答 = A.presetToV2({
      id: "test:short", name: "短答の検証",
      cards: [
        { id: 1, front: "日本の首都は？", back: "東京" },
        { id: 2, front: "1 + 1 は？", back: "2" }
      ]
    });
    window.__四択 = A.presetToV2({
      id: "test:mcq", name: "4 択の検証",
      cards: [
        { id: 1, front: "日本の首都は？", back: "東京", choices: ["大阪", "東京", "京都", "名古屋"], correctIndex: 1 },
        { id: 2, front: "フランスの首都は？", back: "パリ", choices: ["パリ", "ローマ", "ベルリン", "マドリード"], correctIndex: 0 }
      ]
    });
  });
  const 種類 = await p.evaluate(() => ({
    短答: window.__短答.questions.map((q) => q.type),
    四択: window.__四択.questions.map((q) => q.type)
  }));
  ok("短答の 検証台は 短答に なっている", 種類.短答.every((t) => t === "short_answer"), 種類.短答);
  ok("4 択の 検証台は 4 択に なっている", 種類.四択.every((t) => t === "multiple_choice_single"), 種類.四択);

  節("② 打っている 途中で 答え合わせしない（いちばんの 訴え）");
  await p.evaluate(() => {
    window.VQ2.quizPlayer.open({ preset: window.__短答, mode: "study", resume: false, shuffleQuestions: false });
  });
  await p.waitForTimeout(1800);
  const 入力ある = await p.evaluate(`(() => { const 深=${深く}; return 深("[data-qr-text]").length; })()`);
  ok("短答の 入力欄が 出ている", 入力ある >= 1, 入力ある);

  /* 1 文字ずつ 打つ。まちがっている 途中の 文字でも 何も 出てはいけない。 */
  const 打った = await p.evaluate(`(async () => {
    const 深 = ${深く};
    const el = 深("[data-qr-text]")[0];
    if (!el) return { なし: true };
    el.focus();
    const 印 = "vq-" + Date.now();
    el.dataset.vqMark = 印;                       /* 作り直されたら 消える */
    const 文 = "東京";
    const 途中 = [];
    for (const ch of 文) {
      el.value += ch;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 220));
      const いま = 深("[data-qr-text]")[0];
      途中.push({
        値: いま ? いま.value : "",
        同じ欄: !!(いま && いま.dataset.vqMark === 印),
        答えが出た: 深(".vq2-card").some((c) => /正解|不正解/.test(c.textContent || "")),
        焦点: document.activeElement === いま || (いま && いま.contains(document.activeElement))
      });
    }
    return { 途中: 途中, 最後: (深("[data-qr-text]")[0] || {}).value };
  })()`);
  ok("打っている 間に 答えが 出ない", (打った.途中 || []).every((x) => !x.答えが出た),
    (打った.途中 || []).map((x) => x.値 + ":" + x.答えが出た).join(" / "));
  ok("入力欄が 作り直されない（打ち続けられる）", (打った.途中 || []).every((x) => x.同じ欄),
    (打った.途中 || []).map((x) => x.同じ欄).join(","));
  ok("打った 文字が すべて 残る", 打った.最後 === "東京", 打った.最後);

  節("③ 打ち終わって「答え合わせ」を 押したら 出る");
  const 押した = await p.evaluate(`(async () => {
    const 深 = ${深く};
    const b2 = 深('[data-act="check"]')[0];
    if (!b2) return { なし: true, ボタン: 深("[data-act]").map(x => x.getAttribute("data-act")).slice(0, 12) };
    b2.click();
    await new Promise((r) => setTimeout(r, 700));
    return { 出た: 深(".vq2-card").some((c) => /正解|不正解/.test(c.textContent || "")) };
  })()`);
  ok("「答え合わせ」の ボタンが ある", 押した.なし !== true, 押した.ボタン);
  ok("押したら 答えが 出る", 押した.出た === true, 押した);

  /* ══ ④ 選んだだけでは 答え合わせを しない（2026-08-20・訴え）══════
     「プリセットのクイズ画面なんだけど、間違えた 選択をすると、
       そのまま 答え合わせを してしまう」
     ★ プリセットを 開いたときの 初期値は **study（1 問ずつ）**なので、
       ここが 出てしまうと **ふつうに 使った 人が 必ず 踏む**。 */
  節("④ 4 択で まちがえても、選んだだけでは 答え合わせを しない");
  await p.evaluate(() => {
    /* 「答えたらすぐ解説」も「答えたら自動で次へ」も 切って（既定のまま）試す */
    try { window.__vqSet.set("player.instantExplain", false); } catch (e) {}
    try { window.__vqSet.set("player.autoNext", false); } catch (e) {}
    window.VQ2.quizPlayer.open({ preset: window.__四択, mode: "study", resume: false, shuffleQuestions: false, shuffleChoices: false });
  });
  await p.waitForTimeout(1600);
  const 択 = await p.evaluate(`(async () => {
    const 深 = ${深く};
    const 出 = { 知らせ: null };
    window.addEventListener("vq-answer-wrong", (e) => { 出.知らせ = !!e.detail; }, { once: true });
    const cs = 深("[data-qr-choice]");
    if (!cs.length) return { なし: true, 見えたもの: 深("[data-qr-text],[data-act]").length };
    const 誤 = cs.filter((c) => !/東京/.test(c.textContent || ""))[0] || cs[0];
    誤.click();
    await new Promise((r) => setTimeout(r, 900));
    return {
      答えが出た: 深(".vq2-card").some((c) => /正解|不正解/.test(c.textContent || "")),
      進んでいない: 深(".vq2-badge,.vq2-chip,[class*='badge']").some((x) => /問\\s*1\\b/.test(x.textContent || "")),
      答え合わせボタン: 深('[data-act="check"]').length > 0,
      選んだまま: 深("[data-qr-choice][aria-checked='true'],[data-qr-choice].is-on,[data-qr-choice][aria-pressed='true']").length > 0,
      知らせ: 出.知らせ
    };
  })()`);
  ok("4 択の 選択肢が 出ている", 択.なし !== true, 択);
  ok("★ 選んだだけでは 答え合わせを しない", 択.答えが出た === false, 択);
  ok("★ Lumi も 先に 正解を 言わない", !択.知らせ, 択.知らせ);
  ok("次の問題へ 進んでいない", 択.進んでいない === true, 択);
  ok("「答え合わせ」の ボタンは 出ている（自分で 決められる）", 択.答え合わせボタン === true, 択);

  const 押す = await p.evaluate(`(async () => {
    const 深 = ${深く};
    const b2 = 深('[data-act="check"]')[0];
    if (!b2) return { なし: true };
    b2.click();
    await new Promise((r) => setTimeout(r, 800));
    return { 出た: 深(".vq2-card").some((c) => /正解|不正解/.test(c.textContent || "")) };
  })()`);
  ok("★ 押したら 初めて 答え合わせが 出る", 押す.出た === true, 押す);

  /* ══ ④' 「答えたら自動で次へ」が 入っているときは 8/19 の 決まりを 守る ══
     「間違っていたときは 自動で 次の問題に 進まず、詳しい 説明が できるように」 */
  節("④' 自動で次へ が 入っているときは、まちがえたら 進まず 理由を 見せる");
  await p.evaluate(() => {
    try { window.__vqSet.set("player.autoNext", true); } catch (e) {}
    window.VQ2.quizPlayer.open({ preset: window.__四択, mode: "practice", resume: false, shuffleQuestions: false, shuffleChoices: false });
  });
  await p.waitForTimeout(1600);
  const 自動 = await p.evaluate(`(async () => {
    const 深 = ${深く};
    const 出 = { 知らせ: null };
    window.addEventListener("vq-answer-wrong", (e) => { 出.知らせ = !!e.detail; }, { once: true });
    const cs = 深("[data-qr-choice]");
    if (!cs.length) return { なし: true };
    const 誤 = cs.filter((c) => !/東京/.test(c.textContent || ""))[0] || cs[0];
    誤.click();
    await new Promise((r) => setTimeout(r, 900));
    return {
      答えが出た: 深(".vq2-card").some((c) => /正解|不正解/.test(c.textContent || "")),
      進んでいない: 深(".vq2-badge,.vq2-chip,[class*='badge']").some((x) => /問\\s*1\\b/.test(x.textContent || "")),
      知らせ: 出.知らせ
    };
  })()`);
  ok("自動で次へでも まちがえたら 進まない", 自動.進んでいない === true, 自動);
  ok("止まった 理由（答え合わせ）は 見せる", 自動.答えが出た === true, 自動);
  ok("Lumi へも 知らせる", 自動.知らせ === true, 自動.知らせ);
  await p.evaluate(() => { try { window.__vqSet.set("player.autoNext", false); } catch (e) {} });

  節("⑤ 「通常」モードでは まちがえても 答えを 出さない");
  await p.evaluate(() => {
    window.VQ2.quizPlayer.open({ preset: window.__四択, mode: "normal", resume: false, shuffleQuestions: false, shuffleChoices: false });
  });
  await p.waitForTimeout(1600);
  const 通常 = await p.evaluate(`(async () => {
    const 深 = ${深く};
    const cs = 深("[data-qr-choice]");
    if (!cs.length) return { なし: true };
    const 誤 = cs.filter((c) => !/東京/.test(c.textContent || ""))[0] || cs[0];
    誤.click();
    await new Promise((r) => setTimeout(r, 800));
    return { 答えが出た: 深(".vq2-card").some((c) => /正解|不正解/.test(c.textContent || "")) };
  })()`);
  ok("通常モードでは 答えを 出さない（最後に 採点します）", 通常.答えが出た === false, 通常);

  節("⑥ 公式プリセットが 4 択で 届く");
  const 公式 = await p.evaluate(async () => {
    /* 本体が 公式の 一覧を 取りに行くのを 待つ */
    for (let i = 0; i < 40; i++) {
      if (typeof window.__vqPresetSource === "function") {
        const v1 = window.__vqPresetSource("eiken:w99");
        if (v1 && ((v1.words || []).length || (v1.cards || []).length)) return { v1 };
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    return { 待てなかった: true, ある: typeof window.__vqPresetSource === "function" };
  });
  ok("本体から 公式の 中身が 取れる", !公式.待てなかった, 公式);
  if (公式.v1) {
    const 語 = 公式.v1.words || [];
    ok("語が 入っている", 語.length >= 4, 語.length);
    const よん択の数 = 語.filter((w) => w && w.mcq && Array.isArray(w.mcq.choices) && w.mcq.choices.length >= 4).length;
    ok("すべての語に 4 択が 付いている（mcq を 落としていない）", よん択の数 === 語.length, よん択の数 + " / " + 語.length);
    const v2 = await p.evaluate(([v1]) => {
      const q = window.VQ2.adapter.presetToV2(v1, { ownerId: "" }).questions;
      return {
        型: q.map((x) => x.type),
        選択肢: q.map((x) => (x.choices || []).length),
        正解あり: q.every((x) => (x.choices || []).some((c) => c.isCorrect)),
        正解の位置: q.map((x) => (x.choices || []).findIndex((c) => c.isCorrect))
      };
    }, [公式.v1]);
    ok("新しい 出題画面の 形でも 4 択に なる", v2.型.every((t) => t === "multiple_choice_single"), v2.型);
    ok("選択肢は 4 つ", v2.選択肢.every((n) => n === 4), v2.選択肢);
    ok("どれにも 正解が 入っている", v2.正解あり === true, v2.正解の位置);
    ok("正解の 場所が ばらけている", new Set(v2.正解の位置).size >= 2, v2.正解の位置);
  }

  節("⑦ 収録教材・標準は 選択肢が 落ちても 4 択にする（保険）");
  const 保険 = await p.evaluate(() => {
    const A = window.VQ2.adapter;
    const 語 = [["apple", "りんご"], ["book", "本"], ["cat", "ねこ"], ["desk", "つくえ"],
                ["egg", "たまご"], ["fish", "さかな"]].map((w, i) => ({ id: i + 1, word: w[0], meaning: w[1] }));
    const 公 = A.presetToV2({ id: "eiken:wZZ", official: true, name: "落ちた公式", words: 語 });
    const 標 = A.presetToV2({ id: "builtin:A", builtin: true, name: "標準", words: 語 });
    /* 人が 作った 短答は 触らない */
    const 人 = A.presetToV2({ id: "p_user_1", name: "自作の短答",
      cards: 語.map((w) => ({ id: w.id, front: w.word, back: w.meaning })) });
    return {
      公: 公.questions.map((q) => q.type),
      標: 標.questions.map((q) => q.type),
      人: 人.questions.map((q) => q.type),
      公の位置: 公.questions.map((q) => (q.choices || []).findIndex((c) => c.isCorrect)),
      もう一度: A.presetToV2({ id: "eiken:wZZ", official: true, name: "落ちた公式", words: 語 })
        .questions.map((q) => (q.choices || []).map((c) => c.text).join("|"))
    };
  });
  ok("公式は 4 択に なる", 保険.公.every((t) => t === "multiple_choice_single"), 保険.公);
  ok("標準も 4 択に なる", 保険.標.every((t) => t === "multiple_choice_single"), 保険.標);
  ok("人が 作った 短答は 短答のまま（勝手に 変えない）", 保険.人.every((t) => t === "short_answer"), 保険.人);
  ok("正解の 場所が ばらける", new Set(保険.公の位置).size >= 2, 保険.公の位置);
  const 二度目 = await p.evaluate(() => {
    const A = window.VQ2.adapter;
    const 語 = [["apple", "りんご"], ["book", "本"], ["cat", "ねこ"], ["desk", "つくえ"],
                ["egg", "たまご"], ["fish", "さかな"]].map((w, i) => ({ id: i + 1, word: w[0], meaning: w[1] }));
    return A.presetToV2({ id: "eiken:wZZ", official: true, name: "落ちた公式", words: 語 })
      .questions.map((q) => (q.choices || []).map((c) => c.text).join("|"));
  });
  ok("開くたびに 選択肢が 変わらない", JSON.stringify(保険.もう一度) === JSON.stringify(二度目),
    (保険.もう一度 || [])[0] + " / " + (二度目 || [])[0]);

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
