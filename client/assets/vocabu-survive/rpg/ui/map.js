/* ══════════════════════════════════════════════════════════════════════════
   方位と 小さな 地図。**はてしない 世界で 迷わない ため**。

   ★ 地図は **その場で 描く**（地形は 種から 決まる ので、絵を 持たなくていい）。
     広い 世界でも 保存が 増えない。
   ★ 描き直しは **歩いた ぶん だけ**（毎フレーム 描くと それだけで 重い）。
   ★ 出すのは 4 つ: 自分・向き・町・行き先。増やすと 読めなく なる。
   ══════════════════════════════════════════════════════════════════════════ */
import { BIOMES } from "../world/biome.js";
import { SEA } from "../world/terrain.js";

const 色 = (c, k) => "rgb(" + ((c[0] * 255 * k) | 0) + "," + ((c[1] * 255 * k) | 0) + "," + ((c[2] * 255 * k) | 0) + ")";

export class MiniMap {
  constructor(o) {
    this.terr = o.terrain;
    this.town = o.town;
    this.size = o.size || 132;
    this.範囲 = o.範囲 || 240;      /* 端から 端までの 世界の 広さ */
    this.cv = document.createElement("canvas");
    this.cv.className = "rh-map";
    this.cv.width = this.size * 2;
    this.cv.height = this.size * 2;
    this.ctx = this.cv.getContext("2d");
    this._last = [1e9, 1e9];
    this._町 = null;
  }

  /** 歩いた ぶん だけ 描き直す。
      `洞窟` を 渡すと **地上でなく 洞窟の 間取り**を 描く
      （地上の 草原を 出したまま だと 中に いるのが 伝わらない・2026-09-02）。 */
  update(px, pz, yaw, 目印, 洞窟) {
    const 変 = (!!洞窟) !== (!!this._洞窟);
    this._洞窟 = 洞窟 || null;
    const d = Math.hypot(px - this._last[0], pz - this._last[1]);
    if (d < 6 && this._描いた && !変) { this._印だけ(px, pz, yaw, 目印); return; }
    this._last = [px, pz];
    this._描いた = true;
    if (洞窟) this._洞窟図(px, pz, 洞窟); else this._地形(px, pz);
    this._印だけ(px, pz, yaw, 目印);
  }

  /** 洞窟の 間取り。部屋を 丸、通路を 線で。**行った ところ だけ** 濃くする。 */
  _洞窟図(px, pz, 洞) {
    const c = this.ctx, S = this.size * 2;
    const 幅 = 120;                    /* 洞窟は 狭い ので 寄る */
    c.clearRect(0, 0, S, S);
    c.fillStyle = "#141018"; c.fillRect(0, 0, S, S);
    const X = (wx) => ((wx - px) / 幅 + 0.5) * S;
    const Z = (wz) => ((wz - pz) / 幅 + 0.5) * S;
    const 入 = 洞.入;
    if (!this._見た) this._見た = new Set();
    /* 通路 */
    c.strokeStyle = "#3a3244"; c.lineWidth = 7; c.lineCap = "round";
    for (let i = 0; i < 洞.部屋.length - 1; i++) {
      const a = 洞.部屋[i], b = 洞.部屋[i + 1];
      c.beginPath();
      c.moveTo(X(入.x + a.x), Z(入.z + a.z));
      c.lineTo(X(入.x + b.x), Z(入.z + b.z));
      c.stroke();
    }
    /* 部屋 */
    for (let i = 0; i < 洞.部屋.length; i++) {
      const r = 洞.部屋[i];
      const wx = 入.x + r.x, wz = 入.z + r.z;
      if (Math.hypot(px - wx, pz - wz) < r.半 + 6) this._見た.add(i);
      const 既 = this._見た.has(i);
      c.beginPath();
      c.arc(X(wx), Z(wz), (r.半 / 幅) * S, 0, 6.2832);
      c.fillStyle = 既 ? "#4a4056" : "#2a2434"; c.fill();
      if (r.光) { c.fillStyle = "#8fc6f2"; c.beginPath();
        c.arc(X(wx), Z(wz), 4, 0, 6.2832); c.fill(); }
    }
    /* 出口 */
    c.fillStyle = "#e8c46a";
    c.beginPath(); c.arc(X(入.x), Z(入.z), 6, 0, 6.2832); c.fill();
    c.globalCompositeOperation = "destination-in";
    c.beginPath(); c.arc(S / 2, S / 2, S / 2 - 2, 0, 6.2832); c.fill();
    c.globalCompositeOperation = "source-over";
    this._地形画 = c.getImageData(0, 0, S, S);
  }

  _地形(px, pz) {
    const c = this.ctx, S = this.size * 2;
    const 幅 = this.範囲;
    const 目 = 2;                     /* 何 画素 ごとに 引くか（粗いほど 速い） */
    c.clearRect(0, 0, S, S);
    for (let y = 0; y < S; y += 目) {
      for (let x = 0; x < S; x += 目) {
        const wx = px + ((x / S) - 0.5) * 幅;
        const wz = pz + ((y / S) - 0.5) * 幅;
        const t = this.terr.at(wx, wz);
        const B = BIOMES[t.biome] || BIOMES.meadow;
        /* 高さで 明暗を つける（起伏が 読める） */
        const k = t.water ? 0.62 : 0.72 + Math.min(0.55, t.h / 52);
        c.fillStyle = t.water ? 色(B.水, 0.9) : 色(B.col, k);
        c.fillRect(x, y, 目, 目);
      }
    }
    /* 丸く 切り抜く */
    c.globalCompositeOperation = "destination-in";
    c.beginPath(); c.arc(S / 2, S / 2, S / 2 - 2, 0, 6.2832); c.fill();
    c.globalCompositeOperation = "source-over";
    this._地形画 = c.getImageData(0, 0, S, S);
  }

  _印だけ(px, pz, yaw, 目印) {
    const c = this.ctx, S = this.size * 2, 幅 = this.範囲;
    if (this._地形画) c.putImageData(this._地形画, 0, 0);
    const へ = (wx, wz) => [((wx - px) / 幅 + 0.5) * S, ((wz - pz) / 幅 + 0.5) * S];

    /* 町 */
    const t = this.town && this.town.近くの(px, pz);
    if (t && t.dist < 幅 * 0.75) {
      const [x, y] = へ(t.x, t.z);
      c.fillStyle = "#FFD98A";
      c.beginPath(); c.arc(x, y, 7, 0, 6.2832); c.fill();
      c.strokeStyle = "rgba(0,0,0,.45)"; c.lineWidth = 2; c.stroke();
    }
    /* 行き先（目印） */
    if (目印 && 目印.x !== undefined) {
      const [x, y] = へ(目印.x, 目印.z);
      const dx = x - S / 2, dy = y - S / 2;
      const L = Math.hypot(dx, dy) || 1;
      const r = Math.min(L, S / 2 - 12);
      c.fillStyle = "#9ED0FF";
      c.beginPath(); c.arc(S / 2 + dx / L * r, S / 2 + dy / L * r, 6, 0, 6.2832); c.fill();
    }
    /* 自分（向きつき） */
    c.save();
    c.translate(S / 2, S / 2);
    c.rotate(-yaw);
    c.fillStyle = "#fff";
    c.beginPath();
    c.moveTo(0, -11); c.lineTo(7.5, 8); c.lineTo(0, 4); c.lineTo(-7.5, 8);
    c.closePath(); c.fill();
    c.strokeStyle = "rgba(0,0,0,.5)"; c.lineWidth = 2; c.stroke();
    c.restore();
    /* 北の 印 */
    c.fillStyle = "rgba(255,255,255,.9)";
    c.font = "bold 20px system-ui";
    c.textAlign = "center";
    const nx = S / 2 + Math.sin(yaw) * (S / 2 - 16);
    const ny = S / 2 - Math.cos(yaw) * (S / 2 - 16);
    c.fillText("北", nx, ny + 7);
  }
}
