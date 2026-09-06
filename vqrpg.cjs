#!/usr/bin/env node
/* 探索モードの 検査。実ブラウザで 世界を 作り、歩いて、目安を 測る。 */
"use strict";
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
const { chromium } = require("playwright");
let ok=0, ng=0; const 落=[];
const 節=(t)=>console.log("\n══ "+t+" ══");
const 見=(c,t,d)=>{ if(c){ok++;console.log("  ok   "+t+(d!==undefined?"  → "+JSON.stringify(d).slice(0,200):""));}
  else{ng++;落.push(t);console.log("  NG   "+t+(d!==undefined?"  → "+JSON.stringify(d).slice(0,300):""));} };
const 待=(m)=>new Promise(s=>setTimeout(s,m));

(async () => {
  const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
  const ctx = await b.newContext({ viewport:{width:1100,height:760} });
  const pg = await ctx.newPage();
  const 例外=[]; pg.on("pageerror", e=>例外.push(String(e).slice(0,200)));
  const con=[]; pg.on("console", m=>{ if(m.type()==="error") con.push(m.text().slice(0,200)); });
  節("① 世界を つくる");
  await pg.goto(BASE + "/rpg-lab.html?tier=high&seed=20260902", { waitUntil:"domcontentloaded" });
  await pg.waitForFunction(()=>window.__rpg && window.__rpg.ready, null, {timeout:45000});
  await pg.waitForTimeout(4000);
  const rs = await pg.evaluate(()=>window.__rpg.state());
  見(rs.ready === true, "★★ **世界が できた**", {world:rs.world, biome:rs.biome, pos:rs.pos, canvas:rs.canvas});
  見(rs.canvas && rs.canvas[0] > 800, "★ 画面いっぱいに 描いている", rs.canvas);
  見(rs.chunks && rs.chunks.live > 8, "★ 区画が 出て いる", rs.chunks);
  見(rs.draw && rs.draw.tris > 20000, "★★ **三角が 描かれて いる**", rs.draw && {tris:rs.draw.tris, draws:rs.draw.draws, inst:rs.draw.instances});
  見(rs.draw && rs.draw.draws < 220, "★ 描く 回数が 多すぎない（220 未満）", rs.draw && rs.draw.draws);

  節("①-b 地面が 上を 向いて いる（裏返りの 見張り）");
  /* 直す前: 三角の 回す 向きが 逆で 法線が 下向きに なり、
     **地面が 1 枚も 見えなかった**（上から 見ても 何も 無い）。 */
  const 法 = await pg.evaluate(()=>{
    const r=window.__rpg;
    const c = r.chunks.live.values().next().value;
    return { 面: c.meshIds.length };
  });
  const 上向き = await pg.evaluate(()=>{
    /* 生成しなおして 法線を 数える */
    return import("/assets/vocabu-survive/rpg/world/chunk.js").then(async (M)=>{
      const T = await import("/assets/vocabu-survive/rpg/world/terrain.js");
      const t = new T.Terrain(20260902);
      const g = M.generate(t, 0, 0, 20260902).grounds[0].mesh.normal;
      let up=0, dn=0;
      for (let i=1;i<g.length;i+=3){ if (g[i] > 0) up++; else dn++; }
      return { up, dn };
    });
  });
  見(上向き.dn === 0 && 上向き.up > 100, "★★ **地面の 法線が すべて 上向き**", 上向き);

  節("② 歩く");
  const p0 = rs.pos.slice();
  /* ★ キーの 名前は **e.code**（"KeyW"）。"w" では 当たらない。
     2026-09-02 まで 本体も この 検査も "w" を 見て いて、
     **両方 間違って いた ので 通って いた**。 */
  const 前v = await pg.evaluate(()=>{
    const r=window.__rpg; const P=r.player.pos;
    const fx=P[0]-r.cam.pos[0], fz=P[2]-r.cam.pos[2]; const L=Math.hypot(fx,fz)||1;
    return [fx/L, fz/L];
  });
  await pg.evaluate(()=>{ window.__rpg.input.keys["KeyW"]=true; });
  await pg.waitForTimeout(2600);
  await pg.evaluate(()=>{ window.__rpg.input.keys["KeyW"]=false; });
  await pg.waitForTimeout(600);
  const rs2 = await pg.evaluate(()=>window.__rpg.state());
  const dx = rs2.pos[0]-p0[0], dz = rs2.pos[2]-p0[2];
  const 進 = Math.hypot(dx, dz);
  /* ★ 距離だけ 見ては いけない。**カメラの どちら向きか**まで 見る
     （前後が 逆でも 距離は 同じ。実際 それで 見逃した）。 */
  const 内 = 進 > 0.01 ? (dx/進)*前v[0] + (dz/進)*前v[1] : 0;
  見(進 > 2, "★★ **W で 進む**", {前:p0, 後:rs2.pos, 進んだ:Math.round(進)});
  見(内 > 0.7, "★★ **進む 向きが カメラの 前**", {内:+内.toFixed(2)});
  見(rs2.chunks.built > rs.chunks.built || rs2.chunks.live >= rs.chunks.live, "★ 歩くと 区画が できる", {前:rs.chunks.built, 後:rs2.chunks.built});
  見(Math.abs(rs2.pos[1] - 0) < 200, "地面から 落ちて いない", rs2.pos[1]);

  節("③ とる（採取）");
  const 取 = await pg.evaluate(async ()=>{
    const r=window.__rpg;
    for (let i=0;i<400;i++){
      r._tapAct = true;
      await new Promise(res=>requestAnimationFrame(res));
      if (r.inv.used() >= 8) break;          /* 埋め尽くさない */
    }
    return { 木:r.inv.count("ki"), 石:r.inv.count("ishi"), 枠:r.inv.used(), 節:r.quest.i };
  });
  見(取.木 + 取.石 > 0, "★★ **とると 持ちものに 入る**", 取);

  節("④ 作る（クラフト）");
  const 作 = await pg.evaluate(()=>{
    const r=window.__rpg, P=r.player.pos;
    /* 検査の ため 持ちものを 空に してから 材料だけ 入れる */
    r.inv.slots = new Array(r.inv.n).fill(null);
    r.inv.add("ki", 20); r.inv.add("ishi", 20); r.inv.add("eda", 20); r.inv.add("kusa", 20);
    const 一覧 = r.craft.一覧(P[0], P[2]);
    const ita = 一覧.find(x=>x.r.出==="ita");
    const res = ita ? r.craft.作る(ita.r.id, P[0], P[2], 1) : {ok:false,訳:"板の作りかたが無い"};
    const bench = 一覧.find(x=>x.r.出==="b_chest");
    const res2 = bench ? r.craft.作る(bench.r.id, P[0], P[2], 1) : null;
    return { 全:一覧.length, 作れる:一覧.filter(x=>x.作れる).length, 板:res, 台がいる:res2 };
  });
  見(作.全 > 200, "★ 作りかたが たくさん ある", 作.全);
  見(作.板 && 作.板.ok, "★★ **手で 作れる**（板）", 作.板);
  見(作.台がいる && !作.台がいる.ok && /作業台/.test(作.台がいる.訳 || ""),
    "★★ **場所が いる ものは 断る**（理由つき）", 作.台がいる && 作.台がいる.訳);

  節("⑤ 建てる");
  const 建 = await pg.evaluate(()=>{
    const r=window.__rpg, P=r.player.pos;
    r.inv.slots = new Array(r.inv.n).fill(null);
    r.inv.add("b_fire", 2); r.inv.add("b_bench", 2); r.inv.add("ishi", 20);
    r.置くもの = "b_fire"; r.建てるか = true; r._置く(P);
    const 数1 = r.build.数();
    r.置くもの = "b_bench"; r._置く(P);
    const 場 = r.craft.場(P[0], P[2]);
    const 近 = r.build.近くの(P[0], P[2], 6);
    const 壊 = 近 ? r.build.壊す(近.x, 近.y, 近.z) : null;
    return { 数1, 数2:r.build.数(), 場, 壊:!!(壊&&壊.ok) };
  });
  見(建.数1 >= 1, "★★ **建てられる**", 建.数1);
  見(建.場 && (建.場.火 || 建.場.台), "★★ **建てた ものが 作る 場所に なる**", 建.場);
  見(建.壊, "★ こわせる（材料は もどる）", 建.壊);

  節("⑤-b はたけ と たからばこ");
  const 設 = await pg.evaluate(async ()=>{
    const r=window.__rpg, P=r.player.pos;
    r.inv.slots = new Array(r.inv.n).fill(null);
    r.inv.add("b_farm",1); r.inv.add("b_chest",1); r.inv.add("s_kusa",2); r.inv.add("ishi",9);
    r.置くもの="b_farm"; r.建てるか=true; r._置く(P);
    const 畑 = r.build.近くの(P[0],P[2],6);
    const now = Date.now();
    const 蒔 = r.build.蒔く(畑, "s_kusa", now);
    const 早 = r.build.採る(畑, now);
    const 育 = r.build.育ち(畑, now + 60000);
    const 実 = r.build.採る(畑, now + 60000);
    /* たからばこ */
    r.置くもの="b_chest"; r._置く({0:P[0]+4, 1:P[1], 2:P[2]+4, length:3});
    let 箱 = null;
    for (const m of r.build.区.values()) for (const o of m.values()) if (o.箱) 箱 = o;
    const 入 = 箱 ? r.build.箱に入れる(箱, "ishi", 5) : null;
    const 出 = 箱 ? r.build.箱から出す(箱, "ishi", 2) : null;
    return { 畑あり:!!畑&&!!畑.畑, 蒔, 早, 育:+育.toFixed(2), 実, 箱あり:!!箱, 入, 出, 石:r.inv.count("ishi") };
  });
  見(設.畑あり && 設.蒔.ok, "★★ **はたけに たねを まける**", 設.蒔);
  見(!設.早.ok, "★ 育つ 前は 採れない（理由つき）", 設.早.訳);
  見(設.実.ok, "★★ **育つと とりいれられる**", 設.実);
  見(設.箱あり && 設.入 && 設.入.ok, "★★ **たからばこに しまえる**", 設.入);
  見(設.出 && 設.出.ok, "★ 取り出せる", {出:設.出, 石:設.石});

  節("⑥ 敵と 戦う");
  const 戦 = await pg.evaluate(async ()=>{
    const r=window.__rpg, P=r.player.pos;
    r.inv.add("tetsu_sword",1); r.inv.wear("tetsu_sword");
    const M = await import("/assets/vocabu-survive/rpg/data/enemies.js");
    const C = await import("/assets/vocabu-survive/rpg/sys/combat.js");
    const en = new C.Enemy(M.ENEMIES.slime_green, P[0]+1.2, P[1], P[2]+0.6);
    r.combat.list.push(en);
    const hp0 = en.hp;
    let 回 = 0;
    for (let i=0;i<80 && !en.dead;i++){
      const st = r.inv.status();
      const t = r.combat.近くの(P[0],P[2], st.間+1.5);
      if (t) { r.combat.攻める(t, st.攻, false); 回++; }
      await new Promise(res=>setTimeout(res,16));
    }
    return { hp0, 残:en.hp, 倒:en.dead, 回, 経:r.combat.exp };
  });
  見(戦.残 < 戦.hp0, "★★ **敵に 当たる**", 戦);
  見(戦.倒, "★★ **倒せる**", {回:戦.回});
  見(戦.経 > 0, "★ 経験が 入る", 戦.経);

  節("⑥-b 町・話す・たのみごと");
  const 町 = await pg.evaluate(async ()=>{
    const r=window.__rpg;
    const tw = r.town.近くの(r.player.pos[0], r.player.pos[2]);
    if (!tw) return { 町なし:true };
    r.player.pos[0]=tw.人[0].x+1.2; r.player.pos[2]=tw.人[0].z+1.2;
    r.player.pos[1]=r.terr.height(r.player.pos[0], r.player.pos[2])+1;
    r.cam.snap(r.player.pos, 0);
    await new Promise(res=>setTimeout(res,900));
    const 人 = r.近くの人;
    const E = r.errand;
    const 出 = 人 ? E.出す(tw, 人, 3) : [];
    const 受 = 出.length ? E.受ける(出[0]) : null;
    /* そろえて 渡す */
    let 渡 = null;
    if (出.length && 出[0].型 === "集") { r.inv.add(出[0].何, 出[0].数); 渡 = E.渡す(出[0].id); }
    return { 名:tw.名, 人数:tw.人.length, 近い人: 人? 人.名:"", 品: 人? 人.品.length:0,
             出:出.length, 受, 渡, 金:r.inv.count("kin_ka"),
             敵: r.combat.list.length,
             /* 「町の 中は 安全」は **町の 円の 中**の 数で 見る。
                世界ぜんぶの 数で 見ると、遠くに 湧いた 1 匹で 落ちる（実測）。 */
             町内: r.combat.list.filter(e=>Math.hypot(e.pos[0]-tw.x, e.pos[2]-tw.z) < tw.半径).length };
  });
  見(!町.町なし, "★ 町が ある", 町.名);
  見(町.人数 >= 3, "★ 人が いる", 町.人数);
  見(!!町.近い人, "★★ **近づくと 話しかけられる**", 町.近い人);
  見(町.出 === 3, "★ たのみごとが 出る", 町.出);
  見(町.受 && 町.受.ok, "★★ **たのみを 受けられる**", 町.受);
  見(!町.渡 || 町.渡.ok, "★★ **果たすと 礼が もらえる**", {渡:町.渡, 金:町.金});
  見(町.町内 === 0, "★ 町の 中は 敵が いない（安全）", {町内:町.町内, 世界:町.敵});

  節("⑥-c 地図");
  const 図 = await pg.evaluate(()=>{
    const r=window.__rpg;
    const m = r.hud.map;
    if (!m) return { 無い:true };
    const c = m.cv.getContext("2d");
    const d = c.getImageData(0,0,m.cv.width,m.cv.height).data;
    let 色 = new Set(), 透 = 0;
    for (let i=0;i<d.length;i+=4*37){ if(d[i+3]<10){透++;continue;} 色.add(d[i]+","+d[i+1]+","+d[i+2]); }
    return { 大きさ:[m.cv.width,m.cv.height], 色数:色.size, 透明:透 };
  });
  見(!図.無い, "★ 地図が ある", 図.大きさ);
  見(図.色数 > 6, "★★ **地形が 描かれて いる**（1 色の 板では ない）", 図.色数);

  節("⑥-d 物語の 主（ボス）が 出る");
  /* 直す前: 主は **どこにも 湧かず**、第二章で 物語が 止まっていた。 */
  const 主 = await pg.evaluate(async ()=>{
    const r=window.__rpg;
    const S = await import("/assets/vocabu-survive/rpg/data/story.js");
    const i = S.全節.findIndex(x=>x.やる.型==="倒" && x.やる.誰==="boss_mori");
    r.quest.i = i; r.quest.終わった = false;
    r.combat.list.length = 0;
    r._主待 = 0; r._主を見る(0.1, "meadow", r.player.pos);
    const 森でない = r.combat.list.length;
    r._主待 = 0; r._主を見る(0.1, "forest", r.player.pos);
    const 出た = r.combat.list.filter(e=>e.def.名==="森を喰う者");
    r._主待 = 0; r._主を見る(0.1, "forest", r.player.pos);
    const 二度 = r.combat.list.filter(e=>e.def.名==="森を喰う者").length;
    let 倒 = null, 節後 = -1;
    if (出た[0]) {
      出た[0].hp = 1;
      倒 = r.combat.攻める(出た[0], 999, false);
      節後 = r.quest.i;
    }
    return { 森でない, 出た:出た.length, 二度, 倒:!!(倒&&倒.倒), 節前:i, 節後, 済み:Array.from(r.combat.倒した主) };
  });
  見(主.森でない === 0, "★ ちがう 土地では 出さない", 主.森でない);
  見(主.出た === 1, "★★ **その 土地に 入ると 主が 現れる**", 主.出た);
  見(主.二度 === 1, "★ 2 体に ならない", 主.二度);
  見(主.倒, "★ 倒せる", 主.倒);
  見(主.節後 > 主.節前, "★★ **倒すと 物語が 進む**", {前:主.節前, 後:主.節後});
  見(主.済み.indexOf("boss_mori") >= 0, "★ 一度 倒した 主は 覚える（もう 出ない）", 主.済み);

  節("⑥-e 手ごたえ（振りかぶり・武器・押し返し）");
  const 手 = await pg.evaluate(async ()=>{
    const r=window.__rpg, P=r.player.pos;
    const M = await import("/assets/vocabu-survive/rpg/data/enemies.js");
    const C = await import("/assets/vocabu-survive/rpg/sys/combat.js");
    r.combat.list.length = 0;
    /* 振りかぶり: 近くに 居ると 溜めて から 当たる */
    let 当 = 0;
    r.combat.onHitPlayer = () => 当++;
    const e = new C.Enemy(M.ENEMIES.slime_green, P[0], P[1], P[2] + 1.0);
    r.combat.list.push(e);
    for (let i=0;i<50;i++) r.combat.update(1/30, r.chunks, r.player, Date.now());
    const 近 = 当;
    /* 逃げると 当たらない */
    当 = 0; r.combat.list.length = 0;
    const e2 = new C.Enemy(M.ENEMIES.slime_green, P[0], P[1], P[2] + 1.0);
    r.combat.list.push(e2);
    for (let i=0;i<50;i++){ if(i===4){ e2.pos[2] = P[2] + 12; } r.combat.update(1/30, r.chunks, r.player, Date.now()); }
    const 逃 = 当;
    /* 押し返し */
    r.combat.list.length = 0;
    const e3 = new C.Enemy(M.ENEMIES.slime_green, P[0], P[1], P[2] + 1.4);
    r.combat.list.push(e3);
    const z0 = e3.pos[2];
    r.combat.攻める(e3, 8, false);
    /* 武器が 手に 出る */
    r.inv.add("tetsu_sword",1); r.inv.wear("tetsu_sword");
    const 形 = r.renderer.hasMesh("w_sword") && r.renderer.hasMesh("w_bow") && r.renderer.hasMesh("w_pick");
    return { 近, 逃, 押: Math.abs(e3.pos[2]-z0) > 0.1, 形 };
  });
  見(手.近 > 0, "★★ **近づかれると 当たる**", 手.近 + "回");
  見(手.逃 === 0, "★★ **振りかぶり中に 離れれば 当たらない**（避けられる）", 手.逃 + "回");
  見(手.押, "★ 打つと 相手が 下がる（手ごたえ）", 手.押);
  見(手.形, "★★ **武器・道具の 形が ある**（手に 出せる）", 手.形);

  節("⑦ しまう・戻す");
  const 保 = await pg.evaluate(async ()=>{
    const r=window.__rpg;
    r.inv.slots = new Array(r.inv.n).fill(null);
    r.inv.add("shinju", 7);
    await r._しまう();
    const S = await import("/assets/vocabu-survive/rpg/sys/save.js");
    const j = await S.load(r.seed);
    return { 有:!!j, 真珠: j ? (j.inv.slots.filter(s=>s&&s.id==="shinju").reduce((a,s)=>a+s.数,0)) : 0,
             建: j ? Object.keys(j.build||{}).length : 0, 節: j? j.quest.i : -1 };
  });
  見(保.有, "★★ **しまえる**", 保);
  見(保.真珠 >= 7, "★ 持ちものが しまわれて いる", 保.真珠);

  節("⑧ ほらあな（2026-09-02）");
  const 洞 = await pg.evaluate(async ()=>{
    const r=window.__rpg;
    let c=null;
    for (let d=60; d<4000 && !c; d+=60) for (let a=0;a<10 && !c;a++){
      const x=Math.cos(a/10*6.28)*d, z=Math.sin(a/10*6.28)*d;
      const k=r.caves.近くの(x,z); if(k&&k.dist<60) c=k;
    }
    if(!c) return {err:"入口なし"};
    r.player.pos[0]=c.x; r.player.pos[2]=c.z; r.player.pos[1]=r.terr.height(c.x,c.z)+1;
    const 外高 = r.terr.height(c.x, c.z);
    r.近くの入口=c;
    const 入=r.潜る();
    const 中=r.洞窟;
    const 床 = r.terr.height(r.player.pos[0], r.player.pos[2]);
    const 壁 = r.terr.height(c.x + 400, c.z + 400);   /* 部屋の 外＝壁 */
    /* 奥へ */
    const 奥=中.部屋[中.部屋.length-1];
    r.player.pos[0]=c.x+奥.x; r.player.pos[2]=c.z+奥.z; r.player.pos[1]=c.y+奥.y+1;
    await new Promise(s=>setTimeout(s,2200));
    const 奥で = { 番人:中.番人, 出した:中.番人を出した, 宝:中.宝.開けた,
      敵:r.combat.list.length, 夜:r.combat.夜, 洞に湧く:!!r.combat.洞 };
    const 出=r.出る();
    return { 入, 名:中.名, 部屋:中.部屋.length, 実り:中.資源.length,
      床, 壁, 外高, 宝中身:中.宝.中身.length, 奥で, 出,
      戻り高:r.terr.height(c.x,c.z), 洞:!!r.洞窟, 敵後:r.combat.list.length };
  });
  見(洞.入 === true, "★★ **ほらあなに 潜れる**", {名:洞.名, 部屋:洞.部屋, 実り:洞.実り});
  見(洞.床 < 洞.外高 - 3, "★ 中は 外より 下に ある", {床:洞.床, 外:洞.外高});
  見(洞.壁 > 洞.床 + 1, "★ 部屋の 外は 壁（通れない）", {壁:洞.壁, 床:洞.床});
  見(洞.奥で && 洞.奥で.洞に湧く === true, "★ 中では **洞窟の 敵**が 湧く", 洞.奥で);
  見(洞.奥で && 洞.奥で.夜 === 1, "★ 中は いつでも 夜と 同じ 強さ", 洞.奥で && 洞.奥で.夜);
  見(洞.宝中身 >= 3, "★★ **奥に 宝が ある**", 洞.宝中身);
  見(洞.奥で && (洞.奥で.番人 ? 洞.奥で.出した === true : 洞.奥で.宝 === true),
     "★ 番人が いれば 出る／いなければ 宝が 開く", 洞.奥で);
  見(洞.出 === true && 洞.洞 === false, "★★ **外へ 戻れる**", {出:洞.出, 中:洞.洞});
  見(Math.abs(洞.戻り高 - 洞.外高) < 0.001, "★ 出ると 高さの すり替えが 戻る", {戻:洞.戻り高, 外:洞.外高});
  見(洞.敵後 === 0, "★ 出たら 洞窟の 敵は 消える", 洞.敵後);

  節("⑨ 木と 岩に ぶつかる（2026-09-02）");
  const 当 = await pg.evaluate(async ()=>{
    const r=window.__rpg;
    r.出る && r.洞窟 && r.出る();
    /* 木を 1 本 探して、その 中心へ 向かって 歩く */
    let t=null;
    for (const c of r.chunks.live.values()) if (c.props && c.props.木.length) { t=c.props.木[0]; break; }
    if(!t) return {err:"木なし"};
    const 置く=(x,z)=>{ r.player.pos[0]=x; r.player.pos[2]=z;
      r.player.pos[1]=r.terr.height(x,z); r.player.vel[0]=r.player.vel[1]=r.player.vel[2]=0;
      r.player.grounded=true; };
    /* まっすぐ 木へ 向かって 歩く（−x 方向）*/
    置く(t[0]+3.2, t[2]);
    const 始=r.player.pos[0];
    for(let i=0;i<90;i++) r.player.update(1/60,{x:-1,y:0},0,false,false);
    const d = Math.hypot(r.player.pos[0]-t[0], r.player.pos[2]-t[2]);
    const 木へ進 = 始 - r.player.pos[0];
    /* 何も 無い ところでは ちゃんと 進む（止まりっぱなしで 通る 検査に しない） */
    置く(t[0]+300, t[2]+300);
    const 前x=r.player.pos[0], 前z=r.player.pos[2];
    for(let i=0;i<90;i++) r.player.update(1/60,{x:-1,y:0},0,false,false);
    return { 木まで:+d.toFixed(2), 木へ進:+木へ進.toFixed(2),
             進んだ:+Math.hypot(r.player.pos[0]-前x, r.player.pos[2]-前z).toFixed(2),
             固い:!!r.player.固い };
  });
  見(当.固い === true, "★ 押し出しが つながって いる", 当.固い);
  見(当.木まで > 0.5 && 当.木まで < 3.2, "★★ **木に 近づけるが すり抜けない**",
     {木まで:当.木まで+"m", 進んだ:当.木へ進+"m"});
  見(当.進んだ > 2, "★ 何も 無い ところでは 進む", 当.進んだ + "m");

  節("⑩ 材質と 面の 向き（2026-09-02）");
  const 材 = await pg.evaluate(async ()=>{
    const M = await import("/assets/vocabu-survive/engine/mesh.js");
    const 見る=(m)=>{ let ag=0,ds=0; const P=m.position,N=m.normal;
      for(let k=0;k<m.index.length;k+=3){const A=m.index[k]*3,B=m.index[k+1]*3,C=m.index[k+2]*3;
        const ax=P[B]-P[A],ay=P[B+1]-P[A+1],az=P[B+2]-P[A+2];
        const bx=P[C]-P[A],by=P[C+1]-P[A+1],bz=P[C+2]-P[A+2];
        const nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx;
        if(Math.hypot(nx,ny,nz)<1e-12) continue;
        const d=nx*(N[A]+N[B]+N[C])+ny*(N[A+1]+N[B+1]+N[C+1])+nz*(N[A+2]+N[B+2]+N[C+2]);
        if(d>0)ag++;else ds++;}
      return ds; };
    const 逆 = {
      roundedBox: 見る(M.roundedBox(2,0.18,1,1,1)), box: 見る(M.box(1,1,1)),
      sphere: 見る(M.sphere(10,8,0.5)), cylinder: 見る(M.cylinder(10,0.5,0.5,1,true)),
      capsule: 見る(M.capsule(10,5,0.4,0.5)), torus: 見る(M.torus(12,8,0.5,0.15)),
      plane: 見る(M.plane(2,2,1,1)), frame: 見る(M.frame(4,3,0.35,0.35))
    };
    const R = window.__rpg.renderer;
    return { 逆, 材質あり: typeof R.material === "function", 数: R._mats ? R._mats.size : 0 };
  });
  const 逆計 = Object.values(材.逆).reduce((a,b)=>a+b,0);
  見(逆計 === 0, "★★ **面の 向きが ぜんぶ そろって いる**（裏返り 0）", 材.逆);
  見(材.材質あり === true, "★ 材質の 口が ある", 材.材質あり);
  見(材.数 > 30, "★ 形ごとの 材質が 入って いる", 材.数 + " 種");

  節("⑪ 設計図で 建物ごと 建てる（2026-09-02）");
  const 図面 = await pg.evaluate(async ()=>{
    const r=window.__rpg;
    const BP = await import("/assets/vocabu-survive/rpg/data/blueprints.js");
    r.洞窟 && r.出る();
    /* 何も 持って いない ところから */
    r.inv.slots = new Array(r.inv.n).fill(null);
    r.build.区.clear();
    const bp = BP.BP.house;
    const 空 = r.設計図を建てる(bp);
    const 持前 = r.inv.slots.filter(Boolean).length;
    /* そろえて もう一度 */
    const 見 = r.build.設計図を見る(bp);
    for (const t in 見.要) r.inv.add("b_ki_" + t, 見.要[t]);
    const 要計 = Object.values(見.要).reduce((a,b)=>a+b,0);
    r.combat.exp = 4000; r.combat.lv = 8;
    const P = r.player.pos.slice();
    const yaw = r.cam.yaw;
    const 建 = r.設計図を建てる(bp);
    /* 建った ところは カメラの **前**か（−sin,−cos の 側）*/
    let sx=0,sz=0,n=0;
    for (const m of r.build.区.values()) for (const o of m.values()){ sx+=o.x; sz+=o.z; n++; }
    const cx=sx/Math.max(1,n), cz=sz/Math.max(1,n);
    const 前x = -Math.sin(yaw), 前z = -Math.cos(yaw);
    const 内 = (cx-P[0])*前x + (cz-P[2])*前z;      /* 正なら 前 */
    const 余 = r.inv.slots.filter(s=>s && String(s.id).startsWith("b_")).reduce((a,s)=>a+s.数,0);
    return { 図数: BP.BLUEPRINTS.length, 空, 持前, 要計, 建, 個: n, 内:+内.toFixed(1), 余 };
  });
  見(図面.図数 >= 20, "★ 設計図が 20 種 以上 ある", 図面.図数 + " 種");
  見(図面.空 && 図面.空.ok === false, "★★ **材料が 足りない ときは 建たない**", 図面.空 && 図面.空.訳);
  見(図面.持前 === 0, "★ 建たなかった ときは 材料を 使わない", 図面.持前);
  見(図面.建 && 図面.建.ok === true, "★★ **設計図で 建物ごと 建つ**", 図面.建);
  見(図面.建 && 図面.建.数 === 図面.要計 && 図面.個 === 図面.要計,
     "★ 要る 数と 建った 数が 合う", {要:図面.要計, 建:図面.建 && 図面.建.数, 実:図面.個});
  見(図面.余 === 0, "★ 材料が 余らない（数え違いが ない）", 図面.余);
  見(図面.内 > 0, "★★ **見ている 先に 建つ**（後ろでは ない）", 図面.内 + "m");

  節("⑫ 倒れても 落ちない（2026-09-02・ソークで 見つけた）");
  /* 直す前: 敵を 巡回して いる 途中で 倒れると combat.list を 空に するので、
     `this.list[i]` が undefined に なり **tick ごと 落ちて いた**。
     死ぬ たびに 起きる ので、遊びに ならない。
     ★ この 検査は **手当てを 外すと 必ず 落ちる**ことを 同時に 見る。
       落ちない 検査は「通った」のか「そもそも 起きて いない」のか
       分からない（実際 1 度 空振りした）。 */
  const 倒 = await pg.evaluate(async ()=>{
    const r=window.__rpg;
    const C = await import("/assets/vocabu-survive/rpg/sys/combat.js");
    const E = await import("/assets/vocabu-survive/rpg/data/enemies.js");
    const id = E.ENEMY_IDS.find(i=>!E.ENEMIES[i].主);
    const 作 = () => {
      const c = new C.Combat({ terrain: r.terr, seed: 1, settings: {}, inventory: r.inv });
      /* 打たれた ら **並びを 空に する**（＝倒れた ときと 同じ こと） */
      c.onHitPlayer = () => { c.list.length = 0; };
      for (let i=0;i<6;i++) {
        const e = new C.Enemy(E.ENEMIES[id], r.player.pos[0]+0.2*i, r.player.pos[1], r.player.pos[2]+0.2);
        e.state = "attack"; e.cool = 0;
        c.list.push(e);
      }
      c.湧き = 999;   /* 湧かせない */
      return c;
    };
    const 回す = (c) => {
      let 落 = 0;
      for (let k=0;k<80;k++) {
        try { c.update(1/30, r.chunks, r.player, Date.now()); } catch (e) { 落++; }
      }
      return 落;
    };
    /* ① いまの コード */
    const 今 = 回す(作());
    /* ② 手当てを 外した ものを 真似る（`if (!e) break;` を 取り除く）*/
    const c2 = 作();
    let 旧 = 0;
    const P = r.player.pos;
    for (let k=0;k<80;k++) {
      try {
        /* update の 中身を そのまま 手で 回す（guard 無し）*/
        for (let i = c2.list.length - 1; i >= 0; i--) {
          const e = c2.list[i];
          if (e.dead) continue;
          const dx = e.pos[0]-P[0], dz = e.pos[2]-P[2];
          c2._think(e, 1/30, r.player, Math.hypot(dx,dz), dx, dz, Date.now());
        }
      } catch (e) { 旧++; }
      if (!c2.list.length) { const c3 = 作(); c2.list = c3.list; c2.onHitPlayer = c3.onHitPlayer; }
    }
    return { 今, 旧 };
  });
  見(倒.旧 > 0, "★ 手当てを 外すと 落ちる（検査が 効いて いる）", 倒.旧 + " 回");
  見(倒.今 === 0, "★★ **倒れても 落ちない**（例外 0）", 倒);

  節("⑬ 町へ 帰る と 会話が 消えない（2026-09-02）");
  const 旅 = await pg.evaluate(async ()=>{
    const r=window.__rpg;
    r.洞窟 && r.出る();
    r.inv.add("kin_ka", 80);
    /* 3 つの 町を 踏む */
    for (let d=0; d<3000 && r.行った町.size<3; d+=120) for (let a=0;a<8 && r.行った町.size<3;a++){
      const x=Math.cos(a/8*6.283)*d, z=Math.sin(a/8*6.283)*d;
      const t=r.terr.nearestTown(x,z);
      if(!t || r.行った町.has(t.id)) continue;
      r.player.pos[0]=t.x; r.player.pos[2]=t.z; r.player.pos[1]=r.terr.height(t.x,t.z)+1;
      await new Promise(s=>setTimeout(s,600));
    }
    /* 案内人の 前へ */
    const T = r.town.中身(r.terr.nearestTown(r.player.pos[0], r.player.pos[2]));
    const g = T.人.find(p=>p.役==="guide");
    if (g) { r.player.pos[0]=g.x+1; r.player.pos[2]=g.z+1; r.player.pos[1]=r.terr.height(g.x+1,g.z+1)+1; }
    await new Promise(s=>setTimeout(s,900));
    if (!r.近くの人) return { err:"案内人が いない" };
    r.hud.話す();
    await new Promise(s=>setTimeout(s,120));
    const 行1 = r.hud.paneEl.querySelectorAll(".rh-rec").length;
    /* ★ 拾った ときに 会話が 消えないか（直す前は ここで 空に なった）*/
    r.inv.add("kusa", 1);
    r.hud.描く窓();
    const 行2 = r.hud.paneEl.querySelectorAll(".rh-rec").length;
    const 字 = r.hud.paneEl.textContent.length;
    /* 実際に 帰る */
    const 他 = Array.from(r.行った町.values()).filter(t=>!r.いる町||t.id!==r.いる町.id);
    const 前 = r.player.pos.slice(), 金前 = r.inv.count("kin_ka");
    const res = 他.length ? r.町へ帰る(他[0]) : null;
    const 動 = 他.length ? Math.hypot(r.player.pos[0]-他[0].x, r.player.pos[2]-他[0].z) : 999;
    return { 町数:r.行った町.size, 行1, 行2, 字, res, 金前, 金後:r.inv.count("kin_ka"), 動:+動.toFixed(1) };
  });
  見(旅.町数 >= 2, "★ 行った 町を 覚えて いる", 旅.町数 + " 町");
  見(旅.行1 > 0, "★★ **案内人が 行き先を 出す**", 旅.行1 + " 行");
  見(旅.行2 === 旅.行1 && 旅.字 > 40, "★★ **拾っても 会話が 消えない**", {前:旅.行1, 後:旅.行2, 字:旅.字});
  見(旅.res && 旅.res.ok === true, "★★ **町へ 帰れる**", 旅.res);
  見(旅.動 < 3, "★ 着いた 先が その 町", 旅.動 + "m");
  見(旅.金後 === 旅.金前 - (旅.res ? 旅.res.金 : 0), "★ 運賃を 払う", {前:旅.金前, 後:旅.金後});

  節("⑭ つり（2026-09-02）");
  const 釣 = await pg.evaluate(async ()=>{
    const r=window.__rpg;
    r.洞窟 && r.出る();
    r.inv.slots = new Array(r.inv.n).fill(null);
    r.inv.add("tetsu_rod",1); r.inv.wear("tetsu_rod");
    let 場=null;
    for(let d=60; d<5000 && !場; d+=40) for(let a=0;a<24 && !場;a++){
      const x=Math.cos(a/24*6.283)*d, z=Math.sin(a/24*6.283)*d;
      const t=r.terr.at(x,z); if(t.water) continue;
      for(let k=0;k<8;k++){ const bb=k/8*6.283;
        if(r.terr.at(x+Math.cos(bb)*3.0, z+Math.sin(bb)*3.0).water){ 場={x,z,biome:t.biome}; break; } }
    }
    if(!場) return {err:"水べなし"};
    r.player.pos[0]=場.x; r.player.pos[2]=場.z; r.player.pos[1]=r.terr.height(場.x,場.z)+0.4;
    r.建てるか = false; r.置くもの = "";
    await new Promise(s=>setTimeout(s,900));
    /* ★ 敵が そばに いると 「叩く」が 先に なる（そう 作って ある）。
       つりの 検査では 敵を どける。 */
    r.combat.list.length = 0; r.combat.上限 = 0;
    await new Promise(s=>setTimeout(s,240));
    const 水 = r.水べ, 効 = r.竿の効き, 敵 = r.狙い敵 ? r.狙い敵.def.名 : "";
    /* ★ 竿が 無い ときは つれない（外して 見る）*/
    r.inv.unwear("tool");
    await new Promise(s=>setTimeout(s,260));
    const 竿なし = r.竿の効き;
    r.inv.wear("tetsu_rod");
    await new Promise(s=>setTimeout(s,260));
    /* 早すぎる 合わせは 逃げる */
    r._tapAct = true; await new Promise(s=>setTimeout(s,90));
    const 投げた = !!r.fish.状;
    const 早 = r.fish.あげる();
    /* ちゃんと つる */
    const 取 = {};
    for (let i=0;i<12;i++){
      r._tapAct = true; await new Promise(s=>setTimeout(s,60));
      let n=0;
      while (r.fish.状 && r.fish.状.段 !== "かかった" && n++ < 400) await new Promise(s=>setTimeout(s,16));
      if (!r.fish.状) continue;
      r._tapAct = true; await new Promise(s=>setTimeout(s,120));
    }
    for (const s of r.inv.slots) if (s && s.id !== "tetsu_rod") 取[s.id]=(取[s.id]||0)+s.数;
    /* 水から 離れると 糸が 切れる */
    r._tapAct = true; await new Promise(s=>setTimeout(s,80));
    r.player.pos[0] = 場.x + 300; r.player.pos[2] = 場.z + 300;
    await new Promise(s=>setTimeout(s,500));
    return { 場, 水, 効, 竿なし, 投げた, 早: 早.ok, 敵, 取,
             数: Object.values(取).reduce((a,b)=>a+b,0), 離れて: !!r.fish.状 };
  });
  見(!釣.err && 釣.水, "★ 水べが 分かる", {風:釣.水, 場:釣.場});
  見(釣.効 > 0 && 釣.竿なし === 0, "★ 竿を 持って いる ときだけ つれる", {あり:釣.効, なし:釣.竿なし});
  見(釣.投げた === true, "★ 押すと 糸を 投げる", {投:釣.投げた, 敵:釣.敵});
  見(釣.早 === false, "★ 早すぎる 合わせは 逃げられる", 釣.早);
  見(釣.数 >= 6, "★★ **12 回で 6 個 以上 つれる**", {数:釣.数, 取:釣.取});
  見(釣.離れて === false, "★ 水から 離れると 糸を 上げる", 釣.離れて);

  節("⑮ たき火で 休む・持ちものを 捨てる（2026-09-02）");
  const 休 = await pg.evaluate(async ()=>{
    const r=window.__rpg;
    r.洞窟 && r.出る();
    r.combat.上限 = 24;
    r.time = 22.5;
    r.inv.add("b_fire",1); r.inv.add("pan",3);
    r.player.hp = 30;
    r.建てるか = true; r.置くもの = "b_fire";
    r._tapAct = true;
    await new Promise(s=>setTimeout(s,500));
    r.建てるか = false;
    await new Promise(s=>setTimeout(s,800));
    const 設 = r.近くの設備 ? r.近くの設備.id : "";
    /* 敵が いると 休めない */
    const C = await import("/assets/vocabu-survive/rpg/sys/combat.js");
    const E = await import("/assets/vocabu-survive/rpg/data/enemies.js");
    const id = E.ENEMY_IDS.find(i=>!E.ENEMIES[i].主);
    r.combat.list.length = 0;
    r.combat.list.push(new C.Enemy(E.ENEMIES[id], r.player.pos[0]+6, r.player.pos[1], r.player.pos[2]));
    const 敵あり = r.休む();
    r.combat.list.length = 0;
    const 前hp = r.player.hp, 前パン = r.inv.count("pan");
    const res = r.休む();
    const 後hp = r.player.hp, 後時 = r.time;
    r.inv.remove("pan", r.inv.count("pan"));
    r.time = 23;
    const 食なし = r.休む();
    /* 捨てる */
    r.inv.add("kusa", 9);
    const 前草 = r.inv.count("kusa");
    r.hud.開く("inv"); r.hud._捨て = true; r.hud.描く窓();
    const 印 = r.hud.paneEl.querySelectorAll(".rh-it.is-drop").length;
    const 札 = [...r.hud.paneEl.querySelectorAll(".rh-it")].find(b=>/やわらかい草/.test(b.textContent));
    if (札) 札.click();
    const 後草 = r.inv.count("kusa");
    r.hud._捨て = false; r.hud.開く("");
    return { 設, 敵あり:敵あり.ok, 訳:敵あり.訳, res, 前hp, 後hp, 後時,
             パン:{前:前パン, 後:r.inv.count("pan")}, 食なし:食なし.ok, 印, 前草, 後草 };
  });
  見(休.設 === "b_fire", "★ たき火が 「使える もの」に なる", 休.設);
  見(休.敵あり === false, "★ 敵が 近いと 休めない", 休.訳);
  見(休.res && 休.res.ok === true, "★★ **たき火で 朝まで 休める**", 休.res);
  見(休.後hp === 100 && 休.前hp === 30, "★ 体力が ぜんぶ 戻る", {前:休.前hp, 後:休.後hp});
  見(休.後時 === 6, "★ 時刻が 朝に なる", 休.後時 + " 時");
  見(休.食なし === false, "★ 食べものが 無いと 休めない", 休.食なし);
  見(休.印 > 0, "★ 「すてる」を 押すと 印が つく", 休.印 + " 個");
  見(休.後草 === 休.前草 - 1, "★★ **押した ものを 1 つ 捨てる**", {前:休.前草, 後:休.後草});

  節("⑯ ずかん（2026-09-02）");
  const ずか = await pg.evaluate(async ()=>{
    const r=window.__rpg;
    r.洞窟 && r.出る();
    const t0 = performance.now();
    for (const id of ["ki","ishi","kusa","sakana","tetsu_sword","gin_helm","pan","b_ki_wall","kin_ka","book_kotoba"]) r.inv.add(id,1);
    await new Promise(s=>setTimeout(s,300));
    r.倒した種.add("slime_midori");
    r.hud.開く("quest"); r.hud._図 = true;
    const t1 = performance.now();
    r.hud.描く窓();
    const 描 = performance.now() - t1;
    const 枠 = r.hud.paneEl.querySelectorAll(".rh-it").length;
    const 未 = r.hud.paneEl.querySelectorAll(".rh-it.is-un").length;
    const 字 = r.hud.paneEl.textContent;
    /* しまって 戻して 残るか */
    await r._しまう();
    const S = await import("/assets/vocabu-survive/rpg/sys/save.js");
    const j = await S.load(r.seed);
    r.hud._図 = false; r.hud.開く("");
    return { 見: r.見つけた.size, 倒: r.倒した種.size, 枠, 未, 描: Math.round(描),
             しまった: j ? (j.見つけた||[]).length : -1, 倒保存: j ? (j.倒した種||[]).length : -1,
             数字: /見つけた もの \d+ \/ 357/.test(字) };
  });
  見(ずか.見 >= 10, "★★ **手に した ものが ずかんに 残る**", ずか.見 + " 種");
  見(ずか.数字 === true, "★ 全体の 数が 出る（357）", ずか.数字);
  見(ずか.未 > 300, "★ まだ 見て いない ものは 「？」", ずか.未 + " 個");
  見(ずか.描 < 400, "★ 開くのに 時間が かからない", ずか.描 + "ms");
  見(ずか.しまった >= 10 && ずか.倒保存 >= 1, "★ しまうと 残る", {もの:ずか.しまった, 相手:ずか.倒保存});

  節("⑰ 入り直しても 増えない（2026-09-02・実測で 見つけた 漏れ）");
  /* 直す前: exit() が ready を 下ろす だけ だった。
     入り直す たび 新しい ChunkManager が 静的バッチを 作り、
     前の 131 個（644KB）が GPU に 残った。7 回で 4.5MB。 */
  const 漏 = await pg.evaluate(async () => {
    const r = window.__rpg;
    r.洞窟 && r.出る();
    /* ★ 形の 数は **区画の 地面（ck…）を 除いて** 数える。
       地面は 区画ごとに 出し入れ するので、増減して 当たり前。
       見たいのは「木・岩・道具などの **決まった 形**が 作り直されて
       いないか」。混ぜて 数えて 一度 落ちた。 */
    const 測 = () => {
      let 決 = 0;
      for (const id of r.renderer.meshes.keys()) if (!/^ck\d+$/.test(id)) 決++;
      return { 束: r.renderer.batches.size, B: r.renderer.stats.batchBytes | 0, 形: 決, 全形: r.renderer.meshes.size };
    };
    const 記 = [測()];
    for (let i = 0; i < 3; i++) {
      await r.exit();
      await new Promise((s) => setTimeout(s, 400));
      await r.enter({});
      let n = 0; while (!r.ready && n++ < 400) await new Promise((s) => setTimeout(s, 50));
      await new Promise((s) => setTimeout(s, 1800));
      記.push(測());
    }
    return 記;
  });
  const 初 = 漏[0], 終 = 漏[漏.length - 1];
  見(終.束 <= 初.束 * 1.3, "★★ **入り直しても 置き場が 増えない**", { 初: 初.束, 終: 終.束 });
  見(終.B <= 初.B * 1.3 + 100000, "★ GL の バイト数も 増えない", { 初: 初.B, 終: 終.B });
  見(終.形 === 初.形, "★ 決まった 形は 作り直さない（入り直しが 遅く ならない）",
     { 初: 初.形, 終: 終.形, 全: [初.全形, 終.全形] });

  節("③ 速さ");
  const fps = await pg.evaluate(async ()=>{
    let n=0; const t0=performance.now();
    await new Promise(r=>{ const f=()=>{ n++; if(performance.now()-t0<3000) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); });
    return Math.round(n / ((performance.now()-t0)/1000));
  });
  console.log("  （この 台は SwiftShader＝ソフト描画。実機は もっと 速い）");
  見(fps > 4, "止まって いない", fps + "fps（ソフト描画）");

  const 目立つ = 例外.concat(con).filter(x=>!/ERR_CONNECTION_REFUSED|Failed to load resource/.test(x));
  見(目立つ.length===0, "例外・error 0 件", 目立つ.slice(0,3));
  await pg.screenshot({ path: (process.env.OUT||".") + "/rpg-1.png" });
  await b.close();
  console.log("\n"+"─".repeat(32)+"\n  ok "+ok+" / NG "+ng);
  if (ng) { console.log("  落ちた: "+落.join(" / ")); process.exit(1); }
})().catch(e=>{ console.error(e); process.exit(1); });
