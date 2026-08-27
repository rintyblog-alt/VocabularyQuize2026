import React, { useMemo, useState } from "react";
import { Check, Heart, PartyPopper, Play, RotateCcw, X } from "lucide-react";
import { Demo, DocPage, LONG_JA, LONG_NAME, Section, SpecTable } from "./lib/Doc";
import {
  Alert, Avatar, Badge, Button, Card, Chip, Field, ListItem, Modal, Progress,
  Segmented, Slider, Switch, Tag, TextInput, useToast,
} from "../ui/components";
import { useCountUp } from "../ui/hooks";
import { usePrefs } from "../app/prefs";
import { WelcomeScreen } from "../features/auth";

/* ═══ Motion Lab ═══════════════════════════════════════════ */
export function LabMotion() {
  const [dur, setDur] = useState(280);
  const [dist, setDist] = useState(24);
  const [easing, setEasing] = useState("enter");
  const [effect, setEffect] = useState("fade-up");
  const [run, setRun] = useState(0);
  const [stagger, setStagger] = useState(60);
  const [score, setScore] = useState(0);
  const shownScore = useCountUp(86, 1100, score > 0);
  const [confetti, setConfetti] = useState(0);
  const toast = useToast();

  const easings: Record<string, string> = {
    standard: "cubic-bezier(0.2, 0.6, 0.1, 1)",
    enter: "cubic-bezier(0.16, 1, 0.3, 1)",
    exit: "cubic-bezier(0.5, 0, 0.75, 0.4)",
    spring: "cubic-bezier(0.34, 1.36, 0.34, 1)",
    linear: "linear",
  };
  const effects: Record<string, (d: number) => { from: string; to: string }> = {
    "fade-up": (d) => ({ from: `opacity:0; transform:translateY(${d}px)`, to: "opacity:1; transform:none" }),
    "fade-down": (d) => ({ from: `opacity:0; transform:translateY(-${d}px)`, to: "opacity:1; transform:none" }),
    "slide-left": (d) => ({ from: `opacity:0; transform:translateX(${d}px)`, to: "opacity:1; transform:none" }),
    scale: (d) => ({ from: `opacity:0; transform:scale(${1 - d / 100})`, to: "opacity:1; transform:none" }),
    blur: () => ({ from: "opacity:0; filter:blur(8px)", to: "opacity:1; filter:none" }),
  };
  const kf = effects[effect](dist);

  return (
    <DocPage
      kicker="Playground"
      title="Motion Lab"
      lede="Duration・Easing・距離・Staggerを変えて体感で決める実験室。ここで決めた値をトークンに昇格させる。"
      wide
    >
      <Section title="エントランス実験">
        <div style={{ display: "grid", gridTemplateColumns: "280px minmax(0,1fr)", gap: "var(--vq-sp-6)", alignItems: "start" }} className="lab-grid">
          <style>{`@media (max-width: 900px){ .lab-grid { grid-template-columns: 1fr !important; } } @keyframes lab-run-${run} { from { ${kf.from} } to { ${kf.to} } }`}</style>
          <Card>
            <div className="vq-stack" style={{ gap: "var(--vq-sp-6)" }}>
              <Field label={`Duration — ${dur}ms`}>
                {() => <Slider value={dur} min={80} max={900} step={20} onChange={(e) => setDur(Number(e.target.value))} aria-label="Duration" />}
              </Field>
              <Field label={`距離 — ${dist}px`}>
                {() => <Slider value={dist} min={4} max={64} step={4} onChange={(e) => setDist(Number(e.target.value))} aria-label="距離" />}
              </Field>
              <Field label={`Stagger — ${stagger}ms`}>
                {() => <Slider value={stagger} min={0} max={200} step={10} onChange={(e) => setStagger(Number(e.target.value))} aria-label="Stagger" />}
              </Field>
              <Field label="Easing">
                {() => (
                  <Segmented ariaLabel="Easing" value={easing} onChange={setEasing} items={Object.keys(easings).map((e) => ({ id: e, label: e }))} />
                )}
              </Field>
              <Field label="エフェクト">
                {() => (
                  <Segmented ariaLabel="エフェクト" value={effect} onChange={setEffect} items={Object.keys(effects).map((e) => ({ id: e, label: e }))} />
                )}
              </Field>
              <Button icon={<Play size={15} />} onClick={() => setRun((r) => r + 1)}>再生</Button>
            </div>
          </Card>
          <Card sunken style={{ minHeight: 320 }}>
            <div className="vq-stack" style={{ gap: "var(--vq-sp-4)" }}>
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={`${run}-${i}`}
                  style={{ animation: run ? `lab-run-${run} ${dur}ms ${easings[easing]} both` : "none", animationDelay: `${i * stagger}ms` }}
                >
                  <Card>
                    <ListItem
                      leading={<Avatar name={["あおい", "はるか", "けんた", "みなと"][i]} size="sm" />}
                      title={["英単語ターゲット1900 §1", "江戸幕府の成立", "mol計算 30問", "古典文法 助動詞"][i]}
                      description={`stagger ${i * stagger}ms`}
                    />
                  </Card>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </Section>

      <Section title="クイズフィードバック" desc="正解=pop・不正解=shake・スコア=カウントアップ・祝福=紙吹雪。">
        <Demo col>
          <div className="vq-row" style={{ gap: "var(--vq-sp-4)", flexWrap: "wrap" }}>
            <Button variant="success" icon={<Check size={14} />} onClick={() => setRun((r) => r + 1)}>正解pop</Button>
            <Button variant="danger-soft" icon={<X size={14} />} onClick={() => { const el = document.getElementById("lab-shake"); el?.classList.remove("lab-shaking"); void el?.offsetWidth; el?.classList.add("lab-shaking"); }}>不正解shake</Button>
            <Button variant="secondary" onClick={() => setScore((s) => s + 1)}>スコアreveal</Button>
            <Button variant="outline" icon={<PartyPopper size={14} />} onClick={() => setConfetti((c) => c + 1)}>紙吹雪</Button>
          </div>
          <style>{`.lab-shaking { animation: vq-shake 0.4s; } `}</style>
          <div className="vq-row" style={{ gap: "var(--vq-sp-6)", flexWrap: "wrap", position: "relative" }}>
            <button key={run} className="qz-choice is-correct" style={{ width: 240 }} disabled>
              <span className="qz-choice__key"><Check size={14} /></span> 相当な
            </button>
            <button id="lab-shake" className="qz-choice is-wrong" style={{ width: 240 }} disabled>
              <span className="qz-choice__key"><X size={14} /></span> わずかな
            </button>
            <div style={{ textAlign: "center", minWidth: 130 }}>
              <div className="vq-num" style={{ fontSize: 44, fontWeight: 800, color: "var(--vq-success)", lineHeight: 1 }}>{score ? shownScore : "–"}<span style={{ fontSize: 18 }}>%</span></div>
              <div style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)" }}>useCountUp 1.1s</div>
            </div>
            {confetti > 0 && (
              <div className="qz-confetti" key={confetti} aria-hidden>
                {Array.from({ length: 26 }).map((_, i) => (
                  <i key={i} style={{ left: `${(i * 137.5) % 100}%`, background: `var(--vq-chart-${(i % 6) + 1})`, ["--delay" as string]: `${(i % 9) * 0.1}s`, ["--dur" as string]: `${2 + (i % 5) * 0.3}s`, ["--rot" as string]: `${200 + ((i * 97) % 360)}deg` }} />
                ))}
              </div>
            )}
          </div>
        </Demo>
      </Section>

      <Section title="オーバーレイ遷移">
        <OverlayMotionDemo />
      </Section>
    </DocPage>
  );
}

function OverlayMotionDemo() {
  const [modal, setModal] = useState(false);
  const toast = useToast();
  return (
    <Demo>
      <Button variant="outline" onClick={() => setModal(true)}>Modal (scale-in 280ms)</Button>
      <Button variant="outline" onClick={() => toast({ title: "トースト遷移", description: "spring in / exit out", tone: "success" })}>Toast (spring)</Button>
      <Modal open={modal} onClose={() => setModal(false)} title="モーダル遷移" description="enter: scale 0.96→1 + fade / exit: 逆再生 170ms" footer={<Button onClick={() => setModal(false)}>閉じる</Button>} />
    </Demo>
  );
}

/* ═══ Responsive Lab ═══════════════════════════════════════ */
export function LabResponsive() {
  const [w, setW] = useState(390);
  return (
    <DocPage
      kicker="Playground"
      title="Responsive Lab"
      lede="同じ画面をコンテナ幅だけ変えて並べる。ブレークポイントの挙動（サイドバー消滅・Bottom Nav出現・1カラム化）をここで確認する。"
      wide
    >
      <Section title="幅スライダー" desc="Welcome画面を任意の幅で。375〜1440pxをドラッグで往復してみてください。">
        <Card>
          <div className="vq-row" style={{ gap: "var(--vq-sp-6)", marginBottom: "var(--vq-sp-5)" }}>
            <span className="vq-num" style={{ font: "var(--vq-type-label)", width: 70 }}>{w}px</span>
            <Slider value={w} min={320} max={1440} step={10} onChange={(e) => setW(Number(e.target.value))} aria-label="プレビュー幅" />
          </div>
          <div style={{ display: "flex", justifyContent: "center", background: "var(--vq-bg-canvas)", borderRadius: "var(--vq-r-lg)", padding: "var(--vq-sp-6)", overflowX: "auto" }}>
            <div className="device-frame" style={{ ["--frame-w" as string]: `${w}px`, flex: "0 0 auto", width: w }}>
              <div className="device-frame__bar"><span className="vq-num">{w}px</span></div>
              <div className="device-frame__viewport" style={{ height: 560, overflowY: "auto" }}>
                <WelcomeScreen />
              </div>
            </div>
          </div>
        </Card>
      </Section>
      <Section title="並列比較（375 / 768 / 1280）">
        <div style={{ display: "flex", gap: "var(--vq-sp-6)", overflowX: "auto", paddingBottom: "var(--vq-sp-4)" }}>
          {[375, 768, 1280].map((width) => (
            <div key={width} className="device-frame" style={{ ["--frame-w" as string]: `${width}px`, width, flex: "0 0 auto" }}>
              <div className="device-frame__bar"><span className="vq-num">{width}px</span></div>
              <div className="device-frame__viewport" style={{ height: 480, overflowY: "auto" }}>
                <WelcomeScreen />
              </div>
            </div>
          ))}
        </div>
      </Section>
    </DocPage>
  );
}

/* ═══ Japanese Text Stress Test ════════════════════════════ */
export function LabStress() {
  const LONG_URL = "https://vocabuquiz.com/quiz/share/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9-very-long-share-token-1234567890";
  const LONG_MAIL = "aoi.nakamura.english.study.2026@very-long-highschool-domain.ed.jp";
  return (
    <DocPage
      kicker="Playground"
      title="Japanese Text Test"
      lede="極端な日本語コンテンツでUIが壊れないかの検査場。新コンポーネントはここに追加してから出荷する。"
    >
      <Section title="長いタイトル">
        <Demo col>
          <Card style={{ maxWidth: 420 }}>
            <h3 className="qz-quizcard__title vq-clamp-2">{LONG_JA}</h3>
            <p style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)", marginTop: 8 }}>vq-clamp-2 で2行に制限（全文はツールチップ/詳細で）</p>
          </Card>
          <div className="vq-row" style={{ gap: "var(--vq-sp-4)", maxWidth: 420, minWidth: 0 }}>
            <Avatar name={LONG_NAME} size="sm" />
            <span className="vq-truncate" style={{ font: "var(--vq-type-label)" }}>{LONG_NAME}</span>
            <Badge tone="accent">高3</Badge>
          </div>
        </Demo>
      </Section>
      <Section title="ボタン内の長文">
        <Demo>
          <Button style={{ maxWidth: 260 }}><span className="vq-truncate">間違えた問題だけをもう一度復習して弱点を克服する</span></Button>
          <Button variant="outline" style={{ maxWidth: 200 }}><span className="vq-truncate">{LONG_JA}</span></Button>
          <Button size="sm">一</Button>
          <Chip>あ</Chip>
        </Demo>
      </Section>
      <Section title="長いエラーメッセージ / 説明文">
        <Demo col style={{ maxWidth: 480 }}>
          <Field
            label="クイズ名"
            error="クイズ名には使用できない文字（機種依存文字・制御文字）が含まれています。丸数字や旧字体の一部は、他の端末で正しく表示されない可能性があるため使用できません。全角・半角の英数字、ひらがな、カタカナ、常用漢字をお使いください。"
          >
            {(a) => <TextInput id={a.id} invalid defaultValue="①英単語テスト㊤" />}
          </Field>
          <Alert tone="warning" title="保存されていない変更が3件あります">
            このページを離れると、問題3「江戸幕府の職制について〜」への変更、問題7の解説の編集、およびタグの変更（「定期考査」の追加）が失われます。下書きとして保存するか、破棄するかを選んでください。
          </Alert>
        </Demo>
      </Section>
      <Section title="件数の極端値">
        <Demo>
          <Badge>0件</Badge>
          <Badge tone="accent">1件</Badge>
          <Badge tone="accent">999件</Badge>
          <Badge tone="accent">9,999+件</Badge>
          <Badge tone="qredit">1,234,567 Q</Badge>
        </Demo>
      </Section>
      <Section title="URL・メール・混在">
        <Demo col style={{ maxWidth: 440 }}>
          <Card sunken>
            <p style={{ font: "var(--vq-type-body-sm)", overflowWrap: "anywhere" }}>{LONG_URL}</p>
          </Card>
          <Card sunken>
            <p style={{ font: "var(--vq-type-body-sm)", overflowWrap: "anywhere" }}>{LONG_MAIL}</p>
          </Card>
          <Card sunken>
            <p style={{ font: "var(--vq-type-body-sm)" }}>
              英単語 “ambiguous” の意味は「曖昧な」。The instructions were ambiguous, so 生徒たちは混乱した。数式 y = ax² + bx + c と記号 ≠ ≒ ∴ も混在するテキスト。
            </p>
          </Card>
        </Demo>
      </Section>
      <Section title="特殊状態のユーザー">
        <Demo col style={{ maxWidth: 440 }}>
          <ListItem leading={<Avatar name="削除済み" size="sm" />} title={<span style={{ color: "var(--vq-text-tertiary)" }}>削除されたユーザー</span>} description="この投稿は残っています" trailing={<Badge>退会済み</Badge>} />
          <ListItem leading={<Avatar name="非公開" size="sm" />} title="非公開ユーザー" description="プロフィールは非公開に設定されています" trailing={<Badge tone="outline">非公開</Badge>} />
          <ListItem leading={<Avatar name="？" size="sm" />} title={<i style={{ color: "var(--vq-text-tertiary)" }}>未設定</i>} description="表示名がまだ設定されていません" />
        </Demo>
      </Section>
      <Section title="改行を含む問題文">
        <Demo>
          <Card style={{ maxWidth: 520 }}>
            <p style={{ whiteSpace: "pre-wrap", font: "var(--vq-type-body-lg)", fontSize: 15.5 }}>
              {"次の英文を読み、下線部の意味として最も適切なものを選びなさい。\n\n  The committee made a substantial contribution\n  to the project.\n\n(注) committee: 委員会"}
            </p>
          </Card>
        </Demo>
      </Section>
    </DocPage>
  );
}

/* ═══ Theme Lab ════════════════════════════════════════════ */
export function LabTheme() {
  const prefs = usePrefs();
  return (
    <DocPage
      kicker="Playground"
      title="Theme Lab"
      lede="Light / Dark と密度の組み合わせを、代表コンポーネントで一括確認する。切り替えてもレイアウトが動かないことが合格条件。"
    >
      <Section title="切り替え">
        <Demo>
          <Segmented
            ariaLabel="テーマ"
            value={prefs.theme}
            onChange={(v) => prefs.set({ theme: v as "light" | "dark" })}
            items={[{ id: "light", label: "ライト" }, { id: "dark", label: "ダーク" }]}
          />
          <Segmented
            ariaLabel="密度"
            value={prefs.density}
            onChange={(v) => prefs.set({ density: v as "comfortable" | "compact" })}
            items={[{ id: "comfortable", label: "標準" }, { id: "compact", label: "コンパクト" }]}
          />
          <Switch label="モーション最小化" checked={prefs.motion === "off"} onChange={(e) => prefs.set({ motion: e.target.checked ? "off" : "on" })} />
        </Demo>
      </Section>
      <Section title="代表コンポーネント一括ビュー">
        <Demo col>
          <div className="vq-wrap" style={{ gap: "var(--vq-sp-4)" }}>
            <Button>主要アクション</Button>
            <Button variant="secondary">セカンダリ</Button>
            <Button variant="outline">アウトライン</Button>
            <Button variant="danger">削除</Button>
            <Badge tone="accent">公式</Badge>
            <Badge tone="success" dot>公開中</Badge>
            <Badge tone="ai">AI生成</Badge>
            <Badge tone="qredit">1,250 Q</Badge>
            <Tag onRemove={() => {}}>定期考査</Tag>
          </div>
          <div className="vq-row" style={{ gap: "var(--vq-sp-5)", flexWrap: "wrap" }}>
            <TextInput placeholder="入力欄" aria-label="入力欄" style={{ width: 200 }} />
            <TextInput placeholder="エラー状態" invalid aria-label="エラー" style={{ width: 200 }} />
            <Progress value={64} label="進捗 64%" />
          </div>
          <div className="vq-row" style={{ gap: "var(--vq-sp-5)", flexWrap: "wrap" }}>
            <button className="qz-choice is-correct" style={{ width: 220, marginBottom: 0 }} disabled><span className="qz-choice__key"><Check size={14} /></span> 正解の選択肢</button>
            <button className="qz-choice is-wrong" style={{ width: 220, marginBottom: 0 }} disabled><span className="qz-choice__key"><X size={14} /></span> 不正解の選択肢</button>
          </div>
        </Demo>
      </Section>
      <Section title="チェック項目">
        <SpecTable
          head={["項目", "基準"]}
          rows={[
            ["コントラスト", "ダークでも本文 4.5:1 を維持（トークンで保証済み）"],
            ["影", "ダークでは影を強めず、サーフェス階調で層を表現"],
            ["チャート色", "ダーク専用の6色（明度帯を再調整・CVD検証済）に自動切替"],
            ["純黒・純白", "使わない。背景 #17161D / テキスト #F5F2FA（ダークラベンダー）"],
          ]}
        />
      </Section>
    </DocPage>
  );
}
