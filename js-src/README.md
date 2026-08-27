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
