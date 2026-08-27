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
  leaf:  "vs_bean_leaf"
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
}

/* 使い回す 行列（毎フレーム 8 人 × 12 部品 = 96 個 作らない） */
const _m = m4.create();

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
    this.emote = "";      /* "hit" | "cheer" | "stumble" | "" */
    this.emoteT = 0;
    this.hidden = false;
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

    /* ── 頭 ── */
    const headY = bodyY + 0.52 * s * sq;
    const hy = yaw + this.faceYaw;
    m4.composeXYZ(_m, x, headY, z, this.tilt * 0.7, hy, tiltZ * 0.6,
      0.78 * s * wide, 0.74 * s * sq, 0.74 * s * wide);
    R.draw(BEAN_MESHES.head, _m, this.color, 0, 0.28, 0, 0, s);

    /* ── 目（帯の 下）── */
    const cy = Math.cos(hy), sy = Math.sin(hy);
    const eyeF = 0.30 * s, eyeSide = 0.155 * s, eyeH = headY + 0.04 * s;
    const open = this.blink > 0 ? 0.16 : 1;
    for (const side of [-1, 1]) {
      const ex = x + sy * eyeF + cy * eyeSide * side;
      const ez = z + cy * eyeF - sy * eyeSide * side;
      m4.compose(_m, ex, eyeH, ez, hy, 0.185 * s, 0.185 * s * open, 0.13 * s);
      R.draw(BEAN_MESHES.eye, _m, WHITE, 0.10, 0.05, 0, 0, s);
      m4.compose(_m, x + sy * (eyeF + 0.045 * s) + cy * eyeSide * side, eyeH,
        z + cy * (eyeF + 0.045 * s) - sy * eyeSide * side, hy,
        0.095 * s, 0.105 * s * open, 0.07 * s);
      R.draw(BEAN_MESHES.pupil, _m, DARK, 0, 0, 0, 0, s);
    }

    /* ── 帯（バイザー）。顔の 向きが 分かる 目印 ── */
    m4.composeXYZ(_m, x + sy * 0.20 * s, headY + 0.21 * s, z + cy * 0.20 * s,
      -0.16, hy, 0, 0.66 * s, 0.14 * s, 0.60 * s);
    R.draw(BEAN_MESHES.visor, _m, this.dark, 0, 0.34, 0, 0, s);

    /* ── 芽（頭の 上の 二葉）── */
    const stemY = headY + 0.36 * s;
    const sway = Math.sin(ph * 1.3) * 0.10 * (0.4 + sw);
    m4.composeXYZ(_m, x, stemY + 0.09 * s, z, sway * 0.4, hy, sway,
      0.05 * s, 0.26 * s, 0.05 * s);
    R.draw(BEAN_MESHES.stem, _m, STEM, 0, 0.2, 0, 0, s);
    for (const side of [-1, 1]) {
      const lx = x + cy * 0.13 * s * side + sy * 0.02 * s;
      const lz = z - sy * 0.13 * s * side + cy * 0.02 * s;
      m4.composeXYZ(_m, lx, stemY + 0.20 * s, lz,
        0.2, hy, side * (0.72 + sway),
        0.24 * s, 0.075 * s, 0.15 * s);
      R.draw(BEAN_MESHES.leaf, _m, LEAF, 0, 0.30, 0, 0, s);
    }

    /* ── 腕 ── */
    for (const side of [-1, 1]) {
      const swing = Math.sin(ph + (side > 0 ? 0 : Math.PI)) * sw * 0.85;
      const hurt = this.emote === "hit" ? 1.1 : 0;
      const ax = x + cy * 0.40 * s * side + sy * 0.02 * s;
      const az = z - sy * 0.40 * s * side + cy * 0.02 * s;
      m4.composeXYZ(_m, ax, bodyY + 0.14 * s, az,
        swing * 0.9, yaw, side * (0.30 + hurt) - swing * 0.15,
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
