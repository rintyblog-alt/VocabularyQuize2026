/* ══════════════════════════════════════════════════════════════════════
   Gemini の鍵が何本入っていて、どれが生きているかを見る

   1 本目を使い切ったら 2 本目へ回る作りになっている。
   その 2 本目が本当に効いているかを、ここで確かめる。

   **鍵そのものは表示しない。** 何本あるか・使えるかだけを見る。
   1 本につき 8 トークンしか使わない。

   使い方: node probe_gemini_keys.cjs
   ══════════════════════════════════════════════════════════════════════ */
const BASE = process.env.VQ_BASE || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

async function call(p, o = {}) {
  const h = { "Content-Type": "application/json" };
  if (o.token) h.Authorization = "Bearer " + o.token;
  const r = await fetch(BASE + p, { method: o.method || "GET", headers: h, body: o.body ? JSON.stringify(o.body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { s: r.status, j: j || {} };
}

(async () => {
  const u = "vqk" + String(Date.now()).slice(-7) + Math.floor(Math.random() * 90 + 10);
  const a = await call("/api/auth/register/start", { method: "POST", body: { email: u + "@gmail.com", gradePrefix: "H2", nickname: u, password: "Passw0rd!vq" } });
  const b = await call("/api/auth/register/verify", { method: "POST", body: { challengeId: a.j.challengeId, code: a.j.devCode } });
  const c = await call("/api/auth/register/consent", { method: "POST", body: { registrationSession: b.j.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: "8306" } });
  if (!c.j.token) { console.error("検証アカウントを作れません"); process.exit(1); }

  const r = await call("/api/ai/probe", { method: "POST", token: c.j.token, body: { provider: "gemini", model: "x", keys: true } });
  if (!r.j.ok) { console.log("読めません: " + JSON.stringify(r.j).slice(0, 200)); process.exit(1); }

  console.log("入っている鍵: " + r.j.本数 + " 本\n");
  (r.j.鍵 || []).forEach((k) => {
    console.log("  " + k.番号 + " 本目: " + k.状態 + "（" + k.ms + "ms）" + (k.error ? "\n      " + k.error : ""));
  });
  const alive = (r.j.鍵 || []).filter((k) => k.状態 === "使える").length;
  console.log("\n使える鍵 " + alive + " / " + r.j.本数 + " 本"
    + "（1 本につき 1 日 500 回。" + (alive * 500) + " 回ぶん使えます）");
})();
