import React, { useEffect, useState } from "react";
import { ArrowRight, RotateCcw } from "lucide-react";
import { Button } from "../ui/components";
import { Illus } from "../ui/illustrations";
import type { IllusName } from "../ui/illustrations";

/*
  Splash → イントロ3枚 → 完了。
  初回起動のプロダクトツアー。全ステップスキップ可能。
  （登録後の学年・目標などの初期設定は Screens > Onboarding 設定 を参照）
*/

const SLIDES: { illus: IllusName; title: string; desc: string }[] = [
  {
    illus: "create",
    title: "教材から、クイズがすぐできる",
    desc: "プリントやPDFを読み取って、AIが問題に変換。手作業の単語カードづくりは、もう必要ありません。",
  },
  {
    illus: "analyze",
    title: "苦手が、ひと目でわかる",
    desc: "解答の記録から苦手な分野を自動で分析。間違えた問題だけを集めて、効率よく復習できます。",
  },
  {
    illus: "coach",
    title: "AIが、次の一歩を提案",
    desc: "今日なにを勉強するべきかをAIが提案。1日10分から、テスト勉強を続けられる形にします。",
  },
];

type Phase = "splash" | 0 | 1 | 2 | "done";

export function IntroFlow() {
  const [phase, setPhase] = useState<Phase>("splash");

  /* Splash は短く自動で進む（タップでも進める） */
  useEffect(() => {
    if (phase !== "splash") return;
    const t = setTimeout(() => setPhase(0), 1600);
    return () => clearTimeout(t);
  }, [phase]);

  if (phase === "splash") {
    return (
      <button className="qz-splash" style={{ border: 0, width: "100%", cursor: "pointer", font: "inherit", color: "inherit" }} onClick={() => setPhase(0)} aria-label="タップしてはじめる">
        <div className="qz-splash__inner">
          <div className="qz-splash__logo">VQ</div>
          <div className="qz-splash__name">VocabuQuiz</div>
          <div className="qz-splash__tag">テスト勉強を、クイズで楽しく速く。</div>
        </div>
        <div className="qz-splash__foot">
          <span style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)" }}>v26.0</span>
        </div>
      </button>
    );
  }

  if (phase === "done") {
    return (
      <div className="qz-ob">
        <div className="qz-ob__slide">
          <div className="qz-ob__illus"><Illus name="done" size={220} /></div>
          <h1 className="qz-ob__title">準備ができました！</h1>
          <p className="qz-ob__desc">アカウントを作成すると、学習の記録が保存されます。まずはゲストで試すこともできます。</p>
        </div>
        <div className="qz-ob__foot">
          <Button size="lg" full>アカウントを作成</Button>
          <Button size="lg" variant="secondary" full>ログイン</Button>
          <Button variant="ghost" full icon={<RotateCcw size={14} />} onClick={() => setPhase("splash")}>もう一度見る</Button>
        </div>
      </div>
    );
  }

  const i = phase;
  const slide = SLIDES[i];
  return (
    <div className="qz-ob">
      <div className="qz-ob__bar">
        {i > 0 ? (
          <Button variant="ghost" size="sm" onClick={() => setPhase((i - 1) as Phase)}>戻る</Button>
        ) : <span />}
        <span className="vq-grow" />
        <Button variant="ghost" size="sm" onClick={() => setPhase("done")}>スキップ</Button>
      </div>

      <div className="qz-ob__slide" key={i}>
        <div className="qz-ob__illus"><Illus name={slide.illus} size={230} /></div>
        <h1 className="qz-ob__title">{slide.title}</h1>
        <p className="qz-ob__desc">{slide.desc}</p>
      </div>

      <div className="qz-ob__dots" aria-label={`ページ ${i + 1} / ${SLIDES.length}`} role="img">
        {SLIDES.map((_, d) => <i key={d} className={d === i ? "is-active" : ""} />)}
      </div>
      <div className="qz-ob__foot">
        <Button
          size="lg" full trailingIcon={<ArrowRight size={16} />}
          onClick={() => setPhase(i === SLIDES.length - 1 ? "done" : ((i + 1) as Phase))}
        >
          {i === SLIDES.length - 1 ? "はじめる" : "次へ"}
        </Button>
      </div>
    </div>
  );
}
