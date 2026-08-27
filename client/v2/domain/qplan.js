/* ══════════════════════════════════════════════════════════════════════
   出題形式の配分と、AI 出力の取り込み（V3 §15 / §16）
   ・AI に丸投げすると、ほぼ全部 4 択になる（実測）。
     何をどれだけ作るかを **こちら側で決めて** から頼む。
   ・ただし、教材に合わない形式を無理に入れない。
     資料に画像が無ければ画像問題を頼まない、年代が出てこなければ年代順を頼まない。
   ・AI が知らない形式を返してきても落とさない。近い形式へ寄せるか、捨てる。
   ・資料限定のときは、根拠の無い問題を通さない。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var S = VQ2.schema, Q = VQ2.qtypes, M = VQ2.qmodel;
  if (!S || !Q || !M) throw new Error("VQ2.schema / qtypes / qmodel must be loaded before qplan.js");

  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function isObj(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function str(v) { return v === undefined || v === null ? "" : String(v); }
  /* 形式を変えた記録をつなぐ。2 段階で変えたときに、前の記録を消さない。 */
  function addNote(prev, next) {
    var a = str(prev).trim(), b = str(next).trim();
    return a && b ? a + " " + b : (a || b);
  }

  /* ══════════════════════════════════════════════════════════════════
     1) 配分の型
     ・重みは「10 問あたり何問か」で書く。合計は planMix が合わせる。
     ══════════════════════════════════════════════════════════════════ */
  var STYLES = [
    { id: "auto",         label: "完全自動",     desc: "教材の中身に合わせて、こちらで決めます。" },
    { id: "choice_heavy", label: "選択式多め",   desc: "選んで答える問題を中心にします。" },
    { id: "write_heavy",  label: "記述式多め",   desc: "自分の言葉で書く問題を増やします。" },
    { id: "memorize",     label: "暗記中心",     desc: "語句を覚えるための問題を中心にします。" },
    { id: "understand",   label: "理解中心",     desc: "順序・分類・読み取りなど、つながりを問います。" },
    { id: "exam",         label: "試験形式",     desc: "本番に近い配分にします。複合大問も入ります。" },
    { id: "game",         label: "ゲーム形式",   desc: "短時間で数をこなせる形式にします。" },
    { id: "manual",       label: "形式を指定",   desc: "使う形式を自分で選びます。" }
  ];

  /* 形式ごとの重み。ここが「4 択に寄る」のを防ぐ唯一の場所。 */
  var MIX = {
    auto: {
      multiple_choice_single: 3, word_input: 2, fill_blank: 1,
      ordering: 1, matching: 1, chart_read: 1, long_answer: 1, flashcard: 1
    },
    choice_heavy: {
      multiple_choice_single: 5, true_false: 2, multiple_choice_multiple: 1,
      fill_blank: 1, word_input: 1
    },
    write_heavy: {
      long_answer: 3, explain_reason: 2, summarize: 1, free_write_ai: 1,
      multiple_choice_single: 2, word_input: 1
    },
    memorize: {
      flashcard: 3, word_input: 3, multiple_choice_single: 2, matching: 1, fill_blank: 1
    },
    understand: {
      ordering: 2, classification: 2, chart_read: 2, multiple_choice_single: 2,
      long_answer: 1, matching: 1
    },
    exam: {
      multiple_choice_single: 3, fill_blank: 2, ordering: 1, matching: 1,
      long_answer: 1, composite: 1, numeric: 1
    },
    game: {
      multiple_choice_single: 4, choice_2: 2, true_false: 2, word_input: 1, flashcard: 1
    }
  };

  /* 科目ごとの上乗せ。教材の科目が分かっているときだけ効かせる。 */
  var SUBJECT_BOOST = {
    english: { spelling: 2, reorder_english: 1, audio_choice: 1, dictation: 1, english_writing: 1 },
    japanese: { kanji_input: 2, reading_input: 1, quote_evidence: 1, ordering: 1 },
    math: { numeric: 3, reorder_steps: 1, work_steps: 1, chart_read: 1 },
    science: { image_part: 1, reorder_experiment: 1, chart_read: 2, classification: 1 },
    social: { reorder_chronology: 2, matching_year_event: 1, map_pin: 1, chart_read: 1 },
    info: { code_input: 1, reorder_flow: 1, table_read: 1, classification: 1 }
  };

  /* その形式を出すのに教材へ何が要るか。無ければ頼まない（§16）。 */
  var NEEDS = {
    image_choice: "images", image_point: "images", map_pin: "images", image_part: "images",
    image_label: "images", coordinate_input: "images", spot_difference: "images",
    diagram_complete: "images", parts_place: "images", shape_judge: "images",
    photo_judge: "images", image_order: "images",
    /* 音声は「教材に音声がある」ではなく「**読み上げる原稿を書けるか**」で見る。
       読み上げ（ui/tts.js）が入ったので、AI は原稿を書けばよく、
       音声は解くときに用意される。鳴らす手立てが無い端末でだけ外す。 */
    audio_choice: "speech", dictation: "speech", audio_fill_blank: "speech",
    pronunciation_choice: "speech", dialog_response: "speech", audio_once: "speech", audio_speed: "speech",
    audio_order: "speech", matching_audio_text: "speech",
    chart_read: "figures", table_read: "tables", table_fill: "tables",
    reorder_chronology: "chronology", matching_year_event: "chronology",
    composite: "longText", source_analysis: "longText", summarize: "longText",
    quote_evidence: "longText", fill_blank_passage: "longText"
  };

  /* 読み上げができる端末か。Bridge か端末の読み上げのどちらかがあればよい。
     ui/tts.js が入っていない環境（紙・古い端末・テスト）では false。 */
  function canSpeak() {
    var T = VQ2.tts;
    if (!T || typeof T.canMakeAudio !== "function") return false;
    try { return !!T.canMakeAudio(); } catch (e) { return false; }
  }

  function hintOk(type, hints, sourceOnly, o) {
    var need = NEEDS[type];
    if (!need) return true;
    /* 音声は教材の中身ではなく、鳴らす手立てがあるかで決まる。
       教材に音声が入っていれば当然使えるので、そちらも見る。 */
    if (need === "speech") {
      if (o && o.canSpeak !== undefined) return !!o.canSpeak;
      return (hints && hints.audio) ? true : canSpeak();
    }
    if (hints) return !!hints[need];
    /* 教材のことが分からないとき：画像は頼まない。
       資料限定のときは、図表・表も頼まない（資料に無いものを作らせないため）。 */
    if (need === "images") return false;
    if (sourceOnly && (need === "figures" || need === "tables")) return false;
    return true;
  }

  /* AI へ渡してよい形式の一覧（domain/capability.js）。読めないときは null。 */
  function allowList(o) {
    var allow = null;
    try {
      if (VQ2.capability) allow = VQ2.capability.forAi({ mock: o.mode === "mock" || !!o.mock });
    } catch (e) { allow = null; }
    return allow;
  }

  /* その形式をいま使えるか。使えないときは理由も返す。
     ・note   … 配分から外したときに notes へ積む文（これまでと同じ文面）
     ・reason … 「なぜ使えないか」だけを取り出した短い言い方
     spread() の絞り込みと、指定配分（typeDistribution）の検査で同じ判断を使う。
     判断が 2 か所に分かれていると、**片方だけ黙って通る**ことになるため。 */
  function checkUsable(type, exclude, hints, allow, o) {
    o = o || {};
    var isMock = o.mode === "mock" || !!o.mock;
    if (arr(exclude).indexOf(type) >= 0) return { ok: false, note: "", reason: "使わないことになっている形式です" };
    var d = Q.get(type);
    if (!d) return { ok: false, note: "", reason: "知らない形式です" };
    if (d.status !== "available") return { ok: false, note: "", reason: "まだ使えない形式です" };
    if (allow && allow.indexOf(type) < 0) {
      /* 外した理由を取り違えない。試験（紙）で外れただけのものを
         「まだ動かない」と言うと、直しようのない誤解になる。 */
      var paperOnly = false;
      try {
        paperOnly = !!(VQ2.capability && isMock && VQ2.capability.NO_PAPER_ENGINES[d.engine]);
      } catch (e) {}
      return paperOnly
        ? { ok: false, note: "「" + d.name + "」は紙に出せない操作なので、試験では外しました。",
            reason: "紙に出せない操作です" }
        : { ok: false, note: "「" + d.name + "」は、まだ最後まで動かないので外しました。",
            reason: "まだ最後まで動かない形式です" };
    }
    if (o.mode && !Q.allowedInMode(type, o.mode)) return { ok: false, note: "", reason: "この場面では使えない形式です" };
    if (!d.supportsAI) return { ok: false, note: "", reason: "AI では作れない形式です" };
    if (!hintOk(type, hints, o.sourceOnly, o)) {
      return NEEDS[type] === "speech"
        ? { ok: false, note: "「" + d.name + "」は、この端末で音を出せないので外しました。",
            reason: "この端末で音を出せません" }
        : { ok: false, note: "「" + d.name + "」は、この教材からは作れないので外しました。",
            reason: "この教材からは作れません" };
    }
    return { ok: true, note: "", reason: "" };
  }

  /* 指示から読み取った「形式ごとの個数」をそろえる（契約 §5）。
     [{ type:"fill_blank", count:4 }, …] の形にして返す。読めないものは捨てる。 */
  function normDistribution(list) {
    var out = [], at = Object.create(null);
    arr(list).forEach(function (e) {
      if (!e) return;
      var raw = str(e.type || e.questionType).trim();
      if (!raw) return;
      var t = Q.canonicalId(raw) || (TYPE_ALIAS[raw.toLowerCase()] || raw);
      var n = isNum(e.count) ? Math.round(e.count) : parseInt(str(e.count), 10);
      if (!isNum(n) || n < 1) return;
      if (at[t] !== undefined) { out[at[t]].count += n; return; }
      at[t] = out.length;
      out.push({ type: t, count: n });
    });
    return out;
  }

  /* 自動配分の重み（style + 科目 + 文章で頼まれた形式）。 */
  function autoWeights(o, exclude) {
    var style = MIX[o.style] ? o.style : "auto";
    var base = Object.assign({}, MIX[style]);
    if (o.subject && SUBJECT_BOOST[o.subject]) {
      var b = SUBJECT_BOOST[o.subject];
      Object.keys(b).forEach(function (t) { base[t] = (base[t] || 0) + b[t]; });
    }
    /* 文章で頼まれた形式（「リスニングを入れて」「並び替えも」）。
       「〜だけ」なら manual で全部その形式になる。ここは「入れて」の場合。
       自動の配分に混ぜるだけだと埋もれて 0 問になるので、
       **いちばん重い形式と同じ重み**にして、必ず出るようにする。 */
    var asked = arr(o.requestedTypes).filter(function (t) {
      return Q.get(t) && Q.isAvailable(t) && arr(exclude).indexOf(t) < 0;
    });
    if (asked.length) {
      var top = Object.keys(base).reduce(function (a, t) { return Math.max(a, base[t]); }, 1);
      asked.forEach(function (t) { base[t] = Math.max(base[t] || 0, top); });
    }
    return Object.keys(base).map(function (t) { return { type: t, weight: base[t] }; });
  }

  /* 指定された個数が総数を超えるとき、割合を保ったまま総数に収める（最大剰余法）。 */
  function shrinkTo(dist, count) {
    var sum = dist.reduce(function (a, e) { return a + e.count; }, 0);
    var rows = dist.map(function (e) {
      var exact = count * e.count / sum;
      return { type: e.type, was: e.count, count: Math.floor(exact), rem: exact - Math.floor(exact) };
    });
    var used = rows.reduce(function (a, r) { return a + r.count; }, 0);
    rows.slice().sort(function (a, b) { return b.rem - a.rem; }).forEach(function (r) {
      if (used < count) { r.count++; used++; }
    });
    return rows;
  }

  /* 指定された配分（typeDistribution）をそのまま守る（契約 §5）。
     ・style が manual でなくても守る。
     ・足りない分は、これまでどおり自動の配分で埋める。
     ・多すぎる分は割合を保って減らし、減らしたことを notes に残す。
     ・使えない形式は **黙って別形式へ寄せない**。理由を notes に残して落とす（§6）。
     ・画面のチェックボックスで選んだ形式（style:"manual" + types）より、
       指示文の個数指定を優先する。**ただし選んだ形式は捨てない**。
       余りを埋めるときに先に使い、それでも 1 問も入らなければ notes に残す（§6）。 */
  function planFromDistribution(o, dist, count, exclude, hints, notes) {
    var allow = allowList(o);
    var wanted = dist.slice();
    /* 画面で選んだ形式（preset-studio が渡す）。使えないものはここで外す。 */
    var picked = (o.style === "manual" ? arr(o.types) : []).filter(function (t) {
      return Q.get(t) && Q.isAvailable(t);
    });
    var sum = wanted.reduce(function (a, e) { return a + e.count; }, 0);

    if (sum > count) {
      var rows = shrinkTo(wanted, count);
      notes.push("指定された合計 " + sum + " 問が、作る " + count + " 問より多いので、"
        + "割合を保ったまま減らしました（"
        + rows.map(function (r) { return Q.label(r.type) + " " + r.was + "→" + r.count + " 問"; }).join("・")
        + "）。");
      wanted = rows.filter(function (r) { return r.count > 0; })
        .map(function (r) { return { type: r.type, count: r.count }; });
    }

    var fixed = [];
    wanted.forEach(function (e) {
      var c = checkUsable(e.type, exclude, hints, allow, o);
      if (!c.ok) {
        var d = Q.get(e.type);
        notes.push("指定された「" + (d ? d.name : e.type) + "」" + e.count + " 問は入れられませんでした（"
          + c.reason + "）。ほかの形式へ勝手に置き換えていません。");
        return;
      }
      var def = Q.get(e.type);
      fixed.push({ type: e.type, count: e.count, name: def.name, engine: def.engine, category: def.category });
    });

    if (!fixed.length) {
      notes.push("指定された形式がどれも使えないため、自動の配分にしました。");
      return null;                      /* 呼び出し側で通常の自動配分へ戻す */
    }

    var used = fixed.reduce(function (a, i) { return a + i.count; }, 0);
    var items = fixed;
    /* 余りは自動配分で埋める。指定された形式は数が決まっているので、
       余りの側では使わない（使うと指定した個数が増えてしまう）。 */
    if (used < count) {
      var restExclude = arr(exclude).concat(fixed.map(function (i) { return i.type; }));
      /* 埋めるのに使う重みを、次の順で探す。
         ① 画面で選んだ形式（まだ使っていないもの）
         ② いまの style の配分表
         ③ 全体の配分表（style ごとの表を使い切ったとき）
         どれにも使える形式が無ければ **埋めない**。ここで 4 択へ落とすと、
         指定済みの形式と二重になり、頼んだ個数が増える（実測 2026-08-05）。 */
      var tries = [];
      var pickedLeft = picked.filter(function (t) { return restExclude.indexOf(t) < 0; })
        .map(function (t) { return { type: t, weight: 1 }; });
      if (pickedLeft.length) tries.push(pickedLeft);
      tries.push(autoWeights(o, restExclude));
      if (o.style !== "auto") tries.push(autoWeights(Object.assign({}, o, { style: "auto" }), restExclude));
      var weights = null;
      for (var ti = 0; ti < tries.length && !weights; ti++) {
        var cand = tries[ti];
        if (cand.some(function (w) { return checkUsable(w.type, restExclude, hints, allow, o).ok; }))
          weights = cand;
      }
      var rest = null;
      if (weights) {
        try { rest = spread(weights, count - used, restExclude, hints, notes, o); }
        catch (e) { rest = null; }
      }
      if (rest && arr(rest.items).length) {
        notes = rest.notes || notes;
        items = fixed.concat(rest.items.map(function (i) { return Object.assign({}, i); }));
      } else {
        notes.push("残りの " + (count - used) + " 問に使える形式が無かったので、指定された形式だけにしました（作るのは "
          + used + " 問になります）。");
      }
    }

    items = items.filter(function (i) { return i.count > 0; })
      .sort(function (a, b) { return b.count - a.count || a.type.localeCompare(b.type); });

    /* 画面で選んだのに 1 問も入らなかった形式は、黙って捨てない（§6）。 */
    if (picked.length) {
      var have = Object.create(null);
      items.forEach(function (i) { have[i.type] = 1; });
      var droppedPicked = picked.filter(function (t) { return !have[t]; });
      if (droppedPicked.length)
        notes.push("画面で選んだ「"
          + droppedPicked.map(function (t) { return Q.label(t); }).join("・")
          + "」は、指示に書かれた問題数のほうを先に守ったため使っていません。");
    }

    /* ここでは配分の決まりごと（形式の数・偏り）で **上書きしない**。
       指定された個数を守ることが先で、偏っていることは見えるようにするだけ。 */
    var distribution = null;
    if (VQ2.blueprint) {
      try {
        distribution = VQ2.blueprint.validateDistribution(items, count, o.requirements || {});
      } catch (e) { distribution = null; }
    }
    return {
      distribution: distribution,
      total: items.reduce(function (a, i) { return a + i.count; }, 0),
      requested: count,
      items: items,
      notes: notes,
      fixedTypes: fixed.map(function (i) { return i.type; }),
      summary: items.map(function (i) { return i.name + " " + i.count + " 問"; }).join("・")
    };
  }

  /* ══════════════════════════════════════════════════════════════════
     2) 配分を決める
     ══════════════════════════════════════════════════════════════════ */
  function planMix(o) {
    o = o || {};
    var count = Math.max(1, Math.min(500, isNum(o.count) ? Math.round(o.count) : 10));
    var hints = o.hints || null;
    var exclude = arr(o.exclude);
    var notes = [];

    /* 形式ごとの個数が指示から読めているときは、それを最優先で守る（契約 §5）。
       実測（2026-08-05）で「空欄補充を4問、正誤を4問」が
       「穴埋め2・4択2・○×2・並替1・単語1」になっていた。壊していたのはここ。

       画面のチェックボックス（style:"manual" + types）より個数指定を先に見る。
       個数指定のほうが具体的だから。**選んだ形式は捨てない**：
       余りを埋めるときに先に使い、それでも入らなければ notes に残す
       （planFromDistribution の picked / droppedPicked）。 */
    var dist = normDistribution(o.typeDistribution
      || (o.requirements && o.requirements.typeDistribution));
    if (dist.length) {
      var fixedPlan = planFromDistribution(o, dist, count, exclude, hints, notes);
      if (fixedPlan) return fixedPlan;
    }

    /* 形式を自分で指定したときは、その通りに割る。 */
    if (o.style === "manual" && arr(o.types).length) {
      var types = arr(o.types).filter(function (t) { return Q.get(t) && Q.isAvailable(t); });
      if (!types.length) { notes.push("指定された形式が使えないため、自動の配分にしました。"); }
      else return spread(types.map(function (t) { return { type: t, weight: 1 }; }), count, exclude, hints, notes, o);
    }

    return spread(autoWeights(o, exclude), count, exclude, hints, notes, o);
  }

  function spread(weighted, count, exclude, hints, notes, o) {
    o = o || {};
    /* 使えない形式・教材に合わない形式を先に落とす。 */
    /* **AI へ渡してよい形式**。名前があるだけのものは渡さない。
       表示・採点・編集・結果までそろっていることを実際に確かめた表から引く
       （domain/capability.js）。まだ読めないときは、これまでどおりレジストリを見る。 */
    var allow = allowList(o);

    var usable = weighted.filter(function (w) {
      var c = checkUsable(w.type, exclude, hints, allow, o);
      if (!c.ok) { if (c.note) notes.push(c.note); return false; }
      return true;
    });
    if (!usable.length) {
      /* ここで無条件に 4 択へ落とすと、**使わないと言われた形式**まで入り込む。
         実測（2026-08-05）: 指定配分の余りを埋めるとき、除外したはずの 4 択が
         この行から戻ってきて items に 2 行入り、頼んだ 1 問が 4 問になっていた。
         落としどころ自体が使えないなら、**作らない**（動くふりをしない・§6）。 */
      var fb = checkUsable("multiple_choice_single", exclude, hints, allow, o);
      if (!fb.ok) {
        notes.push("使える形式が無かったので、配分を作れませんでした（" + fb.reason
          + "）。ほかの形式で埋めていません。");
        return { distribution: null, total: 0, requested: count, items: [], notes: notes, summary: "" };
      }
      notes.push("配分を決められなかったので、4 択だけにしました。");
      usable = [{ type: "multiple_choice_single", weight: 1 }];
    }
    var total = usable.reduce(function (a, w) { return a + w.weight; }, 0);
    var maxPer = isNum(o.maxPerType) ? Math.max(1, o.maxPerType) : count;

    /* 最大剰余法で割る（合計が必ず count になる）。 */
    var raw = usable.map(function (w) { return { type: w.type, exact: count * w.weight / total }; });
    var items = raw.map(function (r) { return { type: r.type, count: Math.floor(r.exact), rem: r.exact - Math.floor(r.exact) }; });
    var used = items.reduce(function (a, i) { return a + i.count; }, 0);
    items.sort(function (a, b) { return b.rem - a.rem; });
    var k = 0;
    while (used < count && items.length) {
      if (items[k % items.length].count < maxPer) { items[k % items.length].count++; used++; }
      k++;
      if (k > count * 4) break;
    }
    /* 上限を超えた分は、余っている形式へ回す。 */
    items.forEach(function (i) {
      while (i.count > maxPer) {
        var to = items.filter(function (x) { return x !== i && x.count < maxPer; })[0];
        if (!to) break;
        i.count--; to.count++;
      }
    });
    items = items.filter(function (i) { return i.count > 0; })
      .map(function (i) {
        var d = Q.get(i.type);
        return { type: i.type, count: i.count, name: d.name, engine: d.engine, category: d.category };
      })
      .sort(function (a, b) { return b.count - a.count || a.type.localeCompare(b.type); });

    /* ここまでは「どの形式が使えるか」。
       ここから **偏っていないか** を見る（§12）。決まりごとは blueprint が持つ。
       ・5 問以上なら 2 形式、10 問以上なら 4 形式、20 問以上なら 6 形式、30 問以上なら 8 形式
       ・同じ形式は 4 割まで／選ぶだけの形式は合わせて半分まで
       守れないときは黙って通さず、理由を notes へ残す。 */
    var distribution = null;
    if (VQ2.blueprint) {
      try {
        var req = o.requirements || {
          minimumTypeCount: o.minTypes, maximumSameTypeRatio: o.maxSameRatio,
          onlyRequested: o.style === "manual" && arr(o.types).length > 0,
          requestedTypes: arr(o.types)
        };
        var fixed = VQ2.blueprint.enforceDistribution(items, count, {
          req: req, candidates: poolFor(o, exclude, hints, allow, items), notes: notes
        });
        items = fixed.items;
        notes = fixed.notes;
        if (fixed.exception) notes.push(fixed.exception);
        distribution = VQ2.blueprint.validateDistribution(items, count, req);
      } catch (e) { distribution = null; }
    }

    return {
      distribution: distribution,
      total: items.reduce(function (a, i) { return a + i.count; }, 0),
      requested: count,
      items: items,
      notes: notes,
      /* 人へ見せる 1 行 */
      summary: items.map(function (i) { return i.name + " " + i.count + " 問"; }).join("・")
    };
  }

  /* 形式を足すときの引き出し。配分表（MIX）に無い形式もここから使う。
     使えないもの・教材に合わないもの・使わないと言われたものは入れない。
     まだ使っていない **操作（エンジン）** のものを先に出す。
     同じ操作の形式ばかり足しても、解く体験は変わらないため。 */
  function poolFor(o, exclude, hints, allow, current) {
    o = o || {};
    var have = Object.create(null), usedEngine = Object.create(null);
    arr(current).forEach(function (i) { have[i.type] = 1; usedEngine[i.engine || Q.engineOf(i.type)] = 1; });
    var ids = allow && allow.length
      ? allow.slice()
      : Q.list({}).filter(function (d) { return !d.mode && d.status === "available" && d.supportsAI; })
          .map(function (d) { return d.id; });
    return ids.filter(function (t) {
      if (have[t]) return false;
      if (exclude.indexOf(t) >= 0) return false;
      var d = Q.get(t);
      if (!d || d.status !== "available" || !d.supportsAI) return false;
      if (o.mode && !Q.allowedInMode(t, o.mode)) return false;
      return hintOk(t, hints, o.sourceOnly, o);
    }).sort(function (a, b) {
      var ea = usedEngine[Q.engineOf(a)] ? 1 : 0, eb = usedEngine[Q.engineOf(b)] ? 1 : 0;
      return ea - eb || a.localeCompare(b);
    });
  }

  /* 教材から分かることを集める。分からないものは false ではなく未定義にする
     （「無い」と「分からない」を混ぜない）。 */
  function hintsFromAttachments(list, text) {
    var h = {};
    var any = false;
    arr(list).forEach(function (a) {
      any = true;
      var kind = str(a.kind || a.type);
      if (kind === "image" || /image|photo|png|jpe?g/i.test(str(a.mime) + str(a.name))) h.images = true;
      if (/audio|mp3|m4a|wav/i.test(str(a.mime) + str(a.name))) h.audio = true;
      if (isNum(a.pageCount) && a.pageCount > 0) h.longText = true;
      if (a.hasTable) h.tables = true;
      if (a.hasFigure) h.figures = true;
    });
    var t = str(text);
    if (t.length > 600) h.longText = true;
    if (/\d{3,4}\s*年|世紀|時代/.test(t)) h.chronology = true;
    if (/表\s*\d|以下の表|次の表/.test(t)) h.tables = true;
    if (/グラフ|図\s*\d|次の図/.test(t)) h.figures = true;
    return any || t ? h : null;
  }

  /* ══════════════════════════════════════════════════════════════════
     3) AI への頼み方
     ・形式ごとに、返してほしい形をそのまま書く。
       書かないと、AI は必ず選択肢の形へ寄せてくる。
     ══════════════════════════════════════════════════════════════════ */
  var SHAPE = {
    single_choice: '{"questionType":"multiple_choice_single","question":"問題文","choices":[{"id":"c1","text":"…"},{"id":"c2","text":"…"},{"id":"c3","text":"…"},{"id":"c4","text":"…"}],"correctAnswer":"c1","explanation":"…"}',
    true_false:    '{"questionType":"true_false","question":"…","choices":[{"id":"c1","text":"正しい"},{"id":"c2","text":"誤り"}],"correctAnswer":"c1","explanation":"…"}',
    multi_choice:  '{"questionType":"multiple_choice_multiple","question":"…","choices":[…4件以上…],"correctAnswers":["c1","c3"],"explanation":"…"}',
    text_input:    '{"questionType":"word_input","question":"…","correctAnswer":"正解の語","acceptedAnswers":["言い換え"],"explanation":"…"}',
    numeric_input: '{"questionType":"numeric","question":"…","correctAnswer":"12.5","tolerance":0.1,"unit":"cm","explanation":"…"}',
    fill_blank:    '{"questionType":"fill_blank","question":"文の中の空欄は【　】で示す","blanks":[{"answer":"正解1"},{"answer":"正解2"}],"explanation":"…"}',
    /* items は文字列の配列。サーバの Schema は中身を縛っていないので、
       **例で形を決める**（受け取る側は {text} などの形も拾えるようにしてある）。
       いちど Schema 側を縛ってみたが、実 AI で確かめきれなかったので戻した。
       縛るなら、Bridge を再起動したうえで並べ替えだけの生成を実測してから。 */
    reorder:       '{"questionType":"ordering","question":"正しい順に並べなさい","items":["最初","2番目","3番目","4番目"],"explanation":"…"}',
    matching:      '{"questionType":"matching","question":"対応するものを結びなさい","pairs":[{"left":"用語","right":"意味"},{"left":"用語2","right":"意味2"}],"explanation":"…"}',
    classification:'{"questionType":"classification","question":"次の語を分けなさい","groups":["グループA","グループB"],"items":[{"text":"語1","group":"グループA"},{"text":"語2","group":"グループB"}],"explanation":"…"}',
    table_fill:    '{"questionType":"table_fill","question":"表を完成させなさい","table":{"columns":["列1","列2"],"rows":[{"cells":["固定の文字",{"answer":"埋める正解"}]}]},"explanation":"…"}',
    chart_read:    '{"questionType":"chart_read","question":"グラフから読み取れることは","chart":{"kind":"bar","title":"…","categories":["1970","1980"],"series":[{"name":"輸出額","values":[120,340]}],"unit":"億円"},"choices":[…4件…],"correctAnswer":"c1","explanation":"…"}',
    error_correction:'{"questionType":"error_correction","question":"誤りを含む文をそのまま書く","errors":[{"wrong":"文中の誤った語","correct":"正しい形"}],"explanation":"…"}',
    free_text:     '{"questionType":"long_answer","question":"…","modelAnswer":"模範解答","rubric":[{"description":"採点の観点","points":5}],"explanation":"…"}',
    /* question / explanation は Schema で必須。例に書いていなかったので、
       モデルは question を足すぶん back を落とすことがあった（実測で 2 回）。
       **例を必須項目とそろえる。** */
    flashcard:     '{"questionType":"flashcard","question":"表に出す語（front と同じでよい）","front":"表（思い出すきっかけ）","back":"裏（答え）","explanation":"…"}',
    /* 音声問題は **原稿（script）を書かせる**。音声ファイルの URL は作らせない
       （存在しない音を指す問題ができてしまう）。音は解くときに読み上げで用意する。 */
    dictation:     '{"questionType":"dictation","question":"聞こえたとおりに書きなさい","correctAnswer":"読み上げる文（これがそのまま流れます）"}',
    audio_choice:  '{"questionType":"audio_choice","question":"音声を聞いて答えなさい","script":"実際に読み上げる文（会話なら A: … B: … と書く）","choices":[{"id":"c1","text":"…"},{"id":"c2","text":"…"},{"id":"c3","text":"…"},{"id":"c4","text":"…"}],"correctAnswer":"c1","explanation":"…"}',
    composite:     '{"questionType":"composite","instruction":"次の文章を読んで、あとの問いに答えなさい","context":"共通の資料（本文）","children":[{…上のどれかの形…},{…}]}'
  };

  /* ══ 全体の配分を、回ごとに配る ══

     実測（2026-08-04・ローカル Qwen3-VL-30B）で分かったこと:
       **1 回の依頼で複数の形式を頼むと、モデルはほぼ 1 形式へ寄せる。**
       「単語入力3 / 空欄2 / 並び替え2 / …」→ 単語入力 10 問
       「4択4 / 単語3 / 空欄1 / …」→ 短答 12 問
       1 問ずつ名指ししても変わらなかった（むしろ単一形式の指定まで崩れた）。
     一方、**1 形式だけを頼めば、そのとおりに作る**（正誤だけ 8 問 → 正誤 8 問）。

     そこで、モデルと戦わずに合わせる。
     全体の配分は変えないまま、**1 回の依頼へ入れる形式を 1〜2 種類に絞って**
     回をまたいで配る。5 問 × 4 回なら、回ごとに形式が変わっていく。

     take(plan, n) は「先頭から n 問ぶん」を取り出し、残りを返す。
     取り出した側は形式が少なくなるので、モデルが守れる大きさになる。 */
  var MAX_TYPES_PER_ROUND = 2;

  function take(plan, n) {
    n = Math.max(1, Math.round(Number(n) || 1));
    var items = arr(plan && plan.items).map(function (i) { return Object.assign({}, i); });
    var out = [], left = n;
    for (var k = 0; k < items.length && left > 0; k++) {
      if (out.length >= MAX_TYPES_PER_ROUND) break;
      if (!(items[k].count > 0)) continue;
      var t = Math.min(items[k].count, left);
      out.push(Object.assign({}, items[k], { count: t }));
      items[k].count -= t;
      left -= t;
    }
    /* 形式の上限で n に届かないときは、最後に取った形式で埋める。
       「頼んだ数より少ない」を作らないため。 */
    if (left > 0 && out.length) {
      var last = out[out.length - 1];
      var src = items.filter(function (i) { return i.type === last.type; })[0];
      var add = src ? Math.min(src.count, left) : 0;
      if (add > 0) { last.count += add; src.count -= add; left -= add; }
    }
    /* それでも足りなければ、残っている形式から足す（形式は増えるが数を優先）。 */
    for (var j = 0; j < items.length && left > 0; j++) {
      if (!(items[j].count > 0)) continue;
      var m = Math.min(items[j].count, left);
      var hit = out.filter(function (x) { return x.type === items[j].type; })[0];
      if (hit) hit.count += m; else out.push(Object.assign({}, items[j], { count: m }));
      items[j].count -= m; left -= m;
    }
    var rest = items.filter(function (i) { return i.count > 0; });
    return {
      plan: out.length ? { items: out, summary: summaryOf(out), distribution: plan && plan.distribution,
                           notes: [] } : null,
      rest: rest.length ? { items: rest, summary: summaryOf(rest),
                            distribution: plan && plan.distribution, notes: [] } : null
    };
  }

  function summaryOf(items) {
    return arr(items).map(function (i) { return i.name + " " + i.count + " 問"; }).join(" / ");
  }

  function promptFor(plan, o) {
    o = o || {};
    if (!plan || !arr(plan.items).length) return "";
    var lines = [];
    /* 形式 ID だけを渡しても、AI は形式を使い分けられない。
       「どんなときに使い、どんなときに避け、どう採点されるか」まで渡す（§15）。
       ただし **形式ごとに書かない**。同じ操作のものはまとめて 1 ブロックにする。 */
    if (VQ2.qdescriptor) {
      try {
        var block = VQ2.qdescriptor.promptBlock(plan.items.map(function (i) { return i.type; }), o);
        if (block) { lines.push(block); lines.push(""); }
      } catch (e) {}
    }
    lines.push("【出題形式の内訳】");
    lines.push("次のとおりに作ってください。4 択だけに寄せないでください。");
    plan.items.forEach(function (i) {
      lines.push("・" + i.name + "（questionType: " + i.type + "）… " + i.count + " 問");
    });
    lines.push("");

    /* **1 問ずつ、どの形式で作るかを書き下す。**

       合計だけを渡すと、モデルは配分を無視して 1 つの形式へ寄せる。
       実測（vqpresettype.cjs・2026-08-04・ローカル Qwen3-VL-30B）:
         「単語入力3 / 空欄2 / 並び替え2 / カード1 / 記述1 / 組合せ1」と頼んで
         返ってきたのは **単語入力 10 問**（1 形式）。
         「4択4 / 単語3 / 空欄1 / …」で頼んだときは **短答 12 問**（1 形式）。
       試験コンパイラ（mock-compile-run.js）では、
       「問1: 選択 / 問2: 正誤 …」と 1 問ずつ名指しすることでこれが直った。
       同じやり方をここでも使う。 */
    var order = [];
    plan.items.forEach(function (i) {
      for (var k = 0; k < i.count; k++) order.push(i);
    });
    /* 形式が 1 つだけのときは書かない。
       同じ行が 8 つ並ぶだけで、長くなるほど守られにくくなる
       （実測: 正誤だけ 8 問の指定が、並べたとたんに 4 択へ化けた）。 */
    if (plan.items.length > 1 && order.length > 1) {
      lines.push("【1 問ずつの割り当て】");
      lines.push("questions は **この順・この形式**で作ってください。"
        + "1 つの形式にまとめないでください。");
      order.forEach(function (i, k) {
        lines.push((k + 1) + ") " + i.name + "（questionType: " + i.type + "）");
      });
      lines.push("");
    }
    lines.push("【形式ごとの返し方】");
    lines.push("questions の 1 件ごとに、次の形で返してください。");
    var seen = {};
    plan.items.forEach(function (i) {
      var eng = i.engine;
      if (seen[eng]) return;
      seen[eng] = 1;
      if (SHAPE[eng]) lines.push("・" + i.name + ": " + SHAPE[eng]);
    });
    /* 落としやすい欄を名指しで言う。
       実測（2026-08-04）: 並べ替えは items が空のまま、
       カードは front だけで back が無いまま返ってきて、取り込めずに捨てていた。
       **抜けやすいところだけ**書く。全部に注意書きを付けると効きが薄まる。 */
    var engines = {};
    plan.items.forEach(function (i) { engines[i.engine] = 1; });
    var must = [];
    if (engines.reorder)
      must.push("・並べ替えは items に **並べる項目を 3 つ以上**、正しい順に入れてください。"
        + "items が空の設問は作らないでください。");
    if (engines.flashcard)
      must.push("・カードは front（表）と back（裏）の **両方**を必ず書いてください。片方だけにしないでください。");
    if (engines.matching)
      must.push("・組み合わせは pairs に left と right を **2 組以上**、どちらも空にせず書いてください。");
    if (engines.fill_blank)
      must.push("・空欄補充は、問題文の空欄を【　】で示し、blanks に空欄と同じ数だけ答えを入れてください。");
    if (engines.free_text)
      must.push("・記述は modelAnswer（模範解答）と rubric（採点の観点と点）を必ず書いてください。");
    if (must.length) {
      lines.push("");
      lines.push("【この形式で必ず書くこと】");
      must.forEach(function (m) { lines.push(m); });
    }

    lines.push("");
    lines.push("【守ること】");
    lines.push("・questionType は上に書いた文字をそのまま使ってください。");
    lines.push("・reasonForType に「なぜその形式にしたか」を 1 文で書いてください。");
    lines.push("・その形式に合わない内容を無理に当てはめないでください。合わないときは、内訳の中の別の形式に振り替え、その理由を reasonForType に書いてください。");
    lines.push("・difficulty は easy / normal / hard、estimatedTime は秒数で書いてください。");
    /* 音声問題を含むときだけ書く。毎回書くと指示が薄まる。 */
    if (plan.items.some(function (i) { return NEEDS[i.type] === "speech"; })) {
      lines.push("・音声問題は script に「実際に読み上げる文」を書いてください。音声ファイルの URL は書かないでください（こちらで読み上げます）。");
      /* script はそのまま音になる。解説を混ぜると、答えが聞こえてしまう。 */
      lines.push("・script には読み上げる文だけを書いてください。正解・解説・補足を混ぜないでください（script はそのまま音になるので、答えが聞こえてしまいます）。解説は explanation に書いてください。");
      lines.push("・会話の音声は script に「A: … / B: …」の形で書いてください。question には聞き方だけを書いてください。");
      lines.push("・書き取り（dictation）は correctAnswer がそのまま読み上げる文になります。読み上げて自然な 1〜2 文にしてください。");
    }
    if (o.sourceOnly) {
      lines.push("・資料に書かれていることだけで作ってください。資料に無いことは書かないでください。");
      lines.push("・1 問ごとに sourceReferences（evidenceId と、あればページ）を必ず付けてください。根拠を示せない問題は作らないでください。");
    }
    return lines.join("\n");
  }

  /* ══════════════════════════════════════════════════════════════════
     4) AI の出力を取り込む
     ・知らない形式は、近い形式へ寄せる。寄せられなければ捨てる（§15）。
     ・正解が作れないものは捨てる。勝手な正解を作らない。
     ══════════════════════════════════════════════════════════════════ */
  /* AI が書きがちな別名 → 正式 ID */
  var TYPE_ALIAS = {
    mcq: "multiple_choice_single", multiple_choice: "multiple_choice_single",
    single_choice: "multiple_choice_single", choice: "multiple_choice_single",
    four_choice: "multiple_choice_single", "4choice": "multiple_choice_single",
    two_choice: "choice_2", tf: "true_false", truefalse: "true_false",
    multi_select: "multiple_choice_multiple", multiple_answer: "multiple_choice_multiple",
    cloze: "fill_blank", fill_in_the_blank: "fill_blank", blank: "fill_blank",
    sort: "ordering", order: "ordering", sequence: "ordering", reorder: "ordering",
    chronology: "reorder_chronology", timeline_order: "reorder_chronology",
    match: "matching", pairing: "matching",
    classify: "classification", grouping: "classification", categorize: "classification",
    table: "table_fill", graph: "chart_read", chart: "chart_read",
    listening: "audio_choice", dictation_test: "dictation",
    correction: "error_correction", proofread: "error_correction",
    short_answer_text: "short_answer", text: "short_answer", word: "word_input",
    number: "numeric", numeric_answer: "numeric",
    essay_question: "essay", description: "long_answer", writing: "long_answer",
    card: "flashcard", vocabulary_card: "flashcard",
    passage_set: "composite", multi_part: "composite", group: "composite"
  };
  /* 寄せ先。作れないときの落としどころ。 */
  var FALLBACK = {
    image_point: "multiple_choice_single", image_label: "multiple_choice_single",
    map_pin: "multiple_choice_single", audio_choice: "multiple_choice_single",
    dictation: "short_answer", drawing: "long_answer", chart_build: "long_answer",
    /* 音声形式の寄せ先。音の要らない、同じ答え方の形式にする。 */
    pronunciation_choice: "multiple_choice_single", dialog_response: "multiple_choice_single",
    audio_once: "multiple_choice_single", audio_speed: "multiple_choice_single",
    audio_fill_blank: "fill_blank", audio_order: "ordering",
    matching_audio_text: "matching"
  };

  function canonType(raw, d) {
    var t = str(raw).trim().toLowerCase();
    if (Q.canonicalId(t)) return Q.canonicalId(t);
    if (TYPE_ALIAS[t]) return TYPE_ALIAS[t];
    /* 形から当てる。名乗りが無くても構造で分かる。 */
    if (arr(d.blanks).length) return "fill_blank";
    if (arr(d.items).length && !arr(d.groups).length) return "ordering";
    if (arr(d.pairs).length) return "matching";
    if (arr(d.groups).length) return "classification";
    if (arr(d.errors).length) return "error_correction";
    if (d.table) return "table_fill";
    if (d.chart) return "chart_read";
    if (arr(d.children).length) return "composite";
    if (str(d.front) && str(d.back)) return "flashcard";
    if (arr(d.rubric).length || str(d.modelAnswer)) return "long_answer";
    if (arr(d.choices).length >= 2) return "multiple_choice_single";
    if (str(d.correctAnswer)) return "short_answer";
    return "";
  }

  var DIFFICULTY_MAP = { easy: "easy", normal: "normal", medium: "normal", hard: "hard", difficult: "hard" };

  /* AI の 1 件 → V3 の問題。作れないときは null（捨てる理由つき）。 */
  /* ══ 出典の形をそろえる ══

     AI が返す形（evidenceId / attachmentId / fileName / page）と、
     保存できる形（id / sourceType / sourceId / sourceName / verified / page）は違う。
     試験の側（mock-builder.mapSources）はここを変換していたが、
     プリセットの側は **生のまま入れていた**。そのため出典の付いたプリセットは
     保存できなかった（実測: required@sourceReferences[0].id ほか 3 件で保存不可）。

     ここが唯一の変換にする。mock-builder はこれを使う（読み込み順の都合で、
     mock-builder は qplan より後に読まれるので参照できる）。
     ファイル名が無いものは捨てる。**どの資料か分からない出典は、出典ではない。** */
  function normSources(list) {
    return (Array.isArray(list) ? list : []).map(function (r, i) {
      if (!r) return null;
      /* すでに保存できる形なら、そのまま通す（二度変換しない）。 */
      if (str(r.id) && str(r.sourceType)) return r;
      var name = str(r.fileName || r.sourceName);
      if (!name) return null;
      var o = {
        id: str(r.evidenceId) || str(r.id) || ("s" + (i + 1)),
        sourceType: "pdf",
        sourceId: str(r.attachmentId || r.sourceId),
        sourceName: name,
        verified: true
      };
      if (isNum(r.page) && r.page >= 1) o.page = r.page;
      return o;
    }).filter(Boolean);
  }

  function fromAi(d, o) {
    o = o || {};
    if (!isObj(d)) return null;
    var wanted = canonType(d.questionType || d.type, d);
    var converted = "", conversion = null;
    if (!wanted) return { error: "形式が分かりませんでした。" };
    var def = Q.get(wanted);
    if (!def) return { error: "知らない形式です: " + wanted };
    if (def.status === "coming_soon" || !def.supportsAI) {
      var fb = FALLBACK[wanted];
      if (!fb) return { error: "「" + def.name + "」はまだ作れません。" };
      /* 寄せ先の表で差し替えている。**黙って形式を変えない**（§6）。 */
      converted = "「" + def.name + "」はまだ作れないので、「" + Q.label(fb) + "」にしました。";
      conversion = { originalType: wanted, originalName: def.name,
                     convertedType: fb, convertedName: Q.label(fb),
                     reason: def.status === "coming_soon"
                       ? "まだ用意できていない形式のため" : "AI では作れない形式のため" };
      wanted = fb;
      def = Q.get(fb);
    }
    /* 音声の形式なのに、読み上げる原稿も音声ファイルも無い。
       そのままだと **見た目は音声問題なのに何も鳴らない＝解けない** ので、
       音の要らない形式へ寄せる。何を何へ寄せたかは下の __conversion に残す。
       書き取りは正解の文がそのまま原稿になるので、ここでは見ない。 */
    if (NEEDS[wanted] === "speech" && wanted !== "dictation") {
      var hasScript = str(d.script || d.audioScript || d.transcript
                          || (d.audio && (d.audio.script || d.audio.text)) || "").trim();
      var hasFile = arr(d.media).some(function (m) { return m && str(m.kind) === "audio" && str(m.src); });
      var fb2 = FALLBACK[wanted] || FALLBACK[def.engine];
      if (!hasScript && !hasFile && fb2 && Q.get(fb2)) {
        converted = addNote(converted,
          "「" + def.name + "」に読み上げる原稿が無かったので、「" + Q.label(fb2) + "」にしました。");
        conversion = { originalType: wanted, originalName: def.name,
                       convertedType: fb2, convertedName: Q.label(fb2),
                       reason: "読み上げる原稿が無く、音を作れないため", previous: conversion };
        wanted = fb2;
        def = Q.get(fb2);
      }
    }

    /* 最後まで動かない形式が返ってきたら、同じ操作の形式へ寄せる。
       寄せ先が無ければ、その 1 問だけ捨てる（全体を失敗させない）。 */
    try {
      if (VQ2.capability) {
        var r = VQ2.capability.resolve(wanted, { mock: !!o.mock });
        if (!r.ok) return { error: "「" + def.name + "」は" + r.reason };
        if (r.type !== wanted) {
          converted = addNote(converted, "「" + def.name + "」を「" + Q.label(r.type) + "」へ寄せました。");
          /* 何を何へ寄せたかを残す（§24）。黙って形式を変えない。 */
          conversion = { originalType: wanted, originalName: def.name,
                         convertedType: r.type, convertedName: Q.label(r.type),
                         reason: r.reason || "同じ操作の形式へ寄せました", previous: conversion };
          wanted = r.type;
          def = Q.get(wanted);
        }
      }
    } catch (e) {}
    var engine = def.engine;
    var points = isNum(d.points) ? d.points : 1;

    var q = {
      id: o.idPrefix ? o.idPrefix + str(d.id) : S.newId("q"),
      sourceId: str(d.id),
      questionNumber: null,
      type: wanted,
      prompt: str(d.question || d.prompt || d.stem),
      instruction: str(d.instruction),
      context: str(d.context || d.passage),
      explanation: str(d.explanation),
      difficulty: DIFFICULTY_MAP[str(d.difficulty).toLowerCase()] || "normal",
      topic: str(d.topic || d.unit),
      tags: arr(d.tags).map(str).slice(0, 20),
      points: points,
      estimatedSeconds: isNum(d.estimatedTime) ? Math.round(d.estimatedTime) : M.defaultSeconds(wanted),
      requiresReview: d.requiresReview === true,
      sourceReferences: normSources(d.sourceReferences),
      createdBy: "ai",
      createdAt: S.nowIso(),
      updatedAt: S.nowIso(),
      metadata: { generatedByAI: true, reasonForType: str(d.reasonForType), unit: str(d.unit) }
    };

    /* 読み上げる原稿。AI は書き方をいろいろ返してくるので、まとめて受ける。
       音声ファイルの URL は受けない（存在しない音を指す問題になるため）。 */
    var script = str(d.script || d.audioScript || d.transcript
                     || (d.audio && (d.audio.script || d.audio.text)) || "");
    if (script) q.script = script.slice(0, 2000);

    if (engine === "single_choice" || engine === "true_false" || engine === "multi_choice"
        || engine === "image_choice" || engine === "audio_choice"
        || (engine === "chart_read" && arr(d.choices).length)) {
      var choices = arr(d.choices).map(function (c, i) {
        if (typeof c === "string") c = { id: "c" + (i + 1), text: c };
        return { id: str(c.id) || ("c" + (i + 1)), label: String.fromCharCode(65 + i),
                 text: str(c.text), explanation: str(c.explanation), isCorrect: false };
      }).filter(function (c) { return c.text.trim(); });
      var forcedTF = false;
      if (choices.length < 2 && engine === "true_false") {
        /* ○× の選択肢は決まっている。**形式を変えずに補う。**

           実測（2026-08-04）:「正誤問題だけで 8 問」と頼み、モデルも
           true_false 8 問で返したのに、取り込んだあとは短答が 5 問になっていた。
           ○× は `correctAnswer: "正しい"` だけ返してくることが多く、
           choices が 2 つ未満だと下の「短答へ落とす」に流れていたため。
           頼まれた形式を、取り込みの都合で変えてはいけない。 */
        var yes = str(d.correctAnswer !== undefined ? d.correctAnswer : d.answer).trim().toLowerCase();
        var isTrue = null;
        if (d.correctAnswer === true || d.answer === true) isTrue = true;
        else if (d.correctAnswer === false || d.answer === false) isTrue = false;
        else if (/^(true|正しい|正解|正|○|◯|まる|はい|yes|y|t|1)$/.test(yes)) isTrue = true;
        else if (/^(false|誤っている|誤り|誤|不正解|×|✕|✖|ばつ|いいえ|no|n|f|0)$/.test(yes)) isTrue = false;
        else if (yes) {
          /* 文で返してくることもある。打ち消しの語があれば「誤」。 */
          if (/誤|×|✕|間違|正しくない|適切でない|不適切/.test(yes)) isTrue = false;
          else if (/正しい|○|◯|適切/.test(yes)) isTrue = true;
        }
        /* 読み取れないものを当てずっぽうで通さない。**間違った正解を持つ問題は害になる。** */
        if (isTrue === null) return { error: "○× の正解が読み取れませんでした。" };
        choices = [{ id: "c1", label: "A", text: "正しい", explanation: "", isCorrect: isTrue },
                   { id: "c2", label: "B", text: "誤っている", explanation: "", isCorrect: !isTrue }];
        forcedTF = true;
      }
      /* 補ったときは、正解もこちらで決めている。
         このあとの「AI が書いた正解を読む」処理を通すと、
         `correctAnswer` の書き方しだいで **両方に印が付く**（実測 3/8 問）。 */
      if (!forcedTF) {
      if (choices.length < 2) {
        /* 選択肢が足りないものを捨てない。文字で答える形式へ落として残す。
           落としたことは黙って済ませない。呼び出し側の converted に載せる（§6）。 */
        var alt = fromAi(Object.assign({}, d, {
          questionType: "short_answer",
          correctAnswer: str(d.correctAnswer) || (choices[0] ? choices[0].text : "")
        }), o);
        if (alt && !alt.error) {
          alt.__converted = addNote(converted || alt.__converted,
            "「" + def.name + "」の選択肢が " + choices.length + " 個しか無かったので、「"
            + Q.label("short_answer") + "」にしました。");
          alt.__conversion = { originalType: wanted, originalName: def.name,
                               convertedType: "short_answer", convertedName: Q.label("short_answer"),
                               reason: "選択肢が 2 つ未満で、選んで答える形にできないため",
                               previous: conversion || alt.__conversion || null };
        }
        return alt;
      }
      var correctIds = arr(d.correctAnswers).length ? arr(d.correctAnswers).map(str)
                     : (str(d.correctAnswer) ? [str(d.correctAnswer)] : []);
      var hit = 0;
      choices.forEach(function (c) {
        if (correctIds.indexOf(c.id) >= 0 || correctIds.indexOf(c.text) >= 0) { c.isCorrect = true; hit++; }
      });
      /* 正解を選択肢そのものに書いてくる形（isCorrect / correct / answer）も受ける。
         こう返すモデルは多い。ここで受けないと、正しく作れているのに丸ごと捨ててしまう。 */
      if (!hit) {
        arr(d.choices).forEach(function (c, i) {
          if (!c || typeof c !== "object") return;
          if (c.isCorrect === true || c.correct === true || c.answer === true) {
            if (choices[i]) { choices[i].isCorrect = true; hit++; }
          }
        });
      }
      /* 何番目が正解か、という書き方（0 から / 1 から の両方を見る）。 */
      if (!hit && isNum(d.correctIndex)) {
        var ci = Math.round(d.correctIndex);
        var pick = choices[ci] || choices[ci - 1];
        if (pick) { pick.isCorrect = true; hit++; }
      }
      if (!hit) return { error: "正解がどれか分かりませんでした。" };
      if (engine !== "multi_choice" && hit > 1) return { error: "1 つ選ぶ形式なのに正解が複数ありました。" };
      }
      q.choices = choices;
      if (engine === "chart_read" && d.chart) q.chart = d.chart;
    } else if (engine === "text_input") {
      q.correctAnswer = str(d.correctAnswer || d.answer);
      if (!q.correctAnswer) return { error: "正解が入っていませんでした。" };
      q.acceptedAnswers = arr(d.acceptedAnswers).map(str).filter(Boolean);
    } else if (engine === "numeric_input") {
      q.correctAnswer = str(d.correctAnswer || d.answer);
      if (!q.correctAnswer || !isFinite(Number(String(q.correctAnswer).replace(/,/g, ""))))
        return { error: "数値の正解が入っていませんでした。" };
      q.scoringRule = { tolerance: isNum(d.tolerance) ? d.tolerance : 0, unit: str(d.unit) };
    } else if (engine === "fill_blank") {
      var blanks = arr(d.blanks).map(function (b, i) {
        if (typeof b === "string") b = { answer: b };
        return { id: "b" + (i + 1), label: String(i + 1), answer: str(b.answer),
                 acceptedAnswers: arr(b.acceptedAnswers).map(str).filter(Boolean) };
      }).filter(function (b) { return b.answer; });
      if (!blanks.length) {
        if (str(d.correctAnswer)) blanks = [{ id: "b1", label: "1", answer: str(d.correctAnswer), acceptedAnswers: [] }];
        else return { error: "空欄の正解が入っていませんでした。" };
      }
      q.blanks = blanks;
    } else if (engine === "reorder") {
      /* 並べ替える項目の入れ物は、返す側で名前が揺れる。
         サーバの Schema は items の中身を縛っていない（"items": {}）ので、
         文字列でも、text 以外の名前を持つオブジェクトでも通ってしまう。
         実測（2026-08-04）: 並べ替えの取り込みが 3 件続けて
         「並べ替える項目が足りませんでした」で落ちた。
         **受け取る側を広げる。** 名前が違うだけで捨てるのは、もったいない。 */
      var items = arr(d.items).length ? arr(d.items)
        : arr(d.orderItems).length ? arr(d.orderItems)
        : arr(d.sequence).length ? arr(d.sequence)
        : arr(d.steps).length ? arr(d.steps)
        : arr(d.choices);
      var oi = items.map(function (t, i) {
        if (typeof t === "string") t = { text: t };
        if (!t || typeof t !== "object") t = {};
        var text = str(t.text || t.item || t.content || t.value || t.label || t.sentence);
        return { id: "i" + (i + 1), text: text, order: i + 1 };
      }).filter(function (x) { return x.text; });
      if (oi.length < 2) return { error: "並べ替える項目が足りませんでした。" };
      q.orderItems = oi;
      q.correctOrder = oi.map(function (x) { return x.id; });
    } else if (engine === "matching") {
      /* 組み合わせは `pairs:[{left,right}]` で来るとは限らない。
         `items:[{term,meaning}]` のような書き方も多く、そのたびに丸ごと
         捨てていた（実測 2026-08-04: 頼んだ組み合わせ 2 問がどちらも消えた）。
         **同じ意味の書き方は受ける。** 分からない書き方だけを断る。 */
      var ps = arr(d.pairs).length ? arr(d.pairs) : arr(d.items);
      var LKEYS = ["left", "term", "word", "question", "key", "a", "from", "item"];
      var RKEYS = ["right", "meaning", "definition", "answer", "value", "b", "to", "match"];
      function side(p, keys) {
        for (var i = 0; i < keys.length; i++) if (str(p[keys[i]])) return str(p[keys[i]]);
        return "";
      }
      ps = ps.map(function (p) {
        if (Array.isArray(p) && p.length >= 2) return { left: str(p[0]), right: str(p[1]) };
        if (!p || typeof p !== "object") return null;
        var l = side(p, LKEYS), r = side(p, RKEYS);
        return l && r ? { left: l, right: r } : null;
      }).filter(Boolean);
      if (ps.length < 2) return { error: "組み合わせが足りませんでした。" };
      var left = [], right = [], correct = {};
      ps.forEach(function (p, i) {
        var lid = "L" + (i + 1), rid = "R" + (i + 1);
        left.push({ id: lid, text: str(p.left) });
        right.push({ id: rid, text: str(p.right) });
        correct[lid] = rid;
      });
      if (left.some(function (l) { return !l.text; }) || right.some(function (r) { return !r.text; }))
        return { error: "組み合わせの中身が空でした。" };
      arr(d.dummies).forEach(function (t, i) {
        if (str(t)) right.push({ id: "RD" + (i + 1), text: str(t), isDummy: true });
      });
      q.pairs = { left: left, right: right, correct: correct };
      q.correctAnswer = correct;
    } else if (engine === "classification") {
      var groups = arr(d.groups).map(function (g, i) {
        if (typeof g === "string") g = { label: g };
        return { id: "g" + (i + 1), label: str(g.label || g.name) };
      }).filter(function (g) { return g.label; });
      var byLabel = {};
      groups.forEach(function (g) { byLabel[g.label] = g.id; });
      var cItems = arr(d.items).map(function (t, i) {
        if (typeof t === "string") t = { text: t };
        var gid = byLabel[str(t.group || t.groupLabel)] || str(t.groupId);
        return { id: "t" + (i + 1), text: str(t.text), groupId: gid };
      }).filter(function (x) { return x.text && x.groupId; });
      if (groups.length < 2 || cItems.length < 2) return { error: "分類の中身が足りませんでした。" };
      q.classification = { groups: groups, items: cItems };
    } else if (engine === "table_fill") {
      var t2 = d.table;
      if (!isObj(t2) || !arr(t2.rows).length) return { error: "表の中身が入っていませんでした。" };
      var cols = arr(t2.columns).map(function (c, i) {
        return { id: "col" + (i + 1), text: typeof c === "string" ? c : str(c.text) };
      });
      var rows = arr(t2.rows).map(function (r, ri) {
        var cells = arr(r.cells != null ? r.cells : r).map(function (c, ci) {
          if (typeof c === "string") return { id: "r" + (ri + 1) + "c" + (ci + 1), text: c, editable: false };
          return { id: "r" + (ri + 1) + "c" + (ci + 1), text: str(c.text),
                   editable: !!str(c.answer), answer: str(c.answer),
                   acceptedAnswers: arr(c.acceptedAnswers).map(str).filter(Boolean) };
        });
        return { id: "r" + (ri + 1), header: str(r.header), cells: cells };
      });
      var editable = 0;
      rows.forEach(function (r) { r.cells.forEach(function (c) { if (c.editable) editable++; }); });
      if (!editable) return { error: "表に埋めるますがありませんでした。" };
      q.table = { columns: cols, rows: rows, caption: str(t2.caption) };
    } else if (engine === "chart_read") {
      if (!isObj(d.chart)) return { error: "図表の中身が入っていませんでした。" };
      q.chart = d.chart;
      q.correctAnswer = str(d.correctAnswer);
      if (!q.correctAnswer) return { error: "図表の問題の正解が入っていませんでした。" };
      q.settings = { answerKind: "numeric" };
      q.scoringRule = { tolerance: isNum(d.tolerance) ? d.tolerance : 0 };
    } else if (engine === "error_correction") {
      var spans = arr(d.errors).map(function (e, i) {
        return { id: "e" + (i + 1), wrong: str(e.wrong), correct: str(e.correct),
                 acceptedAnswers: arr(e.acceptedAnswers).map(str).filter(Boolean) };
      }).filter(function (e) { return e.wrong && e.correct; });
      if (!spans.length) return { error: "誤りの箇所が入っていませんでした。" };
      q.errorSpans = spans;
    } else if (engine === "free_text") {
      var rub = arr(d.rubric).map(function (r, i) {
        return { id: "r" + (i + 1), description: str(r.description || r.criterion), points: isNum(r.points) ? r.points : 0 };
      }).filter(function (r) { return r.description; });
      if (!rub.length) {
        /* 採点基準が無いと AI 採点の根拠を示せない。下敷きを付ける（§10）。 */
        rub = (S.defaultRubric ? (S.defaultRubric(wanted, points) || {}).items : null) || [];
      }
      var sum = rub.reduce(function (a, r) { return a + r.points; }, 0);
      if (sum > 0 && Math.abs(sum - points) > 0.01) q.points = Math.round(sum * 100) / 100;
      q.scoringRubric = rub.length ? { items: rub } : null;
      q.correctAnswer = str(d.modelAnswer);
      if (!q.scoringRubric) return { error: "採点基準を作れませんでした。" };
    } else if (engine === "dictation") {
      q.correctAnswer = str(d.correctAnswer || d.script);
      if (!q.correctAnswer) return { error: "書き取る文が入っていませんでした。" };
    } else if (engine === "flashcard") {
      q.card = { front: str(d.front || d.question), back: str(d.back || d.correctAnswer) };
      if (!q.card.front || !q.card.back) return { error: "カードの表か裏が空でした。" };
      q.prompt = q.card.front;
    } else if (engine === "composite") {
      var kids = arr(d.children).map(function (c) { return fromAi(c, o); })
        .filter(function (c) { return c && !c.error; });
      if (!kids.length) return { error: "小問を 1 つも作れませんでした。" };
      q.children = kids;
      q.points = kids.reduce(function (a, c) { return a + (c.points || 0); }, 0);
      if (!q.context && !q.instruction) return { error: "大問の共通資料が入っていませんでした。" };
    } else {
      return { error: "「" + def.name + "」の作り方が決まっていません。" };
    }

    /* 大問は指示文と資料が本体。カードは表が本体。どちらも問題文は要らない。 */
    if (engine === "composite" && !q.prompt) q.prompt = q.instruction || "次の資料を読んで答えなさい。";
    if (!q.prompt && engine !== "flashcard") return { error: "問題文が空でした。" };
    try {
      var norm = M.normalize(q);
      /* 形式を寄せたことは黙って済ませない。呼び側が記録して人へ伝えられるようにする。 */
      if (converted) { norm.__converted = converted; norm.__conversion = conversion; }
      return norm;
    } catch (e) { return { error: "取り込みに失敗しました。" }; }
  }

  /* まとめて取り込む。捨てたものは理由つきで返す（黙って減らさない）。 */
  function importAll(list, o) {
    o = o || {};
    var out = [], dropped = [], converted = [], flagged = [];
    arr(list).forEach(function (d, i) {
      var r = fromAi(d, o);
      if (!r) { dropped.push({ index: i, reason: "中身が空でした。", raw: shortOf(d) }); return; }
      if (r.error) { dropped.push({ index: i, reason: r.error, raw: shortOf(d) }); return; }
      /* 資料限定のときは、根拠の無い問題を通さない（§15）。 */
      if (o.sourceOnly && !arr(r.sourceReferences).length) {
        dropped.push({ index: i, reason: "資料のどこを根拠にしたか分からないため外しました。", raw: shortOf(d) });
        return;
      }
      /* 形として正しくても、**人が解けない・点をつけられない** ものがある（§20 / §21）。
         並べ替えの正しい順が 2 通りある、組み合わせの相手がいない、
         記述なのに採点の観点が無い、など。ここで止める。
         直せる見込みのあるものは、理由をそのまま返して修復へ回す。 */
      if (VQ2.answerability) {
        try {
          var chk = VQ2.answerability.check(r, { mock: !!o.mock, noAiGrading: !!o.noAiGrading });
          if (!chk.ok) {
            dropped.push({ index: i, reason: chk.reason || "この問題は解けません。",
                           raw: shortOf(d), issues: chk.errors, repairable: true });
            return;
          }
          if (chk.warnings.length) {
            /* 出題はできるが、人が一度見たほうがよいもの。黙って通さない。 */
            r.requiresReview = true;
            flagged.push({ index: i, questionId: r.id,
                           notes: chk.warnings.map(function (w) { return w.message; }) });
          }
        } catch (e) {}
      }
      r.__order = i;
      if (r.__converted) converted.push({ index: i, note: r.__converted, questionId: r.id,
                                          conversion: r.__conversion || null });
      out.push(r);
    });
    return { questions: out, dropped: dropped, converted: converted, flagged: flagged };
  }
  function shortOf(d) {
    return str(isObj(d) ? (d.question || d.prompt || d.front || "") : d).slice(0, 60);
  }

  /* 頼んだ配分と、実際にできたものの差。次に何を頼めばよいかが分かる。 */
  function compare(plan, questions) {
    var got = Object.create(null);
    arr(questions).forEach(function (q) { got[q.type] = (got[q.type] || 0) + 1; });
    var rows = arr(plan && plan.items).map(function (i) {
      return { type: i.type, name: i.name, wanted: i.count, got: got[i.type] || 0 };
    });
    Object.keys(got).forEach(function (t) {
      if (rows.some(function (r) { return r.type === t; })) return;
      rows.push({ type: t, name: Q.label(t), wanted: 0, got: got[t] });
    });
    var short = rows.filter(function (r) { return r.got < r.wanted; });
    return {
      rows: rows,
      shortfall: short,
      ok: short.length === 0,
      summary: short.length
        ? short.map(function (r) { return r.name + " が " + (r.wanted - r.got) + " 問足りません"; }).join("・")
        : "頼んだとおりの内訳でできました。"
    };
  }

  VQ2.qplan = {
    STYLES: STYLES, MIX: MIX, NEEDS: NEEDS, SHAPE: SHAPE, TYPE_ALIAS: TYPE_ALIAS,
    planMix: planMix, promptFor: promptFor,
    hintsFromAttachments: hintsFromAttachments,
    fromAi: fromAi, importAll: importAll, compare: compare,
    normSources: normSources,
    take: take, MAX_TYPES_PER_ROUND: MAX_TYPES_PER_ROUND,
    canonType: canonType
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
