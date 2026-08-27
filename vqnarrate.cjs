/* ══════════════════════════════════════════════════════════════════════
   作業中の一言（AI が言い回しだけ書く）

   いちばん大事なのは **数字が嘘にならないこと**。
   AI が別の数字を書いたら、その文は捨てて定型文に戻らなければならない。
   ここが緩むと、実際と違う進み具合が自然な日本語で出てしまう。

   見るところ:
     ① 必ず 1 文が返る（AI が落ちても定型文）
     ② 渡した数字がそのまま入っている
     ③ 前置き・改行・記号が混ざっていない
     ④ 短い（読み流せる長さ）
     ⑤ 速い（生成を待たせない）

   使い方: node vqnarrate.cjs
   ══════════════════════════════════════════════════════════════════════ */
const BASE = process.env.VQ_BASE || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => {
  c ? (pass++, console.log("  ok   " + n))
    : (fail++, bad.push(n), console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 220) : "")));
};

async function call(p, o = {}) {
  const h = { "Content-Type": "application/json" };
  if (o.token) h.Authorization = "Bearer " + o.token;
  const r = await fetch(BASE + p, { method: o.method || "GET", headers: h, body: o.body ? JSON.stringify(o.body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { s: r.status, j: j || {} };
}

(async () => {
  const u = "vqn" + String(Date.now()).slice(-7) + Math.floor(Math.random() * 90 + 10);
  const a = await call("/api/auth/register/start", { method: "POST", body: { email: u + "@gmail.com", gradePrefix: "H2", nickname: u, password: "Passw0rd!vq" } });
  const b = await call("/api/auth/register/verify", { method: "POST", body: { challengeId: a.j.challengeId, code: a.j.devCode } });
  const c = await call("/api/auth/register/consent", { method: "POST", body: { registrationSession: b.j.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: "8306" } });
  const tk = c.j.token;
  if (!tk) { console.error("検証アカウントを作れません"); process.exit(1); }

  /* 数字の組み合わせを変えて何度か試す。1 回だけだと、たまたま通っただけかもしれない。 */
  const cases = [
    { kind: "start", made: 0, planned: 20, topic: "高校英語の並べ替え" },
    { kind: "progress", made: 14, planned: 20, topic: "" },
    { kind: "done", made: 20, planned: 20, topic: "" },
    { kind: "done", made: 7, planned: 30, topic: "" }        /* 足りないとき */
  ];

  let aiCount = 0, worst = 0;
  for (const cs of cases) {
    const t0 = Date.now();
    const r = await call("/api/ai/narrate", { method: "POST", token: tk, body: cs });
    const ms = Date.now() - t0;
    worst = Math.max(worst, ms);
    const j = r.j;
    const text = String(j.text || "");
    console.log("\n── " + cs.kind + " " + cs.made + "/" + cs.planned + "（" + ms + "ms・" + (j.source || "?") + "）");
    console.log("   " + text);
    if (j.source === "ai") aiCount++;

    ok("必ず 1 文が返る", !!j.ok && text.length > 0, j);
    /* ══ ここが本丸 ══════════════════════════════════════════
       求めるのは「渡した数字が入っていること」ではない。
       それを求めると、**いちばん自然な文（数字を使わない文）が全部落ちる**。

       困るのは **こちらが渡していない数字が入ること**。
       書かれている数字が、渡した数（頼んだ数・できた数・残り）の
       どれとも違ったら、それは作った数字なので落とす。 */
    const allowed = new Set([cs.made, cs.planned, Math.max(0, cs.planned - cs.made)].map(String));
    const nums = (text.match(/\d+/g) || []).map((n) => String(parseInt(n, 10)));
    ok("★知らない数字を書いていない", nums.every((n) => allowed.has(n)),
      { text, 書かれた数: nums, 渡した数: Array.from(allowed) });
    ok("前置き・改行・記号が無い",
      !/[\n\r{}\[\]<>]/.test(text) && !/^(はい|承知|了解|以下)/.test(text), text);
    ok("読み流せる長さ（90 字以内）", text.length <= 90, text.length);
    /* 実測で「30 7」という数字の羅列が通ってしまったことがある。
       かなが入っているか・数字だらけでないかで、文かどうかを見る。 */
    ok("★日本語の文になっている",
      /[ぁ-んァ-ヶ]/.test(text) && text.length >= 6, text);
    ok("★数字の羅列でない",
      (text.match(/[0-9０-９]/g) || []).length <= text.length * 0.4, text);
  }

  console.log("\n══ まとめ ══");
  console.log("  AI が書いた " + aiCount + " / " + cases.length + " 件（残りは定型文）");
  console.log("  いちばん遅い呼び出し " + worst + "ms");
  ok("★生成を待たせない（3 秒以内）", worst < 3000, worst + "ms");

  console.log("\n合格 " + pass + " / 不合格 " + fail);
  if (bad.length) console.log("直すところ:\n  - " + bad.join("\n  - "));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("実行できませんでした:", e); process.exit(1); });
