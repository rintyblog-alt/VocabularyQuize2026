/* ══════════════════════════════════════════════════════════════════════════
   区画の 出し入れ。歩くと 先が でき、うしろが 消える。

   守ること:
     ★ **1 フレームに 作るのは 1 区画まで。** まとめて 作ると 画面が 止まる。
     ★ 遠い 区画は 地面だけ。木も 草も 出さない（霧で 見えない）。
     ★ 捨てるのを ためらわない。GL の 置き場は 有限。
     ★ 近い ところから 作る（プレイヤーの 足元が 先）。
   ══════════════════════════════════════════════════════════════════════════ */
import { generate, chunkOf, chunkKey, CK, CK_W } from "./chunk.js";
import { BIOMES } from "./biome.js";
import { TREE_PARTS } from "../render/meshes.js";
import { Renderer } from "../../engine/renderer.js";

const m4tmp = new Float32Array(16);
function trs(out, x, y, z, sx, sy, sz, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  out[0] = c * sx; out[1] = 0; out[2] = -s * sx; out[3] = 0;
  out[4] = 0; out[5] = sy; out[6] = 0; out[7] = 0;
  out[8] = s * sz; out[9] = 0; out[10] = c * sz; out[11] = 0;
  out[12] = x; out[13] = y; out[14] = z; out[15] = 1;
  return out;
}

export class ChunkManager {
  /**
   * @param {object} o {renderer, terrain, seed, settings}
   */
  constructor(o) {
    this.R = o.renderer;
    this.terr = o.terrain;
    this.seed = o.seed | 0;
    this.settings = o.settings || {};
    /** key → {cx,cz,state,meshIds:[],batches:[],props,center,radius,近い} */
    this.live = new Map();
    this.queue = [];
    this._seq = 0;
    /* 見える 半径（区画の 数）。画質で 変える。 */
    const dd = this.settings.drawDistance || 140;
    this.radius = Math.max(2, Math.min(5, Math.round(dd / CK_W)));
    /* 木や 草を 出す 半径（これより 遠くは 地面だけ） */
    this.detailRadius = Math.max(1, this.radius - 1);
    this.budgetMs = 6;            /* 1 フレームで 作りに 使ってよい 時間 */
    this.stats = { live: 0, built: 0, dropped: 0, queued: 0, tris: 0 };
  }

  /** プレイヤーの 位置から、要る 区画を 決める。 */
  update(px, pz, dtMs) {
    const { cx, cz } = chunkOf(px, pz);
    const need = new Set();
    for (let j = -this.radius; j <= this.radius; j++) {
      for (let i = -this.radius; i <= this.radius; i++) {
        if (i * i + j * j > this.radius * this.radius + 1) continue;
        need.add(chunkKey(cx + i, cz + j));
      }
    }
    /* 無いものを 待ち行列へ（近い順） */
    this.queue.length = 0;
    for (const k of need) {
      if (this.live.has(k)) continue;
      const [a, b] = k.split(",");
      const d = (a - cx) * (a - cx) + (b - cz) * (b - cz);
      this.queue.push({ k, cx: +a, cz: +b, d });
    }
    this.queue.sort((x, y) => x.d - y.d);
    this.stats.queued = this.queue.length;

    /* 要らなく なった ものを 捨てる（少し 余裕を 持たせて ばたつかせない） */
    const 捨てる半径 = this.radius + 1;
    for (const [k, c] of this.live) {
      const dx = c.cx - cx, dz = c.cz - cz;
      if (dx * dx + dz * dz > 捨てる半径 * 捨てる半径) this._drop(k);
    }

    /* 作る。**時間で 打ち切る**（フレームを 落とさない） */
    const t0 = (typeof performance !== "undefined" ? performance.now() : Date.now());
    const 上限 = Math.max(2, this.budgetMs);
    while (this.queue.length) {
      const q = this.queue.shift();
      this._build(q.cx, q.cz);
      const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
      if (now - t0 > 上限) break;
    }
    /* 近い／遠いの 印を 付け直す（木を 出すか 決める） */
    for (const c of this.live.values()) {
      const dx = c.cx - cx, dz = c.cz - cz;
      c.近い = (dx * dx + dz * dz) <= this.detailRadius * this.detailRadius;
    }
    this.stats.live = this.live.size;
  }

  _build(cx, cz) {
    const k = chunkKey(cx, cz);
    if (this.live.has(k)) return;
    const R = this.R;
    const g = generate(this.terr, cx, cz, this.seed);
    const c = {
      cx, cz, key: k, meshIds: [], batches: [], props: g.props,
      center: g.center, radius: g.radius, biome: g.biome, 近い: true, tris: 0
    };
    /* ① 地面（風土ごとに 1 枚）*/
    for (let i = 0; i < g.grounds.length; i++) {
      const id = "ck" + (++this._seq);
      R.addMesh(id, g.grounds[i].mesh);
      /* ★ 地面の 材質（2026-09-02）。つやを ほぼ 消し、**むら**を 入れる。
         1 色で 塗った 地面は どんなに 広くても 紙に 見える。 */
      /* ★ 地面の 肌（2026-09-02）。風土で 変える。
         広い 面なので **大きさは 粗く**（0.18＝ 5.5m で 1 回）。
         細かく すると 走った ときに ちらつく。 */
      if (R.material) {
        const b = g.grounds[i].biome;
        const 肌 = b === "desert" ? 4 : b === "snow" ? 5
          : b === "volcano" ? 2 : b === "swamp" ? 8
          : b === "shore" || b === "beach" ? 4
          : b === "highland" || b === "ruin" ? 2
          : b === "crystal" ? 10 : 3;
        R.material(id, { つや: 6, 強さ: 0.1, むら: 0.035, 細かさ: 0.42,
          肌, 大き: 0.85, 凹凸: 0.16, 粗: 0.95 });
      }
      c.meshIds.push({ id, biome: g.grounds[i].biome });
      c.tris += g.grounds[i].mesh.index.length / 3;
    }
    /* ② 生えもの・岩・草・結晶 を 静的バッチへ */
    this._batchProps(c, g.props);
    this.live.set(k, c);
    this.stats.built++;
    this.stats.tris += c.tris;
  }

  _batchProps(c, P) {
    const R = this.R;
    const 束 = {};   /* meshId → [instance…] */
    const 足す = (id, m, col, emi, rim, sway) => {
      if (!id) return;
      (束[id] || (束[id] = [])).push([Float32Array.from(m), col, emi || 0, rim === undefined ? 0.16 : rim, sway || 0]);
    };
    /* ★ 木の 太さ（2026-09-02）。前は 高さだけ 伸ばして いたので
       **細長い 棒**に 見えた（実写で 確認）。高さに 合わせて 太さも 変える。 */
    for (const t of P.木) {
      const [x, y, z, s, yaw, 形, 幹, 葉] = t;
      const parts = TREE_PARTS[形] || TREE_PARTS.round;
      const hh = 2.0 + s * 1.5;                 /* 2.9〜3.5 くらい */
      const ww = s * (0.85 + hh * 0.16);        /* 高いほど 太く */
      足す(parts[0], trs(m4tmp, x, y, z, ww, hh, ww, yaw), 幹, 0, 0.12, 0);
      if (parts[1]) 足す(parts[1], trs(m4tmp, x, y, z, ww * 1.30, hh, ww * 1.30, yaw), 葉, 0, 0.18, 0.20);
    }
    /* 岩は 少し 埋める（地面から 浮いて 見えない ように）
       ★ 色は **地面より はっきり 暗く**する（2026-09-02）。
         砂原では 岩と 砂が ほぼ 同じ 色で、影だけが 見えて
         **地面の 穴**に 見えた（実写で 確認）。個体ごとにも ずらす。 */
    let ri = 0;
    for (const r of P.岩) {
      const [x, y, z, s, yaw, col] = r;
      const 大 = s > 1.0;
      const k = 0.66 + ((ri++ * 37) % 23) / 23 * 0.2;
      足す(大 ? "rock" : "rock_small",
        trs(m4tmp, x, y - (大 ? 0.22 : 0.12), z, s * (大 ? 1.5 : 1.1), s * (大 ? 1.25 : 1.0), s * (大 ? 1.4 : 1.1), yaw),
        [col[0] * k, col[1] * k, col[2] * (k + 0.03)], 0, 0.14, 0);
    }
    /* ★ 草は 三角の 数に いちばん 効く。段で 間引く（2026-09-02）。
       low では 出さない（あっても 遠くて 見えない）。 */
    const 草率 = this.settings.tier === "low" ? 0 : this.settings.tier === "medium" ? 0.45 : 1;
    if (草率 > 0) {
      let gi = 0;
      for (const g of P.草) {
        if (草率 < 1 && (gi++ % Math.round(1 / 草率)) !== 0) continue;
        const [x, y, z, s, yaw, col] = g;
        /* 草は 少し 埋めて、低く、風で 揺らす。 */
        足す("grass", trs(m4tmp, x, y - 0.05, z, s * 0.9, s * 0.46, s * 0.9, yaw), col, 0, 0.04, 0.6);
      }
    }
    for (const q of P.光) {
      const [x, y, z, s, yaw] = q;
      足す("crystal", trs(m4tmp, x, y, z, s * 0.6, s * 1.6, s * 0.6, yaw), [0.62, 0.56, 0.98], 0.55, 0.4, 0);
    }
    for (const id in 束) {
      const list = 束[id];
      const data = new Float32Array(list.length * 24);
      for (let i = 0; i < list.length; i++) {
        const [m, col, emi, rim, sway] = list[i];
        Renderer.writeInstance(data, i, m, col, emi, rim, 0, sway);
      }
      const h = this.R.addBatch(id, data, { center: c.center, radius: c.radius + 6 });
      if (h) c.batches.push(h);
    }
  }

  _drop(k) {
    const c = this.live.get(k);
    if (!c) return;
    for (const b of c.batches) this.R.dropBatch(b);
    for (const m of c.meshIds) this._dropMesh(m.id);
    this.stats.tris -= c.tris;
    this.live.delete(k);
    this.stats.dropped++;
  }

  _dropMesh(id) {
    const e = this.R.meshes.get(id);
    if (!e) return;
    const gl = this.R.gl;
    for (const l of e.lods) { try { gl.deleteBuffer(l.vbo); gl.deleteBuffer(l.ibo); } catch (x) {} }
    for (const b of e.buckets) { if (b.buf && b.buf.buffer) { try { gl.deleteBuffer(b.buf.buffer); } catch (x) {} } }
    this.R.meshes.delete(id);
  }

  /* ══ 固いもの（2026-09-02）════════════════════════════════════════
     木の 幹と 岩を **すり抜けない**。すり抜けると 森が 絵に なる。
     ★ 見るのは **足元の 区画だけ**。全部 見ると 1 コマ 1 万件に なる。
     ★ 木は 幹だけ。葉に 当てると 木の 下に 入れず 窮屈に なる。 */
  固い(x, z, out) {
    const 結 = out || [];
    const 幅 = CK_W;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const cx = Math.floor((x + di * 3) / 幅), cz = Math.floor((z + dj * 3) / 幅);
        const c = this.live.get(cx + "," + cz);
        if (!c || !c.props) continue;
        if (結.__見た && 結.__見た.has(c)) continue;
        (結.__見た || (結.__見た = new Set())).add(c);
        const T = c.props.木;
        for (let i = 0; i < T.length; i++) {
          const t = T[i];
          if (Math.abs(t[0] - x) > 3 || Math.abs(t[2] - z) > 3) continue;
          結.push([t[0], t[2], 0.28 + t[3] * 0.26]);
        }
        const K = c.props.岩;
        for (let i = 0; i < K.length; i++) {
          const t = K[i];
          if (Math.abs(t[0] - x) > 3.4 || Math.abs(t[2] - z) > 3.4) continue;
          結.push([t[0], t[2], 0.5 + t[3] * 0.7]);
        }
      }
    }
    if (結.__見た) 結.__見た.clear();
    return 結;
  }

  /** 毎フレーム 積む。 */
  draw(R) {
    const I = m4tmp;
    for (const c of this.live.values()) {
      /* 地面。頂点は 区画の 中の 位置なので、角へ ずらして 置く。 */
      const ox = c.cx * CK_W, oz = c.cz * CK_W;
      for (const m of c.meshIds) {
        const B = BIOMES[m.biome] || BIOMES.meadow;
        trs(I, ox, 0, oz, 1, 1, 1, 0);
        /* ★ 区画ごとに 色を **わずかに** ずらす（±4%）。
           まったく 同じ 色だと 広い 地面が 1 枚の 紙に 見える。
           大きく ずらすと 継ぎ目が 目立つ ので 少しだけ。 */
        const k = c._tint || (c._tint = 0.96 + ((Math.abs(c.cx * 31 + c.cz * 17) % 100) / 100) * 0.08);
        /* stripe に **負**を 渡すと、描き手が uv.y を 明るさ として 使う
           （chunk.js が 頂点ごとに 入れて いる）。 */
        R.draw(m.id, I, [B.col[0] * k, B.col[1] * k, B.col[2] * k], 0, 0.06, -1, 0, 1);
      }
      /* 木・岩・草（近い 区画だけ） */
      if (c.近い) for (const b of c.batches) R.drawBatch(b);
    }
  }

  destroy() {
    for (const k of Array.from(this.live.keys())) this._drop(k);
    this.live.clear();
  }
}
