/* ══════════════════════════════════════════════════════════════════════════
   ゴースト（自己ベストの 走りと 並んで 走る）

   置き場は **IndexedDB**。localStorage では ない。
   ★ 本体の localStorage は もう いっぱい（4.4MB の 壁に 何度も ぶつかっている）。
     ゴーストは 1 本 15〜30KB で、30 本 走れば 1MB 近く に なる。
     ここに 入れると **本体の 単語帳が 保存できなく なる**。

   形（小さく する ため 配列のまま）:
     { v: 1, id: コース, ms: 総時間, hz: 10, a: [t, x, y, z, yaw, pr, …] }
     数は すべて 小数 2 桁 に 丸める。JSON が 4 割 小さく なる。
   ══════════════════════════════════════════════════════════════════════════ */

const DB = "vq.survive.ghost";
const STORE = "runs";
const HZ = 10;                 /* 1 秒に 10 回。60 回 だと 6 倍 大きく なる。 */
const MAX_SEC = 600;           /* 10 分。これ以上は 記録しない（際限なく 太らない） */
export const GHOST_HZ = HZ;

let _db = null, _open = null;

function open() {
  if (_db) return Promise.resolve(_db);
  if (_open) return _open;
  _open = new Promise((res) => {
    let rq = null;
    try { rq = indexedDB.open(DB, 1); } catch (e) { res(null); return; }
    if (!rq) { res(null); return; }
    rq.onupgradeneeded = () => {
      try { rq.result.createObjectStore(STORE, { keyPath: "id" }); } catch (e) {}
    };
    rq.onsuccess = () => { _db = rq.result; res(_db); };
    rq.onerror = () => res(null);
    /* ★ 開けない ことが ある（プライベート窓・容量なし）。
       その ときは **黙って ゴースト無しで 遊べる** ように null を 返す。 */
    setTimeout(() => res(_db || null), 3000);
  });
  return _open;
}

function tx(mode) {
  return open().then((db) => {
    if (!db) return null;
    try { return db.transaction(STORE, mode).objectStore(STORE); } catch (e) { return null; }
  });
}

/** 走りを 覚える。**自己ベストを 更新した ときだけ** 呼ぶこと。 */
export async function saveGhost(courseId, samples, totalMs) {
  if (!courseId || !samples || samples.length < 6) return false;
  const st = await tx("readwrite");
  if (!st) return false;
  return new Promise((res) => {
    let rq = null;
    try {
      rq = st.put({ id: String(courseId), v: 1, ms: Math.round(totalMs), hz: HZ, a: samples });
    } catch (e) { res(false); return; }
    rq.onsuccess = () => res(true);
    rq.onerror = () => res(false);
  });
}

/** 覚えている 走りを 出す。無ければ null。 */
export async function loadGhost(courseId) {
  if (!courseId) return null;
  const st = await tx("readonly");
  if (!st) return null;
  return new Promise((res) => {
    let rq = null;
    try { rq = st.get(String(courseId)); } catch (e) { res(null); return; }
    rq.onsuccess = () => {
      const d = rq.result;
      if (!d || !Array.isArray(d.a) || d.a.length < 6) { res(null); return; }
      res(d);
    };
    rq.onerror = () => res(null);
  });
}

/** 消す。コースを 指定しなければ 全部。 */
export async function clearGhost(courseId) {
  const st = await tx("readwrite");
  if (!st) return false;
  return new Promise((res) => {
    let rq = null;
    try { rq = courseId ? st.delete(String(courseId)) : st.clear(); } catch (e) { res(false); return; }
    rq.onsuccess = () => res(true);
    rq.onerror = () => res(false);
  });
}

/* ── 記録する 側 ────────────────────────────────────────────────────── */
export class GhostRecorder {
  constructor() { this.a = []; this._next = 0; }
  reset() { this.a.length = 0; this._next = 0; }
  /** 走っている 間 毎コマ 呼ぶ。中で 間引く。 */
  sample(t, p, progress) {
    if (t < this._next || t > MAX_SEC) return;
    this._next = t + 1 / HZ;
    const r2 = (v) => Math.round(v * 100) / 100;
    this.a.push(r2(t), r2(p.x), r2(p.y), r2(p.z), r2(p.yaw), r2(progress));
  }
  get length() { return this.a.length / 6; }
}

/* ── 再生する 側 ────────────────────────────────────────────────────── */
export class GhostPlayer {
  constructor(data) {
    this.a = (data && data.a) || [];
    this.ms = (data && data.ms) || 0;
    this.n = this.a.length / 6;
    this.x = 0; this.y = 0; this.z = 0; this.yaw = 0; this.progress = 0;
    this.done = false;
    this._i = 0;
  }
  get ok() { return this.n >= 2; }

  /** 時刻 t の 位置に する。走り終えて いれば done。 */
  at(t) {
    const a = this.a, n = this.n;
    if (n < 2) { this.done = true; return; }
    if (t >= a[(n - 1) * 6]) {
      /* ★ 終わったら **消す**。ゴールに 立ち尽くす 幽霊は 邪魔に なる。 */
      this.done = true;
      return;
    }
    this.done = false;
    /* 前の 位置から 前へ 探す（毎回 頭から 探さない） */
    let i = this._i;
    if (i > 0 && a[i * 6] > t) i = 0;
    while (i + 1 < n && a[(i + 1) * 6] <= t) i++;
    this._i = i;
    const o = i * 6, p = Math.min(n - 1, i + 1) * 6;
    const t0 = a[o], t1 = a[p];
    const k = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
    this.x = a[o + 1] + (a[p + 1] - a[o + 1]) * k;
    this.y = a[o + 2] + (a[p + 2] - a[o + 2]) * k;
    this.z = a[o + 3] + (a[p + 3] - a[o + 3]) * k;
    /* 向きは 回り込みを 見る（π を またぐ ときに 逆へ 回らない ように） */
    let d = (a[p + 4] - a[o + 4]) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    this.yaw = a[o + 4] + d * k;
    this.progress = a[o + 5] + (a[p + 5] - a[o + 5]) * k;
  }

  /** 進み pr の ところを ゴーストは 何秒で 通ったか。 */
  timeAt(pr) {
    const a = this.a, n = this.n;
    if (n < 2) return -1;
    if (pr <= a[5]) return a[0];
    for (let i = 1; i < n; i++) {
      const o = i * 6;
      if (a[o + 5] >= pr) {
        const q = (i - 1) * 6;
        const d = a[o + 5] - a[q + 5];
        const k = d > 1e-6 ? (pr - a[q + 5]) / d : 0;
        return a[q] + (a[o] - a[q]) * k;
      }
    }
    return -1;   /* まだ そこまで 行っていない */
  }
}
