/* ══════════════════════════════════════════════════════════════════════════
   studio/tests/commands.test.mjs
   命令の表（src/ui/commands.js）と鍵の受け口（src/ui/shortcuts.js）の
   **純ロジック**の試験。DOM も store も要らない所だけを見る。

   ここで守るもの:
     ・findCommands の順位（完全一致 > 前方一致 > 部分一致 > 別名）
     ・describeKeys の表記（Windows は "Ctrl+Z"・Mac は "⌘Z"）
     ・COMMANDS の健全さ（id の重複なし・鍵の衝突なし・題と群が在る）
     ・鍵の正規化と KeyboardEvent の読み取り
     ・契約書 §7.4 の割当が 1 つも欠けていないこと
   画面（パレット・一覧）は document が要るので Node では試せない。
   ══════════════════════════════════════════════════════════════════════════ */
import test from "node:test";
import assert from "node:assert/strict";

import {
  COMMANDS, GROUPS, WHEN, EXCLUSIVE,
  findCommands, scoreCommand, normText,
  describeKeys, normalizeKey, parseKey, eventKeyString, keyFor, keyLabelFor,
  keyConflicts, duplicateIds, keyMap, commandById, commandsByGroup, isEnabled
} from "../src/ui/commands.js";
import { allowKey, holdMultiplier, isTyping, ownsKey, shortcutTable, hasKey } from "../src/ui/shortcuts.js";

/* ── 0. 表そのもの ──────────────────────────────────────────────── */

test("COMMANDS: 120 個以上・id の重複なし", () => {
  assert.ok(COMMANDS.length >= 120, `命令が ${COMMANDS.length} 個しか無い（120 以上が要る）`);
  assert.deepEqual(duplicateIds(), [], "id が重複している");
});

test("COMMANDS: 全ての命令に title / group / run / when が在る", () => {
  for (const c of COMMANDS) {
    assert.ok(c.id && typeof c.id === "string", "id が無い命令が在る");
    assert.ok(c.title && typeof c.title === "string", `${c.id} に title が無い`);
    assert.ok(c.group && GROUPS[c.group], `${c.id} の group "${c.group}" が GROUPS に無い`);
    assert.equal(typeof c.run, "function", `${c.id} の run が関数でない`);
    assert.equal(typeof c.when, "function", `${c.id} の when が関数でない`);
    assert.ok(WHEN[c.whenId], `${c.id} の whenId "${c.whenId}" が WHEN に無い`);
    assert.ok(Array.isArray(c.keys), `${c.id} の keys が配列でない`);
    assert.ok(c.icon && typeof c.icon === "string", `${c.id} に icon が無い`);
  }
});

test("COMMANDS: 鍵は正規形で入っている（書き間違いが混ざらない）", () => {
  for (const c of COMMANDS) {
    for (const k of c.keys) {
      assert.equal(k, normalizeKey(k), `${c.id} の鍵 "${k}" が正規形でない`);
      assert.ok(parseKey(k), `${c.id} の鍵 "${k}" が読めない`);
    }
  }
});

test("COMMANDS: 全ての群に少なくとも 1 つ在り、依頼の群が揃っている", () => {
  const groups = new Set(COMMANDS.map((c) => c.group));
  for (const want of ["file", "edit", "clip", "key", "play", "view", "marker", "auto", "account"]) {
    assert.ok(groups.has(want), `群 "${want}" の命令が無い`);
  }
  const listed = commandsByGroup().reduce((n, g) => n + g.items.length, 0);
  assert.equal(listed, COMMANDS.length, "群に振り分けられていない命令が在る");
});

test("COMMANDS: 危険な命令には danger が立っている", () => {
  const danger = COMMANDS.filter((c) => c.danger).map((c) => c.id);
  assert.ok(danger.includes("edit.clearTimeline"), "全部消すが danger でない");
  assert.ok(danger.includes("marker.clearAll"), "印を全部消すが danger でない");
  /* 取消・複写のような日常の操作に danger が付いていないこと */
  assert.equal(commandById("edit.copy").danger, false);
  assert.equal(commandById("edit.undo").danger, false);
});

/* ── 1. 鍵の衝突検出 ───────────────────────────────────────────── */

test("keyConflicts: 本物の表に衝突が無い", () => {
  const bad = keyConflicts();
  assert.deepEqual(bad, [], "鍵が衝突している: " + JSON.stringify(bad));
});

test("keyConflicts: 同じ条件で同じ鍵なら失敗させる", () => {
  const fake = [
    { id: "a", title: "甲", group: "edit", keys: ["mod+z"], whenId: "sel", when: () => true },
    { id: "b", title: "乙", group: "edit", keys: ["mod+z"], whenId: "sel", when: () => true }
  ];
  const bad = keyConflicts(fake);
  assert.equal(bad.length, 1);
  assert.equal(bad[0].key, "mod+z");
  assert.deepEqual([bad[0].a, bad[0].b].sort(), ["a", "b"]);
});

test("keyConflicts: 書き方が違っても同じ鍵なら見つける", () => {
  const fake = [
    { id: "a", title: "甲", group: "edit", keys: ["Shift+Mod+Z"], whenId: "always", when: () => true },
    { id: "b", title: "乙", group: "edit", keys: ["mod+shift+z"], whenId: "always", when: () => true }
  ];
  assert.equal(keyConflicts(fake).length, 1);
});

test("keyConflicts: 同時に成り立たない条件なら分け合って良い", () => {
  const fake = [
    { id: "in", title: "入る", group: "account", keys: ["mod+shift+u"], whenId: "anon", when: () => true },
    { id: "out", title: "出る", group: "account", keys: ["mod+shift+u"], whenId: "user", when: () => true }
  ];
  assert.deepEqual(keyConflicts(fake), []);
  /* EXCLUSIVE に無い組は衝突のまま */
  const fake2 = [
    { id: "x", title: "甲", group: "edit", keys: ["mod+shift+u"], whenId: "sel", when: () => true },
    { id: "y", title: "乙", group: "edit", keys: ["mod+shift+u"], whenId: "sel1", when: () => true }
  ];
  assert.equal(keyConflicts(fake2).length, 1);
  assert.ok(EXCLUSIVE.some((p) => p.includes("user") && p.includes("anon")));
});

test("keyMap: 同じ鍵を持つ命令は条件で切り分けられる（Delete）", () => {
  const map = keyMap();
  assert.ok(map.has("delete"));
  assert.ok(map.get("delete").some((c) => c.id === "edit.delete"));
  /* 選択が無ければ Delete は何にも当たらない（押し間違いの保護） */
  const empty = { store: null, selection: { clipIds: [] }, project: { tracks: [] } };
  assert.equal(map.get("delete").filter((c) => isEnabled(c, empty)).length, 0);
});

/* ── 2. 鍵の表記 ───────────────────────────────────────────────── */

test("describeKeys: Windows は Ctrl+Z・Mac は ⌘Z", () => {
  assert.equal(describeKeys("mod+z", { mac: false }), "Ctrl+Z");
  assert.equal(describeKeys("mod+z", { mac: true }), "⌘Z");
  assert.equal(describeKeys("mod+shift+z", { mac: false }), "Ctrl+Shift+Z");
  assert.equal(describeKeys("mod+shift+z", { mac: true }), "⌘⇧Z");
  assert.equal(describeKeys("alt+k", { mac: false }), "Alt+K");
  assert.equal(describeKeys("alt+k", { mac: true }), "⌥K");
});

test("describeKeys: 名前のある鍵と矢印は記号で出す", () => {
  assert.equal(describeKeys("space", { mac: false }), "Space");
  assert.equal(describeKeys("shift+arrowright", { mac: false }), "Shift+→");
  assert.equal(describeKeys("arrowleft", { mac: false }), "←");
  assert.equal(describeKeys("escape", { mac: false }), "Esc");
  assert.equal(describeKeys("delete", { mac: false }), "Delete");
  assert.equal(describeKeys("?", { mac: false }), "?");
  assert.equal(describeKeys("+", { mac: false }), "+");
});

test("describeKeys: 複数の鍵は / で連ね、空は空文字", () => {
  assert.equal(describeKeys(["delete", "backspace"], { mac: false }), "Delete / Backspace");
  assert.equal(describeKeys(["s", "mod+b"], { mac: false }), "S / Ctrl+B");
  assert.equal(describeKeys([], { mac: false }), "");
  assert.equal(describeKeys(null, { mac: false }), "");
  assert.equal(describeKeys("", { mac: false }), "");
  assert.equal(describeKeys("ぐにゃ+", { mac: false }), "ぐにゃ");   // 読めない所は落とす
});

test("normalizeKey / parseKey: 並びを揃え、別名を吸収する", () => {
  assert.equal(normalizeKey("Shift+Mod+Z"), "mod+shift+z");
  assert.equal(normalizeKey("CMD+S"), "mod+s");
  assert.equal(normalizeKey("Option+K"), "alt+k");
  assert.equal(normalizeKey("plus"), "+");
  assert.equal(normalizeKey("="), "+");
  assert.equal(normalizeKey("Esc"), "escape");
  assert.equal(normalizeKey("left"), "arrowleft");
  assert.equal(normalizeKey(""), "");
  assert.equal(normalizeKey("shift"), "");            // 修飾キーだけは鍵にならない
  /* "?" は shift で出る文字なので shift を書かない */
  assert.equal(normalizeKey("shift+?"), "?");
  const p = parseKey("mod+alt+arrowup");
  assert.deepEqual([p.mod, p.alt, p.shift, p.base], [true, true, false, "arrowup"]);
});

test("keyFor / keyLabelFor: id から鍵を引ける", () => {
  assert.equal(keyFor("edit.undo"), "mod+z");
  assert.equal(keyFor("clip.split"), "s");
  assert.equal(keyFor("file.save"), "mod+s");
  assert.equal(keyFor("無い.命令"), "");
  assert.equal(keyLabelFor("edit.undo", { mac: false }), "Ctrl+Z");
  assert.equal(keyLabelFor("edit.redo", { mac: false }), "Ctrl+Shift+Z / Ctrl+Y");
});

test("eventKeyString: KeyboardEvent から正規形を作る", () => {
  const ev = (o) => Object.assign({ key: "", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }, o);
  assert.equal(eventKeyString(ev({ key: "z", ctrlKey: true }), { mac: false }), "mod+z");
  assert.equal(eventKeyString(ev({ key: "z", metaKey: true }), { mac: true }), "mod+z");
  /* Mac で Ctrl は mod ではない（⌘ が mod）→ 別の鍵として扱う */
  assert.equal(eventKeyString(ev({ key: "z", ctrlKey: true }), { mac: true }), "ctrl+z");
  assert.equal(eventKeyString(ev({ key: "Z", ctrlKey: true, shiftKey: true }), { mac: false }), "mod+shift+z");
  assert.equal(eventKeyString(ev({ key: " " }), { mac: false }), "space");
  assert.equal(eventKeyString(ev({ key: "ArrowLeft", shiftKey: true }), { mac: false }), "shift+arrowleft");
  assert.equal(eventKeyString(ev({ key: "?", shiftKey: true }), { mac: false }), "?");
  assert.equal(eventKeyString(ev({ key: "=", ctrlKey: false }), { mac: false }), "+");
  assert.equal(eventKeyString(ev({ key: "Shift", shiftKey: true }), { mac: false }), "");
  assert.equal(eventKeyString(null, { mac: false }), "");
});

/* ── 3. 探し物（findCommands）──────────────────────────────────── */

const fake = (id, title, aliases) => ({
  id, title, group: "edit", icon: "dot", keys: [], aliases: (aliases || "").split(/\s+/).filter(Boolean),
  whenId: "always", when: () => true, run: () => { }, danger: false
});

test("findCommands: 完全一致 > 前方一致 > 部分一致 > 別名", () => {
  const list = [
    fake("d", "音を分割して整える", ""),        // 部分一致
    fake("c", "分割", "ぶんかつ"),              // 完全一致
    fake("a", "べつめい", "分割"),              // 別名の完全一致
    fake("b", "分割のあとで", "")               // 前方一致
  ];
  const got = findCommands("分割", { commands: list }).map((c) => c.id);
  assert.deepEqual(got, ["c", "b", "d", "a"]);
});

test("findCommands: よみがな（別名）で引ける", () => {
  const ids = findCommands("ぶんかつ").map((c) => c.id);
  assert.ok(ids.includes("clip.split"), "「ぶんかつ」で分割が出ない");
  assert.equal(findCommands("ぶんかつ")[0].id, "clip.split");
  assert.ok(findCommands("かきだし").some((c) => c.id === "file.export"), "「かきだし」で書き出しが出ない");
  assert.ok(findCommands("とりけし").some((c) => c.id === "edit.undo"), "「とりけし」で取り消しが出ない");
  assert.ok(findCommands("ろぐいん").some((c) => c.id === "account.login"), "「ろぐいん」でログインが出ない");
  assert.ok(findCommands("ぱすわーど").some((c) => c.id === "account.changePassword"),
    "「ぱすわーど」でパスワード変更が出ない");
});

test("findCommands: 片仮名・全角・大文字小文字を同じに扱う", () => {
  assert.equal(normText("ブンカツ"), "ぶんかつ");
  assert.equal(normText("Ｅｘｐｏｒｔ"), "export");
  assert.equal(normText(" 全体 表示 "), "全体表示");
  const a = findCommands("ズーム").map((c) => c.id);
  const b = findCommands("ずーむ").map((c) => c.id);
  assert.deepEqual(a, b);
  assert.deepEqual(findCommands("EXPORT").map((c) => c.id), findCommands("export").map((c) => c.id));
});

test("findCommands: 合う物が無ければ空・空の問いは全部返す", () => {
  assert.deepEqual(findCommands("ざぶとんかいてん").map((c) => c.id), []);
  assert.equal(findCommands("").length, COMMANDS.length);
  assert.equal(findCommands("  ").length, COMMANDS.length);
});

test("findCommands: 最近使った物が上に来る（順位は壊さない）", () => {
  const list = [fake("a", "甲の分割"), fake("b", "乙の分割"), fake("c", "丙の分割")];
  const got = findCommands("分割", { commands: list, recent: ["c", "b"] }).map((x) => x.id);
  assert.deepEqual(got, ["c", "b", "a"]);
  /* 完全一致は「最近」より強い（探した言葉の方が意図に近い） */
  const list2 = [fake("x", "分割"), fake("y", "分割のあとで")];
  assert.deepEqual(findCommands("分割", { commands: list2, recent: ["y"] }).map((c) => c.id), ["x", "y"]);
});

test("findCommands: ctx を渡すと今できない命令を外す", () => {
  const empty = { store: null, selection: { clipIds: [] }, project: { tracks: [] } };
  const all = findCommands("さくじょ", { all: true }).map((c) => c.id);
  const can = findCommands("さくじょ", { ctx: empty }).map((c) => c.id);
  assert.ok(all.includes("edit.delete"));
  assert.ok(!can.includes("edit.delete"), "選択が無いのに削除が出ている");
});

test("findCommands: limit で頭だけ返す", () => {
  const got = findCommands("", { limit: 5 });
  assert.equal(got.length, 5);
});

test("scoreCommand: 同じ言葉なら 題 > id > 別名 の順に強い", () => {
  const t = fake("zzz", "ぴったり", "");
  const i = fake("ぴったり", "ほか", "");
  const a = fake("yyy", "ほか", "ぴったり");
  assert.ok(scoreCommand(t, "ぴったり") > scoreCommand(i, "ぴったり"));
  assert.ok(scoreCommand(i, "ぴったり") > scoreCommand(a, "ぴったり"));
  assert.equal(scoreCommand(t, ""), 0);
  assert.equal(scoreCommand(null, "あ"), 0);
});

/* ── 4. 契約書 §7.4 の割当が揃っているか ──────────────────────── */

test("§7.4: 決められた鍵が 1 つも欠けていない", () => {
  const want = {
    space: "play.toggle", j: "play.reverse", k: "play.stop", l: "play.forward",
    arrowright: "play.frameNext", arrowleft: "play.framePrev",
    "shift+arrowright": "play.secNext", "shift+arrowleft": "play.secPrev",
    i: "play.setIn", o: "play.setOut",
    s: "clip.split", "mod+b": "clip.split",
    delete: "edit.delete", "shift+delete": "edit.rippleDelete",
    "mod+z": "edit.undo", "mod+shift+z": "edit.redo",
    "mod+c": "edit.copy", "mod+v": "edit.paste", "mod+x": "edit.cut",
    "+": "view.zoomIn", "-": "view.zoomOut", "shift+z": "view.zoomFit",
    m: "marker.add", "mod+s": "file.save", "mod+e": "file.export",
    v: "tool.select", a: "tool.ripple", t: "tool.razor",
    f: "view.fullscreen", "?": "help.shortcuts", "mod+k": "help.palette"
  };
  const map = keyMap();
  for (const key of Object.keys(want)) {
    const hit = map.get(normalizeKey(key));
    assert.ok(hit && hit.length, `鍵 "${key}" に命令が割り当てられていない`);
    assert.ok(hit.some((c) => c.id === want[key]),
      `鍵 "${key}" は ${want[key]} の物（今は ${hit.map((c) => c.id).join(",")}）`);
  }
});

test("shortcutTable / hasKey: 一覧に出す形が作れる", () => {
  const table = shortcutTable(false);
  assert.ok(table.length >= 40, `鍵つきの命令が ${table.length} 個しか無い`);
  for (const row of table) {
    assert.ok(row.label, `${row.id} の見せる鍵が空`);
    assert.ok(row.title && row.group);
  }
  assert.equal(hasKey("mod+z"), true);
  assert.equal(hasKey("mod+alt+shift+f9"), false);
});

/* ── 5. 入力欄での抑制・押し続けの段（shortcuts.js の純関数）──── */

test("allowKey: 入力中は大半を止め、Ctrl+Z / S / E は通す", () => {
  assert.equal(allowKey("s", false), true);
  assert.equal(allowKey("s", true), false);
  assert.equal(allowKey("delete", true), false);
  assert.equal(allowKey("space", true), false);
  assert.equal(allowKey("mod+z", true), true);
  assert.equal(allowKey("mod+shift+z", true), true);
  assert.equal(allowKey("mod+s", true), true);
  assert.equal(allowKey("mod+e", true), true);
  assert.equal(allowKey("mod+k", true), true);
  /* 入力中の Ctrl+C / V / X は器のもの（奪うと文字が複写できない） */
  assert.equal(allowKey("mod+c", true), false);
  assert.equal(allowKey("mod+v", true), false);
  assert.equal(allowKey("", false), false);
});

test("isTyping / ownsKey: 打ち込み中の器とボタンを見分ける", () => {
  assert.equal(isTyping({ tagName: "INPUT" }), true);
  assert.equal(isTyping({ tagName: "TEXTAREA" }), true);
  assert.equal(isTyping({ tagName: "SELECT" }), true);
  assert.equal(isTyping({ tagName: "DIV", isContentEditable: true }), true);
  assert.equal(isTyping({ tagName: "DIV" }), false);
  assert.equal(isTyping(null), false);
  assert.equal(ownsKey({ tagName: "BUTTON" }, "space"), true);
  assert.equal(ownsKey({ tagName: "BUTTON" }, "s"), false);
  assert.equal(ownsKey({ tagName: "DIV", getAttribute: () => "button" }, "enter"), true);
  assert.equal(ownsKey({ tagName: "DIV", getAttribute: () => null }, "space"), false);
});

test("holdMultiplier: 2 度押しで 2 倍・3 度で 4 倍", () => {
  assert.equal(holdMultiplier(1), 1);
  assert.equal(holdMultiplier(2), 2);
  assert.equal(holdMultiplier(3), 4);
  assert.equal(holdMultiplier(4), 8);
  assert.equal(holdMultiplier(9), 8);      // それ以上は据え置き
  assert.equal(holdMultiplier(0), 1);
  assert.equal(holdMultiplier(NaN), 1);
});

/* ── 6. when が ctx の欠けに耐えるか ──────────────────────────── */

test("when: ctx が空でも throw しない（画面が真っ白にならない）", () => {
  for (const ctx of [{}, { store: null }, { selection: null, project: null }, { store: {} }]) {
    for (const c of COMMANDS) {
      assert.doesNotThrow(() => isEnabled(c, ctx), `${c.id} の when が ${JSON.stringify(ctx)} で落ちた`);
    }
  }
});

test("when: 選択が在るときだけ効く命令が正しく開く", () => {
  const project = {
    settings: { fps: 30 },
    tracks: [{ id: "tr1", kind: "video", clips: [
      { id: "cl1", kind: "video", start: 0, duration: 4, in: 0, out: 4, assetId: "as1" }
    ] }],
    assets: [{ id: "as1", kind: "video", duration: 4 }], markers: [], chapters: []
  };
  const store = {
    project, selection: { clipIds: ["cl1"], trackId: "tr1", keyframe: null },
    view: { playhead: 2, zoom: 80, inPoint: null, outPoint: null, tool: "select" },
    dispatch() { }, batch() { }, canUndo: () => false, canRedo: () => false,
    select() { }, setView() { }
  };
  const ctx = { store };
  assert.equal(isEnabled(commandById("edit.delete"), ctx), true);
  assert.equal(isEnabled(commandById("clip.reverse"), ctx), true);
  assert.equal(isEnabled(commandById("clip.split"), ctx), true, "再生位置 2 秒で割れるはず");
  assert.equal(isEnabled(commandById("clip.group"), ctx), false, "2 つ無いのにグループ化が開いている");
  assert.equal(isEnabled(commandById("edit.undo"), ctx), false, "履歴が無いのに取消が開いている");
  assert.equal(isEnabled(commandById("marker.next"), ctx), false, "印が無いのに次の印が開いている");
  assert.equal(isEnabled(commandById("play.gotoIn"), ctx), false, "イン点が無いのに移動が開いている");
});
