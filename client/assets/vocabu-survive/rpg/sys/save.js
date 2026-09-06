/* ══════════════════════════════════════════════════════════════════════════
   しまう・戻す。**端末の 中だけ**（IndexedDB が 使えれば そちら）。

   ★ 世界そのものは 種から 作り直せる ので しまわない。
     しまうのは「人が した こと」だけ ＝ 持ちもの・建てた もの・採った ところ・物語。
     これで 保存の 大きさが 世界の 広さに 関係なく なる。
   ★ localStorage は 4.4MB で 詰まる（本体で 実測ずみ）。
     大きく なりうる ので IndexedDB を 先に 試す。
   ══════════════════════════════════════════════════════════════════════════ */
const DB = "vqsurvive-rpg";
const STORE = "worlds";
const KEY_LS = "vq.rpg.save.";

function idb() {
  return new Promise((res) => {
    try {
      if (!self.indexedDB) return res(null);
      const q = indexedDB.open(DB, 1);
      q.onupgradeneeded = () => { try { q.result.createObjectStore(STORE); } catch (e) {} };
      q.onsuccess = () => res(q.result);
      q.onerror = () => res(null);
    } catch (e) { res(null); }
  });
}

export async function save(seed, data) {
  const j = JSON.stringify(data);
  const db = await idb();
  if (db) {
    try {
      await new Promise((res, rej) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(j, String(seed));
        tx.oncomplete = res; tx.onerror = () => rej(tx.error);
      });
      return { ok: true, どこ: "idb", 大: j.length };
    } catch (e) {}
  }
  try { localStorage.setItem(KEY_LS + seed, j); return { ok: true, どこ: "ls", 大: j.length }; }
  catch (e) { return { ok: false, 訳: "しまえませんでした（空きがありません）。" }; }
}

export async function load(seed) {
  const db = await idb();
  if (db) {
    try {
      const j = await new Promise((res) => {
        const tx = db.transaction(STORE, "readonly");
        const q = tx.objectStore(STORE).get(String(seed));
        q.onsuccess = () => res(q.result || null);
        q.onerror = () => res(null);
      });
      if (j) return JSON.parse(j);
    } catch (e) {}
  }
  try { const j = localStorage.getItem(KEY_LS + seed); return j ? JSON.parse(j) : null; }
  catch (e) { return null; }
}

export async function 一覧() {
  const out = [];
  const db = await idb();
  if (db) {
    try {
      const keys = await new Promise((res) => {
        const tx = db.transaction(STORE, "readonly");
        const q = tx.objectStore(STORE).getAllKeys();
        q.onsuccess = () => res(q.result || []);
        q.onerror = () => res([]);
      });
      for (const k of keys) out.push(Number(k));
    } catch (e) {}
  }
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(KEY_LS)) {
        const s = Number(k.slice(KEY_LS.length));
        if (!out.includes(s)) out.push(s);
      }
    }
  } catch (e) {}
  return out;
}

export async function 消す(seed) {
  const db = await idb();
  if (db) {
    try {
      await new Promise((res) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(String(seed));
        tx.oncomplete = res; tx.onerror = res;
      });
    } catch (e) {}
  }
  try { localStorage.removeItem(KEY_LS + seed); } catch (e) {}
}
