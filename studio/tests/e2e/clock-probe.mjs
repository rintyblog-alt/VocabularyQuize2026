import { serve } from "./serve.mjs";
import { chromium } from "playwright";
const { server, port } = await serve(0);
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"] });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("PAGEERROR:", String(e.message).slice(0, 160)));
await p.goto(`http://127.0.0.1:${port}/studio/?debug=1`, { waitUntil: "load" });
await p.waitForFunction(() => !!window.VQSTUDIO, null, { timeout: 60000 });
const r = await p.evaluate(async () => {
  const app = window.VQSTUDIO.app, schema = window.VQSTUDIO.schema;
  await app.newProject({ name: "時計", ratio: "16:9" });
  const s = app.store;
  /* 画像クリップ 6 秒（素材の decode 待ちを除いて時計だけ見る） */
  s.dispatch("track.add", { kind: "video" });
  const tid = s.project.tracks.find((t) => t.kind === "video").id;
  s.dispatch("clip.add", { trackId: tid, at: 0, clip: schema.newClip("shape", { start: 0, duration: 6, shape: schema.defaultShape() }) });
  const tr = app.parts.transport;
  const out = { dur: null, samples: [], events: [] };
  tr.on && tr.on("end", (e) => out.events.push("end@" + JSON.stringify(e && e.time)));
  tr.seek(0);
  await new Promise((r2) => setTimeout(r2, 200));
  const w0 = performance.now();
  tr.play();
  for (let i = 0; i < 10; i++) {
    await new Promise((r2) => setTimeout(r2, 100));
    out.samples.push({ wall: Math.round(performance.now() - w0), t: Number((tr.time || 0).toFixed(3)), playing: tr.playing });
  }
  tr.pause();
  return out;
});
console.log("壁時計ms → 再生位置s:", r.samples.map((x) => `${x.wall}→${x.t}${x.playing ? "" : "(停止)"}`).join(" "));
if (r.events.length) console.log("events:", r.events.join(","));
await b.close(); server.close();
