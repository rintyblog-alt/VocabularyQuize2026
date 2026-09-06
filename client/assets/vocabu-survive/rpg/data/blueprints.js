/* ══════════════════════════════════════════════════════════════════════════
   設計図 — **建物ごと 1 回で 建てる**。

   訴え（Rinty さん・2026-09-02）:
     「建物も あって、自分で 建物を 建てたりも できるように。種類も 膨大に。」

   ★ なぜ 1 個ずつ 置く だけでは 足りないか（実写で 分かった）:
     家 1 軒は 60 個 以上。スマホで 60 回 狙って 置くのは 遊びに ならない。
     1 個ずつ 置く 自由さは 残したまま、**まとめて 建てる 道**を 足す。

   ★ 要るものは 「型」で 数える（材料の 種類は 問わない）。
     木の かべでも 石の かべでも 1 枚は 1 枚。
     持って いる ものから 多い 順に 使う ので、
     **混ざった 材料で 建つ**。それが その人の 家に なる。

   ★ 形は **式で 作る**。1 個ずつ 座標を 書くと 何千行にも なり、
     直すのも 増やすのも できなく なる。
   ══════════════════════════════════════════════════════════════════════════ */

/* 部品: [dx, dy, dz, 型, yaw] 。dy は 0.5 きざみ（建てる 系と 同じ）。 */

const 床 = (w, d, y, 型) => {
  const o = [];
  for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) o.push([x, y, z, 型 || "slab", 0]);
  return o;
};
/* 外まわりの かべ（角は 柱）。窓と とびらは あとで 差し替える。 */
const 囲い = (w, d, y, 高, 型, 柱) => {
  const o = [];
  for (let k = 0; k < 高; k++) {
    for (let x = 0; x < w; x++) { o.push([x, y + k, 0, 型, 0]); o.push([x, y + k, d - 1, 型, 0]); }
    for (let z = 1; z < d - 1; z++) { o.push([0, y + k, z, 型, 0]); o.push([w - 1, y + k, z, 型, 0]); }
  }
  if (柱) for (const [x, z] of [[0, 0], [w - 1, 0], [0, d - 1], [w - 1, d - 1]])
    for (let k = 0; k < 高; k++) o.push([x, y + k, z, "post", 0]);
  return o;
};
/* 屋根（まわりから 1 段ずつ 内へ）。ピラミッド形。 */
const 屋根 = (w, d, y) => {
  const o = [];
  let x0 = 0, z0 = 0, x1 = w - 1, z1 = d - 1, k = 0;
  while (x0 <= x1 && z0 <= z1 && k < 6) {
    for (let x = x0; x <= x1; x++) { o.push([x, y + k, z0, "roof", 0]); if (z1 !== z0) o.push([x, y + k, z1, "roof", 0]); }
    for (let z = z0 + 1; z < z1; z++) { o.push([x0, y + k, z, "roof", 0]); if (x1 !== x0) o.push([x1, y + k, z, "roof", 0]); }
    x0++; z0++; x1--; z1--; k++;
  }
  return o;
};
/* 平らな 屋根 */
const 陸屋根 = (w, d, y) => 床(w, d, y, "slab");
/* さく で 囲う */
const 柵囲い = (w, d, y) => {
  const o = [];
  for (let x = 0; x < w; x++) { o.push([x, y, 0, "fence", 0]); o.push([x, y, d - 1, "fence", 0]); }
  for (let z = 1; z < d - 1; z++) { o.push([0, y, z, "fence", 0]); o.push([w - 1, y, z, "fence", 0]); }
  return o;
};
/* 開口（とびら・まど）を 差し込む。同じ ところに ある かべを 消す。 */
const 開ける = (部, 一覧) => {
  const 鍵 = (a) => a[0] + "/" + a[1] + "/" + a[2];
  const 消 = new Set(一覧.map((a) => a[0] + "/" + a[1] + "/" + a[2]));
  const out = 部.filter((p) => !消.has(鍵(p)));
  return out.concat(一覧);
};
const 柱立て = (x, z, y, 高) => {
  const o = []; for (let k = 0; k < 高; k++) o.push([x, y + k, z, "post", 0]); return o;
};

function 家(w, d, 高) {
  const dx = Math.floor(w / 2), dz = d - 1;
  let p = 床(w, d, 0).concat(囲い(w, d, 1, 高, "wall", true));
  p = 開ける(p, [
    [dx, 1, dz, "door", 0], [dx, 2, dz, "wall", 0],
    [1, 2, 0, "window", 0], [w - 2, 2, 0, "window", 0],
    [0, 2, Math.floor(d / 2), "window", 0], [w - 1, 2, Math.floor(d / 2), "window", 0]
  ]);
  return p.concat(屋根(w, d, 1 + 高));
}

function 塔(w, 高) {
  let p = 床(w, w, 0).concat(囲い(w, w, 1, 高, "wall", true));
  p = 開ける(p, [[Math.floor(w / 2), 1, w - 1, "door", 0]]);
  for (let k = 2; k < 高; k += 2) p = 開ける(p, [[0, k, 1, "window", 0], [w - 1, k, 1, "window", 0]]);
  /* 中に かいだん（らせん） */
  for (let k = 1; k < 高; k++) {
    const a = k % 4;
    const x = a === 0 || a === 3 ? 1 : w - 2;
    const z = a === 0 || a === 1 ? 1 : w - 2;
    p.push([x, 1 + k, z, "stair", 0]);
  }
  return p.concat(陸屋根(w, w, 1 + 高)).concat(柵囲い(w, w, 2 + 高));
}

function 橋(長, 幅) {
  const p = [];
  for (let x = 0; x < 長; x++) for (let z = 0; z < 幅; z++) p.push([x, 0, z, "slab", 0]);
  for (let x = 0; x < 長; x++) { p.push([x, 1, 0, "fence", 0]); p.push([x, 1, 幅 - 1, "fence", 0]); }
  for (let x = 0; x < 長; x += 4) { p.push(...柱立て(x, 0, -2, 2)); p.push(...柱立て(x, 幅 - 1, -2, 2)); }
  return p;
}

function 門(幅, 高) {
  const p = [];
  for (let k = 0; k < 高; k++) { p.push([0, k, 0, "post", 0]); p.push([幅 - 1, k, 0, "post", 0]); }
  for (let x = 0; x < 幅; x++) p.push([x, 高, 0, "roof", 0]);
  return p;
}

function 井戸() {
  let p = 囲い(3, 3, 0, 1, "wall", false);
  p.push(...柱立て(0, 1, 1, 2), ...柱立て(2, 1, 1, 2));
  p.push([0, 3, 1, "roof", 0], [1, 3, 1, "roof", 0], [2, 3, 1, "roof", 0]);
  return p;
}

function 風車() {
  let p = 塔(3, 5);
  p.push([1, 6.5, -1, "fence", 0], [1, 6.5, 3, "fence", 0], [-1, 6.5, 1, "fence", 0], [3, 6.5, 1, "fence", 0]);
  return p;
}

function 神殿(w, d) {
  const p = 床(w, d, 0);
  for (let x = 0; x < w; x += 2) { p.push(...柱立て(x, 0, 1, 4)); p.push(...柱立て(x, d - 1, 1, 4)); }
  for (let z = 2; z < d - 1; z += 2) { p.push(...柱立て(0, z, 1, 4)); p.push(...柱立て(w - 1, z, 1, 4)); }
  return p.concat(陸屋根(w, d, 5)).concat(屋根(w, d, 6));
}

function 見張り台(高) {
  const p = [];
  for (const [x, z] of [[0, 0], [2, 0], [0, 2], [2, 2]]) p.push(...柱立て(x, z, 0, 高));
  p.push(...床(3, 3, 高));
  p.push(...柵囲い(3, 3, 高 + 1));
  for (let k = 0; k < 高; k++) p.push([1, k, 1, "stair", 0]);
  return p;
}

function 露店() {
  const p = [];
  p.push(...柱立て(0, 0, 0, 2), ...柱立て(3, 0, 0, 2), ...柱立て(0, 2, 0, 2), ...柱立て(3, 2, 0, 2));
  p.push(...陸屋根(4, 3, 2));
  for (let x = 0; x < 4; x++) p.push([x, 0, 2, "slab", 0]);
  return p;
}

function 城壁(長, 高) {
  const p = [];
  for (let x = 0; x < 長; x++) for (let k = 0; k < 高; k++) p.push([x, k, 0, "wall", 0]);
  for (let x = 0; x < 長; x++) for (let k = 0; k < 高; k++) p.push([x, k, 1, "wall", 0]);
  for (let x = 0; x < 長; x += 2) p.push([x, 高, 0, "wall", 0]);
  for (let x = 0; x < 長; x++) p.push([x, 高, 1, "slab", 0]);
  return p;
}

function 桟橋(長) {
  const p = [];
  for (let x = 0; x < 長; x++) { p.push([x, 0, 0, "slab", 0]); p.push([x, 0, 1, "slab", 0]); }
  for (let x = 0; x < 長; x += 3) { p.push(...柱立て(x, 0, -2, 2)); p.push(...柱立て(x, 1, -2, 2)); }
  return p;
}

function 二階家(w, d) {
  let p = 家(w, d, 3);
  p = p.concat(床(w, d, 4));
  p = p.concat(囲い(w, d, 5, 3, "wall", true));
  p = 開ける(p, [[1, 6, 0, "window", 0], [w - 2, 6, 0, "window", 0],
    [0, 6, Math.floor(d / 2), "window", 0], [w - 1, 6, Math.floor(d / 2), "window", 0]]);
  return p.concat(屋根(w, d, 8));
}

function 灯台() {
  let p = 塔(3, 8);
  p.push([1, 10, 1, "window", 0]);
  return p;
}

function 畑囲い() {
  const p = 柵囲い(7, 7, 0);
  return 開ける(p, [[3, 0, 0, "fence", 0]]);
}

function 温室(w, d) {
  let p = 床(w, d, 0);
  for (let k = 0; k < 3; k++) {
    for (let x = 0; x < w; x++) { p.push([x, 1 + k, 0, "window", 0]); p.push([x, 1 + k, d - 1, "window", 0]); }
    for (let z = 1; z < d - 1; z++) { p.push([0, 1 + k, z, "window", 0]); p.push([w - 1, 1 + k, z, "window", 0]); }
  }
  p = 開ける(p, [[Math.floor(w / 2), 1, d - 1, "door", 0]]);
  return p.concat(陸屋根(w, d, 4));
}

function 蔵(w, d) {
  let p = 床(w, d, 0).concat(囲い(w, d, 1, 4, "wall", true));
  p = 開ける(p, [[Math.floor(w / 2), 1, d - 1, "door", 0]]);
  return p.concat(屋根(w, d, 5));
}

function 石橋(長) {
  const p = [];
  for (let x = 0; x < 長; x++) for (let z = 0; z < 3; z++) p.push([x, 0, z, "cube", 0]);
  for (let x = 0; x < 長; x++) { p.push([x, 1, 0, "wall", 0]); p.push([x, 1, 2, "wall", 0]); }
  return p;
}

function 東屋() {
  const p = [];
  for (const [x, z] of [[0, 0], [3, 0], [0, 3], [3, 3]]) p.push(...柱立て(x, z, 0, 3));
  p.push(...屋根(4, 4, 3));
  p.push(...床(4, 4, 0, "slab"));
  return p;
}

function 洞の家(w, d) {
  let p = 床(w, d, 0).concat(囲い(w, d, 1, 3, "cube", true));
  p = 開ける(p, [[Math.floor(w / 2), 1, d - 1, "door", 0], [1, 2, 0, "window", 0]]);
  return p.concat(陸屋根(w, d, 4));
}

export const BLUEPRINTS = [
  { id: "hut", 名: "小屋", 記: "はじめての 家。雨と 夜を しのぐ。", 段: 1, 部: 家(3, 3, 2) },
  { id: "house", 名: "家", 記: "まどが あって 明るい。", 段: 2, 部: 家(5, 4, 3) },
  { id: "bighouse", 名: "大きな 家", 記: "人を 招ける 広さ。", 段: 4, 部: 家(7, 5, 3) },
  { id: "house2", 名: "二階建ての 家", 記: "上の 階から 遠くが 見える。", 段: 6, 部: 二階家(5, 5) },
  { id: "kura", 名: "蔵", 記: "ものを しまう ための 厚い 建物。", 段: 3, 部: 蔵(4, 4) },
  { id: "tower", 名: "塔", 記: "らせんの かいだんで 上へ。", 段: 5, 部: 塔(4, 7) },
  { id: "watch", 名: "見張り台", 記: "四本柱の 高い 台。遠くが 見える。", 段: 3, 部: 見張り台(5) },
  { id: "light", 名: "灯台", 記: "海辺の 目印。夜も 光る。", 段: 8, 部: 灯台() },
  { id: "mill", 名: "風車", 記: "風を 受けて 回る。", 段: 6, 部: 風車() },
  { id: "well", 名: "井戸", 記: "水を くむ ところ。", 段: 2, 部: 井戸() },
  { id: "gate", 名: "門", 記: "ここから 先は 自分の 土地。", 段: 2, 部: 門(4, 3) },
  { id: "wall", 名: "城壁", 記: "厚い 壁。上を 歩ける。", 段: 7, 部: 城壁(10, 3) },
  { id: "fence", 名: "囲い", 記: "はたけや 家を さくで 囲う。", 段: 1, 部: 畑囲い() },
  { id: "bridge", 名: "木の 橋", 記: "谷や 川を わたる。", 段: 2, 部: 橋(10, 3) },
  { id: "sbridge", 名: "石の 橋", 記: "壊れない 太い 橋。", 段: 5, 部: 石橋(12) },
  { id: "pier", 名: "桟橋", 記: "海へ のびる 板の 道。", 段: 3, 部: 桟橋(9) },
  { id: "stall", 名: "露店", 記: "屋根つきの 台。もの を 並べる。", 段: 2, 部: 露店() },
  { id: "azumaya", 名: "東屋", 記: "柱と 屋根だけ。休む ところ。", 段: 2, 部: 東屋() },
  { id: "green", 名: "温室", 記: "まどだけで 作る。中は 明るい。", 段: 6, 部: 温室(5, 4) },
  { id: "shrine", 名: "神殿", 記: "柱が ならぶ 大きな 建物。", 段: 9, 部: 神殿(7, 7) },
  { id: "cavehome", 名: "石の 家", 記: "四角い 石だけで 建てる 頑丈な 家。", 段: 4, 部: 洞の家(4, 4) }
];

/** 型ごとの 要り数 */
export function 要る(bp) {
  const n = {};
  for (const p of bp.部) n[p[3]] = (n[p[3]] || 0) + 1;
  return n;
}

/** 置く 場所の 広さ（案内に 使う）*/
export function 大きさ(bp) {
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, y1 = -1e9;
  for (const p of bp.部) {
    if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
    if (p[2] < z0) z0 = p[2]; if (p[2] > z1) z1 = p[2];
    if (p[1] > y1) y1 = p[1];
  }
  return { w: x1 - x0 + 1, d: z1 - z0 + 1, h: y1 + 1 };
}

export const BP = {};
for (const b of BLUEPRINTS) BP[b.id] = b;
