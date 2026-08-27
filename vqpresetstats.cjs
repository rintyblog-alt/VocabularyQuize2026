/* ══════════════════════════════════════════════════════════════════════════
   vqpresetstats.cjs — 概要欄と、お気に入り数・閲覧数（2026-08-14）

   依頼:
     ① プリセット詳細に **概要（説明）を綴る欄**を作る
     ② 一覧のカードに **お気に入りされた数・閲覧数**を小さく出す
     ③ ただし **閲覧数は公開した場合のみ**

   作る前に分かっていたこと:
     ・`description` は **もうプリセットの型にあり**、編集画面では編集できた。
       詳細では「あれば表示」だけで、書く欄が無かった。
     ・お気に入りは **端末（localStorage）だけ**。サーバに記録が無く、
       「何人がお気に入りにしたか」は数えようが無かった。
     ・詳細に出ていた「保存された数」は **あとで解く に入れた人数**（saveCount）で、
       名前と中身が食い違っていた。
     ・閲覧数は **どこにも無かった**。

   ここで守りたいこと:
     ・数字の **名前と中身を一致させる**（お気に入り と 保存 を混ぜない）
     ・閲覧数は **公開のときだけ**（非公開は記録もしない・返さない）
     ・**自分で開いても増えない**（自分の数字を自分で盛れない）
     ・**1 日 1 人 1 回**（開き直しで水増しできない）
     ・0 のときは出さない（作りたてのカードが 0 だらけにならない）
   ══════════════════════════════════════════════════════════════════════════ */
const fs = require("fs");
const path = require("path");

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (detail ? "  → " + detail : "")); }
};
const INDEX = require("./vqsrc.cjs").丸ごと();
const WORKER = fs.readFileSync(path.join(__dirname, "server", "src", "worker.js"), "utf8");

console.log("\n① 概要を、詳細で書ける");
{
  ok("書く欄がある", /<textarea class="vq2-pd-desc-in" data-descin/.test(INDEX));
  ok("★ 自分のプリセットのときだけ書ける",
    /var mine = !!\(preset && card && card\.isOwnedByCurrentUser && !card\.isOfficial\);/.test(INDEX));
  ok("　他人・公式のものは これまでどおり読むだけ",
    /if \(!mine\) return '<div class="vq2-card"><div class="vq2-pd-desc">'/.test(INDEX));
  ok("★ 空でも欄を出す（書き始められる）", /if \(!d && !mine\) return "";/.test(INDEX));
  ok("保存する関数がある", /function saveDesc\(text, quiet\)/.test(INDEX));
  ok("★ 打つたびには保存しない（止まって 600ms）", /descTimer = setTimeout\(function \(\) \{ descTimer = null; saveDesc\(v, true\); \}, 600\);/.test(INDEX));
  ok("　欄から離れたときも保存する", /U\.on\(app\.root, "change", "\[data-descin\]"/.test(INDEX));
  ok("　変わっていなければ書かない", /if \(v === String\(preset\.description \|\| ""\)\) return;/.test(INDEX));
  ok("　保存できたかを伝える", /okSave \? \(quiet \? "" : "保存しました"\) : "保存できませんでした"/.test(INDEX));
  ok("　一覧にも反映する", /if \(okSave\) refreshList\(\);/.test(INDEX));
  ok("見た目は mount で足している（SHELL_CSS を触らない）",
    /\.vq2-pd-desc-in\{/.test(INDEX) && !/var SHELL_CSS = "[^"]*vq2-pd-desc-in/.test(INDEX));
}

console.log("\n② お気に入りは サーバに本物を作った");
{
  ok("種類に favorite を足した",
    /return \(v === "later" \|\| v === "review" \|\| v === "favorite"\) \? v : "";/.test(WORKER));
  ok("★ 「保存された数」に お気に入りを混ぜない",
    /COUNT\(DISTINCT CASE WHEN queue_kind <> 'favorite' THEN user_id END\) AS save_count/.test(WORKER));
  ok("★ お気に入りを別に数える",
    /COUNT\(DISTINCT CASE WHEN queue_kind = 'favorite' THEN user_id END\) AS favorite_count/.test(WORKER));
  ok("返す項目に favoriteCount がある", /\n    favoriteCount,\n/.test(WORKER));
  ok("押した直後の数字も同じ分け方",
    /COUNT\(DISTINCT CASE WHEN queue_kind = 'favorite' THEN user_id END\) AS f/.test(WORKER));
  ok("　自分が入れたかも返る", /favorite: viewerQueues\.has\("favorite"\)/.test(WORKER));
}

console.log("\n③ 閲覧数（公開のときだけ）");
{
  ok("表がある", /CREATE TABLE IF NOT EXISTS public_preset_views/.test(WORKER));
  ok("★ 両方の schema 一覧に入っている（片方だけだと全 API が 500 になる）",
    (WORKER.match(/CREATE TABLE IF NOT EXISTS public_preset_views/g) || []).length === 2,
    (WORKER.match(/CREATE TABLE IF NOT EXISTS public_preset_views/g) || []).length + " か所");
  ok("★ 1 日 1 人 1 回（主キーに day が入っている）",
    /PRIMARY KEY \(owner_user_id, preset_id, viewer_key, day\)/.test(WORKER));
  ok("記録する口がある", /async function handlePublicPresetView\(request, env\)/.test(WORKER));
  ok("経路が登録されている", /path === "\/api\/public\/preset-view"/.test(WORKER));
  ok("★ 認証の通り道にも入れてある",
    (WORKER.match(/path === "\/api\/public\/preset-view"/g) || []).length === 2,
    (WORKER.match(/path === "\/api\/public\/preset-view"/g) || []).length + " か所");
  ok("★ 公開されているものだけ数える", /AND public_visibility_state = 'published'/.test(WORKER));
  ok("★ 持ち主が自分で開いても数えない",
    /if \(viewerId && viewerId === ownerUserId\) \{[\s\S]{0,120}reason: "owner"/.test(WORKER));
  /* ★ 実測で踏んだバグ。resolveAuthUser が返すのは uid（id ではない）。
     id を読んでいたため全員が匿名の同じ鍵になり、1 日 1 件しか数えられなかった。 */
  ok("★ 利用者は uid で見ている（id ではない）",
    /const viewerId = Math\.max\(0, Number\(user\?\.uid \|\| 0\)\);/.test(WORKER));
  ok("　誰が見たかは残さない（鍵をかけた値）", /viewerKey = "d:" \+ \(await deviceKeyFrom/.test(WORKER));
  ok("　記録に失敗しても画面を止めない", /\} catch \(e\) \{ counted = false; \}/.test(WORKER));
  ok("★ 非公開なら 0 を返す（念のための二重の歯止め）",
    /const viewCount = isPublished \? Math\.max\(0, Number\(stats\?\.viewMap\?\.get\?\.\(key\) \|\| 0\)\) : 0;/.test(WORKER));
  ok("集計に入っている", /SELECT owner_user_id, preset_id, COUNT\(1\) AS view_count/.test(WORKER));
}

console.log("\n④ 一覧のカードに小さく出す");
{
  ok("カードの型に viewCount がある", /viewCount: null,/.test(INDEX));
  ok("公開の項目から お気に入り数を取る", /if \(isNum\(pub\.favoriteCount\)\) c\.favoriteCount = pub\.favoriteCount;/.test(INDEX));
  ok("　閲覧数も取る", /if \(isNum\(pub\.viewCount\)\) c\.viewCount = pub\.viewCount;/.test(INDEX));
  ok("　自分のカードへも移す", /mineCard\.viewCount = c\.viewCount;/.test(INDEX));
  ok("お気に入り数を出す", /seg\("star", c\.favoriteCount \+ ""\);/.test(INDEX));
  /* ★ 2026-08-15 に **公開しているものは 0 でも出す**へ 変えた
     （0 を 隠すと「まだ 誰も 見ていない」と「壊れて 出ていない」の
       区別が 付かず、実際に「表示されない」と 受け取られた）。
     非公開は これまでどおり 出さない。この検査は 圧縮ずみを 読んでいて
     気づけなかった（2026-08-28）。 */
  ok("★ 閲覧数は 公開のときだけ",
    /if \(published && typeof c\.viewCount === "number"\) \{/.test(INDEX));
  ok("　公開かどうかの見方", /var published = c\.visibility === "public" \|\| c\.kind === "public" \|\| !!c\.publishedAt;/.test(INDEX));
  /* ★ いまの 決まり: **非公開のものは 0 なら 出さない**。
     公開しているものは 0 でも 出す（上の とおり）。 */
  ok("★ 非公開のときは 0 を出さない（0 だらけにしない）",
    /if \(typeof c\.favoriteCount === "number" && \(published \|\| c\.favoriteCount > 0\)\)/.test(INDEX)
    && !/if \(typeof c\.viewCount === "number"\) \{/.test(INDEX));
  /* ★ ms() は Material Symbols の名前。存在しない名前だと絵ではなく文字が出る。 */
  ok("★ 目のアイコンは visibility（eye は Material Symbols に無い）",
    /seg\("visibility", c\.viewCount \+ ""\);/.test(INDEX) && !/seg\("eye"/.test(INDEX));
  ok("　visibility は本体で使用実績がある", (INDEX.match(/>visibility</g) || []).length >= 3);
}

console.log("\n⑤ 詳細の項目も、名前と中身をそろえた");
{
  ok("「保存された数」をやめた", INDEX.indexOf('row("保存された数"') < 0);
  ok("お気に入りされた数 を出す", /row\("お気に入りされた数", card\.favoriteCount \+ " 件"\);/.test(INDEX));
  ok("見られた数 を出す", /row\("見られた数", card\.viewCount \+ " 件"\);/.test(INDEX));
  ok("★ 見られた数は 公開のときだけ",
    /card\.viewCount\n\s*&& \(card\.visibility === "public" \|\| card\.kind === "public" \|\| card\.publishedAt\)/.test(INDEX));
  ok("　項目に絵が付く", /"お気に入りされた数": "star", "見られた数": "eye",/.test(INDEX));
}

console.log("\n⑥ 画面からサーバへ送る結線");
{
  /* ── 橋渡しの口 ── */
  ok("橋渡しに stats がある", /        stats: \{/.test(INDEX));
  ok("　お気に入りを送る口", /async favorite\(ownerUserId, presetId, on\)\{/.test(INDEX));
  ok("　閲覧を送る口", /async view\(ownerUserId, presetId\)\{/.test(INDEX));
  ok("★ 失敗しても画面を止めない（どちらも catch で null）",
    (INDEX.match(/\}catch\(err\)\{ return null; \}/g) || []).length >= 2);
  ok("　お気に入りはログインしていないと送らない",
    /if \(!_appIsLoggedUser\(\)\) return null;/.test(INDEX));
  ok("サーバの口に favorite を通した",
    /if \(queueKind !== "later" && queueKind !== "review" && queueKind !== "favorite"\) return;/.test(INDEX));

  /* ── お気に入り ── */
  ok("お気に入りはカードも受け取る", /function toggleFavorite\(id, card\) \{/.test(INDEX));
  ok("★ 端末の一覧（localStorage）は これまでどおり先に書く",
    /writeListSafe\(FAV_KEY, l\);\n    var on = l\.indexOf\(str\(id\)\) >= 0;/.test(INDEX));
  ok("★ 送るのは 公開プリセットのときだけ",
    /var isPublic = !!\(card && \(card\.kind === "public" \|\| card\.visibility === "public"\)\);/.test(INDEX));
  ok("　持ち主が分からなければ送らない", /if \(app && app\.stats && app\.stats\.favorite && owner && isPublic\)/.test(INDEX));
  ok("★ id は「持ち主:プリセットid」から後ろだけを渡す",
    /function presetIdOf\(card\) \{/.test(INDEX)
    && /return at > 0 \? raw\.slice\(at \+ 1\) : raw;/.test(INDEX));
  ok("一覧の★から渡している", /toggleFav\(d\.fav, cardById\(d\.fav\)\);/.test(INDEX));
  ok("詳細の★からも渡している", /L\(\)\.toggleFavorite\(card\.id, card\);/.test(INDEX));

  /* ── 閲覧 ── */
  ok("詳細を開いたときに送る", /pingView\(card\);\n    render\(\);/.test(INDEX));
  ok("★ render の中では送らない（描き直すたびに送らない）",
    /pingView\(card\);\n    render\(\);/.test(INDEX)
    && !/function render\(\) \{[\s\S]{0,200}pingView\(/.test(INDEX));
  ok("　公開プリセットのときだけ送る",
    /if \(!c \|\| !\(c\.kind === "public" \|\| c\.visibility === "public"\)\) return;/.test(INDEX));
  ok("　持ち主が分からなければ送らない", /if \(!owner\) return;/.test(INDEX));
  ok("★ 数えるかどうかは サーバが決める（画面では判断しない）",
    /数えるかどうかは \*\*サーバが決める\*\*/.test(INDEX));
  ok("　落ちない", /A\.stats\.view\(owner, at > 0 \? raw\.slice\(at \+ 1\) : raw\);\n      \} catch \(e\) \{\}/.test(INDEX));
}

console.log("\n⑦ 壊していないこと");
{
  ok("あとで解く / 復習リスト は残っている",
    /later: viewerQueues\.has\("later"\)/.test(WORKER) && /review: viewerQueues\.has\("review"\)/.test(WORKER));
  ok("saveCount も返し続けている", /\n    saveCount,\n/.test(WORKER));
  ok("お気に入りが無ければ これまでどおり保存数で代用",
    /else if \(isNum\(pub\.saveCount\) && pub\.saveCount\) c\.favoriteCount = pub\.saveCount;/.test(INDEX));
  /* 引数にカードを足したので名前は変わったが、**端末側の動きは同じ**。
     localStorage へ書くところが残っていることを見る（送信は付け足し）。 */
  ok("端末のお気に入り（localStorage）は残っている",
    /function toggleFavorite\(id, card\) \{/.test(INDEX)
    && /writeListSafe\(FAV_KEY, l\);/.test(INDEX));
  ok("★ サーバへ送れなくても 端末の★は付く（順番が大事）",
    INDEX.indexOf("writeListSafe(FAV_KEY, l);") < INDEX.indexOf("app.stats.favorite(owner"));
  ok("公開プリセットの一覧の口は変えていない", /path === "\/api\/public\/preset-queue"/.test(WORKER));
}

console.log("\n" + (fail === 0 ? "✅ 全部通りました" : "❌ 落ちています") + "  通過 " + pass + " / 失敗 " + fail);
process.exit(fail === 0 ? 0 : 1);
