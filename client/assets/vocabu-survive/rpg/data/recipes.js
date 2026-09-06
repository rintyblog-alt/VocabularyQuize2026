/* ══════════════════════════════════════════════════════════════════════════
   作りかた（レシピ）。**表だけ**。

   ★ どの もの にも「どう すれば 手に 入るか」が ある こと。
     採るしか ない もの と、作る しか ない もの を はっきり 分ける。
   ★ 作る 場所:
       "手"    … どこでも
       "台"    … 作業台の そば
       "火"    … たき火の そば
       "かま"  … かまど（＝火 ＋ 石）のそば
   ★ 段の 道具・武器・防具は **決まりで 作る**（1 つずつ 書かない）。
   ══════════════════════════════════════════════════════════════════════════ */
import { 段, 道具の型, 武器の型, 防具の型, 建材の材, 建材の型 } from "./items.js";

const R = [];
let seq = 0;
function 作(o) {
  R.push(Object.assign({ id: "r" + (++seq), 場: "手", 個: 1, 秒: 0.6 }, o));
}

/* ══ ① 中間の 素材 ═════════════════════════════════════════════ */
作({ 出: "himo", 材: { kusa: 3 }, 場: "手", 記: "草を編む" });
作({ 出: "himo", 材: { tsuru: 1 }, 場: "手", 記: "つるをほどく", 個: 2 });
作({ 出: "ita", 材: { ki: 1 }, 場: "手", 個: 4, 記: "木材を割る" });
作({ 出: "sumi", 材: { ki: 2 }, 場: "火", 個: 3, 秒: 4, 記: "木を蒸し焼きにする" });
作({ 出: "renga", 材: { doro: 2 }, 場: "火", 個: 2, 秒: 3, 記: "泥を焼く" });
作({ 出: "garasu", 材: { suna: 3, sumi: 1 }, 場: "かま", 秒: 5, 記: "砂を溶かす" });
作({ 出: "dou", 材: { dou_seki: 2, sumi: 1 }, 場: "かま", 秒: 4, 記: "銅を吹く" });
作({ 出: "tetsu", 材: { tetsu_seki: 2, sumi: 1 }, 場: "かま", 秒: 5, 記: "鉄を吹く" });
作({ 出: "gin", 材: { gin_seki: 2, sumi: 1 }, 場: "かま", 秒: 6, 記: "銀を吹く" });
作({ 出: "hagane", 材: { tetsu: 2, sumi: 2 }, 場: "かま", 秒: 8, 記: "鉄を鍛える" });
作({ 出: "kurogane", 材: { kuro_kou: 2, hagane: 1, hi_no_kesshou: 1 }, 場: "かま", 秒: 12, 記: "黒鋼を打つ" });
作({ 出: "nuno", 材: { ke: 3 }, 場: "台", 個: 2, 秒: 2, 記: "毛を織る" });
作({ 出: "kawa", 材: { ke: 2, shio: 1 }, 場: "台", 秒: 3, 記: "皮をなめす" });
作({ 出: "kayaku", 材: { iou: 2, sumi: 2 }, 場: "台", 秒: 4, 記: "混ぜる（慎重に）" });
作({ 出: "mahou_ko", 材: { mahou_no_su: 2 }, 場: "台", 個: 2, 秒: 2, 記: "砂を挽く" });
作({ 出: "seisui", 材: { kouri: 2 }, 場: "火", 個: 2, 秒: 2, 記: "氷を溶かす" });
作({ 出: "seisui", 材: { hikari_koke: 1, doro: 1 }, 場: "台", 記: "濾す" });

/* ══ ② 道具・武器・防具（段ごと）══════════════════════════════════
   下の 段の 道具が あると 作れる、と いう 決まりは 置かない
   （持ち歩きを 増やすだけ）。材料の 段で 自然に 順番が つく。 */
const 段の材 = { ki: 3, ishi: 3, hone: 3, dou: 3, tetsu: 3, gin: 3, hagane: 4, suishou: 4, hi: 4, kurogane: 5 };
for (const t of 段) {
  const 主 = t.素;
  const n = 段の材[t.id] || 3;
  const 場 = (t.id === "ki" || t.id === "ishi" || t.id === "hone") ? "台" : "かま";
  for (const k of 道具の型) {
    const 材 = {}; 材[主] = n; 材.eda = 2; 材.himo = 1;
    作({ 出: t.id + "_" + k.id, 材, 場, 秒: 1.2 + n * 0.4, 記: t.名 + "で" + k.名 + "を作る" });
  }
  for (const w of 武器の型) {
    const 材 = {}; 材[主] = n + (w.id === "axeW" ? 2 : w.id === "dagger" ? -1 : 0);
    材.eda = w.id === "bow" ? 3 : 2; 材.himo = w.id === "bow" ? 3 : 1;
    if (w.id === "staff") 材.mahou_ko = 1;
    作({ 出: t.id + "_" + w.id, 材, 場, 秒: 1.6 + n * 0.5, 記: t.名 + "で" + w.名 + "を作る" });
  }
  for (const a of 防具の型) {
    const 材 = {}; 材[主] = Math.max(2, Math.round(n * (a.id === "chest" ? 1.6 : a.id === "legs" ? 1.2 : 0.8)));
    材.kawa = a.id === "chest" ? 2 : 1;
    作({ 出: t.id + "_" + a.id, 材, 場, 秒: 1.8 + n * 0.5, 記: t.名 + "で" + a.名 + "を作る" });
  }
}

/* ══ ③ 建材 ═══════════════════════════════════════════════════ */
const 型の量 = { cube: 1, slab: 0.5, post: 0.4, wall: 0.8, roof: 1, door: 1.2, window: 0.8, fence: 0.6, stair: 0.7 };
for (const m of 建材の材) {
  for (const k of 建材の型) {
    const 材 = {};
    材[m.素] = Math.max(1, Math.round(2 * (型の量[k.id] || 1)));
    if (k.id === "door" || k.id === "window") 材.himo = 1;
    作({ 出: "b_" + m.id + "_" + k.id, 材, 場: "台", 個: 4, 秒: 0.5, 記: m.名 + "の" + k.名 });
  }
}
作({ 出: "b_torch", 材: { eda: 1, sumi: 1 }, 場: "手", 個: 4, 記: "たいまつ" });
作({ 出: "b_fire", 材: { eda: 4, ishi: 3 }, 場: "手", 記: "たき火を組む" });
作({ 出: "b_bench", 材: { ki: 4, ita: 2 }, 場: "手", 記: "作業台を組む" });
作({ 出: "b_chest", 材: { ita: 6, himo: 1 }, 場: "台", 記: "たからばこ" });
作({ 出: "b_farm", 材: { doro: 4, eda: 2 }, 場: "手", 個: 2, 記: "はたけを起こす" });
作({ 出: "b_sign", 材: { ita: 2, eda: 1 }, 場: "台", 記: "かんばん" });

/* ══ ④ 食べもの ════════════════════════════════════════════════ */
作({ 出: "yaki_kinoko", 材: { kinoko_shiro: 2 }, 場: "火", 秒: 2, 記: "きのこを焼く" });
作({ 出: "pan", 材: { kusa: 4, seisui: 1 }, 場: "火", 秒: 3, 記: "焼く" });
作({ 出: "kinomi_pai", 材: { kinomi: 4, pan: 1, hachimitsu: 1 }, 場: "火", 秒: 5, 記: "パイを焼く" });
作({ 出: "hachimitsu_yu", 材: { hachimitsu: 1, seisui: 1 }, 場: "火", 秒: 2, 記: "湯を沸かす" });
作({ 出: "hoshi_niku", 材: { ke: 1, shio: 2 }, 場: "台", 秒: 4, 記: "干す" });
作({ 出: "kai_shiru", 材: { kai: 3, seisui: 1, shio: 1 }, 場: "火", 秒: 3, 記: "煮る" });
/* ★ 前は 「貝がら＋枝」で 焼き魚が できて いた（魚が 無かった ため）。
   つりで 魚が 手に 入るように なった ので **魚から 焼く**（2026-09-02）。 */
作({ 出: "yaki_sakana", 材: { sakana: 1, eda: 1 }, 場: "火", 秒: 2, 記: "串に刺して焼く" });
作({ 出: "yaki_oosakana", 材: { oo_sakana: 1, eda: 2, shio: 1 }, 場: "火", 秒: 4, 記: "大きな魚を焼く" });
作({ 出: "uo_nabe", 材: { sakana: 2, doro_uo: 1, seisui: 2, yakusou: 1 }, 場: "火", 秒: 6, 記: "魚を煮る" });
作({ 出: "hikari_yaki", 材: { hikari_uo: 1, shio: 2, eda: 1 }, 場: "火", 秒: 5, 記: "ひかり魚を焼く" });
作({ 出: "suupu", 材: { kouri_uo: 1, yakusou: 1, seisui: 2 }, 場: "火", 秒: 5, 記: "氷魚で 温まる スープ" });
作({ 出: "suupu", 材: { yakusou: 1, kinoko_shiro: 2, seisui: 2, shio: 1 }, 場: "火", 秒: 6, 記: "じっくり煮る" });

/* ══ ⑤ 薬 ═════════════════════════════════════════════════════ */
作({ 出: "kusuri_ko", 材: { yakusou: 2, seisui: 1 }, 場: "台", 秒: 2, 記: "煎じる" });
作({ 出: "kusuri_chu", 材: { yakusou: 4, hana_shiro: 1, seisui: 2 }, 場: "台", 秒: 4, 記: "しっかり煎じる" });
作({ 出: "kusuri_dai", 材: { kusuri_chu: 2, sabaku_hana: 1, mahou_ko: 1 }, 場: "台", 秒: 8, 記: "練り上げる" });
作({ 出: "dokukeshi", 材: { doku_kinoko: 1, yakusou: 2, sumi: 1 }, 場: "台", 秒: 3, 記: "毒をもって毒を" });
作({ 出: "atatakai_kusuri", 材: { hi_no_kesshou: 1, seisui: 2, hachimitsu: 1 }, 場: "台", 秒: 4, 記: "温める" });
作({ 出: "suzushii_kusuri", 材: { kouri: 3, seisui: 2, yuki_hana: 1 }, 場: "台", 秒: 4, 記: "冷やす" });
作({ 出: "chikara_no_kusuri", 材: { kinoko_aka: 2, hone: 1, mahou_ko: 1 }, 場: "台", 秒: 5, 記: "力を煮出す" });
作({ 出: "hayasa_no_kusuri", 材: { kaze_no_ha: 2, yakusou: 2, mahou_ko: 1 }, 場: "台", 秒: 5, 記: "風を閉じ込める" });
作({ 出: "katasa_no_kusuri", 材: { ishi: 4, gin: 1, mahou_ko: 1 }, 場: "台", 秒: 5, 記: "硬さを移す" });
作({ 出: "kioku_no_kusuri", 材: { suishou_murasaki: 2, mahou_ko: 2, seisui: 2 }, 場: "台", 秒: 8, 記: "記憶をとどめる" });

/* ══ ⑥ たね ════════════════════════════════════════════════════ */
作({ 出: "s_kusa", 材: { kusa: 2 }, 場: "手", 個: 2, 記: "草からたねを取る" });
作({ 出: "s_yakusou", 材: { yakusou: 2 }, 場: "手", 記: "薬草からたねを取る" });
作({ 出: "s_kinomi", 材: { kinomi: 3 }, 場: "手", 記: "木の実からたねを取る" });
作({ 出: "s_hana", 材: { hana_shiro: 2 }, 場: "手", 記: "花からたねを取る" });
作({ 出: "s_kinoko", 材: { kinoko_shiro: 2 }, 場: "手", 記: "きのこの胞子を集める" });
作({ 出: "s_yuki", 材: { yuki_hana: 2 }, 場: "台", 記: "雪の花のたね" });

export const RECIPES = R;
/** 出るもの → 作りかた（複数 ある ことも ある） */
export const 作りかた = (() => {
  const m = {};
  for (const r of R) (m[r.出] || (m[r.出] = [])).push(r);
  return m;
})();
/** その 材料が 使える 作りかた */
export function 使い道(itemId) {
  return R.filter((r) => Object.prototype.hasOwnProperty.call(r.材, itemId));
}
