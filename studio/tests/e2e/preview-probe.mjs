/* プレビューが黒くなる原因の切り分け（統合作業用の道具） */
import { serve } from "./serve.mjs";
import { chromium } from "playwright";
const { server, port } = await serve(0);
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"] });
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
p.on("pageerror", (e) => console.log("PAGEERROR:", String(e.message).slice(0, 200)));
p.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE:", m.text().slice(0, 200)); });
await p.goto(`http://127.0.0.1:${port}/studio/?debug=1`, { waitUntil: "load" });
await p.waitForFunction(() => !!window.VQSTUDIO, null, { timeout: 60000 });
const r = await p.evaluate(async () => {
  const out = {};
  const app = window.VQSTUDIO.app;
  if (window.VQSTUDIO.auth && window.VQSTUDIO.auth.guest) window.VQSTUDIO.auth.guest();
  await app.newProject({ name: "黒画面の調べ", ratio: "16:9" });
  /* 素材を作る */
  const cv = document.createElement("canvas"); cv.width = 320; cv.height = 180;
  const ctx = cv.getContext("2d");
  const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m));
  const rec = new MediaRecorder(cv.captureStream(30), { mimeType: mime });
  const parts = []; rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
  rec.start();
  const t0 = performance.now();
  await new Promise((res) => { (function d() { const q = (performance.now() - t0) / 1500;
    ctx.fillStyle = `hsl(${q * 300},80%,55%)`; ctx.fillRect(0, 0, 320, 180);
    ctx.fillStyle = "#fff"; ctx.fillRect(10, 10, 60, 60);
    if (q < 1) requestAnimationFrame(d); else res(); })(); });
  rec.stop(); await new Promise((r2) => { rec.onstop = r2; });
  const file = new File([new Blob(parts, { type: "video/webm" })], "probe.webm", { type: "video/webm" });
  const add = await app.parts.importer.addFiles([file], {});
  out.added = add && (add.added || add.length || 0);
  const s = app.store;
  const asset = s.project.assets[0];
  out.asset = asset ? { id: asset.id, kind: asset.kind, dur: asset.duration, w: asset.width, h: asset.height, storage: asset.storage } : null;
  let track = s.project.tracks.find((t) => t.kind === "video");
  if (!track) { s.dispatch("track.add", { kind: "video" }); track = s.project.tracks.find((t) => t.kind === "video"); }
  const dur = Math.min(1.2, asset.duration || 1.2);
  s.dispatch("clip.add", { trackId: track.id, at: 0, clip: window.VQSTUDIO.schema.newClip("video", { assetId: asset.id, start: 0, duration: dur, in: 0, out: dur }) });
  /* 描かせる */
  const comp = app.parts.compositor, src = app.parts.sources, tr = app.parts.transport;
  out.backend = comp && comp.backend;
  out.compStats = comp && comp.stats ? comp.stats() : null;
  tr.seek(0.3);
  await new Promise((r2) => setTimeout(r2, 1200));
  function pix() {
    const cnv = document.getElementById("previewCanvas");
    const c2 = document.createElement("canvas"); c2.width = 40; c2.height = 24;
    const x = c2.getContext("2d"); x.drawImage(cnv, 0, 0, 40, 24);
    const d = x.getImageData(0, 0, 40, 24).data;
    let sum = 0, nb = 0;
    for (let i = 0; i < d.length; i += 4) { sum += d[i] + d[i + 1] + d[i + 2]; if (d[i] + d[i + 1] + d[i + 2] > 24) nb++; }
    return { avg: Math.round(sum / (d.length / 4) / 3), nonblack: nb, size: cnv.width + "x" + cnv.height };
  }
  out.afterSeek = pix();
  /* 直接 renderFrame も試す */
  try { await comp.renderFrame(s.project, 0.3, { sources: src, quality: 1 }); out.direct = pix(); }
  catch (e) { out.directErr = String(e && e.message || e).slice(0, 300); }
  /* sources が何を返しているか */
  try {
    const ev = await import("/studio/src/core/eval.js");
    const list = ev.clipsAt(s.project, 0.3, { fps: 30 });
    out.resolved = list.map((x) => ({ kind: x.clip.kind, srcTime: x.sourceTime, vis: x.visible, op: x.opacity }));
    const got = list.length ? src.acquire(list[0], { mode: "scrub" }) : null;
    out.source = got ? { kind: got.kind, ready: got.ready, w: got.width, h: got.height, elTime: got.el && got.el.currentTime, rs: got.el && got.el.readyState } : null;
    if (list.length && src.seekExact) {
      const ex = await src.seekExact(list[0]);
      out.seekExact = ex ? { kind: ex.kind, ready: ex.ready, w: ex.width, rs: ex.el && ex.el.readyState, t: ex.el && ex.el.currentTime } : null;
      await comp.renderFrame(s.project, 0.3, { sources: src, quality: 1 });
      out.afterSeekExact = pix();
    }
  } catch (e) { out.srcErr = String(e && e.stack || e).slice(0, 400); }
  out.srcStats = src && src.stats ? src.stats() : null;
  out.compStats2 = comp && comp.stats ? comp.stats() : null;
  return out;
});
console.log(JSON.stringify(r, null, 1).slice(0, 2600));
await p.screenshot({ path: "/tmp/vqs-probe.png" });
await b.close(); server.close();
