/* ══════════════════════════════════════════════════════════════════════════
   探索モードの 形。**種類は 少なく、色で 変える**。

   ★ 形を 増やすと 描く 回数が 増える。描く 回数が 増えると スマホが 落ちる。
     木は 4 つの 形だけ 持ち、幹と 葉の 色を 風土から 変えて 別ものに 見せる。
   ★ どれも 低い ポリゴン数。陰影は 平らな 面（flat）で 出す。
   ══════════════════════════════════════════════════════════════════════════ */
import { roundedBox, box, sphere, cylinder, cone, capsule, torus, plane, mergeMeshes } from "../../engine/mesh.js";

/** 形を 平らな 面に する（頂点を 分けて、面ごとの 法線に する）。 */
export function flat(m) {
  const P = [], N = [], U = [], I = [];
  let v = 0;
  const a = [0, 0, 0], b = [0, 0, 0], n = [0, 0, 0];
  for (let k = 0; k < m.index.length; k += 3) {
    const i0 = m.index[k] * 3, i1 = m.index[k + 1] * 3, i2 = m.index[k + 2] * 3;
    const x0 = m.position[i0], y0 = m.position[i0 + 1], z0 = m.position[i0 + 2];
    const x1 = m.position[i1], y1 = m.position[i1 + 1], z1 = m.position[i1 + 2];
    const x2 = m.position[i2], y2 = m.position[i2 + 1], z2 = m.position[i2 + 2];
    a[0] = x1 - x0; a[1] = y1 - y0; a[2] = z1 - z0;
    b[0] = x2 - x0; b[1] = y2 - y0; b[2] = z2 - z0;
    n[0] = a[1] * b[2] - a[2] * b[1];
    n[1] = a[2] * b[0] - a[0] * b[2];
    n[2] = a[0] * b[1] - a[1] * b[0];
    /* ★★ 裏返りを 直す（2026-09-02）★★
       engine/mesh.js の 形は **並べ方の 向きが そろって いない**
       （roundedBox・sphere・frame は 元の 法線と 逆、capsule・torus・plane は 同じ）。
       描き手は 裏面を 捨てる ので、逆の ものは **外側が 消えて 中身が 見える**。
       砂原の 岩が 「地面に 空いた 穴」に 見えて いたのが これ（実写で 確認）。
       ここで **元の 法線に そろえて 並べ直す**。以後 どの 形でも 表が 出る。 */
    let i1b = i1, i2b = i2;
    if (m.normal) {
      /* 3 頂点の 法線を 足して 見る。1 点だけ 見ると
         円錐の てっぺんの ように **向きが 決まらない 頂点**で 外す。 */
      const mx = m.normal[i0] + m.normal[i1] + m.normal[i2];
      const my = m.normal[i0 + 1] + m.normal[i1 + 1] + m.normal[i2 + 1];
      const mz = m.normal[i0 + 2] + m.normal[i1 + 2] + m.normal[i2 + 2];
      const d = n[0] * mx + n[1] * my + n[2] * mz;
      if (d < 0) {
        i1b = i2; i2b = i1;
        n[0] = -n[0]; n[1] = -n[1]; n[2] = -n[2];
      }
    }
    const L = Math.hypot(n[0], n[1], n[2]) || 1;
    P.push(x0, y0, z0,
      m.position[i1b], m.position[i1b + 1], m.position[i1b + 2],
      m.position[i2b], m.position[i2b + 1], m.position[i2b + 2]);
    for (let q = 0; q < 3; q++) N.push(n[0] / L, n[1] / L, n[2] / L);
    U.push(0, 0, 1, 0, 0, 1);
    I.push(v, v + 1, v + 2); v += 3;
  }
  /* ★ 大きさ（bound）を **必ず 付ける**。無いと 描き手が
     lods[0].bound.r を 読んで 落ちる（実測: 画面が 真っ黒に なった）。 */
  const position = new Float32Array(P);
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
  return {
    position, normal: new Float32Array(N),
    uv: new Float32Array(U), index: v > 65000 ? new Uint32Array(I) : new Uint16Array(I),
    bound: { r: Math.sqrt(r), min, max }
  };
}

function move(m, dx, dy, dz, sx, sy, sz) {
  const p = new Float32Array(m.position);
  for (let i = 0; i < p.length; i += 3) {
    p[i] = p[i] * (sx === undefined ? 1 : sx) + dx;
    p[i + 1] = p[i + 1] * (sy === undefined ? 1 : sy) + dy;
    p[i + 2] = p[i + 2] * (sz === undefined ? 1 : sz) + dz;
  }
  return { position: p, normal: m.normal, uv: m.uv, index: m.index };
}

/** Y まわりに 回す。岩を **箱に 見せない** ために 使う。 */
function spin(m, rad) {
  const c = Math.cos(rad), sn = Math.sin(rad);
  const p = new Float32Array(m.position);
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], z = p[i + 2];
    p[i] = x * c - z * sn; p[i + 2] = x * sn + z * c;
  }
  return { position: p, normal: m.normal, uv: m.uv, index: m.index };
}

/* ══ 形の 定義 ═══════════════════════════════════════════════════════
   すべて **原点が 足元**、高さ 1 を 基本に する（置くときに 拡大縮小する）。 */
export const RPG_MESHES = {};

export function buildRpgMeshes(detail) {
  const d = detail === undefined ? 1 : detail;      /* 0=低 1=中 2=高 */
  const seg = d >= 2 ? 10 : d >= 1 ? 7 : 5;
  /* ★ 葉の 分けかた（2026-09-02・実測で 決めた）。
     木の 葉だけで **全体の 71%（28 万面）**を 食べて いた。
     この 絵は 面ごとに 平らに 塗る（flat）ので、分けを 減らすと
     **かえって 角が 立って 良く 見える**。細かくする 意味が 無い。
     10×8 の 玉 4 つ（560 面）→ 7×5 の 玉 3 つ（210 面）。 */
  const 葉seg = d >= 2 ? 7 : d >= 1 ? 6 : 5;
  const 葉環 = d >= 2 ? 5 : 4;
  const M = RPG_MESHES;

  /* ── 木（4 つの 形）── */
  /* 丸い木: 幹＋玉 */
  M.tree_round_trunk = flat(move(cylinder(seg, 0.10, 0.16, 1, true), 0, 0.5, 0));
  M.tree_round_leaf = flat(mergeMeshes([
    move(sphere(葉seg, 葉環, 0.5), 0, 0.99, 0, 1.02, 0.80, 1.02),
    move(sphere(葉seg, 葉環, 0.5), 0.31, 0.76, 0.19, 0.68, 0.56, 0.68),
    move(sphere(葉seg, 葉環, 0.5), -0.06, 1.24, -0.12, 0.62, 0.52, 0.62)
  ]));
  /* 針葉樹: 幹＋円錐 3 段 */
  M.tree_pine_trunk = flat(move(cylinder(seg, 0.07, 0.13, 1, true), 0, 0.5, 0));
  M.tree_pine_leaf = flat(mergeMeshes([
    move(cone(seg, 0.5, 1), 0, 0.34, 0, 1.30, 0.80, 1.30),
    move(cone(seg, 0.5, 1), 0, 0.80, 0, 1.02, 0.72, 1.02),
    move(cone(seg, 0.5, 1), 0, 1.22, 0, 0.70, 0.62, 0.70),
    move(cone(seg, 0.5, 1), 0, 1.58, 0, 0.40, 0.46, 0.40)
  ]));
  /* サボテン */
  M.tree_cactus_trunk = flat(mergeMeshes([
    move(capsule(seg, 3, 0.4, 0.5), 0, 0.68, 0, 0.34, 0.72, 0.34),
    move(capsule(seg, 3, 0.4, 0.4), 0.30, 0.72, 0, 0.20, 0.34, 0.20),
    move(capsule(seg, 3, 0.4, 0.4), -0.28, 0.86, 0, 0.18, 0.30, 0.18)
  ]));
  M.tree_cactus_leaf = M.tree_cactus_trunk;
  /* 枯れ木 */
  M.tree_dead_trunk = flat(mergeMeshes([
    move(cylinder(6, 0.12, 0.20, 1, true), 0, 0.5, 0),
    move(cylinder(5, 0.06, 0.10, 0.6, true), 0.20, 0.86, 0.06, 1, 1, 1),
    move(cylinder(5, 0.06, 0.10, 0.5, true), -0.18, 0.74, -0.10, 1, 1, 1)
  ]));
  M.tree_dead_leaf = null;
  /* しだれ木（沼） */
  M.tree_droop_trunk = flat(move(cylinder(seg, 0.09, 0.15, 1, true), 0, 0.5, 0));
  M.tree_droop_leaf = flat(mergeMeshes([
    move(sphere(葉seg, 葉環, 0.5), 0, 1.20, 0, 0.78, 0.34, 0.78),
    move(box(0.06, 0.5, 0.06), 0.34, 0.92, 0.10),
    move(box(0.06, 0.6, 0.06), -0.30, 0.86, -0.14),
    move(box(0.06, 0.44, 0.06), 0.10, 0.90, -0.32)
  ]));
  /* やし（浜） */
  /* ★ 幹を 太くした（2026-09-02）。0.07 では 40m 先で **1 画素 未満**に なり、
     葉だけが 宙に 浮いて 見えた（実写で 浜が そう なって いた）。 */
  M.tree_palm_trunk = flat(mergeMeshes([
    move(cylinder(seg, 0.15, 0.22, 1, true), 0, 0.5, 0),
    move(cylinder(seg, 0.13, 0.15, 0.5, true), 0.10, 1.18, 0)
  ]));
  /* ★ やしの 葉（2026-09-02 で 作り直し）。
     前は 平らな 板 4 枚の 十字で、浜が **旗を 立てた 棒の 林**に 見えた。
     根もとを 高く・先を 下げ、6 枚に して 垂れるように する。 */
  M.tree_palm_leaf = flat(mergeMeshes((() => {
    const 葉 = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const dx = Math.cos(a), dz = Math.sin(a);
      /* 根もと（上がり）→ 先（下がり）を 3 つの 板で 作る */
      葉.push(move(spin(box(0.62, 0.05, 0.20), -a), dx * 0.32, 1.50, dz * 0.32));
      葉.push(move(spin(box(0.54, 0.05, 0.17), -a), dx * 0.82, 1.40, dz * 0.82));
      葉.push(move(spin(box(0.40, 0.05, 0.13), -a), dx * 1.20, 1.20, dz * 1.20));
    }
    葉.push(move(sphere(5, 4, 0.5), 0, 1.46, 0, 0.26, 0.20, 0.26));
    return 葉;
  })()));
  /* 水晶の木 */
  M.tree_crystal_trunk = flat(move(cylinder(6, 0.08, 0.16, 1, true), 0, 0.5, 0));
  M.tree_crystal_leaf = flat(mergeMeshes([
    move(cone(6, 0.5, 1), 0, 0.90, 0, 0.34, 0.90, 0.34),
    move(cone(6, 0.5, 1), 0.24, 0.98, 0.10, 0.22, 0.60, 0.22),
    move(cone(6, 0.5, 1), -0.20, 1.02, -0.12, 0.20, 0.52, 0.20)
  ]));

  /* ── 岩・石 ── */
  /* ★ 岩（2026-09-02 で 作り直し）。前は 平たい 箱 1 つで、
     砂原では **地面に 空いた 穴**に 見えた（実写で 確認）。
     箱を 3 つ ばらばらの 角度で 重ねると 影の 形が 崩れ、岩に 見える。 */
  M.rock = flat(mergeMeshes([
    move(spin(roundedBox(1, 0.2, 1, 0.86, 0.94), 0.42), 0, 0.40, 0),
    move(spin(roundedBox(1, 0.16, 0.72, 0.62, 0.66), -0.7), 0.30, 0.56, 0.20),
    move(spin(roundedBox(1, 0.14, 0.54, 0.5, 0.6), 1.3), -0.28, 0.28, -0.24)
  ]));
  M.rock_small = flat(mergeMeshes([
    move(spin(roundedBox(1, 0.16, 0.62, 0.5, 0.58), 0.5), 0, 0.24, 0),
    move(spin(roundedBox(1, 0.12, 0.38, 0.3, 0.4), -0.9), 0.2, 0.42, 0.12)
  ]));
  /* ── 草 ── */
  /* 草は 数が 多い（1000 本 近く 出る）ので 3 枚に する。
     4 枚 → 3 枚で 1 万面 減る。見た目は 変わらない。 */
  M.grass = flat(mergeMeshes([
    move(box(0.075, 1, 0.03), -0.10, 0.48, 0.04),
    move(box(0.065, 0.82, 0.03), 0.09, 0.40, -0.06),
    move(box(0.06, 0.62, 0.03), 0.01, 0.30, 0.11)
  ]));
  /* ── 光る 結晶 ── */
  M.crystal = flat(mergeMeshes([
    move(cone(6, 0.5, 1), 0, 0, 0, 0.30, 1.0, 0.30),
    move(cone(6, 0.5, 1), 0.20, 0, 0.12, 0.18, 0.62, 0.18)
  ]));
  /* ── 採れるもの の 印（近づくと 拾える 玉）── */
  M.pickup = flat(move(sphere(6, 5, 0.5), 0, 0.42, 0, 0.44, 0.44, 0.44));
  /* ── 水 ── */
  M.water = plane(1, 1, 1, 1);
  /* ── 建物の 部品（建築で 使う）── */
  M.blk_cube = flat(move(roundedBox(1, 0.03, 1, 1, 1), 0, 0.5, 0));
  M.blk_slab = flat(move(roundedBox(1, 0.03, 1, 0.5, 1), 0, 0.25, 0));
  M.blk_post = flat(move(roundedBox(1, 0.04, 0.28, 1, 0.28), 0, 0.5, 0));
  M.blk_roof = flat(move(cone(4, 0.72, 1), 0, 0, 0, 1, 1, 1));
  M.blk_wall = flat(move(box(1, 1, 0.16), 0, 0.5, 0));
  M.blk_door = flat(move(box(0.7, 0.95, 0.12), 0, 0.48, 0));
  M.blk_window = flat(move(box(0.6, 0.6, 0.1), 0, 0.5, 0));
  M.blk_fence = flat(mergeMeshes([
    move(box(0.08, 0.9, 0.08), -0.42, 0.45, 0),
    move(box(0.08, 0.9, 0.08), 0.42, 0.45, 0),
    move(box(1.0, 0.09, 0.06), 0, 0.72, 0),
    move(box(1.0, 0.09, 0.06), 0, 0.42, 0)
  ]));
  M.blk_torch = flat(mergeMeshes([
    move(box(0.09, 0.8, 0.09), 0, 0.4, 0),
    move(sphere(6, 5, 0.5), 0, 0.88, 0, 0.24, 0.24, 0.24)
  ]));
  M.blk_chest = flat(mergeMeshes([
    move(roundedBox(1, 0.05, 0.9, 0.5, 0.6), 0, 0.25, 0),
    move(roundedBox(1, 0.05, 0.92, 0.22, 0.62), 0, 0.60, 0)
  ]));
  M.blk_bench = flat(mergeMeshes([
    move(roundedBox(1, 0.04, 1.0, 0.16, 0.6), 0, 0.62, 0),
    move(box(0.12, 0.6, 0.12), -0.38, 0.3, 0),
    move(box(0.12, 0.6, 0.12), 0.38, 0.3, 0)
  ]));
  M.blk_fire = flat(mergeMeshes([
    move(cylinder(7, 0.5, 0.55, 0.16, true), 0, 0.08, 0, 0.7, 1, 0.7),
    move(cone(6, 0.5, 1), 0, 0.14, 0, 0.34, 0.7, 0.34)
  ]));
  M.blk_farm = flat(move(box(1, 0.18, 1), 0, 0.09, 0));
  M.blk_sign = flat(mergeMeshes([
    move(box(0.09, 0.9, 0.09), 0, 0.45, 0),
    move(box(0.8, 0.42, 0.07), 0, 0.92, 0)
  ]));

  /* ── 生きもの（敵・NPC）── */
  M.mob_body = flat(move(capsule(seg, 4, 0.4, 0.42), 0, 0.5, 0, 1, 1, 1));
  M.mob_blob = flat(move(sphere(seg, Math.max(4, seg - 2), 0.5), 0, 0.42, 0, 1, 0.82, 1));
  M.mob_eye = flat(move(sphere(6, 5, 0.5), 0, 0, 0, 1, 1, 1));
  M.mob_limb = flat(move(capsule(6, 3, 0.4, 0.3), 0, 0, 0, 1, 1, 1));
  M.mob_horn = flat(move(cone(5, 0.5, 1), 0, 0, 0, 1, 1, 1));
  M.mob_wing = flat(move(box(0.9, 0.06, 0.5), 0, 0, 0));
  M.npc_body = flat(move(capsule(seg, 4, 0.4, 0.5), 0, 0.55, 0, 0.9, 1, 0.9));
  M.npc_head = flat(move(sphere(seg, Math.max(4, seg - 2), 0.5), 0, 1.28, 0, 0.52, 0.52, 0.52));
  M.npc_hat = flat(move(cone(seg, 0.5, 1), 0, 1.42, 0, 0.62, 0.5, 0.62));

  /* ── 人（自分）。手足の ある 形（2026-09-02）──────────────────────
     ★ どれも **原点が 付け根**。腕は 肩、脚は 腰。
       そこを 中心に 振る ので、付け根が ずれると 手が 抜ける。 */
  /* ★ 背 1.62 の 割りつけ（2026-09-02 に 測って 決めた）:
       足 0 → 腰 0.72 → 肩 1.20 → 頭のてっぺん 1.62
     ★ **模型の 前は +z**。trs は (0,0,1) を (sin y, cos y) へ 移し、
       人の 向きも (sin y, cos y) なので 一致する。
       目と 髪を −z に 置いて いたので **顔が 後ろ**を 向いて いた（実写で 確認）。 */
  M.pc_torso = flat(mergeMeshes([
    /* 腰（0）から 肩（0.48）まで。胸を 少し 厚く。 */
    move(roundedBox(2, 0.12, 0.38, 0.34, 0.24), 0, 0.17, 0),
    move(roundedBox(2, 0.12, 0.42, 0.22, 0.26), 0, 0.40, 0),
    move(roundedBox(2, 0.10, 0.34, 0.14, 0.22), 0, 0.02, 0)      /* 腰まわり */
  ]));
  M.pc_head = flat(mergeMeshes([
    move(sphere(葉seg + 2, 葉環 + 2, 0.5), 0, 0, 0, 0.30, 0.34, 0.29),
    move(roundedBox(1, 0.02, 0.045, 0.05, 0.03), 0.075, 0.01, 0.135),   /* 目（前は +z）*/
    move(roundedBox(1, 0.02, 0.045, 0.05, 0.03), -0.075, 0.01, 0.135)
  ]));
  M.pc_hair = flat(mergeMeshes([
    move(sphere(葉seg + 2, 葉環, 0.5), 0, 0.05, 0, 0.325, 0.30, 0.315),
    move(roundedBox(1, 0.05, 0.30, 0.20, 0.10), 0, -0.02, -0.13)   /* 後ろ髪は −z */
  ]));
  /* 腕は 肩（原点）から 下へ 0.50 */
  M.pc_arm = flat(mergeMeshes([
    move(capsule(6, 3, 0.4, 0.40), 0, -0.22, 0, 0.155, 0.52, 0.155),
    move(sphere(6, 4, 0.5), 0, -0.48, 0, 0.135, 0.13, 0.135)       /* 手 */
  ]));
  /* 脚は 腰（原点）から 下へ 0.72 */
  M.pc_leg = flat(move(capsule(6, 3, 0.4, 0.44), 0, -0.34, 0, 0.185, 0.74, 0.185));
  M.pc_foot = flat(move(roundedBox(1, 0.05, 0.19, 0.10, 0.30), 0, -0.70, 0.05));
  /* ── 武器（手に 持つ）──
     ★ 6 つの 型に 1 つずつ。色は 段（材料）から。 */
  M.w_sword = flat(mergeMeshes([
    move(box(0.10, 1.05, 0.03), 0, 0.62, 0),
    move(box(0.30, 0.09, 0.09), 0, 0.10, 0),
    move(box(0.09, 0.24, 0.09), 0, -0.06, 0)
  ]));
  M.w_spear = flat(mergeMeshes([
    move(box(0.055, 1.7, 0.055), 0, 0.60, 0),
    move(cone(5, 0.5, 1), 0, 1.44, 0, 0.16, 0.36, 0.16)
  ]));
  M.w_axeW = flat(mergeMeshes([
    move(box(0.07, 1.15, 0.07), 0, 0.50, 0),
    move(box(0.10, 0.42, 0.34), 0.14, 0.95, 0),
    move(box(0.10, 0.42, 0.34), -0.14, 0.95, 0)
  ]));
  M.w_dagger = flat(mergeMeshes([
    move(box(0.08, 0.52, 0.03), 0, 0.34, 0),
    move(box(0.20, 0.07, 0.07), 0, 0.06, 0)
  ]));
  M.w_staff = flat(mergeMeshes([
    move(box(0.06, 1.6, 0.06), 0, 0.56, 0),
    move(sphere(7, 6, 0.5), 0, 1.42, 0, 0.26, 0.26, 0.26)
  ]));
  M.w_bow = flat(mergeMeshes([
    move(torus(14, 5, 0.5, 0.05), 0, 0.60, 0, 0.9, 1.5, 0.22),
    move(box(0.02, 1.28, 0.02), 0.10, 0.60, 0)
  ]));
  /* 道具（採る ときに 持つ） */
  M.w_pick = flat(mergeMeshes([
    move(box(0.06, 0.95, 0.06), 0, 0.44, 0),
    move(box(0.66, 0.09, 0.09), 0, 0.86, 0)
  ]));
  M.w_axe = M.w_axeW;
  M.w_shovel = flat(mergeMeshes([
    move(box(0.06, 0.95, 0.06), 0, 0.44, 0),
    move(box(0.26, 0.30, 0.05), 0, 0.02, 0)
  ]));
  M.w_sickle = flat(mergeMeshes([
    move(box(0.06, 0.6, 0.06), 0, 0.28, 0),
    move(torus(10, 4, 0.5, 0.05), 0.14, 0.62, 0, 0.6, 0.6, 0.18)
  ]));
  M.w_hammer = flat(mergeMeshes([
    move(box(0.06, 0.9, 0.06), 0, 0.42, 0),
    move(roundedBox(1, 0.04, 0.34, 0.24, 0.24), 0, 0.86, 0)
  ]));

  /* つりざお（2026-09-02）。竿と 糸と 浮き。 */
  M.w_rod = flat(mergeMeshes([
    move(cylinder(5, 0.018, 0.036, 1, true), 0, 0.5, 0, 1, 1.5, 1),
    move(box(0.012, 0.7, 0.012), 0.30, 1.10, 0),
    move(sphere(5, 4, 0.5), 0.30, 0.76, 0, 0.10, 0.10, 0.10)
  ]));

  /* ── 印（依頼・町・目印）── */
  M.marker = flat(mergeMeshes([
    move(cone(5, 0.5, 1), 0, 1.2, 0, 0.34, -0.6, 0.34),
    move(sphere(6, 5, 0.5), 0, 1.5, 0, 0.2, 0.2, 0.2)
  ]));
  return M;
}

/** 描き手へ 登録する。detail は 画質の 段。 */
export function registerRpgMeshes(R, detail) {
  const M = buildRpgMeshes(detail);
  for (const k in M) {
    if (!M[k]) continue;
    if (!R.hasMesh(k)) R.addMesh(k, M[k]);
  }
  材質をつける(R);
  /* 草と 水は 影を 焼かない（焼くと ざらつくだけ） */
  R.setNoShadow("grass", true);
  R.setNoShadow("water", true);
  R.setNoShadow("pickup", true);
  R.setNoShadow("marker", true);
  return M;
}

/* ══════════════════════════════════════════════════════════════════
   材質（2026-09-02）。**形ごとに 1 つ**。
   Rinty さんの 訴え「マテリアルを 最高級品質に したいが 重くしない」への 答え。
   絵（テクスチャ）を 1 枚も 読まない。読むと 細い 回線で 待たされ、
   スマホの 記憶も 食う。代わりに **つや・むら・葉ごしの 光・空うつり**を
   数で 与える。増えるのは 描く 前の uniform 4 つ だけ。
   ══════════════════════════════════════════════════════════════════ */
function 材質をつける(R) {
  if (!R.material) return;                    /* 古い 描き手でも 落ちない */
  /* ★ 肌（2026-09-02）。番号は texgen.js の 並び。
     大き＝1m あたり 何回 くり返すか。木の 幹は 細いので 細かく、
     地面は 広いので 粗く する。合わないと 「布を 巻いた」ように 見える。 */
  const 木 = { つや: 12, 強さ: 0.34, むら: 0.05, 細かさ: 2.6, 肌: 1, 大き: 1.6, 凹凸: 0.5, 粗: 0.8 };
  const 葉 = { つや: 8, 強さ: 0.22, むら: 0.06, 細かさ: 1.9, 葉: 0.34, 肌: 7, 大き: 1.1, 凹凸: 0.3, 粗: 0.7 };
  for (const k of ["tree_round_trunk", "tree_pine_trunk", "tree_cactus_trunk",
    "tree_dead_trunk", "tree_droop_trunk", "tree_palm_trunk"]) R.material(k, 木);
  for (const k of ["tree_round_leaf", "tree_pine_leaf", "tree_cactus_leaf",
    "tree_dead_leaf", "tree_droop_leaf", "tree_palm_leaf"]) R.material(k, 葉);
  /* 水晶の 木は 透ける・光る */
  R.material("tree_crystal_trunk", { つや: 64, 強さ: 1.1, むら: 0.05, 細かさ: 3, 空うつり: 0.5 });
  R.material("tree_crystal_leaf", { つや: 90, 強さ: 1.5, 空うつり: 0.72, 葉: 0.5 });
  R.material("crystal", { つや: 96, 強さ: 1.7, 空うつり: 0.78, 葉: 0.42, 肌: 10, 大き: 0.9, 凹凸: 0.45, 粗: 0.12 });

  /* 岩は つやを 出さない。むらだけ。 */
  R.material("rock", { つや: 7, 強さ: 0.16, むら: 0.07, 細かさ: 1.15, 肌: 2, 大き: 0.55, 凹凸: 0.62, 粗: 0.95 });
  R.material("rock_small", { つや: 7, 強さ: 0.18, むら: 0.08, 細かさ: 2.2, 肌: 2, 大き: 1.1, 凹凸: 0.6, 粗: 0.95 });
  /* 草は 葉ごしの 光が 効く。**逆光で 光る 原っぱ**に なる。 */
  R.material("grass", { つや: 5, 強さ: 0.12, むら: 0.06, 細かさ: 3.4, 葉: 0.55, 肌: 3, 大き: 2.2, 凹凸: 0.2, 粗: 0.9 });
  /* 水は 空を 映す */
  R.material("water", { つや: 120, 強さ: 1.6, 空うつり: 0.62, 肌: 0, 粗: 0.05 });
  /* 拾いもの・印は そのまま 光る */
  R.material("pickup", { つや: 48, 強さ: 1.2, 空うつり: 0.3 });

  /* 建てる もの。木の 板・石・布で 分ける。 */
  R.material("blk_cube", { つや: 10, 強さ: 0.26, むら: 0.05, 細かさ: 1.7, 肌: 11, 大き: 0.7, 凹凸: 0.45, 粗: 0.85 });
  R.material("blk_slab", { つや: 10, 強さ: 0.26, むら: 0.05, 細かさ: 1.7, 肌: 11, 大き: 0.7, 凹凸: 0.45, 粗: 0.85 });
  R.material("blk_wall", { つや: 9, 強さ: 0.22, むら: 0.05, 細かさ: 1.5, 肌: 11, 大き: 0.6, 凹凸: 0.5, 粗: 0.9 });
  R.material("blk_post", 木); R.material("blk_fence", 木);
  R.material("blk_roof", { つや: 16, 強さ: 0.4, むら: 0.04, 細かさ: 2.2, 肌: 11, 大き: 1.3, 凹凸: 0.5, 粗: 0.8 });
  R.material("blk_window", { つや: 110, 強さ: 1.5, 空うつり: 0.7 });
  R.material("blk_door", 木); R.material("blk_sign", 木); R.material("blk_bench", 木);
  R.material("blk_chest", { つや: 26, 強さ: 0.6, むら: 0.06, 細かさ: 2.4, 金属: 0.4 });
  R.material("blk_farm", { つや: 5, 強さ: 0.1, むら: 0.08, 細かさ: 1.3, 肌: 8, 大き: 1.2, 凹凸: 0.7, 粗: 0.98 });

  /* 生きもの。てかりを 抑えて 少しだけ 透かす。 */
  const 肌 = { つや: 14, 強さ: 0.3, むら: 0.04, 細かさ: 3.2, 葉: 0.16, 肌: 9, 大き: 3.2, 凹凸: 0.18, 粗: 0.75 };
  for (const k of ["mob_body", "mob_blob", "mob_limb", "npc_body", "npc_head"]) R.material(k, 肌);
  /* 人。服は 布・肌は つるっと・髪は 少し つや */
  const 服材 = { つや: 10, 強さ: 0.5, むら: 0.04, 細かさ: 3.4, 肌: 9, 大き: 6, 凹凸: 0.35, 粗: 0.86 };
  R.material("pc_torso", 服材); R.material("pc_arm", 服材); R.material("pc_leg", 服材);
  R.material("pc_head", { つや: 22, 強さ: 0.55, むら: 0.02, 細かさ: 6, 粗: 0.55, 葉: 0.22 });
  R.material("pc_hair", { つや: 30, 強さ: 0.8, むら: 0.05, 細かさ: 5, 肌: 1, 大き: 9, 凹凸: 0.3, 粗: 0.4 });
  R.material("pc_foot", { つや: 26, 強さ: 0.7, むら: 0.03, 細かさ: 5, 肌: 9, 大き: 8, 凹凸: 0.2, 粗: 0.45 });
  R.material("mob_eye", { つや: 90, 強さ: 1.6, 空うつり: 0.4 });
  R.material("mob_horn", { つや: 24, 強さ: 0.5, むら: 0.08, 細かさ: 3 });
  R.material("mob_wing", { つや: 10, 強さ: 0.2, 葉: 0.6, むら: 0.08, 細かさ: 3 });
  R.material("npc_hat", { つや: 8, 強さ: 0.2, むら: 0.06, 細かさ: 3.4, 葉: 0.24, 肌: 9, 大き: 4, 凹凸: 0.3, 粗: 0.85 });

  /* 武器と 道具は **金属**。自分の 色で 光る。 */
  const 金 = { つや: 78, 強さ: 1.45, 金属: 0.85, むら: 0.02, 細かさ: 5, 肌: 6, 大き: 5.5, 凹凸: 0.16, 粗: 0.18 };
  for (const k of ["w_sword", "w_spear", "w_axeW", "w_dagger", "w_bow",
    "w_pick", "w_axe", "w_shovel", "w_sickle", "w_hammer"]) R.material(k, 金);
  R.material("w_rod", { つや: 18, 強さ: 0.4, むら: 0.06, 細かさ: 3 });
  R.material("w_staff", { つや: 40, 強さ: 0.9, 金属: 0.4, むら: 0.07, 細かさ: 3 });
  R.material("blk_torch", { つや: 20, 強さ: 0.5, むら: 0.1, 細かさ: 3 });
  R.material("blk_fire", { つや: 20, 強さ: 0.4 });
  R.material("marker", { つや: 60, 強さ: 1.2, 空うつり: 0.3 });
}

/** 木の 形 → 部品の 名前 */
export const TREE_PARTS = {
  round: ["tree_round_trunk", "tree_round_leaf"],
  pine: ["tree_pine_trunk", "tree_pine_leaf"],
  cactus: ["tree_cactus_trunk", null],
  dead: ["tree_dead_trunk", null],
  droop: ["tree_droop_trunk", "tree_droop_leaf"],
  palm: ["tree_palm_trunk", "tree_palm_leaf"],
  crystal: ["tree_crystal_trunk", "tree_crystal_leaf"]
};
