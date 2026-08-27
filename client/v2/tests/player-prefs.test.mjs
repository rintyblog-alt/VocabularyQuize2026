/* 学習プレイヤーの設定

   いちばん確かめたいこと:
   ・既定は「いまの動き」（触らなければ何も変わらない）
   ・壊れた値・知らない項目を入れても、画面が壊れる値にならない
   ・利用者ごとに分かれる（他の人の設定が見えない・混ざらない）
   ・端末ごとの設定を、アカウントの同期へ混ぜない
   ・**定義表に載っているものは、すべて読む場所（readBy）がある** */
import { installLocalStorage, loadV2, group, test, assert, assertEq, assertDeep, report } from "./harness.mjs";

installLocalStorage();
const VQ2 = loadV2([
  "qtypes", "qdescriptor", "schema", "qmodel", "validate", "adapter", "score-allocator",
  "draft", "flags", "store", "player-prefs"
].map((f) => "domain/" + f + ".js"));

const PP = VQ2.playerPrefs, ST = VQ2.store;

/* 利用者を切り替える。store は currentOwnerId() を見ているので、そこを差し替える。 */
const realOwner = ST.currentOwnerId;
function asUser(id, fn) {
  ST.currentOwnerId = () => id;
  try { return fn(); } finally { ST.currentOwnerId = realOwner; }
}

/* ══════════════════════════════════════════════════════════════ */
group("1. 定義表");

test("項目がひととおりある", () => {
  assert(PP.DEFS.length >= 15, "少なすぎます: " + PP.DEFS.length);
});

test("id が重複していない", () => {
  const ids = PP.DEFS.map((d) => d.id);
  assertEq(new Set(ids).size, ids.length, "同じ id が 2 つあります");
});

test("すべての項目に「読む場所」が書いてある", () => {
  /* 誰も読まない設定は、置いただけで嘘になる。 */
  const bad = PP.DEFS.filter((d) => !d.readBy);
  assertEq(bad.length, 0, "読む場所が無い: " + bad.map((d) => d.id).join(", "));
});

test("すべての項目に見出しがある", () => {
  const bad = PP.DEFS.filter((d) => !d.label);
  assertEq(bad.length, 0, bad.map((d) => d.id).join(", "));
});

test("選ぶ形式には選択肢がある", () => {
  const bad = PP.DEFS.filter((d) => (d.type === "seg" || d.type === "select") && !(d.opts || []).length);
  assertEq(bad.length, 0, bad.map((d) => d.id).join(", "));
});

test("選択肢の中に既定値がある", () => {
  const bad = PP.DEFS.filter((d) => (d.opts || []).length
    && !d.opts.some((o) => String(o[0]) === String(d.def)));
  assertEq(bad.length, 0, bad.map((d) => d.id).join(", "));
});

test("分類はすべて定義済み", () => {
  const known = new Set(PP.GROUPS.map((g) => g.id));
  const bad = PP.DEFS.filter((d) => !known.has(d.group));
  assertEq(bad.length, 0, bad.map((d) => d.id + ":" + d.group).join(", "));
});

test("持ち場（端末 / アカウント）が必ず決まっている", () => {
  const bad = PP.DEFS.filter((d) => d.scope !== "device" && d.scope !== "account");
  assertEq(bad.length, 0, bad.map((d) => d.id).join(", "));
});

/* ══════════════════════════════════════════════════════════════ */
group("2. 既定は「いまの動き」");

test("何も入れていなければ既定が返る", () => {
  asUser("u-default", () => {
    assertDeep(PP.all(), PP.defaults());
  });
});

test("自動で次へ・すぐ解説は、既定では切", () => {
  /* 入れた時点で動きが変わる設定は、既定を切にする。 */
  assertEq(PP.def("autoNext").def, false);
  assertEq(PP.def("instantExplain").def, false);
});

test("進み具合・時間・保存の表示は、既定では入", () => {
  assertEq(PP.def("showProgress").def, true);
  assertEq(PP.def("showTimer").def, true);
  assertEq(PP.def("showSave").def, true);
});

/* ══════════════════════════════════════════════════════════════ */
group("3. 読み書き");

test("入れた値が返る", () => {
  asUser("u-rw", () => {
    PP.set({ fontSize: "large" });
    assertEq(PP.get("fontSize"), "large");
  });
});

test("入れていない項目は既定のまま", () => {
  asUser("u-rw", () => {
    assertEq(PP.get("maxWidth"), "standard");
  });
});

test("既定へ戻せる", () => {
  asUser("u-rw2", () => {
    PP.set({ fontSize: "xlarge", autoNext: true });
    PP.reset();
    assertDeep(PP.all(), PP.defaults());
  });
});

test("変わったことを知らせる", () => {
  let got = null;
  PP.onChange((v) => { got = v; });
  asUser("u-notify", () => { PP.set({ density: "compact" }); });
  assert(got && got.density === "compact", "知らせが来ていません");
});

/* ══════════════════════════════════════════════════════════════ */
group("4. 壊れた値を入れない");

test("知らない項目は保存しない", () => {
  asUser("u-bad", () => {
    PP.set({ nosuchKey: 123 });
    assertEq(PP.all().nosuchKey, undefined);
  });
});

test("入／切の項目に文字を入れても既定へ落ちる", () => {
  asUser("u-bad2", () => {
    PP.set({ showTimer: "yes" });
    assertEq(PP.get("showTimer"), true, "既定へ落ちていません");
  });
});

test("選択肢にない値は既定へ落ちる", () => {
  asUser("u-bad3", () => {
    PP.set({ fontSize: "gigantic" });
    assertEq(PP.get("fontSize"), "standard");
  });
});

test("保存領域が壊れていても既定で動く", () => {
  localStorage.setItem("vq2.playerPrefs.v1", "{壊れた JSON");
  asUser("u-broken", () => {
    assertDeep(PP.all(), PP.defaults());
  });
  localStorage.removeItem("vq2.playerPrefs.v1");
});

/* ══════════════════════════════════════════════════════════════ */
group("5. 利用者ごとに分かれる");

test("他の人の設定は見えない", () => {
  asUser("u-a", () => { PP.set({ fontSize: "large" }); });
  asUser("u-b", () => { assertEq(PP.get("fontSize"), "standard"); });
  asUser("u-a", () => { assertEq(PP.get("fontSize"), "large"); });
});

test("他の人の設定を上書きしない", () => {
  asUser("u-b", () => { PP.set({ fontSize: "small" }); });
  asUser("u-a", () => { assertEq(PP.get("fontSize"), "large"); });
});

/* ══════════════════════════════════════════════════════════════ */
group("6. 同期へ送るもの");

test("アカウントで揃えるものだけを取り出す", () => {
  asUser("u-sync", () => {
    const acc = PP.accountScoped();
    const ids = Object.keys(acc);
    assert(ids.indexOf("autoNext") >= 0, "アカウントの設定が入っていません");
    assertEq(ids.indexOf("fontSize"), -1, "端末の設定が混ざっています");
  });
});

test("端末の設定を変えても、同期へ送るものは変わらない", () => {
  asUser("u-sync2", () => {
    const before = JSON.stringify(PP.accountScoped());
    PP.set({ fontSize: "large", density: "compact" });
    assertEq(JSON.stringify(PP.accountScoped()), before);
  });
});

process.exit(report("学習プレイヤーの設定") ? 1 : 0);
