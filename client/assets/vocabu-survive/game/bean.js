/* ══════════════════════════════════════════════════════════════════════════
   走る人（スプラウト）。

   姿の 決めどころ（2026-08-28）:
     ・種の 形の 胴（下が すこし 太い 卵）
     ・頭に **二葉の 芽**。これが 一番の 目印。遠くの 影絵でも 分かる。
     ・目の 上に 帯（バイザー）。表情を 作らずに 「顔の 向き」を 示せる。
     ・手足は 短い カプセル。足の 先だけ 丸い 箱。
   Fall Guys の 豆とは 別物にする（あちらは 帯も 芽も 無く、脚が 細い）。

   ここは **形と 動きだけ**。物理も 通信も 知らない。
   受け取った 状態を 見て 描く 命令を 積むだけ。
   ══════════════════════════════════════════════════════════════════════════ */
import { m4, clamp, lerp, TAU } from "../engine/math.js";
import * as MESH from "../engine/mesh.js";

export const BEAN_MESHES = {
  body:  "vs_bean_body",
  head:  "vs_bean_head",
  eye:   "vs_bean_eye",
  pupil: "vs_bean_pupil",
  visor: "vs_bean_visor",
  limb:  "vs_bean_limb",
  foot:  "vs_bean_foot",
  stem:  "vs_bean_stem",
  leaf:  "vs_bean_leaf",
  /* かぶりもの用。**同じ 形を 使い回す**（種類ごとに 形を 増やすと
     並べ描きの まとまりが 割れて 描き回数が 増える）。 */
  cone:  "vs_bean_cone",
  disc:  "vs_bean_disc",
  ring:  "vs_bean_ring",
  bar:   "vs_bean_bar",
  /* ★ 足元の 接地影（2026-08-31）。影の 地図だけでは
     「床に 着いているのか 浮いているのか」が 分からなかった（実写で 確認）。
     薄い 円盤を 1 枚 敷く。**影の 焼きからは 外す**（床と 同じ 高さなので
     焼くと 自分の 影で 縞が 出る）。 */
  shade: "vs_bean_shade"
};

/** 形を まとめて 登録する。renderer に 1 回だけ 呼ぶ。 */
export function registerBeanMeshes(renderer) {
  const R = renderer;
  if (R.hasMesh(BEAN_MESHES.body)) return;
  R.addMesh(BEAN_MESHES.body,  [MESH.capsule(20, 8, 0.42, 0.36), MESH.capsule(12, 5, 0.42, 0.36), MESH.capsule(8, 3, 0.42, 0.36)]);
  R.addMesh(BEAN_MESHES.head,  [MESH.sphere(20, 14, 0.5), MESH.sphere(12, 8, 0.5), MESH.sphere(8, 5, 0.5)]);
  R.addMesh(BEAN_MESHES.eye,   [MESH.sphere(14, 10, 0.5), MESH.sphere(8, 6, 0.5)]);
  R.addMesh(BEAN_MESHES.pupil, [MESH.sphere(10, 8, 0.5), MESH.sphere(6, 4, 0.5)]);
  R.addMesh(BEAN_MESHES.visor, [MESH.roundedBox(3, 0.30), MESH.roundedBox(2, 0.30), MESH.roundedBox(1, 0.22)]);
  R.addMesh(BEAN_MESHES.limb,  [MESH.capsule(12, 5, 0.5, 0.4), MESH.capsule(8, 3, 0.5, 0.4)]);
  R.addMesh(BEAN_MESHES.foot,  [MESH.roundedBox(3, 0.34), MESH.roundedBox(1, 0.30)]);
  R.addMesh(BEAN_MESHES.stem,  [MESH.cylinder(8, 0.5, 0.62, 1, false)]);
  R.addMesh(BEAN_MESHES.leaf,  [MESH.sphere(12, 8, 0.5), MESH.sphere(6, 4, 0.5)]);
  R.addMesh(BEAN_MESHES.cone,  [MESH.cone(12, 0.5, 1), MESH.cone(7, 0.5, 1)]);
  R.addMesh(BEAN_MESHES.disc,  [MESH.cylinder(14, 0.5, 0.5, 1, true), MESH.cylinder(8, 0.5, 0.5, 1, true)]);
  R.addMesh(BEAN_MESHES.ring,  [MESH.torus(16, 8, 0.5, 0.14), MESH.torus(10, 5, 0.5, 0.14)]);
  R.addMesh(BEAN_MESHES.bar,   [MESH.roundedBox(2, 0.28), MESH.roundedBox(1, 0.24)]);
  /* ★ 接地影は **粗さを 1 段だけ**に する（2026-08-31）。
     3 段 持つと 近い 人と 遠い 人で まとまりが 割れ、
     描き回数が 1 回 では なく 3 回に なる（実測で 40 回を 超えた）。
     ただの 円盤なので 遠くても 粗く 見えない。 */
  R.addMesh(BEAN_MESHES.shade, [MESH.cylinder(14, 0.5, 0.5, 1, true)]);
  if (R.setNoShadow) R.setNoShadow(BEAN_MESHES.shade, true);
}

/* ══════════════════════════════════════════════════════════════════════════
   かぶりもの（見た目だけ。速さにも 当たりにも 関わらせない）

   ★ **形は 増やさない。** 上で 登録した 6 つ（頭・帯・茎・葉・円錐・円盤・輪・棒）
     を 置き方と 大きさだけ 変えて 組む。
     種類ごとに 新しい 形を 足すと、並べ描きの まとまりが 割れて
     描き回数が 8 人ぶん 増える（実測で 26 回 → 40 回 近くに なる）。

   置く 場所は **頭の てっぺんからの 相対**。頭は 顔の 向き（hy）で 回るので、
   かぶりものも 同じ 向きに 合わせる。
   各 部品: [形, 前後, 上下, 左右, 傾き, 幅, 高さ, 奥行, 色]
     色: 0 = 選んだ 色 / 1 = 濃い ほう / 2 = 白 / 3 = 黒
   ══════════════════════════════════════════════════════════════════════════ */
const K = BEAN_MESHES;
export const HATS = [
  { key: "none", name: "なし", parts: [] },
  { key: "cap", name: "キャップ", parts: [
    [K.head, 0, 0.10, 0, 0, 0.80, 0.46, 0.80, 0],
    [K.disc, 0.44, 0.02, 0, 0, 0.62, 0.07, 0.72, 0]
  ] },
  { key: "tophat", name: "シルクハット", parts: [
    [K.disc, 0, 0.05, 0, 0, 1.02, 0.07, 1.02, 3],
    [K.disc, 0, 0.32, 0, 0, 0.62, 0.52, 0.62, 3],
    [K.disc, 0, 0.20, 0, 0, 0.66, 0.10, 0.66, 0]
  ] },
  { key: "crown", name: "王冠", parts: [
    [K.disc, 0, 0.10, 0, 0, 0.70, 0.18, 0.70, 0],
    [K.cone, 0, 0.30, 0, 0, 0.20, 0.28, 0.20, 0],
    [K.cone, 0.22, 0.27, 0, 0, 0.18, 0.22, 0.18, 0],
    [K.cone, -0.22, 0.27, 0, 0, 0.18, 0.22, 0.18, 0]
  ] },
  { key: "horn", name: "つの", parts: [
    [K.cone, 0.06, 0.20, 0.26, 0.42, 0.19, 0.40, 0.19, 0],
    [K.cone, 0.06, 0.20, -0.26, -0.42, 0.19, 0.40, 0.19, 0]
  ] },
  { key: "antenna", name: "アンテナ", parts: [
    [K.stem, 0, 0.26, 0, 0, 0.045, 0.44, 0.045, 3],
    [K.eye, 0, 0.52, 0, 0, 0.20, 0.20, 0.20, 0]
  ] },
  { key: "ribbon", name: "リボン", parts: [
    [K.leaf, 0.02, 0.14, 0.22, 0.6, 0.30, 0.13, 0.20, 0],
    [K.leaf, 0.02, 0.14, -0.22, -0.6, 0.30, 0.13, 0.20, 0],
    [K.eye, 0.02, 0.14, 0, 0, 0.13, 0.13, 0.13, 1]
  ] },
  { key: "phones", name: "ヘッドホン", parts: [
    [K.ring, 0, 0.05, 0, 0, 0.92, 0.92, 0.30, 3],
    [K.bar, 0, -0.14, 0.42, 0, 0.16, 0.30, 0.26, 0],
    [K.bar, 0, -0.14, -0.42, 0, 0.16, 0.30, 0.26, 0]
  ] },
  { key: "halo", name: "わ", parts: [
    [K.ring, 0, 0.44, 0, 0, 0.62, 0.62, 0.12, 0]
  ] },
  { key: "donut", name: "ドーナツ", parts: [
    [K.ring, 0, 0.10, 0, 0, 0.86, 0.86, 0.34, 0],
    [K.eye, 0.20, 0.20, 0.12, 0, 0.10, 0.06, 0.10, 2],
    [K.eye, -0.16, 0.20, -0.14, 0, 0.09, 0.06, 0.09, 2]
  ] },
  { key: "party", name: "とんがり", parts: [
    [K.cone, 0, 0.34, 0, 0, 0.44, 0.62, 0.44, 0],
    [K.eye, 0, 0.66, 0, 0, 0.16, 0.16, 0.16, 2]
  ] },
  /* ★ 4 つ 足した（2026-08-31）。育ちの 段が 8 つ ある のに
     ごほうびが 1 段に 1 つ しか 無く、途中が 薄かった。
     ★ 形は 増やさない（既にある 8 つの 組み合わせだけ）。
     ★ 部品は 4 つまで（描き回数の 目安を 超えない）。 */
  { key: "star", name: "ほし", parts: [
    [K.stem, 0, 0.14, 0, 0, 0.05, 0.24, 0.05, 3],
    [K.cone, 0, 0.44, 0, 0, 0.42, 0.34, 0.42, 0],
    [K.cone, 0, 0.44, 0, 1.05, 0.42, 0.34, 0.42, 0]
  ] },
  { key: "flower", name: "はな", parts: [
    [K.stem, 0, 0.18, 0, 0, 0.05, 0.30, 0.05, 3],
    [K.disc, 0, 0.40, 0, 0, 0.52, 0.08, 0.52, 0],
    [K.disc, 0, 0.40, 0, 0.6, 0.52, 0.08, 0.52, 0],
    [K.eye, 0, 0.44, 0, 0, 0.20, 0.14, 0.20, 2]
  ] },
  { key: "cloud", name: "くも", parts: [
    [K.eye, -0.20, 0.20, 0, 0, 0.46, 0.36, 0.42, 2],
    [K.eye, 0.14, 0.26, 0.04, 0, 0.54, 0.44, 0.48, 2],
    [K.eye, 0.10, 0.18, -0.20, 0, 0.42, 0.32, 0.40, 2]
  ] },
  { key: "bolt", name: "いなずま", parts: [
    [K.bar, 0.04, 0.22, 0, 0.75, 0.20, 0.46, 0.12, 0],
    [K.bar, -0.08, 0.50, 0, -0.75, 0.20, 0.46, 0.12, 0]
  ] },
  { key: "leafhat", name: "おおきな葉", parts: [
    [K.leaf, 0.16, 0.14, 0, 0.25, 0.62, 0.10, 0.44, 0],
    [K.stem, -0.16, 0.18, 0, -0.4, 0.05, 0.30, 0.05, 1]
  ] }
];

/* かぶりものの 色（12 種）。速さには 関わらない。 */
export const HAT_COLORS = [
  { name: "しろ", hex: "#f4f6ff", rgb: [0.96, 0.97, 1.00] },
  { name: "くろ", hex: "#20232e", rgb: [0.13, 0.14, 0.18] },
  { name: "あか", hex: "#ff5d6e", rgb: [1.00, 0.36, 0.43] },
  { name: "だいだい", hex: "#ff9f43", rgb: [1.00, 0.62, 0.26] },
  { name: "きいろ", hex: "#ffd84d", rgb: [1.00, 0.85, 0.30] },
  { name: "みどり", hex: "#4fd88a", rgb: [0.31, 0.85, 0.54] },
  { name: "みずいろ", hex: "#57d3ff", rgb: [0.34, 0.83, 1.00] },
  { name: "あお", hex: "#4d9dff", rgb: [0.30, 0.62, 1.00] },
  { name: "むらさき", hex: "#a97cff", rgb: [0.66, 0.49, 1.00] },
  { name: "ももいろ", hex: "#ff8ccb", rgb: [1.00, 0.55, 0.80] },
  { name: "ちゃいろ", hex: "#a97b57", rgb: [0.66, 0.48, 0.34] },
  { name: "きん", hex: "#f0c24a", rgb: [0.94, 0.76, 0.29] }
];

export function hatByKey(key) {
  for (const h of HATS) if (h.key === key) return h;
  return HATS[0];
}

/* 使い回す 行列（毎フレーム 8 人 × 12 部品 = 96 個 作らない） */
const _m = m4.create();
const _sh = new Float32Array(4);   /* 接地影の 色（毎コマ 作らない） */

const WHITE = [1, 1, 1, 1];
const DARK = [0.09, 0.10, 0.16, 1];
const LEAF = [0.36, 0.84, 0.42, 1];
const STEM = [0.42, 0.72, 0.36, 1];

/**
 * 走る人 1 人ぶんの 見た目の 状態。
 * 物理側の 値を そのまま 入れて 使う。
 */
export class BeanVisual {
  constructor(colorRgb) {
    this.color = [colorRgb[0], colorRgb[1], colorRgb[2], 1];
    this.dark = [colorRgb[0] * 0.62, colorRgb[1] * 0.62, colorRgb[2] * 0.62, 1];
    this.phase = Math.random() * TAU;   /* 歩きの 位相。全員 揃わないように。 */
    this.blink = 0;
    this.blinkAt = 1.4 + Math.random() * 3;
    this.squash = 1;      /* 着地の つぶれ */
    this.tilt = 0;        /* 進む向きへの 傾き */
    this.armSwing = 0;
    this.faceYaw = 0;
    this.emote = "";      /* "hit" | "cheer" | "stumble" | "win" | "" */
    this.emoteT = 0;
    this.hidden = false;
    /* かぶりもの（見た目だけ）。当たりにも 速さにも 関わらせない。 */
    this.hat = HATS[0];
    this.hatColor = [1, 1, 1, 1];
  }

  /**
   * @param {number} dt 秒
   * @param {{speed:number, grounded:boolean, vy:number, yaw:number, stunned:number}} st
   */
  update(dt, st) {
    const speed = Math.max(0, st.speed || 0);
    /* 歩きの 速さ。止まっていても ゆっくり 息をする。 */
    const cadence = st.grounded ? (1.6 + speed * 0.72) : 3.2;
    this.phase += dt * cadence;
    if (this.phase > TAU * 64) this.phase -= TAU * 64;

    /* まばたき */
    this.blinkAt -= dt;
    if (this.blinkAt <= 0) { this.blink = 0.16; this.blinkAt = 1.8 + Math.random() * 3.4; }
    if (this.blink > 0) this.blink = Math.max(0, this.blink - dt);

    /* 着地の つぶれ。落ちる 速さが 大きいほど 潰れる。 */
    const wantSquash = st.grounded ? 1 : clamp(1 + (st.vy || 0) * 0.030, 0.86, 1.16);
    this.squash = lerp(this.squash, wantSquash, 1 - Math.exp(-14 * dt));

    this.grounded = !!st.grounded;
    this.tilt = lerp(this.tilt, clamp(speed * 0.026, 0, 0.20) + (st.stunned > 0 ? 0.35 : 0), 1 - Math.exp(-10 * dt));
    this.armSwing = lerp(this.armSwing, clamp(speed * 0.13, 0.15, 1.0), 1 - Math.exp(-9 * dt));
    if (this.emoteT > 0) this.emoteT = Math.max(0, this.emoteT - dt);
    else this.emote = "";
  }

  playEmote(kind, sec) { this.emote = kind; this.emoteT = sec || 0.9; }

  /**
   * 描く 命令を 積む。
   * @param {import("../engine/renderer.js").Renderer} R
   * @param {number} x @param {number} y 足元 @param {number} z
   * @param {number} yaw
   * @param {number} scale 体の 大きさ（既定 1 = 高さ 約 1.5m）
   */
  draw(R, x, y, z, yaw, scale = 1) {
    if (this.hidden) return;
    const s = scale;

    /* ── 足元の 接地影 ──────────────────────────────────────────────
       ★ 影の 地図（shadow map）は 太陽の 向きに 伸びるので、
         真下に 何も 出ない ことが ある。「浮いている ように 見える」の
         いちばんの 原因（実写で 確認）。
         床に 着いた 高さを 覚えておき、そこへ 薄い 円盤を 1 枚 敷く。
         高いほど 小さく・薄く する（跳んだ 高さが 目で 分かる）。 */
    if (this.grounded || this.shadowY === undefined || y < this.shadowY) this.shadowY = y;
    {
      const 高 = Math.max(0, y - this.shadowY);
      const k = clamp(1 - 高 / 4.6, 0.10, 1);
      const r = (1.02 - 高 * 0.055) * s;
      if (k > 0.06 && r > 0.14) {
        _sh[0] = 0; _sh[1] = 0; _sh[2] = 0.02; _sh[3] = 0.36 * k;
        m4.compose(_m, x, this.shadowY + 0.045, z, 0, Math.max(0.16, r), 0.02, Math.max(0.16, r));
        R.draw(BEAN_MESHES.shade, _m, _sh, 0, 0, 0, 0, r);
      }
    }

    const ph = this.phase;
    const sw = this.armSwing;
    const sq = this.squash;
    /* つぶれても 体積が 変わらないように 横へ 逃がす */
    const wide = 1 / Math.sqrt(Math.max(0.4, sq));

    const bob = (Math.sin(ph * 2) * 0.5 + 0.5) * 0.055 * sw;
    const bodyY = y + (0.52 + bob) * s * sq;
    const tiltZ = Math.sin(ph) * 0.06 * sw;

    /* ── 胴 ── */
    m4.composeXYZ(_m, x, bodyY, z, this.tilt, yaw, tiltZ,
      0.86 * s * wide, 0.94 * s * sq, 0.80 * s * wide);
    R.draw(BEAN_MESHES.body, _m, this.color, 0, 0.24, 0, 0, s);

    /* ── 頭 ──
       ★★ 走る人が **ずっと 後ろ向きに 走って いた** 原因は ここ。
         この 作りでは yaw は「カメラの ある 側」を 指していて、
         **進む向きは -(sin yaw, cos yaw)** になる（脚も つま先も
         そちら側へ 出している）。ところが 顔（目・帯・芽・かぶりもの）
         だけ +(sin, cos) 側に 置いていたので、脚は 前へ 出るのに
         顔は 後ろを 向く ＝ 後ずさりして 見えた。
         実測: 進む向きと 顔の向きの 内積が -1（本人も ボットも）。
         顔まわりだけ 半回転（fhy）させて 進む向きへ 向ける。
         体・腕・脚は もとの yaw のまま（左右対称なので 触らない）。 */
    const headY = bodyY + 0.52 * s * sq;
    const hy = yaw + this.faceYaw;
    const fhy = hy + Math.PI;                       /* 顔の 向き＝進む向き */
    const fcy = Math.cos(fhy), fsy = Math.sin(fhy);
    m4.composeXYZ(_m, x, headY, z, -this.tilt * 0.7, fhy, -tiltZ * 0.6,
      0.78 * s * wide, 0.74 * s * sq, 0.74 * s * wide);
    R.draw(BEAN_MESHES.head, _m, this.color, 0, 0.28, 0, 0, s);

    /* ── 目（帯の 下）── */
    /* ★ 腕・脚は **体の 向き（yaw）**で 置く。ここを hy（＝顔の 向きを 足した もの）
       に して いたので、顔を 横へ 振ると 足まで 横へ ずれていた。 */
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const eyeF = 0.30 * s, eyeSide = 0.155 * s, eyeH = headY + 0.04 * s;
    const open = this.blink > 0 ? 0.16 : 1;
    for (const side of [-1, 1]) {
      const ex = x + fsy * eyeF + fcy * eyeSide * side;
      const ez = z + fcy * eyeF - fsy * eyeSide * side;
      m4.compose(_m, ex, eyeH, ez, fhy, 0.185 * s, 0.185 * s * open, 0.13 * s);
      R.draw(BEAN_MESHES.eye, _m, WHITE, 0.10, 0.05, 0, 0, s);
      m4.compose(_m, x + fsy * (eyeF + 0.045 * s) + fcy * eyeSide * side, eyeH,
        z + fcy * (eyeF + 0.045 * s) - fsy * eyeSide * side, fhy,
        0.095 * s, 0.105 * s * open, 0.07 * s);
      R.draw(BEAN_MESHES.pupil, _m, DARK, 0, 0, 0, 0, s);
    }

    /* ── 帯（バイザー）。顔の 向きが 分かる 目印 ── */
    m4.composeXYZ(_m, x + fsy * 0.20 * s, headY + 0.21 * s, z + fcy * 0.20 * s,
      0.16, fhy, 0, 0.66 * s, 0.14 * s, 0.60 * s);
    R.draw(BEAN_MESHES.visor, _m, this.dark, 0, 0.34, 0, 0, s);

    /* ── 芽（頭の 上の 二葉）── */
    const stemY = headY + 0.36 * s;
    const sway = Math.sin(ph * 1.3) * 0.10 * (0.4 + sw);
    m4.composeXYZ(_m, x, stemY + 0.09 * s, z, -sway * 0.4, fhy, -sway,
      0.05 * s, 0.26 * s, 0.05 * s);
    R.draw(BEAN_MESHES.stem, _m, STEM, 0, 0.2, 0, 0, s);
    for (const side of [-1, 1]) {
      const lx = x + fcy * 0.13 * s * side + fsy * 0.02 * s;
      const lz = z - fsy * 0.13 * s * side + fcy * 0.02 * s;
      m4.composeXYZ(_m, lx, stemY + 0.20 * s, lz,
        -0.2, fhy, side * (0.72 + sway),
        0.24 * s, 0.075 * s, 0.15 * s);
      R.draw(BEAN_MESHES.leaf, _m, LEAF, 0, 0.30, 0, 0, s);
    }

    /* ── かぶりもの ──
       ★ 芽の **あと**に 描く。芽より 先に 置くと 葉に 隠れる。
         頭の てっぺんから 積む ので、頭が 傾いても 一緒に 傾く。 */
    if (this.hat && this.hat.parts.length) {
      const topY = headY + 0.30 * s * sq;
      for (const q of this.hat.parts) {
        /* q = [形, 前, 上, 横, 傾き, 幅, 高, 奥, 色] */
        const px = x + fsy * q[1] * s + fcy * q[3] * s;
        const pz = z + fcy * q[1] * s - fsy * q[3] * s;
        const col = q[8] === 1 ? this.dark : q[8] === 2 ? WHITE : q[8] === 3 ? DARK : this.hatColor;
        m4.composeXYZ(_m, px, topY + q[2] * s * sq, pz, -this.tilt * 0.7, fhy, -(tiltZ * 0.6) - q[4],
          q[5] * s * wide, q[6] * s * sq, q[7] * s * wide);
        R.draw(q[0], _m, col, q[8] === 2 ? 0.08 : 0, 0.26, 0, 0, s);
      }
    }

    /* ── 腕 ── */
    for (const side of [-1, 1]) {
      const swing = Math.sin(ph + (side > 0 ? 0 : Math.PI)) * sw * 0.85;
      const hurt = this.emote === "hit" ? 1.1 : 0;
      /* ★ 勝ち（ゴール）の 万歳（2026-08-31）。腕を 上へ。
         emote は 1.3 秒で 消えるので、走り出せば 元に 戻る。 */
      const win = this.emote === "win" ? 2.0 : 0;   /* 外へ 開いて 上へ（万歳） */
      const ax = x + cy * 0.40 * s * side + sy * 0.02 * s;
      const az = z - sy * 0.40 * s * side + cy * 0.02 * s;
      m4.composeXYZ(_m, ax, bodyY + 0.14 * s, az,
        (win ? -0.18 : swing * 0.9), yaw, side * (0.30 + hurt + win) - (win ? 0 : swing * 0.15),
        0.20 * s, 0.42 * s, 0.20 * s);
      R.draw(BEAN_MESHES.limb, _m, this.dark, 0, 0.22, 0, 0, s);
    }

    /* ── 脚と 足 ── */
    for (const side of [-1, 1]) {
      const swing = Math.sin(ph + (side > 0 ? Math.PI : 0)) * sw;
      const legLen = 0.34 * s;
      const lx = x + cy * 0.18 * s * side - sy * swing * 0.16 * s;
      const lz = z - sy * 0.18 * s * side - cy * swing * 0.16 * s;
      const ly = y + legLen * 0.5 + Math.max(0, swing) * 0.10 * s;
      m4.composeXYZ(_m, lx, ly, lz, -swing * 0.55, yaw, 0,
        0.21 * s, legLen, 0.21 * s);
      R.draw(BEAN_MESHES.limb, _m, this.dark, 0, 0.2, 0, 0, s);
      /* 足の 先 */
      m4.composeXYZ(_m, lx - sy * 0.08 * s, y + 0.055 * s + Math.max(0, swing) * 0.10 * s, lz - cy * 0.08 * s,
        -swing * 0.3, yaw, 0, 0.27 * s, 0.13 * s, 0.36 * s);
      R.draw(BEAN_MESHES.foot, _m, this.color, 0, 0.18, 0, 0, s);
    }
  }
}

/** 体の 高さ（当たり判定の もと）。scale=1 で およそ この値。 */
export const BEAN_HEIGHT = 1.52;
export const BEAN_RADIUS = 0.40;
