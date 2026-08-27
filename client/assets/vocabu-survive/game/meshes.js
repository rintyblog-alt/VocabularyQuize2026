/* ══════════════════════════════════════════════════════════════════════════
   コースと 仕掛けが 使う 形。**全部で 10 種類**しか 使わない。

   なぜ 少なくするか:
     まとめ描きは 「同じ 形」でしか まとめられない。
     形を 30 種類 作ると 描き回数が 30 倍に なる。
     大きさを 変えて 使い回せば 1 種類の まま 何千個でも 1 回で 描ける。
   ══════════════════════════════════════════════════════════════════════════ */
import * as MESH from "../engine/mesh.js";

export const M = {
  box: "vs_box",       /* 角の 丸い 箱。床・壁・板・棒 ぜんぶ これ */
  slab: "vs_slab",     /* 薄い 板（丸みを 抑えた もの）。床に 使う */
  cyl: "vs_cyl",       /* 筒。柱・ローラー・回る 軸 */
  ball: "vs_ball",     /* 球。バンパー・玉 */
  ring: "vs_ring",     /* 輪。トランポリンの ふち・門の 印 */
  cone: "vs_cone",     /* 円すい。矢印・とんがり */
  frame: "vs_frame",   /* 額縁。クイズの 門 */
  blade: "vs_blade",   /* 羽根（薄い 箱）。扇風機・回転棒 */
  flag: "vs_flag",     /* 旗。中間地点・ゴール */
  post: "vs_post"      /* 細い 柱 */
};

/** renderer へ 1 回だけ 登録する。 */
export function registerCourseMeshes(R) {
  if (R.hasMesh(M.box)) return;
  R.addMesh(M.box, [MESH.roundedBox(3, 0.10), MESH.roundedBox(2, 0.10), MESH.roundedBox(1, 0.08)]);
  R.addMesh(M.slab, [MESH.roundedBox(2, 0.045), MESH.roundedBox(1, 0.045), MESH.box()]);
  R.addMesh(M.cyl, [MESH.cylinder(22, 0.5, 0.5, 1, true), MESH.cylinder(12, 0.5, 0.5, 1, true), MESH.cylinder(7, 0.5, 0.5, 1, true)]);
  R.addMesh(M.ball, [MESH.sphere(20, 14, 0.5), MESH.sphere(12, 8, 0.5), MESH.sphere(7, 5, 0.5)]);
  R.addMesh(M.ring, [MESH.torus(26, 10, 0.5, 0.13), MESH.torus(14, 7, 0.5, 0.13), MESH.torus(9, 5, 0.5, 0.13)]);
  R.addMesh(M.cone, [MESH.cone(16, 0.5, 1), MESH.cone(9, 0.5, 1), MESH.cone(6, 0.5, 1)]);
  R.addMesh(M.frame, [MESH.frame(1, 1, 0.09, 0.09), MESH.frame(1, 1, 0.09, 0.09)]);
  R.addMesh(M.blade, [MESH.roundedBox(2, 0.06), MESH.roundedBox(1, 0.06)]);
  R.addMesh(M.flag, [MESH.roundedBox(2, 0.08), MESH.roundedBox(1, 0.08)]);
  R.addMesh(M.post, [MESH.cylinder(10, 0.5, 0.5, 1, true), MESH.cylinder(6, 0.5, 0.5, 1, true)]);
}
