# js-src — 圧縮前のソース

`client/js/*.js` は **esbuild で圧縮したもの**。直接編集しないこと
（読めないうえ、次の圧縮で上書きされる）。

直すときは **ここのファイルを直す** → 圧縮して置き換える → 指紋を付け直す:

```bash
# 例: vq-live を直したとき
F=js-src/vq-live.9628a32d29.js
node --check "$F"
npx esbuild "$F" --minify --target=es2020 --outfile=/tmp/x.js
現=$(grep -o '/js/vq-live\.[0-9a-f]*\.js' client/index.html | head -1 | sed 's|/js/||')
cp /tmp/x.js "client/js/$現"
node vqrehash.cjs          # 指紋を付け直し、index.html の参照も直す
```

**vqrehash.cjs を忘れないこと。** 名前を変えないと 1 年キャッシュのせいで
直したものが誰にも届かない。

ファイル名の指紋は「圧縮前のもの」なので `client/js/` 側とは一致しない。
対応は名前の頭（vq-live / vq-core …）で見る。

---

## ★ vq2-app は **ここが正**（2026-08-30 に気づいた）

`vq2-app.*.js`（プリセット作成・出題・Quick Mock・Workplace）は、
もともと `client/v2/**` を `client/v2/build-v2.mjs` でつないで作っていた。
**その作りかたは 2026-08-18 で止まっている。**

いま配っているのは **この js-src のファイル**で、8/19 以降はここを直に編集している。
実測（2026-08-30）:

| | 大きさ |
|---|---|
| `client/v2/**` を全部つないだもの | 3,026,844 文字 |
| 配っている `js-src/vq2-app.*.js` | 4,066,093 文字 |
| **差** | **1,039,249 文字ぶん client/v2 が足りない** |

つまり `node client/v2/build-v2.mjs` を走らせると、
**8/19 以降の作業がまるごと消える**（消えたことは画面を開くまで分からない）。

→ `build-v2.mjs` の先頭に**関門**を置いた。食い違いが大きいと止まる。
　どうしても走らせるときだけ `VQ2_ALLOW_STALE_BUILD=1`。

**新しい機能は vq2-app に足さないこと。**
`vq-call.js` / `vq-dm.js` のように**自分のファイル**を作り、
`client/index.html` に `<script id="vq-○○" src="/js/vq-○○.<指紋>.js">` を足す
（`_headers` は `/js/*` の総括なので変更不要）。
