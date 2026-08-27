/* ══════════════════════════════════════════════════════════════════════
   Feature Flag（§2）
   ・V2 はすべてこの関門の内側にある。関門ごと OFF にすれば V1 のまま動く。
   ・URL（?vq2=presetStudioV2,quizPlayerV2 / ?vq2=all / ?vq2=off）と
     localStorage の両方から読む。URL の指定はその場だけでなく保存もする。
   ・問題が起きたら ?vq2=off、または設定から一括 OFF で即座に V1 へ戻る。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});

  var KEY = "vq2.flags.v1";

  /* 既定値。既定 ON＝入れた瞬間から使える。
     OFF にする手段（?vq2=off / 設定の「全部 OFF」）は残してあるので、
     何かあれば即座に V1 の動作へ戻せる。 */
  var DEFAULTS = {
    presetStudioV2: true,
    quizPlayerV2: true,
    resultViewV2: true,
    quickMockV2: true,
    quickMockPdfEngine: true,
    quickMockDigitalExam: true,
    quickMockAiGrading: true,
    quickMockFeedSharing: true,
    /* 試験コンパイラ（V2）。大問・設問数・配点・番号を **先にコードで決め**、
       AI へは 1 問ぶんの中身だけを頼む。枠に入らないものは捨てるので、
       「頼んだ数より多い／少ない」「満点が合わない」が仕組みとして起きない。
       決定論の層 47 件・実行の層 45 件のテストと、実 AI での通し（vqmockv2.cjs）で確認。
       OFF にすると V1（大問まるごと生成）へ戻る。 */
    quickMockCompilerV2: true,
    /* VocabuSpeak（英語）。教材・出題・リスニング・書き取りまでは動く。
       声を出す形式（スピーキング・発音・シャドーイング）と AI 英会話は
       音声認識と発音の評価が未実装のため、画面側で「ベータ」と出して閉じてある。 */
    speakV1: true
  };
  var NAMES = Object.keys(DEFAULTS);

  /* 依存関係。親が OFF なら子も必ず OFF になる。
     （PDF だけ ON で本体が OFF、のような矛盾した組み合わせを作らせない） */
  var REQUIRES = {
    quickMockPdfEngine: "quickMockV2",
    quickMockDigitalExam: "quickMockV2",
    quickMockAiGrading: "quickMockV2",
    quickMockFeedSharing: "quickMockV2",
    quickMockCompilerV2: "quickMockV2"
  };

  var state = null;

  function readStored() {
    try {
      var raw = root.localStorage && root.localStorage.getItem(KEY);
      if (!raw) return {};
      var o = JSON.parse(raw);
      return o && typeof o === "object" ? o : {};
    } catch (e) { return {}; }
  }
  function writeStored(o) {
    try { root.localStorage && root.localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {}
  }

  function readUrl() {
    try {
      var q = new root.URLSearchParams(root.location.search).get("vq2");
      if (q === null) return null;
      var v = String(q).trim().toLowerCase();
      if (v === "off" || v === "0" || v === "none") {
        var off = {}; NAMES.forEach(function (n) { off[n] = false; }); return off;
      }
      if (v === "all" || v === "1" || v === "on") {
        var on = {}; NAMES.forEach(function (n) { on[n] = true; }); return on;
      }
      var picked = {};
      String(q).split(/[,\s]+/).forEach(function (n) {
        n = n.trim();
        if (!n) return;
        /* 大文字小文字を無視して照合する */
        for (var i = 0; i < NAMES.length; i++) {
          if (NAMES[i].toLowerCase() === n.toLowerCase()) { picked[NAMES[i]] = true; return; }
        }
      });
      return Object.keys(picked).length ? picked : null;
    } catch (e) { return null; }
  }

  function normalize(o) {
    var out = {};
    NAMES.forEach(function (n) { out[n] = o[n] === true; });
    /* 依存を満たさないものは落とす */
    var guard = 0;
    var changedAny = true;
    while (changedAny && guard++ < 10) {
      changedAny = false;
      NAMES.forEach(function (n) {
        var need = REQUIRES[n];
        if (need && out[n] && !out[need]) { out[n] = false; changedAny = true; }
      });
    }
    return out;
  }

  function load() {
    if (state) return state;
    var base = {};
    NAMES.forEach(function (n) { base[n] = DEFAULTS[n]; });
    var stored = readStored();
    NAMES.forEach(function (n) { if (stored[n] !== undefined) base[n] = stored[n] === true; });
    var url = readUrl();
    if (url) {
      NAMES.forEach(function (n) { if (url[n] !== undefined) base[n] = url[n] === true; });
      writeStored(normalize(base));      /* URL 指定は保存する（リロードしても維持） */
    }
    state = normalize(base);
    return state;
  }

  function isOn(name) { return load()[name] === true; }
  function all() { var s = load(); var o = {}; NAMES.forEach(function (n) { o[n] = s[n]; }); return o; }

  function set(name, on) {
    if (NAMES.indexOf(name) < 0) throw new Error("UNKNOWN_FLAG:" + name);
    var s = load();
    s[name] = on === true;
    state = normalize(s);
    writeStored(state);
    emit();
    return state[name];
  }
  function setAll(on) {
    var o = {}; NAMES.forEach(function (n) { o[n] = on === true; });
    state = normalize(o); writeStored(state); emit(); return all();
  }
  function reset() { state = null; try { root.localStorage.removeItem(KEY); } catch (e) {} state = load(); emit(); return all(); }

  function emit() {
    try {
      if (root.dispatchEvent && root.CustomEvent)
        root.dispatchEvent(new root.CustomEvent("vq2:flags", { detail: all() }));
    } catch (e) {}
  }

  VQ2.flags = {
    NAMES: NAMES,
    DEFAULTS: DEFAULTS,
    REQUIRES: REQUIRES,
    isOn: isOn,
    all: all,
    set: set,
    setAll: setAll,
    reset: reset,
    _normalize: normalize
  };
  /* 手動確認用。コンソールから VQ2FLAGS.set("presetStudioV2", true) で切り替えられる。 */
  root.VQ2FLAGS = VQ2.flags;
})(typeof globalThis !== "undefined" ? globalThis : this);
