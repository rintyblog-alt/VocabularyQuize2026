/* 編集画面の通し試験。
   素材をブラウザ内で作り（canvas + MediaRecorder / OfflineAudioContext）、
   取り込み → 並べる → 分割 → 再生 → AI 自動編集 → 書き出し まで実際に通す。
   実行: node studio/tests/e2e/editor.mjs   （SHOTDIR=/tmp/shots で画像の置き場を指定） */
import { serve } from "./serve.mjs";
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const SHOTDIR = process.env.SHOTDIR || "/tmp/vqs-shots";
await mkdir(SHOTDIR, { recursive: true });

const { server, port } = await serve(0);
const browser = await chromium.launch({
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader",
         "--autoplay-policy=no-user-gesture-required",
         "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"]
});
const results = [];
async function step(name, fn) {
  const t0 = Date.now();
  try { const note = await fn(); results.push({ name, ok: true, note: note || "", ms: Date.now() - t0 }); console.log(`  PASS ${name}${note ? " — " + note : ""}`); }
  catch (e) { results.push({ name, ok: false, note: String(e && e.message || e), ms: Date.now() - t0 }); console.log(`  FAIL ${name} — ${String(e && e.message || e).slice(0, 300)}`); }
}

const page = await browser.newPage({ viewport: { width: 1512, height: 940 }, deviceScaleFactor: 1 });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push("pageerror: " + String(e && e.message || e)));

console.log("── デスクトップ ──");
await step("起動", async () => {
  await page.goto(`http://127.0.0.1:${port}/studio/?debug=1`, { waitUntil: "load" });
  await page.waitForFunction(() => !!window.VQSTUDIO, null, { timeout: 60000 });
  const f = await page.evaluate(() => (window.VQSTUDIO.failures || []).map((x) => x.path));
  return f.length ? "読めなかった部品 " + f.length + " 件: " + f.slice(0, 6).join(", ") : "全部品を読み込み";
});

await step("アカウント画面が出る", async () => {
  const shown = await page.evaluate(() => {
    const el = document.getElementById("authScreen");
    return !!el && !el.classList.contains("hidden") && el.children.length > 0;
  });
  await page.screenshot({ path: `${SHOTDIR}/01-auth.png` });
  if (!shown) throw new Error("authScreen が空か隠れている（起動直後はアカウント画面のはず）");
  return "ok";
});

await step("ゲストで入る", async () => {
  const clicked = await page.evaluate(() => {
    const el = document.getElementById("authScreen");
    if (!el) return false;
    const btns = Array.from(el.querySelectorAll("button, a"));
    const b = btns.find((x) => /ゲスト/.test(x.textContent || ""));
    if (b) { b.click(); return true; }
    return false;
  });
  if (!clicked) {
    await page.evaluate(() => { if (window.VQSTUDIO.auth && window.VQSTUDIO.auth.guest) window.VQSTUDIO.auth.guest(); window.VQSTUDIO.app.goHome(); });
  }
  await page.waitForTimeout(600);
  const screen = await page.evaluate(() => document.documentElement.getAttribute("data-screen"));
  await page.screenshot({ path: `${SHOTDIR}/02-home.png` });
  return "画面=" + screen;
});

await step("新しいプロジェクト", async () => {
  await page.evaluate(() => window.VQSTUDIO.app.newProject({ name: "試験プロジェクト", ratio: "16:9" }));
  await page.waitForTimeout(400);
  const ok = await page.evaluate(() => document.getElementById("app") && !document.getElementById("app").classList.contains("hidden"));
  if (!ok) throw new Error("編集画面が出ない");
  return "ok";
});

await step("素材を作って取り込む", async () => {
  const info = await page.evaluate(async () => {
    /* ① canvas を録って webm の動画を 2 本作る */
    async function makeClip(seconds, hue) {
      const cv = document.createElement("canvas"); cv.width = 320; cv.height = 180;
      const ctx = cv.getContext("2d");
      const stream = cv.captureStream(30);
      const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m));
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 800000 });
      const parts = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
      rec.start();
      const t0 = performance.now();
      await new Promise((resolve) => {
        function draw() {
          const p = (performance.now() - t0) / (seconds * 1000);
          ctx.fillStyle = `hsl(${hue + p * 120}, 70%, ${20 + p * 30}%)`;
          ctx.fillRect(0, 0, 320, 180);
          ctx.fillStyle = "#fff"; ctx.font = "24px sans-serif";
          ctx.fillText("t=" + p.toFixed(2), 20, 100);
          ctx.fillRect(20 + p * 250, 140, 30, 20);
          if (p < 1) requestAnimationFrame(draw); else resolve();
        }
        draw();
      });
      rec.stop();
      await new Promise((r) => { rec.onstop = r; });
      const blob = new Blob(parts, { type: "video/webm" });
      return new File([blob], `clip-${hue}.webm`, { type: "video/webm" });
    }
    /* ② WAV の音を 1 本（120BPM のクリック + サイン） */
    function makeWav(seconds) {
      const sr = 48000, n = sr * seconds, ch = 1;
      const data = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        data[i] = 0.2 * Math.sin(2 * Math.PI * 330 * t);
        const beat = t * 2; /* 120BPM */
        if (beat % 1 < 0.02) data[i] += 0.5 * Math.sin(2 * Math.PI * 1200 * t) * (1 - (beat % 1) / 0.02);
      }
      const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
      const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
      w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVEfmt ");
      v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
      v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true);
      v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 2, true);
      for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i])) * 32767, true);
      return new File([buf], "click.wav", { type: "audio/wav" });
    }
    /* ③ 画像 1 枚 */
    function makePng() {
      const cv = document.createElement("canvas"); cv.width = 640; cv.height = 360;
      const c = cv.getContext("2d");
      const g = c.createLinearGradient(0, 0, 640, 360);
      g.addColorStop(0, "#1b6ca8"); g.addColorStop(1, "#f7b32b");
      c.fillStyle = g; c.fillRect(0, 0, 640, 360);
      return new Promise((res) => cv.toBlob((b) => res(new File([b], "photo.png", { type: "image/png" })), "image/png"));
    }
    const files = [await makeClip(3, 200), await makeClip(2, 20), makeWav(10), await makePng()];
    const importer = window.VQSTUDIO.app.parts.importer;
    if (!importer || !importer.addFiles) return { error: "importer が無い" };
    const r = await importer.addFiles(files, {});
    return { r, assets: window.VQSTUDIO.app.store.project.assets.length };
  });
  if (info.error) throw new Error(info.error);
  if (!info.assets) throw new Error("素材が 0 件");
  return info.assets + " 件取り込み";
});

await step("タイムラインに並べる", async () => {
  const n = await page.evaluate(() => {
    const app = window.VQSTUDIO.app, s = app.store, schema = window.VQSTUDIO.schema;
    const vids = s.project.assets.filter((a) => a.kind === "video");
    let track = s.project.tracks.find((t) => t.kind === "video");
    if (!track) { s.dispatch("track.add", { kind: "video" }); track = s.project.tracks.find((t) => t.kind === "video"); }
    let at = 0;
    vids.forEach((a) => {
      const dur = Math.min(2.5, a.duration || 2);
      s.dispatch("clip.add", { trackId: track.id, at, clip: schema.newClip("video", { assetId: a.id, start: at, duration: dur, in: 0, out: dur }) });
      at += dur;
    });
    return s.project.tracks.reduce((m, t) => m + t.clips.length, 0);
  });
  await page.waitForTimeout(800);
  const dom = await page.evaluate(() => document.querySelectorAll("#tlTracks [data-clip-id], #tlTracks .vqs-clip").length);
  await page.screenshot({ path: `${SHOTDIR}/03-editor.png` });
  if (!n) throw new Error("クリップが置けない");
  return `clip=${n} / DOM=${dom}`;
});

await step("分割・取消・やり直し", async () => {
  const r = await page.evaluate(() => {
    const s = window.VQSTUDIO.app.store;
    const t = s.project.tracks.find((x) => x.clips.length);
    const c = t.clips[0];
    const before = t.clips.length;
    s.dispatch("clip.split", { clipId: c.id, t: c.start + c.duration / 2 });
    const after = s.project.tracks.find((x) => x.id === t.id).clips.length;
    s.undo();
    const undone = s.project.tracks.find((x) => x.id === t.id).clips.length;
    s.redo();
    const redone = s.project.tracks.find((x) => x.id === t.id).clips.length;
    return { before, after, undone, redone };
  });
  if (r.after !== r.before + 1) throw new Error(`分割で増えない: ${JSON.stringify(r)}`);
  if (r.undone !== r.before) throw new Error(`取消が効かない: ${JSON.stringify(r)}`);
  if (r.redone !== r.after) throw new Error(`やり直しが効かない: ${JSON.stringify(r)}`);
  return JSON.stringify(r);
});

await step("再生して絵が変わる", async () => {
  const r = await page.evaluate(async () => {
    const app = window.VQSTUDIO.app;
    const tr = app.parts.transport;
    const cv = document.getElementById("previewCanvas");
    function hash() {
      const c = document.createElement("canvas"); c.width = 32; c.height = 18;
      const x = c.getContext("2d"); x.drawImage(cv, 0, 0, 32, 18);
      const d = x.getImageData(0, 0, 32, 18).data;
      let h = 0; for (let i = 0; i < d.length; i += 4) h = (h * 31 + d[i] + d[i + 1] * 2 + d[i + 2] * 3) % 1e9;
      return h;
    }
    if (!tr) return { error: "transport が無い" };
    tr.seek(0.2); await new Promise((r2) => setTimeout(r2, 400));
    const a = hash();
    tr.play(); await new Promise((r2) => setTimeout(r2, 1200)); tr.pause();
    const b = hash();
    tr.seek(0); await new Promise((r2) => setTimeout(r2, 300));
    return { a, b, time: tr.time };
  });
  if (r.error) throw new Error(r.error);
  if (r.a === r.b) throw new Error("再生しても絵が変わらない（hash が同じ: " + r.a + "）");
  return `hash ${r.a} → ${r.b}`;
});

await step("AI 自動編集（端末内）", async () => {
  const r = await page.evaluate(async () => {
    const app = window.VQSTUDIO.app;
    const [intent, planner, resolve] = await Promise.all([
      import("/studio/src/ai/intent.js"), import("/studio/src/ai/planner.js"), import("/studio/src/ai/resolve.js")
    ]);
    const s = app.store;
    const assets = s.project.assets;
    const it = intent.parseIntentLocal("30秒のテンポいい旅行Vlogにして、テロップ入れて、BGMのビートで切って", { assets });
    const plan = planner.planLocal(it, assets, null);
    const out = resolve.resolvePlan(plan, { project: s.project, assets, beats: null, fps: s.project.settings.fps });
    s.batch("AI 自動編集", (d) => { out.ops.forEach((o) => d(o.type, o.payload)); });
    const clips = s.project.tracks.reduce((m, t) => m + t.clips.length, 0);
    const texts = s.project.tracks.reduce((m, t) => m + t.clips.filter((c) => c.kind === "text").length, 0);
    const v = window.VQSTUDIO.schema.validateProject(s.project);
    return { clips, texts, summary: out.summary, ok: v.ok, errors: (v.errors || []).slice(0, 3), intent: it.targetDuration, pacing: it.pacing };
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTDIR}/04-after-ai.png` });
  if (!r.clips) throw new Error("AI がクリップを作らない");
  if (!r.ok) throw new Error("AI の結果が不整合: " + JSON.stringify(r.errors));
  return `${r.clips} クリップ / テロップ ${r.texts} / ${r.summary || ""}`;
});

await step("AI パネルが開く", async () => {
  await page.click("#btnAi").catch(() => {});
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOTDIR}/05-ai-panel.png` });
  const visible = await page.evaluate(() => {
    const hosts = ["sheetHost", "modalHost"];
    return hosts.some((h) => { const el = document.getElementById(h); return el && el.children.length > 0; }) ||
      !!document.querySelector("[data-test='ai-panel'], .vqs-ai, .vqs-aipanel");
  });
  await page.keyboard.press("Escape");
  if (!visible) throw new Error("AI パネルが出ない");
  return "ok";
});

await step("書き出し（実時間・1 秒）", async () => {
  const r = await page.evaluate(async () => {
    const app = window.VQSTUDIO.app;
    const ex = await import("/studio/src/export/exporter.js");
    const cap = await ex.capabilities();
    const s = app.store;
    let last = 0;
    const out = await ex.exportVideo(s.project, {
      range: { start: 0, end: 1 }, width: 320, height: 180, fps: 15,
      mode: "realtime", container: "auto", videoBitrate: 600000,
      compositor: app.parts.compositor, sources: app.parts.sources, audio: app.parts.audio,
      onProgress: (p) => { last = p; }
    });
    return { size: out && out.blob ? out.blob.size : 0, mime: out && out.mime, mode: out && out.mode,
             warnings: (out && out.warnings) || [], cap: { precise: cap.preciseAvailable, rec: (cap.mediaRecorder || []).length } };
  });
  if (!r.size) throw new Error("書き出しの中身が空: " + JSON.stringify(r));
  return `${Math.round(r.size / 1024)}KB / ${r.mime} / ${r.mode} / precise=${r.cap.precise}`;
});

await step("書き出し画面が開く", async () => {
  await page.click("#btnExport").catch(() => {});
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOTDIR}/06-export.png` });
  const visible = await page.evaluate(() => {
    const hosts = ["sheetHost", "modalHost"];
    return hosts.some((h) => { const el = document.getElementById(h); return el && el.children.length > 0; }) ||
      !!document.querySelector("[data-test='export-dialog'], .vqs-ex");
  });
  await page.keyboard.press("Escape");
  if (!visible) throw new Error("書き出し画面が出ない");
  return "ok";
});

await step("自動保存と再読み込み", async () => {
  const id = await page.evaluate(async () => {
    const app = window.VQSTUDIO.app;
    await app.save();
    return app.store.project.id;
  });
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => !!window.VQSTUDIO, null, { timeout: 60000 });
  const r = await page.evaluate(async (pid) => {
    const p = await window.VQSTUDIO.app.openProject(pid);
    return p ? { clips: p.tracks.reduce((m, t) => m + t.clips.length, 0), name: p.name } : null;
  }, id);
  if (!r) throw new Error("読み戻せない");
  if (!r.clips) throw new Error("読み戻したがクリップが無い");
  return `${r.clips} クリップ / ${r.name}`;
});

console.log("── モバイル（iPhone 相当） ──");
const mob = await browser.newPage({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
});
mob.on("pageerror", (e) => errors.push("mobile pageerror: " + String(e && e.message || e)));
await step("モバイルで起動して編集画面まで", async () => {
  await mob.goto(`http://127.0.0.1:${port}/studio/?debug=1`, { waitUntil: "load" });
  await mob.waitForFunction(() => !!window.VQSTUDIO, null, { timeout: 60000 });
  await mob.screenshot({ path: `${SHOTDIR}/10-m-auth.png` });
  await mob.evaluate(() => { if (window.VQSTUDIO.auth && window.VQSTUDIO.auth.guest) window.VQSTUDIO.auth.guest(); window.VQSTUDIO.app.goHome(); });
  await mob.waitForTimeout(500);
  await mob.screenshot({ path: `${SHOTDIR}/11-m-home.png` });
  await mob.evaluate(() => window.VQSTUDIO.app.newProject({ name: "モバイル試験", ratio: "9:16" }));
  await mob.waitForTimeout(700);
  await mob.screenshot({ path: `${SHOTDIR}/12-m-editor.png` });
  const r = await mob.evaluate(() => {
    const bar = document.getElementById("mobileBar");
    const cs = bar ? getComputedStyle(bar) : null;
    return {
      mobileClass: document.documentElement.classList.contains("vqs-mobile"),
      barChildren: bar ? bar.children.length : 0,
      barVisible: cs ? cs.display !== "none" && cs.visibility !== "hidden" : false,
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 2
    };
  });
  if (!r.mobileClass) throw new Error("モバイル配置に切り替わっていない");
  if (!r.barChildren) throw new Error("下段タブが空");
  if (!r.barVisible) throw new Error("下段タブが見えない");
  if (r.overflowX) throw new Error("横にはみ出している（横スクロールが出る）");
  return `タブ ${r.barChildren} 個`;
});

await step("モバイル: クリップを選ぶと文脈ツールバー", async () => {
  const r = await mob.evaluate(async () => {
    const app = window.VQSTUDIO.app, s = app.store, schema = window.VQSTUDIO.schema;
    const a = schema.newAsset({ kind: "video", name: "m.mp4", duration: 6, width: 1080, height: 1920 });
    s.dispatch("asset.add", { asset: a });
    let track = s.project.tracks.find((t) => t.kind === "video");
    if (!track) { s.dispatch("track.add", { kind: "video" }); track = s.project.tracks.find((t) => t.kind === "video"); }
    s.dispatch("clip.add", { trackId: track.id, at: 0, clip: schema.newClip("video", { assetId: a.id, start: 0, duration: 3, in: 0, out: 3 }) });
    const clip = s.project.tracks.find((t) => t.clips.length).clips[0];
    s.select([clip.id]);
    await new Promise((r2) => setTimeout(r2, 500));
    const cb = document.getElementById("contextBar");
    return { hidden: cb ? cb.classList.contains("hidden") : true, children: cb ? cb.children.length : 0 };
  });
  await mob.screenshot({ path: `${SHOTDIR}/13-m-context.png` });
  if (r.hidden || !r.children) throw new Error("文脈ツールバーが出ない: " + JSON.stringify(r));
  return `${r.children} 個の操作`;
});

/* ── まとめ ── */
console.log("");
const bad = results.filter((r) => !r.ok);
console.log(`結果: ${results.length - bad.length} / ${results.length} 通過`);
if (errors.length) {
  console.log("--- console / page errors (先頭 25) ---");
  [...new Set(errors)].slice(0, 25).forEach((l) => console.log("  " + l.slice(0, 260)));
}
console.log("画像: " + SHOTDIR);
await browser.close();
server.close();
process.exit(bad.length ? 1 : 0);
