/* ══════════════════════════════════════════════════════════════════════
   Vocabu Workplace — サーバ側の通し確認（開発環境のみ）

   ・localStorage ではなく **サーバへ本当に入るか** を見る。
   ・競合検出・権限・公開フォームの受付までを実際の HTTP で確かめる。
   ・本番へは一切触れない（BASE は dev 固定。上書きするときも自分で指定する）。

   使い方: node vqwpapi.cjs
   ══════════════════════════════════════════════════════════════════════ */
const BASE = process.env.VQ_API || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (/vocabuquiz-api\.rintyblog|vocabuquiz\.app/.test(BASE)) {
  console.error("本番の URL では実行しません。");
  process.exit(2);
}

let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log("  ok   " + n))
  : (fail++, console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 240) : ""))); };
const section = (t) => console.log("\n══ " + t + " ══");

async function api(method, path, body, token) {
  const h = { "Content-Type": "application/json" };
  if (token) h.Authorization = "Bearer " + token;
  const r = await fetch(BASE + path, { method, headers: h,
    body: body === undefined ? undefined : JSON.stringify(body) });
  let data = null;
  const txt = await r.text();
  try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = { raw: txt.slice(0, 200) }; }
  return { status: r.status, data };
}
async function makeUser(tag) {
  const nick = "wp" + tag + Date.now().toString(36).slice(-6);
  const r = await api("POST", "/api/auth/register", {
    gradePrefix: "H1", nickname: nick, password: "WpTest#2026ab",
    tosAccepted: true, tosVersion: "1"
  });
  if (!r.data || !r.data.token) throw new Error("テスト用アカウントを作れませんでした: " + JSON.stringify(r.data).slice(0, 200));
  return { token: r.data.token, nick, uid: r.data.user && r.data.user.id };
}

(async () => {
  console.log("接続先: " + BASE + "（開発環境）");
  const A = await makeUser("a");
  const B = await makeUser("b");
  console.log("検証用アカウント: " + A.nick + " / " + B.nick);

  let docId = null, formId = null, publicId = null;

  section("作る・保存する・開き直す");
  {
    const c = await api("POST", "/api/workplace/items", {
      itemType: "document", title: "サーバ検証ドキュメント",
      content: { schemaVersion: 1, content: { blocks: [{ id: "b1", type: "heading1", text: "最初の見出し" }] } },
      preview: { kind: "document", lines: [{ k: "heading1", t: "最初の見出し" }], chars: 6 }
    }, A.token);
    ok("作れる", c.status === 200 && c.data.item, c);
    docId = c.data.item && c.data.item.id;

    const g = await api("GET", "/api/workplace/item?id=" + docId, undefined, A.token);
    ok("開ける", g.status === 200, g.status);
    ok("本文がそのまま返る",
      g.data.content && g.data.content.content.blocks[0].text === "最初の見出し", g.data.content);
    ok("持ち主として返る", g.data.role === "owner", g.data.role);

    const s = await api("PUT", "/api/workplace/item", {
      id: docId, baseVersion: g.data.item.currentVersion, title: "書き直した題名",
      content: { schemaVersion: 1, content: { blocks: [
        { id: "b1", type: "heading1", text: "最初の見出し" },
        { id: "b2", type: "paragraph", text: "追記した本文" }] } },
      snapshot: true, versionLabel: "手動保存"
    }, A.token);
    ok("保存できる", s.status === 200 && s.data.ok, s);
    ok("版が 1 つ進む", s.data.version === g.data.item.currentVersion + 1, s.data.version);

    const g2 = await api("GET", "/api/workplace/item?id=" + docId, undefined, A.token);
    ok("保存した内容が返ってくる", g2.data.content.content.blocks.length === 2, g2.data.content);
    ok("題名も変わっている", g2.data.item.title === "書き直した題名", g2.data.item.title);
  }

  section("古い内容で新しい内容を潰さない（競合検出 §10）");
  {
    const stale = await api("PUT", "/api/workplace/item", {
      id: docId, baseVersion: 1,
      content: { schemaVersion: 1, content: { blocks: [{ id: "x", type: "paragraph", text: "古い端末からの上書き" }] } }
    }, A.token);
    ok("409 で止まる", stale.status === 409 && stale.data.code === "CONFLICT", stale.status);
    ok("サーバー側の内容を返してくれる（選ばせるため）",
      stale.data.content && stale.data.content.content.blocks.length === 2, stale.data.content);

    const g = await api("GET", "/api/workplace/item?id=" + docId, undefined, A.token);
    ok("上書きされていない", g.data.content.content.blocks.length === 2, g.data.content);
  }

  section("版の記録と取り出し（§11）");
  {
    const v = await api("GET", "/api/workplace/versions?id=" + docId, undefined, A.token);
    ok("版の一覧が取れる", v.status === 200 && (v.data.versions || []).length >= 1, v.data);
    const one = (v.data.versions || [])[0];
    if (one) {
      const vc = await api("GET", "/api/workplace/versions?id=" + docId + "&version=" + one.version,
        undefined, A.token);
      ok("その版の中身が取れる", vc.status === 200 && vc.data.content, vc.data);
      ok("版に名前が付いている", one.label === "手動保存", one.label);
    }
  }

  section("他人のものは見えない（§26）");
  {
    const g = await api("GET", "/api/workplace/item?id=" + docId, undefined, B.token);
    ok("別アカウントからは 403", g.status === 403, g.status);
    const s = await api("PUT", "/api/workplace/item", { id: docId, title: "乗っ取り" }, B.token);
    ok("別アカウントからは保存できない", s.status === 403, s.status);
    const l = await api("GET", "/api/workplace/items", undefined, B.token);
    ok("別アカウントの一覧には出てこない",
      (l.data.items || []).every((i) => i.id !== docId), (l.data.items || []).length);
    const n = await api("GET", "/api/workplace/items");
    ok("未ログインでは一覧が取れない", n.status === 401, n.status);
  }

  section("フォームを公開して、実際に回答を受け取る（§16）");
  {
    const f = await api("POST", "/api/workplace/items", {
      itemType: "form", title: "サーバ検証アンケート",
      content: { schemaVersion: 1, content: {
        sections: [{ id: "s1", title: "", description: "", fields: [
          { id: "q1", type: "single_choice", label: "満足度", required: true,
            options: [{ id: "o1", text: "良い" }, { id: "o2", text: "ふつう" }, { id: "o3", text: "悪い" }] },
          { id: "q2", type: "long_text", label: "自由記述", required: false, options: [] }
        ] }],
        theme: { accent: "#7b3fe4", progress: true },
        settings: { accepting: true, anonymous: true, requireLogin: false, onePerDevice: false,
          onePerPerson: false, responseLimit: 0, confirmMessage: "ありがとうございました。",
          showQuestionNumber: true, graded: false },
        logic: []
      } }
    }, A.token);
    formId = f.data.item && f.data.item.id;
    ok("フォームを作れる", f.status === 200 && formId, f);

    const before = await api("GET", "/api/workplace/form/public?publicId=" + (f.data.item.publicId || "none"));
    ok("公開する前は回答ページが開かない", before.status === 404 || before.status === 403, before.status);

    const p = await api("POST", "/api/workplace/item/meta", { id: formId, visibility: "link" }, A.token);
    ok("公開に切り替えられる", p.status === 200 && p.data.item.visibility === "link", p.data.item);
    publicId = p.data.item && p.data.item.publicId;
    ok("公開 ID が発行される（編集 URL とは別）", !!publicId && publicId.length >= 12, publicId);

    const pub = await api("GET", "/api/workplace/form/public?publicId=" + publicId);
    ok("未ログインで回答ページの中身が取れる", pub.status === 200 && pub.data.form, pub.status);
    ok("質問が 2 問返る", (pub.data.form.sections[0].fields || []).length === 2, pub.data.form.sections);
    ok("持ち主の情報は返さない", pub.data.form.ownerId === undefined && pub.data.form.user_id === undefined);

    const bad = await api("POST", "/api/workplace/form/respond", { publicId, answers: {} });
    ok("必須が空なら 400 で止まる（画面だけに任せない）",
      bad.status === 400 && bad.data.code === "REQUIRED", bad.data);
    ok("どの質問が足りないかを返す", (bad.data.missing || []).indexOf("q1") >= 0, bad.data.missing);

    const good = await api("POST", "/api/workplace/form/respond", {
      publicId, answers: { q1: "0", q2: "とても使いやすいです" }, deviceKey: "test-device-1", durationMs: 12000
    });
    ok("未ログインでも回答を送れる", good.status === 200 && good.data.ok, good);
    ok("送信後のメッセージが返る", good.data.message === "ありがとうございました。", good.data.message);

    const good2 = await api("POST", "/api/workplace/form/respond", {
      publicId, answers: { q1: "1" }, deviceKey: "test-device-2", durationMs: 8000
    });
    ok("2 件目も受け取る", good2.status === 200, good2.status);

    const r = await api("GET", "/api/workplace/form/responses?id=" + formId, undefined, A.token);
    ok("持ち主は回答を読める", r.status === 200 && r.data.total === 2, r.data);
    ok("回答の中身が入っている",
      (r.data.responses || []).some((x) => x.answers.q2 === "とても使いやすいです"), r.data.responses);
    ok("所要時間も記録されている",
      (r.data.responses || []).some((x) => x.meta && x.meta.durationMs === 12000));

    const other = await api("GET", "/api/workplace/form/responses?id=" + formId, undefined, B.token);
    ok("他人は回答を読めない", other.status === 403, other.status);
    const anon = await api("GET", "/api/workplace/form/responses?id=" + formId);
    ok("未ログインは回答を読めない", anon.status === 401, anon.status);

    /* 回答者は編集できない（§22） */
    const edit = await api("PUT", "/api/workplace/item", { id: formId, title: "回答者による改変" });
    ok("回答者（未ログイン）はフォームを編集できない", edit.status === 401, edit.status);
  }

  section("受付の停止と上限をサーバで守る");
  {
    const g = await api("GET", "/api/workplace/item?id=" + formId, undefined, A.token);
    const body = g.data.content.content;
    body.settings.accepting = false;
    const s = await api("PUT", "/api/workplace/item", {
      id: formId, baseVersion: g.data.item.currentVersion,
      content: { schemaVersion: 1, content: body }
    }, A.token);
    ok("受付を止める設定を保存できる", s.status === 200, s.status);

    const p = await api("GET", "/api/workplace/form/public?publicId=" + publicId);
    ok("回答ページに「受け付けていない」と出る", /受け付けていません/.test(p.data.closed || ""), p.data.closed);
    const tryPost = await api("POST", "/api/workplace/form/respond", { publicId, answers: { q1: "0" } });
    ok("止めているあいだは送信を弾く", tryPost.status === 403 && tryPost.data.code === "CLOSED", tryPost.data);
  }

  section("回答の除外と削除");
  {
    const r = await api("GET", "/api/workplace/form/responses?id=" + formId, undefined, A.token);
    const first = r.data.responses[0];
    const ex = await api("POST", "/api/workplace/form/response",
      { responseId: first.id, action: "exclude" }, A.token);
    ok("回答を除外できる", ex.status === 200 && ex.data.excluded === true, ex.data);
    const other = await api("POST", "/api/workplace/form/response",
      { responseId: first.id, action: "delete" }, B.token);
    ok("他人は回答を消せない", other.status === 403, other.status);
    const del = await api("POST", "/api/workplace/form/response",
      { responseId: first.id, action: "delete" }, A.token);
    ok("持ち主は回答を消せる", del.status === 200 && del.data.deleted, del.data);
    const after = await api("GET", "/api/workplace/form/responses?id=" + formId, undefined, A.token);
    ok("消したぶん減っている", after.data.total === 1, after.data.total);
  }

  section("ゴミ箱と完全削除");
  {
    const t = await api("POST", "/api/workplace/item/meta", { id: docId, action: "trash" }, A.token);
    ok("ゴミ箱へ移せる", t.status === 200 && t.data.item.status === "trashed", t.data.item);
    const l = await api("GET", "/api/workplace/items?status=active", undefined, A.token);
    ok("通常の一覧から消える", (l.data.items || []).every((i) => i.id !== docId));
    const lt = await api("GET", "/api/workplace/items?status=trashed", undefined, A.token);
    ok("ゴミ箱の一覧には出る", (lt.data.items || []).some((i) => i.id === docId));
    const rs = await api("POST", "/api/workplace/item/meta", { id: docId, action: "restore" }, A.token);
    ok("元へ戻せる", rs.status === 200 && rs.data.item.status === "active", rs.data.item);

    const pg = await api("POST", "/api/workplace/item/meta", { id: docId, action: "purge" }, A.token);
    ok("完全に削除できる", pg.status === 200 && pg.data.purged, pg.data);
    const gone = await api("GET", "/api/workplace/item?id=" + docId, undefined, A.token);
    ok("削除後は開けない", gone.status === 404, gone.status);
    const v = await api("GET", "/api/workplace/versions?id=" + docId, undefined, A.token);
    ok("版もいっしょに消えている", (v.data.versions || []).length === 0, v.data);
  }

  section("大きすぎる内容は保存しない");
  {
    const big = "あ".repeat(1200000);
    const c = await api("POST", "/api/workplace/items", {
      itemType: "document", title: "でかい",
      content: { schemaVersion: 1, content: { blocks: [{ id: "b", type: "paragraph", text: big }] } }
    }, A.token);
    ok("3MB を超えると 413 で断る", c.status === 413, c.status);
  }

  section("後始末（検証用データを消す）");
  {
    const l = await api("GET", "/api/workplace/items", undefined, A.token);
    let n = 0;
    for (const it of (l.data.items || [])) {
      const r = await api("POST", "/api/workplace/item/meta", { id: it.id, action: "purge" }, A.token);
      if (r.status === 200) n++;
    }
    const lt = await api("GET", "/api/workplace/items?status=trashed", undefined, A.token);
    for (const it of (lt.data.items || [])) {
      await api("POST", "/api/workplace/item/meta", { id: it.id, action: "purge" }, A.token);
    }
    console.log("  検証用に作った " + n + " 件を消しました。");
    const after = await api("GET", "/api/workplace/items", undefined, A.token);
    ok("検証用データが残っていない", (after.data.items || []).length === 0, after.data.items);
  }

  console.log("\n══ まとめ ══");
  console.log("  合格 " + pass + " / 不合格 " + fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("実行できませんでした:", e); process.exit(2); });
