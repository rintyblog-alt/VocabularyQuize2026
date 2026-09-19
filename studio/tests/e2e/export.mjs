/* 書き出しの実機検証（ここが壊れると作品が出せない）。
   ① ブラウザ内で webm 素材を作る → ② 取り込んで並べる → ③ precise（WebCodecs + 自前 muxer）
   で mp4/webm を書き出す → ④ 出来たファイルを <video> に読ませて **本当に再生できるか**確かめる。
   実行: node studio/tests/e2e/export.mjs */
import { serve } from "./serve.mjs";
import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";

const { server, port } = await serve(0);
const browser = await chromium.launch({
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"]
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e && e.message || e)));
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });

await page.goto(`http://127.0.0.1:${port}/studio/selftest.html`, { waitUntil: "load" });

const out = await page.evaluate(async () => {
  const log = [];
  const say = (m) => log.push(m);
  try {
    const schema = await import("/studio/src/core/schema.js");
    const storeMod = await import("/studio/src/core/store.js");
    const ex = await import("/studio/src/export/exporter.js");
    const caps = await ex.capabilities();
    say("capabilities: " + JSON.stringify({
      precise: caps.preciseAvailable, containers: caps.containers,
      video: caps.webcodecs && caps.webcodecs.video, audio: caps.webcodecs && caps.webcodecs.audio,
      rec: (caps.mediaRecorder || []).length
    }));

    /* ① 素材（webm 3 秒） */
    const cv = document.createElement("canvas"); cv.width = 320; cv.height = 180;
    const ctx = cv.getContext("2d");
    const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(cv.captureStream(30), { mimeType: mime, videoBitsPerSecond: 900000 });
    const parts = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
    rec.start();
    const t0 = performance.now();
    await new Promise((res) => {
      (function draw() {
        const p = (performance.now() - t0) / 2500;
        ctx.fillStyle = `hsl(${200 + p * 140},70%,${25 + p * 25}%)`; ctx.fillRect(0, 0, 320, 180);
        ctx.fillStyle = "#fff"; ctx.font = "bold 28px sans-serif";
        ctx.fillText("VQ " + p.toFixed(2), 24, 100);
        ctx.fillRect(20 + p * 250, 140, 26, 18);
        if (p < 1) requestAnimationFrame(draw); else res();
      })();
    });
    rec.stop(); await new Promise((r) => { rec.onstop = r; });
    const file = new File([new Blob(parts, { type: "video/webm" })], "src.webm", { type: "video/webm" });
    say("素材: " + Math.round(file.size / 1024) + "KB");

    /* ② プロジェクトを組む（storage を通さず直接 URL を与える道も用意しておく） */
    const persist = await import("/studio/src/core/persist.js");
    const storage = await persist.openStorage();
    const put = await storage.putAsset(file, { name: "src.webm", kind: "video" });
    const url = await storage.getAssetURL(put.key);
    const probe = document.createElement("video");
    probe.muted = true; probe.playsInline = true; probe.src = url;
    await new Promise((res, rej) => {
      probe.onloadedmetadata = res; probe.onerror = () => rej(new Error("素材を読めない"));
      setTimeout(res, 4000);
    });
    const dur = isFinite(probe.duration) && probe.duration > 0 ? probe.duration : 2.5;
    say("素材の尺: " + dur.toFixed(2) + "s / " + probe.videoWidth + "x" + probe.videoHeight);

    const project = schema.newProject({ name: "書き出し試験", settings: { width: 320, height: 180, fps: 15 } });
    const asset = schema.newAsset({
      kind: "video", name: "src.webm", mime: "video/webm", duration: dur,
      width: probe.videoWidth || 320, height: probe.videoHeight || 180, hasAudio: false,
      storage: { kind: "idb", key: put.key }
    });
    const s = storeMod.createStore(project);
    s.dispatch("asset.add", { asset });
    s.dispatch("track.add", { kind: "video" });
    const trackId = s.project.tracks.find((t) => t.kind === "video").id;
    const seg = Math.min(1.2, dur / 2);
    s.dispatch("clip.add", { trackId, at: 0, clip: schema.newClip("video", { assetId: asset.id, start: 0, duration: seg, in: 0, out: seg }) });
    s.dispatch("clip.add", { trackId, at: seg, clip: schema.newClip("video", { assetId: asset.id, start: seg, duration: seg, in: dur - seg, out: dur }) });
    /* テロップも 1 枚入れて、文字が焼き込まれるか見る */
    s.dispatch("track.add", { kind: "overlay" });
    const overId = s.project.tracks.filter((t) => t.kind === "overlay").pop().id;
    const tspec = schema.defaultTextSpec();
    tspec.content = "書き出し試験";
    s.dispatch("clip.add", { trackId: overId, at: 0.2, clip: schema.newClip("text", { start: 0.2, duration: 1.2, text: tspec }) });

    const results = {};
    for (const container of ["mp4", "webm"]) {
      const t1 = performance.now();
      try {
        const r = await ex.exportVideo(s.project, {
          range: { start: 0, end: Math.min(2, seg * 2) },
          width: 320, height: 180, fps: 15, container, mode: "precise",
          videoBitrate: 800000, audioBitrate: 96000, storage,
          onProgress: () => {}
        });
        const bytes = new Uint8Array(await r.blob.arrayBuffer());
        /* ④ 本当に再生できるか */
        const u = URL.createObjectURL(r.blob);
        const v = document.createElement("video");
        v.muted = true; v.playsInline = true; v.src = u;
        const playable = await new Promise((res) => {
          let done = false;
          v.onloadedmetadata = () => { done = true; res({ ok: true, dur: v.duration, w: v.videoWidth, h: v.videoHeight }); };
          v.onerror = () => { if (!done) res({ ok: false, why: (v.error && v.error.message) || "decode error" }); };
          setTimeout(() => { if (!done) res({ ok: false, why: "timeout" }); }, 6000);
        });
        let drew = null;
        if (playable.ok) {
          try {
            v.currentTime = Math.min(0.5, (v.duration || 1) / 2);
            await new Promise((res) => { v.onseeked = res; setTimeout(res, 3000); });
            const c2 = document.createElement("canvas"); c2.width = 32; c2.height = 18;
            c2.getContext("2d").drawImage(v, 0, 0, 32, 18);
            const d = c2.getContext("2d").getImageData(0, 0, 32, 18).data;
            let sum = 0, nonblack = 0;
            for (let i = 0; i < d.length; i += 4) { sum += d[i] + d[i + 1] + d[i + 2]; if (d[i] + d[i + 1] + d[i + 2] > 30) nonblack++; }
            drew = { avg: Math.round(sum / (d.length / 4) / 3), nonblack };
          } catch (e) { drew = { err: String(e && e.message || e) }; }
        }
        URL.revokeObjectURL(u);
        results[container] = {
          ok: true, size: bytes.length, mime: r.mime, mode: r.mode, frames: r.frames,
          warnings: r.warnings || [], head: Array.from(bytes.slice(0, 12)),
          ms: Math.round(performance.now() - t1), playable, drew
        };
      } catch (e) {
        results[container] = { ok: false, err: String(e && e.stack || e).slice(0, 500), ms: Math.round(performance.now() - t1) };
      }
    }

    /* 静止画・音声・字幕・プロジェクトも一応 */
    const extra = {};
    try { const b = await ex.exportStill(s.project, 0.4, { width: 320, height: 180, type: "image/png", storage }); extra.still = b.size; }
    catch (e) { extra.still = "ERR " + String(e && e.message || e).slice(0, 120); }
    try { const b = await ex.exportSubtitles(s.project, { format: "srt" }); extra.srt = (await b.text()).slice(0, 80); }
    catch (e) { extra.srt = "ERR " + String(e && e.message || e).slice(0, 120); }
    try { const b = await ex.exportProject(s.project, { includeAssets: false, storage }); extra.project = b.size; }
    catch (e) { extra.project = "ERR " + String(e && e.message || e).slice(0, 120); }
    try { const b = await ex.exportAudio(s.project, { format: "wav", storage }); extra.audio = b.size; }
    catch (e) { extra.audio = "ERR " + String(e && e.message || e).slice(0, 120); }

    return { log, results, extra };
  } catch (e) {
    return { log, fatal: String(e && e.stack || e).slice(0, 1200) };
  }
});

console.log(out.log.join("\n"));
if (out.fatal) console.log("FATAL:\n" + out.fatal);
for (const k of Object.keys(out.results || {})) {
  const r = out.results[k];
  if (!r.ok) { console.log(`  ${k}: FAIL ${r.err}`); continue; }
  console.log(`  ${k}: ${Math.round(r.size / 1024)}KB ${r.mime} mode=${r.mode} frames=${r.frames} ${r.ms}ms ` +
    `再生=${r.playable && r.playable.ok ? "可(" + (r.playable.dur || "?") + "s " + r.playable.w + "x" + r.playable.h + ")" : "不可: " + (r.playable && r.playable.why)} ` +
    `絵=${r.drew ? JSON.stringify(r.drew) : "-"} ${r.warnings.length ? "警告:" + r.warnings.join("|") : ""}`);
}
if (out.extra) console.log("  その他: " + JSON.stringify(out.extra));
if (errs.length) { console.log("--- errors ---"); [...new Set(errs)].slice(0, 12).forEach((e) => console.log("  " + e.slice(0, 220))); }
await browser.close(); server.close();
const okCount = Object.values(out.results || {}).filter((r) => r.ok && r.playable && r.playable.ok).length;
process.exit(okCount > 0 ? 0 : 1);
