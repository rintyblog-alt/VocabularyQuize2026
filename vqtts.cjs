/* ══════════════════════════════════════════════════════════════════════
   読み上げ（音声問題）

   決めたこと:
   ・**原稿（script）が本体で、音声ファイルは作り方の一つ**
   ・★ 2026-08-26: 音は **サーバで作る**（ローカルAI は 使わない 約束）。
     手元の Bridge は 設定「この端末の AI を使う」を 自分で 入れたときだけ。
   ・どちらも 無理なら 端末の読み上げに 落ちる。**落ちたことを黙らない**
   ・声はプリセット全体で決め、問題ごとに上書きできる
   ・鍵の 無い サーバ（手元の echo）では 音を 作れないので、
     「音を作る」の 数件は **飛ばす**（測れないことと 壊れていることを 分ける）。
     VQ_BASE=<鍵のある URL> で 走らせると 実際に 作って 確かめる。

   ここでは実際にブラウザで動かして、
   声の一覧が取れる → 音が作れる → 問題の再生ボタンから鳴る → 声を選べる
   までを通しで確かめる。
   ══════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
let pass = 0, fail = 0;
const errs = [];
const ok = (n, c, x) => { c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  NG   " + n + (x ? "  → " + x : ""))); };
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
  await pg.addStyleTag({ content: HIDE });
  await pg.waitForTimeout(1800);
  for (let i = 0; i < 3; i++) {
    const c = await pg.evaluate(() => {
      const bd = document.querySelector(".ui-modal-backdrop");
      if (!bd || getComputedStyle(bd).display === "none") return false;
      const b2 = document.getElementById("uiModalOk") || document.getElementById("uiModalCancel");
      if (b2) { b2.click(); return true; } return false;
    });
    if (!c) break;
    await pg.waitForTimeout(300);
  }
}
async function inShadow(pg, hostId, body, arg) {
  return pg.evaluate(({ id, src, a }) => {
    const host = document.getElementById(id);
    if (!host || !host.shadowRoot) return { __no: true };
    const root = host.shadowRoot.querySelector(".vq2-root");
    return new Function("root", "args", src)(root, a);
  }, { id: hostId, src: body, a: arg === undefined ? null : arg });
}
async function waitHost(pg, id) {
  await pg.waitForFunction((i) => {
    const h = document.getElementById(i);
    return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vq2-root"));
  }, id, { timeout: 25000 });
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const pg = await ctx.newPage();
  pg.on("pageerror", (e) => errs.push(String(e).slice(0, 180)));
  /* ★ 2026-08-26: 読み上げは **サーバが 本命**（ローカルAI は 使わない 約束）。
     鍵の 無い 手元の 開発サーバでは 音が 作れないので、
     VQ_BASE で 鍵の ある ところ（開発版 URL）へ 向けられるようにする。 */
  await login(pg, BASE.replace(/\/+$/, "") + "/?vqdev=1");

  console.log("\n── 声の一覧 ──");
  const vs = await pg.evaluate(async () => {
    const r = await window.VQ2.tts.voices({ start: 1 });
    return {
      ok: !!r.ok, n: (r.voices || []).length, engines: r.engines || {},
      langs: [...new Set((r.voices || []).map((v) => v.lang))],
      sample: (r.voices || []).slice(0, 2).map((v) => ({ id: v.id, name: v.name, lang: v.lang }))
    };
  });
  ok("声の一覧が取れる", vs.ok && vs.n > 0, JSON.stringify(vs.engines));
  ok("日本語の声がある", vs.langs.includes("ja"), vs.langs.join(","));
  /* ★ 2026-08-26: 声は 2 系統に なった。
       ・手元の Bridge（VOICEVOX 118 / Kokoro 54）… Mac でしか 動かない
       ・サーバの Gemini（20・男女を 実測で 分けた）… どの端末でも 鳴る
     Bridge が 動いていない 端末では 前者が 丸ごと 出ないので、
     「英語の声」は Bridge が 居るときだけ 見る。 */
  const ブリッジ有り = vs.langs.some((l) => String(l).startsWith("en"))
    || (vs.engines && (vs.engines.kokoro || vs.engines.voicevox));
  if (ブリッジ有り) ok("英語の声がある", vs.langs.some((l) => String(l).startsWith("en")), vs.langs.join(","));
  else ok("Bridge が無くても サーバの声だけは 出る（スマホでも 選べる）",
          vs.n >= 20, { 数: vs.n, 言語: vs.langs.join(",") });
  ok("id・名前・言語がそろっている",
     vs.sample.every((v) => v.id && v.name && v.lang), JSON.stringify(vs.sample));
  console.log("     → " + vs.n + " 個 / " + vs.langs.length + " 言語");

  console.log("\n── 音を作る ──");
  /* ★ **測れないことと 壊れていることを 分ける。**
     サーバに 読み上げの 鍵が 無い（手元の echo など）ときは、
     音は どうやっても 作れない。そこを NG として 並べると、
     本当の 不具合が 埋もれる。**作れるかどうかを 先に 1 回 聞く。** */
  const 鳴らせる = await pg.evaluate(async () => {
    try {
      const h = { "Content-Type": "application/json" };
      const t = localStorage.getItem("app.auth.token.v1");
      if (t) h.Authorization = "Bearer " + t;
      const r = await fetch("/api/tts/speak", { method: "POST", headers: h,
        body: JSON.stringify({ text: "あ", lang: "ja" }) });
      return r.status === 200 && /audio/.test(r.headers.get("content-type") || "");
    } catch (e) { return false; }
  });
  if (!鳴らせる) {
    console.log("  --   このサーバでは 読み上げを 作れません（鍵が 無い）。"
      + "音を作る の 4 件は 飛ばします。VQ_BASE=<鍵のある URL> で 走らせてください。");
  }
  const ja = !鳴らせる ? null : await pg.evaluate(async () => {
    const t0 = performance.now();
    const r = await window.VQ2.tts.make("図書館は 6 時に閉まります。", { voice: "voicevox:3" });
    return { ok: !!r.ok, bytes: r.blob ? r.blob.size : 0, seconds: r.seconds, ms: Math.round(performance.now() - t0), reason: r.reason };
  });
  if (鳴らせる) {
    ok("日本語の音を作れる", ja.ok && ja.bytes > 1000, ja.reason || (ja.bytes + " バイト"));
    ok("長さが返る（進み具合を作り話しない）", ja.seconds > 0, String(ja.seconds));
    console.log("     → " + ja.bytes + " バイト / " + ja.seconds + " 秒 / " + ja.ms + " ms");

    const en = await pg.evaluate(async () => {
      const t0 = performance.now();
      const r = await window.VQ2.tts.make("The library closes at six.", { voice: "kokoro:af_heart" });
      return { ok: !!r.ok, bytes: r.blob ? r.blob.size : 0, ms: Math.round(performance.now() - t0), reason: r.reason };
    });
    ok("英語の音を作れる", en.ok && en.bytes > 1000, en.reason || (en.bytes + " バイト"));
    console.log("     → " + en.bytes + " バイト / " + en.ms + " ms");

    const again = await pg.evaluate(async () => {
      const t0 = performance.now();
      const r = await window.VQ2.tts.make("図書館は 6 時に閉まります。", { voice: "voicevox:3" });
      return { cached: !!r.cached, ms: Math.round(performance.now() - t0) };
    });
    ok("同じ原稿・同じ声なら作り直さない", again.cached, JSON.stringify(again));
  }

  const bad = await pg.evaluate(async () => {
    const r = await window.VQ2.tts.make("test", { voice: "voicevox:99999" });
    return { ok: !!r.ok, reason: r.reason || "" };
  });
  ok("知らない声は断る（黙って別の声にしない）", !bad.ok && bad.reason.length > 0, bad.reason);

  console.log("\n── 声の選び分け ──");
  const pick = await pg.evaluate(() => {
    const T = window.VQ2.tts;
    return {
      jaAuto: T.defaultVoiceFor("これは日本語です。"),
      enAuto: T.defaultVoiceFor("This is English."),
      fromQ: T.voiceOf({ voice: "kokoro:am_adam" }, { audio: { voice: "voicevox:3" } }),
      fromPreset: T.voiceOf({ script: "Hello." }, { audio: { voice: "voicevox:8" } }),
      speed: T.speedOf({ speed: 1.5 }, { audio: { speed: 0.8 } }),
      dictScript: T.scriptOf({ engine: "dictation", correctAnswer: "This is a pen." })
    };
  });
  ok("日本語は日本語の声になる", /^voicevox:/.test(pick.jaAuto), pick.jaAuto);
  ok("英語は英語の声になる", /^kokoro:/.test(pick.enAuto), pick.enAuto);
  ok("問題の声がプリセットより優先される", pick.fromQ === "kokoro:am_adam", pick.fromQ);
  ok("問題に指定が無ければプリセットの声を使う", pick.fromPreset === "voicevox:8", pick.fromPreset);
  ok("速さも問題が優先される", pick.speed === 1.5, String(pick.speed));
  ok("書き取りは正解の文が原稿になる", pick.dictScript === "This is a pen.", pick.dictScript);

  console.log("\n── 問題の再生ボタン ──");
  await pg.evaluate(() => {
    document.querySelectorAll(".vq2-host").forEach((h) => h.remove());
    const host = document.createElement("div");
    host.id = "ttsStage";
    host.style.cssText = "position:fixed;left:0;top:0;width:900px;height:400px;z-index:9;background:#fff";
    document.body.appendChild(host);
    const q = window.VQ2.qmodel.normalize({
      type: "audio_choice", prompt: "音声を聞いて答えなさい。",
      script: "The library closes at six in the evening.",
      settings: { replayLimit: 2 },
      choices: [{ id: "c1", text: "5 時", isCorrect: false }, { id: "c2", text: "6 時", isCorrect: true }]
    });
    host.innerHTML = window.VQ2.qrender.html(q, null, {});
    window.__ttsQ = q;
    window.__ttsBind = window.VQ2.qrender.bind(host, q, null, {
      onLocalState: (p) => { window.__ttsLocal = Object.assign(window.__ttsLocal || {}, p); }
    });
  });
  await pg.waitForTimeout(200);
  const box = await pg.evaluate(() => {
    const b = document.querySelector("#ttsStage .vq2-audio");
    return b ? { mode: b.getAttribute("data-audio-mode"), limit: b.getAttribute("data-limit"),
                 meta: (b.querySelector(".vq2-audio-meta") || {}).textContent || "" } : null;
  });
  ok("原稿だけの問題にも再生ボタンが出る", !!box && box.mode === "script", JSON.stringify(box));
  ok("聞ける回数が先に見える", box && /あと 2 回/.test(box.meta), box && box.meta);

  await pg.evaluate(() => document.querySelector('#ttsStage [data-act="qr-audio-play"]').click());
  await pg.waitForFunction(() => {
    const m = document.querySelector("#ttsStage .vq2-audio-meta");
    return m && !/用意しています/.test(m.textContent);
  }, { timeout: 30000 });
  const after = await pg.evaluate(() => ({
    meta: document.querySelector("#ttsStage .vq2-audio-meta").textContent,
    counted: (window.__ttsLocal || {}).replayCount
  }));
  ok("押すと鳴り、残り回数が減る", /あと 1 回/.test(after.meta), after.meta);
  ok("聞いた回数が呼び出し側へ伝わる", after.counted === 1, String(after.counted));

  /* 鳴り終わるまで待つ。鳴っている間に押しても二重に数えない（それも確かめる）。 */
  const ignored = await pg.evaluate(() => {
    const b = document.querySelector('#ttsStage [data-act="qr-audio-play"]');
    const playing = document.querySelector("#ttsStage .vq2-audio").classList.contains("is-playing");
    b.click();
    return { playing: playing, count: (window.__ttsLocal || {}).replayCount };
  });
  ok("鳴っている間に押しても二重に数えない", ignored.count === 1, JSON.stringify(ignored));
  await pg.waitForFunction(() => !document.querySelector("#ttsStage .vq2-audio").classList.contains("is-playing"),
    { timeout: 30000 });

  await pg.evaluate(() => document.querySelector('#ttsStage [data-act="qr-audio-play"]').click());
  await pg.waitForFunction(() => /もう聞けません/.test(document.querySelector("#ttsStage .vq2-audio-meta").textContent),
    { timeout: 30000 });
  const done = await pg.evaluate(() => ({
    disabled: document.querySelector('#ttsStage [data-act="qr-audio-play"]').disabled
  }));
  ok("上限まで聞いたら押せなくなる", done.disabled, JSON.stringify(done));

  console.log("\n── 声を選ぶ画面 ──");
  await pg.evaluate(() => {
    document.getElementById("ttsStage").remove();
    window.__vp = window.VQ2.voicePicker.open({ value: "voicevox:3", speed: 1 });
  });
  await waitHost(pg, "vq2-voice-picker");
  await pg.waitForTimeout(1200);
  const vp = await inShadow(pg, "vq2-voice-picker", `
    const orb = root.querySelector(".vq2-vp-orb");
    const rows = [...root.querySelectorAll(".vq2-vp-rw")].map(r => r.textContent.replace(/\\s+/g, " ").trim());
    return {
      name: (root.querySelector(".vq2-vp-name") || {}).textContent || "",
      desc: (root.querySelector(".vq2-vp-desc") || {}).textContent || "",
      sub: (root.querySelector(".vq2-vp-sub") || {}).textContent || "",
      dots: root.querySelectorAll(".vq2-vp-dot").length,
      count: (root.querySelector(".vq2-vp-count") || {}).textContent || "",
      hue: orb ? orb.getAttribute("style") : "",
      rows: rows,
      arrows: root.querySelectorAll('[data-act="prev"], [data-act="next"]').length
    };`);
  ok("いま選んでいる声が出る", vp.name.length > 0, vp.name);
  ok("声の説明が出る", vp.desc.length > 0 || vp.sub.length > 0, vp.desc + " / " + vp.sub);
  ok("点は多すぎない（帯にならない）", vp.dots > 0 && vp.dots <= 9, String(vp.dots));
  ok("何番目かが分かる", /\d+\s*\/\s*\d+/.test(vp.count), vp.count);
  ok("声ごとに色が変わる", /--vp-h/.test(vp.hue), vp.hue);
  ok("左右で送れる", vp.arrows === 2, String(vp.arrows));
  ok("話す速さと言語を変えられる", vp.rows.length >= 2, vp.rows.join(" | "));

  /* 名前ではなく声そのもので見る。VOICEVOX は 1 人が何通りもの声を持つので、
     送っても名前は同じまま（「ずんだもん・ノーマル」→「ずんだもん・あまあま」）。 */
  const moved = await inShadow(pg, "vq2-voice-picker", `
    const before = root.querySelector(".vq2-vp-count").textContent
      + "｜" + root.querySelector(".vq2-vp-sub").textContent;
    root.querySelector('[data-act="next"]').click();
    return before;`);
  await pg.waitForTimeout(600);
  const now = await inShadow(pg, "vq2-voice-picker", `
    return root.querySelector(".vq2-vp-count").textContent
      + "｜" + root.querySelector(".vq2-vp-sub").textContent;`);
  ok("送ると別の声になる", now !== moved, moved + " → " + now);

  const picked = await pg.evaluate(async () => {
    const host = document.getElementById("vq2-voice-picker");
    const root = host.shadowRoot.querySelector(".vq2-root");
    root.querySelector('[data-act="ok"], [data-act="x"]').click();
    return await window.__vp;
  });
  /* ★ 2026-08-26: サーバの 声（Gemini）は "Kore" のような **素の名前**。
     Bridge の 声（"voicevox:3" / "kokoro:af_heart"）と どちらも 正しい。
     ここを Bridge の形だけに 縛ると、スマホの 経路が 検査から 落ちる。 */
  ok("選んだ声が返る",
     picked && /^(voicevox|kokoro):|^[A-Z][A-Za-z]+$/.test(String(picked.voice || "")),
     JSON.stringify(picked));

  console.log("\n── 問題ごとの編集（原稿と声）──");
  const ed = await pg.evaluate(() => {
    document.querySelectorAll(".vq2-host").forEach((h) => h.remove());
    const host = document.createElement("div");
    host.id = "edStage";
    host.style.cssText = "position:fixed;left:0;top:0;width:900px;height:600px;z-index:9;background:#fff;overflow:auto";
    document.body.appendChild(host);
    const out = {};
    ["audio_choice", "dictation", "audio_fill_blank"].forEach((t) => {
      const q = window.VQ2.qmodel.empty(t);
      window.VQ2.qtypeEditor.ensure(q);
      host.innerHTML = window.VQ2.qtypeEditor.html(q);
      out[t] = {
        script: !!host.querySelector('[data-qe="script"]'),
        voice: !!host.querySelector('[data-act="qe-voice"]'),
        tryPlay: !!host.querySelector('[data-act="qe-voice-try"]'),
        file: !!host.querySelector('[data-act="qe-pick"][data-id^="media:audio"]')
      };
    });
    return out;
  });
  ok("リスニング選択に原稿欄が出る", ed.audio_choice.script, JSON.stringify(ed.audio_choice));
  ok("音声穴埋めにも原稿欄が出る", ed.audio_fill_blank.script, JSON.stringify(ed.audio_fill_blank));
  ok("書き取りは原稿欄を出さない（正解の文がそれ）", !ed.dictation.script, JSON.stringify(ed.dictation));
  ok("どの音声形式でも声を選べる",
     ["audio_choice", "dictation", "audio_fill_blank"].every((t) => ed[t].voice && ed[t].tryPlay),
     JSON.stringify(ed));
  ok("自分で用意した音声も選べる",
     ["audio_choice", "dictation", "audio_fill_blank"].every((t) => ed[t].file), JSON.stringify(ed));

  const save = await pg.evaluate(() => {
    const host = document.getElementById("edStage");
    const q = window.VQ2.qmodel.empty("audio_choice");
    window.VQ2.qtypeEditor.ensure(q);
    host.innerHTML = window.VQ2.qtypeEditor.html(q);
    window.VQ2.qtypeEditor.bind(host, q, { onChange: () => {} });
    const ta = host.querySelector('[data-qe="script"]');
    ta.value = "The train leaves at eight.";
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    const kept = window.VQ2.qmodel.normalize(q).script;
    return { onQ: q.script, kept: kept };
  });
  ok("書いた原稿が問題に入る", save.onQ === "The train leaves at eight.", save.onQ);
  ok("保存を通しても原稿が残る", save.kept === "The train leaves at eight.", save.kept);
  await pg.evaluate(() => document.getElementById("edStage").remove());

  ok("画面のエラーが出ていない", errs.length === 0, errs.slice(0, 2).join(" / "));

  await browser.close();
  console.log("\n合格 " + pass + " / 不合格 " + fail);
  process.exit(fail ? 1 : 0);
})();
