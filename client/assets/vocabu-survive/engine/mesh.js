/* ══════════════════════════════════════════════════════════════════════════
   形を その場で 作る。ファイルは 1 つも 読まない。

   方針（2026-08-28）:
     ・角は **必ず 丸める**。おもちゃに 見えるかどうかは ほぼ ここで 決まる。
     ・面の数は 少なく。代わりに 陰影と 色で 質を 出す（要件のとおり）。
     ・LOD は 同じ 作り関数に 粗さを 渡して 3 段 作る。

   返す形: { position, normal, uv, index, bound:{r, min, max} }
   ══════════════════════════════════════════════════════════════════════════ */

function finish(pos, nor, uv, idx) {
  const position = new Float32Array(pos);
  const normal = new Float32Array(nor);
  const uvs = new Float32Array(uv);
  const index = (pos.length / 3 > 65535) ? new Uint32Array(idx) : new Uint16Array(idx);
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
  return { position, normal, uv: uvs, index, bound: { r: Math.sqrt(r), min, max } };
}

/* ── 角の 丸い 箱 ────────────────────────────────────────────────────────
   1 辺 = 1 の 立方体を 中心に 置く。radius は 0〜0.5。
   球を 8 分割して 角へ 置く 作りにすると 面が 増えすぎるので、
   **立方体の 頂点を 押し出して 正規化** する（安くて 見た目が 良い）。 */
export function roundedBox(seg = 3, radius = 0.14, sx = 1, sy = 1, sz = 1) {
  const pos = [], nor = [], uv = [], idx = [];
  const n = Math.max(1, seg | 0);
  const h = 0.5;
  const faces = [
    /* 法線, 右, 上 */
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
    [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
    [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
    [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
    [[0, -1, 0], [1, 0, 0], [0, 0, 1]]
  ];
  const r = Math.min(0.499, Math.max(0, radius));
  const inner = h - r;
  for (let f = 0; f < 6; f++) {
    const [N, R, U] = faces[f];
    const base = pos.length / 3;
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * 2 - 1, b = (j / n) * 2 - 1;
        /* 面の 中の 点（内側の 立方体の 上）*/
        let cx = N[0] * h + R[0] * a * h + U[0] * b * h;
        let cy = N[1] * h + R[1] * a * h + U[1] * b * h;
        let cz = N[2] * h + R[2] * a * h + U[2] * b * h;
        /* 各軸を inner に 収め、はみ出た分を 球で 丸める */
        const qx = Math.max(-inner, Math.min(inner, cx));
        const qy = Math.max(-inner, Math.min(inner, cy));
        const qz = Math.max(-inner, Math.min(inner, cz));
        let dx = cx - qx, dy = cy - qy, dz = cz - qz;
        const dl = Math.hypot(dx, dy, dz);
        if (dl > 1e-6) { dx /= dl; dy /= dl; dz /= dl; } else { dx = N[0]; dy = N[1]; dz = N[2]; }
        pos.push((qx + dx * r) * sx, (qy + dy * r) * sy, (qz + dz * r) * sz);
        nor.push(dx, dy, dz);
        uv.push(i / n, j / n);
      }
    }
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = base + j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
  }
  return finish(pos, nor, uv, idx);
}

/** ただの 箱（丸めない）。地面や 壁など 角が 見えない所に 使う。 */
export function box(sx = 1, sy = 1, sz = 1) { return roundedBox(1, 0, sx, sy, sz); }

/* ── 球（UV 分割）───────────────────────────────────────────────────── */
export function sphere(seg = 16, rings = 12, r = 0.5) {
  const pos = [], nor = [], uv = [], idx = [];
  for (let j = 0; j <= rings; j++) {
    const v = j / rings, phi = v * Math.PI;
    const sp = Math.sin(phi), cp = Math.cos(phi);
    for (let i = 0; i <= seg; i++) {
      const u = i / seg, th = u * Math.PI * 2;
      const x = sp * Math.cos(th), y = cp, z = sp * Math.sin(th);
      pos.push(x * r, y * r, z * r); nor.push(x, y, z); uv.push(u, v);
    }
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i, b = a + 1, c = a + seg + 1, d = c + 1;
      if (j !== 0) idx.push(a, c, b);
      if (j !== rings - 1) idx.push(b, c, d);
    }
  }
  return finish(pos, nor, uv, idx);
}

/* ── 筒（上下に ふた）──────────────────────────────────────────────── */
export function cylinder(seg = 16, rTop = 0.5, rBottom = 0.5, height = 1, caps = true) {
  const pos = [], nor = [], uv = [], idx = [];
  const hh = height / 2;
  const slope = (rBottom - rTop) / height;
  for (let j = 0; j <= 1; j++) {
    const y = j === 0 ? -hh : hh, r = j === 0 ? rBottom : rTop;
    for (let i = 0; i <= seg; i++) {
      const th = (i / seg) * Math.PI * 2;
      const cx = Math.cos(th), cz = Math.sin(th);
      pos.push(cx * r, y, cz * r);
      const nl = Math.hypot(1, slope) || 1;
      nor.push(cx / nl, slope / nl, cz / nl);
      uv.push(i / seg, j);
    }
  }
  for (let i = 0; i < seg; i++) {
    const a = i, b = i + 1, c = i + seg + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  if (caps) {
    for (const [y, r, ny] of [[-hh, rBottom, -1], [hh, rTop, 1]]) {
      if (r <= 1e-6) continue;
      const center = pos.length / 3;
      pos.push(0, y, 0); nor.push(0, ny, 0); uv.push(0.5, 0.5);
      for (let i = 0; i <= seg; i++) {
        const th = (i / seg) * Math.PI * 2;
        pos.push(Math.cos(th) * r, y, Math.sin(th) * r);
        nor.push(0, ny, 0);
        uv.push(0.5 + Math.cos(th) * 0.5, 0.5 + Math.sin(th) * 0.5);
      }
      for (let i = 0; i < seg; i++) {
        if (ny > 0) idx.push(center, center + 1 + i, center + 2 + i);
        else idx.push(center, center + 2 + i, center + 1 + i);
      }
    }
  }
  return finish(pos, nor, uv, idx);
}

/* ── カプセル（プレイヤーの 体）───────────────────────────────────────
   高さは 「真ん中の 筒 + 上下の 半球」の 合計。 */
export function capsule(seg = 16, rings = 6, r = 0.4, mid = 0.5) {
  const pos = [], nor = [], uv = [], idx = [];
  const rows = [];
  /* 下の 半球 */
  for (let j = 0; j <= rings; j++) {
    const phi = (j / rings) * (Math.PI / 2);
    rows.push({ y: -mid / 2 - Math.cos(phi) * r, rr: Math.sin(phi) * r, ny: -Math.cos(phi) });
  }
  /* 上の 半球 */
  for (let j = 0; j <= rings; j++) {
    const phi = (j / rings) * (Math.PI / 2);
    rows.push({ y: mid / 2 + Math.sin(phi) * r, rr: Math.cos(phi) * r, ny: Math.sin(phi) });
  }
  const R = rows.length;
  for (let j = 0; j < R; j++) {
    const row = rows[j];
    for (let i = 0; i <= seg; i++) {
      const th = (i / seg) * Math.PI * 2;
      const cx = Math.cos(th), cz = Math.sin(th);
      pos.push(cx * row.rr, row.y, cz * row.rr);
      const hz = Math.sqrt(Math.max(0, 1 - row.ny * row.ny));
      nor.push(cx * hz, row.ny, cz * hz);
      uv.push(i / seg, j / (R - 1));
    }
  }
  for (let j = 0; j < R - 1; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i, b = a + 1, c = a + seg + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  return finish(pos, nor, uv, idx);
}

/* ── 輪（トランポリンの ふち・回る輪）────────────────────────────────── */
export function torus(seg = 24, ring = 10, R = 0.5, r = 0.15) {
  const pos = [], nor = [], uv = [], idx = [];
  for (let j = 0; j <= ring; j++) {
    const v = (j / ring) * Math.PI * 2, cv = Math.cos(v), sv = Math.sin(v);
    for (let i = 0; i <= seg; i++) {
      const u = (i / seg) * Math.PI * 2, cu = Math.cos(u), su = Math.sin(u);
      pos.push((R + r * cv) * cu, r * sv, (R + r * cv) * su);
      nor.push(cv * cu, sv, cv * su);
      uv.push(i / seg, j / ring);
    }
  }
  for (let j = 0; j < ring; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i, b = a + 1, c = a + seg + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  return finish(pos, nor, uv, idx);
}

/* ── 平らな 板（水面・影の受け・門の 幕）──────────────────────────────── */
export function plane(nx = 1, nz = 1, sx = 1, sz = 1) {
  const pos = [], nor = [], uv = [], idx = [];
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      pos.push((i / nx - 0.5) * sx, 0, (j / nz - 0.5) * sz);
      nor.push(0, 1, 0);
      uv.push(i / nx, j / nz);
    }
  }
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  return finish(pos, nor, uv, idx);
}

/* ── 円すい（矢印・とんがり）─────────────────────────────────────────── */
export function cone(seg = 14, r = 0.5, h = 1) { return cylinder(seg, 0, r, h, true); }

/* ── 型抜きした 板（クイズの 門の 枠）──────────────────────────────────
   外枠 w×h、内側が 空いた 額縁。門は これを 立てて 使う。 */
export function frame(w = 4, h = 3, t = 0.35, d = 0.35) {
  const parts = [];
  const push = (m, ox, oy) => {
    for (let i = 0; i < m.position.length; i += 3) {
      m.position[i] += ox; m.position[i + 1] += oy;
    }
    parts.push(m);
  };
  push(roundedBox(2, 0.1, w, t, d), 0, h / 2 - t / 2);       /* 上 */
  push(roundedBox(2, 0.1, t, h, d), -w / 2 + t / 2, 0);       /* 左 */
  push(roundedBox(2, 0.1, t, h, d), w / 2 - t / 2, 0);        /* 右 */
  return mergeMeshes(parts);
}

/** いくつかの 形を 1 つに つなぐ（描き 1 回で 済ませる） */
export function mergeMeshes(list) {
  let np = 0, ni = 0;
  for (const m of list) { np += m.position.length; ni += m.index.length; }
  const pos = new Float32Array(np), nor = new Float32Array(np), uv = new Float32Array(np / 3 * 2);
  const big = (np / 3) > 65535;
  const idx = big ? new Uint32Array(ni) : new Uint16Array(ni);
  let po = 0, uo = 0, io = 0, vbase = 0;
  for (const m of list) {
    pos.set(m.position, po); nor.set(m.normal, po);
    uv.set(m.uv, uo);
    for (let i = 0; i < m.index.length; i++) idx[io + i] = m.index[i] + vbase;
    vbase += m.position.length / 3;
    po += m.position.length; uo += m.uv.length; io += m.index.length;
  }
  let r = 0;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) {
    const d = pos[i] * pos[i] + pos[i + 1] * pos[i + 1] + pos[i + 2] * pos[i + 2];
    if (d > r) r = d;
    for (let k = 0; k < 3; k++) { if (pos[i + k] < min[k]) min[k] = pos[i + k]; if (pos[i + k] > max[k]) max[k] = pos[i + k]; }
  }
  return { position: pos, normal: nor, uv, index: idx, bound: { r: Math.sqrt(r), min, max } };
}

/** 面の数（検査で 使う） */
export function triCount(m) { return m.index.length / 3; }
