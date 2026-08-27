/* ══════════════════════════════════════════════════════════════════════
   AI の仕事の台帳（AIJob）

   これまでは「いま動いている 1 件」しか覚えていなかったので、
   ・画面を閉じると何をしていたか分からない
   ・失敗した場所からやり直せない
   ・途中まで作れたものが消える
   という状態だった。

   ここでは 1 回の生成を **1 件の仕事** として記録する。

   ・状態 … 待ち / 実行中 / 人の判断待ち / 完了 / 失敗 / 取り消し
   ・段   … いまどこまで進んだか（段ごとに途中結果を残す）
   ・途中結果 … 失敗しても捨てない。次はここから続ける
   ・二重送信 … 同じ操作を 2 回押しても 1 件にする（startKey）
   ・偽の進捗は作らない。**実際に届いた段の数**からしか進捗を出さない

   通信そのものは これまでどおり `VQ2.ai`（Bridge へのストリーミング）が行う。
   ここは「何をしていて、どこまで進んで、何が残っているか」だけを持つ。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});

  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function str(v) { return v === undefined || v === null ? "" : String(v); }
  function nowIso() { return new Date().toISOString(); }

  var KEY = "vq2.aijobs.v1";
  var CAP = 40;

  var TYPES = {
    preset_generation:        "プリセットを作る",
    preset_repair:            "問題を直す",
    mock_blueprint:           "試験の構成案を作る",
    mock_question_generation: "試験の問題を作る",
    mock_validation:          "試験を検証する",
    mock_layout:              "紙面を作る",
    essay_evaluation:         "記述を採点する",
    other:                    "AI の処理"
  };
  var STATUS = {
    queued:          "待っています",
    running:         "作っています",
    waiting_for_user:"確認をお待ちしています",
    completed:       "できました",
    failed:          "失敗しました",
    cancelled:       "取り消しました"
  };
  function typeLabel(t) { return TYPES[str(t)] || TYPES.other; }
  function statusLabel(s) { return STATUS[str(s)] || str(s); }

  function owner() {
    try { if (VQ2.store && VQ2.store.currentOwnerId) return VQ2.store.currentOwnerId(); } catch (e) {}
    return "local";
  }
  function readAll() {
    try {
      var v = JSON.parse(root.localStorage.getItem(KEY) || "[]");
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }
  function writeAll(list) {
    try { root.localStorage.setItem(KEY, JSON.stringify(list.slice(0, CAP))); return true; }
    catch (e) { return false; }
  }
  function newId() { return "aij_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  var listeners = [];
  function emit(job) {
    listeners.slice().forEach(function (fn) { try { fn(job); } catch (e) {} });
  }
  function onChange(fn) {
    listeners.push(fn);
    return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
  }

  function list(f) {
    f = f || {};
    var me = owner();
    var out = readAll().filter(function (j) { return j && j.userId === me; });
    if (f.status) out = out.filter(function (j) { return j.status === f.status; });
    if (f.jobType) out = out.filter(function (j) { return j.jobType === f.jobType; });
    if (f.active) out = out.filter(function (j) {
      return j.status === "running" || j.status === "queued" || j.status === "waiting_for_user";
    });
    return out;
  }
  function get(id) {
    var l = readAll();
    for (var i = 0; i < l.length; i++) if (l[i] && l[i].id === str(id)) return l[i];
    return null;
  }
  function save(job) {
    var l = readAll();
    var i = -1;
    for (var k = 0; k < l.length; k++) if (l[k] && l[k].id === job.id) { i = k; break; }
    job.updatedAt = nowIso();
    if (i >= 0) l[i] = job; else l.unshift(job);
    writeAll(l);
    emit(job);
    syncPush(job);
    return job;
  }

  /* ══════════════════════════════════════════════════════════════════
     台帳をサーバへも置く（AI Activity の共通台帳）

     端末の中だけに置いていると
       ・別の端末から様子が見られない
       ・ブラウザを消すと、途中まで作れたものの行方が分からない
     ということになる。そこで **同じ内容をサーバの台帳へも写す**。

     写すのは進み具合と実績だけ。資料の本文・会話・プロンプトは送らない
     （途中結果の問題文だけは「捨てない」ために送る。サーバ側で大きさを見る）。

     ここが落ちても生成は止めない。**写しは付け足しであって、本体ではない。**
     ログインしていないとき・通信が届かないときは、今までどおり端末の中だけで動く。

     送りすぎない。1 件につき最短 1.2 秒の間隔を空け、
     終わり（完了・失敗・取り消し）だけは待たずにすぐ送る。
     ══════════════════════════════════════════════════════════════════ */
  var SYNC_MIN_MS = 1200;
  var syncOn = true;
  var syncState = {};                 /* jobId -> {remoteId, at, timer, pending, sending} */
  var syncStats = { pushed: 0, failed: 0, pulled: 0 };

  function apiBase() {
    try {
      if (root.API_BASE) return String(root.API_BASE);
      if (root.CONFIG && root.CONFIG.apiBase) return String(root.CONFIG.apiBase);
    } catch (e) {}
    return "";
  }
  function authHeader() {
    try {
      var t = root.localStorage.getItem("app.auth.token.v1");
      return t ? { Authorization: "Bearer " + String(t).replace(/^"|"$/g, "") } : null;
    } catch (e) { return null; }
  }
  function post(path, body) {
    var h = authHeader();
    if (!h || !root.fetch) return Promise.reject(new Error("NO_AUTH"));
    return root.fetch(apiBase() + path, {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json" }, h),
      body: JSON.stringify(body)
    }).then(function (r) { return r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status)); });
  }
  function getJson(path) {
    var h = authHeader();
    if (!h || !root.fetch) return Promise.reject(new Error("NO_AUTH"));
    return root.fetch(apiBase() + path, { headers: Object.assign({ Accept: "application/json" }, h) })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status)); });
  }

  /* 画面の段（名前の並び）を、台帳の段（状態つき）へ写す。 */
  function stagesOf(j) {
    var steps = arr(j.steps);
    if (!steps.length) return [];
    var doneList = arr(j.doneSteps);
    return steps.map(function (name) {
      var st = "pending";
      if (doneList.indexOf(name) >= 0) st = "done";
      else if (j.currentStep === name) st = "running";
      return { id: name, label: name, state: st };
    });
  }
  function isFinished(s) {
    return s === "completed" || s === "failed" || s === "cancelled";
  }
  function syncPush(job) {
    if (!syncOn || !job || !job.id) return;
    if (!authHeader()) return;                    /* ログインしていなければ端末の中だけ */
    var st = syncState[job.id] || (syncState[job.id] = { remoteId: null, at: 0, timer: null, pending: null, sending: false });
    st.pending = job;
    var now = Date.now();
    var urgent = isFinished(job.status);
    if (st.timer) { root.clearTimeout(st.timer); st.timer = null; }
    var wait = urgent ? 0 : Math.max(0, SYNC_MIN_MS - (now - st.at));
    st.timer = root.setTimeout(function () { st.timer = null; syncFlush(job.id); }, wait);
  }
  function syncFlush(id) {
    var st = syncState[id];
    if (!st || st.sending || !st.pending) return;
    var j = st.pending;
    st.pending = null; st.sending = true; st.at = Date.now();

    var finish = function () { st.sending = false; if (st.pending) syncFlush(id); };
    var okDone = function () { syncStats.pushed++; finish(); };
    var okFail = function () { syncStats.failed++; finish(); };

    if (!st.remoteId) {
      post("/api/aijob/start", {
        type: j.jobType, title: j.title,
        /* 二重生成をサーバでも止める。鍵が無い仕事は、この端末の ID を鍵にする
           （同じ仕事を 2 回送っても 1 件になる）。 */
        idempotencyKey: j.startKey || ("local:" + j.id),
        stages: stagesOf(j), planned: (j.counts && j.counts.total) || 0,
        executor: "bridge", inputReference: j.inputReference || ""
      }).then(function (r) {
        st.remoteId = r && r.job && r.job.jobId;
        if (!st.remoteId) return okFail();
        return syncSend(st, j).then(okDone, okFail);
      }, okFail);
      return;
    }
    syncSend(st, j).then(okDone, okFail);
  }
  function syncSend(st, j) {
    var body = {
      jobId: st.remoteId,
      status: j.status,
      currentStage: j.currentStep || "",
      stages: stagesOf(j),
      made: (j.counts && j.counts.done) || 0,
      planned: (j.counts && j.counts.total) || 0,
      partial: j.partial === undefined ? undefined : j.partial,
      retryCount: j.retryCount || 0
    };
    if (j.status === "cancelled") return post("/api/aijob/cancel", { jobId: st.remoteId });
    if (isFinished(j.status)) {
      return post("/api/aijob/finish", Object.assign({}, body, {
        status: j.status === "completed" ? "completed"
          : ((j.partial && arr(j.partial.questions).length) ? "partial" : "failed"),
        outputReference: j.outputReference || "",
        error: j.errorCode ? { code: j.errorCode, message: j.errorMessage || "" } : undefined
      }));
    }
    return post("/api/aijob/update", body);
  }

  /* 別の端末で始まった仕事を取り込む。**上書きはしない**（読むだけ）。
     手元にある仕事はそのまま。無いものだけ足す。 */
  function syncPull(o) {
    o = o || {};
    if (!authHeader()) return Promise.resolve({ ok: false, error: "NO_AUTH" });
    return getJson("/api/aijob/list?limit=" + (o.limit || 20) + (o.live ? "&live=1" : ""))
      .then(function (r) {
        var jobs = arr(r && r.jobs);
        var mine = readAll();
        var known = {};
        Object.keys(syncState).forEach(function (k) {
          if (syncState[k].remoteId) known[syncState[k].remoteId] = 1;
        });
        var added = 0;
        jobs.forEach(function (rj) {
          if (!rj || known[rj.jobId]) return;
          /* この端末で作ったものは、鍵で見分けて二重に足さない。 */
          var localish = /^local:/.test(String(rj.idempotencyKey || ""));
          if (localish) return;
          var exists = mine.filter(function (x) { return x && x.remoteId === rj.jobId; })[0];
          if (exists) return;
          mine.unshift({
            id: newId(), userId: owner(), remoteId: rj.jobId,
            jobType: rj.type, title: rj.title || typeLabel(rj.type),
            status: rj.status, startKey: null,
            steps: arr(rj.stages).map(function (s) { return s.id; }),
            currentStep: rj.currentStage || null,
            doneSteps: arr(rj.stages).filter(function (s) { return s.state === "done"; })
              .map(function (s) { return s.id; }),
            progress: rj.progress || 0,
            counts: rj.planned ? { done: rj.made || 0, total: rj.planned } : null,
            partial: rj.partial || null,
            inputReference: rj.inputReference || null,
            outputReference: rj.outputReference || null,
            bridgeJobId: null,
            errorCode: (rj.error && rj.error.code) || null,
            errorMessage: (rj.error && rj.error.message) || null,
            userMessage: null, retryCount: rj.retryCount || 0, retryFrom: null,
            cancellable: false, fromOtherDevice: true,
            createdAt: new Date(rj.createdAt || Date.now()).toISOString(),
            startedAt: rj.startedAt ? new Date(rj.startedAt).toISOString() : null,
            completedAt: rj.completedAt ? new Date(rj.completedAt).toISOString() : null,
            updatedAt: new Date(rj.updatedAt || Date.now()).toISOString()
          });
          added++;
        });
        if (added) { writeAll(mine); emit(null); }
        syncStats.pulled += added;
        return { ok: true, added: added, total: jobs.length };
      }, function (e) { return { ok: false, error: String(e && e.message || e) }; });
  }

  /* ══════════════════════════════════════════════════════════════════
     はじめる
     ・startKey が同じ仕事が動いていれば、新しく作らずそれを返す（二重送信対策）。
     ══════════════════════════════════════════════════════════════════ */
  function start(o) {
    o = o || {};
    var key = str(o.startKey);
    if (key) {
      var dup = list({ active: true }).filter(function (j) { return j.startKey === key; })[0];
      if (dup) return { job: dup, duplicated: true };
    }
    var job = {
      id: newId(),
      userId: owner(),
      jobType: TYPES[str(o.jobType)] ? str(o.jobType) : "other",
      title: str(o.title) || typeLabel(o.jobType),
      status: "queued",
      startKey: key || null,
      steps: arr(o.steps).map(str),
      currentStep: null,
      doneSteps: [],
      /* 進捗は「届いた段の数 ÷ 予定の段の数」だけで出す。
         時間から推測した偽の進捗は作らない。 */
      progress: 0,
      counts: null,                 /* {done, total} 実際に数えられるときだけ */
      partial: null,                /* 途中まで作れたもの（捨てない） */
      inputReference: o.inputReference || null,
      outputReference: null,
      bridgeJobId: null,
      errorCode: null,
      errorMessage: null,
      userMessage: null,
      retryCount: 0,
      retryFrom: null,
      cancellable: true,
      createdAt: nowIso(),
      startedAt: null,
      completedAt: null,
      updatedAt: nowIso()
    };
    save(job);
    return { job: job, duplicated: false };
  }

  function running(id, patch) {
    var j = get(id);
    if (!j) return null;
    if (j.status !== "running") { j.status = "running"; j.startedAt = j.startedAt || nowIso(); }
    Object.keys(patch || {}).forEach(function (k) { j[k] = patch[k]; });
    return save(j);
  }

  /* 段が進んだ。進捗はここでしか動かない。 */
  function step(id, name, o) {
    o = o || {};
    var j = get(id);
    if (!j) return null;
    var n = str(name);
    if (n && j.doneSteps.indexOf(n) < 0 && j.currentStep && j.currentStep !== n) {
      j.doneSteps.push(j.currentStep);
    }
    j.currentStep = n || j.currentStep;
    if (j.status === "queued") { j.status = "running"; j.startedAt = j.startedAt || nowIso(); }
    if (o.counts && isNum(o.counts.done) && isNum(o.counts.total) && o.counts.total > 0) {
      j.counts = { done: o.counts.done, total: o.counts.total };
      j.progress = Math.max(0, Math.min(1, o.counts.done / o.counts.total));
    } else if (j.steps.length) {
      var idx = j.steps.indexOf(j.currentStep);
      j.progress = idx < 0 ? j.progress : Math.max(0, Math.min(1, idx / j.steps.length));
    }
    if (o.partial !== undefined) j.partial = o.partial;
    if (o.bridgeJobId) j.bridgeJobId = str(o.bridgeJobId);
    if (o.userMessage !== undefined) j.userMessage = o.userMessage;
    return save(j);
  }

  /* 途中まで作れたものを残す。失敗してもここは消さない。 */
  function keepPartial(id, partial, o) {
    var j = get(id);
    if (!j) return null;
    j.partial = partial;
    if (o && o.counts) j.counts = o.counts;
    return save(j);
  }

  function waitUser(id, message) {
    var j = get(id);
    if (!j) return null;
    j.status = "waiting_for_user";
    j.userMessage = str(message) || "確認をお願いします。";
    return save(j);
  }

  function done(id, o) {
    o = o || {};
    var j = get(id);
    if (!j) return null;
    j.status = "completed";
    j.progress = 1;
    j.completedAt = nowIso();
    j.currentStep = null;
    if (o.outputReference !== undefined) j.outputReference = o.outputReference;
    if (o.partial !== undefined) j.partial = o.partial;
    if (o.counts) j.counts = o.counts;
    j.userMessage = str(o.message) || null;
    j.errorCode = null; j.errorMessage = null;
    /* 終わった仕事の再開材料は残さない（「続きから」に完了済みを出さない）。
       失敗・取り消しのときは **消さない**。そこから続けるためにある。 */
    if (o.keepResume !== true) clearResume(j.id);
    return save(j);
  }

  /* 失敗。**途中まで作れたものは残す。** どこから直せるかも残す。 */
  function fail(id, err, o) {
    o = o || {};
    var j = get(id);
    if (!j) return null;
    j.status = "failed";
    j.completedAt = nowIso();
    j.errorCode = str(o.code || (err && err.code) || "UNKNOWN");
    j.errorMessage = str(o.message || (err && err.message) || "");
    j.userMessage = str(o.userMessage) || friendly(j);
    j.retryFrom = j.currentStep || (j.doneSteps.length ? j.doneSteps[j.doneSteps.length - 1] : null);
    if (o.partial !== undefined) j.partial = o.partial;
    return save(j);
  }

  function cancel(id) {
    var j = get(id);
    if (!j) return null;
    if (j.status === "completed") return j;
    j.status = "cancelled";
    j.completedAt = nowIso();
    j.userMessage = "取り消しました。ここまでに作れた分は残っています。";
    try { if (VQ2.ai && VQ2.ai.cancel) VQ2.ai.cancel(); } catch (e) {}
    return save(j);
  }

  /* やり直す。前の仕事の途中結果を引き継ぐ（最初からやり直させない）。 */
  function retry(id, o) {
    o = o || {};
    var prev = get(id);
    if (!prev) return null;
    var r = start({
      jobType: prev.jobType, title: prev.title, steps: prev.steps,
      inputReference: prev.inputReference,
      startKey: prev.startKey ? prev.startKey + ":retry" + (prev.retryCount + 1) : null
    });
    var j = r.job;
    j.retryCount = prev.retryCount + 1;
    j.partial = o.keepPartial === false ? null : prev.partial;
    j.doneSteps = o.fromStart ? [] : prev.doneSteps.slice();
    j.retryFrom = o.fromStart ? null : prev.retryFrom;
    j.counts = o.fromStart ? null : prev.counts;
    save(j);
    return j;
  }

  /* 人へ見せる言葉。技術的な文言や積み上げは出さない。 */
  function friendly(j) {
    var got = j.counts && isNum(j.counts.done) ? j.counts.done : (arr(j.partial && j.partial.questions).length || 0);
    var want = j.counts && isNum(j.counts.total) ? j.counts.total : 0;
    var code = str(j.errorCode);
    var head = code === "TIMEOUT" ? "時間内に終わりませんでした。"
      : code === "PROVIDER_MISSING" ? "AI につながりませんでした。"
      : code === "BUSY" ? "別の生成が動いています。"
      : code === "CANCELLED" ? "取り消しました。"
      : "うまく作れませんでした。";
    if (got > 0) {
      return head + " できた " + got + " 問は残しています。"
        + (want > got ? "足りない " + (want - got) + " 問だけ作り直せます。" : "");
    }
    return head + " もう一度お試しください。";
  }

  /* 画面を閉じて戻ってきたとき、続けられる仕事を返す。 */
  function resumable() {
    return list({}).filter(function (j) {
      return j.status === "running" || j.status === "waiting_for_user" || j.status === "failed";
    }).slice(0, 5);
  }
  /* 開いたまま端末が落ちた仕事は「実行中」のまま残る。
     戻ってきた時点で動いていなければ、失敗として扱い直す（動いているふりをしない）。 */
  function reconcile() {
    var n = 0;
    list({ status: "running" }).forEach(function (j) {
      var alive = false;
      try { alive = !!(VQ2.ai && VQ2.ai.isRunning && VQ2.ai.isRunning()); } catch (e) {}
      if (alive) return;
      fail(j.id, null, { code: "INTERRUPTED", message: "画面を離れたため止まりました",
                         userMessage: "途中で止まりました。ここまでに作れた分は残っています。" });
      n++;
    });
    return n;
  }

  /* ══════════════════════════════════════════════════════════════════
     続きから再開するための材料（§47）

     仕組みを新しく作らない。**すでにある** store の下書き置き場
     （saveDraft / loadDraft / listDrafts / clearDraft）へ繋ぐだけ。
     台帳（この JSON）は軽いまま保ち、重い中身（生成条件・解析状態・
     生成済みの問題）は下書き側へ置く。
     ══════════════════════════════════════════════════════════════════ */
  var RESUME_KIND = "aijob";
  /* 再開の材料は新しいものから 5 件まで。
     下書き置き場は編集中のプリセットと同居していて上限がある。
     生成のたびに 1 件ずつ積むと、**編集中の下書きを押し出す**。 */
  var RESUME_CAP = 5;
  function trimResumes(ST) {
    var mine = ST.listDrafts(RESUME_KIND).slice().sort(function (a, b) {
      return String(b.savedAt || "").localeCompare(String(a.savedAt || ""));
    });
    for (var i = RESUME_CAP; i < mine.length; i++) ST.clearDraft(RESUME_KIND, mine[i].id);
    return Math.max(0, mine.length - RESUME_CAP);
  }
  function store_() {
    var ST = VQ2.store;
    return ST && ST.saveDraft && ST.loadDraft && ST.listDrafts && ST.clearDraft ? ST : null;
  }
  /* 台帳の側には「どこに材料があるか」だけを書く。 */
  function saveResume(id, payload) {
    var ST = store_();
    if (!ST) return { ok: false, error: "NO_STORE" };
    var j = get(id);
    if (!j) return { ok: false, error: "NOT_FOUND" };
    var r = ST.saveDraft(RESUME_KIND, str(id), payload, {
      jobType: j.jobType, title: j.title, status: j.status,
      currentStep: j.currentStep, counts: j.counts
    });
    if (r.ok && (!j.inputReference || j.inputReference.kind !== RESUME_KIND)) {
      j.inputReference = { kind: RESUME_KIND, id: str(id) };
      save(j);
    }
    if (r.ok) r.dropped = trimResumes(ST);
    return r;
  }
  function loadResume(id) {
    var ST = store_();
    if (!ST) return null;
    var d = ST.loadDraft(RESUME_KIND, str(id));
    return d ? d.payload : null;
  }
  function clearResume(id) {
    var ST = store_();
    if (!ST) return { ok: false, error: "NO_STORE" };
    ST.clearDraft(RESUME_KIND, str(id));
    return { ok: true };
  }
  /* 続けられる仕事と、その材料を突き合わせて返す。
     材料が無い仕事は resume: null で返す（**あるふりをしない**）。 */
  function resumeEntries() {
    var ST = store_();
    var by = {};
    if (ST) ST.listDrafts(RESUME_KIND).forEach(function (d) { if (d && d.id) by[d.id] = d; });
    return resumable().map(function (j) {
      var d = by[j.id] || null;
      return { job: j, resume: d ? d.payload : null, savedAt: d ? d.savedAt : null };
    });
  }

  function remove(id) {
    writeAll(readAll().filter(function (j) { return !j || j.id !== str(id); }));
    clearResume(id);
    return { ok: true };
  }
  function clearFinished() {
    var drop = readAll().filter(function (j) {
      return !(j && (j.status === "running" || j.status === "queued" || j.status === "waiting_for_user"));
    });
    writeAll(readAll().filter(function (j) {
      return j && (j.status === "running" || j.status === "queued" || j.status === "waiting_for_user");
    }));
    drop.forEach(function (j) { if (j && j.id) clearResume(j.id); });
    return { ok: true };
  }
  function clearAll() {
    readAll().forEach(function (j) { if (j && j.id) clearResume(j.id); });
    writeAll([]);
    return { ok: true };
  }

  /* ══════════════════════════════════════════════════════════════════
     `VQ2.ai` の呼び出しを 1 件の仕事として包む
     ・段は Bridge から届いた activity をそのまま使う（作らない）。
     ・途中結果は onPartial で受けて残す。
     ══════════════════════════════════════════════════════════════════ */
  function track(o, fn) {
    o = o || {};
    var r = start(o);
    if (r.duplicated) return Promise.resolve({ job: r.job, duplicated: true });
    var job = r.job;
    running(job.id, {});
    var api = {
      id: job.id,
      step: function (name, opt) { return step(job.id, name, opt); },
      partial: function (p, opt) { return keepPartial(job.id, p, opt); },
      counts: function (doneN, total) { return step(job.id, null, { counts: { done: doneN, total: total } }); },
      bridge: function (bid) { return step(job.id, null, { bridgeJobId: bid }); }
    };
    return Promise.resolve()
      .then(function () { return fn(api); })
      .then(function (out) {
        done(job.id, { outputReference: o.outputReference || null,
                       partial: out && out.partial, counts: out && out.counts,
                       message: out && out.message });
        return { job: get(job.id), result: out };
      }, function (err) {
        fail(job.id, err, {});
        throw err;
      });
  }

  VQ2.aijob = {
    TYPES: TYPES, STATUS: STATUS, KEY: KEY,
    typeLabel: typeLabel, statusLabel: statusLabel,
    start: start, running: running, step: step, keepPartial: keepPartial,
    waitUser: waitUser, done: done, fail: fail, cancel: cancel, retry: retry,
    list: list, get: get, resumable: resumable, reconcile: reconcile,
    RESUME_KIND: RESUME_KIND, RESUME_CAP: RESUME_CAP,
    saveResume: saveResume, loadResume: loadResume, clearResume: clearResume,
    resumeEntries: resumeEntries,
    remove: remove, clearFinished: clearFinished, clearAll: clearAll,
    onChange: onChange, track: track, friendly: friendly,
    /* サーバの台帳との写し。付け足しなので、切っても生成は動く。 */
    sync: {
      pull: syncPull,
      stats: function () { return { pushed: syncStats.pushed, failed: syncStats.failed, pulled: syncStats.pulled }; },
      enabled: function () { return !!(syncOn && authHeader()); },
      setEnabled: function (v) { syncOn = !!v; return syncOn; },
      remoteIdOf: function (id) { return (syncState[id] && syncState[id].remoteId) || null; },
      flush: function (id) { syncFlush(id); }
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
