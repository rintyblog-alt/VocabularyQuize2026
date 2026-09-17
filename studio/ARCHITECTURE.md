# VQ Studio — ブラウザ動画編集ソフト（設計契約書）

CapCut / Premiere / DaVinci 級の機能を **100% クライアント側**（静的配信・ビルド無し・
ES modules・外部依存ゼロ）で実装する。iPhone Safari と Android Chrome でも触れること。

> **この文書は仕様ではなく「契約」である。** 各モジュールは ここに書かれた関数名・
> 引数・返り値・不変条件だけを頼りに書かれる。勝手に変えると隣が壊れる。
> 変えたいときは この文書を直し、**依存する側の担当にも伝わる形**にする。

---

## 0. 置き場所と読み込み

```
studio/
  index.html          … 画面の骨組み（DOM の id は §7 で固定）
  selftest.html       … ブラウザ内自己診断（各モジュールの smoke）
  styles/*.css        … design token → layout → 各部
  src/main.js         … 起動（唯一の entry, <script type="module">）
  src/core/*          … 状態・操作・時間・保存（DOM を触らない）
  src/engine/*        … 合成・再生・音（DOM/WebGL を触る。UI は触らない）
  src/export/*        … 書き出し（muxer 含む）
  src/analysis/*      … 素材解析（シーン/動き/音量/ビート/追跡）
  src/ai/*            … 自動編集の頭（LLM + 無料の決定論）
  src/ui/*            … 画面（core/engine を呼ぶ。逆向きの依存は禁止）
  src/workers/*       … Worker（classic ではなく module worker）
  tests/*.test.mjs    … node --test で回る純ロジックの試験
```

**依存の向き（破ったら差し戻し）**
`ui → ai → analysis → engine/export → core`。core は誰にも依存しない。
engine は ui を import しない。どの層も `window.*` に副作用を置かない
（唯一の例外: `window.VQSTUDIO` にデバッグ用の参照を 1 つだけ置く）。

**書き方**
- ES modules / `export function` / JSDoc で型を書く（TypeScript 構文は使わない）。
- ファイル頭に「何をする所か・なぜこうしたか」の日本語の見出しコメント（既存 repo の作法）。
- 1 ファイル 700 行を超えたら分ける。
- `console.log` は残さない（`log()` は `core/log.js` 経由）。

---

## 1. データ構造（保存形式 = 唯一の真実）

秒は **浮動小数の秒**。フレームは `settings.fps` で丸める（`core/time.js`）。
id は `core/util.js` の `uid(prefix)`。**全ての編集は core/ops.js 経由**。

```js
/** @typedef {Object} Project */
const Project = {
  schema: 3,
  id: "prj_xxx", name: "無題のプロジェクト",
  createdAt: 0, updatedAt: 0,
  settings: {
    width: 1920, height: 1080, fps: 30, ratio: "16:9",
    sampleRate: 48000,
    background: { type: "color"|"blur"|"image", color: "#000000", assetId: null, blur: 40 },
    snap: true, magnet: true, showSafeArea: false,
    previewQuality: "auto"|"full"|"half"|"quarter",
    audio: { master: 1, limiter: true }
  },
  assets: [Asset],          // 素材（順不同）
  tracks: [Track],          // 下が V1、配列の後ろが上のレイヤー（描画順）
  markers: [Marker],
  chapters: [Chapter],
  subtitleStyle: TextStyle, // 字幕の既定
  meta: { aiHistory: [AiTurn] }
};

const Asset = {
  id: "as_xxx", kind: "video"|"image"|"audio", name: "IMG_0001.MOV",
  mime: "video/quicktime", size: 12345678,
  duration: 12.34,           // image は Infinity ではなく 0（尺は clip 側が決める）
  width: 1920, height: 1080, fps: 29.97, hasAudio: true, rotation: 0,
  storage: { kind: "idb", key: "blob_xxx" },   // 実体は core/persist.js が持つ
  createdAt: 0,
  /** 解析結果（無くても動く。analysis/* が後から埋める） */
  analysis: null | {
    version: 1,
    scenes:   [{ start, end, score }],        // ショット境界
    motion:   { hz: 2, values: [0..1] },      // 動きの強さ（等間隔サンプル）
    sharp:    { hz: 2, values: [0..1] },      // ピント
    bright:   { hz: 2, values: [0..1] },
    sat:      { hz: 2, values: [0..1] },
    faces:    [{ t, boxes: [[x,y,w,h]] }] | null,
    loudness: { hz: 20, values: [-70..0] },   // dBFS 相当
    silence:  [{ start, end }],
    speech:   [{ start, end, conf }] | null,
    beats:    null | { bpm, offset, times: [..], downbeats: [..], conf },
    highlights: [{ start, end, score, why }]
  }
};

const Track = {
  id: "tr_xxx",
  kind: "video"|"audio"|"overlay"|"adjust", // overlay=文字/図形/PiP, adjust=調整レイヤー
  name: "V1", height: 72,
  muted: false, locked: false, hidden: false, solo: false,
  volume: 1, pan: 0, fx: [FxInstance],       // トラック単位の効果（音/映像）
  clips: [Clip]                              // start 昇順・重なり無し（不変条件）
};

const Clip = {
  id: "cl_xxx", name: "", assetId: "as_xxx"|null,
  kind: "video"|"image"|"audio"|"text"|"shape"|"adjust"|"compound",
  start: 0, duration: 4,      // タイムライン上の秒（duration>=MIN_CLIP=0.04）
  in: 0, out: 4,              // 素材側の秒（video/audio のみ。image/text は無視）
  speed: 1, reverse: false,
  speedRamp: null | [{ t: 0, v: 1 }],   // t は clip ローカル秒、v は倍率（区分線形）
  volume: 1, muteAudio: false,
  audioFade: { in: 0, out: 0, curve: "linear"|"exp"|"log" },
  opacity: 1, blend: "normal"|"add"|"screen"|"multiply"|"overlay"|"softlight"|"difference"|"lighten"|"darken",
  transform: { x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, rotate: 0,
               anchorX: .5, anchorY: .5, flipH: false, flipV: false,
               crop: { l: 0, t: 0, r: 0, b: 0 } },   // 0..1 の割合
  mask: null | { type: "rect"|"ellipse"|"polygon"|"linear"|"radial",
                 x: .5, y: .5, w: .5, h: .5, rotate: 0, points: [[x,y]],
                 feather: 0, invert: false, expand: 0 },
  chroma: null | { key: [0,1,0], similarity: .4, smoothness: .1, spill: .2, enabled: true },
  color: null | ColorGrade,
  fx: [FxInstance],
  transitionIn:  null | { type: "crossfade", duration: .5, params: {} },
  transitionOut: null | { type: "crossfade", duration: .5, params: {} },
  text: null | TextSpec,       // kind:"text" のとき必須
  shape: null | ShapeSpec,     // kind:"shape"
  compound: null | { tracks: [Track] },  // kind:"compound"（入れ子。深さ 2 まで）
  keys: { "transform.scale": [Keyframe] },  // §2
  stabilize: null | { amount: 0..1, baked: false },
  label: "#4f8cff", groupId: null, locked: false, hidden: false,
  linkedId: null,              // 映像と音を分離したときの相棒
  source: null | { by: "ai", planId, note }  // 自動編集が作ったものの印
};

const ColorGrade = {
  exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0,
  highlights: 0, shadows: 0, whites: 0, blacks: 0, vibrance: 0, hue: 0,
  sharpen: 0, denoise: 0, vignette: 0, grain: 0, fade: 0,
  curves: { rgb: [[0,0],[1,1]], r: null, g: null, b: null, luma: null },
  wheels: { lift: [0,0,0], gamma: [0,0,0], gain: [0,0,0], offset: [0,0,0] },
  hsl: [ { hue: 0, range: 30, h: 0, s: 0, l: 0 } ],   // HSL 個別調整（最大 6）
  lut: null | { id: "lut_xxx", amount: 1 }
};

const FxInstance = { id: "fx_xxx", type: "glitch", enabled: true, params: { amount: .5 } };

const TextSpec = {
  content: "テキスト",
  style: TextStyle,
  layout: { align: "center", vAlign: "middle", maxWidth: .8, lineHeight: 1.25, letterSpacing: 0 },
  anim: { in: { type: "fadeUp", duration: .4 }, out: { type: "fade", duration: .3 },
          loop: { type: "none", speed: 1 }, unit: "all"|"char"|"word"|"line" }
};
const TextStyle = {
  font: "system", size: 64, weight: 700, italic: false,
  color: "#ffffff", gradient: null | { from, to, angle },
  stroke: { width: 0, color: "#000" }, shadow: { x: 0, y: 4, blur: 8, color: "#0008" },
  glow: { blur: 0, color: "#fff" },
  bg: null | { color: "#000a", pad: 16, radius: 12 },
  ruby: null
};
const ShapeSpec = { type: "rect"|"ellipse"|"triangle"|"arrow"|"line"|"star",
                    fill: "#fff", stroke: { width: 0, color: "#000" }, radius: 0, w: .3, h: .2 };
const Marker = { id, t, name, color, note };
const Chapter = { id, t, title };
```

**不変条件（`core/schema.js` の `validate()` が見る）**
1. 同一トラック内の clip は `start` 昇順、`start+duration` が次の `start` を超えない。
2. `duration >= MIN_CLIP(0.04)`, `in >= 0`, `out <= asset.duration + 1e-3`, `out > in`。
3. `transitionIn/Out.duration <= 隣接 clip との重なりに使える長さ`（足りなければ縮める）。
4. `keys` の各配列は `t` 昇順・重複 t なし。
5. `assetId` は `assets` に在る。無ければ clip を `kind:"shape"`（灰色）に落として警告。

---

## 2. キーフレーム

```js
const Keyframe = { t: 0.5, v: 1.2, ease: "linear"|"in"|"out"|"inout"|"hold"|"bezier",
                   bez: [.25,.1,.25,1] };  // ease:"bezier" のとき
```
- `t` は **clip ローカル秒**（speed 適用後のタイムライン尺の中）。
- 対応する property path（文字列）:
  `opacity`, `volume`, `pan`,
  `transform.x|y|scale|scaleX|scaleY|rotate`,
  `color.<ColorGrade の数値キー>`,
  `mask.x|y|w|h|rotate|feather`,
  `chroma.similarity|smoothness|spill`,
  `fx.<fxId>.<paramKey>`,
  `text.style.size`, `text.style.color`（色は 16 進の補間）。
- 値の型は数値または `#rrggbb`。配列（wheels 等）は `color.wheels.lift.0` の形。

`core/eval.js` が唯一の評価器:
```js
resolveClip(clip, timelineTime, { fps }) -> Resolved | null
//   null = その時刻に見えない
Resolved = { clip, localTime, sourceTime, visible,
             opacity, blend, transform, color, mask, chroma, fx, volume, pan, text, shape,
             transition: null | { role:"in"|"out", type, p /*0..1*/, params, otherClipId } }

sampleKey(keys, path, localTime, fallback) -> number|string
sourceTimeAt(clip, localTime) -> number         // speedRamp/reverse/in を織り込む
buildSpeedMap(clip) -> { totalSource, at(localTime), inverse(sourceTime) }
clipsAt(project, t) -> Resolved[]               // 描画順（下→上）
audioAt(project, t) -> Resolved[]               // 音を持つもの
```
速度ランプは `v(t)` を区分線形として `∫v dt` を累積和で持つ（`at()` は二分探索、
`inverse()` はその逆）。`speed` は `speedRamp` が無いときの定数として扱う。

---

## 3. core の API

### core/store.js
```js
createStore(project) -> Store
Store = {
  get project(),                      // 直接書き換え禁止（凍結はしないが触るな）
  get selection(),                    // { clipIds: string[], trackId, keyframe: {clipId,path,index}|null }
  get view(),                         // { playhead, zoom, scrollX, inPoint, outPoint, tool }
  subscribe(fn) -> unsubscribe,       // fn({ kind:"project"|"selection"|"view", op, detail })
  dispatch(type, payload) -> any,     // §4 の op を 1 つ（= undo 1 単位）
  batch(label, fn) -> any,            // fn(dispatchLocal) をまとめて 1 undo 単位に
  undo(), redo(), canUndo(), canRedo(), history(),   // history() = [{label, at}]
  select(clipIds, { additive, trackId }), selectKeyframe(ref|null),
  setView(partial),                   // undo に積まない
  snapshot() -> Project (deep clone), replace(project, label)
}
```
履歴は **スナップショット方式**（project の deep clone, 上限 120, 同種の連続操作は
120ms 以内なら合体）。素材の実体は store に入れない（`persist` が持つ）。

### core/ops.js
```js
OPS = { "<type>": (draft, payload, ctx) => result }   // draft を直に書き換える純関数
```
最低限これだけは在ること（UI/AI が名前で呼ぶ）:
`asset.add asset.remove asset.update
 track.add track.remove track.update track.reorder
 clip.add clip.remove clip.update clip.move clip.trim clip.split clip.duplicate
 clip.rippleDelete clip.slip clip.roll clip.reorder clip.group clip.ungroup
 clip.detachAudio clip.link clip.setSpeed clip.setSpeedRamp clip.freeze clip.reverse
 clip.setTransform clip.setColor clip.setMask clip.setChroma clip.setText clip.setShape
 clip.addFx clip.removeFx clip.updateFx clip.reorderFx
 clip.setTransition clip.removeTransition
 key.add key.remove key.update key.moveAll
 marker.add marker.remove marker.update chapter.add chapter.remove
 settings.update subtitle.import project.rename
 timeline.paste timeline.insert timeline.overwrite timeline.magneticClose
 compound.make compound.enter compound.flatten`

規約: op は `draft`（project の clone）を書き換えるだけ。DOM も async も禁止。
不正な payload は `throw new OpError(msg)`（UI が toast で出す）。

### core/time.js
`snapFrame(t,fps) toTC(t,fps,{compact}) fromTC(str,fps) frameDur(fps) clampRange()`

### core/util.js
`uid(p) clamp lerp inverseLerp deepClone(obj) throttle debounce rafThrottle
 formatBytes formatDuration hexToRgb rgbToHex easeFns groupBy once`

### core/persist.js（IndexedDB + OPFS）
```js
openStorage() -> Storage
Storage = {
  putAsset(file|blob, meta) -> { key },  getAssetBlob(key) -> Blob,
  getAssetURL(key) -> string /* objectURL（キャッシュ・参照数管理） */, releaseAssetURL(key),
  putProject(project), listProjects(), loadProject(id), deleteProject(id),
  putProxy(assetId, blob), getProxyURL(assetId),
  putThumbSheet(assetId, blob|ImageBitmap[]), getThumbSheet(assetId),
  putPeaks(assetId, Float32Array), getPeaks(assetId),
  estimate() -> { usage, quota }, requestPersist()
}
```
自動保存は `ui/app.js` が 3 秒 debounce で `putProject`。

### core/log.js
`log(tag, ...args) warn(tag,...) error(tag,...) time(tag)` — `?debug=1` のときだけ出す。

---

## 4. engine の API

### engine/compositor.js
```js
createCompositor(canvas, { preferGL = true }) -> Compositor
Compositor = {
  backend: "webgl2"|"2d",
  resize(w, h),
  renderFrame(project, time, {
     sources,                    // SourcePool（§4.2）
     quality = 1,                // 0.25 / 0.5 / 1
     overlays = true,            // セーフエリア等は ui 側が別 canvas に描く（ここでは描かない）
     forExport = false
  }) -> Promise<void>|void,      // forExport のときだけ await が必要
  grabPixels() -> ImageData,     // 静止画書き出し
  dispose()
}
```
実装方針: WebGL2 を第一とし、素材テクスチャ → **効果チェーン（FBO ピンポン）** →
transform 付き四角形で合成 → blend。`adjust` トラックはその下の合成結果に効果をかける。
transition は 2 枚のテクスチャを受け取る GLSL 関数として `engine/transitions.js` に持つ。
2d フォールバックは transform/opacity/blend/crossfade/文字/簡易 filter まで（効果は無視し、
`missing: ["chroma","mask"]` を `stats()` で申告する）。

### engine/sources.js
```js
createSourcePool({ storage, project }) -> SourcePool
SourcePool = {
  setProject(project),
  prepare(time, { lookahead = 1.5, mode }) -> Promise<void>,   // 先読み・<video> 確保
  acquire(resolved, { mode:"play"|"scrub"|"export" }) -> Source|null,
  // Source = { kind:"video"|"image"|"canvas"|"empty", el, width, height, ready:boolean }
  seekExact(resolved) -> Promise<Source>,     // export/scrub 用（frame 正確）
  textCanvas(resolved) -> HTMLCanvasElement,  // engine/text.js に委譲
  releaseUnused(time), stats() -> { videos, hits, misses }, dispose()
}
```
iOS の同時再生本数制限に当たるので、`mode:"play"` では **最大 4 本**（`navigator` で
iOS 判定時は 2 本）に抑え、足りない分は `seekExact` の静止フレームで代替する。

### engine/playback.js
```js
createTransport({ store, compositor, sources, audio }) -> Transport
Transport = {
  play(), pause(), toggle(), stop(),
  seek(t, { scrub = false }), stepFrame(±1), setRate(r), setLoop(bool), setRange(in,out),
  get time(), get playing(), get rate(),
  on("time"|"state"|"end", fn) -> off,
  dispose()
}
```
時計は **音が鳴っていれば AudioContext.currentTime を主**にし、無音時は performance.now。
毎 rAF で `compositor.renderFrame`。落ちてきたら `quality` を自動で下げる（`auto`）。

### engine/audio/graph.js
```js
createAudioEngine({ storage }) -> AudioEngine
AudioEngine = {
  ctx, master,                  // GainNode
  setProject(project), prepare(time), start(time), stop(), seek(time),
  setMasterVolume(v), meter(trackId|"master") -> { peak, rms },
  recordVoice({ trackId, start }) -> { stop() -> Promise<Blob> },
  dispose()
}
```
clip ごとに `AudioBufferSourceNode`（`decodeAudioData` 済み）を使う。
`playbackRate` で速度、`GainNode` でフェード、トラック FX は `engine/audio/fx.js`。

### engine/audio/mix.js
```js
renderMixdown(project, { sampleRate, duration, onProgress, signal }) -> Promise<AudioBuffer>
```
`OfflineAudioContext` で書き出し用の音を作る（ダッキングやトラック FX も含む）。

---

## 5. export の API

```js
// export/exporter.js
exportVideo(project, {
  range: { start, end }, width, height, fps,
  videoBitrate, audioBitrate, container: "mp4"|"webm"|"auto",
  codec: "auto"|"avc"|"vp9"|"av1",
  mode: "auto"|"precise"|"realtime",       // precise=WebCodecs, realtime=MediaRecorder
  onProgress(p /*0..1*/, info), signal
}) -> Promise<{ blob, mime, filename, frames, mode, warnings }>

exportStill(project, time, { width, height, type }) -> Promise<Blob>
exportAudio(project, opts) -> Promise<Blob>        // wav/webm
exportProject(project) -> Promise<Blob>            // .vqstudio (JSON + 素材)
importProject(blob) -> Promise<Project>
PRESETS  // export/presets.js: YouTube 1080p / Shorts 1080x1920 / TikTok / X / 4K / GIF / 音声のみ
```
`precise` は「フレームを `sources.seekExact` で確実に出す → `VideoEncoder` →
自前 muxer」。muxer は `export/mux/webm.js`（EBML）と `export/mux/mp4.js`（fMP4）。
どちらも **Node のテストで壊れたバイト列を出さないことを確認**できる形にする
（`tests/mux-*.test.mjs`）。`realtime` は `canvas.captureStream()` +
`MediaStreamAudioDestinationNode` + `MediaRecorder`。

---

## 6. analysis / ai の API

```js
// analysis/index.js
analyzeAsset(asset, { storage, want: ["scenes","motion","loudness","silence","beats","faces"],
                      onProgress, signal }) -> Promise<Asset["analysis"]>
// analysis/audio.js
detectBeats(audioBuffer) -> { bpm, offset, times, downbeats, conf }
detectSilence(audioBuffer, { thresholdDb: -38, minDur: .35, pad: .08 }) -> [{start,end}]
loudnessCurve(audioBuffer, { hz: 20 }) -> Float32Array
// analysis/video.js
detectScenes(videoEl, { hz: 4, threshold: .28, onProgress }) -> [{start,end,score}]
motionCurve(...) sharpnessCurve(...) brightnessCurve(...)
// analysis/track.js
trackSubject(videoEl, { start, end, box }) -> [{ t, box }]     // 自動リフレーム用
```

```js
// ai/planner.js
planEdit({ prompt, project, assets, template, constraints, llm, onProgress, signal })
  -> Promise<{ plan: Plan, source: "llm"|"local", notes: string[] }>
// Plan（LLM が出す・素材の尺やフレームは書かせない）
Plan = {
  title, ratio, targetDuration, pacing: "slow"|"medium"|"fast"|"beat",
  music: null | { assetId, gain, duck: true, startAt: "auto"|number },
  style: "vlog"|"product"|"explainer"|"short"|"digest"|"cinematic"|"news",
  grade: null | Partial<ColorGrade>,
  segments: [{
    assetId, pick: "auto"|"best"|"start"|"end"|{ in, out },
    want: number,                        // 望む秒数（解決層が素材に合わせて丸める）
    speed: 1, reverse: false,
    transition: "crossfade"|"cut"|"whipPan"|"zoomIn"|"glitch"|"slide",
    text: null | { content, role: "title"|"caption"|"lower"|"end", emphasis: 0..1 },
    fx: ["shake"], note: ""
  }],
  captions: "none"|"auto"|"prompt",
  endCard: null | { text, duration }
}
// ai/resolve.js   Plan → 実タイムライン（決定論。ここだけが秒とフレームを決める）
resolvePlan(plan, { project, assets, beats }) -> { ops: [{type,payload}], summary, warnings }
// ai/llm.js
createLLM({ endpoint, token }) -> { chat(messages, opts) -> Promise<string>,
                                    json(messages, schemaHint, opts) -> Promise<object>,
                                    available: boolean }
// ai/tools.js（ネット不要の「自動」群）
autoCutSilence(project, opts) autoReframe(project, opts) autoColor(project, opts)
autoDuck(project, opts) autoNormalize(project, opts) autoHighlights(project, opts)
autoChapters(project, opts) autoBeatSync(project, opts) autoSubtitleFromSpeech(...)
// ai/refine.js  「もっとテンポ速く」等の追い注文
refine({ prompt, project, selection, llm }) -> Promise<{ ops, summary }>
```
LLM 接続先は `window.__PUBLIC_CONFIG__?.api?.base` か `?api=` で与える。既定は
`https://vocabuquiz-api.rintyblog.workers.dev` の `/api/ai/chat`
（`{messages:[{role,content}], max_tokens}` を POST）。**繋がらない/失敗しても
必ず `source:"local"` の決定論プランで動くこと**（これが合格条件）。

---

## 7. UI 契約

### 画面の骨（index.html の id は固定・勝手に変えない）
```
#app
  #topbar      … 左: プロジェクト名/戻る  中: 取消/やり直し・ツール  右: 自動編集・書き出し
  #main
    #left      … #libraryPanel（素材/テキスト/オーディオ/エフェクト/テンプレの縦タブ）
    #center    … #previewWrap > #previewCanvas + #previewOverlay(canvas) + #previewHud
                 #transport … 再生/コマ送り/タイムコード/比率/画質/全画面
    #right     … #inspector（タブ: 変形/カラー/オーディオ/文字/効果/速度/AI）
  #timelinePane
    #tlToolbar #tlRuler #tlTracks #tlScrub #tlMinimap
  #mobileBar   … モバイルの下段タブ（§7.2）
  #sheetHost #modalHost #toastHost #menuHost   … ui/widgets.js が使う
```
- CSS は `styles/tokens.css`（色/寸法/影/z-index）→ `layout.css` → 部品別。
  ダークが既定。`--z-*` は tokens に集約。
- `prefers-reduced-motion` は尊重するが、タイムラインの機能は削らない。

### 7.1 デスクトップ（>= 1024px）
Premiere/CapCut 準拠の 3+1 ペイン。分割線はドラッグで可変（`ui/layout.js`、
幅は localStorage に保存）。右クリックメニュー、ツールチップに短絡キー。

### 7.2 モバイル（< 1024px, 縦）
CapCut モバイル準拠:
- 上: プレビュー（可変高、`dvh` 基準）。下: タイムライン。最下段に **タブバー**。
- タブ: `編集 / オーディオ / テキスト / ステッカー / オーバーレイ / エフェクト / フィルター / 比率 / 自動編集`
- クリップ選択中は **文脈ツールバー**（分割・削除・複製・速度・音量・アニメ・不透明度・
  クロップ・逆再生・フリーズ・マスク・カラー…）を横スクロールで出す。
- 数値は **ボトムシート**（`ui/widgets.js` の `openSheet`）＋中央スナップ付きスライダー。
- タイムラインは **再生ヘッド固定・盤面スクロール**（CapCut 式）。ピンチで拡縮。
  長押しでクリップ移動、端の白いハンドルでトリム。触り所は 44px 以上。
- `touch-action: none` を timeline に、慣性スクロールは自前。iOS の safe-area を尊重。

### 7.3 widgets（ui/widgets.js）— 他の UI はこれだけを使う
```js
openSheet({ title, content, height, actions }) -> { close }
openModal({ title, content, actions }) -> { close }
toast(msg, { kind, ms })
menu(anchorEl, items) -> { close }
slider({ label, min, max, step, value, center, unit, onInput }) -> HTMLElement
numberDrag({ label, value, min, max, step, onInput }) -> HTMLElement
colorField({ value, onInput }) -> HTMLElement
segmented({ items, value, onChange }) -> HTMLElement
toggle({ label, value, onChange }) -> HTMLElement
curveEditor({ points, onChange }) -> HTMLElement      // カーブ/イージング共用
progressRing({ value }) -> { el, set }
icon(name) -> SVGElement            // ui/icons.js（線画・24px グリッド）
```

### 7.4 短絡キー（ui/shortcuts.js）
`Space` 再生 / `J K L` 逆再生・停止・早送り / `←→` 1 フレーム / `Shift+←→` 1 秒 /
`I O` イン・アウト / `S` または `Ctrl+B` 分割 / `Delete` 削除 / `Shift+Delete` 詰めて削除 /
`Ctrl+Z` `Ctrl+Shift+Z` / `Ctrl+C V X` / `Alt+ドラッグ` 複製 / `+ -` 拡縮 /
`Shift+Z` 全体表示 / `M` マーカー / `Ctrl+S` 保存 / `Ctrl+E` 書き出し /
`V A T` ツール（選択/リップル/かみそり） / `F` フルスクリーン / `?` 一覧

---

## 8. 試験（これが無いものは未完成とみなす）
- `tests/*.test.mjs` … `node --test studio/tests` で通る純ロジック
  （time / eval / ops の不変条件 / planner の決定論 / muxer のバイト列 / beats / silence）。
- `studio/selftest.html` … ブラウザで各モジュールの smoke（WebGL 初期化・1 フレーム描画・
  音の 1 秒書き出し・IndexedDB 往復）。失敗は赤で列挙。
- Playwright の統合試験は統合担当（私）が回す。`data-test` 属性を要素に付ける。

## 9. やらないこと（v1）
サーバ側処理、クラウド保存、共同編集、3D、光学フロー補間、AI 生成映像そのもの
（外部生成物の取り込みは可）、H.265、字幕の翻訳。

---

## 10. アカウント（新規登録・ログイン・認証コード・パスワード変更）

**既存の VocabuQuiz の会員基盤をそのまま使う。**（同じアカウントで Studio に入れる＝
別の会員システムを作らない。作ると片方だけ直したときに黙って食い違う）

- API 基点: `window.__PUBLIC_CONFIG__?.api?.base` → `window.VQ_API_BASE` →
  既定 `https://vocabuquiz-api.rintyblog.workers.dev`（`?api=` で上書き可）
- 保管キーは **本体アプリと同じ**にする（本体でログイン済みなら Studio も入れている）:
  `app.auth.token.v1` / `app.auth.expiresAt.v1` / `app.auth.profile.v1` / `app.auth.mode.v1`
- 身元は **学年接頭（gradePrefix, 例 "H1"）＋ニックネーム（nickname）＋パスワード**。
  メールは登録時の確認（認証コード）に使う。

### 10.1 実際の口（本体 index.html の実装から写したもの。勝手に変えない）
```
POST /api/auth/register/start
  { email, gradePrefix, nickname, password, password2, turnstileToken? }
  → { ok, challengeId, maskedEmail, expiresIn(=600), resendAvailableIn(=30),
      resendsRemaining(=3), devCode?（開発環境だけ） , message? }
POST /api/auth/register/verify
  { challengeId, code /* 6 桁 */ }
  → { ok, verified|alreadyVerified, registrationSession, attemptsRemaining?,
      status?: "RESTART_REQUIRED"|"EXPIRED", message? }
POST /api/auth/register/resend   { challengeId }
  → { ok, expiresIn, resendAvailableIn, resendsRemaining, devCode?, message? }
POST /api/auth/register/consent
  { registrationSession, agreeTerms:true, agreePrivacy:true, agreeAge:true, pin? }
  → { ok, token, expiresAt, user? }
POST /api/auth/login             { gradePrefix, nickname, password }
  → { token, expiresAt, user, ... }
GET  /api/auth/me                （Authorization: Bearer <token>）→ { user, ... }
POST /api/auth/change-password
  { grade_prefix, nickname, old_password, new_password }   ← **snake_case（ここだけ）**
  → { ok, message? }
POST /api/auth/reset/start       { gradePrefix, nickname }
  → { ok, challengeId, maskedEmail, resendsRemaining, devCode?, message? }
POST /api/auth/reset/code        { challengeId, code }
  → { ok, resetToken, attemptsRemaining?, message? }
POST /api/auth/reset/pin         { gradePrefix, nickname, pin /* 4 or 6 桁 */ }
  → { ok, challengeId, resetToken, message? }
POST /api/auth/reset/password    { challengeId, resetToken, newPassword }
  → { ok, message? }
GET  /api/profile/me             （Bearer）→ プロフィール
```
規則: パスワードは 8 文字以上、コードは 6 桁、再送は 30 秒待ち・残り回数あり、
失敗回数の上限はサーバが持つ（画面は残り回数を出すだけ）。

### 10.2 契約（src/core/auth.js）
```js
createAuth({ apiBase, storage = localStorage }) -> Auth
Auth = {
  get state(),        // { status:"anon"|"guest"|"user"|"booting", user, token, expiresAt }
  subscribe(fn) -> off,
  boot() -> Promise<state>,                  // 保存トークンを /me で確かめる
  login({ gradePrefix, nickname, password, remember }) -> Promise<state>,
  logout({ keepGuest }) ,
  guest() -> state,                          // 未ログインでも編集できる道（必須）
  register: {
    start({ email, gradePrefix, nickname, password, password2 }) -> Promise<Challenge>,
    verify({ challengeId, code }) -> Promise<{ registrationSession }>,
    resend({ challengeId }) -> Promise<Challenge>,
    consent({ registrationSession, pin }) -> Promise<state>
  },
  changePassword({ gradePrefix, nickname, oldPassword, newPassword }) -> Promise<{ok}>,
  reset: {
    start({ gradePrefix, nickname }) -> Promise<Challenge>,
    code({ challengeId, code }) -> Promise<{ resetToken }>,
    pin({ gradePrefix, nickname, pin }) -> Promise<{ challengeId, resetToken }>,
    password({ challengeId, resetToken, newPassword }) -> Promise<{ok}>
  },
  authHeader() -> { Authorization } | {},
  passwordStrength(pw) -> { score:0..4, label, hints:[] }   // pure・試験する
}
class AuthError extends Error { code, status, retryAfter, attemptsRemaining }
```
**必須の割り切り**: ネットが無い・API が落ちている・ログインしたくない人のために
`guest()` が在り、**ゲストでも編集機能は一切制限しない**（保存はローカルのみ）。
ログインの利点は「プロジェクトの持ち出し・端末間の引き継ぎ（将来）・AI 機能の回数」。

### 10.3 画面（src/ui/auth-screen.js + styles/auth.css）
CapCut/Figma/Linear 級の作り込み。**凝る所はここ**（最初に目に入る画面）。
- 画面: `welcome`（ロゴ・動く背景・「はじめる」「ログイン」「ゲストで試す」）→
  `login` → `signup`（メール/学年/ニックネーム/パスワード＋強度メータ＋規約）→
  `verify`（6 桁のコード入力・自動で次の枠へ・貼り付け対応・残り時間・再送）→
  `pin`（任意の暗証番号）→ `consent`（規約同意）→ 完了で編集画面へ。
  別に `reset`（本人確認 → コード or 暗証番号 → 新パスワード）と
  `changePassword`（設定から）。
- 作り: 暗い背景に **動く抽象背景**（canvas か CSS。軽いこと・reduced-motion で静止）、
  ガラス調のパネル、入力の浮き上がるラベル、エラーは枠の下に穏やかに、
  成功時は小さな祝いの動き、ボタンは押した感触（scale + 影）、
  読み込み中はボタン内スピナー、Enter で次へ、Tab 順を正しく、
  `autocomplete` 属性を正しく（username / new-password / one-time-code）、
  パスワード表示切替、大文字ロック警告、6 桁入力は 1 枠 1 文字で
  **iOS の SMS/メール自動入力（inputmode="numeric" autocomplete="one-time-code"）**に対応。
- モバイルで完全に成立すること（縦 1 枚・キーボードで隠れない・safe-area）。
- 失敗の文言は具体的に（「あと N 回」「30 秒後にもう一度」など API の値を出す）。
- 画面遷移は横スライド（戻るは逆向き）。ブラウザの戻るで 1 段戻る。

---

## 11. 書き出し（漏れなく揃える）

1. **動画**: mp4（H.264+AAC 相当）/ webm（VP9+Opus）/ 自動判定。
   - `precise`: WebCodecs `VideoEncoder` + 自前 muxer（`export/mux/mp4.js` の fMP4,
     `export/mux/webm.js` の EBML）。フレームは `sources.seekExact` で確実に出す。
   - `realtime`: `canvas.captureStream()` + `MediaRecorder`（対応 mimeType を実行時に選ぶ）。
   - 解像度（元 / 2160p / 1440p / 1080p / 720p / 480p / 任意）、fps（24/25/30/50/60/元）、
     ビットレート（自動・低・標準・高・最高・任意 kbps）、範囲（全体 / イン〜アウト /
     選択クリップ）、音声（含める/無音/音声のみ）。
2. **静止画**: 現在フレームを PNG / JPEG（品質）/ 任意解像度。連番書き出し（ZIP は作らず
   1 枚ずつダウンロード or OPFS へ）。
3. **音声**: wav / webm(Opus)。BGM 抜き・特定トラックのみも可。
4. **GIF**: 自前エンコーダ（`export/gif.js`。中央値カット量子化 + LZW）。
   fps 10/12/15、幅指定、ループ、ディザ。
5. **字幕**: SRT / VTT 書き出し（text クリップ or 字幕トラックから）。
6. **プロジェクト**: `.vqstudio`（JSON + 素材を 1 ファイルに詰めた自前コンテナ。
   `export/project-file.js`。素材を含める/含めないを選べる）＋ 読み込み。
7. **EDL 相当**: 編集内容の JSON（AI の再現・共有用）。
8. 共通: 進捗（%・残り時間・現在フレーム）、中止、失敗時の原因表示、
   完了後の共有（`navigator.share` 在れば）/ ダウンロード / もう一度、
   **書き出し中もタブが寝ないように**（`?keepAwake` ではなく `wakeLock` を試す）、
   presets（YouTube / Shorts / TikTok / Instagram / X / 4K / 軽量 / 音声のみ / GIF）。

---

## 12. 追補（統合時に決めたこと）

1. **書き出しが合成と素材を得る道**
   `exportVideo(project, opts)` の `opts` には `{ compositor, sources, audio }` を
   渡せる（編集中の物を使い回す）。**渡されなかったら exporter が自分で作る**
   （画面外の canvas + `createCompositor` + `createSourcePool` + `createAudioEngine`）。
   自分で作った物は終わりに必ず dispose する。これは「書き出し中もプレビューを
   触れるように」するため。
2. **試験の走らせ方**
   `cd studio && npm test`（= `node --test "tests/*.test.mjs"`）。
   `node --test studio/tests` のようにディレクトリを渡すと Node 22 では動かない。
3. **op の返り値**
   `clip.add` は `{ clipId }`、`clip.split` は `{ ids: [a, b] }`、
   `track.add` は `{ trackId }`、`asset.add` は `{ assetId }` を返す
   （UI と AI が直後に選択・追記するため）。`id` も同時に入れて良い。
4. **store.batch の使い方**
   `store.batch(label, (d) => { d(type, payload); ... })` で 1 取消単位。
   AI の適用（ops 配列）は必ずこれを通す。
5. **画面の行き先**
   `main.js` → `ui/app.js` の `start()` が決める。未ログインかつゲストでもない場合は
   アカウント画面、それ以外は一覧。`?project=<id>` / `?new` / `?demo=1` で直行できる。
6. **デバッグの窓**
   `window.VQSTUDIO = { app, cfg, storage, auth, schema, failures, version }`。
   `failures` に「読み込めなかった部品」が入る（selftest.html と通し試験が見る）。

---

## 13. 実機の壁（調査で確定した事実。**推測で覆さない**）

出典: 2026-09 の対応状況調査（CapCut モバイル / デスクトップ NLE / Web メディア API /
自動編集アルゴリズム）。ここに書いた事は「対応していない」側に倒して設計する。

### 13.1 書き出し
- **iOS Safari に `canvas.captureStream()` が無い**（iPhone/iPad の全ブラウザ = WebKit）。
  → `mode:"realtime"`（MediaRecorder）は **iOS では使えない**。実行時に
  `typeof canvas.captureStream === "function"` と、取れた track の readyState を見て判定する
  （UA で判定しない）。iOS の書き出しは **WebCodecs + 自前 muxer のみ**。
- `MediaRecorder` は仕様上 **実時間のみ**・実時計でタイムスタンプを打つ。
  `captureStream(0)` + `requestFrame()` でも直らない（Firefox は requestFrame 未実装）。
  → realtime は「速いが近似」と画面に明記し、既定は `precise`。
- `VideoEncoder` は Safari 16.4+、**`AudioEncoder` は Safari 26+**。
  → 音は 3 段構え: ① AudioEncoder（mp4a.40.2 / opus）② `MediaStreamAudioDestinationNode`
  ＋ MediaRecorder（DOM capture ではないので iOS 14.5+ で動く）③ 無音動画 + .wav 別ファイル。
  v1 は ① と ③ を必ず持つ。
- MP4 は `VideoEncoder` の `decoderConfig.description` を **そのまま avcC として書く**。
  コーデック文字列は `isConfigSupported` で選ぶ（avc1.42001f / avc1.4d0034）。

### 13.2 描画
- **`ctx.filter` は Safari に無い**（フラグの噂も当てにしない）。判定は CSS 文字列の
  受理ではなく **画素で試す**（赤で塗る → `filter:invert(1)` → drawImage → getImageData）。
  → 色補正・効果は WebGL2 のシェーダが唯一の本道。2d は「劣化版」と申告する。
- OffscreenCanvas + WebGL2 は Safari 17.0 以降（16.4〜16.6 は 2D のみ）。
  Worker 内 WebGL は当てにしない。**合成はメインスレッド**に置く
  （`<video>` は Worker に無いし、`texImage2D(videoEl)` の速い道を失う）。

### 13.3 素材と seek
- iOS は同時に生かせる `<video>` が少ない（数は公表されていない。メモリと
  デコーダ次第）。→ プールは **iPhone 2 本 / デスクトップ 4 本**。溢れたら
  `pause()` → `removeAttribute("src")` → `load()` → `revokeObjectURL()` まで必ずやる。
  画面外の `<video>` を生かしたままにしない。超過分は静止フレームで代替。
- 巨大 Blob の objectURL を `<video>.src` に入れると iOS が落ちることがある。
  → 1080p 超の素材は取り込み時に 720p の代理（プロキシ）を作り、プレビューは代理を見る。
- **フレーム正確な seek はこの手順ひとつに集約する**:
  `currentTime = (frameIndex + 0.5) / assetFps` → `seeked` を待つ →
  `requestVideoFrameCallback` を 1 回待つ →（無ければ rAF 2 回 + タイムアウト）。
  `fastSeek()` は使わない。**量子化は素材の fps で**行う（`sourceIn` と `speed` を
  通した後の素材時刻で丸める。プロジェクト fps で丸めると 60fps 素材や速度変更で外れる）。
  `+0.5` の中心寄せは **外へ漏らさない**（書き出しの timestamp は `frameStart(i,fps)=i/fps`）。
  タイムアウトは書き出し時 1000ms 以上（4K HEVC の iPhone は 400〜1200ms かかる）。
- `requestVideoFrameCallback` は **タブが隠れていると来ない**。書き出し中は
  可視性を見て、隠れたら seek 待ちの方式を切り替える（または警告を出す）。

### 13.4 モバイルの操作
- **`navigator.vibrate` は iOS に無い**。→ 触覚は 1 つの関数に集約し、必ず
  60ms の視覚の合図（吸着線の点滅・枠の明滅）を一緒に出す。振動は「在れば嬉しい」扱い。
- `user-scalable=no` は iOS では無視される。ページのピンチズームを止める唯一の手は
  `touch-action:none` + 非 passive な `touchmove` の preventDefault +
  **WebKit 固有の `gesturestart` / `gesturechange` / `gestureend` の preventDefault**。
- safe-area と flex の罠: `flex: 0 0 44px` に `padding-top: env(safe-area-inset-top)` を
  足すと **中身の高さが 44 − 47 = 負**になり、ボタンがステータスバーに潜って押せない。
  正しくは `flex: 0 0 auto; height: calc(44px + env(safe-area-inset-top))`。
  下段タブも `min-height: calc(76px + env(safe-area-inset-bottom))`。
- ホーム画面に追加した web アプリは **Safari とは別の保存領域**（WebKit bug 181849）。
  「入れれば消えない」と案内してはいけない（そう案内すると逆にデータを失わせる）。
  Wake Lock もホーム画面アプリでは効かない。
- 全画面は iPhone では `requestFullscreen` が無い（iPad のみ）。
  → 疑似全画面（`position:fixed` + `100dvh` + 周りを隠す）を用意する。

### 13.5 タイムライン（CapCut 準拠の要点）
- **再生ヘッドは画面中央に固定し、盤面が流れる**。
  `currentSec = scrollX / pxPerSec`、先頭と末尾に `viewportW/2` の余白。
  スクロールは `overflow-x` ではなく `transform: translate3d()` の自前実装
  ＋自前慣性（`v *= 0.94`、停止 0.05px/frame、両端は超過 × 0.35 のゴム）。
  iOS の慣性スクロールと programmatic scrollLeft は喧嘩するのでこれが必須。
- ジェスチャは **1 つの調停役**が持つ: touchstart で 320ms のタイマー →
  8px 超の移動でタイマー破棄＝スクロール確定 → 2 本目の指を見たら即ズーム。
  一度決まったら他へ移らない。
- ピンチの `pxPerSec` は 8〜480、段は [fit, 10, 20, 40, 80, 160, 320, 480]。
  中心は常に画面中央（＝再生ヘッド）なので指の中点追跡は不要。
  `fitPxPerSec = (viewportW - 2*edgeInset) / projectSec`（`max(8, …)` は誤り）。
- トリムハンドルは見た目 14px・当たり判定 44px・反対端は固定・掴んだ端が中央へ
  吸い付くよう自動スクロール・ドラッグ中は尺のふきだし。
  **モデルの下限は `MIN_CLIP=0.04`、UI の下限は `MIN_TRIM_UI=0.1`**（UI ≧ モデル）。
- 長押し 320ms で並べ替え（発火時に合図、`scale(1.04)`、他クリップは 180ms で隙間）。
- 削除は確認ダイアログではなく **取消つきトースト 4 秒**。
- フィルムストリップは 0.5 秒間隔の粗いスプライトを 1 回だけ作り、
  ズームは `background-position` のタイル表示で済ます（DPR は最大 2、
  1 枚のアトラスに入る枚数を device px で数える）。
- サブトラックは高さ 32px、3 行を超えたらタイムライン内で縦スクロール
  （メイントラックは `position:sticky`）。

### 13.6 音と解析
- 編集用の音は `decodeAudioData` + `AudioBufferSourceNode`（`MediaElementSource` は使わない）。
  `AudioContext` は 1 つ、最初のユーザー操作で `resume()`。
  **音が鳴っている間は `AudioContext.currentTime` が主時計**、完全に無音のときだけ
  `performance.now()`。
- 書き出しの音は `OfflineAudioContext` で、**再生と同じ組み立て関数**を使い回す
  （別実装にすると必ずずれる）。
- `decodeAudioData` はメインスレッドを数百 ms 止める。波形のピークは
  1 秒 200 個の min/max だけ残して元データは捨てる。
- 逆再生はブラウザでは安くない。**3 秒以下はフレーム抽出方式**、それ以上は出さない。
