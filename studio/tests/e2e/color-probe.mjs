/* 「本当に動画のフレームが画面に出ているか」を色で確かめる。
   前半 1 秒を純赤、後半 1 秒を純青で録画し、0.4s と 1.6s の合成結果の色を見る。 */
import { serve } from "./serve.mjs";
import { chromium } from "playwright";
const { server, port } = await serve(0);
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"] });
const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
p.on("pageerror", (e) => console.log("PAGEERROR:", String(e.message).slice(0, 200)));
await p.goto(`http://127.0.0.1:${port}/studio/?debug=1`, { waitUntil: "load" });
await p.waitForFunction(() => !!window.VQSTUDIO, null, { timeout: 60000 });
const r = await p.evaluate(async () => {
  const app = window.VQSTUDIO.app, schema = window.VQSTUDIO.schema;
  if (window.VQSTUDIO.auth && window.VQSTUDIO.auth.guest) window.VQSTUDIO.auth.guest();
  await app.newProject({ name: "色の確認", ratio: "16:9" });
  const cv = document.createElement("canvas"); cv.width = 320; cv.height = 180;
  const ctx = cv.getContext("2d");
  const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m));
  const rec = new MediaRecorder(cv.captureStream(30), { mimeType: mime, videoBitsPerSecond: 2000000 });
  const parts = []; rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
  rec.start();
  const t0 = performance.now();
  await new Promise((res) => { (function d() {
    const el = (performance.now() - t0) / 1000;
    ctx.fillStyle = el < 1 ? "rgb(255,0,0)" : "rgb(0,0,255)";
    ctx.fillRect(0, 0, 320, 180);
    if (el < 2) requestAnimationFrame(d); else res();
  })(); });
  rec.stop(); await new Promise((r2) => { rec.onstop = r2; });
  const file = new File([new Blob(parts, { type: "video/webm" })], "redblue.webm", { type: "video/webm" });
  await app.parts.importer.addFiles([file], {});
  const s = app.store, asset = s.project.assets[0];
  let track = s.project.tracks.find((t) => t.kind === "video");
  if (!track) { s.dispatch("track.add", { kind: "video" }); track = s.project.tracks.find((t) => t.kind === "video"); }
  const dur = Math.min(2, asset.duration || 2);
  s.dispatch("clip.add", { trackId: track.id, at: 0, clip: schema.newClip("video", { assetId: asset.id, start: 0, duration: dur, in: 0, out: dur }) });
  const comp = app.parts.compositor, src = app.parts.sources;
  function pix() {
    const cnv = document.getElementById("previewCanvas");
    const c2 = document.createElement("canvas"); c2.width = 8; c2.height = 8;
    const x = c2.getContext("2d"); x.drawImage(cnv, 0, 0, 8, 8);
    const d = x.getImageData(0, 0, 8, 8).data;
    let R = 0, G = 0, B = 0; const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) { R += d[i]; G += d[i + 1]; B += d[i + 2]; }
    return [Math.round(R / n), Math.round(G / n), Math.round(B / n)];
  }
  const res = { assetDur: asset.duration };
  for (const t of [0.4, 1.5]) {
    const ev = await import("/studio/src/core/eval.js");
    const list = ev.clipsAt(s.project, t, { fps: 30 });
    if (list.length && src.seekExact) { try { await src.seekExact(list[0]); } catch (e) { res["err" + t] = String(e.message).slice(0, 120); } }
    await comp.renderFrame(s.project, t, { sources: src, quality: 1 });
    await new Promise((r2) => setTimeout(r2, 250));
    await comp.renderFrame(s.project, t, { sources: src, quality: 1 });
    res["t" + t] = pix();
    const got = list.length ? src.acquire(list[0], { mode: "scrub" }) : null;
    res["ready" + t] = got ? { ready: got.ready, rs: got.el && got.el.readyState, ct: got.el && got.el.currentTime, kind: got.kind } : null;
  }
  /* 再生中に絵が出ているか（実測で「再生すると黒くなる」ことがあった） */
  const tr = app.parts.transport;
  res.playSamples = [];
  try {
    tr.seek(0.1);
    await new Promise((r2) => setTimeout(r2, 300));
    tr.play();
    for (let i = 0; i < 6; i++) {
      await new Promise((r2) => setTimeout(r2, 250));
      res.playSamples.push({ t: Number((tr.time || 0).toFixed(2)), rgb: pix() });
    }
    tr.pause();
    res.playing = false;
    res.srcMode = src.stats ? src.stats().mode : null;
    const st = comp.stats ? comp.stats() : null;
    res.compLayers = st && st.layers;
    res.compFrames = st && st.frames;
  } catch (e) { res.playErr = String(e && e.message || e).slice(0, 200); }
  return res;
});
console.log(JSON.stringify(r));
if (r.playSamples) console.log("再生中の色: " + r.playSamples.map((x) => x.t + "s=" + x.rgb.join(",")).join(" / "));
const t04 = r.t0_4 || r["t0.4"], t15 = r["t1.5"];
const isRed = t04 && t04[0] > 120 && t04[2] < 90;
const isBlue = t15 && t15[2] > 120 && t15[0] < 90;
console.log(`0.4s は赤か: ${isRed ? "はい" : "いいえ"} / 1.5s は青か: ${isBlue ? "はい" : "いいえ"}`);
await b.close(); server.close();
process.exit(isRed && isBlue ? 0 : 1);
