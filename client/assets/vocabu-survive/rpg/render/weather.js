/* ══════════════════════════════════════════════════════════════════════════
   天気と 粒。**画面の 質は ここで 決まる。**

   ★ 粒は **カメラの まわりの 箱**の 中だけに 置き、外へ 出たら 反対へ 回す。
     世界じゅうに 置くと 数が 際限なく 増える。
   ★ 数は 画質の 段で 変える。low では 0（出さない）。
   ★ 天気は 風土と 時刻から **勝手に 決まる**。人が 選ばない。
   ══════════════════════════════════════════════════════════════════════════ */
import { Renderer } from "../../engine/renderer.js";

const m4 = new Float32Array(16);
function trs(o, x, y, z, sx, sy, sz, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  o[0] = c * sx; o[1] = 0; o[2] = -s * sx; o[3] = 0;
  o[4] = 0; o[5] = sy; o[6] = 0; o[7] = 0;
  o[8] = s * sz; o[9] = 0; o[10] = c * sz; o[11] = 0;
  o[12] = x; o[13] = y; o[14] = z; o[15] = 1;
  return o;
}

/* 風土 → 天気の 出やすさ */
const 天気表 = {
  meadow: ["晴", "晴", "晴", "雲", "雨"],
  forest: ["晴", "雲", "雲", "雨", "霧"],
  desert: ["晴", "晴", "晴", "晴", "砂"],
  snow: ["雪", "雪", "雲", "雪", "吹雪"],
  volcano: ["灰", "灰", "晴", "灰", "灰"],
  swamp: ["霧", "霧", "雨", "雲", "霧"],
  highland: ["晴", "風", "雲", "風", "雨"],
  ruin: ["雲", "霧", "晴", "雲", "雨"],
  crystal: ["晴", "光", "光", "雲", "光"],
  shore: ["晴", "晴", "雲", "風", "雨"]
};

export class Weather {
  constructor(o) {
    this.settings = o.settings || {};
    this.今 = "晴";
    this.次まで = 60 + Math.random() * 180;
    this.強 = 0;             /* 0〜1（切り替わりを なめらかに） */
    this.目標 = 0;
    const 段 = this.settings.tier || "medium";
    this.数 = 段 === "low" ? 0 : 段 === "medium" ? 90 : 段 === "high" ? 200 : 320;
    this.粒 = [];
    for (let i = 0; i < this.数; i++) {
      this.粒.push({
        x: (Math.random() - 0.5) * 60, y: Math.random() * 26, z: (Math.random() - 0.5) * 60,
        s: 0.4 + Math.random() * 0.8, v: 0.4 + Math.random() * 0.8, p: Math.random() * 6.28
      });
    }
    this.data = new Float32Array(Math.max(1, this.数) * 24);
    this.t = 0;
  }

  /** 風土が 変わったら 天気も 変える。 */
  update(dt, biome, time, P) {
    this.t += dt;
    this.次まで -= dt;
    if (this.次まで <= 0) {
      this.次まで = 70 + Math.random() * 200;
      const list = 天気表[biome] || 天気表.meadow;
      this.今 = list[Math.floor(Math.random() * list.length)];
    }
    /* 風土が 変わったら すぐ 合わせる（雪原で 雨は おかしい） */
    const list = 天気表[biome] || 天気表.meadow;
    if (list.indexOf(this.今) < 0) this.今 = list[0];
    this.目標 = (this.今 === "晴") ? 0 : (this.今 === "雲" ? 0.15 : this.今 === "霧" ? 0.4 : 1);
    this.強 += (this.目標 - this.強) * Math.min(1, dt * 0.4);
  }

  /** 空・霧へ 効かせる（sky.apply の あとに 呼ぶ）。 */
  apply(R, biome) {
    const k = this.強;
    if (k < 0.02) return;
    /* 曇り・雨・雪は 空を 鈍く、霧を 手前に */
    const 鈍 = 1 - k * (this.今 === "吹雪" || this.今 === "霧" ? 0.5 : 0.3);
    R.sky.top = R.sky.top.map((v, i) => v * 鈍 + (i === 2 ? 0.06 * k : 0.04 * k));
    R.sky.horizon = R.sky.horizon.map((v) => v * 鈍 + 0.06 * k);
    R.fog.near *= (1 - k * 0.55);
    R.fog.far *= (1 - k * 0.42);
  }

  /** 粒を 描く。 */
  draw(R, cam, dt) {
    if (!this.数 || this.強 < 0.05) return;
    const w = this.今;
    if (w === "晴" || w === "雲") return;
    const C = cam.pos;
    const 落 = w === "雨" ? 26 : w === "雪" ? 3.2 : w === "吹雪" ? 6.5 : w === "砂" ? 2.4 : w === "灰" ? 1.6 : 0.8;
    const 横 = w === "吹雪" ? 7 : w === "砂" ? 9 : w === "風" ? 4 : 1.2;
    const 色 = w === "雨" ? [0.74, 0.86, 1.0, 0.62]
      : w === "雪" || w === "吹雪" ? [1, 1, 1, 0.78]
      : w === "砂" ? [0.88, 0.78, 0.54, 0.46]
      : w === "灰" ? [0.42, 0.38, 0.38, 0.52]
      : w === "光" ? [0.80, 0.86, 1.0, 0.72]
      : [0.86, 0.90, 0.96, 0.30];
    const 縦長 = w === "雨" ? 5.5 : 1;
    const n = Math.round(this.数 * this.強);
    let k = 0;
    for (let i = 0; i < n; i++) {
      const p = this.粒[i];
      p.y -= 落 * p.v * dt;
      p.x += Math.sin(this.t * 0.6 + p.p) * 横 * dt;
      p.z += Math.cos(this.t * 0.5 + p.p) * 横 * 0.6 * dt;
      if (p.y < -4) { p.y = 26; p.x = (Math.random() - 0.5) * 60; p.z = (Math.random() - 0.5) * 60; }
      if (p.x > 32) p.x -= 64; else if (p.x < -32) p.x += 64;
      if (p.z > 32) p.z -= 64; else if (p.z < -32) p.z += 64;
      /* ★ 大きさ（2026-09-02・2 度目）。0.22 でも **画面では 見えなかった**
         （実写で 確かめた。仕組みは 動いて いて、ただ 小さすぎた）。 */
      const s = p.s * (w === "雨" ? 0.16 : w === "光" ? 0.45 : w === "灰" ? 0.34 : 0.48);
      trs(m4, C[0] + p.x, C[1] + p.y - 10, C[2] + p.z, s, s * 縦長, s, 0);
      Renderer.writeInstance(this.data, k++, m4, 色, w === "光" ? 0.9 : 0.1, 0.2, 0, 0);
    }
    if (!k) return;
    if (this._h) R.dropBatch(this._h);
    this._h = R.addBatch("mob_eye", this.data.subarray(0, k * 24), {
      center: [C[0], C[1], C[2]], radius: 90 });
    if (this._h) R.drawBatch(this._h);
  }

  destroy(R) { if (this._h) { R.dropBatch(this._h); this._h = null; } }
}
