/* ══════════════════════════════════════════════════════════════════════════
   コース 30 本。

   ★ **色だけ 変えた コースは 作らない**（要件）。
     1 本ごとに 「その コースでしか 出て来ない 判断」を 1 つ 入れる。
     下の 一覧の 「芯」が それ。

   設計の もとに した 実測値（vqsurviveplay.cjs で 測った もの）:
     最高速 8.2 m/s ／ 跳びの 高さ 2.0m ／ 走り跳びの 飛距離 5.88m
     滞空 0.70 秒 ／ 段差は 0.42m まで 自動で 上る
   → 隙間は **安全 4.6m・ふつう 5.0m・難所 5.5m**。これを 超えない。
     段差は 1.7m まで。坂は いくらでも 上れる。
   ══════════════════════════════════════════════════════════════════════════ */

/* ── 書きやすくする ための 短い 名前 ─────────────────────────────────── */
const P = (len, w, obs) => ({ t: "path", len, w, obs });
const PW = (len, w, obs) => ({ t: "path", len, w, wall: true, obs });   /* 落ちない 床 */
const BR = (len, w, obs) => ({ t: "bridge", len, w: w || 3.2, obs });
const G = (len) => ({ t: "gap", len });
const RAMP = (len, dy, w, obs) => ({ t: "ramp", len, dy, w: w || 10, obs });
const ICE = (len, w, obs) => ({ t: "ice", len, w, obs });
const CONV = (len, w, speed, cz, obs) => ({ t: "conveyor", len, w, speed, cz: cz === undefined ? -1 : cz, obs });
const STONE = (count, gap, spread, bob) => ({ t: "stones", count, gap, spread, bob });
const MOVE = (count, gap, ax, period, stagger) => ({ t: "movers", count, gap, ax, period, stagger });
const TURN = (len, dx, w, obs) => ({ t: "turn", len, dx, w: w || 11, obs });
const GATE = (limit, gw) => ({ t: "gate", limit: limit || 12, gw: gw || 7 });
const CP = (w) => ({ t: "checkpoint", w: w || 12 });
const FIN = () => ({ t: "finish" });
const START = (w, len) => ({ t: "start", w: w || 18, len: len || 16 });

/* 仕掛け（区間の obs に 入れる）。dz は 区間の 始まりからの 距離。 */
const o = (t, dz, more) => Object.assign({ t, dz }, more || {});

/* ══════════════════════════════════════════════════════════════════════════
   01〜05 … 練習 / やさしい
   ══════════════════════════════════════════════════════════════════════════ */
const C = [];

C.push({
  id: "c01", name: "はじまりの丘", difficulty: 1, theme: "meadow", seed: "a1",
  core: "走る・跳ぶ・門を 通る。仕掛けは 1 つだけ。",
  recommendedPlayers: [1, 8], estimatedDuration: 55,
  sections: [
    START(20, 18),
    PW(26, 14),
    { t: "path", len: 22, w: 12, obs: [o("spinner", 11, { len: 9, speed: 0.75, height: 0.9 })] },
    GATE(14),
    PW(20, 12),
    G(4.2),
    PW(18, 12),
    CP(),
    P(24, 11, [o("tramp", 12, { r: 2.4 })]),
    G(4.4),
    P(22, 11),
    GATE(14),
    PW(22, 12),
    FIN()
  ]
});

C.push({
  id: "c02", name: "そよ風の橋", difficulty: 1, theme: "meadow", seed: "a2",
  core: "細い 道を 落ち着いて 渡る。急ぐと 落ちる。",
  recommendedPlayers: [1, 8], estimatedDuration: 60,
  sections: [
    START(18, 16),
    PW(18, 13),
    BR(20, 3.4),
    P(12, 10),
    GATE(13),
    BR(24, 2.8, [o("bumper", 12, { r: 1.2, dx: 2.4 })]),
    CP(),
    P(14, 11),
    BR(22, 2.6),
    G(4.0),
    BR(18, 3.0),
    GATE(13),
    PW(20, 12),
    FIN()
  ]
});

C.push({
  id: "c03", name: "ぴょんぴょん広場", difficulty: 2, theme: "candy", seed: "a3",
  core: "跳ねて 進む。着地する 場所を 選ぶ。",
  recommendedPlayers: [1, 8], estimatedDuration: 65,
  sections: [
    START(18, 16),
    PW(16, 13),
    P(20, 12, [o("tramp", 6, { r: 2.2, dx: -3 }), o("tramp", 14, { r: 2.2, dx: 3 })]),
    G(4.6),
    P(16, 11, [o("tramp", 8, { r: 2.6 })]),
    GATE(13),
    CP(),
    P(22, 12, [o("tramp", 6, { r: 2.0, dx: -3.5 }), o("tramp", 12, { r: 2.0 }), o("tramp", 18, { r: 2.0, dx: 3.5 })]),
    G(4.8),
    P(18, 11, [o("launch", 9, { r: 1.8, power: 1.5 })]),
    G(5.0),
    P(16, 12),
    GATE(13),
    PW(20, 12),
    FIN()
  ]
});

C.push({
  id: "c04", name: "まわる時計", difficulty: 2, theme: "meadow", seed: "a4",
  core: "回る 床の 上で、降りる 向きを 決める。",
  recommendedPlayers: [1, 8], estimatedDuration: 70,
  sections: [
    START(18, 16),
    PW(18, 13),
    P(14, 12),
    { t: "gap", len: 12, obs: [o("turntable", 6, { r: 5.2, speed: 0.42 })] },
    P(12, 11),
    GATE(13),
    CP(),
    P(14, 12, [o("spinner", 7, { len: 10, speed: -0.9, arms: 3 })]),
    { t: "gap", len: 13, obs: [o("turntable", 6.5, { r: 5.6, speed: -0.55 })] },
    P(14, 11),
    { t: "gap", len: 12, obs: [o("turntable", 6, { r: 4.8, speed: 0.7 })] },
    P(14, 12),
    GATE(13),
    PW(20, 12),
    FIN()
  ]
});

C.push({
  id: "c05", name: "やさしい坂道", difficulty: 2, theme: "forest", seed: "a5",
  core: "上り下りで 速さが 変わる。下りで 飛びすぎない。",
  recommendedPlayers: [1, 8], estimatedDuration: 70,
  sections: [
    START(18, 16),
    PW(16, 13),
    RAMP(16, 4, 12),
    PW(14, 12),
    GATE(13),
    RAMP(14, -3, 12),
    P(16, 11, [o("mover", 8, { w: 4, d: 4, ax: 4, period: 4.4 })]),
    CP(),
    RAMP(18, 5, 11),
    PW(12, 11),
    G(4.4),
    PW(14, 12),
    RAMP(16, -6, 12),
    GATE(13),
    PW(20, 12),
    FIN()
  ]
});

/* ══════════════════════════════════════════════════════════════════════════
   06〜10 … ふつう
   ══════════════════════════════════════════════════════════════════════════ */

C.push({
  id: "c06", name: "くるくる回廊", difficulty: 3, theme: "candy", seed: "b1",
  core: "回る 棒を 3 連続で くぐる。間合いを 覚える。",
  recommendedPlayers: [1, 8], estimatedDuration: 75,
  sections: [
    START(18, 16),
    PW(16, 13),
    PW(20, 12, [o("spinner", 10, { len: 11, speed: 1.0 })]),
    PW(18, 12, [o("spinner", 9, { len: 11, speed: -1.25, phase: 1.1 })]),
    GATE(12),
    CP(),
    PW(20, 12, [o("spinner", 10, { len: 12, speed: 1.5, arms: 3 })]),
    G(4.6),
    P(16, 11, [o("spinner", 8, { len: 9, speed: -1.7, height: 0.6 })]),
    PW(18, 12, [o("spinner", 9, { len: 11, speed: 1.9, arms: 2, phase: 0.5 })]),
    GATE(12),
    PW(20, 12),
    FIN()
  ]
});

C.push({
  id: "c07", name: "とび石の谷", difficulty: 3, theme: "forest", seed: "b2",
  core: "1 歩ずつ。跳ぶ 距離を 見て 決める。",
  recommendedPlayers: [1, 8], estimatedDuration: 80,
  sections: [
    START(18, 16),
    PW(16, 13),
    STONE(5, 4.2, 2.6, 0),
    P(12, 11),
    GATE(12),
    STONE(6, 4.4, 3.4, 0.5),
    CP(),
    P(12, 11),
    /* ★ 石の 横ずれ 3.8/4.2 は 前後 4.6/4.8 と 合わさると 6.0m に なり 届かない。
       横は 2.4 まで、前後は 4.4 に する（実測 5.88m の 内側）。 */
    STONE(7, 4.4, 2.4, 0.8),
    P(12, 11),
    STONE(5, 4.4, 2.6, 1.0),
    GATE(12),
    PW(20, 12),
    FIN()
  ]
});

C.push({
  id: "c08", name: "動く歩道", difficulty: 3, theme: "ruins", seed: "b3",
  core: "床が 勝手に 動く。逆らうか 乗るかを 決める。",
  recommendedPlayers: [1, 8], estimatedDuration: 75,
  sections: [
    START(18, 16),
    PW(16, 13),
    CONV(20, 10, 3.6, -1),
    P(10, 11),
    GATE(12),
    CONV(18, 9, 4.2, 1, [o("pushwall", 9, { dx: -6, dir: { x: 1, z: 0 }, w: 5, reach: 5, period: 3.2 })]),
    CP(),
    { t: "conveyor", len: 20, w: 10, speed: 4.0, cz: 0, cx: 1,
      obs: [o("bumper", 7, { r: 1.4, dx: -3 }), o("bumper", 14, { r: 1.4, dx: 3 })] },
    P(12, 11),
    CONV(18, 8, 5.0, -1),
    GATE(12),
    PW(20, 12),
    FIN()
  ]
});

C.push({
  id: "c09", name: "ハンマー通り", difficulty: 4, theme: "ruins", seed: "b4",
  core: "振り子の 周期を 読む。止まる 勇気。",
  recommendedPlayers: [1, 8], estimatedDuration: 80,
  sections: [
    START(18, 16),
    PW(16, 13),
    PW(22, 12, [o("hammer", 11, { period: 2.6, swing: 1.0 })]),
    PW(22, 12, [o("hammer", 7, { period: 2.2, swing: 1.1, phase: 0.3 }),
                o("hammer", 16, { period: 2.2, swing: 1.1, phase: 0.8 })]),
    GATE(12),
    CP(),
    PW(24, 13, [o("hammer", 6, { period: 1.9, swing: 1.15, dx: -3 }),
                o("hammer", 12, { period: 1.9, swing: 1.15, phase: 0.5 }),
                o("hammer", 18, { period: 1.9, swing: 1.15, dx: 3, phase: 0.25 })]),
    G(4.6),
    PW(18, 12, [o("hammer", 9, { period: 1.6, swing: 1.2, axis: "z" })]),
    GATE(12),
    PW(20, 12),
    FIN()
  ]
});

C.push({
  id: "c10", name: "風の丘", difficulty: 4, theme: "sky", seed: "b5",
  core: "風で 押される。まっすぐ 走ると 落ちる。",
  recommendedPlayers: [1, 8], estimatedDuration: 80,
  sections: [
    START(18, 16),
    PW(16, 13),
    P(20, 11, [o("fan", 10, { dx: -8, dir: { x: 1, z: 0 }, strength: 15, range: 12, width: 8 })]),
    BR(18, 3.6, [o("fan", 9, { dx: 8, dir: { x: -1, z: 0 }, strength: 16, range: 12, width: 8, cycle: 4, duty: 0.6 })]),
    GATE(12),
    CP(),
    BR(22, 3.2, [o("fan", 7, { dx: -9, dir: { x: 1, z: 0 }, strength: 17, range: 13, width: 9, cycle: 3.4, duty: 0.55 }),
                 o("fan", 16, { dx: 9, dir: { x: -1, z: 0 }, strength: 17, range: 13, width: 9, cycle: 3.4, duty: 0.55, phase: 0.5 })]),
    G(4.4),
    P(16, 10, [o("fan", 8, { dz: 8, dir: { x: 0, z: 1 }, strength: 13, range: 14, width: 10 })]),
    GATE(12),
    PW(20, 12),
    FIN()
  ]
});

/* ══════════════════════════════════════════════════════════════════════════
   11〜15 … 技術
   ══════════════════════════════════════════════════════════════════════════ */

C.push({
  id: "c11", name: "消える足場", difficulty: 4, theme: "neon", seed: "c1",
  core: "光っている うちに 渡る。待つのも 手。",
  recommendedPlayers: [1, 8], estimatedDuration: 85,
  sections: [
    START(18, 16),
    PW(16, 13),
    /* ★ 横へ 3m ずらすと 前後 5m と 合わせて 7.8m に なり **跳べない**
       （走り跳びの 実測 5.88m）。横は 2m まで、前後は 4.4m に した。 */
    { t: "gap", len: 20, obs: [
      /* ★ duty 0.55・位相 0/.33/.66/.15 だと、隣どうしが 同時に 出ている
         時間が 0.66 秒しか 無く、渡り切れない（実測で 14 回 落ちた）。
         duty 0.7・位相を 均等に して 重なりを 広げる。 */
      o("blinker", 4, { w: 4.6, d: 4.6, period: 3.2, duty: 0.7, phase: 0.0 }),
      o("blinker", 8.4, { w: 4.6, d: 4.6, period: 3.2, duty: 0.7, phase: 0.25, dx: -2 }),
      o("blinker", 12.8, { w: 4.6, d: 4.6, period: 3.2, duty: 0.7, phase: 0.5, dx: 2 }),
      o("blinker", 17.2, { w: 4.6, d: 4.6, period: 3.2, duty: 0.7, phase: 0.75 })] },
    P(12, 11),
    GATE(12),
    CP(),
    { t: "gap", len: 24, obs: [
      o("blinker", 4.2, { w: 4.0, d: 4.0, period: 2.8, duty: 0.68, phase: 0.0, dx: -2.2 }),
      o("blinker", 8.4, { w: 4.0, d: 4.0, period: 2.8, duty: 0.68, phase: 0.2, dx: 2.2 }),
      o("blinker", 12.6, { w: 4.0, d: 4.0, period: 2.8, duty: 0.68, phase: 0.4, dx: -2.2 }),
      o("blinker", 16.8, { w: 4.0, d: 4.0, period: 2.8, duty: 0.68, phase: 0.6, dx: 2.2 }),
      o("blinker", 21, { w: 4.6, d: 4.6, period: 2.8, duty: 0.68, phase: 0.8 })] },
    P(14, 11),
    GATE(12),
    PW(20, 12),
    FIN()
  ]
});

C.push({
  id: "c12", name: "崩れる橋", difficulty: 5, theme: "forest", seed: "c2",
  core: "止まったら 落ちる。走り続ける 勇気。",
  recommendedPlayers: [1, 8], estimatedDuration: 85,
  sections: [
    START(18, 16),
    PW(16, 13),
    { t: "gap", len: 24, obs: [
      o("faller", 3.5, { w: 4, d: 4 }), o("faller", 8, { w: 4, d: 4 }),
      o("faller", 12.5, { w: 4, d: 4 }), o("faller", 17, { w: 4, d: 4 }),
      o("faller", 21.5, { w: 4, d: 4 })] },
    P(12, 11),
    GATE(12),
    CP(),
    { t: "gap", len: 28, obs: [
      o("faller", 3.5, { w: 3.4, d: 3.4, delay: 0.42, dx: -3 }),
      o("faller", 7.5, { w: 3.4, d: 3.4, delay: 0.42, dx: 3 }),
      o("faller", 11.5, { w: 3.4, d: 3.4, delay: 0.42, dx: -3 }),
      o("faller", 15.5, { w: 3.4, d: 3.4, delay: 0.42, dx: 3 }),
      o("faller", 19.5, { w: 3.4, d: 3.4, delay: 0.42 }),
      o("faller", 24, { w: 4.4, d: 4.4, delay: 0.5 })] },
    P(14, 11),
    GATE(12),
    PW(20, 12),
    FIN()
  ]
});

C.push({
  id: "c13", name: "氷の回廊", difficulty: 5, theme: "ice", seed: "c3",
  core: "止まれない。曲がる 前に 減速する。",
  recommendedPlayers: [1, 8], estimatedDuration: 85,
  sections: [
    START(18, 16),
    PW(16, 13),
    ICE(22, 10),
    TURN(16, 9, 11),
    GATE(12),
    /* ★ 滑る 床の 上で 弾かれると **必ず 落ちる**（止まれない）。
       ここだけ 壁を 立てる。実測で 7 回 連続で 落ちていた。 */
    { t: "ice", len: 20, w: 9, wall: true, obs: [o("bumper", 10, { r: 1.5 })] },
    CP(),
    TURN(16, -10, 10),
    { t: "ice", len: 24, w: 8, wall: true,
      obs: [o("bumper", 7, { r: 1.3, dx: -2.4 }), o("bumper", 16, { r: 1.3, dx: 2.4 })] },
    P(12, 11),
    GATE(12),
    PW(20, 12),
    FIN()
  ]
});

C.push({
  id: "c14", name: "バンパー広場", difficulty: 5, theme: "candy", seed: "c4",
  core: "弾かれる 向きを 使って 進む。避けるだけでは 遅い。",
  recommendedPlayers: [1, 8], estimatedDuration: 80,
  sections: [
    START(18, 16),
    PW(16, 13),
    PW(24, 14, [o("bumper", 8, { r: 1.6, dx: -4 }), o("bumper", 8, { r: 1.6, dx: 4 }),
                o("bumper", 16, { r: 1.6 })]),
    GATE(12),
    PW(22, 14, [o("bumper", 6, { r: 1.4, dx: -5, bob: 0.8 }), o("bumper", 11, { r: 1.4, bob: 0.8, phase: 0.3 }),
                o("bumper", 16, { r: 1.4, dx: 5, bob: 0.8, phase: 0.6 })]),
    CP(),
    { t: "gap", len: 16, obs: [o("mover", 5, { w: 5, d: 5, ax: 5, period: 4 }),
                               o("mover", 11, { w: 5, d: 5, ax: 5, period: 4, phase: 0.5 })] },
    PW(20, 13, [o("bumper", 10, { r: 1.8, power: 1.4 })]),
    GATE(12),
    PW(20, 12),
    FIN()
  ]
});

C.push({
  id: "c15", name: "時計仕掛けの門", difficulty: 5, theme: "ruins", seed: "c5",
  core: "開く 間だけ 通れる。リズムに 合わせる。",
  recommendedPlayers: [1, 8], estimatedDuration: 90,
  sections: [
    START(18, 16),
    PW(16, 13),
    PW(18, 11, [o("timedgate", 9, { w: 5, h: 4, period: 4, duty: 0.45 })]),
    PW(18, 11, [o("timedgate", 9, { w: 5, h: 4, period: 3.2, duty: 0.4, phase: 0.4 })]),
    GATE(12),
    CP(),
    PW(26, 12, [o("timedgate", 6, { w: 5, h: 4, period: 2.8, duty: 0.38 }),
                o("timedgate", 14, { w: 5, h: 4, period: 2.8, duty: 0.38, phase: 0.5 }),
                o("timedgate", 22, { w: 5, h: 4, period: 2.8, duty: 0.38, phase: 0.25 })]),
    G(4.4),
    PW(18, 11, [o("timedgate", 9, { w: 5, h: 4, period: 2.2, duty: 0.34 })]),
    GATE(12),
    PW(20, 12),
    FIN()
  ]
});

/* ══════════════════════════════════════════════════════════════════════════
   16〜20 … 難しい
   ══════════════════════════════════════════════════════════════════════════ */

C.push({
  id: "c16", name: "ローラーコースター", difficulty: 6, theme: "ice", seed: "d1",
  core: "転がる 筒に 押し戻される。上る タイミング。",
  recommendedPlayers: [1, 8], estimatedDuration: 90,
  sections: [
    START(18, 16),
    PW(16, 13),
    RAMP(14, 3, 12),
    PW(20, 12, [o("roller", 6, { len: 11, r: 1.0, push: 3.6 }),
                o("roller", 14, { len: 11, r: 1.0, push: 3.6, speed: -2.6 })]),
    GATE(12),
    CP(),
    PW(24, 12, [o("roller", 5, { len: 11, r: 1.2, push: 4.4 }),
                o("roller", 12, { len: 11, r: 1.2, push: 4.4, speed: -3.0 }),
                o("roller", 19, { len: 11, r: 1.2, push: 4.4 })]),
    RAMP(14, -4, 12),
    ICE(16, 9),
    GATE(12),
    PW(20, 12),
    FIN()
  ]
});

C.push({
  id: "c17", name: "三又の選択", difficulty: 6, theme: "sky", seed: "d2",
  core: "3 本の 道。速いほど 危ない。どれを 選ぶか。",
  recommendedPlayers: [1, 8], estimatedDuration: 85,
  sections: [
    START(20, 16),
    PW(18, 16),
    /* 左＝細くて 速い / 中＝ふつう / 右＝仕掛けだらけだが 短い */
    { t: "gap", len: 30, obs: [
      /* 左: 細い 一本橋 */
      o("narrow", 15, { dx: -9, w: 1.7, d: 28 }),
      /* 中: とび石 */
      o("stones", 3, { count: 6, gap: 4.6, spread: 0, r: 1.6 }),
      /* 右: 動く 板 */
      o("mover", 6, { dx: 9, w: 4, d: 4, ax: 3.6, period: 3.6 }),
      o("mover", 13, { dx: 9, w: 4, d: 4, ax: 3.6, period: 3.6, phase: 0.4 }),
      o("mover", 20, { dx: 9, w: 4, d: 4, ax: 3.6, period: 3.6, phase: 0.8 }),
      o("mover", 27, { dx: 9, w: 4, d: 4, ax: 3.6, period: 3.6, phase: 0.2 })] },
    PW(16, 18),
    GATE(12, 9),
    CP(14),
    { t: "gap", len: 32, obs: [
      o("narrow", 16, { dx: -10, w: 1.5, d: 30, wave: 2.2 }),
      o("blinker", 6, { w: 4, d: 4, period: 2.6, phase: 0.0 }),
      o("blinker", 13, { w: 4, d: 4, period: 2.6, phase: 0.33 }),
      o("blinker", 20, { w: 4, d: 4, period: 2.6, phase: 0.66 }),
      o("blinker", 27, { w: 4, d: 4, period: 2.6, phase: 0.15 }),
      o("stones", 4, { dx: 10, count: 7, gap: 4.4, spread: 1.4, r: 1.4, bob: 0.7 })] },
    PW(18, 18),
    GATE(12, 9),
    PW(20, 14),
    FIN()
  ]
});

C.push({
  id: "c18", name: "天空の細道", difficulty: 6, theme: "sky", seed: "d3",
  core: "幅 1.5m。落ちたら 中間地点まで 戻る。",
  recommendedPlayers: [1, 8], estimatedDuration: 95,
  sections: [
    START(18, 16),
    PW(14, 13),
    { t: "gap", len: 26, obs: [o("narrow", 13, { w: 1.8, d: 24, wave: 2.6 })] },
    P(10, 10),
    GATE(12),
    CP(),
    { t: "gap", len: 30, obs: [o("narrow", 15, { w: 1.5, d: 28, wave: 3.4 }),
                               o("spinner", 15, { len: 8, speed: 0.9, height: 0.7 })] },
    P(10, 10),
    { t: "gap", len: 24, obs: [o("narrow", 12, { w: 1.4, d: 22, wave: 4.0 })] },
    P(12, 11),
    GATE(12),
    PW(20, 12),
    FIN()
  ]
});

C.push({
  id: "c19", name: "溶岩の縁", difficulty: 7, theme: "lava", seed: "d4",
  core: "床の 一部が 熱い。踏んだら 戻る。見て 避ける。",
  recommendedPlayers: [1, 8], estimatedDuration: 95,
  sections: [
    START(18, 16),
    PW(16, 13),
    PW(24, 14, [o("hazard", 8, { w: 5, d: 6, dx: -4 }), o("hazard", 17, { w: 5, d: 6, dx: 4 })]),
    GATE(12),
    PW(26, 14, [o("hazard", 6, { w: 6, d: 5, dx: 4 }), o("hazard", 13, { w: 6, d: 5, dx: -4 }),
                o("hazard", 20, { w: 6, d: 5, dx: 4 })]),
    CP(),
    PW(28, 15, [o("hazard", 7, { w: 12, d: 4 }), o("hazard", 16, { w: 12, d: 4 }),
                o("mover", 7, { w: 4.5, d: 4.5, ax: 5.5, period: 3.8, dy: 0.55 }),
                o("mover", 16, { w: 4.5, d: 4.5, ax: 5.5, period: 3.8, phase: 0.5, dy: 0.55 })]),
    P(14, 12),
    GATE(12),
    PW(20, 12),
    FIN()
  ]
});

C.push({
  id: "c20", name: "押し寄せる壁", difficulty: 7, theme: "lava", seed: "d5",
  core: "壁が 押して くる。細い 道の 上で 受ける。",
  recommendedPlayers: [1, 8], estimatedDuration: 95,
  sections: [
    START(18, 16),
    PW(16, 13),
    BR(22, 3.8, [o("pushwall", 7, { dx: -5, dir: { x: 1, z: 0 }, w: 4, reach: 5, period: 3.0 }),
                 o("pushwall", 16, { dx: 5, dir: { x: -1, z: 0 }, w: 4, reach: 5, period: 3.0, phase: 0.5 })]),
    GATE(12),
    CP(),
    BR(26, 3.4, [o("pushwall", 6, { dx: -5, dir: { x: 1, z: 0 }, w: 4, reach: 5.5, period: 2.4 }),
                 o("pushwall", 13, { dx: 5, dir: { x: -1, z: 0 }, w: 4, reach: 5.5, period: 2.4, phase: 0.33 }),
                 o("pushwall", 20, { dx: -5, dir: { x: 1, z: 0 }, w: 4, reach: 5.5, period: 2.4, phase: 0.66 })]),
    G(4.4),
    PW(18, 11, [o("spinner", 9, { len: 11, speed: 1.8, arms: 3 })]),
    GATE(12),
    PW(20, 12),
    FIN()
  ]
});

/* ══════════════════════════════════════════════════════════════════════════
   21〜25 … とても 難しい
   ══════════════════════════════════════════════════════════════════════════ */

C.push({
  id: "c21", name: "大回転", difficulty: 7, theme: "neon", seed: "e1",
  core: "回る 床 ＋ 回る 棒。足元と 頭上を 同時に 見る。",
  recommendedPlayers: [1, 8], estimatedDuration: 100,
  sections: [
    START(18, 16),
    PW(16, 13),
    { t: "gap", len: 14, obs: [o("turntable", 7, { r: 6.0, speed: 0.6 }),
                               o("spinner", 7, { len: 10, speed: -1.4, height: 0.9 })] },
    P(10, 11),
    GATE(12),
    CP(),
    { t: "gap", len: 15, obs: [o("turntable", 7.5, { r: 6.4, speed: -0.8 }),
                               o("spinner", 7.5, { len: 11, speed: 1.7, arms: 3, height: 0.85 })] },
    P(10, 11),
    { t: "gap", len: 15, obs: [o("turntable", 7.5, { r: 5.6, speed: 1.0 }),
                               o("hammer", 7.5, { period: 1.8, swing: 1.2 })] },
    P(12, 11),
    GATE(12),
    PW(20, 12),
    FIN()
  ]
});

C.push({
  id: "c22", name: "落ちる床の海", difficulty: 8, theme: "neon", seed: "e2",
  core: "全部 落ちる。立ち止まる 場所が どこにも 無い。",
  recommendedPlayers: [1, 8], estimatedDuration: 100,
  sections: [
    START(18, 16),
    PW(14, 13),
    { t: "gap", len: 34, obs: (() => {
      const a = [];
      /* ★ 横 -3.4 → +3.4 は 6.8m の 移動。前後 3.6 と 合わせて 7.7m に なり
         **跳べない**（実測 5.88m）。振り幅を 半分に する。 */
      for (let i = 0; i < 9; i++) {
        a.push(o("faller", 3.4 + i * 3.6, { w: 3.4, d: 3.4, delay: 0.48,
          dx: [0, -1.7, 1.7, 0, -1.7, 1.7, 0, -1.7, 1.7][i] }));
      }
      return a;
    })() },
    P(12, 11),
    GATE(12),
    CP(),
    { t: "gap", len: 36, obs: (() => {
      const a = [];
      for (let i = 0; i < 10; i++) {
        a.push(o("faller", 3.2 + i * 3.4, { w: 3.2, d: 3.2, delay: 0.44, back: 4.4,
          dx: Math.sin(i * 0.9) * 2.6 }));
      }
      return a;
    })() },
    P(14, 11),
    GATE(12),
    PW(20, 12),
    FIN()
  ]
});

C.push({
  id: "c23", name: "嵐の橋", difficulty: 8, theme: "ice", seed: "e3",
  core: "風 ＋ 細い 道 ＋ 動く 板。3 つ 同時。",
  recommendedPlayers: [1, 8], estimatedDuration: 105,
  sections: [
    START(18, 16),
    PW(14, 13),
    BR(20, 3.0, [o("fan", 10, { dx: -9, dir: { x: 1, z: 0 }, strength: 18, range: 13, width: 9, cycle: 3.0, duty: 0.55 })]),
    { t: "gap", len: 20, obs: [o("mover", 6, { w: 4, d: 4, ax: 5.5, period: 3.4 }),
                               o("mover", 13, { w: 4, d: 4, ax: 5.5, period: 3.4, phase: 0.5 }),
                               o("fan", 10, { dx: 10, dir: { x: -1, z: 0 }, strength: 16, range: 14, width: 10 })] },
    P(10, 11),
    GATE(12),
    CP(),
    BR(26, 2.6, [o("fan", 7, { dx: -9, dir: { x: 1, z: 0 }, strength: 19, range: 13, width: 9, cycle: 2.6, duty: 0.5 }),
                 o("fan", 17, { dx: 9, dir: { x: -1, z: 0 }, strength: 19, range: 13, width: 9, cycle: 2.6, duty: 0.5, phase: 0.5 }),
                 o("spinner", 12, { len: 8, speed: 1.5, height: 0.7 })]),
    ICE(16, 8),
    GATE(12),
    PW(20, 12),
    FIN()
  ]
});

C.push({
  id: "c24", name: "ハンマーの列", difficulty: 8, theme: "lava", seed: "e4",
  core: "6 本の 振り子が 順に 落ちる。波を 読んで 抜ける。",
  recommendedPlayers: [1, 8], estimatedDuration: 105,
  sections: [
    START(18, 16),
    PW(16, 13),
    PW(34, 13, (() => {
      const a = [];
      for (let i = 0; i < 6; i++) a.push(o("hammer", 4 + i * 5.2, { period: 2.0, swing: 1.15, phase: i * 0.17 }));
      return a;
    })()),
    GATE(12),
    CP(),
    PW(36, 14, (() => {
      const a = [];
      for (let i = 0; i < 7; i++) {
        a.push(o("hammer", 4 + i * 4.8, { period: 1.7, swing: 1.2, phase: (i % 2) * 0.5,
          dx: (i % 2 ? 3.2 : -3.2) }));
      }
      return a;
    })()),
    G(4.6),
    PW(18, 12, [o("hazard", 9, { w: 11, d: 5 }), o("mover", 9, { w: 5, d: 5, ax: 4, period: 3.2, dy: 0.6 })]),
    GATE(12),
    PW(20, 12),
    FIN()
  ]
});

C.push({
  id: "c25", name: "上昇気流", difficulty: 8, theme: "sky", seed: "e5",
  core: "打ち上げ台で 高く 跳ぶ。落ちる 先を 見てから 跳ぶ。",
  recommendedPlayers: [1, 8], estimatedDuration: 100,
  sections: [
    START(18, 16),
    PW(16, 13),
    P(14, 11, [o("launch", 7, { r: 1.8, power: 1.8 })]),
    G(7.0),
    { t: "path", len: 12, w: 9, obs: [o("launch", 6, { r: 1.6, power: 1.9 })] },
    G(7.5),
    P(12, 10),
    GATE(12),
    CP(),
    { t: "gap", len: 20, obs: [o("mover", 5.5, { w: 4.8, d: 4.8, ax: 0, ay: 2.2, period: 3.6 }),
                               o("mover", 12.5, { w: 4.8, d: 4.8, ax: 0, ay: 2.2, period: 3.6, phase: 0.5 })] },
    P(12, 10, [o("launch", 6, { r: 1.7, power: 2.0 })]),
    G(8.0),
    P(14, 11),
    GATE(12),
    PW(20, 12),
    FIN()
  ]
});

/* ══════════════════════════════════════════════════════════════════════════
   26〜29 … 極限
   ══════════════════════════════════════════════════════════════════════════ */

C.push({
  id: "c26", name: "混沌回廊", difficulty: 9, theme: "neon", seed: "f1",
  core: "5 種類が 同じ 場所に ある。優先順位を 決める。",
  recommendedPlayers: [1, 8], estimatedDuration: 110,
  sections: [
    START(18, 16),
    PW(14, 13),
    PW(24, 13, [o("spinner", 6, { len: 11, speed: 1.6 }),
                o("bumper", 12, { r: 1.4, dx: -4, bob: 0.8 }),
                o("bumper", 12, { r: 1.4, dx: 4, bob: 0.8, phase: 0.5 }),
                o("hammer", 19, { period: 1.9, swing: 1.1 })]),
    GATE(11),
    { t: "gap", len: 20, obs: [o("blinker", 5, { w: 4, d: 4, period: 2.4 }),
                               o("mover", 11, { w: 4, d: 4, ax: 5, period: 3.2 }),
                               o("blinker", 17, { w: 4, d: 4, period: 2.4, phase: 0.5 })] },
    CP(),
    CONV(20, 9, 5.0, 1, [o("pushwall", 10, { dx: -5, dir: { x: 1, z: 0 }, w: 4, reach: 5, period: 2.2 })]),
    PW(22, 12, [o("roller", 6, { len: 11, r: 1.1, push: 4.2 }),
                o("hazard", 14, { w: 11, d: 5 }),
                o("mover", 14, { w: 5, d: 5, ax: 4.5, period: 3.0, dy: 0.6 })]),
    GATE(11),
    PW(20, 12),
    FIN()
  ]
});

C.push({
  id: "c27", name: "氷と炎", difficulty: 9, theme: "lava", seed: "f2",
  core: "滑る 床の 先に 熱い 床。止まれない ところで 避ける。",
  recommendedPlayers: [1, 8], estimatedDuration: 110,
  sections: [
    START(18, 16),
    PW(14, 13),
    ICE(18, 10),
    PW(20, 12, [o("hazard", 6, { w: 5, d: 5, dx: -3.5 }), o("hazard", 14, { w: 5, d: 5, dx: 3.5 })]),
    GATE(11),
    { t: "ice", len: 20, w: 9, wall: true, obs: [o("bumper", 10, { r: 1.5, power: 1.3 })] },
    CP(),
    PW(24, 13, [o("hazard", 6, { w: 12, d: 4 }),
                o("mover", 6, { w: 4.6, d: 4.6, ax: 5, period: 3.2, dy: 0.6 }),
                o("hazard", 16, { w: 12, d: 4 }),
                o("mover", 16, { w: 4.6, d: 4.6, ax: 5, period: 3.2, phase: 0.5, dy: 0.6 })]),
    ICE(18, 7, [o("spinner", 9, { len: 9, speed: 1.9, height: 0.7 })]),
    GATE(11),
    PW(20, 12),
    FIN()
  ]
});

C.push({
  id: "c28", name: "無重力の道", difficulty: 9, theme: "sky", seed: "f3",
  core: "長い 隙間。打ち上げと 動く 板を 繋いで 渡る。",
  recommendedPlayers: [1, 8], estimatedDuration: 115,
  sections: [
    START(18, 16),
    PW(14, 13),
    P(12, 10, [o("launch", 6, { r: 1.7, power: 1.9 })]),
    G(8.0),
    { t: "gap", len: 26, obs: [
      /* ★ 縦に 3.6m 動く 板は 乗る のが きつすぎた（10 回 落ちた）。
         振れ幅を 2.2m・板を 大きく して 乗れる 窓を 広げる。 */
      o("mover", 5, { w: 4.8, d: 4.8, ax: 0, ay: 2.2, period: 3.4 }),
      o("mover", 12, { w: 4.8, d: 4.8, ax: 5, period: 3.6, phase: 0.3 }),
      o("mover", 19, { w: 4.8, d: 4.8, ax: 0, ay: 2.2, period: 3.4, phase: 0.6 })] },
    P(12, 10),
    GATE(11),
    CP(),
    P(12, 10, [o("launch", 6, { r: 1.6, power: 2.1 })]),
    G(8.6),
    { t: "gap", len: 28, obs: [
      o("blinker", 5, { w: 3.6, d: 3.6, period: 2.2 }),
      o("mover", 11, { w: 3.8, d: 3.8, ax: 6.5, period: 3.0, phase: 0.4 }),
      o("blinker", 17, { w: 3.6, d: 3.6, period: 2.2, phase: 0.5 }),
      o("mover", 24, { w: 4.2, d: 4.2, ax: 5, period: 3.4, phase: 0.8 })] },
    P(14, 11),
    GATE(11),
    PW(20, 12),
    FIN()
  ]
});

C.push({
  id: "c29", name: "最後の試練", difficulty: 10, theme: "neon", seed: "f4",
  core: "20 種類 すべてが 一度ずつ 出る。総まとめ。",
  recommendedPlayers: [1, 8], estimatedDuration: 130,
  sections: [
    START(18, 16),
    PW(14, 13),
    PW(18, 12, [o("spinner", 9, { len: 11, speed: 1.5 })]),
    PW(18, 12, [o("hammer", 9, { period: 1.9, swing: 1.15 })]),
    { t: "gap", len: 16, obs: [o("turntable", 8, { r: 5.6, speed: 0.8 })] },
    GATE(11),
    CP(),
    CONV(16, 9, 4.4, -1, [o("bumper", 8, { r: 1.4 })]),
    PW(16, 11, [o("roller", 8, { len: 11, r: 1.1, push: 4.0 })]),
    ICE(16, 8),
    { t: "gap", len: 18, obs: [o("blinker", 5, { w: 3.8, d: 3.8, period: 2.2 }),
                               o("faller", 11, { w: 3.8, d: 3.8, delay: 0.48 }),
                               o("mover", 16, { w: 4, d: 4, ax: 5, period: 3.2 })] },
    GATE(11),
    CP(),
    PW(18, 11, [o("timedgate", 9, { w: 5, h: 4, period: 2.4, duty: 0.36 })]),
    BR(20, 2.8, [o("fan", 10, { dx: -9, dir: { x: 1, z: 0 }, strength: 18, range: 13, width: 9, cycle: 2.6, duty: 0.5 }),
                 o("pushwall", 15, { dx: 5, dir: { x: -1, z: 0 }, w: 4, reach: 5, period: 2.2 })]),
    STONE(6, 4.6, 3.4, 0.8),
    { t: "gap", len: 16, obs: [o("narrow", 8, { w: 1.6, d: 15, wave: 2.4 })] },
    P(12, 10, [o("launch", 6, { r: 1.6, power: 1.9 }), o("tramp", 10, { r: 2.0 })]),
    G(6.4),
    PW(18, 12, [o("hazard", 9, { w: 11, d: 5 }), o("mover", 9, { w: 5, d: 5, ax: 4, period: 3.0, dy: 0.6 })]),
    GATE(11),
    PW(22, 13),
    FIN()
  ]
});

/* ══════════════════════════════════════════════════════════════════════════
   30 … 決勝
   ══════════════════════════════════════════════════════════════════════════ */

C.push({
  id: "c30", name: "チャンピオンシップ", difficulty: 10, theme: "arena", seed: "g1",
  core: "長い。門は 5 つ。速さと 正確さの 両方が 要る。",
  recommendedPlayers: [2, 8], estimatedDuration: 165,
  sections: [
    START(22, 20),
    PW(18, 16),
    PW(22, 14, [o("spinner", 11, { len: 12, speed: 1.3, arms: 3 })]),
    GATE(11, 8),
    RAMP(16, 4, 12),
    PW(24, 13, [o("hammer", 7, { period: 1.9, swing: 1.15, dx: -3.4 }),
                o("hammer", 15, { period: 1.9, swing: 1.15, dx: 3.4, phase: 0.5 })]),
    CP(14),
    /* ★ 前後 5m ＋ 横 3.4m は 6.05m。跳べる 5.88m を 超えていた。
       前後 4.4m・横 1.6m に して 4.7m に する。 */
    { t: "gap", len: 22, obs: [o("faller", 4, { w: 3.8, d: 3.8, delay: 0.48 }),
                               o("faller", 8.4, { w: 3.8, d: 3.8, delay: 0.48, dx: -1.6 }),
                               o("faller", 12.8, { w: 3.8, d: 3.8, delay: 0.48, dx: 1.6 }),
                               o("faller", 17.2, { w: 3.8, d: 3.8, delay: 0.48 })] },
    PW(14, 12),
    GATE(11, 8),
    TURN(18, 11, 12),
    CONV(20, 10, 4.6, -1, [o("pushwall", 10, { dx: -6, dir: { x: 1, z: 0 }, w: 4, reach: 5.5, period: 2.4 })]),
    CP(14),
    ICE(20, 9, [o("bumper", 10, { r: 1.5, power: 1.3 })]),
    RAMP(16, -5, 12),
    GATE(11, 8),
    { t: "gap", len: 26, obs: [o("mover", 6, { w: 4.2, d: 4.2, ax: 6, period: 3.2 }),
                               o("mover", 13, { w: 4.2, d: 4.2, ax: 6, period: 3.2, phase: 0.5 }),
                               o("mover", 20, { w: 4.2, d: 4.2, ax: 6, period: 3.2, phase: 0.25 })] },
    PW(16, 12),
    CP(14),
    BR(24, 2.8, [o("fan", 8, { dx: -9, dir: { x: 1, z: 0 }, strength: 18, range: 13, width: 9, cycle: 2.6, duty: 0.5 }),
                 o("fan", 18, { dx: 9, dir: { x: -1, z: 0 }, strength: 18, range: 13, width: 9, cycle: 2.6, duty: 0.5, phase: 0.5 })]),
    GATE(11, 8),
    PW(24, 14, [o("hazard", 8, { w: 13, d: 5 }),
                o("mover", 8, { w: 5, d: 5, ax: 5, period: 3.0, dy: 0.6 }),
                o("spinner", 18, { len: 12, speed: 2.0, arms: 3 })]),
    GATE(11, 8),
    PW(26, 16),
    FIN()
  ]
});

export const COURSES = C;
export const COURSE_BY_ID = Object.create(null);
for (const c of C) COURSE_BY_ID[c.id] = c;

/** 難しさの 段（要件の 区切り） */
export const TIERS = [
  { key: "tutorial", label: "練習", from: 0, to: 4 },
  { key: "normal", label: "ふつう", from: 5, to: 9 },
  { key: "technical", label: "技術", from: 10, to: 14 },
  { key: "hard", label: "難しい", from: 15, to: 19 },
  { key: "veryhard", label: "とても難しい", from: 20, to: 24 },
  { key: "extreme", label: "極限", from: 25, to: 28 },
  { key: "champion", label: "決勝", from: 29, to: 29 }
];

export function tierOf(index) {
  for (const t of TIERS) if (index >= t.from && index <= t.to) return t;
  return TIERS[0];
}
