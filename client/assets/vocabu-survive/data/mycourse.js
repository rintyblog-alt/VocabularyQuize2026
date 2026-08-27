/* ══════════════════════════════════════════════════════════════════════════
   自分で 作った コース

   置き場は **IndexedDB**（本体の localStorage は もう いっぱい）。
   受け渡しは「合言葉」ひとつ。JSON を 縮めて 文字に する だけなので
   サーバも 要らないし、誰にでも 渡せる。

   形:
     { id, name, theme, difficulty, sections: [...], updatedAt }
   sections の 中身は data/courses.js と 同じ（そのまま buildCourse に 渡せる）。
   ══════════════════════════════════════════════════════════════════════════ */

const DB = "vq.survive.mycourse";
const STORE = "courses";
export const MY_PREFIX = "my:";
const MAX = 40;                /* 作れる 本数 */

let _db = null, _open = null;
function open() {
  if (_db) return Promise.resolve(_db);
  if (_open) return _open;
  _open = new Promise((res) => {
    let rq = null;
    try { rq = indexedDB.open(DB, 1); } catch (e) { res(null); return; }
    if (!rq) { res(null); return; }
    rq.onupgradeneeded = () => { try { rq.result.createObjectStore(STORE, { keyPath: "id" }); } catch (e) {} };
    rq.onsuccess = () => { _db = rq.result; res(_db); };
    rq.onerror = () => res(null);
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

export async function listMyCourses() {
  const st = await tx("readonly");
  if (!st) return [];
  return new Promise((res) => {
    let rq = null;
    try { rq = st.getAll(); } catch (e) { res([]); return; }
    rq.onsuccess = () => {
      const a = Array.isArray(rq.result) ? rq.result : [];
      a.sort((x, y) => (y.updatedAt || 0) - (x.updatedAt || 0));
      res(a);
    };
    rq.onerror = () => res([]);
  });
}

export async function getMyCourse(id) {
  const st = await tx("readonly");
  if (!st) return null;
  return new Promise((res) => {
    let rq = null;
    try { rq = st.get(String(id)); } catch (e) { res(null); return; }
    rq.onsuccess = () => res(rq.result || null);
    rq.onerror = () => res(null);
  });
}

export async function saveMyCourse(c, nowMs) {
  if (!c || !c.id) return false;
  const 数 = (await listMyCourses()).length;
  const あった = await getMyCourse(c.id);
  /* ★ 上限は **新しく 作る ときだけ** 見る。
     直す たびに 断られると、いっぱいの 人は 何も 直せなく なる。 */
  if (!あった && 数 >= MAX) return "満杯";
  const st = await tx("readwrite");
  if (!st) return false;
  const rec = Object.assign({}, c, { updatedAt: nowMs || 0 });
  return new Promise((res) => {
    let rq = null;
    try { rq = st.put(rec); } catch (e) { res(false); return; }
    rq.onsuccess = () => res(true);
    rq.onerror = () => res(false);
  });
}

export async function deleteMyCourse(id) {
  const st = await tx("readwrite");
  if (!st) return false;
  return new Promise((res) => {
    let rq = null;
    try { rq = st.delete(String(id)); } catch (e) { res(false); return; }
    rq.onsuccess = () => res(true);
    rq.onerror = () => res(false);
  });
}

/* ── 合言葉（受け渡し）────────────────────────────────────────────────
   ★ **サーバを 使わない。** コースは 数キロバイトなので、
     文字に して 渡せば それで 足りる。サーバに 置くと
     消す・直す・報告する… と 面倒が 一気に 増える。 */
function utf8ToB64(s) {
  const b = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64ToUtf8(s) {
  const t = String(s).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(t + "===".slice((t.length + 3) % 4));
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(b);
}

export function exportCode(c) {
  const 小 = { n: c.name, t: c.theme, d: c.difficulty, s: c.sections };
  return "VS1" + utf8ToB64(JSON.stringify(小));
}

/** 合言葉から コースを 作る。読めなければ null。 */
export function importCode(code, id) {
  const s = String(code || "").trim();
  if (!/^VS1[A-Za-z0-9\-_]+$/.test(s)) return null;
  let d = null;
  try { d = JSON.parse(b64ToUtf8(s.slice(3))); } catch (e) { return null; }
  if (!d || !Array.isArray(d.s) || !d.s.length) return null;
  /* ★ 中身を **必ず 洗う。** 人から もらう ものなので、
     知らない 区画や 桁外れの 数が 入っていると 画面が 落ちる。 */
  const sec = cleanSections(d.s);
  if (!sec.length) return null;
  return {
    id: id || (MY_PREFIX + "imp" + Math.abs(hash(s)).toString(36).slice(0, 8)),
    name: String(d.n || "もらった コース").slice(0, 40),
    theme: String(d.t || "meadow").slice(0, 16),
    difficulty: Math.max(1, Math.min(10, Number(d.d) || 3)),
    sections: sec, updatedAt: 0
  };
}
function hash(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h | 0;
}

/* ── 洗う ─────────────────────────────────────────────────────────────
   使える 区画と 数の 範囲を **ここ 1 か所**で 決める。
   画面（編集）も 合言葉も 同じ ここを 通す。 */
export const SECTION_KINDS = [
  { t: "start",      名: "スタート",   固: true },
  { t: "path",       名: "道" },
  { t: "bridge",     名: "橋" },
  { t: "ice",        名: "氷の 道" },
  { t: "conveyor",   名: "動く 床" },
  { t: "ramp",       名: "坂" },
  { t: "gap",        名: "すきま" },
  { t: "stones",     名: "とび石" },
  { t: "movers",     名: "動く 足場" },
  { t: "turn",       名: "曲がり" },
  { t: "gate",       名: "クイズの 門" },
  { t: "checkpoint",名: "中間地点" },
  { t: "finish",     名: "ゴール",     固: true }
];
const KIND_SET = new Set(SECTION_KINDS.map((k) => k.t));

const N = (v, lo, hi, def) => {
  const x = Number(v);
  if (!Number.isFinite(x)) return def;
  return Math.max(lo, Math.min(hi, Math.round(x * 100) / 100));
};

export function cleanSections(list) {
  const out = [];
  for (const s of (Array.isArray(list) ? list : []).slice(0, 40)) {
    if (!s || typeof s !== "object" || !KIND_SET.has(s.t)) continue;
    const o = { t: s.t };
    if (s.t === "start") { o.w = N(s.w, 10, 24, 18); o.len = N(s.len, 10, 30, 16); }
    else if (s.t === "finish") { /* 何も 要らない */ }
    else if (s.t === "checkpoint") { o.w = N(s.w, 8, 20, 12); if (s.pad !== undefined) o.pad = N(s.pad, 6, 30, 8); }
    else if (s.t === "gate") { o.limit = N(s.limit, 6, 30, 12); o.gw = N(s.gw, 5, 14, 7); }
    else if (s.t === "gap") { o.len = N(s.len, 3, 40, 12); }
    else if (s.t === "stones") {
      o.count = N(s.count, 2, 12, 5); o.gap = N(s.gap, 2.5, 5.2, 4);
      o.spread = N(s.spread, 0, 3.4, 1.6); o.bob = N(s.bob, 0, 1.4, 0.6);
    } else if (s.t === "movers") {
      o.count = N(s.count, 2, 8, 4); o.gap = N(s.gap, 3, 5.2, 4.2);
      o.ax = N(s.ax, 0, 7, 4); o.period = N(s.period, 2, 8, 3.4);
      o.stagger = N(s.stagger, 0, 1, 0.5);
    } else if (s.t === "ramp") {
      o.len = N(s.len, 8, 40, 20); o.dy = N(s.dy, -12, 12, 4); o.w = N(s.w, 6, 20, 10);
    } else if (s.t === "turn") {
      o.len = N(s.len, 10, 40, 20); o.dx = N(s.dx, -20, 20, 10); o.w = N(s.w, 6, 20, 11);
    } else if (s.t === "conveyor") {
      o.len = N(s.len, 10, 40, 20); o.w = N(s.w, 6, 20, 10);
      o.speed = N(s.speed, -6, 6, 3.5); o.cz = N(s.cz, -1, 1, -1); o.cx = N(s.cx, -1, 1, 0);
    } else if (s.t === "bridge") {
      o.len = N(s.len, 10, 40, 22); o.w = N(s.w, 2.2, 8, 3.2);
    } else {
      /* path / ice */
      o.len = N(s.len, 8, 40, 22); o.w = N(s.w, 5, 20, 12);
      if (s.wall) o.wall = true;
    }
    if (Array.isArray(s.obs) && s.obs.length) {
      const obs = [];
      for (const q of s.obs.slice(0, 4)) {
        if (!q || typeof q !== "object" || typeof q.t !== "string") continue;
        if (!OBS_OK.has(q.t)) continue;
        const r = { t: q.t, dz: N(q.dz, 0, 40, 6) };
        for (const k of ["w", "d", "r", "len", "speed", "period", "phase", "swing", "dx", "dy",
                         "height", "arms", "push", "strength", "range", "width", "duty",
                         "delay", "back", "wave", "count", "gap", "spread", "bob", "ax", "ay", "h"]) {
          if (q[k] !== undefined) r[k] = N(q[k], -40, 40, 0);
        }
        obs.push(r);
      }
      if (obs.length) o.obs = obs;
    }
    out.push(o);
  }
  return out;
}

/* 画面から 置ける 仕掛け。**危ない 組み合わせを 作れない ように 絞る。** */
export const OBS_KINDS = [
  { t: "spinner", 名: "回る 棒",      既: { len: 10, speed: 1.0, height: 0.8 } },
  { t: "hammer",  名: "ハンマー",     既: { period: 2.0, swing: 1.1 } },
  { t: "bumper",  名: "バンパー",     既: { r: 1.5 } },
  { t: "tramp",   名: "トランポリン",既: { r: 2.4 } },
  { t: "fan",     名: "送風機",       既: { dx: -8, strength: 16, range: 13, width: 9 } },
  { t: "roller",  名: "ローラー",     既: { len: 11, r: 1.1, push: 4.0 } },
  { t: "hazard",  名: "危ない 床",    既: { w: 8, d: 4 } },
  { t: "narrow",  名: "細い 道",      既: { w: 1.8, d: 20, wave: 2.4 } },
  { t: "faller",  名: "落ちる 板",    既: { w: 4, d: 4, delay: 0.66, back: 2.2 } },
  { t: "blinker", 名: "消える 板",    既: { w: 4.4, d: 4.4, period: 3.4, duty: 0.72 } },
  { t: "mover",   名: "動く 板",      既: { w: 4.6, d: 4.6, ax: 5, period: 3.4 } },
  { t: "turntable", 名: "回る 台",    既: { r: 6, speed: 0.7 } },
  { t: "launch",  名: "打ち上げ台",   既: { w: 5, d: 5 } },
  { t: "timedgate", 名: "時間の 門",  既: { w: 5, h: 4, period: 2.8, duty: 0.38 } },
  { t: "pushwall", 名: "押す 壁",     既: { dx: -5, w: 4, reach: 5, period: 2.6 } }
];
const OBS_OK = new Set(OBS_KINDS.map((k) => k.t).concat(["stones"]));

/** 新しい コースの ひな形。**そのまま 走れる もの**を 返す。 */
export function newCourse(id, name) {
  return {
    id: id || (MY_PREFIX + "n" + Math.random().toString(36).slice(2, 8)),
    name: name || "あたらしい コース",
    theme: "meadow", difficulty: 3,
    sections: [
      { t: "start", w: 18, len: 16 },
      { t: "path", len: 24, w: 12, wall: true },
      { t: "gate", limit: 12, gw: 7 },
      { t: "path", len: 22, w: 12 },
      { t: "checkpoint", w: 12 },
      { t: "path", len: 22, w: 12, wall: true },
      { t: "gate", limit: 12, gw: 7 },
      { t: "path", len: 20, w: 12 },
      { t: "finish" }
    ],
    updatedAt: 0
  };
}

/** buildCourse に 渡せる 形へ。 */
export function toDef(c) {
  return {
    id: c.id, name: c.name, difficulty: c.difficulty || 3, theme: c.theme || "meadow",
    seed: c.id, core: "自分で 作った コース",
    recommendedPlayers: [1, 8], estimatedDuration: 60,
    sections: c.sections
  };
}
