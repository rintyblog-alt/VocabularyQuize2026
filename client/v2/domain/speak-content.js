/* ══════════════════════════════════════════════════════════════════════
   VocabuSpeak — 教材の読み込み（§44）

   **教材を全部クライアントへ送らない。** 数万件あっても、
   いま要るぶんだけ取りに行く。

     /content/english/curriculum.json          … レベル・カテゴリー・レッスンの目次（小さい）
     /content/english/index/{level}/{cat}.json … 出題の候補だけの軽い索引
     /content/english/{level}/{cat}/{lesson}.json … 本体（英文・選択肢・正解）

   索引は 1 行が 6 個の値だけの配列にしてある。
   名前つきの JSON にすると同じ内容で 3 倍以上になるため。

     [variantId, atomId, familyId, activityType, lessonId, difficulty]

   レベルとカテゴリーは置き場所から分かるので、行には入れない。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var SM = VQ2.speakModel;
  if (!SM) throw new Error("VQ2.speakModel must be loaded before speak-content.js");

  var BASE = "/content/english";
  function str(v) { return v === undefined || v === null ? "" : String(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }

  /* 取ってきたものは覚えておく。同じレッスンを何度も取りに行かない。 */
  var cache = { curriculum: null, index: Object.create(null), lesson: Object.create(null) };
  var inflight = Object.create(null);

  function fetchJson(url) {
    if (inflight[url]) return inflight[url];
    var p = fetch(url, { credentials: "same-origin" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (j) { delete inflight[url]; return j; })
      .catch(function (e) { delete inflight[url]; throw e; });
    inflight[url] = p;
    return p;
  }

  /* ══════════════════════════════════════════════════════════════════
     1) 目次
     ══════════════════════════════════════════════════════════════════ */
  function curriculum() {
    if (cache.curriculum) return Promise.resolve(cache.curriculum);
    return fetchJson(BASE + "/curriculum.json").then(function (j) {
      cache.curriculum = normalizeCurriculum(j);
      return cache.curriculum;
    }).catch(function () {
      /* 教材がまだ置かれていない。**空のまま正直に返す**（作り話の目次を出さない）。 */
      cache.curriculum = { ok: false, categories: [], lessons: [], groups: [],
                           reason: "教材がまだ用意されていません。" };
      return cache.curriculum;
    });
  }

  function normalizeCurriculum(j) {
    var cats = arr(j && j.categories).map(function (c) {
      return {
        id: str(c.id), name: str(c.name), groupId: str(c.groupId),
        description: str(c.description),
        levels: arr(c.levels).map(str),
        lessonCount: Number(c.lessonCount) || 0,
        atomCount: Number(c.atomCount) || 0,
        variantCount: Number(c.variantCount) || 0
      };
    }).filter(function (c) { return c.id && c.name; });
    var groups = arr(j && j.groups).map(function (g) {
      return { id: str(g.id), name: str(g.name), order: Number(g.order) || 0 };
    });
    var lessons = arr(j && j.lessons).map(function (l) {
      return {
        id: str(l.id), title: str(l.title), categoryId: str(l.categoryId),
        level: str(l.level), unitId: str(l.unitId), order: Number(l.order) || 0,
        goals: arr(l.goals).map(str),
        expressions: arr(l.expressions).map(str),
        scenarioId: str(l.scenarioId) || undefined,
        atomCount: Number(l.atomCount) || 0,
        variantCount: Number(l.variantCount) || 0,
        estimatedMinutes: Number(l.estimatedMinutes) || 0
      };
    }).filter(function (l) { return l.id && l.categoryId && l.level; });
    return {
      ok: true,
      generatedAt: str(j && j.generatedAt),
      groups: groups.sort(function (a, b) { return a.order - b.order; }),
      categories: cats,
      lessons: lessons.sort(function (a, b) { return a.order - b.order; }),
      totals: isObj(j && j.totals) ? j.totals : {}
    };
  }

  function categoriesFor(levelId) {
    return curriculum().then(function (c) {
      if (!levelId) return c.categories;
      return c.categories.filter(function (x) { return !x.levels.length || x.levels.indexOf(levelId) >= 0; });
    });
  }
  function lessonsFor(o) {
    o = o || {};
    return curriculum().then(function (c) {
      return c.lessons.filter(function (l) {
        if (o.level && l.level !== o.level) return false;
        if (o.categoryId && l.categoryId !== o.categoryId) return false;
        return true;
      });
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     2) 索引（出題の候補）
     ══════════════════════════════════════════════════════════════════ */
  function indexOf(levelId, categoryId) {
    var key = str(levelId) + "/" + str(categoryId);
    if (cache.index[key]) return Promise.resolve(cache.index[key]);
    return fetchJson(BASE + "/index/" + key + ".json").then(function (j) {
      var rows = arr(j && j.rows).map(function (r) {
        return {
          id: str(r[0]), contentAtomId: str(r[1]), familyId: str(r[2]),
          activityType: str(r[3]), lessonId: str(r[4]),
          difficulty: Number(r[5]) || 3,
          level: str(levelId), categoryId: str(categoryId)
        };
      }).filter(function (r) { return r.id && r.contentAtomId; });
      cache.index[key] = rows;
      return rows;
    }).catch(function () { cache.index[key] = []; return []; });
  }

  /* 出題に使う候補をまとめて集める。**要るカテゴリーぶんだけ取りに行く**。 */
  function pool(o) {
    o = o || {};
    var levels = arr(o.levels).length ? arr(o.levels).map(str) : [str(o.level || "a1")];
    return curriculum().then(function (c) {
      var want = arr(o.categoryIds).map(str);
      var jobs = [];
      levels.forEach(function (lv) {
        /* **そのレベルに教材があるカテゴリーだけ**取りに行く。
           全カテゴリーを総当たりすると、無いぶんが 404 になって遅い（実測 3.8 秒）。 */
        c.categories.forEach(function (cat) {
          if (want.length && want.indexOf(cat.id) < 0) return;
          if (arr(cat.levels).length && arr(cat.levels).indexOf(lv) < 0) return;
          jobs.push(indexOf(lv, cat.id));
        });
      });
      return Promise.all(jobs).then(function (lists) {
        var out = [];
        lists.forEach(function (rows) { Array.prototype.push.apply(out, rows); });
        if (arr(o.activityTypes).length) {
          var ok = Object.create(null);
          arr(o.activityTypes).forEach(function (a) { ok[str(a)] = 1; });
          out = out.filter(function (r) { return ok[r.activityType]; });
        }
        if (str(o.lessonId)) out = out.filter(function (r) { return r.lessonId === str(o.lessonId); });
        return out;
      });
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     3) 本体（選ばれたぶんだけ取る）
     ══════════════════════════════════════════════════════════════════ */
  function lesson(levelId, categoryId, lessonId) {
    var key = str(levelId) + "/" + str(categoryId) + "/" + str(lessonId);
    if (cache.lesson[key]) return Promise.resolve(cache.lesson[key]);
    return fetchJson(BASE + "/" + key + ".json").then(function (j) {
      var data = {
        lesson: isObj(j && j.lesson) ? j.lesson : { id: str(lessonId) },
        atoms: arr(j && j.atoms).map(SM.normalizeAtom),
        variants: arr(j && j.variants).map(SM.normalizeVariant),
        dialogues: arr(j && j.dialogues)
      };
      cache.lesson[key] = data;
      return data;
    }).catch(function () {
      var empty = { lesson: { id: str(lessonId) }, atoms: [], variants: [], dialogues: [],
                    error: "このレッスンの教材を読み込めませんでした。" };
      return empty;
    });
  }

  /* 選ばれた候補（索引の行）を、実際の問題まで膨らませる。
     読み込めなかったものは **黙って落とさず** missing で返す。 */
  function hydrate(picks, o) {
    o = o || {};
    var need = Object.create(null);
    arr(picks).forEach(function (p) {
      var v = p.variant || p;
      var k = str(v.level) + "/" + str(v.categoryId) + "/" + str(v.lessonId);
      need[k] = 1;
    });
    var keys = Object.keys(need);
    return Promise.all(keys.map(function (k) {
      var s = k.split("/");
      return lesson(s[0], s[1], s[2]);
    })).then(function (loaded) {
      var atomById = Object.create(null), variantById = Object.create(null);
      loaded.forEach(function (d) {
        arr(d.atoms).forEach(function (a) { atomById[str(a.id)] = a; });
        arr(d.variants).forEach(function (v) { variantById[str(v.id)] = v; });
      });
      var out = [], missing = [];
      arr(picks).forEach(function (p) {
        var id = str(p.variantId || (p.variant && p.variant.id) || p.id);
        var v = variantById[id];
        var a = v ? atomById[str(v.contentAtomId)] : null;
        if (!v || !a) { missing.push({ variantId: id, reason: v ? "元の英文が見つかりません" : "出題データが見つかりません" }); return; }
        out.push({ variant: v, atom: a, reason: str(p.reason), pick: p });
      });
      return { items: out, missing: missing };
    });
  }

  /* 候補 → そのまま解ける問題（既存の renderer / evaluator が使う形）。 */
  function toQuestions(hydrated, o) {
    o = o || {};
    var out = [], dropped = [];
    arr(hydrated && hydrated.items).forEach(function (it) {
      var q = SM.toQuestion(it.variant, it.atom, o);
      if (!q) { dropped.push({ variantId: str(it.variant.id), reason: "この出し方はまだ画面で扱えません" }); return; }
      q.__speakReason = str(it.reason);
      out.push(q);
    });
    return { questions: out, dropped: dropped.concat(arr(hydrated && hydrated.missing)) };
  }

  function clearCache() {
    cache.curriculum = null;
    cache.index = Object.create(null);
    cache.lesson = Object.create(null);
  }

  /* テストや、教材を手元に持っているときのための差し込み口。
     ここを使うと fetch を通さずに同じ経路を試せる。 */
  function preload(o) {
    o = o || {};
    if (o.curriculum) cache.curriculum = normalizeCurriculum(o.curriculum);
    if (isObj(o.index)) Object.keys(o.index).forEach(function (k) {
      cache.index[k] = arr(o.index[k]).map(function (r) {
        var s = k.split("/");
        return Array.isArray(r)
          ? { id: str(r[0]), contentAtomId: str(r[1]), familyId: str(r[2]), activityType: str(r[3]),
              lessonId: str(r[4]), difficulty: Number(r[5]) || 3, level: s[0], categoryId: s[1] }
          : r;
      });
    });
    if (isObj(o.lessons)) Object.keys(o.lessons).forEach(function (k) {
      var d = o.lessons[k];
      cache.lesson[k] = {
        lesson: isObj(d.lesson) ? d.lesson : {},
        atoms: arr(d.atoms).map(SM.normalizeAtom),
        variants: arr(d.variants).map(SM.normalizeVariant),
        dialogues: arr(d.dialogues)
      };
    });
  }

  VQ2.speakContent = {
    BASE: BASE,
    curriculum: curriculum, categoriesFor: categoriesFor, lessonsFor: lessonsFor,
    indexOf: indexOf, pool: pool, lesson: lesson,
    hydrate: hydrate, toQuestions: toQuestions,
    preload: preload, clearCache: clearCache,
    _cache: cache
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
