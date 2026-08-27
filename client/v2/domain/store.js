/* ══════════════════════════════════════════════════════════════════════
   V2 ストア（§35 データ分離 / §7 自動保存・revision・競合検出）
   ・V2 のデータは専用キーに持つ。既存の wordPractice400.presets.v1 は
     「V1 へ映す」目的でのみ追記する。既存プリセットを書き換えない。
   ・すべてのレコードは ownerId を持ち、読み出しは現在の owner で必ず絞る。
   ・保存は revision で楽観ロックする。古い内容による上書きを検出して止める。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var S = VQ2.schema, A = VQ2.adapter, V = VQ2.validate, D = VQ2.draft;
  if (!S || !A || !V || !D) throw new Error("VQ2.schema / adapter / validate / draft must be loaded before store.js");

  var K = {
    presets:   "vq2.presets.v1",
    drafts:    "vq2.drafts.v1",         /* 編集中の一時保持（リロード復元用） */
    mocks:     "vq2.mocks.v1",
    quizzes:   "vq2.quizSessions.v1",
    mockSess:  "vq2.mockSessions.v1",
    results:   "vq2.results.v1",
    usage:     "vq2.usage.v1",
    artifacts: "vq2.artifacts.v1",
    presetChats: "vq2.presetChats.v1",  /* プリセットごとの AI との会話（消さない） */
    presetAttachments: "vq2.presetAttachments.v1"  /* プリセットごとの添付資料 */
  };
  var LEGACY_PRESETS_KEY = "wordPractice400.presets.v1";

  /* ── 保存件数の上限。localStorage を溢れさせないための自衛。 ── */
  var CAPS = { results: 200, quizzes: 40, mockSess: 20, usage: 500, drafts: 30,
    /* 下書き全体の最後の歯止め。種類ごとの枠（KIND_CAPS）を足した数より
       少し多めに取る。ここに当たるのは異常時だけ。 */
    draftsTotal: 60 };

  /* 下書きの種類ごとの枠。**人が書いたものと、自動保存を混ぜない。**
     混ぜると、生成のたびに走る自動保存が書きかけを押し出して消す。 */
  var KIND_CAPS = { _default: 12 };

  function nowIso() { return new Date().toISOString(); }

  /* ── 現在の利用者。ログインしていなければローカル専用の "local"。 ── */
  function currentOwnerId() {
    try {
      var raw = root.localStorage.getItem("app.auth.profile.v1");
      if (raw) {
        var p = JSON.parse(raw);
        var id = p && (p.uid || p.userId || p.id || p.username);
        if (id) return String(id);
      }
    } catch (e) {}
    return "local";
  }

  function readAll(key) {
    try {
      var raw = root.localStorage.getItem(key);
      if (!raw) return [];
      var a = JSON.parse(raw);
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }
  function writeAll(key, list) {
    try {
      root.localStorage.setItem(key, JSON.stringify(list));
      return { ok: true };
    } catch (e) {
      /* 容量超過。古いものを削って 1 度だけ再試行する。 */
      try {
        var trimmed = list.slice(0, Math.max(1, Math.floor(list.length / 2)));
        root.localStorage.setItem(key, JSON.stringify(trimmed));
        return { ok: true, trimmed: list.length - trimmed.length };
      } catch (e2) {
        return { ok: false, error: "STORAGE_FULL", message: "保存領域がいっぱいです。不要なデータを削除してください。" };
      }
    }
  }

  /* 自分のものだけを返す。他利用者のレコードには触れない。 */
  function mine(list, ownerId) {
    var me = ownerId || currentOwnerId();
    return list.filter(function (r) { return r && (r.ownerId === me || (!r.ownerId && me === "local")); });
  }

  function findIndexById(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return i;
    return -1;
  }

  /* ══════════════════════════════════════════════════════════════════
     Preset
     ══════════════════════════════════════════════════════════════════ */
  function listPresets(opts) {
    opts = opts || {};
    var me = opts.ownerId || currentOwnerId();
    var v2 = mine(readAll(K.presets), me);
    var seen = Object.create(null);
    v2.forEach(function (p) { seen[p.id] = true; });

    /* 既存 V1 プリセットも一覧に出す（読み取りのみ。変換はその場で行う） */
    var legacy = [];
    if (opts.includeLegacy !== false) {
      readAll(LEGACY_PRESETS_KEY).forEach(function (p) {
        if (!p || seen[p.id]) return;
        try {
          var c = A.presetToV2(p, { ownerId: me });
          c.__source = "legacy";
          legacy.push(c);
        } catch (e) {}
      });
    }
    return v2.concat(legacy);
  }

  function getPreset(id, opts) {
    var all = listPresets(opts);
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }

  /* 保存。baseRevision を渡すと、その間に他所で更新されていないかを確かめる。 */
  function savePreset(preset, opts) {
    opts = opts || {};
    var me = opts.ownerId || currentOwnerId();

    /* ── 保存直前の採番の確定 ────────────────────────────────────
       画面側でも採番しているが、そこを通らない経路（取り込み・復元・
       別画面からの保存）が残る。保存はここ 1 か所なので、番号と内部 ID の
       最終的な保証もここで行う。直したことは戻り値へ必ず出す。 */
    var numbering = null;
    if (preset && Array.isArray(preset.questions)) {
      var before = D.checkIdentity(preset.questions);
      if (!before.ok) {
        var rep = D.repairIdentity(preset.questions);
        preset = JSON.parse(JSON.stringify(preset));
        preset.questions = rep.questions;
        numbering = { repairedIds: rep.fixedIds, repairedNumbers: rep.fixedNumbers };
        /* 直しても重複が残るなら、途中の状態で書き込まない。 */
        var after = D.checkIdentity(preset.questions);
        if (!after.ok) {
          return { ok: false, error: "NUMBERING", issues: [],
                   message: "問題番号または内部 ID の重複を解消できませんでした。保存していません。",
                   identity: after };
        }
      } else {
        /* 番号を持たない問題（古いデータ）にだけ、いまの見え方のまま番号を焼き付ける。 */
        var need = preset.questions.some(function (q) {
          var n = Number(q && q.questionNumber);
          return !(isFinite(n) && Math.floor(n) === n && n > 0);
        });
        if (need) {
          preset = JSON.parse(JSON.stringify(preset));
          D.stampNumbers(preset.questions);
          numbering = { stamped: true };
        }
      }
    }

    var issues = V.validatePresetForSave(preset, opts.validate || {});
    if (!V.canSave(issues) && !opts.force) {
      return { ok: false, error: "VALIDATION", issues: issues, message: V.summarize(issues) };
    }

    var list = readAll(K.presets);
    var idx = findIndexById(list, preset.id);
    var existing = idx >= 0 ? list[idx] : null;

    /* 他利用者のレコードは上書きしない */
    if (existing && existing.ownerId && existing.ownerId !== me) {
      return { ok: false, error: "FORBIDDEN", issues: issues, message: "他の利用者のデータは変更できません。" };
    }

    /* 楽観ロック：読み込んだ時点の revision と食い違えば止める */
    if (existing && opts.baseRevision !== undefined && existing.revision !== opts.baseRevision) {
      return {
        ok: false, error: "CONFLICT", issues: issues,
        message: "別の場所でこのプリセットが更新されています。読み込み直してください。",
        currentRevision: existing.revision, yourRevision: opts.baseRevision,
        current: existing
      };
    }

    var rec = JSON.parse(JSON.stringify(preset));
    rec.ownerId = me;
    rec.schemaVersion = S.SCHEMA_VERSION;
    rec.revision = (existing ? (existing.revision || 0) : 0) + 1;
    rec.updatedAt = nowIso();
    if (!rec.createdAt) rec.createdAt = rec.updatedAt;
    delete rec.__source;

    if (idx >= 0) list[idx] = rec; else list.unshift(rec);
    var w = writeAll(K.presets, list);
    if (!w.ok) return { ok: false, error: w.error, issues: issues, message: w.message };

    /* V1 へ映す（既存 Quiz / Library がそのまま読めるようにする）。
       既存の V1 レコードは、同じ id のものだけを差し替える。他は触らない。 */
    var mirror = null;
    if (opts.mirrorToV1 !== false) {
      try {
        var v1list = readAll(LEGACY_PRESETS_KEY);
        var v1 = A.presetToV1(rec);
        var vi = findIndexById(v1list, v1.id);
        if (vi >= 0) v1list[vi] = v1; else v1list.unshift(v1);
        var mw = writeAll(LEGACY_PRESETS_KEY, v1list);
        mirror = mw.ok ? "ok" : "failed";
      } catch (e) { mirror = "failed"; }
    }

    clearDraft("preset", rec.id);
    return { ok: true, preset: rec, issues: issues, revision: rec.revision, mirroredToV1: mirror,
             numbering: numbering };
  }

  function deletePreset(id, opts) {
    opts = opts || {};
    var me = opts.ownerId || currentOwnerId();
    var list = readAll(K.presets);
    var idx = findIndexById(list, id);
    if (idx < 0) return { ok: false, error: "NOT_FOUND" };
    if (list[idx].ownerId && list[idx].ownerId !== me) return { ok: false, error: "FORBIDDEN" };
    list.splice(idx, 1);
    writeAll(K.presets, list);
    /* プリセットそのものを消したときだけ、そのプリセットの会話も消す。
       残しても二度と開けず、他のプリセットの会話を押し出すだけになる。 */
    clearChat(id);
    /* V1 側は消さない。利用者の既存データを V2 の操作で失わせないため。 */
    return { ok: true, keptInV1: true };
  }

  /* ══════════════════════════════════════════════════════════════════
     編集中の一時保持（自動保存 / リロード復元）
     ══════════════════════════════════════════════════════════════════ */
  function draftKey(kind, id) { return kind + ":" + id; }

  function saveDraft(kind, id, payload, meta) {
    var list = readAll(K.drafts);
    var key = draftKey(kind, id);
    var rec = {
      key: key, kind: kind, id: id, ownerId: currentOwnerId(),
      payload: payload, meta: meta || null, savedAt: nowIso()
    };
    var i = -1;
    for (var n = 0; n < list.length; n++) if (list[n] && list[n].key === key) { i = n; break; }
    if (i >= 0) list[i] = rec; else list.unshift(rec);

    /* ══ 種類ごとに枠を分ける（2026-08-05）══════════════════════════

       ここは以前、種類に関係なく先頭 30 件だけを残していた。
       そのため **自動保存が人の書きかけを押し出して消していた**。
       試験の自動保存は生成のたびに走るので、
       プリセットを書きかけのまま試験を数回作ると、書きかけが消える。

       いま溢れさせてよいのは「同じ種類の、古い自動保存」だけ。
       別の種類の下書きは、何件あっても押し出さない。 */
    var kept = [], perKind = {};
    for (var m = 0; m < list.length; m++) {
      var r = list[m];
      if (!r) continue;
      var k = String(r.kind || "");
      var cap = KIND_CAPS[k] || KIND_CAPS._default;
      perKind[k] = (perKind[k] || 0) + 1;
      if (perKind[k] <= cap) kept.push(r);
    }
    /* 全体の上限も残す（localStorage を溢れさせないための最後の歯止め）。
       ただし新しいものから順に残すので、いま保存したものは必ず残る。 */
    list = kept.slice(0, CAPS.draftsTotal);
    var w = writeAll(K.drafts, list);
    return { ok: w.ok, savedAt: rec.savedAt, error: w.error, message: w.message };
  }
  function loadDraft(kind, id) {
    var key = draftKey(kind, id), me = currentOwnerId();
    var list = readAll(K.drafts);
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].key === key && (list[i].ownerId === me || !list[i].ownerId)) return list[i];
    }
    return null;
  }
  function clearDraft(kind, id) {
    var key = draftKey(kind, id);
    var list = readAll(K.drafts).filter(function (r) { return !r || r.key !== key; });
    writeAll(K.drafts, list);
  }
  function listDrafts(kind) {
    var me = currentOwnerId();
    return readAll(K.drafts).filter(function (r) {
      return r && (r.ownerId === me || !r.ownerId) && (!kind || r.kind === kind);
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     プリセットごとの AI との会話

     ・下書き（drafts）とは別に持つ。下書きは保存すると消えるが、
       会話は保存しても閉じても残す。次に開いたときに前回の続きから読める。
     ・localStorage を溢れさせないよう、古い往復から落とす。
       落とすのは「古いもの」だけで、直近の会話は必ず残す。
     ══════════════════════════════════════════════════════════════════ */
  var CHAT_LIMITS = {
    turns: 80,          /* 1 プリセットにつき保持する発言数（利用者 + AI） */
    logsPerTurn: 300,   /* 1 回の生成で残す作業ログの行数 */
    streamChars: 1200,  /* 途中経過の本文は先頭だけ残す（再現に要らない） */
    presets: 60         /* 会話を持つプリセットの数 */
  };

  function trimChat(chat) {
    var list = Array.isArray(chat) ? chat : [];
    if (list.length > CHAT_LIMITS.turns) list = list.slice(list.length - CHAT_LIMITS.turns);
    return list.map(function (t) {
      if (!t || typeof t !== "object") return null;
      if (t.role === "user") return { role: "user", text: String(t.text || "").slice(0, 4000), at: t.at || null };
      var log = Array.isArray(t.log) ? t.log : [];
      if (log.length > CHAT_LIMITS.logsPerTurn) log = log.slice(log.length - CHAT_LIMITS.logsPerTurn);
      return {
        role: "ai", at: t.at || null,
        log: log.map(function (e) { return { kind: String(e.kind || "step"), text: String(e.text || "").slice(0, 600) }; }),
        text: String(t.text || "").slice(0, CHAT_LIMITS.streamChars),
        error: t.error ? String(t.error).slice(0, 600) : null,
        note: t.note ? String(t.note).slice(0, 600) : null,
        result: t.result || null       /* { count, applied } のような小さな要約だけ */
      };
    }).filter(Boolean);
  }

  /* ══════════════════════════════════════════════════════════════
     添付資料の持ち越し

     これまで添付はどこにも保存されず、画面を閉じると必ず消えていた
     （実測: st.attachments は開くたびに [] から始まる）。
     ここでプリセット単位に残す。ただし画像は base64 で重いので、
     入りきらないぶんは中身を捨てて「もう一度選んでください」の印だけ残す。
     嘘の「読み取り済み」を残さない。
     ══════════════════════════════════════════════════════════════ */
  var ATTACH_LIMITS = { presets: 8, bytesPerPreset: 3000000 };

  function payloadSize(a) {
    return String(a.imageBase64 || "").length + String(a.extractedText || "").length;
  }
  /* 入りきらない添付は、本文を落として「要再選択」にする（消さない） */
  function trimAttachments(list) {
    var out = [], used = 0;
    (list || []).forEach(function (a) {
      var n = payloadSize(a);
      if (used + n <= ATTACH_LIMITS.bytesPerPreset) {
        used += n; out.push(a); return;
      }
      var slim = {};
      for (var k in a) if (k !== "imageBase64" && k !== "extractedText" && k !== "pageBreakdown") slim[k] = a[k];
      slim.__dropped = true;
      out.push(slim);
    });
    return out;
  }

  /* 画面に出す情報から、その場かぎりのものを落として保存する。
     送信の進み具合（何個目まで送ったか）は開き直せば意味を失うので残さない。 */
  function slimDisplay(display) {
    return (display || []).map(function (d) {
      var o = {};
      for (var k in d) if (k !== "upload") o[k] = d[k];
      /* ページの点は多いので、保存は先頭 200 ページまでにする */
      if (o.pages && o.pages.length > 200) o.pages = o.pages.slice(0, 200);
      return o;
    });
  }

  function loadAttachments(presetId) {
    if (!presetId) return { attachments: [], display: [], meta: {} };
    var me = currentOwnerId();
    var list = readAll(K.presetAttachments);
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].presetId === presetId && (list[i].ownerId === me || !list[i].ownerId))
        return { attachments: list[i].attachments || [], display: list[i].display || [],
                 /* 置き場所の ID とページの読み取り結果。本体は入っていない。 */
                 meta: list[i].meta || {} };
    }
    return { attachments: [], display: [], meta: {} };
  }
  function saveAttachments(presetId, attachments, display, meta) {
    if (!presetId) return { ok: false, error: "NO_ID" };
    var me = currentOwnerId();
    var list = readAll(K.presetAttachments);
    var idx = -1;
    for (var i = 0; i < list.length; i++)
      if (list[i] && list[i].presetId === presetId && (list[i].ownerId === me || !list[i].ownerId)) { idx = i; break; }
    var rec = { presetId: presetId, ownerId: me,
                attachments: trimAttachments(attachments), display: slimDisplay(display),
                meta: meta || {},
                updatedAt: nowIso() };
    if (idx >= 0) list.splice(idx, 1);
    list.unshift(rec);
    if (list.length > ATTACH_LIMITS.presets) list = list.slice(0, ATTACH_LIMITS.presets);
    var w = writeAll(K.presetAttachments, list);
    return { ok: w.ok, error: w.error, message: w.message };
  }
  function clearAttachments(presetId) {
    var me = currentOwnerId();
    var list = readAll(K.presetAttachments).filter(function (r) {
      return !(r && r.presetId === presetId && (r.ownerId === me || !r.ownerId));
    });
    return writeAll(K.presetAttachments, list);
  }

  function loadChat(presetId) {
    if (!presetId) return [];
    var me = currentOwnerId();
    var list = readAll(K.presetChats);
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].presetId === presetId && (list[i].ownerId === me || !list[i].ownerId))
        return Array.isArray(list[i].chat) ? list[i].chat : [];
    }
    return [];
  }

  function saveChat(presetId, chat) {
    if (!presetId) return { ok: false, error: "NO_ID" };
    var me = currentOwnerId();
    var list = readAll(K.presetChats);
    var idx = -1;
    for (var i = 0; i < list.length; i++)
      if (list[i] && list[i].presetId === presetId && (list[i].ownerId === me || !list[i].ownerId)) { idx = i; break; }
    var rec = { presetId: presetId, ownerId: me, chat: trimChat(chat), updatedAt: nowIso() };
    if (idx >= 0) list.splice(idx, 1);
    list.unshift(rec);                       /* 直近に触ったものを先頭へ。溢れたら古いほうから落ちる */
    if (list.length > CHAT_LIMITS.presets) list = list.slice(0, CHAT_LIMITS.presets);
    var w = writeAll(K.presetChats, list);
    return { ok: w.ok, error: w.error, message: w.message, trimmed: w.trimmed || 0 };
  }

  function clearChat(presetId) {
    var me = currentOwnerId();
    writeAll(K.presetChats, readAll(K.presetChats).filter(function (r) {
      return !(r && r.presetId === presetId && (r.ownerId === me || !r.ownerId));
    }));
    return { ok: true };
  }

  /* ══════════════════════════════════════════════════════════════════
     汎用レコード（Mock / Session / Result / Usage / Artifact）
     ══════════════════════════════════════════════════════════════════ */
  function makeCollection(key, cap) {
    return {
      list: function (opts) { return mine(readAll(key), opts && opts.ownerId); },
      get: function (id) {
        var l = mine(readAll(key));
        for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
        return null;
      },
      put: function (rec, opts) {
        opts = opts || {};
        var me = opts.ownerId || currentOwnerId();
        var list = readAll(key);
        var idx = findIndexById(list, rec.id);
        var existing = idx >= 0 ? list[idx] : null;
        if (existing && existing.ownerId && existing.ownerId !== me)
          return { ok: false, error: "FORBIDDEN", message: "他の利用者のデータは変更できません。" };
        if (existing && opts.baseRevision !== undefined && existing.revision !== opts.baseRevision)
          return { ok: false, error: "CONFLICT", currentRevision: existing.revision, current: existing,
                   message: "別の場所で更新されています。読み込み直してください。" };
        var out = JSON.parse(JSON.stringify(rec));
        out.ownerId = me;
        out.revision = (existing ? (existing.revision || 0) : 0) + 1;
        out.updatedAt = nowIso();
        if (!out.createdAt) out.createdAt = out.updatedAt;
        if (idx >= 0) list[idx] = out; else list.unshift(out);
        if (cap && list.length > cap) list = list.slice(0, cap);
        var w = writeAll(key, list);
        return w.ok ? { ok: true, record: out, revision: out.revision } : { ok: false, error: w.error, message: w.message };
      },
      remove: function (id, opts) {
        var me = (opts && opts.ownerId) || currentOwnerId();
        var list = readAll(key);
        var idx = findIndexById(list, id);
        if (idx < 0) return { ok: false, error: "NOT_FOUND" };
        if (list[idx].ownerId && list[idx].ownerId !== me) return { ok: false, error: "FORBIDDEN" };
        list.splice(idx, 1);
        writeAll(key, list);
        return { ok: true };
      },
      clearMine: function () {
        var me = currentOwnerId();
        writeAll(key, readAll(key).filter(function (r) { return r && r.ownerId && r.ownerId !== me; }));
        return { ok: true };
      }
    };
  }

  var mocks    = makeCollection(K.mocks);
  var quizzes  = makeCollection(K.quizzes, CAPS.quizzes);
  var mockSess = makeCollection(K.mockSess, CAPS.mockSess);
  var results  = makeCollection(K.results, CAPS.results);
  var artifacts= makeCollection(K.artifacts, 60);

  /* ══════════════════════════════════════════════════════════════════
     AIUsageEvent（§34）
     ・計測だけを行う。残量や上限は表示しない（正式な制限値がまだ無いため）。
     ══════════════════════════════════════════════════════════════════ */
  function recordUsage(ev) {
    if (!ev || S.USAGE_EVENT_TYPES.indexOf(ev.eventType) < 0) return { ok: false, error: "BAD_EVENT_TYPE" };
    var rec = {
      id: S.newId("usage"),
      userId: currentOwnerId(),
      ownerId: currentOwnerId(),
      plan: ev.plan || "unknown",
      eventType: ev.eventType,
      mode: ev.mode || null,
      startedAt: ev.startedAt || nowIso(),
      completedAt: ev.completedAt || nowIso(),
      durationMs: typeof ev.durationMs === "number" ? ev.durationMs : null,
      inputBytes: ev.inputBytes || 0,
      pageCount: ev.pageCount || 0,
      imageCount: ev.imageCount || 0,
      questionCount: ev.questionCount || 0,
      modelCalls: ev.modelCalls || 0,
      compileAttempts: ev.compileAttempts || 0,
      status: ev.status || "completed",
      cancelled: ev.cancelled === true,
      estimatedComputeUnits: typeof ev.estimatedComputeUnits === "number"
        ? ev.estimatedComputeUnits : estimateComputeUnits(ev)
    };
    var list = readAll(K.usage);
    list.unshift(rec);
    if (list.length > CAPS.usage) list = list.slice(0, CAPS.usage);
    writeAll(K.usage, list);
    return { ok: true, record: rec };
  }

  /* 計算量の目安。課金には使わない。重い生成と普通の会話を区別するための相対値。 */
  function estimateComputeUnits(ev) {
    var u = 0;
    u += (ev.modelCalls || 0) * 1;
    u += (ev.pageCount || 0) * 0.2;
    u += (ev.imageCount || 0) * 0.5;
    u += (ev.compileAttempts || 0) * 0.5;
    u += (ev.questionCount || 0) * 0.05;
    u += ((ev.durationMs || 0) / 60000) * 0.5;
    return Math.round(u * 100) / 100;
  }

  function usageSummary(opts) {
    opts = opts || {};
    var me = currentOwnerId();
    var list = readAll(K.usage).filter(function (r) { return r && r.userId === me; });
    if (opts.sinceIso) list = list.filter(function (r) { return r.startedAt >= opts.sinceIso; });
    var byType = Object.create(null);
    var total = { events: list.length, modelCalls: 0, computeUnits: 0, durationMs: 0 };
    list.forEach(function (r) {
      var t = byType[r.eventType] || (byType[r.eventType] = { events: 0, modelCalls: 0, computeUnits: 0, durationMs: 0 });
      t.events++; t.modelCalls += r.modelCalls || 0; t.computeUnits += r.estimatedComputeUnits || 0; t.durationMs += r.durationMs || 0;
      total.modelCalls += r.modelCalls || 0; total.computeUnits += r.estimatedComputeUnits || 0; total.durationMs += r.durationMs || 0;
    });
    total.computeUnits = Math.round(total.computeUnits * 100) / 100;
    return { total: total, byType: byType };
  }

  VQ2.store = {
    KEYS: K,
    LEGACY_PRESETS_KEY: LEGACY_PRESETS_KEY,
    currentOwnerId: currentOwnerId,
    listPresets: listPresets,
    getPreset: getPreset,
    savePreset: savePreset,
    deletePreset: deletePreset,
    saveDraft: saveDraft,
    loadDraft: loadDraft,
    clearDraft: clearDraft,
    listDrafts: listDrafts,
    loadChat: loadChat,
    saveChat: saveChat,
    loadAttachments: loadAttachments,
    saveAttachments: saveAttachments,
    clearAttachments: clearAttachments,
    ATTACH_LIMITS: ATTACH_LIMITS,
    clearChat: clearChat,
    CHAT_LIMITS: CHAT_LIMITS,
    mocks: mocks,
    quizzes: quizzes,
    mockSessions: mockSess,
    results: results,
    artifacts: artifacts,
    recordUsage: recordUsage,
    usageSummary: usageSummary,
    estimateComputeUnits: estimateComputeUnits,
    _readAll: readAll,
    _writeAll: writeAll
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
