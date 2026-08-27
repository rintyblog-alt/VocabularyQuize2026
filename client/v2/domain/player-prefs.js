/* ══════════════════════════════════════════════════════════════════════
   学習プレイヤーの設定

   通常クイズと VocabuSpeak が同じ入れ物から読む。
   「解いているあいだの見え方・進み方」だけを持ち、
   出題の中身（何問・どの形式）はここへ入れない。それはプリセット側の話。

   ■ 端末ごとに持つものと、アカウントで揃えるもの
     scope: "device"  … その端末でだけ効く（文字の大きさ・音・振動など）
                        別の端末で同じにしたいとは限らない。同期しない。
     scope: "account" … どの端末でも同じにしたい（自動で次へ・確認する、など）
                        いまは端末内に保存するが、同期のときはこちらだけを送る。

   ■ 決まりごと
     ・**効かない設定は載せない。** 置いただけで誰も読まない項目は、
       あるだけで嘘になる。read されている場所を readBy に必ず書く。
     ・既定は「いまの動き」。設定を足しても、触らなければ何も変わらない。
     ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var ST = VQ2.store;

  var KEY = "vq2.playerPrefs.v1";

  /* ══ 定義表 ══
     id / group / type / def / scope / label / desc / opts / readBy */
  var DEFS = [
    /* ── 共通（クイズと VocabuSpeak の両方） ───────────────── */
    { id: "density", group: "common", type: "seg", def: "standard", scope: "device",
      label: "画面の詰まり具合", desc: "余白の広さを変えます",
      opts: [["standard", "標準"], ["compact", "コンパクト"], ["focus", "集中"]],
      readBy: "ui/player-shell.js" },
    { id: "fontSize", group: "common", type: "seg", def: "standard", scope: "device",
      label: "文字の大きさ", opts: [["small", "小"], ["standard", "標準"], ["large", "大"], ["xlarge", "特大"]],
      readBy: "ui/player-shell.js" },
    { id: "maxWidth", group: "common", type: "seg", def: "standard", scope: "device",
      label: "問題文の幅", desc: "広い画面で 1 行が長くなりすぎないようにします",
      opts: [["narrow", "せまい"], ["standard", "標準"], ["wide", "広い"]],
      readBy: "ui/player-shell.js" },
    { id: "animations", group: "common", type: "toggle", def: true, scope: "device",
      label: "画面の動き", desc: "切り替えのアニメーションを出します",
      readBy: "ui/player-shell.js" },
    { id: "showProgress", group: "common", type: "toggle", def: true, scope: "device",
      label: "進み具合を出す", readBy: "ui/player-shell.js" },
    { id: "showTimer", group: "common", type: "toggle", def: true, scope: "device",
      label: "時間を出す", desc: "気になるときは消せます", readBy: "ui/player-shell.js" },
    { id: "showSave", group: "common", type: "toggle", def: true, scope: "device",
      label: "保存の状態を出す", readBy: "ui/player-shell.js" },
    { id: "listPanel", group: "common", type: "toggle", def: true, scope: "device",
      label: "問題の一覧を出す", desc: "広い画面のとき、右側に一覧を出します",
      readBy: "ui/quiz-player.js" },
    { id: "keyboard", group: "common", type: "toggle", def: true, scope: "device",
      label: "キーボードで答える", desc: "1〜9 と A〜Z で選び、Enter で次へ",
      readBy: "ui/quiz-player.js" },
    { id: "autoNext", group: "common", type: "toggle", def: false, scope: "account",
      label: "答えたら自動で次へ", desc: "1 つ選ぶ形式と正誤問題のときだけ効きます",
      readBy: "ui/quiz-player.js" },
    { id: "instantExplain", group: "common", type: "toggle", def: false, scope: "account",
      label: "答えたらすぐ解説", desc: "練習のときだけ。試験形式では出しません",
      readBy: "ui/quiz-player.js" },

    /* ── クイズ ───────────────────────────────────────────── */
    { id: "choiceDensity", group: "quiz", type: "seg", def: "standard", scope: "device",
      label: "選択肢の詰まり具合", opts: [["standard", "標準"], ["compact", "詰める"]],
      readBy: "ui/player-shell.js" },
    { id: "resetScroll", group: "quiz", type: "toggle", def: true, scope: "device",
      label: "問題ごとに先頭へ戻す", readBy: "ui/quiz-player.js" },
    { id: "confirmSubmit", group: "quiz", type: "toggle", def: true, scope: "account",
      label: "採点の前に確認する", readBy: "ui/quiz-player.js" },
    { id: "warnUnanswered", group: "quiz", type: "toggle", def: true, scope: "account",
      label: "未回答があれば知らせる", readBy: "ui/quiz-player.js" },

    /* ── VocabuSpeak ───────────────────────────────────────
       字幕・訳・声・速さは VocabuSpeak 側の設定（speak-history の prefs）が持ち主。
       ここでは「レッスン中の見え方」だけを持つ。二重に持たない。 */
    { id: "speakBigMic", group: "speak", type: "toggle", def: true, scope: "device",
      label: "マイクを大きく出す", desc: "話す練習でいちばん押す場所です",
      readBy: "ui/speak.js" },
    { id: "speakInstantFeedback", group: "speak", type: "toggle", def: true, scope: "account",
      label: "答えたらすぐ手ごたえを出す", readBy: "ui/speak.js" }
  ];

  var BY_ID = {};
  DEFS.forEach(function (d) { BY_ID[d.id] = d; });

  var GROUPS = [
    { id: "common", label: "共通", desc: "クイズと VocabuSpeak の両方に効きます" },
    { id: "quiz", label: "クイズ", desc: "問題を解いているとき" },
    { id: "speak", label: "VocabuSpeak", desc: "英語のレッスン中" }
  ];

  function defaults() {
    var o = {};
    DEFS.forEach(function (d) { o[d.id] = d.def; });
    return o;
  }

  function owner() {
    try { return String((ST && ST.currentOwnerId && ST.currentOwnerId()) || "local"); }
    catch (e) { return "local"; }
  }

  function readAll() {
    try {
      var raw = root.localStorage && root.localStorage.getItem(KEY);
      var v = raw ? JSON.parse(raw) : null;
      return v && typeof v === "object" ? v : {};
    } catch (e) { return {}; }
  }
  function writeAll(v) {
    try { root.localStorage.setItem(KEY, JSON.stringify(v)); return true; }
    catch (e) { return false; }
  }

  /* 値の見張り。壊れた値は既定へ戻す（画面が崩れたまま固まらないように）。 */
  function clean(id, v) {
    var d = BY_ID[id];
    if (!d) return undefined;
    if (d.type === "toggle") return typeof v === "boolean" ? v : d.def;
    if (d.type === "seg" || d.type === "select") {
      var ok = (d.opts || []).some(function (o) { return String(o[0]) === String(v); });
      return ok ? String(v) : d.def;
    }
    return v === undefined ? d.def : v;
  }

  function all() {
    var mine = readAll()[owner()] || {};
    var out = defaults();
    Object.keys(mine).forEach(function (k) {
      if (!BY_ID[k]) return;                       /* 知らない項目は読まない */
      out[k] = clean(k, mine[k]);
    });
    return out;
  }

  function get(id) { return all()[id]; }

  var listeners = [];
  function onChange(fn) { if (typeof fn === "function") listeners.push(fn); }
  function emit(next) {
    listeners.forEach(function (fn) { try { fn(next); } catch (e) {} });
  }

  function set(patch) {
    var store = readAll();
    var me = owner();
    var mine = store[me] || (store[me] = {});
    Object.keys(patch || {}).forEach(function (k) {
      if (!BY_ID[k]) return;
      var v = clean(k, patch[k]);
      if (v !== undefined) mine[k] = v;
    });
    writeAll(store);
    var next = all();
    emit(next);
    return next;
  }

  function reset() {
    var store = readAll();
    delete store[owner()];
    writeAll(store);
    var next = all();
    emit(next);
    return next;
  }

  /* 同期へ送ってよいもの（アカウントで揃えるもの）だけを取り出す。
     端末ごとの設定を送ると、机の広い画面の設定がスマホへ降ってくる。 */
  function accountScoped() {
    var v = all(), out = {};
    DEFS.forEach(function (d) { if (d.scope === "account") out[d.id] = v[d.id]; });
    return out;
  }

  VQ2.playerPrefs = {
    DEFS: DEFS,
    GROUPS: GROUPS,
    defaults: defaults,
    all: all,
    get: get,
    set: set,
    reset: reset,
    onChange: onChange,
    accountScoped: accountScoped,
    def: function (id) { return BY_ID[id]; },
    inGroup: function (g) { return DEFS.filter(function (d) { return d.group === g; }); }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
