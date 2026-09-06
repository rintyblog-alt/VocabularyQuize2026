/* ══════════════════════════════════════════════════════════════════════════
   探索モード（RPG）の 画面。

   訴え（2026-09-02）:
     「今の アスレチック以外にも、RPG ゲーム（探索ゲーム）とか 作るといい。
       長い物語が あって、アイテムも 膨大。敵も いて マップも 巨大。
       マテリアルを 最高級品質に したいが、スマホ・パソコンで 重くならないように。
       クラフトとかも できて、素材も 集められるように。建物も あって、
       自分で 建物を 建てたりも できるように。種類も 膨大に。」

   ここは **束ねる ところ**。世界・自分・敵・持ちもの…は それぞれの ファイル。
   ══════════════════════════════════════════════════════════════════════════ */
import { Renderer } from "../engine/renderer.js";
import { ThirdPersonCamera } from "../engine/camera.js";
import { Input } from "../game/input.js";
import { TouchPad, TOUCH_CSS } from "../ui/touch.js";
import { Terrain, worldName, SEA } from "./world/terrain.js";
import { Caves } from "./world/cave.js";
import { ChunkManager } from "./world/chunkmgr.js";
import { registerRpgMeshes } from "./render/meshes.js";
import { BIOMES } from "./world/biome.js";
import { Player } from "./player.js";
import { Sky } from "./render/sky.js";
import { drawEnemy } from "./render/mobs.js";
import { Weather } from "./render/weather.js";
import { Inventory } from "./sys/inventory.js";
import { Gather } from "./sys/gather.js";
import { Combat } from "./sys/combat.js";
import { Build, 格子へ, 格子 } from "./sys/build.js";
import { Fishing } from "./sys/fishing.js";
import { 大きさ } from "./data/blueprints.js";
import { Craft } from "./sys/craft.js";
import { Quest } from "./sys/quest.js";
import { Town } from "./sys/town.js";
import { Words } from "./sys/words.js";
import { Errands } from "./sys/errand.js";
import * as Save from "./sys/save.js";
import { ITEM, 名 as item名 } from "./data/items.js";
import { ENEMIES as ENEMIES_TABLE } from "./data/enemies.js";
import { 主の居場所 } from "./data/story.js";
import { Renderer as R2 } from "../engine/renderer.js";
import { RpgHud, RHUD_CSS } from "./ui/hud.js";
import { h } from "../ui/shell.js";

const m4 = new Float32Array(16);
/* ★ 手足を 振る ための 行列（2026-09-02）。
   yaw（左右）に 加えて pitch（前後の 振り）を 入れる。
   人が 瓶に 見えて いたのは、**手足が 無く 動かない**から。
   肌より これの ほうが ずっと 効く。 */
function trsp(out, x, y, z, sx, sy, sz, yaw, pit) {
  const cy = Math.cos(yaw), sy2 = Math.sin(yaw);
  const cp = Math.cos(pit), sp = Math.sin(pit);
  /* R = Ry(yaw) * Rx(pit) */
  out[0] = cy * sx;            out[1] = 0;        out[2] = -sy2 * sx;          out[3] = 0;
  out[4] = sy2 * sp * sy;      out[5] = cp * sy;  out[6] = cy * sp * sy;       out[7] = 0;
  out[8] = sy2 * cp * sz;      out[9] = -sp * sz; out[10] = cy * cp * sz;      out[11] = 0;
  out[12] = x; out[13] = y; out[14] = z; out[15] = 1;
  return out;
}

function trs(out, x, y, z, sx, sy, sz, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  out[0] = c * sx; out[1] = 0; out[2] = -s * sx; out[3] = 0;
  out[4] = 0; out[5] = sy; out[6] = 0; out[7] = 0;
  out[8] = s * sz; out[9] = 0; out[10] = c * sz; out[11] = 0;
  out[12] = x; out[13] = y; out[14] = z; out[15] = 1;
  return out;
}

export class RpgScreen {
  constructor(o) {
    this.app = o.app;
    this.settings = o.settings || {};
    this.onExit = o.onExit || function () {};
    this.seed = 20260902;
    this.renderer = null;
    this.terr = null;
    this.chunks = null;
    this.player = null;
    this.cam = new ThirdPersonCamera();
    this.input = null;
    this.touch = null;
    this.sky = null;
    this.time = 8.0;            /* 世界の 時刻（0〜24） */
    this.dayLen = 900;          /* 1 日の 長さ（秒） */
    this._acc = 0;
    this._fps = 60;
    this._frames = 0;
    /* ── 遊びの 中身 ── */
    this.inv = new Inventory();
    this.gather = null;
    this.combat = null;
    this.build = null;
    this.craft = null;
    this.quest = null;
    this.狙い = null;           /* いま 採れる もの */
    this.狙い敵 = null;
    this.たたき = 0;
    this.置くもの = "";          /* 建てる ときに 選んで いる もの */
    this.建てるか = false;
    this.log = [];               /* 画面に 出す 短い 知らせ */
    this._save待 = 0;
    this._buildBatch = new Map();  /* 区画key → バッチ */
    this._buildDirty = new Set();
    this.寒 = 0; this.熱 = 0; this.毒 = 0;
    this.town = null; this.words = null;
    this.audio = null; this._曲 = ""; this._歩音 = 0;
    this.いる町 = null; this.近くの人 = null; this.近くの設備 = null;
    /* ★ 行った ことの ある 町（2026-09-02）。
       世界は はてしない ので、**歩いて 戻るだけ**では 遠い 町が 死ぬ。
       一度 行った 町へは 案内人に 頼んで 帰れる ように する。 */
    this.行った町 = new Map();
    /* ★ ずかん（2026-09-02）。357 種の ものと 31 種の 相手が いても、
       「どれだけ 見たか」が どこにも 出ないと **広さが 伝わらない**。
       持って いなくても、一度 手に した ものは 残る。 */
    this.見つけた = new Set();
    this.倒した種 = new Set();
    this.caves = null; this.洞窟 = null; this.近くの入口 = null;
    this.洞外 = null;               /* 潜る 前の 位置 */
    this.el = this._build();
    this.ready = false;
    this._err = "";
  }

  _build() {
    this.canvas = h("canvas", { class: "rpg-cv" });
    this.hud = new RpgHud({ screen: this });
    this.hudEl = this.hud.el;
    /* ★ 目安（fps・区画・三角）は **既定で 出さない**。
       物語の 一行と 重なって 読めなく なる（実写で 確認）。
       ?dbg=1 か 「もどる」を 長押しで 出す。 */
    this.debugEl = h("div", { class: "rpg-dbg", "aria-hidden": "true", hidden: true });
    try { if (/[?&]dbg=1/.test(location.search)) this.debugEl.hidden = false; } catch (e) {}
    this.exitBtn = h("button", { class: "rpg-exit", type: "button", text: "もどる" });
    this.exitBtn.addEventListener("click", () => this.onExit());
    /* 長押しで 目安を 出し入れ */
    let 長 = 0;
    this.exitBtn.addEventListener("pointerdown", () => {
      長 = setTimeout(() => { this.debugEl.hidden = !this.debugEl.hidden; 長 = 0; }, 700);
    });
    const 止 = () => { if (長) { clearTimeout(長); 長 = 0; } };
    this.exitBtn.addEventListener("pointerup", 止);
    this.exitBtn.addEventListener("pointerleave", 止);
    return h("div", { class: "rpg-root" }, this.canvas, this.hudEl, this.debugEl, this.exitBtn);
  }

  async enter(arg) {
    if (arg && arg.seed) this.seed = arg.seed | 0;
    this.terr = new Terrain(this.seed);
    this.worldName = worldName(this.seed);
    if (!this.renderer) {
      try {
        this.renderer = new Renderer(this.canvas, this.settings);
        registerRpgMeshes(this.renderer, this.settings.obstacleDetail);
      } catch (e) {
        this._err = String(e && e.message || e);
        this.debugEl.textContent = "3D を 出せません: " + this._err;
        return;
      }
    }
    this.sky = new Sky(this.renderer);
    this.weather = new Weather({ settings: this.settings });
    this.chunks = new ChunkManager({
      renderer: this.renderer, terrain: this.terr,
      seed: this.seed, settings: this.settings
    });
    /* ★ スマホは 木や 草を 出す 半径を さらに 縮める（2026-09-02）。
       三角の 数が いちばん 効く。地面は そのまま 遠くまで 出す。 */
    if (this.settings.tier === "low") { this.chunks.detailRadius = 1; this.chunks.budgetMs = 4; }
    else if (this.settings.tier === "medium") { this.chunks.detailRadius = 2; this.chunks.budgetMs = 5; }
    /* 出だしは 陸の 上 */
    const s = this._findStart();
    this.player = new Player(this.terr, s.x, s.z);
    /* 木の 幹と 岩を すり抜けない。洞窟の 中では 外の 木を 見ない。 */
    this._固い箱 = [];
    this.player.固い = (x, z) => {
      this._固い箱.length = 0;
      if (this.洞窟) return this._固い箱;
      return this.chunks.固い(x, z, this._固い箱);
    };
    /* カメラが 山や 地面に めり込まない。 */
    /* ★ カメラは 地面にも **木や 岩にも** めり込まない（2026-09-02）。
       木を 見て いない と、林の 中で 幹が 画面いっぱいに なって
       前が まったく 見えなく なる（実写で 何度も 起きた）。 */
    this._見る箱 = [];
    this.cam.raycast = (from, dir, max) => {
      const 段 = 0.45;
      for (let d = 0.8; d < max; d += 段) {
        const x = from[0] + dir[0] * d, y = from[1] + dir[1] * d, z = from[2] + dir[2] * d;
        if (y < this.terr.height(x, z) + 0.3) return d;
        /* ★ 木では 引かない（2026-09-02・実写で 決めた）。
           幹は 細い ので、たまに 横切っても 気に ならない。
           逆に 木で 引くと **林の 中で ずっと 顔の どアップ**に なる
           （森は どこに 立っても 後ろに 木が ある）。
           引くのは **自分で 建てた 壁**だけ。壁は 面で 塞ぐ ので
           入られると 本当に 何も 見えなく なる。 */
        /* ★ build は カメラより **後**に できる（snap は enter の 中で
           先に 呼ばれる）。無い ときは 見ない。 */
        if (this.洞窟 || !this.build) continue;
        if (this.build.at(x, y, z) || this.build.at(x, y - 1, z)) return d;
      }
      return -1;
    };
    this.cam.snap(this.player.pos, 0);

    /* ── 遊びの 仕組みを つなぐ ── */
    this.build = new Build({ terrain: this.terr, inventory: this.inv,
      onChange: (k) => this._buildDirty.add(k) });
    this.combat = new Combat({
      terrain: this.terr, seed: this.seed, settings: this.settings, inventory: this.inv,
      onHitPlayer: (atk, D) => this._打たれる(atk, D),
      onDrop: (id, n) => { if (n > 0) this._知らせ(item名(id) + " ×" + n); },
      onKill: (e, 落, 上) => {
        this._知らせ(e.def.名 + " を たおした", "good");
        if (上) this._知らせ("段位が " + this.combat.lv + " に 上がった", "good");
        const eid = this._敵id(e.def);
        if (eid) this.倒した種.add(eid);
        if (this.quest) this.quest.倒した報告(eid);
        if (this.errand) this.errand.倒した(eid);
      }
    });
    this.gather = new Gather({
      terrain: this.terr, inventory: this.inv, seed: this.seed,
      onGet: (id, n) => { if (n > 0) this._知らせ(item名(id) + " ×" + n); if (this.quest) this.quest.見る(); },
      onMiss: () => this._知らせ("持ちものが いっぱい", "warn")
    });
    this.quest = new Quest({
      inventory: this.inv, build: this.build, combat: this.combat,
      onClear: (節, 礼) => {
        this._知らせ("【" + 節.題 + "】 を 果たした", "good");
        for (const [k, n] of 礼) if (n > 0) this._知らせ("礼: " + item名(k) + " ×" + n, "good");
        /* ★ 物語の 終わり（2026-09-02）。
           最後の 節を 果たしても 何も 起きず、目あての 行が
           消えるだけ だった。**8 章 遊びきった ことを ちゃんと 出す**。 */
        if (節.終 || this.quest.終わった) this._おわり();
      },
      onChapter: (章) => { if (章) this._章を出す(章); }
    });
    /* つり（2026-09-02）。水べで 竿を 使う。世界の 17% は 水なのに
       できる ことが 何も 無かった。 */
    this.fish = new Fishing({
      terrain: this.terr, inventory: this.inv,
      onLog: (t, k) => this._知らせ(t, k)
    });
    this.craft = new Craft({
      inventory: this.inv, build: this.build, quest: this.quest,
      onMade: (id, n) => { this._知らせ(item名(id) + " を 作った ×" + n, "good");
        if (this.errand) this.errand.作った(id, n); }
    });
    this.inv.on(() => {
      this._invDirty = true;
      /* ずかんに 書く（枠は 36 なので 毎回 見ても 軽い） */
      for (const sl of this.inv.slots) if (sl && !this.見つけた.has(sl.id)) {
        this.見つけた.add(sl.id);
        this._ずかん汚 = true;
      }
      if (this.quest) this.quest.見る();
    });

    this.town = new Town({ terrain: this.terr, seed: this.seed });
    this.caves = new Caves({ terrain: this.terr, seed: this.seed });
    this.errand = new Errands({
      inventory: this.inv, combat: this.combat, seed: this.seed,
      onDone: (e) => this._知らせ("依頼を 果たした（+" + e.礼金 + " 金）", "good")
    });
    this.words = new Words({
      combat: this.combat, quest: this.quest,
      onAsk: () => { this.hud && this.hud.問を出す(this.words.問); },
      onAnswer: (正) => {
        this.hud && this.hud.問を消す(正);
        this._知らせ(正 ? "ことばの力が たまった" : "ちがった", 正 ? "good" : "warn");
        try { if (this.audio) { 正 ? this.audio.correct() : this.audio.wrong(); } } catch (e) {}
      }
    });
    this.words.先に取る();
    /* 音は 本体の 仕組みを 借りる（新しく 作らない） */
    this.audio = (this.app && this.app.audio) || null;

    /* しまって あれば 戻す */
    await this._読む();
    this._知らせ(this.worldName + " へ ようこそ");
    if (this.quest && this.quest.章) this._章を出す(this.quest.章);
    if (!this.input) {
      this.input = new Input(this.canvas);
      /* ★★ `enable()` は 存在しない（2026-09-02・実測で 見つけた）★★
         `this.input.enable && this.input.enable()` と 書いて いたので
         **&& が 短絡して 何も 繋がって いなかった**。
         結果、パソコンでは **鍵盤も マウスも 一度も 効いて いなかった**。
         指が 動いて いたのは、TouchPad が 自分で 出来事を 拾う から。
         正しい 名前は attach()。走るモードは 最初から こちらを 使って いる。 */
      this.input.attach();
      /* ★ 指の 端末なら **必ず** 棒を 出す（2026-09-02）。
         画質の 段で 決めて いたので、良い スマホでは 出ず、
         動けない ままに なって いた。 */
      if (this._isTouch()) {
        this.touch = new TouchPad(this.input);
        this.el.appendChild(this.touch.el);
        /* ★ **true を 渡す**（2026-09-02・実測で 見つけた）。
           show() は `visible = !!on` なので、引数なしで 呼ぶと
           visible が false の まま。棒は 出るのに **指が 効かない**。 */
        this.touch.show && this.touch.show(true);
        this.el.classList.add("is-touch");
      }
    }
    this.resize();
    this.ready = true;
  }

  _isTouch() {
    try { return window.matchMedia("(pointer: coarse)").matches; } catch (e) { return false; }
  }

  /** 海でも 山の 上でも ない、歩き出しやすい ところを 探す。 */
  _findStart() {
    for (let r = 0; r < 400; r++) {
      const a = r * 0.61803398875 * Math.PI * 2;
      const d = r * 9;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const t = this.terr.at(x, z);
      if (t.water) continue;
      if (t.h < SEA + 1.5) continue;
      if (this.terr.flatness(x, z) > 2.6) continue;
      return { x, z, biome: t.biome };
    }
    return { x: 0, z: 0, biome: "meadow" };
  }

  /* ★ 出る ときに **GL の 置き場を 返す**（2026-09-02・実測で 見つけた）。
     直す前は ready を 下ろす だけ だった。入り直す たびに
     `new ChunkManager` が 新しい 静的バッチを 作り、
     **前の 131 個（644KB）が そのまま 残って いた**。
     7 回 入り直すと 917 個・4.5MB。スマホでは そのうち 描けなく なる。
     ★ 形（メッシュ）は 残す。作り直すと 入り直しが 遅く なる し、
       同じ ものを もう一度 GPU へ 送る 意味も 無い。 */
  exit() {
    this.ready = false;
    try { this._しまう(); } catch (e) {}
    if (this.chunks) { try { this.chunks.destroy(); } catch (e) {} this.chunks = null; }
    if (this.weather && this.renderer) { try { this.weather.destroy(this.renderer); } catch (e) {} }
    if (this._buildBatch && this.renderer) {
      for (const h of this._buildBatch.values()) { try { this.renderer.dropBatch(h); } catch (e) {} }
      this._buildBatch.clear();
    }
    if (this.audio) { try { this.audio.stopMusic && this.audio.stopMusic(); } catch (e) {} }
    this._曲 = "";
  }

  resize(w, h2) {
    if (!this.renderer) return;
    try { this.renderer.resize(); } catch (e) {}
  }

  tick(dt) {
    this._frames++;
    if (!this.ready || !this.renderer) return;
    const D = Math.min(0.05, dt);
    this.input.pollPad && this.input.pollPad();

    /* ── 入力 ────────────────────────────────────────────────────
       ★★ 走るモードと **同じ 1 つの 実装**を 使う（2026-09-02）★★
       前は ここで 自前に 組み立てて いて、2 つ 間違えて いた:
         ① `Input` は キーを **e.code**（"KeyW"）で 持つのに
            `K["w"]` を 見て いた → 繋いでも WASD が 一生 効かない
         ② 前後の 向きが **逆**だった（棒を 上へ 押すと 後ろへ 進む）
       `input.build(cam)` は 走るモードで ずっと 動いて いる 実装。
       ここで 作り直さない。 */
    this._mv = this.input.build(this.cam, this._mv || {});
    const 動 = this._mv;
    const jump = 動.jump;
    const sprint = !!(this.input._any && this.input._any(["ShiftLeft", "ShiftRight"]));

    /* 見回す
       ★★ **二重に 縮めて いた**（2026-09-02・実測で 見つけた）★★
         `cam.rotate()` の 中で すでに 0.0032 倍 して いるのに、
         ここでも 0.0042 倍 して いた。
         192 画素 動かして **0.0026 ラジアン（0.15 度）**＝ 動かないのと 同じ。
       ★ Q / E と ゲームパッドの 右の 棒も 混ぜたい ので、
         走るモードと 同じ `takeLook(dt)` を 通す。 */
    const lk = this.input.takeLook(D);
    if (lk.dx || lk.dy) this.cam.rotate(lk.dx, lk.dy);
    const zm = this.input.takeZoom && this.input.takeZoom();
    if (zm && this.cam.zoom) this.cam.zoom(zm);

    /* ── 進める ── */
    this.player.update(D, 動, this.cam.yaw, jump, sprint);
    const P = this.player.pos;
    this.cam.update(D, P, this.player.speed, this.canvas.width / Math.max(1, this.canvas.height));

    /* ── 世界 ── */
    this.chunks.update(P[0], P[2], D * 1000);
    this.time = (this.time + (D / this.dayLen) * 24) % 24;
    const 場 = this.terr.at(P[0], P[2]);
    const biome = 場.biome;
    this.sky.apply(biome, this.time, this.settings);
    this.weather.update(D, biome, this.time, P);
    this.weather.apply(this.renderer, biome);
    /* ★ 遠くの 地平（2026-09-02）。無いと 世界が 霧で 切れて 見え、
       「その先が ある」感じが 出ない。空の シェーダに 尾根を 描かせる。 */
    const B0 = this.terr.at(P[0], P[2]).B;
    this.renderer.sky.land = {
      h: 0.055 + 場.mountain * 0.05, sharp: 2.6, base: 0.008,
      a: [B0.霧[0] * 0.60, B0.霧[1] * 0.62, B0.霧[2] * 0.68],
      b: [B0.霧[0] * 0.40, B0.霧[1] * 0.44, B0.霧[2] * 0.54]
    };
    if (this.quest) this.quest.行った報告(biome);

    /* ── 敵 ── */
    /* 夜の 強さ（0＝昼 1＝真夜中）。洞窟の 中は いつでも 夜と 同じ。 */
    {
      const t = this.time;
      const 暗 = (t < 5 || t > 20) ? 1 : (t < 7 ? (7 - t) / 2 : (t > 18 ? (t - 18) / 2 : 0));
      this.combat.夜 = this.洞窟 ? 1 : Math.max(0, Math.min(1, 暗));
    }
    this.combat.update(D, this.chunks, this.player, Date.now());
    this._主を見る(D, biome, P);

    /* ── 採れる もの・叩ける 敵を さがす ── */
    this.狙い = this.gather.近くの(this.chunks, P[0], P[2], 3.4);
    const st = this.inv.status();
    this.狙い敵 = this.combat.近くの(P[0], P[2], st.間 + 0.6);

    /* ── 押した ── */
    this._操作(D, st, P);

    /* ── 洞窟 ── */
    if (this.洞窟) { this._洞窟の中(D, P); }
    else {
      const c = this.caves.近くの(P[0], P[2]);
      this.近くの入口 = (c && c.dist < 4.2) ? c : null;
    }

    /* ── 町 ── */
    this.いる町 = this.洞窟 ? null : this.town.中に(P[0], P[2]);
    if (this.いる町 && !this.行った町.has(this.いる町.id)) {
      this.行った町.set(this.いる町.id, {
        id: this.いる町.id, 名: this.いる町.名,
        x: this.いる町.x, z: this.いる町.z
      });
      this._知らせ(this.いる町.名 + " を 見つけた（帰って これる）", "good");
      this._しまう();
    }
    this.近くの人 = this.いる町 ? this.town.近くの人(this.いる町, P[0], P[2], 3.2) : null;
    /* 近くの 設備（はたけ・たからばこ）。話す ボタンで 使う。 */
    if (!this.近くの人) {
      const o = this.build.近くの(P[0], P[2], 3.4);
      /* ★ たき火も 「使える もの」に する（2026-09-02）。
         夜は 敵が 強い のに、朝を 待つ 手立てが 無かった。 */
      this.近くの設備 = (o && (o.畑 || o.箱 || o.id === "b_fire")) ? o : null;
    } else this.近くの設備 = null;
    /* 町の 中は 安全（敵を 追い出す） */
    if (this.いる町) {
      for (let i = this.combat.list.length - 1; i >= 0; i--) {
        const e = this.combat.list[i];
        if (Math.hypot(e.pos[0] - this.いる町.x, e.pos[2] - this.いる町.z) < this.いる町.半径) this.combat.list.splice(i, 1);
      }
    }

    /* ── ことば（敵と 向き合った ときだけ）── */
    /* ── つり ─────────────────────────────────────────────────── */
    /* ★ 「泳いで いる」で 外しては いけない（2026-09-02・実測）。
       swimming は 高さ SEA+0.4 より 下で 立つ ので、**波打ちぎわに
       立って いる だけ**でも true に なる。つりは そこで する もの。
       外すのは **足もとが 水その もの**の ときだけ。 */
    this.水べ = (this.洞窟 || this.terr.at(P[0], P[2]).water) ? "" : this.fish.水べ(P[0], P[2]);
    this.竿の効き = this.fish.竿(ITEM);
    {
      const f = this.fish.update(D);
      if (f && f.かかった) {
        this._知らせ("かかった！ いま あげる", "good");
        try { if (this.audio) this.audio.bounce(); } catch (e) {}
      } else if (f && f.にげた) {
        this._知らせ("逃げられた", "warn");
      }
    }
    /* 水から 離れたら 糸を 切る */
    if (this.fish.状 && !this.水べ) { this.fish.やめる(); this._知らせ("糸を 上げた"); }

    if (this.words.ころ合い(D, !!this.狙い敵 && !this.いる町)) this.words.出す();

    /* ── 音 ── */
    this._音(D, biome, P);

    /* ── 体の ぐあい（寒さ・熱さ・毒）── */
    this._からだ(D, 場);

    /* ── ときどき しまう ── */
    this._save待 -= D;
    if (this._save待 <= 0) { this._save待 = 20; this._しまう(); }

    /* ── 描く ── */
    const R = this.renderer;
    if (this.洞窟) this._洞窟の空(R);
    R.shadowCenter = [P[0], P[1], P[2]];
    R.shadowRadius = 26;
    R.begin(this.cam);
    /* ★ 洞窟の 中では **外の 地面を 描かない**（2026-09-02）。
       描くと 頭の 上に 外の 草原が 見えて、穴に 落ちた だけに 見える
       （実写で そうなって いた）。 */
    if (!this.洞窟) { this.chunks.draw(R); this._drawTown(R, P); }
    else { this._洞窟の部屋(R); this._洞窟の宝(R); }
    this._洞窟を描く(R);
    this._drawBuilds(R, P);
    this._drawMobs(R, D);
    this._drawPlayer(R);
    this._drawMark(R, P);
    this._drawWater(R, P);
    this.weather.draw(R, this.cam, D);
    R.end(D);

    /* ── 目安 ── */
    /* HUD（軽い ものだけ 毎コマ） */
    try { this.hud.tick(); } catch (e) {}

    this._acc += D;
    if (this._acc > 0.4) {
      this._acc = 0;
      this._fps = Math.round(1 / Math.max(0.001, D));
      this._paintDebug(biome);
    }
  }

  /* ══ 遊びの 中身 ═════════════════════════════════════════════ */

  _敵id(def) {
    if (!this.__eidx) {
      this.__eidx = new Map();
      for (const k in ENEMIES_TABLE) this.__eidx.set(ENEMIES_TABLE[k], k);
    }
    return this.__eidx.get(def) || "";
  }

  _知らせ(文, 色) {
    this.log.unshift({ t: Date.now(), 文, 色: 色 || "" });
    if (this.log.length > 6) this.log.length = 6;
    this._logDirty = true;
  }

  /* ══ 町へ 帰る（2026-09-02）══════════════════════════════════════
     案内人に 金を 払って、行った ことの ある 町へ 移る。
     ★ 遠いほど 高い。ただで 飛べると 歩く 意味が 消える。
     ★ 洞窟の 中からは 使えない（高さを すり替えて いる ので 危ない）。 */
  町の運賃(t) {
    const P = this.player.pos;
    const d = Math.hypot(t.x - P[0], t.z - P[2]);
    return 4 + Math.floor(d / 260);
  }

  町へ帰る(t) {
    if (this.洞窟) return { ok: false, 訳: "ほらあなの 中では 頼めません。" };
    const 金 = this.町の運賃(t);
    if (this.inv.count("kin_ka") < 金) return { ok: false, 訳: "金貨が " + 金 + " 要ります。" };
    this.inv.remove("kin_ka", 金);
    this.player.pos[0] = t.x; this.player.pos[2] = t.z;
    this.player.pos[1] = this.terr.height(t.x, t.z) + 1;
    this.player.vel[0] = this.player.vel[1] = this.player.vel[2] = 0;
    this.cam.snap(this.player.pos, this.cam.yaw);
    this.combat.list.length = 0;
    this._知らせ(t.名 + " へ 帰った（−" + 金 + " 金）", "good");
    try { if (this.audio) this.audio.checkpoint(); } catch (e) {}
    this._しまう();
    return { ok: true, 金 };
  }

  /* 物語を 見おえた ときの 幕。歩いた あとを 数えて 出す。 */
  _おわり() {
    if (this._おわり済) return;
    this._おわり済 = true;
    const 種 = new Set();
    for (const s of this.inv.slots) if (s) 種.add(s.id);
    const 語 = [
      "段位 " + this.combat.lv,
      "見つけた もの " + 種.size + " 種",
      "建てた もの " + this.build.数() + " 個",
      "倒した 相手 " + (this.combat.倒した || 0)
    ].join("　");
    this._章幕 = {
      題: "物語は おわった",
      語: "光が 引いた あと、草原の 匂いが した。ここから 先は、好きに 歩いて いい。\n" + 語,
      t: 0, 長: 12
    };
    this._知らせ("物語を 見おえた。世界は 続く。", "good");
    try { if (this.audio) this.audio.checkpoint(); } catch (e) {}
    this._しまう();
  }

  _章を出す(章) {
    if (!章) return;
    this._章幕 = { 題: 章.題, 語: 章.語, t: 0 };
  }

  _打たれる(atk, D) {
    const st = this.inv.status();
    const 減 = Math.max(1, Math.round(atk - st.守 * 0.7));
    this.player.hp = Math.max(0, this.player.hp - 減);
    this.cam.hit && this.cam.hit(Math.min(1, 減 / 20));
    if (D && D.毒) this.毒 = Math.max(this.毒, D.毒 * 6);
    if (this.player.hp <= 0) this._たおれる();
  }

  _たおれる() {
    /* ★ 死んでも **何も 消さない**。持ちものを 失う 遊びは、
       この アプリの 使われかた（すきま時間）に 合わない。
       近くの 安全な ところへ 戻し、時刻を 朝に する。 */
    this.player.hp = Math.round(this.player.maxHp * 0.5);
    const s = this._findStart();
    this.player.pos[0] = s.x; this.player.pos[2] = s.z;
    this.player.pos[1] = this.terr.height(s.x, s.z) + 1;
    this.player.vel[0] = this.player.vel[1] = this.player.vel[2] = 0;
    this.time = 7.5;
    this.毒 = 0; this.寒 = 0; this.熱 = 0;
    this.combat.list.length = 0;
    this._知らせ("目がさめた。はじめの場所へ もどった。", "warn");
  }

  _からだ(dt, 場) {
    const b = 場.biome;
    /* 雪原は 寒い・火山は 熱い。薬で ふせげる。 */
    if (b === "snow") this.寒 = Math.min(100, this.寒 + dt * 3.2);
    else this.寒 = Math.max(0, this.寒 - dt * 6);
    if (b === "volcano") this.熱 = Math.min(100, this.熱 + dt * 3.6);
    else this.熱 = Math.max(0, this.熱 - dt * 6);
    if (this.守り寒 > 0) { this.守り寒 -= dt; this.寒 = Math.max(0, this.寒 - dt * 8); }
    if (this.守り熱 > 0) { this.守り熱 -= dt; this.熱 = Math.max(0, this.熱 - dt * 8); }
    if (this.毒 > 0) {
      this.毒 -= dt;
      this._毒刻 = (this._毒刻 || 0) + dt;
      if (this._毒刻 > 1) { this._毒刻 = 0; this.player.hp = Math.max(1, this.player.hp - 2); }
    }
    if (this.寒 > 80 || this.熱 > 80) {
      this._環刻 = (this._環刻 || 0) + dt;
      if (this._環刻 > 1) { this._環刻 = 0; this.player.hp = Math.max(0, this.player.hp - 3);
        if (this.player.hp <= 0) this._たおれる(); }
    }
    /* すこしずつ 治る */
    if (this.player.hp < this.player.maxHp && this.毒 <= 0 && this.寒 < 60 && this.熱 < 60) {
      this._治刻 = (this._治刻 || 0) + dt;
      if (this._治刻 > 3) { this._治刻 = 0; this.player.hp = Math.min(this.player.maxHp, this.player.hp + 1); }
    }
  }

  _操作(dt, st, P) {
    const K = this.input.keys;
    const now = Date.now();
    /* 叩く／採る（Space または 触る ボタン） */
    /* ★ キーは **e.code**。" " や "e" では 一生 当たらない。 */
    const 押 = !!(K["Space"] || K["KeyE"] || K["Enter"] || this._tapAct);
    this._tapAct = false;
    if (押) {
      if (this.建てるか && this.置くもの) { this._置く(P); return; }
      /* ★ つりが 先（2026-09-02）。糸を 出して いる 間は 叩かない。
         叩くと 手前の 草を 刈って しまい、合わせられない。 */
      if (this.fish.状) { this._つりあげる(); return; }
      if (this.水べ && this.竿の効き > 0 && !this.狙い敵) { this._つる(); return; }
      if (this.狙い敵) {
        const r = this.combat.攻める(this.狙い敵, st.攻, !!(K["ShiftLeft"] || K["ShiftRight"]));
        this._振り = 1;
        if (r.当) {
          this._知らせ(this.狙い敵.def.名 + " に " + r.与);
          try { if (this.audio) { if (r.倒) this.audio.checkpoint(); else this.audio.hit(); } } catch (e) {}
        }
        return;
      }
      if (this.狙い) {
        this._振り = 1;
        const r = this.gather.hit(this.狙い, st.道具, st.道具型, now);
        try { if (this.audio) { if (r && r.終) this.audio.bounce(); else this.audio.land(); } } catch (e) {}
        if (r && r.終) this.たたき = 0; else this.たたき = (r ? r.残 : 0);
      }
    }
  }

  /* ══ 休む（2026-09-02）════════════════════════════════════════
     たき火の そばで 朝まで 休む。体力が 戻り、時刻が 6 時に なる。
     ★ 敵が 近くに いる ときは 休めない。逃げ場に なると 戦いが 消える。
     ★ 食べものを 1 つ 使う。ただで 夜を 飛ばせると 夜が 意味を 失う。 */
  休む() {
    if (this.洞窟) return { ok: false, 訳: "ほらあなの 中では 休めません。" };
    const P = this.player.pos;
    const 近 = this.combat.近くの(P[0], P[2], 22);
    if (近) return { ok: false, 訳: (近.def.名 || "敵") + " が 近くに います。" };
    /* 食べものを 1 つ */
    let 食 = "";
    for (const sl of this.inv.slots) if (sl && ITEM[sl.id] && ITEM[sl.id].種 === "food") { 食 = sl.id; break; }
    if (!食) return { ok: false, 訳: "食べものが 要ります（1 つ）。" };
    this.inv.remove(食, 1);
    this.player.hp = this.player.maxHp;
    this.player.stamina = this.player.maxStamina;
    this.毒 = 0; this.寒 = 0; this.熱 = 0;
    /* 夜の あいだに 湧いた ものは 散る */
    this.combat.list.length = 0;
    const 前 = this.time;
    this.time = 6.0;
    this._知らせ(item名(食) + " を 食べて 休んだ。朝に なった。", "good");
    try { if (this.audio) this.audio.checkpoint(); } catch (e) {}
    this._しまう();
    return { ok: true, 食, 前, 後: this.time };
  }

  /* つりを 投げる／あげる */
  _つる() {
    const r = this.fish.投げる(this.水べ, this.竿の効き);
    if (!r.ok) { this._知らせ(r.訳, "warn"); return; }
    this._知らせ("糸を 投げた");
    try { if (this.audio) this.audio.land(); } catch (e) {}
  }

  _つりあげる() {
    const r = this.fish.あげる();
    if (!r.ok) { this._知らせ(r.訳, "warn"); return; }
    this._知らせ(item名(r.何) + " が つれた" + (r.数 > 1 ? " ×" + r.数 : ""), "good");
    if (r.余 > 0) this._知らせ("持ちものが いっぱい", "warn");
    try { if (this.audio) this.audio.right(); } catch (e) {}
    if (this.quest) this.quest.見る();
    if (this.errand) this.errand.作った && this.errand.作った(r.何, r.数);
  }

  _置く(P) {
    const it = ITEM[this.置くもの];
    if (!it) return;
    /* ★ 「見ている 先」は **−sin, −cos**（2026-09-02・実測）。
       カメラの 目は yaw=0 で z=+6.9 に あり、人は −z を 向いて いる。
       前は +sin,+cos で 置いて いたので、**振り返らないと 見えない**
       ところに 建って いた（実写で 家の 中に カメラが 入った）。 */
    const 前 = this.cam.yaw;
    const x = 格子へ(P[0] - Math.sin(前) * 2.4);
    const z = 格子へ(P[2] - Math.cos(前) * 2.4);
    const y = Math.round(this.terr.height(x, z) * 2) / 2;
    const r = this.build.置く(this.置くもの, x, y, z, Math.round(前 / (Math.PI / 2)) * (Math.PI / 2));
    if (!r.ok) this._知らせ(r.訳, "warn");
    else { this._知らせ(it.名 + " を おいた"); if (this.quest) this.quest.見る(); }
  }

  /* ══ 設計図で 建てる（2026-09-02）════════════════════════════════
     立って いる ところの **前**へ、向いて いる 向きで 建てる。
     ★ 足元では なく 少し 前に する。足元に 建てると 中に 埋まる。
     ★ 高さは **建てはじめる ところ**に そろえる。1 個ずつ 地面に
       貼ると、坂で 家が ばらばらに なる。 */
  設計図を建てる(bp) {
    if (this.洞窟) return { ok: false, 訳: "ほらあなの 中では 建てられません。" };
    const P = this.player.pos;
    const 前 = Math.round(this.cam.yaw / (Math.PI / 2)) * (Math.PI / 2);
    const 大 = 大きさ(bp);
    /* 建物の 真ん中が 前に 来るように、手前左の 角を 求める */
    const cx = P[0] - Math.sin(前) * (3 + 大.d);
    const cz = P[2] - Math.cos(前) * (3 + 大.d);
    const hx = (大.w - 1) * 格子 * 0.5, hz = (大.d - 1) * 格子 * 0.5;
    const c = Math.cos(前), sn = Math.sin(前);
    const x = 格子へ(cx - (hx * c - hz * sn));
    const z = 格子へ(cz - (hx * sn + hz * c));
    const y = Math.round(this.terr.height(cx, cz) * 2) / 2;
    const r = this.build.設計図で建てる(bp, x, y, z, 前);
    if (r.ok && this.quest) this.quest.見る();
    if (r.ok) { try { if (this.audio) this.audio.right(); } catch (e) {} }
    return r;
  }

  async _しまう() {
    if (!this.inv) return;
    try {
      await Save.save(this.seed, {
        v: 1, t: Date.now(),
        /* ★ 見出し（2026-09-02）。ロビーの 世界の 一覧で 使う。
           これが 無いと 種の 数字だけ 並び、どれが どれか 分からない。 */
        見: {
          名: worldName(this.seed),
          段: this.combat ? this.combat.lv : 1,
          章: (this.quest && this.quest.章) ? this.quest.章.題 : "",
          節: this.quest ? this.quest.i : 0,
          風: this.terr ? this.terr.at(this.player.pos[0], this.player.pos[2]).biome : ""
        },
        pos: this.player.pos.slice(), time: this.time,
        inv: this.inv.toJSON(), build: this.build.toJSON(),
        gather: this.gather.toJSON(), combat: this.combat.toJSON(),
        quest: this.quest.toJSON(), errand: this.errand.toJSON(),
        町: Array.from(this.行った町.values()),
        見つけた: Array.from(this.見つけた),
        倒した種: Array.from(this.倒した種),
        hp: this.player.hp
      });
    } catch (e) {}
  }

  async _読む() {
    /* ★★ 世界を またぐ ときは **先に まっさらに する**（2026-09-02・実測）★★
       inv・ずかん・行った町は **画面を 作った ときに 1 回だけ** 作られる
       ので、別の 種で 入り直しても そのまま 残って いた。
       「あたらしい 世界」を 選んでも 前の 世界の 持ちものが 手に あり、
       ずかんも 埋まった ままに なる（実測で 真珠 5 個が ついて きた）。
       段位・建てた もの・物語は enter() で 作り直すので 元から 正しい。
       ここだけ ずれて いた。 */
    this.inv.slots = new Array(this.inv.n).fill(null);
    this.inv.equip = { weapon: "", tool: "", helm: "", chest: "", legs: "", boots: "" };
    this.見つけた.clear();
    this.倒した種.clear();
    this.行った町.clear();
    this._おわり済 = false;

    let j = null;
    try { j = await Save.load(this.seed); } catch (e) {}
    if (!j) return false;
    try {
      if (j.inv) { const inv = Inventory.fromJSON(j.inv); this.inv.slots = inv.slots; this.inv.equip = inv.equip; }
      if (j.build) this.build.load(j.build);
      if (j.gather) this.gather.load(j.gather);
      if (j.combat) this.combat.load(j.combat);
      if (j.quest) this.quest.load(j.quest);
      if (j.errand && this.errand) this.errand.load(j.errand);
      if (Array.isArray(j.町)) for (const t of j.町) this.行った町.set(t.id, t);
      if (Array.isArray(j.見つけた)) for (const k of j.見つけた) this.見つけた.add(k);
      if (Array.isArray(j.倒した種)) for (const k of j.倒した種) this.倒した種.add(k);
      if (Array.isArray(j.pos)) {
        this.player.pos = j.pos.slice();
        this.cam.snap(this.player.pos, 0);
      }
      if (typeof j.time === "number") this.time = j.time;
      if (typeof j.hp === "number") this.player.hp = Math.max(1, j.hp);
      this._知らせ("つづきから はじめます");
      return true;
    } catch (e) { return false; }
  }

  /* ══ 洞窟 ═══════════════════════════════════════════════════════
     ★ 別の 世界を 作らない。**同じ 場に 潜って いる ことに する**。
       地面の 高さだけを 洞窟の 床に すり替える。区画は そのまま。
     ★ 出入りは 入口の 真上。迷子に しない。 */
  潜る() {
    if (this.洞窟 || !this.近くの入口) return false;
    const 中 = this.caves.中(this.近くの入口);
    this.洞外 = this.player.pos.slice();
    this.洞窟 = 中;
    this._元の高さ = this.terr.height.bind(this.terr);
    const c = this.近くの入口;
    /* 高さを 洞窟の 床へ すり替える */
    this.terr.height = (wx, wz) => {
      const f = this.caves.床(中, wx - c.x, wz - c.z);
      return f === null ? c.y + 2.4 : c.y + f;      /* 壁は 高く して 通れなく する */
    };
    this.player.pos[0] = c.x; this.player.pos[2] = c.z;
    this.player.pos[1] = c.y + 中.部屋[0].y;
    this.player.vel[0] = this.player.vel[1] = this.player.vel[2] = 0;
    this.cam.snap(this.player.pos, this.cam.yaw);
    this._知らせ(中.名 + " へ 入った", "good");
    this._章幕 = { 題: 中.名, 語: "暗い。灯りが 無いと 何も 見えない。", t: 0 };
    try { if (this.audio) { this.audio.startMusic("ruins"); this._曲 = "ruins"; } } catch (e) {}
    /* 中では **洞窟の 敵**が 湧く（外の 区画からは 湧かさない）。 */
    if (this.combat) { this.combat.洞 = 中; this.combat.list.length = 0; }
    return true;
  }

  出る() {
    if (!this.洞窟) return false;
    if (this._元の高さ) this.terr.height = this._元の高さ;
    this._元の高さ = null;
    const c = this.洞窟.入;
    this.洞窟 = null;
    this.player.pos[0] = c.x; this.player.pos[2] = c.z;
    this.player.pos[1] = this.terr.height(c.x, c.z) + 1.2;
    this.player.vel[0] = this.player.vel[1] = this.player.vel[2] = 0;
    this.cam.snap(this.player.pos, this.cam.yaw);
    this._知らせ("外へ 出た");
    this._曲 = "";
    if (this.combat) { this.combat.洞 = null; this.combat.list.length = 0; }
    return true;
  }

  _洞窟の中(dt, P) {
    const c = this.洞窟.入;
    /* 入口の そばへ 戻ると 外へ 出られる */
    const d = Math.hypot(P[0] - c.x, P[2] - c.z);
    this.近くの入口 = d < 3.4 ? c : null;
    /* 実りを 拾う（近づくだけで 取れる。暗い ので 叩かせない） */
    for (const g of this.洞窟.資源) {
      if (g.取った) continue;
      const gx = c.x + g.x, gz = c.z + g.z;
      if (Math.hypot(P[0] - gx, P[2] - gz) > 2.0) continue;
      g.取った = true;
      const 余 = this.inv.add(g.何, 1 + Math.floor(Math.random() * 2));
      this._知らせ(item名(g.何) + " を 見つけた", "good");
      try { if (this.audio) this.audio.bounce(); } catch (e) {}
      if (this.quest) this.quest.見る();
    }
    /* ══ 奥の 番人と 宝（2026-09-02）══════════════════════════════════
       ★ 番人は **奥の 部屋に 入って から**出す。入口から 出すと
         灯りも 武器も 無い うちに 殺される。
       ★ 宝は 番人を 倒すまで 開かない。開けたら もう 開かない。 */
    const 洞 = this.洞窟;
    const 奥 = 洞.部屋[洞.部屋.length - 1];
    const 奥d = Math.hypot(P[0] - (c.x + 奥.x), P[2] - (c.z + 奥.z));
    if (洞.番人 && !洞.番人を出した && 奥d < 奥.半 + 6) {
      洞.番人を出した = true;
      const e = this.combat.主を出す(洞.番人, c.x + 奥.x + 4, c.z + 奥.z + 4);
      if (e) {
        e.pos[1] = this.terr.height(e.pos[0], e.pos[2]);
        this._知らせ((e.def.名 || "番人") + " が 目を 覚ました", "warn");
        this._章幕 = { 題: e.def.名 || "番人", 語: e.def.記 || "宝を 守る もの。", t: 0 };
      }
    }
    const 宝 = 洞.宝;
    if (宝 && !宝.開けた) {
      const 番生 = 洞.番人 && !this.combat.倒した主.has(洞.番人);
      if (奥d < 3.0 && !番生) {
        宝.開けた = true;
        const 名 = [];
        for (const [id, n] of 宝.中身) { this.inv.add(id, n); 名.push(item名(id) + "×" + n); }
        this._知らせ("宝の 箱: " + 名.join("、"), "good");
        try { if (this.audio) this.audio.right(); } catch (e) {}
        if (this.quest) this.quest.見る();
      } else if (奥d < 3.0 && 番生) {
        this.近くの入口 = null;
      }
    }
  }

  /* ══ 音 ═══════════════════════════════════════════════════════
     ★ 曲は **風土ごと**。同じ 曲だと 10 種類の 景色が 耳では 1 つに なる。
     ★ 夜は 静かな 曲へ。天気でも 変える。 */
  _音(dt, biome, P) {
    if (!this.audio) return;
    const 夜 = this.time < 5.4 || this.time > 19.4;
    const 曲 = this.いる町 ? "calm"
      : 夜 ? "sunset"
      : ({ meadow: "meadow", forest: "forest", shore: "meadow", highland: "sky",
           snow: "ice", volcano: "lava", swamp: "ruins", desert: "sunset",
           ruin: "ruins", crystal: "neon" }[biome] || "meadow");
    if (曲 !== this._曲) {
      this._曲 = 曲;
      try { this.audio.startMusic(曲); } catch (e) {}
    }
    /* 足音（走って いる ときだけ・間を あける） */
    const p = this.player;
    if (p.grounded && p.speed > 1.2) {
      this._歩音 -= dt * p.speed;
      if (this._歩音 <= 0) {
        this._歩音 = p.sprinting ? 2.6 : 3.4;
        try { this.audio.land && this.audio.land(); } catch (e) {}
      }
    } else this._歩音 = 0;
  }

  /* ★ 物語の 主（ボス）を 出す（2026-09-02）。
     直す前: 主は **どこにも 湧かなかった**。風土の 「出る」に 入って いないし、
     主を出す() を 呼ぶ ところが 無かった。
     つまり **第二章で 物語が 進まなく なる**（実際に そうなって いた）。
     いまの 節が その 主を 求めて いて、その 土地に 居る ときだけ 出す。 */
  _主を見る(dt, biome, P) {
    this._主待 = (this._主待 || 0) - dt;
    if (this._主待 > 0) return;
    this._主待 = 2.5;
    const q = this.quest;
    if (!q || !q.節) return;
    const y = q.節.やる;
    if (y.型 !== "倒") return;
    const 場 = 主の居場所[y.誰];
    if (!場) return;                    /* ふつうの 敵は これまで どおり 湧く */
    if (場 !== biome) return;           /* その 土地に 入って いない */
    if (this.combat.倒した主.has(y.誰)) return;
    if (this.combat.list.some((e) => this._敵id(e.def) === y.誰)) return;
    /* 少し 離れた ところへ 出す（真横に 湧かせない） */
    const a = Math.random() * Math.PI * 2;
    const d = 26 + Math.random() * 16;
    const x = P[0] + Math.cos(a) * d, z = P[2] + Math.sin(a) * d;
    if (this.terr.at(x, z).water) return;
    const e = this.combat.主を出す(y.誰, x, z);
    if (e) {
      this._知らせ("【" + e.def.名 + "】 が 現れた", "warn");
      this._章幕 = { 題: e.def.名, 語: e.def.記, t: 0 };
      try { if (this.audio) this.audio.startMusic("arena"); } catch (er) {}
      this._曲 = "arena";
    }
  }

  _drawPlayer(R) {
    const P = this.player.pos, y = this.player.yaw;
    const 沈 = this.player.swimming ? -0.35 : 0;
    const b = Math.sin(this.player.bob) * 0.06 * Math.min(1, this.player.speed / 6);
    const bx = P[0], by = P[1] + 沈 + b, bz = P[2];
    /* ══ 人（2026-09-02 に 作り直し）═══════════════════════════════
       直す前は **カプセル 1 つ ＋ 球 1 つ**。だから 瓶に 見えて いた
       （Rinty さん「人の テクスチャが 終わってる」）。
       胴・頭・髪・腕 2 本・脚 2 本・足 2 つ に 分け、
       **歩くと 手足が 振れる**ように する。
       肌（テクスチャ）より 「動く 手足」の ほうが ずっと 人に 見える。 */
    const 速 = Math.min(1, this.player.speed / 4.6);
    const 歩 = this.player.bob * 2.0;
    const 振 = Math.sin(歩) * 0.7 * 速;      /* 腕と 脚の 振り */
    const 振2 = Math.sin(歩 + Math.PI) * 0.7 * 速;
    const 肌色 = [0.94, 0.78, 0.66];
    const 服 = [0.30, 0.46, 0.78];
    const 髪 = [0.28, 0.20, 0.16];
    const 靴 = [0.26, 0.22, 0.20];

    /* 割りつけ: 足 0 → 腰 0.72 → 肩 1.20 → 頭 1.36 */
    const 腰H = 0.72, 肩H = 1.20, 頭H = 1.36;
    /* 胴（腰を 原点に 上へ） */
    trs(m4, bx, by + 腰H, bz, 1, 1, 1, y);
    R.draw("pc_torso", m4, 服, 0, 0.18, 0, 0, 1.0);
    /* 頭・髪 */
    trs(m4, bx, by + 頭H, bz, 1, 1, 1, y);
    R.draw("pc_head", m4, 肌色, 0, 0.20, 0, 0, 0.7);
    R.draw("pc_hair", m4, 髪, 0, 0.18, 0, 0, 0.7);
    /* 腕（肩を 中心に 前後へ 振る） */
    const 肩W = 0.235;
    trsp(m4, bx + Math.cos(y) * 肩W, by + 肩H, bz - Math.sin(y) * 肩W, 1, 1, 1, y, 振);
    R.draw("pc_arm", m4, 服, 0, 0.16, 0, 0, 0.7);
    trsp(m4, bx - Math.cos(y) * 肩W, by + 肩H, bz + Math.sin(y) * 肩W, 1, 1, 1, y, 振2);
    R.draw("pc_arm", m4, 服, 0, 0.16, 0, 0, 0.7);
    /* 脚（腰を 中心に 振る。足は 脚と 同じ 行列に 乗せる） */
    const 腰W = 0.115;
    trsp(m4, bx + Math.cos(y) * 腰W, by + 腰H, bz - Math.sin(y) * 腰W, 1, 1, 1, y, 振2);
    R.draw("pc_leg", m4, 服, 0, 0.14, 0, 0, 0.9);
    R.draw("pc_foot", m4, 靴, 0, 0.16, 0, 0, 0.9);
    trsp(m4, bx - Math.cos(y) * 腰W, by + 腰H, bz + Math.sin(y) * 腰W, 1, 1, 1, y, 振);
    R.draw("pc_leg", m4, 服, 0, 0.14, 0, 0, 0.9);
    R.draw("pc_foot", m4, 靴, 0, 0.16, 0, 0, 0.9);
    /* ★ 持って いる ものを **手に 出す**（2026-09-02）。
       装った ことが 画面で 分からないと、そろえる 気に ならない。
       敵が 近い ときは 武器、そうで なければ 道具。 */
    const eq = this.inv.equip;
    const 出す = (this.狙い敵 ? eq.weapon : (this.狙い ? eq.tool : (eq.weapon || eq.tool)));
    const it = ITEM[出す];
    if (!it || !it.型) return;
    const mesh = "w_" + it.型;
    if (!R.hasMesh(mesh)) return;
    /* 振り（叩いた 直後だけ 前へ 振る） */
    this._振り = Math.max(0, (this._振り || 0) - 0.06);
    const sw = Math.sin(this._振り * Math.PI) * 1.1;
    const hx = P[0] + Math.cos(y) * 0.44 + Math.sin(y) * (0.24 + sw * 0.5);
    const hz = P[2] - Math.sin(y) * 0.44 + Math.cos(y) * (0.24 + sw * 0.5);
    trs(m4, hx, P[1] + 沈 + b + 0.60 - sw * 0.28, hz, 0.9, 0.9, 0.9, y + sw * 0.5);
    R.draw(mesh, m4, it.色, 0, 0.30, 0, 0, 1.2);
  }

  /* 建てた もの。区画ごとに **静的バッチ**（変わった ときだけ 作り直す）。 */
  _drawBuilds(R, P) {
    const CKW = 64;
    /* 変わった 区画を 作り直す（1 フレームに 1 つ まで） */
    if (this._buildDirty.size) {
      const k = this._buildDirty.values().next().value;
      this._buildDirty.delete(k);
      const old = this._buildBatch.get(k);
      if (old) { R.dropBatch(old); this._buildBatch.delete(k); }
      const [cx, cz] = k.split(",").map(Number);
      const list = this.build.区の(cx, cz);
      if (list.length) {
        const 束 = {};
        for (const o of list) {
          const it = ITEM[o.id];
          if (!it) continue;
          const mesh = it.mesh || "blk_cube";
          (束[mesh] || (束[mesh] = [])).push(o);
        }
        for (const mesh in 束) {
          const arr = 束[mesh];
          const data = new Float32Array(arr.length * 24);
          for (let i = 0; i < arr.length; i++) {
            const o = arr[i], it = ITEM[o.id];
            const 光 = (o.id === "b_torch" || o.id === "b_fire") ? 0.85 : 0;
            trs(m4, o.x, o.y, o.z, 2, 2, 2, o.yaw || 0);
            R2.writeInstance(data, i, m4, it.色, 光, 0.16, 0, 0);
          }
          const hb = R.addBatch(mesh, data, {
            center: [cx * CKW + CKW / 2, 0, cz * CKW + CKW / 2], radius: CKW });
          if (hb) {
            const cur = this._buildBatch.get(k);
            if (cur) cur.push(hb); else this._buildBatch.set(k, [hb]);
          }
        }
      }
    }
    for (const list of this._buildBatch.values()) {
      if (Array.isArray(list)) for (const b of list) R.drawBatch(b);
      else R.drawBatch(list);
    }
  }

  /* 町（家と 人）。近い ときだけ。 */
  /* 洞窟の 中の 空と 光（真っ暗に しない・でも 狭く 見せる） */
  _洞窟の空(R) {
    const 灯 = this.inv.count("b_torch") > 0 || this.inv.count("hikari_koke") > 0;
    const k = 灯 ? 1 : 0.62;
    /* ★ 灯りの 色は **あたたかい 橙**。青白いと 岩が 影絵に 見えて
       「暗い」だけに なる（実写で そうだった・2026-09-02）。 */
    R.sky.top = [0.04, 0.03, 0.03]; R.sky.horizon = [0.07, 0.05, 0.04];
    R.sky.ground = [0.04, 0.03, 0.03]; R.sky.sun = [0.26, 0.19, 0.13]; R.sky.stars = 0;
    R.light.dir = [-0.44, -0.7, -0.56];
    R.light.color = [1.02 * k, 0.78 * k, 0.5 * k];
    R.ambTop = [0.3 * k, 0.24 * k, 0.24 * k];
    R.ambBottom = [0.17 * k, 0.13 * k, 0.14 * k];
    R.fog.color = [0.05, 0.035, 0.035];

    R.fog.near = 灯 ? 20 : 12;
    R.fog.far = 灯 ? 56 : 34;
    R.sky.land = null;
  }

  /* 洞窟の 部屋（床と 天井と 壁）。**丸い 板を 重ねる**だけ。
     本物の 穴を 掘ると 頂点が 増えて スマホで 落ちる。 */
  _洞窟の部屋(R) {
    const c = this.洞窟.入;
    const B = BIOMES[c.biome] || BIOMES.meadow;
    const 岩 = [B.岩[0] * 0.86, B.岩[1] * 0.80, B.岩[2] * 0.78];
    const 床 = [B.岩[0] * 0.62, B.岩[1] * 0.56, B.岩[2] * 0.54];
    for (const p of this.洞窟.部屋) {
      /* 床 */
      trs(m4, c.x + p.x, c.y + p.y - 0.5, c.z + p.z, p.半 * 2.1, 1.1, p.半 * 2.1, 0);
      R.draw("blk_slab", m4, 床, 0.06, 0.10, 0, 0, p.半 * 2);
      /* 天井 */
      trs(m4, c.x + p.x, c.y + p.y + 7.4, c.z + p.z, p.半 * 2.1, 1.1, p.半 * 2.1, 0);
      R.draw("blk_slab", m4, [岩[0] * 0.6, 岩[1] * 0.6, 岩[2] * 0.62], 0, 0.05, 0, 0, p.半 * 2);
      /* 壁（岩を ぐるり）*/
      const n = Math.max(7, Math.round(p.半));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        /* 大きさを 揺らす（そろえると 塀に 見える）*/
        const h = 3.4 + ((i * 37) % 11) * 0.34;
        const w = 2.6 + ((i * 53) % 7) * 0.36;
        trs(m4, c.x + p.x + Math.cos(a) * p.半, c.y + p.y - 0.6, c.z + p.z + Math.sin(a) * p.半,
          w, h, w, a + ((i * 29) % 13) * 0.24);
        R.draw("rock", m4, 岩, 0.16, 0.26, 0, 0, 4);
      }
      /* 光る 石（部屋に よって）*/
      if (p.光) {
        trs(m4, c.x + p.x + p.半 * 0.5, c.y + p.y, c.z + p.z, 1.4, 2.6, 1.4, 0);
        R.draw("crystal", m4, [0.58, 0.78, 0.96], 0.95, 0.5, 0, 0, 2);
      }
    }
    /* 通路（部屋の あいだに 床を 敷く） */
    for (let i = 0; i < this.洞窟.部屋.length - 1; i++) {
      const a = this.洞窟.部屋[i], b = this.洞窟.部屋[i + 1];
      const n = 6;
      for (let k = 1; k < n; k++) {
        const t = k / n;
        trs(m4, c.x + a.x + (b.x - a.x) * t, c.y + a.y + (b.y - a.y) * t - 0.5,
          c.z + a.z + (b.z - a.z) * t, 7.2, 1.1, 7.2, 0);
        R.draw("blk_slab", m4, 床, 0.06, 0.10, 0, 0, 7);
      }
    }
  }

  /* 洞窟の 宝の 箱 */
  _洞窟の宝(R) {
    const 洞 = this.洞窟; if (!洞 || !洞.宝) return;
    const c = 洞.入, 宝 = 洞.宝;
    trs(m4, c.x + 宝.x, c.y + 宝.y, c.z + 宝.z, 1.5, 1.5, 1.5, this.time * 0.4);
    R.draw("blk_chest", m4, 宝.開けた ? [0.42, 0.36, 0.30] : [0.86, 0.66, 0.28],
      宝.開けた ? 0 : 0.5, 0.5, 0, 0, 1.6);
  }

  /* 洞窟の 実り（光る 玉）を 描く */
  _洞窟を描く(R) {
    if (!this.洞窟) return;
    const c = this.洞窟.入;
    for (const g of this.洞窟.資源) {
      if (g.取った) continue;
      const y = c.y + g.y + 0.5;
      const b = Math.sin((this._mobT || 0) * 2.2 + g.x) * 0.12;
      trs(m4, c.x + g.x, y + b, c.z + g.z, 0.7, 0.7, 0.7, 0);
      R.draw("pickup", m4, ITEM[g.何] ? ITEM[g.何].色 : [0.8, 0.8, 0.8], 0.85, 0.5, 0, 0, 1);
    }
    /* 出口の 印 */
    trs(m4, c.x, c.y + this.洞窟.部屋[0].y + 2.6, c.z, 1.2, 1.2, 1.2, 0);
    R.draw("marker", m4, [0.98, 0.90, 0.52], 0.9, 0.4, 0, 0, 1.4);
  }

  _drawTown(R, P) {
    const t = this.town.近くの(P[0], P[2]);
    if (!t || t.dist > 140) return;
    for (const h2 of t.家) {
      trs(m4, h2.x, h2.y, h2.z, h2.w, h2.h, h2.w * 0.8, h2.yaw);
      R.draw("blk_cube", m4, h2.色, 0, 0.14, 0, 0, h2.w);
      trs(m4, h2.x, h2.y + h2.h, h2.z, h2.w * 0.78, h2.h * 0.5, h2.w * 0.66, h2.yaw);
      R.draw("blk_roof", m4, [h2.色[0] * 0.6, h2.色[1] * 0.5, h2.色[2] * 0.5], 0, 0.16, 0, 0, h2.w);
    }
    for (const p of t.人) {
      const b = Math.sin((this._mobT || 0) * 1.6 + p.x) * 0.05;
      trs(m4, p.x, p.y + b, p.z, 0.9, 1, 0.9, Math.sin((this._mobT || 0) * 0.3 + p.z) * 1.2);
      R.draw("npc_body", m4, p.色, 0, 0.22, 0, 0, 1.6);
      R.draw("npc_head", m4, [0.98, 0.86, 0.74], 0, 0.24, 0, 0, 1.6);
      trs(m4, p.x, p.y + b, p.z, 0.9, 1, 0.9, 0);
      R.draw("npc_hat", m4, [p.色[0] * 0.7, p.色[1] * 0.7, p.色[2] * 0.8], 0, 0.2, 0, 0, 1.6);
    }
  }

  _drawMobs(R, dt) {
    this._mobT = (this._mobT || 0) + dt;
    for (const e of this.combat.list) drawEnemy(R, e, this._mobT);
  }

  /* 狙って いる もの／敵の 上に 印 */
  _drawMark(R, P) {
    const t = this.狙い敵 || this.狙い;
    if (!t) return;
    const p = this.狙い敵 ? this.狙い敵.pos : [this.狙い.e[0], this.狙い.e[1], this.狙い.e[2]];
    const h2 = this.狙い敵 ? (this.狙い敵.def.大 * 1.8 + 0.6) : 1.6;
    const b = Math.sin((this._mobT || 0) * 4) * 0.12;
    trs(m4, p[0], p[1] + h2 + b, p[2], 0.9, 0.9, 0.9, 0);
    R.draw("marker", m4, this.狙い敵 ? [1, 0.42, 0.36] : [0.98, 0.86, 0.34], 0.6, 0.4, 0, 0, 1.2);
  }

  /* 水。**近くだけ 細かく、遠くは 1 枚**。
     ★ 波は 板を 2 枚 ずらして 重ね、ゆっくり 揺らして 出す。
       本物の 波を 作ると 頂点が 増えて スマホで 落ちる。 */
  _drawWater(R, P) {
    if (!this.settings.water) return;
    const B = BIOMES[this.terr.at(P[0], P[2]).biome] || BIOMES.meadow;
    const 幅 = (this.settings.drawDistance || 140) * 2.2;
    const t = this._mobT || 0;
    const cx = Math.round(P[0] / 8) * 8, cz = Math.round(P[2] / 8) * 8;
    /* ★ 薄く する（2026-09-02）。前は 2 枚 あわせて ほぼ 不透明で、
       浅瀬も 深みも **同じ 水色の 板**に 見えた（実写で 池に 見えた）。
       薄く すると 下の 砂や 岩が 透けて、**深さが そのまま 色に なる**。
       絵も 計算も 増えない。 */
    /* 下の 面（濃い） */
    trs(m4, cx, SEA - 0.06, cz, 幅, 1, 幅, 0);
    R.draw("water", m4, [B.水[0] * 0.72, B.水[1] * 0.76, B.水[2] * 0.86, 0.40], 0, 0.10, 0, 0, 幅);
    /* 上の 面（薄い・ゆっくり 動く）＝ 波の 見た目 */
    trs(m4, cx + Math.sin(t * 0.24) * 1.6, SEA + 0.05, cz + Math.cos(t * 0.19) * 1.6, 幅 * 0.98, 1, 幅 * 0.98, 0);
    R.draw("water", m4, [B.水[0] * 1.20, B.水[1] * 1.18, B.水[2] * 1.12, 0.20], 0.06, 0.42, 0, 0.22, 幅);
  }

  _paintDebug(biome) {
    const B = BIOMES[biome];
    const P = this.player.pos;
    const st = this.chunks.stats;
    const hh = Math.floor(this.time), mm = Math.floor((this.time % 1) * 60);
    this.debugEl.textContent =
      this.worldName + " ／ " + (B ? B.名 : biome)
      + " ／ " + String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0")
      + " ／ " + Math.round(P[0]) + "," + Math.round(P[2])
      + " ／ " + (this.weather ? this.weather.今 : "")
      + " ／ " + this._fps + "fps 区画" + st.live + " 三角" + Math.round(st.tris / 1000) + "k";
  }

  destroy() {
    this.ready = false;
    if (this.weather && this.renderer) { try { this.weather.destroy(this.renderer); } catch (e) {} }
    if (this.chunks) { this.chunks.destroy(); this.chunks = null; }
    if (this.renderer) { try { this.renderer.destroy(); } catch (e) {} this.renderer = null; }
    if (this.input && this.input.destroy) this.input.destroy();
  }

  /** 検査から 中を のぞく */
  state() {
    return {
      ready: this.ready, err: this._err,
      world: this.worldName, seed: this.seed,
      pos: this.player ? this.player.pos.map((v) => Math.round(v * 10) / 10) : null,
      biome: this.player ? this.terr.at(this.player.pos[0], this.player.pos[2]).biome : "",
      time: Math.round(this.time * 10) / 10,
      frames: this._frames,
      canvas: this.canvas ? [this.canvas.width, this.canvas.height] : null,
      chunks: this.chunks ? Object.assign({}, this.chunks.stats) : null,
      draw: this.renderer ? Object.assign({}, this.renderer.stats) : null,
      fps: this._fps
    };
  }
}

/* ★ 指の 操作盤の CSS を **必ず 一緒に 出す**（2026-09-02）。
   走るモードは match.js が 出して いた。探索は 出して いなかったので、
   盤が **高さ 57px の ただの 箱**に なり、棒も 跳ぶ ボタンも
   出ず、指で 1mm も 動けなかった（実機の 大きさで 実測）。 */
export const RPG_CSS = TOUCH_CSS + RHUD_CSS + `
/* ★ 指の ボタンの 置きなおし（2026-09-02・実機の 大きさで 実測）。
   走るモードの 置き方の まま だと、跳ぶ ボタンが 探索の 「とる」に、
   飛び込みが 「作る」に **ぴったり 重なる**。
   ・飛び込みは 探索に 無い ので 消す。
   ・跳ぶは 「とる」の **すぐ 上**へ。両方 押せる。 */
.rpg-root .vs-tbtn-dive{ display:none; }
.rpg-root .vs-tbtn-jump{
  width:64px; height:64px;
  right:calc(15px + var(--vs-safe-r));
  bottom:calc(96px + var(--vs-safe-b));
}
/* ★ 横向き（高さが 低い）では **横に 並べる**（2026-09-02・実測）。
   縦の ときの ように 上へ 積むと、「とる」の 上 74px に 置いても
   「とる」は 78px あるので **必ず 重なる**。 */
@media (max-height: 460px){
  .rpg-root .vs-tbtn-jump{
    width:58px; height:58px;
    right:calc(104px + var(--vs-safe-r));
    bottom:calc(16px + var(--vs-safe-b));
  }
}
/* 棒の 目印は 「持ちもの」の 上に 出す（下は ボタンで 埋まって いる） */
.rpg-root .vs-stickhome{ bottom:calc(104px + var(--vs-safe-b)); }
`+ `
.rpg-root{position:absolute;inset:0;overflow:hidden;background:#0a0a12;}
.rpg-cv{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;}
.rpg-hud{position:absolute;inset:0;pointer-events:none;}
.rpg-dbg{position:absolute;left:12px;bottom:78px;z-index:4;
  font:500 12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;
  color:rgba(255,255,255,.78);text-shadow:0 1px 3px rgba(0,0,0,.7);
  background:rgba(10,8,20,.34);padding:6px 10px;border-radius:9px;pointer-events:none;
  -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);}
.rpg-exit{position:absolute;right:12px;top:10px;z-index:6;height:38px;padding:0 16px;
  border-radius:11px;border:1px solid rgba(255,255,255,.20);
  background:rgba(16,14,28,.55);color:#fff;font:600 13.5px/1 inherit;cursor:pointer;
  -webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);}
.rpg-exit:hover{background:rgba(30,26,48,.72);}
@media (max-width:640px){
  .rpg-dbg{font-size:10.5px;left:8px;top:8px;padding:5px 8px;}
  .rpg-exit{height:40px;padding:0 13px;font-size:12.5px;right:8px;top:8px;}
}
`;
