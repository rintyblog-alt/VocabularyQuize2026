/* ══════════════════════════════════════════════════════════════════════════
   区画（チャンク）。巨大な 世界を **重くせずに** 出すための 芯。

   考えかた（ここを 外すと スマホで 落ちる）:
     ① 地面は **区画ごとに 1 枚の 面**を 作って、1 回で 描く。
        マスを 1 個ずつ 積むと 5 万個に なり、毎フレーム 1MB 送る ことに なる。
     ② 風土が 変わる ところは **風土ごとに 面を 分ける**。
        そうすれば 色は 面 1 枚に つき 1 つで 足りる（影の 焼き直しも 減る）。
     ③ 木・岩・草は **静的バッチ**（一度 送ったら 置きっぱなし）。
     ④ 作るのは **1 フレームに 1 区画まで**。まとめて 作ると 画面が 固まる。
     ⑤ 遠い 区画は 木も 草も 出さない。霧で 見えない。

   1 区画 = 32×32 マス = 64×64（世界の 単位）。
   ══════════════════════════════════════════════════════════════════════════ */
import { TILE, SEA } from "./terrain.js";
import { hash2, hash3, fbm, noise2 } from "./noise.js";
import { BIOMES } from "./biome.js";

export const CK = 32;                 /* 1 区画の マス数 */
export const CK_W = CK * TILE;        /* 1 区画の 大きさ（= 64） */

/** 世界の 座標 → 区画の 番号 */
export function chunkOf(wx, wz) {
  return { cx: Math.floor(wx / CK_W), cz: Math.floor(wz / CK_W) };
}
export function chunkKey(cx, cz) { return cx + "," + cz; }

/* ── 地面の 面を 作る ─────────────────────────────────────────────
   高さの 格子（CK+1）×（CK+1）から 三角を 張る。
   ★ **平らに 塗る**（flat shading）。同じ 頂点を 共有しない ので、
     面 ごとに 光が 変わり、低い ポリゴン数でも 陰影が 出る。
   ★ **1 回で 全部の 風土を 作る**（2026-09-02 に 書き直し）。
     前は 風土を 4 マスおきに 拾って から その 風土だけ 張って いた。
     拾い漏れた 風土の マスは **どの 面にも 入らず、地面に 穴が 空く**
     （実測: 自分の 足元が 抜けて 水が 見えていた）。
     ここでは マスごとに 風土を 決め、出てきた ぶんだけ 面を 作る。 */
function buildGrounds(terr, cx, cz) {
  const ox = cx * CK_W, oz = cz * CK_W;

  /* 角の 高さと 風土を 先に 引く */
  const N = CK + 1;
  const H = new Float32Array(N * N);
  const Bi = new Array(N * N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = terr.at(ox + i * TILE, oz + j * TILE);
      H[j * N + i] = a.h;
      Bi[j * N + i] = a.biome;
    }
  }

  /* マスごとの 風土 = 4 隅の いちばん 多いもの（同数なら 左上） */
  const 束 = new Map();      /* biome → {pos:[],nor:[],uv:[],idx:[],v:0} */
  const 取 = (b) => {
    let g = 束.get(b);
    if (!g) { g = { pos: [], nor: [], uv: [], idx: [], v: 0 }; 束.set(b, g); }
    return g;
  };
  /* 地面の むら。細かい ゆらぎ 2 つを 重ねる（土の むら・草の 濃淡）。 */
  const 明 = (lx, lz) => {
    const wx = ox + lx, wz = oz + lz;
    /* ★ そのまま 足すと 真ん中に 集まり、幅が ±8% しか 出ない（実測 0.32〜0.62）。
       広げて 0〜1 を 使い切る。 */
    const a = noise2(wx * 0.085, wz * 0.085);
    const b = noise2(wx * 0.021 + 41.3, wz * 0.021 - 17.7);
    const v = 0.5 + a * 0.62 + b * 0.86;
    return v < 0 ? 0 : v > 1 ? 1 : v;
  };
  const ax = [0, 0, 0], bx = [0, 0, 0], n = [0, 0, 0];
  const 面 = (g, x0, y0, z0, x1, y1, z1, x2, y2, z2) => {
    ax[0] = x1 - x0; ax[1] = y1 - y0; ax[2] = z1 - z0;
    bx[0] = x2 - x0; bx[1] = y2 - y0; bx[2] = z2 - z0;
    n[0] = ax[1] * bx[2] - ax[2] * bx[1];
    n[1] = ax[2] * bx[0] - ax[0] * bx[2];
    n[2] = ax[0] * bx[1] - ax[1] * bx[0];
    const L = Math.hypot(n[0], n[1], n[2]) || 1;
    g.pos.push(x0, y0, z0, x1, y1, z1, x2, y2, z2);
    for (let k = 0; k < 3; k++) g.nor.push(n[0] / L, n[1] / L, n[2] / L);
    /* ★ uv.y に **その 頂点の 明るさ**を 入れる（2026-09-02）。
       描き手は v_params.z < 0 の とき これを 色に 掛ける。
       0.5 が ふつう。ゆらぎで 0〜1 に なる。 */
    g.uv.push(0, 明(x0, z0), 1, 明(x1, z1), 0, 明(x2, z2));
    g.idx.push(g.v, g.v + 1, g.v + 2); g.v += 3;
  };

  const 数 = Object.create(null);
  for (let j = 0; j < CK; j++) {
    for (let i = 0; i < CK; i++) {
      const c0 = Bi[j * N + i], c1 = Bi[j * N + i + 1];
      const c2 = Bi[(j + 1) * N + i], c3 = Bi[(j + 1) * N + i + 1];
      数[c0] = 1; 数[c1] = (数[c1] || 0) + 1;
      let mine = c0, best = 1;
      for (const c of [c1, c2, c3]) {
        let k = 0;
        if (c === c0) k++; if (c === c1) k++; if (c === c2) k++; if (c === c3) k++;
        if (k > best) { best = k; mine = c; }
      }
      const g = 取(mine);
      const x0 = i * TILE, z0 = j * TILE;
      const x1 = x0 + TILE, z1 = z0 + TILE;
      const h00 = H[j * N + i], h10 = H[j * N + i + 1];
      const h01 = H[(j + 1) * N + i], h11 = H[(j + 1) * N + i + 1];
      /* ★ 三角の 割りかたを マスごとに 変える（2026-09-02）。
         いつも 同じ 向きに 割ると、広い 平地に **斜めの 縞**が 見える
         （実写で はっきり 出て いた）。市松に すると 消える。 */
      const 逆 = ((i + j) & 1) === 1;
      /* ★ 回す 向き（2026-09-02）。
         (A,B,C) の 順で 張ると 法線が **下向き**に なり、
         裏面として 消される（実測: 上から 見ると 地面が 1 枚も 無かった）。
         (A,C,B) に して 上を 向かせる。 */
      if (逆) {
        面(g, x0, h00, z0, x0, h01, z1, x1, h11, z1);
        面(g, x0, h00, z0, x1, h11, z1, x1, h10, z0);
      } else {
        面(g, x0, h00, z0, x0, h01, z1, x1, h10, z0);
        面(g, x1, h10, z0, x0, h01, z1, x1, h11, z1);
      }
    }
  }

  const out = [];
  for (const [biome, g] of 束) {
    const position = new Float32Array(g.pos);
    let r = 0;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < position.length; i += 3) {
      const x = position[i], y = position[i + 1], z = position[i + 2];
      const d = x * x + y * y + z * z;
      if (d > r) r = d;
      if (x < min[0]) min[0] = x; if (x > max[0]) max[0] = x;
      if (y < min[1]) min[1] = y; if (y > max[1]) max[1] = y;
      if (z < min[2]) min[2] = z; if (z > max[2]) max[2] = z;
    }
    out.push({
      biome,
      mesh: {
        position,
        normal: new Float32Array(g.nor),
        uv: new Float32Array(g.uv),
        index: g.v > 65000 ? new Uint32Array(g.idx) : new Uint16Array(g.idx),
        bound: { r: Math.sqrt(r), min, max }
      }
    });
  }
  return out;
}

/* ── 生えもの・岩・草の 置きかた ─────────────────────────────────
   ★ 位置は **種と 座標だけ**から 決める。区画を 出し入れしても 動かない。 */
function placeProps(terr, cx, cz, seed) {
  const ox = cx * CK_W, oz = cz * CK_W;
  const 木 = [], 岩 = [], 草 = [], 光 = [], 資源 = [];
  /* 2 マスに 1 回 見る（全部 見ると 遅い） */
  for (let j = 0; j < CK; j += 1) {
    for (let i = 0; i < CK; i += 1) {
      const tx = cx * CK + i, tz = cz * CK + j;
      const r = hash2(tx, tz, seed);
      if (r > 0.34) continue;                          /* ここに 何か 置くか */
      const jx = hash2(tx, tz, seed + 11) * TILE;
      const jz = hash2(tx, tz, seed + 23) * TILE;
      const wx = ox + i * TILE + jx, wz = oz + j * TILE + jz;
      const a = terr.at(wx, wz);
      if (a.water) continue;
      const B = a.B;
      const kind = hash2(tx, tz, seed + 37);
      const size = 0.7 + hash2(tx, tz, seed + 53) * 0.8;
      const yaw = hash2(tx, tz, seed + 71) * Math.PI * 2;

      /* ★ 木の 抜けみち（2026-09-02）。
         同じ 密で 一面に 生やすと **壁に なって 前が 見えない**
         （実写で 森が 通れなかった）。大きな ゆらぎで
         木立ちと 広場を 作る。歩ける 道が 生まれ、絵にも 奥行きが 出る。 */
      const 開 = 0.30 + (fbm(wx * 0.0075 + 12.7, wz * 0.0075 - 33.1, 2) * 0.5 + 0.5) * 1.25;
      if (kind < B.木.密 * 開) {
        木.push([wx, a.h, wz, size, yaw, B.木.形, B.木.幹, B.木.葉]);
      } else if (kind < B.木.密 + 0.16) {
        岩.push([wx, a.h, wz, size * 0.8, yaw, B.岩]);
      } else if (kind < B.木.密 + 0.30) {
        /* 採れる もの（近づくと 拾える）。何が 採れるかは 風土から。 */
        const list = B.取れる;
        const which = list[Math.floor(hash2(tx, tz, seed + 89) * list.length) % list.length];
        資源.push([wx, a.h, wz, which, tx, tz]);
      } else if (kind < B.木.密 + 0.74) {
        草.push([wx, a.h, wz, 0.6 + hash2(tx, tz, seed + 97) * 0.7, yaw, B.草]);
      }
      /* 水晶谷と 洞窟は 自分で 光る */
      if (a.biome === "crystal" && hash2(tx, tz, seed + 131) < 0.12) {
        光.push([wx, a.h, wz, 0.8 + hash2(tx, tz, seed + 137) * 1.2, yaw]);
      }
    }
  }
  return { 木, 岩, 草, 光, 資源 };
}

/** 1 区画ぶんの 素の データ（GL には まだ 触らない）。 */
export function generate(terr, cx, cz, seed) {
  const ox = cx * CK_W, oz = cz * CK_W;
  const grounds = buildGrounds(terr, cx, cz);
  const props = placeProps(terr, cx, cz, seed);
  const mid = terr.at(ox + CK_W * 0.5, oz + CK_W * 0.5);
  return {
    cx, cz, grounds, props,
    center: [ox + CK_W * 0.5, mid.h, oz + CK_W * 0.5],
    radius: CK_W * 0.95,
    biome: mid.biome,
    water: mid.water
  };
}
