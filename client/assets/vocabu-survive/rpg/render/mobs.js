/* ══════════════════════════════════════════════════════════════════════════
   敵の 描きかた。形は 5 つだけ。色・大きさ・飾りで 別ものに 見せる。
   ══════════════════════════════════════════════════════════════════════════ */
const m = new Float32Array(16);
function trs(o, x, y, z, sx, sy, sz, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  o[0] = c * sx; o[1] = 0; o[2] = -s * sx; o[3] = 0;
  o[4] = 0; o[5] = sy; o[6] = 0; o[7] = 0;
  o[8] = s * sz; o[9] = 0; o[10] = c * sz; o[11] = 0;
  o[12] = x; o[13] = y; o[14] = z; o[15] = 1;
  return o;
}
const 白 = [0.98, 0.98, 1.0], 黒 = [0.08, 0.07, 0.12];

export function drawEnemy(R, e, t) {
  const D = e.def;
  const S = D.大;
  const [x, y, z] = e.pos;
  const 光 = D.光 || 0;
  /* ★ 振りかぶり（2026-09-02）。当たる 前に **体が 沈んで 赤くなる**。
     これが 無いと、避ける 遊びに ならない。 */
  const 振 = e.振り ? Math.max(0, 1 - e.振り / 0.45) : 0;
  const 痛 = e.hurt > 0 ? 1 : 0;
  const col = 痛 ? [1, 0.6, 0.6]
    : (振 > 0 ? [D.色[0] * (1 - 振 * 0.3) + 振 * 0.9, D.色[1] * (1 - 振 * 0.6), D.色[2] * (1 - 振 * 0.6)] : D.色);
  const a = e.dead ? Math.max(0, 1 - e.fade) : 1;
  if (a <= 0.02) return;
  const 沈 = e.dead ? -e.fade * S * 0.8 : 0;
  const 跳 = Math.sin(e.bob) * S * (D.形 === "blob" ? 0.10 : 0.05) - 振 * S * 0.14;
  const c4 = [col[0], col[1], col[2], a];

  if (D.形 === "blob") {
    const q = 1 + Math.sin(e.bob) * 0.10;
    R.draw("mob_blob", trs(m, x, y + 沈, z, S * (2 - q) * 0.9, S * q * 0.9, S * (2 - q) * 0.9, e.yaw),
      c4, 光 * 0.7, 0.34, 0, 0, S);
  } else if (D.形 === "beast") {
    R.draw("mob_body", trs(m, x, y + 沈 + S * 0.30 + 跳, z, S * 0.95, S * 0.72, S * 1.35, e.yaw), c4, 光 * 0.5, 0.24, 0, 0, S);
    R.draw("mob_blob", trs(m, x + Math.sin(e.yaw) * S * 0.62, y + 沈 + S * 0.62 + 跳, z + Math.cos(e.yaw) * S * 0.62,
      S * 0.52, S * 0.48, S * 0.52, e.yaw), c4, 光 * 0.5, 0.26, 0, 0, S);
    for (const sx of [-1, 1]) {
      const lx = x + Math.cos(e.yaw) * sx * S * 0.30, lz = z - Math.sin(e.yaw) * sx * S * 0.30;
      R.draw("mob_limb", trs(m, lx, y + 沈 + S * 0.16, lz, S * 0.3, S * 0.42, S * 0.3, 0), c4, 0, 0.2, 0, 0, S * 0.4);
    }
  } else if (D.形 === "bug") {
    R.draw("mob_blob", trs(m, x, y + 沈 + S * 0.9 + 跳 * 2, z, S * 0.7, S * 0.6, S * 0.9, e.yaw), c4, 光, 0.30, 0, 0, S);
    if (D.羽) {
      const w = Math.sin(t * 26 + e.bob) * 0.5 + 0.6;
      for (const sx of [-1, 1]) {
        R.draw("mob_wing", trs(m, x, y + 沈 + S * 1.05 + 跳 * 2, z,
          S * 0.8 * sx, S * w * 0.7, S * 0.8, e.yaw), [1, 1, 1, a * 0.44], 0.14, 0.5, 0, 0, S);
      }
    }
  } else if (D.形 === "golem") {
    R.draw("mob_body", trs(m, x, y + 沈 + S * 0.34, z, S * 1.05, S * 0.95, S * 0.9, e.yaw), c4, 光 * 0.6, 0.20, 0, 0, S);
    R.draw("mob_blob", trs(m, x, y + 沈 + S * 1.32, z, S * 0.62, S * 0.56, S * 0.62, e.yaw), c4, 光 * 0.6, 0.24, 0, 0, S);
    for (const sx of [-1, 1]) {
      const lx = x + Math.cos(e.yaw) * sx * S * 0.72, lz = z - Math.sin(e.yaw) * sx * S * 0.72;
      R.draw("mob_limb", trs(m, lx, y + 沈 + S * 0.5, lz, S * 0.34, S * 0.62, S * 0.34, 0), c4, 光 * 0.4, 0.2, 0, 0, S * 0.5);
    }
  } else if (D.形 === "worm") {
    for (let i = 0; i < 4; i++) {
      const o = i * 0.5;
      const b2 = Math.sin(e.bob - i * 0.8) * S * 0.24;
      R.draw("mob_blob", trs(m,
        x - Math.sin(e.yaw) * o * S, y + 沈 + S * 0.4 + b2, z - Math.cos(e.yaw) * o * S,
        S * (1 - i * 0.16), S * (0.8 - i * 0.12), S * (1 - i * 0.16), e.yaw), c4, 光, 0.26, 0, 0, S);
    }
  } else {
    /* human */
    R.draw("npc_body", trs(m, x, y + 沈, z, S * 0.85, S * 0.95, S * 0.85, e.yaw), c4, 光 * 0.4, 0.22, 0, 0, S);
    R.draw("npc_head", trs(m, x, y + 沈, z, S * 0.9, S * 0.95, S * 0.9, e.yaw), c4, 光 * 0.4, 0.24, 0, 0, S);
  }
  /* 目 */
  if (D.目 && !e.dead) {
    const hy = y + S * (D.形 === "blob" ? 0.5 : D.形 === "golem" ? 1.36 : D.形 === "bug" ? 0.98 : 0.66) + 跳;
    const f = 0.34 * S, sd = 0.20 * S;
    for (const sx of [-1, 1]) {
      const ex = x + Math.sin(e.yaw) * f + Math.cos(e.yaw) * sx * sd;
      const ez = z + Math.cos(e.yaw) * f - Math.sin(e.yaw) * sx * sd;
      R.draw("mob_eye", trs(m, ex, hy, ez, S * 0.14, S * 0.14, S * 0.14, 0), [白[0], 白[1], 白[2], a], 0.2, 0, 0, 0, S * 0.2);
      R.draw("mob_eye", trs(m, ex + Math.sin(e.yaw) * S * 0.05, hy, ez + Math.cos(e.yaw) * S * 0.05,
        S * 0.08, S * 0.08, S * 0.08, 0), [黒[0], 黒[1], 黒[2], a], 0, 0, 0, 0, S * 0.12);
    }
  }
}
