/* ══════════════════════════════════════════════════════════════════════
   vqttslisten.cjs — リスニングの 読み上げが **どの 提供元で 鳴っているか**を測る

   訴え（2026-08-30）:「リスニングの TTS 効いてない。ジェミニのやつ」

   ここで 見たいのは 1 つだけ:
     リスニングの 文を 投げたとき、返ってくる 音は **Gemini か どうか**。
   返事の X-VQ-TTS-Model が それを 言っている。

   ★ 本番では 走らせない（開発版だけ）。
   ★ 音そのものは 保存しない。大きさと 提供元だけ 見る。

   使い方: node vqttslisten.cjs
   ══════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

let pass = 0, fail = 0;
const 落ち = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ✅ " + n); }
  else { fail++; 落ち.push(n); console.log("  ❌ " + n + (x !== undefined ? "  → " + String(x).slice(0, 400) : "")); }
};
const 節 = (t) => console.log("\n■ " + t);

async function call(p, o = {}) {
  const h = { "Content-Type": "application/json" };
  if (o.token) h.Authorization = "Bearer " + o.token;
  const r = await fetch(BASE + p, {
    method: o.method || "GET", headers: h,
    body: o.body ? JSON.stringify(o.body) : undefined
  });
  const ct = r.headers.get("content-type") || "";
  const 頭 = {
    model: r.headers.get("x-vq-tts-model") || "",
    voice: r.headers.get("x-vq-tts-voice") || "",
    tts: r.headers.get("x-vq-tts") || "",
    missed: r.headers.get("x-vq-tts-missed") || "",
    segments: r.headers.get("x-vq-tts-segments") || ""
  };
  if (ct.indexOf("audio") >= 0) {
    const b = await r.arrayBuffer();
    return { s: r.status, 音: true, 大きさ: b.byteLength, ct, 頭 };
  }
  let j = null; try { j = await r.json(); } catch (e) {}
  return { s: r.status, 音: false, j: j || {}, ct, 頭 };
}

(async () => {
  console.log("測る先: " + BASE + "\n");

  節("① 検証アカウントを作る");
  const u = "vqt" + String(Date.now()).slice(-7) + Math.floor(Math.random() * 90 + 10);
  const a = await call("/api/auth/register/start", { method: "POST",
    body: { email: u + "@gmail.com", gradePrefix: "H2", nickname: u, password: "Passw0rd!vq" } });
  const b = await call("/api/auth/register/verify", { method: "POST",
    body: { challengeId: a.j?.challengeId, code: a.j?.devCode } });
  const c = await call("/api/auth/register/consent", { method: "POST",
    body: { registrationSession: b.j?.registrationSession, agreeTerms: true,
            agreePrivacy: true, agreeAge: true, pin: "8306" } });
  const token = c.j?.token;
  ok("札が とれた", !!token, JSON.stringify({ a: a.s, b: b.s, c: c.s, j: c.j }).slice(0, 300));
  if (!token) { console.log("\n先へ 進めません。"); process.exit(1); }

  節("② 声の 一覧（サーバが 知っている 声）");
  const v = await call("/api/tts/voices", { token });
  const 声 = (v.j?.voices || v.j?.声 || []);
  ok("一覧が とれた", v.s === 200 && Array.isArray(声) && 声.length > 0,
     JSON.stringify(v.j).slice(0, 300));
  if (声.length) {
    console.log("     声: " + 声.map((x) => x.id || x).slice(0, 24).join(", "));
  }

  /* ここからが 本題。リスニングは たいてい 英語。 */
  const 英文 = "Good morning. The train to the airport leaves at nine fifteen from platform three.";
  const 和文 = "つぎの ほうそうを よく きいて、しつもんに こたえて ください。";

  節("③ 英語のリスニング（声を 選ばない = ふつうの 使いかた）");
  const e1 = await call("/api/tts/speak", { method: "POST", token,
    body: { text: 英文, lang: "en" } });
  console.log("     返り: " + JSON.stringify({ s: e1.s, 音: e1.音, 大きさ: e1.大きさ, 頭: e1.頭, j: e1.j }).slice(0, 400));
  ok("音が 返る", e1.音 === true && e1.大きさ > 1024, JSON.stringify(e1.j));
  ok("★ Gemini で 作られている", /gemini/i.test(e1.頭.model),
     "実際の model = " + (e1.頭.model || "(なし)"));

  節("④ 英語のリスニング（声を はっきり 選ぶ）");
  const 別の声 = (声.map((x) => x.id || x).find((x) => String(x).toLowerCase() !== "kore")) || "Puck";
  const e2 = await call("/api/tts/speak", { method: "POST", token,
    body: { text: 英文, lang: "en", voice: 別の声 } });
  console.log("     返り: " + JSON.stringify({ s: e2.s, 音: e2.音, 大きさ: e2.大きさ, 頭: e2.頭, j: e2.j }).slice(0, 400));
  ok("音が 返る（声を 選んだ とき）", e2.音 === true && e2.大きさ > 1024, JSON.stringify(e2.j));
  ok("Gemini で 作られている（声を 選んだ とき）", /gemini/i.test(e2.頭.model),
     "実際の model = " + (e2.頭.model || "(なし)"));

  節("⑤ 既定の 声を そのまま 指す（Kore）");
  const e3 = await call("/api/tts/speak", { method: "POST", token,
    body: { text: 英文 + " Once more.", lang: "en", voice: "Kore" } });
  console.log("     返り: " + JSON.stringify({ s: e3.s, 音: e3.音, 大きさ: e3.大きさ, 頭: e3.頭, j: e3.j }).slice(0, 400));
  ok("Gemini で 作られている（Kore を 指した とき）", /gemini/i.test(e3.頭.model),
     "実際の model = " + (e3.頭.model || "(なし)"));

  節("⑥ 日本語（ここは もともと Gemini の はず）");
  const j1 = await call("/api/tts/speak", { method: "POST", token, body: { text: 和文, lang: "ja" } });
  console.log("     返り: " + JSON.stringify({ s: j1.s, 音: j1.音, 大きさ: j1.大きさ, 頭: j1.頭, j: j1.j }).slice(0, 400));
  ok("音が 返る（日本語）", j1.音 === true && j1.大きさ > 1024, JSON.stringify(j1.j));
  ok("Gemini で 作られている（日本語）", /gemini/i.test(j1.頭.model),
     "実際の model = " + (j1.頭.model || "(なし)"));

  節("⑦ 会話文（[A]/[B] の 段）— リスニングの 本命");
  const seg = await call("/api/tts/speak", { method: "POST", token, body: { segments: [
    { text: "Excuse me, is this the right platform for the airport?", voice: 別の声, speed: 1 },
    { pauseMs: 300 },
    { text: "No, you need platform three. It leaves at nine fifteen.", voice: "Kore", speed: 1 }
  ] } });
  console.log("     返り: " + JSON.stringify({ s: seg.s, 音: seg.音, 大きさ: seg.大きさ, 頭: seg.頭, j: seg.j }).slice(0, 500));
  ok("音が 返る（段）", seg.音 === true && seg.大きさ > 1024, JSON.stringify(seg.j));
  ok("落ちた 段が 無い", seg.頭.missed === "0" || seg.頭.missed === "",
     "落ちた段 = " + seg.頭.missed);

  節("⑧ 読み上げの 提供元を 1 つずつ 叩く（開発版だけの 口）");
  const pr = await call("/api/tts/probe", { method: "POST", token,
    body: { text: "This is a test.", lang: "en" } });
  console.log("     返り: " + JSON.stringify(pr.j).slice(0, 900));
  ok("probe が 答えた", pr.s === 200 || pr.s === 404, "HTTP " + pr.s);

  console.log("\n────────────────────────────────");
  console.log("通った: " + pass + " / 落ちた: " + fail);
  if (落ち.length) console.log("落ちたもの:\n  - " + 落ち.join("\n  - "));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("止まりました:", e); process.exit(1); });
