import { serve } from "./serve.mjs";
import { chromium } from "playwright";
const { server, port } = await serve(0);
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1500, height: 900 } });
await p.goto(`http://127.0.0.1:${port}/studio/?debug=1`, { waitUntil: "load" });
await p.waitForFunction(() => !!window.VQSTUDIO, null, { timeout: 60000 });
const r = await p.evaluate(async () => {
  const app = window.VQSTUDIO.app;
  if (window.VQSTUDIO.auth && window.VQSTUDIO.auth.guest) window.VQSTUDIO.auth.guest();
  await app.newProject({ name: "数値欄", ratio: "16:9" });
  await new Promise((r2) => setTimeout(r2, 600));
  const s = app.store.project.settings;
  const inputs = Array.from(document.querySelectorAll("#inspector input")).slice(0, 12).map((i) => ({
    v: i.value, w: Math.round(i.getBoundingClientRect().width), sw: i.scrollWidth, cw: i.clientWidth,
    align: getComputedStyle(i).textAlign, pad: getComputedStyle(i).paddingRight
  }));
  return { settings: { w: s.width, h: s.height, fps: s.fps, ratio: s.ratio }, inputs };
});
console.log(JSON.stringify(r, null, 1).slice(0, 1400));
await b.close(); server.close();
