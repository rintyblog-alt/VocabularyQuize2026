/* ══════════════════════════════════════════════════════════════════════════
   studio/src/ui/i18n.js — 画面に出る文字を 1 箇所に集める（ja 既定 / en）

   ★ 何をする所か
     `t("btn.export")` で今の言語の文字を返す。画面名・ボタン・詳細設定の項目名・
     単位・エラー文・AI の説明・書き出しの選択肢・アカウント・短絡キーの説明を
     **全部ここに置く**。各ファイルに文言を散らすと、直し漏れで日本語と英語が
     黙って食い違う。

   ★ なぜこの形か
     ・`TABLE` は `キー: [日本語, English]` の **対**で持つ。こう持てば
       「ja にだけ在る / en にだけ無い」が構造的に起こらない（試験でも確かめる）。
     ・`LOCALES = { ja, en }` は TABLE から組み立てた凍結済みの辞書。契約どおり
       外から読めるが書き換えられない。
     ・**未定義キーは key をそのまま返す**。文言が無いだけで画面が壊れないように。
     ・差し込みは `{name}` の形だけ。値が無ければ `{name}` を残す（消すと
       「あと  秒」のような気味の悪い文になり、原因も分からなくなる）。

   ★ 触るときの注意
     ・キーは `分野.名前`（英小文字 + ドット）。消さない・意味を変えない。
     ・空文字は入れない（試験が落ちる）。意図的な空白は "　" ではなく別キーに。
     ・`setLocale` は購読者へ知らせるだけ。再描画は呼び側（ui/app.js）の仕事。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";

/** 使える言語（既定は ja。契約書 §7 の日本語優先に合わせる） */
export const LOCALE_IDS = Object.freeze(["ja", "en"]);
export const DEFAULT_LOCALE = "ja";
/** 言語切替 UI に出す名前 */
export const LOCALE_NAMES = Object.freeze({ ja: "日本語", en: "English" });
/** 選んだ言語の保管先（core/log.js の "vqstudio.debug" と同じ作法） */
export const LOCALE_KEY = "vqstudio.locale";

/* ── 文言表（キー: [日本語, English]）───────────────────────────────── */
/** @type {Record<string, [string, string]>} */
const TABLE = {
  /* ── 1. 画面とアプリの名 ───────────────────────────────────────── */
  "app.name": ["VQ Studio", "VQ Studio"],
  "app.tagline": ["ブラウザだけで動く動画編集", "Video editing, right in your browser"],
  "screen.boot": ["読み込んでいます…", "Loading…"],
  "screen.auth": ["アカウント", "Account"],
  "screen.home": ["プロジェクト一覧", "Projects"],
  "screen.editor": ["編集", "Editor"],
  "screen.settings": ["設定", "Settings"],
  "screen.error": ["問題が起きました", "Something went wrong"],

  /* ── 2. よく出るボタン ─────────────────────────────────────────── */
  "btn.ok": ["OK", "OK"],
  "btn.cancel": ["キャンセル", "Cancel"],
  "btn.apply": ["適用", "Apply"],
  "btn.close": ["閉じる", "Close"],
  "btn.back": ["戻る", "Back"],
  "btn.next": ["次へ", "Next"],
  "btn.done": ["完了", "Done"],
  "btn.retry": ["もう一度", "Try again"],
  "btn.reset": ["初期値に戻す", "Reset"],
  "btn.more": ["その他", "More"],
  "btn.undo": ["取り消し", "Undo"],
  "btn.redo": ["やり直し", "Redo"],
  "btn.save": ["保存", "Save"],
  "btn.delete": ["削除", "Delete"],
  "btn.duplicate": ["複製", "Duplicate"],
  "btn.copy": ["コピー", "Copy"],
  "btn.paste": ["貼り付け", "Paste"],
  "btn.cut": ["切り取り", "Cut"],
  "btn.rename": ["名前を変える", "Rename"],
  "btn.add": ["追加", "Add"],
  "btn.remove": ["外す", "Remove"],
  "btn.import": ["読み込み", "Import"],
  "btn.export": ["書き出し", "Export"],
  "btn.share": ["共有", "Share"],
  "btn.download": ["ダウンロード", "Download"],
  "btn.ai": ["AI 自動編集", "AI auto-edit"],
  "btn.account": ["アカウント", "Account"],
  "btn.home": ["プロジェクト一覧", "Projects"],
  "btn.settings": ["設定", "Settings"],
  "btn.help": ["ヘルプ", "Help"],

  /* ── 3. 共通の語 ───────────────────────────────────────────────── */
  "common.on": ["オン", "On"],
  "common.off": ["オフ", "Off"],
  "common.auto": ["自動", "Auto"],
  "common.none": ["なし", "None"],
  "common.custom": ["任意", "Custom"],
  "common.default": ["既定", "Default"],
  "common.yes": ["はい", "Yes"],
  "common.no": ["いいえ", "No"],
  "common.all": ["すべて", "All"],
  "common.low": ["低", "Low"],
  "common.normal": ["標準", "Normal"],
  "common.high": ["高", "High"],
  "common.max": ["最高", "Maximum"],
  "common.loading": ["読み込み中…", "Loading…"],
  "common.search": ["さがす", "Search"],
  "common.empty": ["まだ何もありません", "Nothing here yet"],
  "common.selected": ["{n} 個を選択中", "{n} selected"],
  "common.items": ["{n} 件", "{n} items"],
  "common.required": ["必須", "Required"],
  "common.optional": ["任意", "Optional"],

  /* ── 4. プロジェクト ───────────────────────────────────────────── */
  "project.untitled": ["無題のプロジェクト", "Untitled project"],
  "project.name": ["プロジェクト名", "Project name"],
  "project.new": ["新しいプロジェクト", "New project"],
  "project.open": ["開く", "Open"],
  "project.recent": ["最近の作業", "Recent"],
  "project.duration": ["長さ", "Duration"],
  "project.updated": ["更新 {when}", "Updated {when}"],
  "project.ratio": ["画面比", "Aspect ratio"],
  "project.fps": ["フレームレート", "Frame rate"],
  "project.resolution": ["解像度", "Resolution"],
  "project.background": ["背景色", "Background"],
  "project.deleteConfirm": ["「{name}」を削除しますか？ 戻せません。", "Delete “{name}”? This cannot be undone."],
  "project.saved": ["保存済み", "Saved"],
  "project.saving": ["保存中…", "Saving…"],
  "project.unsaved": ["未保存の変更あり", "Unsaved changes"],

  /* ── 5. 素材パネル ─────────────────────────────────────────────── */
  "library.media": ["素材", "Media"],
  "library.text": ["テキスト", "Text"],
  "library.audio": ["オーディオ", "Audio"],
  "library.effects": ["エフェクト", "Effects"],
  "library.filters": ["フィルター", "Filters"],
  "library.stickers": ["ステッカー", "Stickers"],
  "library.templates": ["テンプレート", "Templates"],
  "library.transitions": ["トランジション", "Transitions"],
  "library.shapes": ["図形", "Shapes"],
  "library.import": ["素材を読み込む", "Import media"],
  "library.dropHint": ["ここに動画・画像・音を落とす", "Drop video, images or audio here"],
  "library.record": ["録音・録画", "Record"],
  "library.proxy": ["軽い代理を作りました（プレビュー用）", "Created a lightweight proxy for preview"],

  /* ── 6. 再生とプレビュー ───────────────────────────────────────── */
  "transport.play": ["再生", "Play"],
  "transport.pause": ["一時停止", "Pause"],
  "transport.stop": ["停止", "Stop"],
  "transport.prevFrame": ["1 コマ戻る", "Previous frame"],
  "transport.nextFrame": ["1 コマ進む", "Next frame"],
  "transport.toStart": ["先頭へ", "Go to start"],
  "transport.toEnd": ["末尾へ", "Go to end"],
  "transport.loop": ["繰り返し", "Loop"],
  "transport.volume": ["音量", "Volume"],
  "transport.mute": ["消音", "Mute"],
  "transport.fullscreen": ["全画面", "Fullscreen"],
  "transport.quality": ["画質", "Quality"],
  "transport.timecode": ["タイムコード", "Timecode"],
  "transport.markIn": ["イン点", "Mark in"],
  "transport.markOut": ["アウト点", "Mark out"],
  "preview.grid": ["格子", "Grid"],
  "preview.safeArea": ["安全枠", "Safe area"],
  "preview.snapGuide": ["吸着ガイド", "Snap guides"],

  /* ── 7. タイムライン ───────────────────────────────────────────── */
  "timeline.tracks": ["トラック", "Tracks"],
  "timeline.addTrack": ["トラックを足す", "Add track"],
  "timeline.videoTrack": ["映像", "Video"],
  "timeline.audioTrack": ["音声", "Audio"],
  "timeline.textTrack": ["文字", "Text"],
  "timeline.overlayTrack": ["オーバーレイ", "Overlay"],
  "timeline.split": ["分割", "Split"],
  "timeline.rippleDelete": ["詰めて削除", "Ripple delete"],
  "timeline.toolSelect": ["選択", "Select"],
  "timeline.toolRipple": ["リップル", "Ripple"],
  "timeline.toolRazor": ["かみそり", "Razor"],
  "timeline.snap": ["吸着", "Snap"],
  "timeline.zoomIn": ["拡大", "Zoom in"],
  "timeline.zoomOut": ["縮小", "Zoom out"],
  "timeline.fitAll": ["全体表示", "Fit all"],
  "timeline.marker": ["マーカー", "Marker"],
  "timeline.solo": ["ソロ", "Solo"],
  "timeline.lockTrack": ["トラックを固定", "Lock track"],
  "timeline.hideTrack": ["トラックを隠す", "Hide track"],
  "timeline.empty": ["素材をここに置くと編集が始まります", "Drop media here to start editing"],

  /* ── 8. 詳細設定（タブ）───────────────────────────────────────── */
  "inspector.transform": ["変形", "Transform"],
  "inspector.color": ["カラー", "Color"],
  "inspector.audio": ["オーディオ", "Audio"],
  "inspector.text": ["文字", "Text"],
  "inspector.effect": ["効果", "Effects"],
  "inspector.speed": ["速度", "Speed"],
  "inspector.ai": ["AI", "AI"],
  "inspector.project": ["プロジェクト", "Project"],
  "inspector.none": ["クリップを選ぶと設定が出ます", "Select a clip to see its settings"],

  /* ── 9. 変形 ───────────────────────────────────────────────────── */
  "transform.position": ["位置", "Position"],
  "transform.x": ["横", "X"],
  "transform.y": ["縦", "Y"],
  "transform.scale": ["大きさ", "Scale"],
  "transform.scaleX": ["横の伸縮", "Scale X"],
  "transform.scaleY": ["縦の伸縮", "Scale Y"],
  "transform.rotation": ["回転", "Rotation"],
  "transform.opacity": ["不透明度", "Opacity"],
  "transform.anchor": ["基準点", "Anchor"],
  "transform.crop": ["切り抜き", "Crop"],
  "transform.flipH": ["左右反転", "Flip horizontal"],
  "transform.flipV": ["上下反転", "Flip vertical"],
  "transform.blend": ["合成方法", "Blend mode"],
  "transform.fitMode": ["収め方", "Fit mode"],

  /* ── 10. カラー ────────────────────────────────────────────────── */
  "color.brightness": ["明るさ", "Brightness"],
  "color.contrast": ["コントラスト", "Contrast"],
  "color.saturation": ["彩度", "Saturation"],
  "color.temperature": ["色温度", "Temperature"],
  "color.tint": ["色合い", "Tint"],
  "color.exposure": ["露出", "Exposure"],
  "color.highlights": ["明部", "Highlights"],
  "color.shadows": ["暗部", "Shadows"],
  "color.hue": ["色相", "Hue"],
  "color.gamma": ["ガンマ", "Gamma"],
  "color.sharpen": ["シャープ", "Sharpen"],
  "color.blur": ["ぼかし", "Blur"],
  "color.vignette": ["周辺減光", "Vignette"],
  "color.grain": ["粒子", "Grain"],
  "color.lut": ["ルックアップ（LUT）", "LUT"],
  "color.degraded": ["この端末では 2D の劣化版で描いています", "This device falls back to a reduced 2D path"],

  /* ── 11. オーディオ ────────────────────────────────────────────── */
  "audio.volume": ["音量", "Volume"],
  "audio.gain": ["ゲイン", "Gain"],
  "audio.pan": ["左右", "Pan"],
  "audio.fadeIn": ["フェードイン", "Fade in"],
  "audio.fadeOut": ["フェードアウト", "Fade out"],
  "audio.mute": ["消音", "Mute"],
  "audio.denoise": ["ノイズ除去", "Noise reduction"],
  "audio.compressor": ["コンプレッサー", "Compressor"],
  "audio.eq": ["イコライザー", "Equalizer"],
  "audio.lowCut": ["低域カット", "Low cut"],
  "audio.highCut": ["高域カット", "High cut"],
  "audio.reverb": ["残響", "Reverb"],
  "audio.pitch": ["音の高さ", "Pitch"],
  "audio.normalize": ["音量をそろえる", "Normalize"],
  "audio.ducking": ["BGM を自動で下げる", "Auto-duck music"],
  "audio.peak": ["ピーク {db}", "Peak {db}"],

  /* ── 12. 文字 ──────────────────────────────────────────────────── */
  "text.content": ["文章", "Content"],
  "text.placeholder": ["ここに文字を入れる", "Type your text"],
  "text.font": ["書体", "Font"],
  "text.size": ["大きさ", "Size"],
  "text.weight": ["太さ", "Weight"],
  "text.color": ["色", "Color"],
  "text.align": ["そろえ", "Alignment"],
  "text.lineHeight": ["行の高さ", "Line height"],
  "text.letterSpacing": ["字間", "Letter spacing"],
  "text.stroke": ["縁取り", "Outline"],
  "text.shadow": ["影", "Shadow"],
  "text.background": ["背景", "Background"],
  "text.padding": ["内側の余白", "Padding"],
  "text.animateIn": ["登場の動き", "Animate in"],
  "text.animateOut": ["退場の動き", "Animate out"],

  /* ── 13. 速度と効果 ────────────────────────────────────────────── */
  "speed.rate": ["速さ", "Speed"],
  "speed.curve": ["速度カーブ", "Speed curve"],
  "speed.reverse": ["逆再生", "Reverse"],
  "speed.freeze": ["フリーズ", "Freeze frame"],
  "speed.pitchLock": ["音の高さを保つ", "Keep pitch"],
  "speed.duration": ["長さ {sec}", "Length {sec}"],
  "effect.intensity": ["強さ", "Intensity"],
  "effect.duration": ["時間", "Duration"],
  "effect.transitionIn": ["入りの切り替え", "Transition in"],
  "effect.transitionOut": ["出の切り替え", "Transition out"],
  "effect.mask": ["マスク", "Mask"],
  "effect.none": ["効果なし", "No effect"],

  /* ── 14. キーフレーム ──────────────────────────────────────────── */
  "keyframe.add": ["キーフレームを打つ", "Add keyframe"],
  "keyframe.remove": ["キーフレームを消す", "Remove keyframe"],
  "keyframe.prev": ["前のキーフレーム", "Previous keyframe"],
  "keyframe.next": ["次のキーフレーム", "Next keyframe"],
  "keyframe.easing": ["補間", "Easing"],
  "keyframe.linear": ["直線", "Linear"],
  "keyframe.easeIn": ["ゆっくり始まる", "Ease in"],
  "keyframe.easeOut": ["ゆっくり止まる", "Ease out"],
  "keyframe.easeInOut": ["両端ゆっくり", "Ease in-out"],
  "keyframe.hold": ["保持", "Hold"],

  /* ── 15. 単位 ──────────────────────────────────────────────────── */
  "unit.px": ["px", "px"],
  "unit.percent": ["%", "%"],
  "unit.deg": ["°", "°"],
  "unit.sec": ["秒", "s"],
  "unit.ms": ["ミリ秒", "ms"],
  "unit.frame": ["コマ", "frames"],
  "unit.fps": ["fps", "fps"],
  "unit.db": ["dB", "dB"],
  "unit.hz": ["Hz", "Hz"],
  "unit.khz": ["kHz", "kHz"],
  "unit.kbps": ["kbps", "kbps"],
  "unit.mbps": ["Mbps", "Mbps"],
  "unit.times": ["倍", "×"],
  "unit.mb": ["MB", "MB"],
  "unit.gb": ["GB", "GB"],

  /* ── 16. エラー文（原因と次の一手を書く）──────────────────────── */
  "error.generic": ["うまくいきませんでした。もう一度お試しください。", "That did not work. Please try again."],
  "error.network": ["通信できませんでした。電波の良い所でもう一度。", "Could not reach the network. Try again with a better connection."],
  "error.offline": ["いまオフラインです。保存はこの端末の中だけに行います。", "You are offline. Work is saved on this device only."],
  "error.notFound": ["見つかりませんでした。", "Not found."],
  "error.unsupported": ["この端末では使えない機能です（{what}）。", "This device does not support {what}."],
  "error.decode": ["この素材を読めませんでした（{name}）。別の形式でお試しください。", "Could not decode {name}. Try another format."],
  "error.encode": ["書き出しの途中で映像を作れませんでした。", "Encoding failed while writing the video."],
  "error.tooLarge": ["ファイルが大きすぎます（{size}）。", "That file is too large ({size})."],
  "error.noWebCodecs": ["この端末は WebCodecs に対応していません。実時間の書き出しをお試しください。", "This device has no WebCodecs. Try the realtime export instead."],
  "error.noCaptureStream": ["iPhone / iPad では実時間の書き出しが使えません。精密な書き出しをお選びください。", "Realtime export is unavailable on iPhone and iPad. Please choose the precise export."],
  "error.permissionDenied": ["許可が下りませんでした。ブラウザの設定を確かめてください。", "Permission was denied. Check your browser settings."],
  "error.storageFull": ["保存できる空きがありません。古いプロジェクトを消してください。", "Out of storage. Delete an old project to make room."],
  "error.aborted": ["中止しました。", "Cancelled."],
  "error.timeout": ["時間内に終わりませんでした。", "The operation timed out."],
  "error.invalidFile": ["この形式のファイルは読めません。", "That file type cannot be opened."],
  "error.exportFailed": ["書き出しに失敗しました: {reason}", "Export failed: {reason}"],
  "error.saveFailed": ["保存に失敗しました。もう一度お試しください。", "Could not save. Please try again."],
  "error.glFailed": ["描画の初期化に失敗しました。ページを開き直してください。", "Could not start the renderer. Please reload the page."],

  /* ── 17. AI 自動編集（何をする機能かを丁寧に書く）─────────────── */
  "ai.title": ["AI 自動編集", "AI auto-edit"],
  "ai.subtitle": ["やりたいことを書くと、編集の手順に直して当てます。", "Describe what you want and it becomes a set of edits."],
  "ai.promptPlaceholder": ["例: 無音を詰めて、曲に合わせて切って、字幕を付ける", "e.g. cut the silence, sync to the beat, add captions"],
  "ai.run": ["下書きを作る", "Make a draft"],
  "ai.running": ["考えています…", "Thinking…"],
  "ai.stop": ["やめる", "Stop"],
  "ai.apply": ["この手順を当てる", "Apply these edits"],
  "ai.revert": ["当てる前に戻す", "Revert"],
  "ai.plan": ["手順", "Plan"],
  "ai.stepCount": ["{n} 手順", "{n} steps"],
  "ai.explainAutoCut": ["長い間や言い直しを見つけて詰めます。元の素材は傷つけません。", "Finds long pauses and retakes and tightens them. Your source media is never changed."],
  "ai.explainSilence": ["音の小さい所を無音として切り、前後に少し余白を残します。", "Cuts quiet passages, keeping a little air before and after."],
  "ai.explainBeat": ["曲の拍を数えて、切り替えを拍に合わせます。", "Finds the beats in the music and lands your cuts on them."],
  "ai.explainCaptions": ["話し声から字幕を作り、読みやすい長さで折り返します。", "Builds captions from speech and wraps them to a readable length."],
  "ai.explainHighlight": ["動きと音の盛り上がりから見せ場を選びます。", "Picks highlights from motion and loudness."],
  "ai.explainBgm": ["BGM を足し、話し声の所だけ音量を下げます。", "Adds music and ducks it under the narration."],
  "ai.explainRatio": ["被写体を追って縦・横の画面比に作り直します。", "Reframes for another aspect ratio, following the subject."],
  "ai.explainColor": ["明るさと色を素材ごとにそろえます。", "Matches brightness and color across your clips."],
  "ai.explainTemplate": ["選んだ型に素材を流し込みます。", "Pours your media into the template you picked."],
  "ai.localOnly": ["この端末の中だけで解析します（外に出しません）。", "Analysis happens on this device only."],
  "ai.needsKey": ["文章の理解には鍵の設定が要ります。設定から入れてください。", "Understanding your text needs an API key. Add one in Settings."],
  "ai.failed": ["手順を作れませんでした。言い方を変えてお試しください。", "Could not build a plan. Try rephrasing."],
  "ai.done": ["当てました。取り消しは 1 回で戻せます。", "Applied. A single undo reverts all of it."],

  /* ── 18. 書き出し ──────────────────────────────────────────────── */
  "export.title": ["書き出し", "Export"],
  "export.preset": ["用途", "Preset"],
  "export.kind": ["種類", "Type"],
  "export.video": ["動画", "Video"],
  "export.still": ["静止画", "Still image"],
  "export.audioOnly": ["音声のみ", "Audio only"],
  "export.gif": ["GIF アニメ", "Animated GIF"],
  "export.subtitle": ["字幕", "Subtitles"],
  "export.projectFile": ["プロジェクト（.vqstudio）", "Project file (.vqstudio)"],
  "export.edl": ["編集内容（JSON）", "Edit list (JSON)"],
  "export.format": ["形式", "Format"],
  "export.mp4": ["MP4（H.264 + AAC）", "MP4 (H.264 + AAC)"],
  "export.webm": ["WebM（VP9 + Opus）", "WebM (VP9 + Opus)"],
  "export.png": ["PNG", "PNG"],
  "export.jpeg": ["JPEG", "JPEG"],
  "export.wav": ["WAV", "WAV"],
  "export.opus": ["Opus（軽い）", "Opus (small)"],
  "export.srt": ["SRT", "SRT"],
  "export.vtt": ["VTT", "VTT"],
  "export.resolution": ["解像度", "Resolution"],
  "export.fps": ["フレームレート", "Frame rate"],
  "export.bitrate": ["画質（ビットレート）", "Bitrate"],
  "export.quality": ["品質", "Quality"],
  "export.range": ["範囲", "Range"],
  "export.rangeAll": ["全体", "Whole project"],
  "export.rangeInOut": ["イン〜アウト", "In to out"],
  "export.rangeSelection": ["選んだクリップ", "Selected clips"],
  "export.sound": ["音", "Sound"],
  "export.soundInclude": ["音を含める", "Include audio"],
  "export.soundSilent": ["無音にする", "Silent"],
  "export.mode": ["やり方", "Method"],
  "export.modePrecise": ["精密（1 コマずつ確実に）", "Precise (frame accurate)"],
  "export.modeRealtime": ["実時間（速いが近似）", "Realtime (fast, approximate)"],
  "export.modePreciseHint": ["時間はかかりますが、コマ落ちも音ずれもありません。既定です。", "Slower, but no dropped frames and no audio drift. This is the default."],
  "export.modeRealtimeHint": ["再生しながら録ります。速い代わりに、時計のぶれがそのまま残ります。", "Records while playing back. Fast, but the wall clock’s jitter stays in the file."],
  "export.includeAssets": ["素材も一緒に詰める", "Bundle the media too"],
  "export.gifFps": ["GIF のコマ数", "GIF frame rate"],
  "export.gifWidth": ["GIF の横幅", "GIF width"],
  "export.gifDither": ["ディザ", "Dithering"],
  "export.gifLoop": ["繰り返す", "Loop"],
  "export.keepAwake": ["書き出し中は画面を寝かせない", "Keep the screen awake while exporting"],
  "export.start": ["書き出す", "Start export"],
  "export.progress": ["{percent}%（{frame} / {total} コマ）", "{percent}% ({frame} of {total} frames)"],
  "export.remaining": ["残り約 {eta}", "About {eta} left"],
  "export.doneMsg": ["書き出しました（{size}）。", "Done ({size})."],
  "export.again": ["もう一度書き出す", "Export again"],
  "export.saveTo": ["保存先を選ぶ", "Choose where to save"],

  /* ── 19. アカウント ────────────────────────────────────────────── */
  "account.welcome": ["ようこそ", "Welcome"],
  "account.start": ["はじめる", "Get started"],
  "account.login": ["ログイン", "Log in"],
  "account.logout": ["ログアウト", "Log out"],
  "account.guest": ["ゲストで試す", "Continue as guest"],
  "account.guestNote": ["ゲストでも編集は全部使えます。保存はこの端末の中だけです。", "Guests get every editing feature. Projects stay on this device."],
  "account.loginBenefit": ["ログインすると、プロジェクトの持ち出しと AI の回数が増えます。", "Logging in lets you take projects with you and raises your AI limits."],
  "account.signup": ["新規登録", "Sign up"],
  "account.grade": ["学年", "Grade"],
  "account.nickname": ["ニックネーム", "Nickname"],
  "account.password": ["パスワード", "Password"],
  "account.password2": ["パスワード（確認）", "Password (again)"],
  "account.email": ["メールアドレス", "Email"],
  "account.showPassword": ["パスワードを表示", "Show password"],
  "account.capsLock": ["Caps Lock が入っています", "Caps Lock is on"],
  "account.strength0": ["とても弱い", "Very weak"],
  "account.strength1": ["弱い", "Weak"],
  "account.strength2": ["ふつう", "Fair"],
  "account.strength3": ["強い", "Strong"],
  "account.strength4": ["とても強い", "Very strong"],
  "account.passwordRule": ["8 文字以上にしてください。", "Use at least 8 characters."],
  "account.code": ["認証コード", "Verification code"],
  "account.codeSent": ["{email} に 6 桁のコードを送りました。", "We sent a 6-digit code to {email}."],
  "account.codeExpires": ["あと {sec} 秒で期限切れ", "Expires in {sec}s"],
  "account.resend": ["コードを送り直す", "Resend code"],
  "account.resendWait": ["あと {sec} 秒で送り直せます", "You can resend in {sec}s"],
  "account.resendLeft": ["送り直しはあと {n} 回", "{n} resends left"],
  "account.attemptsLeft": ["あと {n} 回まで試せます", "{n} attempts left"],
  "account.verify": ["確認する", "Verify"],
  "account.pin": ["暗証番号", "PIN"],
  "account.pinHint": ["決めておくと、メールが使えないときでも本人確認できます（任意）。", "Set one and you can verify yourself even without email (optional)."],
  "account.consent": ["規約の同意", "Agreements"],
  "account.terms": ["利用規約に同意します", "I agree to the Terms"],
  "account.privacy": ["プライバシーポリシーに同意します", "I agree to the Privacy Policy"],
  "account.age": ["年齢の条件を満たしています", "I meet the age requirement"],
  "account.changePassword": ["パスワードを変える", "Change password"],
  "account.oldPassword": ["いまのパスワード", "Current password"],
  "account.newPassword": ["新しいパスワード", "New password"],
  "account.forgot": ["パスワードを忘れた", "Forgot your password?"],
  "account.resetTitle": ["パスワードの再設定", "Reset your password"],
  "account.loggedInAs": ["{name} でログイン中", "Signed in as {name}"],
  "account.wrongPassword": ["学年・ニックネーム・パスワードのどれかが違います。", "The grade, nickname or password does not match."],

  /* ── 20. 短絡キーの説明 ────────────────────────────────────────── */
  "shortcut.title": ["短絡キー", "Keyboard shortcuts"],
  "shortcut.playPause": ["再生 / 一時停止", "Play or pause"],
  "shortcut.jkl": ["逆再生 / 停止 / 早送り", "Reverse, stop, fast forward"],
  "shortcut.frame": ["1 コマ動かす", "Step one frame"],
  "shortcut.second": ["1 秒動かす", "Jump one second"],
  "shortcut.inOut": ["イン点・アウト点を打つ", "Mark in and out"],
  "shortcut.split": ["再生位置で分割", "Split at the playhead"],
  "shortcut.delete": ["削除", "Delete"],
  "shortcut.rippleDelete": ["詰めて削除", "Ripple delete"],
  "shortcut.undoRedo": ["取り消し / やり直し", "Undo and redo"],
  "shortcut.clipboard": ["コピー / 貼り付け / 切り取り", "Copy, paste, cut"],
  "shortcut.altDrag": ["Alt を押しながら引くと複製", "Hold Alt and drag to duplicate"],
  "shortcut.zoom": ["タイムラインの拡大・縮小", "Zoom the timeline"],
  "shortcut.fitAll": ["全体を表示", "Fit the whole timeline"],
  "shortcut.marker": ["マーカーを置く", "Drop a marker"],
  "shortcut.save": ["保存", "Save"],
  "shortcut.export": ["書き出し", "Export"],
  "shortcut.tools": ["道具を選ぶ（選択 / リップル / かみそり）", "Pick a tool (select, ripple, razor)"],
  "shortcut.fullscreen": ["全画面", "Fullscreen"],
  "shortcut.help": ["この一覧を出す", "Show this list"],

  /* ── 21. 知らせ（toast）────────────────────────────────────────── */
  "toast.saved": ["保存しました", "Saved"],
  "toast.copied": ["コピーしました", "Copied"],
  "toast.pasted": ["貼り付けました", "Pasted"],
  "toast.deleted": ["削除しました", "Deleted"],
  "toast.applied": ["適用しました", "Applied"],
  "toast.undone": ["取り消しました", "Undone"],
  "toast.redone": ["やり直しました", "Redone"],
  "toast.exported": ["書き出しました", "Exported"],
  "toast.imported": ["{n} 件の素材を読み込みました", "Imported {n} files"],
  "toast.nothingSelected": ["先にクリップを選んでください", "Select a clip first"],
  "toast.mobileHint": ["下のタブから選べます", "Use the tabs below"],
  "toast.offline": ["オフラインでも編集は続けられます", "You can keep editing offline"],

  /* ── 22. 設定 ──────────────────────────────────────────────────── */
  "settings.language": ["言語", "Language"],
  "settings.theme": ["見た目", "Appearance"],
  "settings.reducedMotion": ["動きを控える", "Reduce motion"],
  "settings.autosave": ["自動保存", "Autosave"],
  "settings.storage": ["保存領域", "Storage"],
  "settings.storageUsed": ["{used} / {total} を使用", "{used} of {total} used"],
  "settings.clearCache": ["一時ファイルを消す", "Clear temporary files"],
  "settings.about": ["このソフトについて", "About"],
  "settings.version": ["版 {version}", "Version {version}"],
  "settings.debug": ["開発者向けの記録", "Developer logging"]
};

/* ── 辞書の組み立て（対から 2 つの辞書へ。キー集合は必ず一致する）───── */
function build(index) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const k of Object.keys(TABLE)) out[k] = TABLE[k][index];
  return Object.freeze(out);
}

/** 契約どおりの公開辞書（読み取り専用） */
export const LOCALES = Object.freeze({ ja: build(0), en: build(1) });

/** 全キーの一覧（試験・キー漏れ探しに使う） */
export const KEYS = Object.freeze(Object.keys(TABLE));

/* ── いまの言語 ───────────────────────────────────────────────────── */

/** @type {"ja"|"en"} */
let current = DEFAULT_LOCALE;

/** 保存してあった選択を拾う（無い・読めないなら既定のまま） */
(function restore() {
  try {
    if (typeof localStorage === "undefined" || !localStorage) return;
    const v = localStorage.getItem(LOCALE_KEY);
    if (v && LOCALES[v]) current = v;
  } catch (e) { /* 読めない所（private mode 等）は既定でよい */ }
})();

/** @type {Set<Function>} */
const listeners = new Set();

/**
 * いまの言語。
 * @returns {"ja"|"en"}
 */
export function currentLocale() {
  return current;
}

/**
 * その言語を持っているか。
 * @param {string} l
 * @returns {boolean}
 */
export function hasLocale(l) {
  return Boolean(l && Object.prototype.hasOwnProperty.call(LOCALES, String(l)));
}

/**
 * 言語を変える。知らない言語は既定（ja）に落とす（落ちない）。
 * 画面の作り直しは呼び側の仕事。`onLocaleChange` で知らせる。
 * @param {string} l "ja" | "en"（"ja-JP" のような形も頭で判断する）
 * @returns {"ja"|"en"} 実際に選ばれた言語
 */
export function setLocale(l) {
  const raw = String(l == null ? "" : l).trim();
  let next = DEFAULT_LOCALE;
  if (hasLocale(raw)) next = raw;
  else {
    const head = raw.toLowerCase().split(/[-_]/)[0];
    if (hasLocale(head)) next = head;
  }
  if (next === current) return current;
  current = /** @type {"ja"|"en"} */ (next);

  try {
    if (typeof localStorage !== "undefined" && localStorage) localStorage.setItem(LOCALE_KEY, current);
  } catch (e) { /* 保存できなくても動作は続く */ }
  try {
    if (typeof document !== "undefined" && document.documentElement) document.documentElement.lang = current;
  } catch (e) { /* noop */ }

  for (const fn of Array.from(listeners)) {
    try { fn(current); } catch (e) { /* 1 人の失敗で他を止めない */ }
  }
  return current;
}

/**
 * 言語が変わったら呼ばれる。
 * @param {(locale: string) => void} fn
 * @returns {() => void} やめる関数
 */
export function onLocaleChange(fn) {
  if (typeof fn !== "function") return () => { };
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/* ── 文字を引く ───────────────────────────────────────────────────── */

/** `{name}` を差し込む。値が無い所は `{name}` を残す（気付けるように） */
function interpolate(s, vars) {
  if (!vars || typeof vars !== "object") return s;
  return s.replace(/\{(\w+)\}/g, (whole, name) => {
    const v = vars[name];
    if (v === undefined || v === null) return whole;
    return String(v);
  });
}

/**
 * 文言を引く。**未定義キーは key をそのまま返す**（画面に手掛かりが残る）。
 * @param {string} key 例 "btn.export"
 * @param {Record<string, string|number>} [vars] `{name}` に入れる値
 * @returns {string}
 */
export function t(key, vars) {
  const k = String(key == null ? "" : key);
  if (!k) return "";
  const dict = LOCALES[current] || LOCALES[DEFAULT_LOCALE];
  let s = dict[k];
  if (s === undefined) s = LOCALES[DEFAULT_LOCALE][k];   /* en に無ければ ja を見る */
  if (s === undefined) return interpolate(k, vars);      /* それでも無ければキー */
  return interpolate(s, vars);
}

/**
 * その言語で引く（言語を切り替えずに 1 回だけ別言語が欲しいとき）。
 * @param {string} locale
 * @param {string} key
 * @param {Record<string, string|number>} [vars]
 * @returns {string}
 */
export function tIn(locale, key, vars) {
  const dict = LOCALES[String(locale)] || LOCALES[DEFAULT_LOCALE];
  const k = String(key == null ? "" : key);
  const s = dict[k] !== undefined ? dict[k] : LOCALES[DEFAULT_LOCALE][k];
  return s === undefined ? interpolate(k, vars) : interpolate(s, vars);
}

/**
 * そのキーを持っているか（文言の入れ忘れ探し用）。
 * @param {string} key
 * @returns {boolean}
 */
export function has(key) {
  return Object.prototype.hasOwnProperty.call(TABLE, String(key));
}
