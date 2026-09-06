/* ══════════════════════════════════════════════════════════════════════════
   探索モードの 画面まわり。

   ★ **いま 何を すれば いいか**を いつも 1 行 出す（迷わせない）。
   ★ 触る 場所は 44px 以上。スマホで 遊べる こと。
   ★ 窓（持ちもの・作る・建てる）は **1 つずつ**。重ねない。
   ══════════════════════════════════════════════════════════════════════════ */
import { h } from "../../ui/shell.js";
import { ITEM, ITEM_IDS, 種類名, 位名, 位色 } from "../data/items.js";
import { ENEMIES, ENEMY_IDS } from "../data/enemies.js";
import { MiniMap } from "./map.js";
import { BLUEPRINTS, 大きさ } from "../data/blueprints.js";
import { 全節 } from "../data/story.js";
import { 型名 } from "../sys/build.js";

const 色文字 = (c) => "rgb(" + Math.round(c[0] * 255) + "," + Math.round(c[1] * 255) + "," + Math.round(c[2] * 255) + ")";

/* 種類ごとの 形。**線 1 本ぶん**の 軽さで 描く（絵を 読まない）。 */
const 形の道 = {
  material: "M7 1 L13 7 L7 13 L1 7 Z",
  tool: "M2 12 L8 6 M6 2 L12 8 L10 10 L4 4 Z",
  weapon: "M2 12 L11 3 M9 1 L13 5 L11 7 L7 3 Z",
  armor: "M7 1 L12 3 V8 Q12 12 7 13 Q2 12 2 8 V3 Z",
  food: "M7 2 A5 5 0 1 0 7 12 A5 5 0 1 0 7 2",
  potion: "M5 1 H9 V5 L12 12 H2 L5 5 Z",
  build: "M2 6 L7 2 L12 6 V12 H2 Z",
  seed: "M7 1 Q12 6 7 13 Q2 6 7 1",
  treasure: "M7 1 L9 5 L13 6 L10 9 L11 13 L7 11 L3 13 L4 9 L1 6 L5 5 Z",
  book: "M2 2 H12 V12 H2 Z M7 2 V12"
};
function 印(it) {
  const d = 形の道[it.種] || 形の道.material;
  const 塗 = (it.種 === "material" || it.種 === "build" || it.種 === "food" || it.種 === "treasure" || it.種 === "seed");
  const 中 = "<svg viewBox='0 0 14 14' aria-hidden='true'><path d='" + d + "' "
    + (塗 ? "fill='rgba(0,0,0,.42)' stroke='rgba(255,255,255,.55)' stroke-width='1'"
          : "fill='none' stroke='rgba(255,255,255,.86)' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'")
    + "/></svg>";
  const i = h("i", { class: "rh-it-c",
    style: "background:" + 色文字(it.色) + ";box-shadow:0 0 0 2px " + 色文字(位色[it.位]) + " inset" });
  i.innerHTML = 中;
  return i;
}

export class RpgHud {
  constructor(o) {
    this.sc = o.screen;
    this.el = this._build();
    this.開き = "";        /* "" | inv | craft | build | quest */
    this._lastInv = -1;
  }

  _build() {
    /* 上 … 物語の 一行 */
    this.questEl = h("div", { class: "rh-quest" },
      this.questT = h("span", { class: "rh-quest-t" }),
      this.questP = h("span", { class: "rh-quest-p" }));
    /* 左上 … 体力・力・段位 */
    this.hpBar = h("i", { class: "rh-bar-f rh-hp" });
    this.stBar = h("i", { class: "rh-bar-f rh-st" });
    this.pwBar = h("i", { class: "rh-bar-f rh-pw" });
    this.lvEl = h("span", { class: "rh-lv" });
    this.statEl = h("div", { class: "rh-stats" },
      h("div", { class: "rh-row" }, this.lvEl,
        h("div", { class: "rh-bars" },
          h("span", { class: "rh-bar" }, this.hpBar),
          h("span", { class: "rh-bar rh-bar--s" }, this.stBar),
          h("span", { class: "rh-bar rh-bar--p" }, this.pwBar))),
      this.envEl = h("div", { class: "rh-env" }));
    /* 中央下 … 狙って いる もの */
    this.aimEl = h("div", { class: "rh-aim" });
    /* 右下 … 知らせ */
    this.logEl = h("div", { class: "rh-log" });
    /* 下 … ボタン */
    this.actBtn = h("button", { class: "rh-act", type: "button", "aria-label": "とる・たたく" }, "とる");
    this.actBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); this.sc._tapAct = true; });
    const 帯 = (名, k) => {
      const b = h("button", { class: "rh-tab", type: "button", text: 名 });
      b.addEventListener("click", () => this.開く(this.開き === k ? "" : k));
      return b;
    };
    this.tabs = h("div", { class: "rh-tabs" },
      帯("持ちもの", "inv"), 帯("作る", "craft"), 帯("建てる", "build"), 帯("物語", "quest"));
    /* 窓 */
    this.paneEl = h("div", { class: "rh-pane", hidden: true });
    /* 章の 幕 */
    this.actEl = h("div", { class: "rh-chapter", hidden: true });
    /* 小さな 地図（右上） */
    this.mapWrap = h("div", { class: "rh-mapw" });
    /* ことばの 問い */
    this.qzEl = h("div", { class: "rh-qz", hidden: true });
    /* 話す ボタン */
    this.talkBtn = h("button", { class: "rh-talk", type: "button", hidden: true });
    this.talkBtn.addEventListener("click", () => {
      const S = this.sc;
      if (S.近くの入口) { S.洞窟 ? S.出る() : S.潜る(); return; }
      if (S.近くの人) this.話す();
      else if (S.近くの設備) this.設備(S.近くの設備);
    });
    return h("div", { class: "rh" },
      this.questEl, this.statEl, this.mapWrap, this.aimEl, this.logEl, this.qzEl, this.talkBtn,
      h("div", { class: "rh-bottom" }, this.tabs, this.actBtn),
      this.paneEl, this.actEl);
  }

  /* その 風土が いちばん 近い 方角（地図の 目印に 使う）。
     ★ 世界じゅうを 探すと 重い。**近くを 粗く** 見て、無ければ 出さない。 */
  _風土の先(biome, px, pz) {
    if (this._風土先 && this._風土先.b === biome && this._風土先.t > Date.now() - 8000) return this._風土先.p;
    const T = this.sc.terr;
    let best = null, bd = 1e9;
    for (let r = 60; r <= 1400; r += 70) {
      for (let a = 0; a < 16; a++) {
        const th = (a / 16) * Math.PI * 2;
        const x = px + Math.cos(th) * r, z = pz + Math.sin(th) * r;
        if (T.at(x, z).biome !== biome) continue;
        const d = r;
        if (d < bd) { bd = d; best = { x, z }; }
      }
      if (best) break;
    }
    this._風土先 = { b: biome, t: Date.now(), p: best };
    return best;
  }

  /* ── はたけ・たからばこ ─────────────────────────────────── */
  設備(o) {
    const S = this.sc;
    if (!o) return;
    this.開き = "gear";
    this.paneEl.hidden = false;
    this.paneEl.textContent = "";
    const it = ITEM[o.id];
    this.paneEl.appendChild(this._頭(it ? it.名 : "設備"));
    if (o.畑) this._畑(o);
    else if (o.箱) this._箱(o);
    else if (o.id === "b_fire") this._たき火(o);
    else this.paneEl.appendChild(h("div", { class: "rh-q-sb", text: it ? it.記 : "" }));
  }

  _たき火(o) {
    const S = this.sc;
    this.paneEl.appendChild(h("div", { class: "rh-q-sb",
      text: "ここで 料理が できます。休むと 朝まで 進み、体力が ぜんぶ 戻ります。" }));
    this.paneEl.appendChild(h("div", { class: "rh-q-sp",
      text: "いまの 時刻　" + Math.floor(S.time) + " 時" }));
    const b = h("button", { class: "rh-mini", type: "button", text: "朝まで 休む" });
    b.addEventListener("click", () => {
      const r = S.休む();
      S._知らせ(r.ok ? "ぐっすり 眠った" : r.訳, r.ok ? "good" : "warn");
      if (r.ok) this.開く(""); else this.設備(o);
    });
    this.paneEl.appendChild(b);
    this.paneEl.appendChild(h("div", { class: "rh-note",
      text: "食べものを 1 つ 使います。近くに 敵が いる ときは 休めません。" }));
  }

  _畑(o) {
    const S = this.sc, now = Date.now();
    if (o.畑.種) {
      const 育 = S.build.育ち(o, now);
      const it = ITEM[o.畑.種];
      this.paneEl.appendChild(h("div", { class: "rh-q-sb",
        text: (it ? it.名 : "たね") + " が 育って います（" + Math.round(育 * 100) + "%）" }));
      const bar = h("span", { class: "rh-bar", style: "width:100%;height:9px" },
        h("i", { class: "rh-bar-f rh-st", style: "width:" + Math.round(育 * 100) + "%" }));
      this.paneEl.appendChild(bar);
      const b = h("button", { class: "rh-mini", type: "button", text: 育 >= 1 ? "とりいれる" : "まだ 育って いない" });
      if (育 >= 1) b.addEventListener("click", () => {
        const r = S.build.採る(o, Date.now());
        S._知らせ(r.ok ? (ITEM[r.実].名 + " ×" + r.数 + " を とりいれた") : r.訳, r.ok ? "good" : "warn");
        this.設備(o);
      });
      this.paneEl.appendChild(h("div", { style: "margin-top:10px" }, b));
      return;
    }
    this.paneEl.appendChild(h("div", { class: "rh-note", text: "たねを えらんで まきます。" }));
    const g = h("div", { class: "rh-grid" });
    const 合 = new Map();
    for (const sl of S.inv.slots) if (sl && ITEM[sl.id] && ITEM[sl.id].種 === "seed") 合.set(sl.id, (合.get(sl.id) || 0) + sl.数);
    if (!合.size) g.appendChild(h("div", { class: "rh-none", text: "たねが ありません。「作る」で 草や 薬草から たねを 取れます。" }));
    for (const [id, n] of 合) {
      g.appendChild(this._tile(id, n, { onclick: () => {
        const r = S.build.蒔く(o, id, Date.now());
        S._知らせ(r.ok ? (ITEM[id].名 + " を まいた") : r.訳, r.ok ? "good" : "warn");
        this.設備(o);
      } }));
    }
    this.paneEl.appendChild(g);
  }

  _箱(o) {
    const S = this.sc;
    this.paneEl.appendChild(h("div", { class: "rh-note",
      text: "上：たからばこの 中（押すと 取り出す）　下：持ちもの（押すと しまう）" }));
    const g1 = h("div", { class: "rh-grid" });
    if (!o.箱.length) g1.appendChild(h("div", { class: "rh-none", text: "からっぽです。" }));
    for (const s2 of o.箱) {
      g1.appendChild(this._tile(s2.id, s2.数, { onclick: () => {
        const r = S.build.箱から出す(o, s2.id, s2.数);
        S._知らせ(r.ok ? (ITEM[s2.id].名 + " を 取り出した") : r.訳, r.ok ? "" : "warn");
        this.設備(o);
      } }));
    }
    this.paneEl.appendChild(g1);
    this.paneEl.appendChild(h("div", { class: "rh-note", text: "持ちもの（" + S.inv.used() + " / " + S.inv.n + "）" }));
    const g2 = h("div", { class: "rh-grid" });
    const 合 = new Map();
    for (const sl of S.inv.slots) if (sl) 合.set(sl.id, (合.get(sl.id) || 0) + sl.数);
    for (const [id, n] of 合) {
      g2.appendChild(this._tile(id, n, { onclick: () => {
        const r = S.build.箱に入れる(o, id, n);
        S._知らせ(r.ok ? (ITEM[id].名 + " を しまった") : r.訳, r.ok ? "" : "warn");
        this.設備(o);
      } }));
    }
    this.paneEl.appendChild(g2);
  }

  /* ── ことばの 問い ── */
  問を出す(q) {
    if (!q) return;
    this.qzEl.hidden = false;
    this.qzEl.textContent = "";
    this.qzEl.appendChild(h("div", { class: "rh-qz-h", text: "ことばの ちから" }));
    this.qzEl.appendChild(h("div", { class: "rh-qz-q", text: q.問 }));
    const g = h("div", { class: "rh-qz-c" });
    for (const c of q.選) {
      const b = h("button", { class: "rh-qz-b", type: "button", text: c });
      b.addEventListener("click", () => this.sc.words.答える(c));
      g.appendChild(b);
    }
    this.qzEl.appendChild(g);
    this.qzEl.appendChild(h("button", { class: "rh-qz-x", type: "button", text: "あとで",
      onclick: () => { this.sc.words.やめる(); this.問を消す(null); } }));
  }
  問を消す() { this.qzEl.hidden = true; this.qzEl.textContent = ""; }

  /* ── 話す ── */
  話す() {
    const S = this.sc, p = S.近くの人;
    if (!p) return;
    this.開き = "talk";
    this.paneEl.hidden = false;
    this.paneEl.textContent = "";
    this.paneEl.appendChild(this._頭(p.名 + "（" + p.役名 + "）"));
    this.paneEl.appendChild(h("div", { class: "rh-q-sb", text: p.語 }));
    if (p.役 === "guide") {
      const q = S.quest;
      this.paneEl.appendChild(h("div", { class: "rh-q-sp",
        text: q.節 ? ("「いまは " + q.いまの一行() + " だな。」") : "「もう すべて 見たのだな。」" }));
      const 印 = q.目印();
      if (印) this.paneEl.appendChild(h("div", { class: "rh-q-mark", text: "「" + 印.名 + "へ 行くといい。」" }));
      /* ★ 町へ 帰る（2026-09-02）。世界は はてしない ので、
         歩いて 戻るだけ だと 遠い 町が 二度と 使われない。 */
      const 他 = Array.from(S.行った町.values()).filter((t) => !S.いる町 || t.id !== S.いる町.id);
      this.paneEl.appendChild(h("div", { class: "rh-note",
        text: 他.length ? "「馬を 出そう。行った ことの ある 町なら 送れる。」"
          : "「まだ ほかの 町を 知らないな。歩いて 見つけて おいで。」" }));
      if (他.length) {
        const g = h("div", { class: "rh-list" });
        const P = S.player.pos;
        他.sort((a, b) => Math.hypot(a.x - P[0], a.z - P[2]) - Math.hypot(b.x - P[0], b.z - P[2]));
        for (const t of 他) {
          const 金 = S.町の運賃(t);
          const 足 = S.inv.count("kin_ka") >= 金;
          const d = Math.round(Math.hypot(t.x - P[0], t.z - P[2]));
          const row = h("button", { class: "rh-rec" + (足 ? "" : " is-off"), type: "button" },
            h("i", { class: "rh-it-c", style: "background:#8FC6F2" }),
            h("span", { class: "rh-rec-m" },
              h("span", { class: "rh-rec-n", text: t.名 }),
              h("span", { class: "rh-rec-d", text: d + "m　運賃 " + 金 + " 金" })),
            h("span", { class: "rh-rec-b", text: 足 ? "行く" : "金が 足りない" }));
          if (足) row.addEventListener("click", () => {
            const r = S.町へ帰る(t);
            if (!r.ok) S._知らせ(r.訳, "warn");
            this.開く("");
          });
          g.appendChild(row);
        }
        this.paneEl.appendChild(g);
      }
      return;
    }
    /* ── 依頼（どの 人でも 受けられる）── */
    const E = S.errand;
    if (E) {
      const 受 = E.受.filter((x) => x.主 === p.名);
      const 出 = E.出す(S.いる町, p, 3).filter((x) => !E.受.some((y) => y.id === x.id));
      this.paneEl.appendChild(h("div", { class: "rh-note", text: "たのみごと" }));
      const g = h("div", { class: "rh-list" });
      for (const e of 受) {
        const 済 = E.済んだ(e);
        const row = h("button", { class: "rh-rec" + (済 ? " is-ok" : ""), type: "button" },
          h("i", { class: "rh-it-c", style: "background:" + (済 ? "#7CE0A0" : "#8FA0C8") }),
          h("span", { class: "rh-rec-m" },
            h("span", { class: "rh-rec-n", text: e.文 }),
            h("span", { class: "rh-rec-d", text: E.文(e) + "　礼 " + e.礼金 + " 金" })),
          h("span", { class: "rh-rec-b", text: 済 ? "わたす" : "…" }));
        if (済) row.addEventListener("click", () => {
          const r = E.渡す(e.id);
          S._知らせ(r.ok ? ("礼を うけとった（+" + r.金 + " 金）") : r.訳, r.ok ? "good" : "warn");
          this.話す();
        });
        g.appendChild(row);
      }
      for (const e of 出) {
        const row = h("button", { class: "rh-rec", type: "button" },
          h("i", { class: "rh-it-c", style: "background:#C8B48F" }),
          h("span", { class: "rh-rec-m" },
            h("span", { class: "rh-rec-n", text: e.文 }),
            h("span", { class: "rh-rec-d", text: "礼 " + e.礼金 + " 金　経験 " + e.経 })),
          h("span", { class: "rh-rec-b", text: "うける" }));
        row.addEventListener("click", () => {
          const r = E.受ける(e);
          S._知らせ(r.ok ? "たのみを うけた" : r.訳, r.ok ? "good" : "warn");
          this.話す();
        });
        g.appendChild(row);
      }
      this.paneEl.appendChild(g);
    }
    if (p.役 === "scholar") {
      const 記 = S.words.記録();
      this.paneEl.appendChild(h("div", { class: "rh-q-sp",
        text: "「これまで " + 記.答えた + " 問、正しく " + 記.正 + " 問。" + 記.率 + "% だ。」" }));
    }
    /* 店 */
    const 金 = S.inv.count("kin_ka");
    this.paneEl.appendChild(h("div", { class: "rh-equip", text: "持っている 金貨：" + 金 }));
    const g = h("div", { class: "rh-list" });
    for (const id of p.品) {
      const it = ITEM[id];
      if (!it) continue;
      const 値 = Math.max(1, Math.round(it.値 * 1.6));
      const row = h("button", { class: "rh-rec" + (金 >= 値 ? " is-ok" : ""), type: "button" },
        h("i", { class: "rh-it-c", style: "background:" + 色文字(it.色) }),
        h("span", { class: "rh-rec-m" },
          h("span", { class: "rh-rec-n", text: it.名 }),
          h("span", { class: "rh-rec-d", text: it.記 })),
        h("span", { class: "rh-rec-b", text: 値 + " 金" }));
      row.addEventListener("click", () => {
        const r = S.town.買う(S.inv, id, 金);
        S._知らせ(r.ok ? (it.名 + " を 買った（" + r.値 + " 金）") : r.訳, r.ok ? "good" : "warn");
        this.話す();
      });
      g.appendChild(row);
    }
    this.paneEl.appendChild(g);
    /* 売る */
    this.paneEl.appendChild(h("div", { class: "rh-note", text: "持ちものから 売る：" }));
    const s2 = h("div", { class: "rh-grid" });
    const 合 = new Map();
    for (const sl of S.inv.slots) if (sl && sl.id !== "kin_ka") 合.set(sl.id, (合.get(sl.id) || 0) + sl.数);
    let n = 0;
    for (const [id, cnt] of 合) {
      if (n++ > 40) break;
      s2.appendChild(this._tile(id, cnt, { onclick: () => {
        const r = S.town.売る(S.inv, id);
        S._知らせ(r.ok ? (ITEM[id].名 + " を 売った（+" + r.値 + " 金）") : r.訳, r.ok ? "good" : "warn");
        this.話す();
      } }));
    }
    this.paneEl.appendChild(s2);
  }

  開く(k) {
    this.開き = k;
    this.paneEl.hidden = !k;
    if (k) this.描く窓();
    for (const b of this.tabs.children) b.classList.remove("is-on");
    const i = ["inv", "craft", "build", "quest"].indexOf(k);
    if (i >= 0) this.tabs.children[i].classList.add("is-on");
  }

  /* ── 毎フレーム（軽い ものだけ）── */
  tick() {
    const S = this.sc;
    if (!S.player) return;
    const p = S.player;
    this.hpBar.style.width = Math.round((p.hp / p.maxHp) * 100) + "%";
    this.stBar.style.width = Math.round((p.stamina / p.maxStamina) * 100) + "%";
    this.pwBar.style.width = Math.round((S.combat.力 / S.combat.力max) * 100) + "%";
    this.lvEl.textContent = "Lv " + S.combat.lv;
    /* 体の ぐあい */
    const 印 = [];
    if (S.寒 > 20) 印.push("さむい " + Math.round(S.寒) + "%");
    if (S.熱 > 20) 印.push("あつい " + Math.round(S.熱) + "%");
    if (S.毒 > 0) 印.push("どく");
    this.envEl.textContent = 印.join(" ／ ");
    this.envEl.classList.toggle("is-bad", S.寒 > 70 || S.熱 > 70 || S.毒 > 0);
    /* 物語 */
    if (S.quest) {
      const 一 = S.quest.いまの一行();
      if (一 !== this._lastQ) { this._lastQ = 一; this.questT.textContent = 一; }
      const pr = S.quest.進み();
      const t = pr.要 ? Math.round((pr.今 / pr.要) * 100) : 0;
      this.questP.style.width = t + "%";
    }
    /* 狙い */
    let a = "";
    if (S.建てるか && S.置くもの) a = "おく：" + (ITEM[S.置くもの] ? ITEM[S.置くもの].名 : "");
    else if (S.狙い敵) a = S.狙い敵.def.名 + "　" + Math.max(0, Math.round(S.狙い敵.hp)) + " / " + S.狙い敵.maxHp;
    else if (S.fish && S.fish.状) a = S.fish.状.段 === "かかった" ? "かかった！" : "…あたりを 待つ";
    else if (S.水べ && S.竿の効き > 0) a = "水べ … つれる";
    else if (S.狙い) { const w = S.gather.何が(S.狙い); a = (ITEM[w] ? ITEM[w].名 : w) + " を とる"; }
    if (a !== this._lastAim) { this._lastAim = a; this.aimEl.textContent = a; this.aimEl.classList.toggle("is-on", !!a); }
    /* ★ つりの あいだは ボタンの 文字が 変わる（2026-09-02）。
       「いま 押す ところ」が 分からないと 合わせられない。 */
    const 釣 = S.fish && S.fish.状;
    const つれる = !釣 && S.水べ && S.竿の効き > 0 && !S.狙い敵 && !S.建てるか;
    this.actBtn.textContent = 釣
      ? (釣.段 === "かかった" ? "あげる！" : "まつ…")
      : (S.建てるか ? "おく" : (S.狙い敵 ? "たたく" : (つれる ? "つる" : "とる")));
    this.actBtn.classList.toggle("is-hot", !!S.狙い敵 || (釣 && 釣.段 === "かかった"));
    this.actBtn.classList.toggle("is-wait", !!(釣 && 釣.段 === "投げた"));
    /* 小さな 地図（歩いた ぶん だけ 描き直す） */
    if (!this.map && S.terr && S.town) {
      this.map = new MiniMap({ terrain: S.terr, town: S.town, size: 66, 範囲: 260 });
      this.mapWrap.appendChild(this.map.cv);
    }
    if (this.map) {
      this._mapT = (this._mapT || 0) + 1;
      if (this._mapT % 6 === 0) {
        let 目 = null;
        const q = S.quest && S.quest.目印();
        if (q && q.型 === "biome") 目 = this._風土の先(q.先, p.pos[0], p.pos[2]);
        this.map.update(p.pos[0], p.pos[2], S.cam.yaw, 目, S.洞窟);
      }
    }

    /* 話す／使う／もぐる ボタン */
    const 設 = S.近くの設備;
    const 穴 = S.近くの入口;
    const 話 = !!S.近くの人 || !!設 || !!穴;
    const 名 = 穴 ? (S.洞窟 ? "外へ 出る" : "ほらあなへ もぐる")
      : (S.近くの人 ? ("話す：" + S.近くの人.名)
      : (設 ? ("つかう：" + (ITEM[設.id] ? ITEM[設.id].名 : "")) : ""));
    if (話 !== this._lastTalk || 名 !== this._lastTalkN) {
      this._lastTalk = 話; this._lastTalkN = 名;
      this.talkBtn.hidden = !話;
      if (話) this.talkBtn.textContent = 名;
    }
    /* 知らせ */
    if (S._logDirty) {
      S._logDirty = false;
      this.logEl.textContent = "";
      for (const l of S.log) {
        this.logEl.appendChild(h("div", { class: "rh-log-i" + (l.色 ? " is-" + l.色 : ""), text: l.文 }));
      }
    }
    /* 章の 幕 */
    if (S._章幕) {
      const c = S._章幕;
      if (c.t === 0) {
        this.actEl.hidden = false;
        this.actEl.textContent = "";
        this.actEl.appendChild(h("div", { class: "rh-ch-t", text: c.題 }));
        this.actEl.appendChild(h("div", { class: "rh-ch-b", text: c.語 }));
      }
      c.t += 1 / 60;
      if (c.t > (c.長 || 6)) { this.actEl.hidden = true; S._章幕 = null; }
    }
    /* 窓の 中身は 持ちものが 変わった ときだけ */
    if (S._invDirty && this.開き) { S._invDirty = false; this.描く窓(); }
  }

  /* ── 窓 ── */
  描く窓() {
    const k = this.開き;
    /* ★ 話しかけて いる 途中は **中身を 消さない**（2026-09-02）。
       持ちものが 変わる たび（拾った・買った）に ここが 呼ばれる。
       前は talk を 知らなかった ので、窓が **空の 帯**に なって
       会話が 消えて いた（実写で 案内人の 行き先が 出なかった）。 */
    if (k === "talk") { this.話す(); return; }
    if (k === "gear") return;                 /* 道具の 窓も 自分で 描く */
    this.paneEl.textContent = "";
    if (k === "inv") this._inv();
    else if (k === "craft") this._craft();
    else if (k === "build") this._buildPane();
    else if (k === "quest") this._quest();
  }

  _頭(題, 右) {
    return h("div", { class: "rh-ph" },
      h("span", { class: "rh-ph-t", text: 題 }),
      右 || h("span"),
      h("button", { class: "rh-ph-x", type: "button", "aria-label": "閉じる",
        onclick: () => this.開く("") }, "✕"));
  }

  /* ★ ものの 印（2026-09-02）。色の 四角だけ だと 338 種が
     ぜんぶ 同じ 顔に なり、「どれが 武器か」が 一目で 分からない。
     絵は 読まない。**種類ごとの 形**を その場で 引く。 */
  _tile(id, n, o) {
    const it = ITEM[id];
    if (!it) return h("span");
    const b = h("button", {
      class: "rh-it" + (o && o.on ? " is-on" : "") + (o && o.捨 ? " is-drop" : ""), type: "button",
      title: it.名 + "｜" + 位名[it.位] + "\n" + it.記
    },
      印(it),
      h("span", { class: "rh-it-n", text: it.名 }),
      n > 1 ? h("span", { class: "rh-it-x", text: "×" + n }) : h("span"));
    if (o && o.onclick) b.addEventListener("click", o.onclick);
    /* 長押し（0.6 秒）。指でも マウスでも 同じ。 */
    if (o && o.長押し) {
      let t = 0;
      const 始 = () => { clearTimeout(t); t = setTimeout(() => { t = 0; o.長押し(); }, 600); };
      const 止 = () => { clearTimeout(t); };
      b.addEventListener("pointerdown", 始);
      b.addEventListener("pointerup", 止);
      b.addEventListener("pointerleave", 止);
      b.addEventListener("pointercancel", 止);
    }
    return b;
  }

  _inv() {
    const S = this.sc, inv = S.inv;
    const 合 = new Map();
    for (const s of inv.slots) if (s) 合.set(s.id, (合.get(s.id) || 0) + s.数);
    const st = inv.status();
    const g = h("div", { class: "rh-grid" });
    if (!合.size) g.appendChild(h("div", { class: "rh-none", text: "まだ 何も 持っていません。木や 石を とってみましょう。" }));
    for (const [id, n] of 合) {
      g.appendChild(this._tile(id, n, {
        on: Object.values(inv.equip).indexOf(id) >= 0,
        捨: this._捨て,
        長押し: this._捨て ? (() => {
          const it = ITEM[id];
          const n2 = 合.get(id) || 0;
          if (Object.values(inv.equip).indexOf(id) >= 0) inv.unwear(ITEM[id].種 === "weapon" ? "weapon" : ITEM[id].種 === "tool" ? "tool" : ITEM[id].型);
          inv.remove(id, n2);
          S._知らせ(it.名 + " を ぜんぶ 捨てた ×" + n2, "warn");
          this.描く窓();
        }) : null,
        onclick: () => {
          const it = ITEM[id];
          if (this._捨て) {
            if (Object.values(inv.equip).indexOf(id) >= 0) {
              S._知らせ("そうび中の ものは 捨てられません", "warn"); return;
            }
            inv.remove(id, 1);
            S._知らせ(it.名 + " を 捨てた", "warn");
            this.描く窓(); return;
          }
          if (it.種 === "weapon" || it.種 === "tool" || it.種 === "armor") {
            inv.wear(id); S._知らせ(it.名 + " を そうびした");
          } else if (it.種 === "food" || it.種 === "potion") {
            this._使う(id);
          } else if (it.種 === "build") {
            S.置くもの = id; S.建てるか = true; this.開く(""); S._知らせ(it.名 + " を おく");
          }
          this.描く窓();
        }
      }));
    }
    /* ★ 捨てる（2026-09-02）。ふくろは 36 枠しか 無いのに ものは 357 種。
       いっぱいに なると 何も 拾えなく なり、**そこで 遊びが 止まる**。
       箱を 建てるまでの 逃げ道を 置く。押し間違いが 怖いので
       「すてる」を 押して いる 間だけ ✕ が 出る 2 段に する。 */
    this.paneEl.appendChild(this._頭("持ちもの　" + inv.used() + " / " + inv.n,
      h("span", null,
        h("button", { class: "rh-mini" + (this._捨て ? " is-on" : ""), type: "button",
          text: this._捨て ? "やめる" : "すてる",
          onclick: () => { this._捨て = !this._捨て; this.描く窓(); } }),
        h("button", { class: "rh-mini", type: "button", text: "ならべる",
          onclick: () => { inv.tidy(); this.描く窓(); } }))));
    if (this._捨て) this.paneEl.appendChild(h("div", { class: "rh-note",
      text: "押した ものを 1 つ 捨てます。長く 押すと ぜんぶ 捨てます。" }));
    this.paneEl.appendChild(h("div", { class: "rh-equip", text:
      "武器 " + st.武器名 + "　守り " + st.守 + "　攻撃 " + st.攻 }));
    this.paneEl.appendChild(g);
  }

  _使う(id) {
    const S = this.sc, it = ITEM[id];
    if (!it || !it.効) { S._知らせ("使えません", "warn"); return; }
    if (!S.inv.remove(id, 1)) return;
    const e = it.効;
    if (e.hp) { S.player.hp = Math.min(S.player.maxHp, S.player.hp + e.hp); }
    if (e.stam) { S.player.stamina = Math.min(S.player.maxStamina, S.player.stamina + e.stam); }
    if (e.毒 !== undefined) S.毒 = 0;
    if (e.寒) S.守り寒 = e.寒;
    if (e.熱) S.守り熱 = e.熱;
    S._知らせ(it.名 + " を つかった", "good");
  }

  _craft() {
    const S = this.sc;
    const P = S.player.pos;
    const 場 = S.craft.場(P[0], P[2]);
    const list = S.craft.一覧(P[0], P[2], this._craftF || null);
    const 種 = ["", "tool", "weapon", "armor", "potion", "food", "material", "build", "seed"];
    const chips = h("div", { class: "rh-chips" });
    for (const t of 種) {
      const b = h("button", { class: "rh-chip" + ((this._craftF || "") === t ? " is-on" : ""), type: "button",
        text: t ? 種類名[t] : "ぜんぶ" });
      b.addEventListener("click", () => { this._craftF = t || null; this.描く窓(); });
      chips.appendChild(b);
    }
    const g = h("div", { class: "rh-list" });
    let n = 0;
    for (const c of list) {
      if (n++ > 160) break;
      const 材 = Object.keys(c.r.材).map((k) => (ITEM[k] ? ITEM[k].名 : k) + " " + S.inv.count(k) + "/" + c.r.材[k]).join("、");
      const row = h("button", { class: "rh-rec" + (c.作れる ? " is-ok" : ""), type: "button" },
        h("i", { class: "rh-it-c", style: "background:" + 色文字(c.item.色) }),
        h("span", { class: "rh-rec-m" },
          h("span", { class: "rh-rec-n", text: c.item.名 + (c.r.個 > 1 ? " ×" + c.r.個 : "") }),
          h("span", { class: "rh-rec-d", text: (c.場OK ? "" : "【" + c.r.場 + "が いる】") + 材 })),
        h("span", { class: "rh-rec-b", text: c.作れる ? "作る" : "—" }));
      if (c.作れる) row.addEventListener("click", () => {
        const r = S.craft.作る(c.r.id, P[0], P[2], 1);
        if (!r.ok) S._知らせ(r.訳, "warn");
        this.描く窓();
      });
      g.appendChild(row);
    }
    const 場文 = Object.keys(場).filter((k) => 場[k]).join("・");
    this.paneEl.appendChild(this._頭("作る",
      h("span", { class: "rh-mini2", text: "いま使える：" + 場文 })));
    this.paneEl.appendChild(chips);
    this.paneEl.appendChild(g);
  }

  /* ★ 名前を 変えた（2026-09-02）。器を 組み立てる _build() と
     同じ 名前だった ので、**あとに 書いた こちらが 勝ち**、
     new した 瞬間に 落ちて いた（画面が 出なかった）。 */
  _buildPane() {
    const S = this.sc;
    const 合 = new Map();
    for (const s of S.inv.slots) if (s && ITEM[s.id] && ITEM[s.id].種 === "build") 合.set(s.id, (合.get(s.id) || 0) + s.数);
    const g = h("div", { class: "rh-grid" });
    if (!合.size) g.appendChild(h("div", { class: "rh-none", text: "建てられる ものが ありません。「作る」で 板や レンガを 作りましょう。" }));
    for (const [id, n] of 合) {
      g.appendChild(this._tile(id, n, {
        on: S.置くもの === id,
        onclick: () => { S.置くもの = id; S.建てるか = true; this.描く窓(); }
      }));
    }
    const 止 = h("button", { class: "rh-mini", type: "button",
      text: S.建てるか ? "やめる" : "建てはじめる",
      onclick: () => { S.建てるか = !S.建てるか; this.描く窓(); } });
    const 壊 = h("button", { class: "rh-mini", type: "button", text: "近くを こわす",
      onclick: () => {
        const P = S.player.pos;
        const o = S.build.近くの(P[0], P[2], 4);
        if (!o) { S._知らせ("近くに 建てた ものが ありません", "warn"); return; }
        const r = S.build.壊す(o.x, o.y, o.z);
        S._知らせ(r.ok ? (ITEM[o.id].名 + " を こわした") : r.訳, r.ok ? "" : "warn");
      } });
    this.paneEl.appendChild(this._頭("建てる（" + S.build.数() + " 個）", h("span", null, 止, 壊)));

    /* ★ ふたつの 建てかた（2026-09-02）。
       1 個ずつ 置く／設計図で 建物ごと 建てる。
       家 1 軒は 80 個 以上 ある。1 個ずつ 置かせるのは 遊びに ならない。 */
    const 札 = h("div", { class: "rh-chips" });
    for (const [k, 名] of [["one", "1 個ずつ"], ["bp", "設計図"]]) {
      札.appendChild(h("button", {
        class: "rh-chip" + (this._建て方 === k || (!this._建て方 && k === "one") ? " is-on" : ""),
        type: "button", text: 名,
        onclick: () => { this._建て方 = k; this.描く窓(); }
      }));
    }
    this.paneEl.appendChild(札);

    if (this._建て方 === "bp") { this._設計図の中身(); return; }

    this.paneEl.appendChild(h("div", { class: "rh-note", text:
      "選んでから 画面の「おく」を 押すと、見ている 先に 置きます。" }));
    this.paneEl.appendChild(g);
  }

  /* 設計図の 一覧。要る ものと 足りない ものを その場で 出す。 */
  _設計図の中身() {
    const S = this.sc;
    this.paneEl.appendChild(h("div", { class: "rh-note", text:
      "立って いる ところの 前に、建物 ぜんぶを 1 回で 建てます。"
      + "材料は「型」で 数えます（木の かべでも 石の かべでも 1 枚）。" }));
    const 段 = S.combat ? S.combat.lv : 1;
    for (const bp of BLUEPRINTS) {
      const 見 = S.build.設計図を見る(bp);
      const 大 = 大きさ(bp);
      const 要文 = Object.keys(見.要).map((t) => 型名(t) + " " + 見.要[t]).join("、");
      const 足文 = 見.ok ? "" : Object.keys(見.足りない).map((t) => 型名(t) + " あと " + 見.足りない[t]).join("、");
      const 高すぎ = bp.段 > 段 + 2;
      const 行 = h("div", { class: "rh-bp" + (見.ok && !高すぎ ? "" : " is-off") },
        h("div", { class: "rh-bp-l" },
          h("div", { class: "rh-bp-n", text: bp.名 + "　" + 大.w + "×" + 大.d + "×" + 大.h }),
          h("div", { class: "rh-bp-d", text: bp.記 }),
          h("div", { class: "rh-bp-m", text: 要文 }),
          足文 ? h("div", { class: "rh-bp-x", text: "足りない: " + 足文 }) : null,
          高すぎ ? h("div", { class: "rh-bp-x", text: "段位 " + bp.段 + " から" }) : null),
        h("button", {
          class: "rh-mini", type: "button", text: (見.ok && !高すぎ) ? "ここに 建てる" : "—",
          disabled: !見.ok || 高すぎ,
          onclick: () => {
            const r = S.設計図を建てる(bp);
            S._知らせ(r.ok ? (bp.名 + " を 建てた（" + r.数 + " 個）") : r.訳, r.ok ? "good" : "warn");
            if (r.ok) this.開く(""); else this.描く窓();
          }
        }));
      this.paneEl.appendChild(行);
    }
  }

  _quest() {
    const S = this.sc;
    this.paneEl.appendChild(this._頭(this._図 ? "ずかん" : "物語"));
    /* ★ 物語と ずかんを 1 つの 窓に（2026-09-02）。
       下の ボタンを 5 つに すると スマホで 3 行に なり、画面が 潰れる。 */
    const 札 = h("div", { class: "rh-chips" });
    for (const [k, 名] of [["q", "物語"], ["z", "ずかん"]]) {
      札.appendChild(h("button", {
        class: "rh-chip" + ((k === "z") === !!this._図 ? " is-on" : ""), type: "button", text: 名,
        onclick: () => { this._図 = (k === "z"); this.描く窓(); }
      }));
    }
    this.paneEl.appendChild(札);
    if (this._図) { this._ずかん(); return; }
    this._物語();
  }

  /* ══ ずかん（2026-09-02）══════════════════════════════════════
     どれだけの 広さを 見たかを 数で 出す。
     ★ **見て いない ものは 名前も 出さない**。先に 名前が 並ぶと
       探す 楽しみが 消える。 */
  _ずかん() {
    const S = this.sc;
    const 見 = S.見つけた || new Set();
    const 倒 = S.倒した種 || new Set();
    const 全 = ITEM_IDS.length;
    this.paneEl.appendChild(h("div", { class: "rh-q-sp",
      text: "見つけた もの " + 見.size + " / " + 全
        + "　　倒した 相手 " + 倒.size + " / " + ENEMY_IDS.length }));
    /* 種類ごとに */
    for (const 種 in 種類名) {
      const ids = ITEM_IDS.filter((id) => ITEM[id].種 === 種);
      if (!ids.length) continue;
      const n = ids.filter((id) => 見.has(id)).length;
      this.paneEl.appendChild(h("div", { class: "rh-note",
        text: 種類名[種] + "　" + n + " / " + ids.length }));
      const g = h("div", { class: "rh-grid" });
      for (const id of ids) {
        if (見.has(id)) g.appendChild(this._tile(id, 1, {}));
        else g.appendChild(h("span", { class: "rh-it is-un" },
          h("i", { class: "rh-it-c", style: "background:rgba(255,255,255,.10)" }),
          h("span", { class: "rh-it-n", text: "？" })));
      }
      this.paneEl.appendChild(g);
    }
    /* 相手 */
    this.paneEl.appendChild(h("div", { class: "rh-note", text: "相手　" + 倒.size + " / " + ENEMY_IDS.length }));
    const g2 = h("div", { class: "rh-grid" });
    for (const id of ENEMY_IDS) {
      const E = ENEMIES[id];
      if (倒.has(id)) g2.appendChild(h("span", { class: "rh-it", title: E.記 || "" },
        h("i", { class: "rh-it-c", style: "background:" + 色文字(E.色) }),
        h("span", { class: "rh-it-n", text: E.名 })));
      else g2.appendChild(h("span", { class: "rh-it is-un" },
        h("i", { class: "rh-it-c", style: "background:rgba(255,255,255,.10)" }),
        h("span", { class: "rh-it-n", text: "？" })));
    }
    this.paneEl.appendChild(g2);
  }

  _物語() {
    const S = this.sc, q = S.quest;
    const box = h("div", { class: "rh-quests" });
    if (q.章) {
      box.appendChild(h("div", { class: "rh-q-ch", text: q.章.題 }));
      box.appendChild(h("div", { class: "rh-q-cb", text: q.章.語 }));
    }
    if (q.節) {
      const p = q.進み();
      box.appendChild(h("div", { class: "rh-q-s" },
        h("div", { class: "rh-q-st", text: q.節.題 }),
        h("div", { class: "rh-q-sb", text: q.節.語 }),
        h("div", { class: "rh-q-sp", text: q.いまの一行() + "　（" + p.今 + " / " + p.要 + "）" })));
      const 印 = q.目印();
      if (印) box.appendChild(h("div", { class: "rh-q-mark", text: "行き先：" + 印.名 }));
    } else {
      box.appendChild(h("div", { class: "rh-q-sb", text: "物語は 終わりました。" }));
    }
    /* ★ 節の 数は **表から 引く**（前は 36 と 書いて いた）。
       節を 足した ときに 数だけ 古いまま に なる。 */
    box.appendChild(h("div", { class: "rh-q-hist", text: "ここまで " + q.i + " / " + 全節.length + " 節" }));
    /* 受けて いる たのみごと */
    const E = S.errand;
    if (E && E.受.length) {
      box.appendChild(h("div", { class: "rh-note", text: "うけた たのみごと" }));
      for (const e of E.受) {
        box.appendChild(h("div", { class: "rh-q-s" },
          h("div", { class: "rh-q-st", text: e.文 }),
          h("div", { class: "rh-q-sp", text: E.文(e) + (E.済んだ(e) ? "　→ " + e.主 + " へ" : "") })));
      }
    } else if (E) {
      box.appendChild(h("div", { class: "rh-note", text: "町の 人に 話しかけると たのみごとを 受けられます。" }));
    }
    this.paneEl.appendChild(box);
  }
}

export const RHUD_CSS = `
.rh{position:absolute;inset:0;pointer-events:none;
  font-family:Inter,"Hiragino Sans","Noto Sans JP",sans-serif;color:#fff;}
.rh button{pointer-events:auto;font:inherit;color:inherit;cursor:pointer;}

/* 上 … 物語の 一行 */
.rh-quest{position:absolute;left:50%;top:10px;transform:translateX(-50%);
  min-width:min(420px,72vw);max-width:min(560px,92vw);
  padding:8px 16px 10px;border-radius:13px;text-align:center;
  background:rgba(12,10,24,.50);border:1px solid rgba(255,255,255,.13);
  -webkit-backdrop-filter:blur(9px);backdrop-filter:blur(9px);
  box-shadow:0 8px 26px rgba(0,0,0,.32);}
.rh-quest-t{display:block;font:600 13.5px/1.5;letter-spacing:.01em;}
.rh-quest-p{display:block;height:3px;margin-top:7px;border-radius:99px;
  background:linear-gradient(90deg,#8ED0FF,#B79CFF);width:0%;transition:width .35s ease;}

/* 左上 … 体 */
.rh-stats{position:absolute;left:12px;top:52px;display:flex;flex-direction:column;gap:5px;}
.rh-row{display:flex;align-items:center;gap:9px;}
.rh-lv{font:700 12.5px/1;padding:4px 9px;border-radius:8px;
  background:rgba(12,10,24,.52);border:1px solid rgba(255,255,255,.14);}
.rh-bars{display:flex;flex-direction:column;gap:4px;}
.rh-bar{display:block;width:132px;height:8px;border-radius:99px;overflow:hidden;
  background:rgba(6,5,14,.55);box-shadow:inset 0 0 0 1px rgba(255,255,255,.10);}
.rh-bar--s{width:110px;height:5px;} .rh-bar--p{width:110px;height:5px;}
.rh-bar-f{display:block;height:100%;border-radius:99px;transition:width .18s linear;}
.rh-hp{background:linear-gradient(90deg,#FF6B6B,#FF9F6B);}
.rh-st{background:linear-gradient(90deg,#6BE39A,#9BE36B);}
.rh-pw{background:linear-gradient(90deg,#8ED0FF,#C79CFF);}
.rh-env{font:600 11px/1.4;color:#FFD9A8;text-shadow:0 1px 3px rgba(0,0,0,.6);min-height:14px;}
.rh-env.is-bad{color:#FF9C8C;}

/* 中央下 … 狙い */
.rh-aim{position:absolute;left:50%;bottom:118px;transform:translateX(-50%);
  font:600 13px/1.4;padding:0;opacity:0;transition:opacity .18s ease;
  text-shadow:0 2px 6px rgba(0,0,0,.7);white-space:nowrap;}
.rh-aim.is-on{opacity:1;}

/* 右下 … 知らせ */
.rh-log{position:absolute;right:12px;bottom:120px;display:flex;flex-direction:column-reverse;
  gap:4px;align-items:flex-end;max-width:44vw;}
.rh-log-i{font:500 11.5px/1.5;padding:4px 10px;border-radius:9px;
  background:rgba(10,8,20,.52);border:1px solid rgba(255,255,255,.10);
  text-shadow:0 1px 2px rgba(0,0,0,.5);}
.rh-log-i.is-good{color:#B6F0C4;border-color:rgba(140,240,180,.30);}
.rh-log-i.is-warn{color:#FFC9A8;border-color:rgba(255,180,130,.30);}

/* 下 … ボタン */
.rh-bottom{position:absolute;left:0;right:0;bottom:0;
  display:flex;align-items:flex-end;justify-content:space-between;
  padding:0 12px calc(12px + env(safe-area-inset-bottom,0px));gap:10px;}
.rh-tabs{display:flex;gap:7px;flex-wrap:wrap;}
.rh-tab{height:44px;padding:0 15px;border-radius:12px;font:600 13px/1;
  border:1px solid rgba(255,255,255,.16);background:rgba(12,10,24,.52);
  -webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);}
.rh-tab.is-on{background:rgba(120,110,220,.66);border-color:rgba(190,180,255,.5);}
.rh-act{width:78px;height:78px;border-radius:50%;font:700 15px/1;
  border:2px solid rgba(255,255,255,.24);background:rgba(90,80,190,.56);
  -webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);
  box-shadow:0 8px 24px rgba(0,0,0,.36);flex:0 0 auto;}
.rh-act:active{transform:scale(.94);}
.rh-act.is-hot{background:rgba(210,70,70,.62);border-color:rgba(255,170,170,.5);}
.rh-act.is-wait{background:rgba(70,110,190,.52);border-color:rgba(150,200,255,.45);}

/* 窓 */
.rh-pane{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
  width:min(720px,94vw);max-height:min(74vh,620px);overflow:auto;pointer-events:auto;
  border-radius:18px;padding:14px 14px 16px;
  background:rgba(14,12,26,.90);border:1px solid rgba(255,255,255,.14);
  box-shadow:0 24px 70px rgba(0,0,0,.55);
  -webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);}
.rh-ph{display:flex;align-items:center;gap:10px;margin-bottom:10px;}
.rh-ph-t{font:700 16px/1.3;flex:1 1 auto;}
.rh-ph-x{width:34px;height:34px;border-radius:10px;border:1px solid rgba(255,255,255,.16);
  background:rgba(255,255,255,.06);font-size:14px;}
.rh-mini{height:32px;padding:0 12px;border-radius:9px;font:600 12px/1;margin-left:6px;
  border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.07);}
.rh-mini2{font:500 11.5px/1.4;color:rgba(255,255,255,.62);}
.rh-note{font:500 11.5px/1.6;color:rgba(255,255,255,.60);margin:0 0 10px;}
.rh-equip{font:600 12px/1.5;color:#CFC8F0;margin-bottom:10px;}
.rh-none{grid-column:1/-1;font:500 12.5px/1.8;color:rgba(255,255,255,.60);padding:18px 4px;text-align:center;}
.rh-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:8px;}
.rh-it{display:flex;flex-direction:column;align-items:center;gap:4px;min-height:76px;
  padding:9px 6px;border-radius:12px;border:1px solid rgba(255,255,255,.12);
  background:rgba(255,255,255,.05);text-align:center;}
.rh-it:hover{background:rgba(255,255,255,.10);}
.rh-it.is-on{border-color:rgba(160,200,255,.6);background:rgba(80,110,200,.28);}
.rh-it-c{width:22px;height:22px;border-radius:7px;flex:0 0 auto;position:relative;
  display:inline-flex;align-items:center;justify-content:center;}
.rh-it-c svg{width:14px;height:14px;display:block;}
.rh-it-n{font:600 11px/1.35;}
.rh-it-x{font:700 10.5px/1;color:rgba(255,255,255,.68);}
.rh-chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:9px;}
/* 設計図の 行 */
.rh-bp{display:flex;align-items:center;gap:10px;padding:9px 10px;margin-bottom:6px;
  border-radius:12px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.045);}
.rh-bp.is-off{opacity:.5;}
.rh-it.is-un{opacity:.34;pointer-events:none;}
.rh-it.is-drop{border-color:rgba(255,150,150,.42);background:rgba(90,30,30,.30);}
.rh-mini.is-on{background:rgba(190,70,70,.42);border-color:rgba(255,170,170,.44);}
.rh-rec.is-off{opacity:.5;}
.rh-bp-l{flex:1 1 auto;min-width:0;}
.rh-bp-n{font:700 13px/1.4;}
.rh-bp-d{font:500 11px/1.5;color:rgba(255,255,255,.62);}
.rh-bp-m{font:500 10.5px/1.5;color:rgba(255,255,255,.50);margin-top:2px;}
.rh-bp-x{font:600 10.5px/1.5;color:#FFC9A8;margin-top:2px;}
.rh-chip{height:30px;padding:0 11px;border-radius:99px;font:600 11.5px/1;
  border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);}
.rh-chip.is-on{background:rgba(120,110,220,.60);}
.rh-list{display:flex;flex-direction:column;gap:5px;}
.rh-rec{display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:11px;
  border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.035);text-align:left;
  opacity:.55;}
.rh-rec.is-ok{opacity:1;border-color:rgba(150,230,180,.28);background:rgba(60,140,90,.16);}
.rh-rec-m{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px;}
.rh-rec-n{font:600 12.5px/1.35;}
.rh-rec-d{font:500 10.5px/1.5;color:rgba(255,255,255,.60);}
.rh-rec-b{font:700 11.5px/1;color:#B6F0C4;}
.rh-quests{display:flex;flex-direction:column;gap:9px;}
.rh-q-ch{font:700 15px/1.4;}
.rh-q-cb{font:500 12.5px/1.9;color:rgba(255,255,255,.72);}
.rh-q-s{padding:11px 13px;border-radius:12px;background:rgba(255,255,255,.05);
  border:1px solid rgba(255,255,255,.10);display:flex;flex-direction:column;gap:4px;}
.rh-q-st{font:700 13.5px/1.4;}
.rh-q-sb{font:500 12px/1.85;color:rgba(255,255,255,.70);}
.rh-q-sp{font:600 12px/1.5;color:#9ED0FF;}
.rh-q-mark{font:600 12px/1.5;color:#FFD9A8;}
.rh-q-hist{font:500 11px/1.5;color:rgba(255,255,255,.45);}

/* 章の 幕 */
.rh-chapter{position:absolute;inset:0;display:grid;place-items:center;text-align:center;
  background:linear-gradient(180deg,rgba(6,5,14,.10),rgba(6,5,14,.62) 46%,rgba(6,5,14,.10));
  animation:rhCh 6s ease both;pointer-events:none;padding:0 22px;}
@keyframes rhCh{0%{opacity:0}12%{opacity:1}82%{opacity:1}100%{opacity:0}}
.rh-ch-t{font:700 clamp(22px,5vw,34px)/1.35;letter-spacing:.04em;
  text-shadow:0 3px 18px rgba(0,0,0,.7);}
.rh-ch-b{margin-top:12px;font:500 clamp(12px,2.6vw,15px)/2;max-width:34em;
  color:rgba(255,255,255,.82);text-shadow:0 2px 10px rgba(0,0,0,.7);}

/* 小さな 地図 */
.rh-mapw{position:absolute;right:12px;top:58px;width:132px;height:132px;border-radius:50%;
  overflow:hidden;border:2px solid rgba(255,255,255,.22);
  box-shadow:0 8px 26px rgba(0,0,0,.42);background:rgba(10,8,20,.5);}
.rh-map{width:100%;height:100%;display:block;}
/* ことばの 問い */
.rh-qz{position:absolute;left:50%;bottom:150px;transform:translateX(-50%);pointer-events:auto;
  width:min(520px,92vw);padding:13px 15px 14px;border-radius:16px;
  background:rgba(16,14,34,.90);border:1px solid rgba(160,180,255,.28);
  box-shadow:0 18px 46px rgba(0,0,0,.5);
  -webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);
  animation:rhQz .28s cubic-bezier(.22,1,.36,1) both;}
@keyframes rhQz{from{opacity:0;transform:translateX(-50%) translateY(12px)}to{opacity:1;transform:translateX(-50%)}}
.rh-qz-h{font:700 10.5px/1;letter-spacing:.2em;color:#9ED0FF;margin-bottom:7px;}
.rh-qz-q{font:600 14.5px/1.6;margin-bottom:11px;}
.rh-qz-c{display:grid;grid-template-columns:1fr 1fr;gap:7px;}
.rh-qz-b{min-height:46px;padding:8px 12px;border-radius:11px;font:600 13px/1.45;text-align:left;
  border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);}
.rh-qz-b:hover{background:rgba(120,140,255,.24);border-color:rgba(160,190,255,.5);}
.rh-qz-x{margin-top:9px;height:32px;padding:0 12px;border-radius:9px;font:600 11.5px/1;
  border:1px solid rgba(255,255,255,.12);background:transparent;color:rgba(255,255,255,.6);}
/* 話す */
.rh-talk{position:absolute;left:50%;bottom:150px;transform:translateX(-50%);
  height:46px;padding:0 20px;border-radius:13px;font:600 13.5px/1;
  border:1px solid rgba(255,220,150,.34);background:rgba(120,86,30,.62);
  -webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);}

@media (max-width:640px){
  /* ★ 押す ところは 40px 以上（2026-09-02・実測で 25〜34px の ものが あった）。
     指では 押せない ボタンを 置かない。 */
  /* ★ 押す ところは **40px 以上**（2026-09-02 に 測り直した）。
     38px の 札が 3 種類 残って いた。指の 検査で 見つかった。 */
  .rh-ph-x{width:44px;height:44px;}
  .rh-mini{height:40px;padding:0 14px;font-size:12.5px;}
  .rh-chip{height:40px;padding:0 14px;}
  .rh-qz-x{height:40px;}
  .rh-it{min-height:82px;}
  .rh-qz{bottom:128px;width:calc(100vw - 18px);padding:11px 12px 12px;}
  .rh-qz-q{font-size:13px;}
  .rh-qz-c{grid-template-columns:1fr;}
  .rh-talk{bottom:128px;height:44px;font-size:12.5px;}
  /* ★ スマホの 置きかた（2026-09-02・実写で 直した）。
     直す前: 物語の 帯が「もどる」に かぶり、札が 2 段に なって
     知らせと 重なって いた。 */
  .rh-quest{top:8px;left:8px;transform:none;padding:7px 10px 8px;min-width:0;
    width:calc(100vw - 96px);}
  .rh-quest-t{font-size:11.5px;}
  .rh-stats{top:56px;left:9px;}
  .rh-bar{width:96px;} .rh-bar--s,.rh-bar--p{width:80px;}
  .rh-tabs{display:grid;grid-template-columns:repeat(2,1fr);gap:6px;flex:1 1 auto;max-width:calc(100vw - 96px);}
  .rh-tab{height:40px;padding:0 8px;font-size:12px;}
  .rh-act{width:64px;height:64px;font-size:12.5px;}
  .rh-mapw{width:96px;height:96px;right:8px;top:56px;border-width:1.5px;}
  /* ★ 狙いの 文と 知らせが 重なって いた（実写・2026-09-02）。
     文は 左、知らせは 右に 分ける。真ん中に 置くと 必ず ぶつかる。 */
  .rh-aim{bottom:150px;left:9px;transform:none;font-size:12px;
    max-width:44vw;text-align:left;}
  .rh-log{bottom:150px;right:9px;max-width:50vw;}
  .rh-pane{width:calc(100vw - 16px);max-height:78vh;border-radius:15px;padding:11px;}
  .rh-grid{grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:6px;}
}
`;
