/* ══════════════════════════════════════════════════════════════════════════
   ことばの力。**これが この RPG が VocabuQuiz の 中に ある 理由。**

   考えかた:
     ★ 走る 遊び（アスレチック）は 門を くぐる ときに 問題が 出た。
       探索では **戦いの 途中**に 出す。答えると 一撃が 通る。
     ★ 出すのは 敵と 向き合った とき だけ。歩いて いる 間は 邪魔しない。
     ★ **間違えても 損を させない。** 力が 溜まらない だけ。
       間違いを 罰にすると、答えるのが 怖く なって 誰も 押さなく なる。
     ★ 問題は 本体の 出題（data/questions.js）を 借りる。
       取れなければ **その 場に ある もの**から 作る（世界の 言葉）。
   ══════════════════════════════════════════════════════════════════════════ */
import { ITEM, ITEM_IDS } from "../data/items.js";
import { ENEMIES } from "../data/enemies.js";
import { BIOMES, BIOME_IDS } from "../world/biome.js";

/** 世界の ものから 作る 問題（通信が 要らない・必ず 出る） */
function 世界の問題(r) {
  const 型 = Math.floor(r() * 3);
  if (型 === 0) {
    /* この もの は 何の 仲間？ */
    const ids = ITEM_IDS.filter((k) => ITEM[k].種 === "material" || ITEM[k].種 === "potion" || ITEM[k].種 === "food");
    const id = ids[Math.floor(r() * ids.length)];
    const it = ITEM[id];
    const 正 = { material: "素材", potion: "薬", food: "食べもの" }[it.種];
    const 外 = ["素材", "薬", "食べもの", "武器"].filter((x) => x !== 正);
    return {
      問: "「" + it.名 + "」は どれ？", 答: 正,
      選: [正, 外[0], 外[1], 外[2]].sort(() => r() - 0.5).slice(0, 4),
      素: it.記
    };
  }
  if (型 === 1) {
    /* この 敵は どこに 出る？ */
    const bs = BIOME_IDS.filter((b) => BIOMES[b].出る.length);
    const b = bs[Math.floor(r() * bs.length)];
    const eid = BIOMES[b].出る[Math.floor(r() * BIOMES[b].出る.length)];
    const E = ENEMIES[eid];
    if (!E) return 世界の問題(r);
    const 外 = bs.filter((x) => x !== b).sort(() => r() - 0.5).slice(0, 3).map((x) => BIOMES[x].名);
    return {
      問: "「" + E.名 + "」が いるのは？", 答: BIOMES[b].名,
      選: [BIOMES[b].名].concat(外).sort(() => r() - 0.5),
      素: E.記
    };
  }
  /* これを 作るのに 要る ものは？ */
  const ids = ITEM_IDS.filter((k) => ITEM[k].種 === "weapon" || ITEM[k].種 === "tool");
  const id = ids[Math.floor(r() * ids.length)];
  const it = ITEM[id];
  const 段 = it.段 || "ki";
  const 正 = ITEM[段] ? ITEM[段].名 : "木材";
  const 外 = ["木材", "石ころ", "鉄", "銀", "黒鋼"].filter((x) => x !== 正).slice(0, 3);
  return {
    問: "「" + it.名 + "」を 作るのに いるのは？", 答: 正,
    選: [正].concat(外).sort(() => r() - 0.5),
    素: it.記
  };
}

export class Words {
  constructor(o) {
    this.combat = o.combat;
    this.onAsk = o.onAsk || function () {};
    this.onAnswer = o.onAnswer || function () {};
    this.quest = o.quest;
    this.問 = null;
    this.答えた = 0;
    this.正 = 0;
    this._外の問 = [];
    this._取りに行った = false;
    this.cool = 0;
  }

  /** 本体の 出題を 先に 取っておく（あれば 使う）。失敗しても 黙って 世界の 問題へ。 */
  async 先に取る() {
    if (this._取りに行った) return;
    this._取りに行った = true;
    try {
      const m = await import("../../data/questions.js");
      if (m && m.fetchQuestions) {
        const r = await m.fetchQuestions({ count: 12, seed: Date.now() & 0xffff });
        const list = (r && (r.questions || r.items || r)) || [];
        for (const q of list) {
          const 問 = String(q.prompt || q.question || q.text || "").trim();
          const 選 = (q.choices || q.options || [])
            .map((c) => (typeof c === "string" ? c : String((c && (c.text || c.label)) || "")).trim())
            .filter((c) => c.length > 0);
          /* ★ 答えは **番号**で 来る（本体の 出題は answer: 0〜3）。
             そのまま 文字に すると 選択肢に「0」が 混じり、
             どれを 選んでも 外れる（実写で 出た）。 */
          let 答 = "";
          if (typeof q.answer === "number") 答 = 選[q.answer] || "";
          else if (typeof q.answer === "string") 答 = q.answer.trim();
          else if (typeof q.correct === "number") 答 = 選[q.correct] || "";
          else if (typeof q.correct === "string") 答 = q.correct.trim();
          if (問 && 選.length >= 2 && 答 && 選.indexOf(答) >= 0) {
            this._外の問.push({ 問, 選, 答, 素: String(q.tag || "") });
          }
        }
      }
    } catch (e) {}
  }

  /** 問題を 1 つ 出す。 */
  出す() {
    if (this.問) return this.問;
    let q = null;
    if (this._外の問.length) q = this._外の問.pop();
    if (!q) {
      let s = (Date.now() ^ (this.答えた * 2654435761)) >>> 0;
      const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return (s >>> 8) / 0xffffff; };
      q = 世界の問題(r);
    }
    /* 選択肢は 4 つ まで・重複を 除く */
    const 選 = [];
    for (const c of q.選) if (c && 選.indexOf(c) < 0) 選.push(c);
    q.選 = 選.slice(0, 4);
    if (q.選.indexOf(q.答) < 0) q.選[q.選.length - 1] = q.答;
    this.問 = q;
    this.onAsk(q);
    return q;
  }

  /** 答える。戻り: {正:bool, 力:number} */
  答える(選んだ) {
    const q = this.問;
    if (!q) return { 正: false, 力: this.combat.力 };
    const 正 = String(選んだ) === String(q.答);
    this.答えた++;
    if (正) this.正++;
    this.combat.ことば(正);
    if (this.quest) this.quest.言葉報告(正);
    this.問 = null;
    this.onAnswer(正, q);
    return { 正, 力: this.combat.力, 答: q.答 };
  }

  やめる() { this.問 = null; }

  /** いま 問題を 出す ころ合いか（敵と 向き合って いて、少し 間が あいた） */
  ころ合い(dt, 敵あり) {
    this.cool = Math.max(0, this.cool - dt);
    if (this.問) return false;
    if (!敵あり) return false;
    if (this.cool > 0) return false;
    if (this.combat.力 >= this.combat.力max) return false;
    this.cool = 7;
    return true;
  }

  記録() {
    return { 答えた: this.答えた, 正: this.正,
      率: this.答えた ? Math.round((this.正 / this.答えた) * 100) : 0 };
  }
}
