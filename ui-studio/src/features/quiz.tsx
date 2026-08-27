import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowRight, BookOpen, Bookmark, Calendar, Check, ChevronDown,
  ChevronUp, Clock, Coins, Flag, Flame, LayoutGrid, List as ListIcon, Maximize2,
  Minimize2, Pause, Play, RotateCcw, Rows3, Search as SearchIcon, Share2,
  SlidersHorizontal, Sparkles, Star, Timer, Trophy, X, Zap,
} from "lucide-react";
import { Illus } from "../ui/illustrations";
import {
  Alert, Badge, BarChart, Button, Card, Chip, Divider, Drawer, EmptyState,
  HBarList, IconButton, Kbd, ListItem, Modal, OfflineState, Progress, Ring,
  SearchInput, Segmented, Select, Skeleton, Spinner, StatCard, Tabs, TextInput,
  Tooltip, useToast,
} from "../ui/components";
import { useCountUp, useCountdown } from "../ui/hooks";
import { AppFrame } from "./shell";
import { PLAYER_QUIZ, QUIZZES, WEEK_STUDY } from "../mocks/data";
import type { MockQuiz, QuizQuestion } from "../mocks/data";

/* ═══ Home Dashboard ═══════════════════════════════════════ */
export function HomeScreen() {
  return (
    <AppFrame active="home" title="ホーム">
      <div>
        <div className="qz-home__hero">
          <div>
            <div style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)", marginBottom: 4 }}>7月22日(水) · 期末考査まで9日</div>
            <h1 style={{ font: "var(--vq-type-heading-xl)", letterSpacing: "-0.015em" }}>おかえりなさい、あおいさん</h1>
          </div>
          <Badge tone="qredit"><Coins size={12} /> 1,250 Qredit</Badge>
        </div>

        <div className="qz-stat-row">
          <StatCard label="今日の学習" value="12" unit="分 / 目標30分" tone="accent" icon={<Clock size={15} />} />
          <StatCard label="連続学習" value="18" unit="日" tone="success" icon={<Flame size={15} />} />
          <StatCard label="今週の問題数" value="740" unit="問" delta={18} deltaLabel="先週比" icon={<BookOpen size={15} />} />
          <StatCard label="週間正答率" value="76" unit="%" delta={4} deltaLabel="先週比" icon={<Trophy size={15} />} />
        </div>

        <div className="qz-home__grid">
          <div className="vq-stack" style={{ gap: "var(--vq-sp-6)" }}>
            <div className="qz-continue">
              <span style={{ display: "grid", placeItems: "center", width: 42, height: 42, borderRadius: "var(--vq-r-md)", background: "var(--vq-accent)", color: "var(--vq-accent-contrast)", flex: "0 0 auto" }}>
                <Play size={19} />
              </span>
              <div className="vq-grow" style={{ minWidth: 0 }}>
                <div style={{ font: "var(--vq-type-label)", fontSize: 14 }} className="vq-truncate">続きから: 共通テスト英語 語彙レベル判定</div>
                <div style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-secondary)", marginTop: 2 }}>残り34問 · 前回 18分前に中断</div>
              </div>
              <Button size="sm">再開する</Button>
            </div>

            <Alert tone="ai" title="AIからの提案" actions={<Button size="sm" variant="secondary" icon={<Sparkles size={13} />}>復習セットを開く</Button>}>
              「古典文法・助動詞」の正答率が3回連続で下がっています。10問の復習セット（約4分）を用意しました。
            </Alert>

            <Card>
              <div className="vq-row" style={{ justifyContent: "space-between", marginBottom: "var(--vq-sp-5)" }}>
                <h2 style={{ font: "var(--vq-type-heading-sm)" }}>今週の学習時間</h2>
                <Badge tone="outline">合計 5.6時間</Badge>
              </div>
              <BarChart labels={WEEK_STUDY.labels} series={[{ name: "分", values: WEEK_STUDY.minutes }]} unit="分" height={170} />
            </Card>

            <Card pad={false}>
              <div className="vq-row" style={{ justifyContent: "space-between", padding: "var(--vq-sp-6) var(--vq-sp-6) var(--vq-sp-4)" }}>
                <h2 style={{ font: "var(--vq-type-heading-sm)" }}>最近のクイズ</h2>
                <Button variant="link" size="sm">すべて見る</Button>
              </div>
              {QUIZZES.slice(0, 3).map((q, i) => (
                <React.Fragment key={q.id}>
                  {i > 0 && <Divider />}
                  <ListItem
                    leading={<span style={{ display: "grid", placeItems: "center", width: 36, height: 36, borderRadius: "var(--vq-r-md)", background: "var(--vq-accent-subtle)", color: "var(--vq-accent-text)", flex: "0 0 auto" }}><BookOpen size={16} /></span>}
                    title={q.title}
                    description={`${q.subject} · ${q.questions}問 · 平均正答率${q.accuracy}%`}
                    trailing={<Button size="sm" variant="outline">開始</Button>}
                    onClick={() => {}}
                  />
                </React.Fragment>
              ))}
            </Card>
          </div>

          <div className="vq-stack" style={{ gap: "var(--vq-sp-6)" }}>
            <Card>
              <div className="vq-row" style={{ justifyContent: "space-between", marginBottom: "var(--vq-sp-4)" }}>
                <h2 style={{ font: "var(--vq-type-heading-sm)" }}>試験カレンダー</h2>
                <Calendar size={15} style={{ color: "var(--vq-text-tertiary)" }} />
              </div>
              <div className="vq-stack" style={{ gap: "var(--vq-sp-4)" }}>
                {[
                  { d: "7/31", name: "期末考査 英語C III", left: "9日", tone: "warning" as const },
                  { d: "8/2", name: "期末考査 日本史探究", left: "11日", tone: "neutral" as const },
                  { d: "8/24", name: "全国模試", left: "33日", tone: "neutral" as const },
                ].map((e) => (
                  <div key={e.name} className="vq-row" style={{ gap: "var(--vq-sp-4)" }}>
                    <span className="vq-num" style={{ font: "var(--vq-type-label)", width: 40, color: "var(--vq-text-tertiary)" }}>{e.d}</span>
                    <span className="vq-grow vq-truncate" style={{ font: "var(--vq-type-body-sm)", fontWeight: 550 }}>{e.name}</span>
                    <Badge tone={e.tone}>あと{e.left}</Badge>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <h2 style={{ font: "var(--vq-type-heading-sm)", marginBottom: "var(--vq-sp-4)" }}>苦手トップ3</h2>
              <HBarList
                items={[
                  { label: "古典・助動詞", value: 42, tone: "danger" },
                  { label: "英語・整序", value: 51, tone: "warning" },
                  { label: "数学・三角関数", value: 58, tone: "warning" },
                ]}
              />
              <Button variant="secondary" size="sm" full style={{ marginTop: "var(--vq-sp-5)" }} icon={<RotateCcw size={13} />}>
                間違えた問題を復習
              </Button>
            </Card>
            <Card sunken>
              <div className="vq-row" style={{ gap: "var(--vq-sp-4)" }}>
                <Flame size={16} style={{ color: "var(--vq-warning)" }} />
                <p style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-secondary)" }}>
                  フォロー中の <b>はるか_study</b> さんが「江戸幕府の成立」を更新しました（12分前）
                </p>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </AppFrame>
  );
}

/* ═══ Quiz Library ═════════════════════════════════════════ */
type LibState = "normal" | "loading" | "empty" | "error" | "offline";

export function LibraryScreen() {
  const [q, setQ] = useState("");
  const [view, setView] = useState("grid");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [tab, setTab] = useState("all");
  const [state, setState] = useState<LibState>("normal");
  const [filterOpen, setFilterOpen] = useState(false);
  const toast = useToast();
  const SUBJECTS = ["英語", "数学", "国語", "日本史", "世界史", "情報", "化学", "生物", "公共", "保健"];
  const toggleSubject = (s: string) => setSubjects((c) => (c.includes(s) ? c.filter((x) => x !== s) : [...c, s]));

  const rows = useMemo(() => {
    let r = QUIZZES;
    if (tab === "official") r = r.filter((x) => x.official);
    if (tab === "fav") r = r.filter((x) => x.favorite);
    if (tab === "mine") r = r.filter((x) => x.author === "あおい");
    if (subjects.length) r = r.filter((x) => subjects.includes(x.subject));
    if (q) r = r.filter((x) => x.title.includes(q) || x.subject.includes(q) || x.author.includes(q));
    return r;
  }, [q, tab, subjects]);

  const effective = state === "empty" ? [] : rows;

  return (
    <AppFrame
      active="quiz"
      title="クイズライブラリ"
      topExtra={
        <Segmented
          ariaLabel="デモ状態"
          value={state}
          onChange={(v) => setState(v as LibState)}
          items={[
            { id: "normal", label: "通常" }, { id: "loading", label: "Loading" },
            { id: "empty", label: "0件" }, { id: "error", label: "Error" }, { id: "offline", label: "Offline" },
          ]}
        />
      }
    >
      <div>
        {state === "offline" && (
          <div style={{ marginBottom: "var(--vq-sp-5)" }}>
            <Alert tone="warning" title="オフラインです">保存済みのクイズのみ表示しています。接続が回復すると自動的に更新されます。</Alert>
          </div>
        )}

        <div className="qz-lib__toolbar">
          <div style={{ flex: "1 1 240px", maxWidth: 380 }}>
            <SearchInput value={q} onChange={setQ} placeholder="クイズ・作成者・科目を検索" />
          </div>
          <span className="qz-lib__sort">
            <Select size="md" defaultValue="popular" aria-label="並び順" style={{ width: 140 }}>
              <option value="popular">人気順</option>
              <option value="new">新着順</option>
              <option value="accuracy">正答率順</option>
            </Select>
          </span>
          <Button className="qz-lib__filterbtn" variant="outline" icon={<SlidersHorizontal size={15} />} onClick={() => setFilterOpen(true)}>
            絞り込み{subjects.length > 0 ? `（${subjects.length}）` : ""}
          </Button>
          <Segmented
            ariaLabel="表示形式"
            value={view}
            onChange={setView}
            items={[
              { id: "grid", label: "", icon: <LayoutGrid size={15} /> },
              { id: "list", label: "", icon: <ListIcon size={15} /> },
              { id: "compact", label: "", icon: <Rows3 size={15} /> },
            ]}
          />
        </div>

        <div className="vq-wrap qz-lib__chips" style={{ gap: "var(--vq-sp-3)", marginBottom: "var(--vq-sp-5)" }}>
          {SUBJECTS.map((s) => (
            <Chip key={s} selected={subjects.includes(s)} onClick={() => toggleSubject(s)}>
              {s}
            </Chip>
          ))}
        </div>

        {/* モバイル用フィルター Bottom Sheet */}
        <Modal
          open={filterOpen}
          onClose={() => setFilterOpen(false)}
          title="絞り込み"
          sheetGrab
          footer={
            <>
              <Button variant="ghost" onClick={() => setSubjects([])}>クリア</Button>
              <Button onClick={() => setFilterOpen(false)}>この条件で表示</Button>
            </>
          }
        >
          <div className="vq-stack" style={{ gap: "var(--vq-sp-5)" }}>
            <div>
              <div style={{ font: "var(--vq-type-label)", marginBottom: "var(--vq-sp-3)" }}>並び順</div>
              <Select size="md" defaultValue="popular" aria-label="並び順（シート）">
                <option value="popular">人気順</option>
                <option value="new">新着順</option>
                <option value="accuracy">正答率順</option>
              </Select>
            </div>
            <div>
              <div style={{ font: "var(--vq-type-label)", marginBottom: "var(--vq-sp-3)" }}>教科</div>
              <div className="vq-wrap" style={{ gap: "var(--vq-sp-3)" }}>
                {SUBJECTS.map((s) => (
                  <Chip key={s} selected={subjects.includes(s)} onClick={() => toggleSubject(s)}>{s}</Chip>
                ))}
              </div>
            </div>
          </div>
        </Modal>

        <Tabs
          ariaLabel="クイズの絞り込み"
          value={tab}
          onChange={setTab}
          items={[
            { id: "all", label: "すべて", count: QUIZZES.length },
            { id: "official", label: "公式", count: QUIZZES.filter((x) => x.official).length },
            { id: "fav", label: "お気に入り", count: QUIZZES.filter((x) => x.favorite).length },
            { id: "recent", label: "最近利用" },
            { id: "mine", label: "自作クイズ", count: 1 },
          ]}
        />
        <div style={{ height: "var(--vq-sp-6)" }} />

        {state === "loading" ? (
          <div className="qz-lib__grid" role="status" aria-label="読み込み中" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}>
                <Skeleton width={64} height={20} style={{ marginBottom: 12, borderRadius: 99 }} />
                <Skeleton width="90%" height={15} style={{ marginBottom: 8 }} />
                <Skeleton width="60%" height={15} style={{ marginBottom: 16 }} />
                <Skeleton width="45%" height={11} />
              </Card>
            ))}
          </div>
        ) : state === "error" ? (
          <Card pad={false}>
            <EmptyState
              illustration={<Illus name="error" size={170} />}
              title="クイズを読み込めませんでした"
              description="サーバーとの通信に失敗しました（ERR_TIMEOUT）。時間をおいて再試行してください。"
              actions={<><Button onClick={() => setState("normal")}>再試行</Button><Button variant="ghost">保存済みを開く</Button></>}
            />
          </Card>
        ) : effective.length === 0 ? (
          <Card pad={false}>
            <EmptyState
              illustration={<Illus name="empty" size={170} />}
              title={q ? `「${q}」に一致するクイズはありません` : "条件に一致するクイズはありません"}
              description="フィルターを減らすか、AIに新しいクイズを作らせることもできます。"
              actions={<><Button variant="outline" onClick={() => { setQ(""); setSubjects([]); setTab("all"); setState("normal"); }}>条件をクリア</Button><Button icon={<Sparkles size={15} />}>AIで生成</Button></>}
            />
          </Card>
        ) : view === "grid" ? (
          <div className="qz-lib__grid">
            {effective.map((r) => <QuizCard key={r.id} quiz={r} onFav={() => toast({ title: r.favorite ? "お気に入りから削除しました" : "お気に入りに追加しました", tone: "success" })} />)}
          </div>
        ) : (
          <Card pad={false}>
            {effective.map((r, i) => (
              <React.Fragment key={r.id}>
                {i > 0 && <Divider />}
                <ListItem
                  leading={<Badge tone="outline">{r.subject}</Badge>}
                  title={r.title}
                  description={view === "compact" ? undefined : `${r.author} · ${r.questions}問 · ${r.plays.toLocaleString()}回 · 正答率${r.accuracy}%`}
                  trailing={
                    <span className="vq-row" style={{ gap: "var(--vq-sp-2)" }}>
                      {r.official && <Badge tone="accent">公式</Badge>}
                      <Button size="sm" variant="outline">開始</Button>
                    </span>
                  }
                  onClick={() => {}}
                />
              </React.Fragment>
            ))}
          </Card>
        )}
      </div>
    </AppFrame>
  );
}

function QuizCard({ quiz, onFav }: { quiz: MockQuiz; onFav: () => void }) {
  const [fav, setFav] = useState(!!quiz.favorite);
  return (
    <Card hover className="qz-quizcard" as="article">
      <div className="vq-row" style={{ justifyContent: "space-between" }}>
        <Badge tone="outline" className="qz-quizcard__subject">{quiz.subject}</Badge>
        <IconButton
          size="sm"
          label={fav ? "お気に入りから削除" : "お気に入りに追加"}
          onClick={(e) => { e.stopPropagation(); setFav(!fav); onFav(); }}
        >
          <Star size={16} fill={fav ? "var(--vq-favorite)" : "none"} style={fav ? { color: "var(--vq-favorite)" } : undefined} />
        </IconButton>
      </div>
      <h3 className="qz-quizcard__title vq-clamp-2">{quiz.title}</h3>
      <div className="qz-quizcard__meta">
        <span>{quiz.author}</span>
        {quiz.official && <Badge tone="accent">公式</Badge>}
        <Badge tone={quiz.difficulty === "発展" ? "warning" : "neutral"}>{quiz.difficulty}</Badge>
      </div>
      <Divider />
      <div className="vq-row" style={{ justifyContent: "space-between" }}>
        <span className="vq-num" style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)" }}>
          {quiz.questions}問 · {quiz.plays.toLocaleString()}回
        </span>
        <Button size="sm">開始</Button>
      </div>
    </Card>
  );
}

/* ═══ Quiz Player ══════════════════════════════════════════ */
type Answer = { chosen: number[] | string | boolean | string[] | null; correct: boolean | null; flagged?: boolean };

function isCorrect(q: QuizQuestion, chosen: Answer["chosen"]): boolean {
  if (chosen == null) return false;
  if (q.type === "single" || q.type === "cloze") return Array.isArray(chosen) && Number(chosen[0]) === (q.answer as number[])[0];
  if (q.type === "multi") {
    const a = new Set(q.answer as number[]), c = new Set(chosen as number[]);
    return a.size === c.size && [...a].every((x) => c.has(x));
  }
  if (q.type === "bool") return chosen === q.answer;
  if (q.type === "text") return String(chosen).trim().toLowerCase() === String(q.answer).toLowerCase();
  if (q.type === "order") return JSON.stringify(chosen) === JSON.stringify(q.answer);
  return false;
}

export function PlayerScreen({ embedded }: { embedded?: boolean }) {
  const quiz = PLAYER_QUIZ;
  const total = quiz.questions.length;
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>(() => quiz.questions.map(() => ({ chosen: null, correct: null })));
  const [revealed, setRevealed] = useState(false);
  const [focus, setFocus] = useState(false);
  const [paused, setPaused] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [quitOpen, setQuitOpen] = useState(false);
  const [finished, setFinished] = useState(false);
  const [remaining] = useCountdown(quiz.timeLimitSec, !paused && !finished && !revealed);
  const q = quiz.questions[idx];
  const ans = answers[idx];
  const toast = useToast();

  const setChosen = (chosen: Answer["chosen"]) =>
    setAnswers((as) => as.map((a, i) => (i === idx ? { ...a, chosen } : a)));

  const submit = () => {
    if (ans.chosen == null || revealed) return;
    const ok = isCorrect(q, ans.chosen);
    setAnswers((as) => as.map((a, i) => (i === idx ? { ...a, correct: ok } : a)));
    setRevealed(true);
  };
  const next = () => {
    setRevealed(false);
    if (idx + 1 >= total) setFinished(true);
    else setIdx(idx + 1);
  };
  const skip = () => {
    setAnswers((as) => as.map((a, i) => (i === idx ? { ...a, chosen: null, correct: null } : a)));
    next();
  };

  /* キーボード操作 */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (finished || (e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "Enter") { e.preventDefault(); revealed ? next() : submit(); }
      if (!revealed && (q.type === "single" || q.type === "cloze" || q.type === "multi") && /^[1-9]$/.test(e.key)) {
        const n = Number(e.key) - 1;
        if (n < (q.choices?.length ?? 0)) {
          if (q.type === "multi") {
            const cur = new Set((ans.chosen as number[]) ?? []);
            cur.has(n) ? cur.delete(n) : cur.add(n);
            setChosen([...cur].sort());
          } else setChosen([n]);
        }
      }
      if (e.key.toLowerCase() === "f") setFocus((f) => !f);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  if (finished) return <ResultsView answers={answers} onRetry={() => { setAnswers(quiz.questions.map(() => ({ chosen: null, correct: null }))); setIdx(0); setFinished(false); setRevealed(false); }} />;

  const answeredCount = answers.filter((a) => a.correct != null).length;
  const mins = Math.floor(remaining / 60), secs = remaining % 60;

  const body = (
    <div className="qz-player">
      <div className="qz-player__bar">
        {!focus && (
          <>
            <IconButton label="終了する" size="sm" onClick={() => setQuitOpen(true)}><X size={17} /></IconButton>
            <span className="vq-truncate" style={{ font: "var(--vq-type-label)", fontSize: 13.5, maxWidth: 280 }}>{quiz.title}</span>
          </>
        )}
        <div className="qz-player__progress">
          <Progress value={((idx + (revealed ? 1 : 0)) / total) * 100} size="sm" label={`進捗 ${idx + 1} / ${total}`} />
        </div>
        <span className="vq-num" style={{ font: "var(--vq-type-caption)", fontWeight: 700, color: "var(--vq-text-secondary)" }}>{idx + 1} / {total}</span>
        <Ring value={remaining} max={quiz.timeLimitSec} size={40} stroke={3.5} tone={remaining < 30 ? "danger" : remaining < 90 ? "warning" : undefined}>
          {mins}:{String(secs).padStart(2, "0")}
        </Ring>
        <Tooltip content={paused ? "再開" : "一時停止"}>
          <IconButton label={paused ? "再開" : "一時停止"} size="sm" onClick={() => setPaused(!paused)}>
            {paused ? <Play size={16} /> : <Pause size={16} />}
          </IconButton>
        </Tooltip>
        <Tooltip content={focus ? "集中モードを解除 (F)" : "集中モード (F)"}>
          <IconButton label="集中モード" size="sm" active={focus} onClick={() => setFocus(!focus)}>
            {focus ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </IconButton>
        </Tooltip>
        {!focus && (
          <Tooltip content="問題一覧">
            <IconButton label="問題一覧" size="sm" onClick={() => setListOpen(true)}><ListIcon size={16} /></IconButton>
          </Tooltip>
        )}
      </div>

      {paused ? (
        <div className="qz-player__body" style={{ alignItems: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ font: "var(--vq-type-heading-lg)", marginBottom: "var(--vq-sp-4)" }}>一時停止中</div>
            <p style={{ color: "var(--vq-text-secondary)", marginBottom: "var(--vq-sp-6)" }}>タイマーは止まっています。問題文は再開まで非表示になります。</p>
            <Button icon={<Play size={15} />} onClick={() => setPaused(false)}>再開する</Button>
          </div>
        </div>
      ) : (
        <div className="qz-player__body">
          <div className="qz-player__stage" key={idx}>
            <div className="qz-player__qnum">
              <span>Q{idx + 1}</span>
              <Badge tone="outline">{q.category}</Badge>
              <span className="vq-grow" />
              <IconButton
                label={ans.flagged ? "フラグを外す" : "後で確認する"}
                size="sm"
                active={ans.flagged}
                onClick={() => setAnswers((as) => as.map((a, i) => (i === idx ? { ...a, flagged: !a.flagged } : a)))}
              >
                <Flag size={15} fill={ans.flagged ? "var(--vq-warning)" : "none"} style={ans.flagged ? { color: "var(--vq-warning)" } : undefined} />
              </IconButton>
            </div>
            <div className="qz-player__prompt">{q.prompt}</div>

            {(q.type === "single" || q.type === "cloze") && q.choices?.map((c, i) => {
              const sel = Array.isArray(ans.chosen) && (ans.chosen as number[]).includes(i);
              const correct = (q.answer as number[])[0] === i;
              const cls = revealed
                ? correct ? "is-correct" : sel ? "is-wrong" : "is-dim"
                : sel ? "is-selected" : "";
              return (
                <button key={i} className={`qz-choice ${cls}`} disabled={revealed} onClick={() => setChosen([i])}>
                  <span className="qz-choice__key">{revealed && correct ? <Check size={14} /> : revealed && sel && !correct ? <X size={14} /> : i + 1}</span>
                  {c}
                </button>
              );
            })}

            {q.type === "multi" && q.choices?.map((c, i) => {
              const sel = Array.isArray(ans.chosen) && (ans.chosen as number[]).includes(i);
              const correct = (q.answer as number[]).includes(i);
              const cls = revealed ? (correct ? "is-correct" : sel ? "is-wrong" : "is-dim") : sel ? "is-selected" : "";
              return (
                <button
                  key={i}
                  className={`qz-choice ${cls}`}
                  disabled={revealed}
                  onClick={() => {
                    const cur = new Set((ans.chosen as number[]) ?? []);
                    cur.has(i) ? cur.delete(i) : cur.add(i);
                    setChosen([...cur].sort());
                  }}
                  aria-pressed={sel}
                >
                  <span className="qz-choice__key">{revealed && correct ? <Check size={14} /> : i + 1}</span>
                  {c}
                  {sel && !revealed && <Check size={16} style={{ marginLeft: "auto", color: "var(--vq-accent)" }} />}
                </button>
              );
            })}

            {q.type === "bool" && (
              <div className="vq-row" style={{ gap: "var(--vq-sp-4)" }}>
                {[true, false].map((v) => {
                  const sel = ans.chosen === v;
                  const correct = q.answer === v;
                  const cls = revealed ? (correct ? "is-correct" : sel ? "is-wrong" : "is-dim") : sel ? "is-selected" : "";
                  return (
                    <button key={String(v)} className={`qz-choice ${cls}`} style={{ justifyContent: "center" }} disabled={revealed} onClick={() => setChosen(v)}>
                      {v ? "正しい" : "誤り"}
                    </button>
                  );
                })}
              </div>
            )}

            {q.type === "text" && (
              <TextInput
                size="lg"
                placeholder="回答を入力（Enterで確定）"
                aria-label="回答"
                value={typeof ans.chosen === "string" ? ans.chosen : ""}
                disabled={revealed}
                invalid={revealed && !ans.correct}
                onChange={(e) => setChosen(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
                autoFocus
              />
            )}

            {q.type === "order" && (
              <OrderQuestion q={q} chosen={ans.chosen as string[] | null} revealed={revealed} onChange={setChosen} />
            )}

            {revealed && (() => {
              /* 複数選択の「一部正解」は色だけでなく文言でも伝える */
              const partial =
                q.type === "multi" && !ans.correct && Array.isArray(ans.chosen) &&
                (ans.chosen as number[]).some((i) => (q.answer as number[]).includes(i));
              return (
                <div className="qz-explain">
                  <Alert
                    tone={ans.correct ? "success" : partial ? "warning" : "danger"}
                    title={
                      ans.correct ? "正解！"
                        : partial ? "一部正解 — 選択に過不足があります"
                        : q.type === "text" ? `不正解 — 正答: ${q.answer}` : "不正解"
                    }
                  >
                    {q.explanation}
                  </Alert>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      <div className="qz-player__foot">
        {!focus && (
          <span className="vq-row" style={{ gap: 6, font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)" }}>
            <Kbd>1</Kbd>–<Kbd>4</Kbd> 選択 <Kbd>Enter</Kbd> {revealed ? "次へ" : "解答"} <Kbd>F</Kbd> 集中
          </span>
        )}
        <span className="vq-grow" />
        {!revealed && <Button variant="ghost" onClick={skip}>スキップ</Button>}
        {revealed ? (
          <Button size="lg" onClick={next} trailingIcon={<ArrowRight size={16} />}>
            {idx + 1 >= total ? "結果を見る" : "次の問題"}
          </Button>
        ) : (
          <Button size="lg" disabled={ans.chosen == null || (typeof ans.chosen === "string" && !ans.chosen.trim())} onClick={submit}>
            解答する
          </Button>
        )}
      </div>

      <Drawer open={listOpen} onClose={() => setListOpen(false)} title={`問題一覧（${answeredCount}/${total} 解答済み）`}>
        <div className="vq-stack" style={{ gap: "var(--vq-sp-2)" }}>
          {quiz.questions.map((qq, i) => {
            const a = answers[i];
            return (
              <ListItem
                key={qq.id}
                leading={
                  <span
                    className="vq-num"
                    style={{
                      display: "grid", placeItems: "center", width: 28, height: 28, borderRadius: 8, flex: "0 0 auto",
                      font: "var(--vq-type-caption)", fontWeight: 700,
                      background: a.correct === true ? "var(--vq-quiz-correct-bg)" : a.correct === false ? "var(--vq-quiz-incorrect-bg)" : "var(--vq-surface-active)",
                      color: a.correct === true ? "var(--vq-quiz-correct)" : a.correct === false ? "var(--vq-quiz-incorrect)" : "var(--vq-text-tertiary)",
                    }}
                  >
                    {i + 1}
                  </span>
                }
                title={<span className="vq-truncate">{qq.prompt.split("\n")[0]}</span>}
                description={a.correct === true ? "正解" : a.correct === false ? "不正解" : "未回答"}
                trailing={a.flagged ? <Flag size={14} style={{ color: "var(--vq-warning)" }} /> : undefined}
                selected={i === idx}
                onClick={() => { setIdx(i); setRevealed(answers[i].correct != null); setListOpen(false); }}
              />
            );
          })}
        </div>
      </Drawer>

      <Modal
        open={quitOpen}
        onClose={() => setQuitOpen(false)}
        title="クイズを終了しますか？"
        description={`${answeredCount}問まで解答済みです。途中経過は保存され、あとから再開できます。`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setQuitOpen(false)}>続ける</Button>
            <Button variant="outline" onClick={() => { setQuitOpen(false); toast({ title: "途中経過を保存しました", tone: "success" }); }}>保存して終了</Button>
            <Button variant="danger" onClick={() => { setQuitOpen(false); setFinished(true); }}>採点して終了</Button>
          </>
        }
      />
    </div>
  );

  return embedded ? body : body;
}

/* 並べ替え問題 */
function OrderQuestion({ q, chosen, revealed, onChange }: { q: QuizQuestion; chosen: string[] | null; revealed: boolean; onChange: (v: string[]) => void }) {
  const items = chosen ?? (q.choices as string[]);
  useEffect(() => { if (!chosen) onChange(q.choices as string[]); }, []); // eslint-disable-line
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = items.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div role="list" aria-label="並べ替え">
      {items.map((it, i) => {
        const correctPos = revealed && (q.answer as string[])[i] === it;
        return (
          <div key={it} role="listitem" className={`qz-choice qz-order-item ${revealed ? (correctPos ? "is-correct" : "is-wrong") : ""}`} style={{ cursor: "default" }}>
            <span className="qz-choice__key">{i + 1}</span>
            <span className="vq-grow">{it}</span>
            {!revealed && (
              <span className="vq-row" style={{ gap: 2 }}>
                <IconButton size="sm" label={`「${it}」を上へ`} disabled={i === 0} onClick={() => move(i, -1)}><ChevronUp size={15} /></IconButton>
                <IconButton size="sm" label={`「${it}」を下へ`} disabled={i === items.length - 1} onClick={() => move(i, 1)}><ChevronDown size={15} /></IconButton>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ═══ Results ══════════════════════════════════════════════ */
export function ResultsView({ answers, onRetry }: { answers?: Answer[]; onRetry?: () => void }) {
  const quiz = PLAYER_QUIZ;
  const finalAnswers = answers ?? quiz.questions.map((q, i) => ({ chosen: q.answer as Answer["chosen"], correct: i !== 2 && i !== 4 }));
  const correct = finalAnswers.filter((a) => a.correct === true).length;
  const wrong = finalAnswers.filter((a) => a.correct === false).length;
  const un = finalAnswers.filter((a) => a.correct == null).length;
  const total = quiz.questions.length;
  const pct = Math.round((correct / total) * 100);
  const shown = useCountUp(pct, 1100);
  const [open, setOpen] = useState<number | null>(null);
  const high = pct >= 80;
  const toast = useToast();

  const catStats = useMemo(() => {
    const map = new Map<string, { ok: number; all: number }>();
    quiz.questions.forEach((q, i) => {
      const m = map.get(q.category) ?? { ok: 0, all: 0 };
      m.all++;
      if (finalAnswers[i].correct) m.ok++;
      map.set(q.category, m);
    });
    return [...map.entries()].map(([label, v]) => ({
      label, value: Math.round((v.ok / v.all) * 100),
      tone: (v.ok / v.all >= 0.8 ? "success" : v.ok / v.all >= 0.5 ? "accent" : "danger") as "success" | "accent" | "danger",
    }));
  }, [finalAnswers]); // eslint-disable-line

  return (
    <div className="qz-results" style={{ position: "relative" }}>
      {high && <Confetti />}
      <div className="qz-results__stage">
        <div className="qz-results__score">
          <div style={{ display: "grid", justifyItems: "center", marginBottom: "var(--vq-sp-2)" }}>
            <Illus name={high ? "trophy" : "analyze"} size={132} />
          </div>
          <Badge tone={high ? "success" : pct >= 50 ? "accent" : "warning"} dot>
            {high ? "すばらしい！" : pct >= 50 ? "あと少し" : "復習しよう"}
          </Badge>
          <div className="qz-results__big" style={{ color: high ? "var(--vq-success)" : "var(--vq-text)" }}>
            {shown}<span style={{ fontSize: "0.4em", fontWeight: 700 }}>%</span>
          </div>
          <div style={{ font: "var(--vq-type-body-md)", color: "var(--vq-text-secondary)", marginTop: 4 }}>
            {quiz.title} · 所要 3分42秒
          </div>
          <div style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)", marginTop: 6 }} className="vq-num">
            前回 62% から <b style={{ color: "var(--vq-success-text)" }}>+{Math.max(0, pct - 62)}pt</b> · 全体平均 69%
          </div>
        </div>

        <div className="qz-results__grid">
          <StatCard label="正解" value={correct} unit={`/ ${total}問`} tone="success" icon={<Check size={15} />} />
          <StatCard label="不正解" value={wrong} unit="問" icon={<X size={15} />} />
          <StatCard label="未回答" value={un} unit="問" icon={<Flag size={15} />} />
          <StatCard label="獲得" value="+30" unit="Qredit" tone="qredit" icon={<Coins size={15} />} />
        </div>

        <Card style={{ marginBottom: "var(--vq-sp-6)" }}>
          <h2 style={{ font: "var(--vq-type-heading-sm)", marginBottom: "var(--vq-sp-5)" }}>分野別の正答率</h2>
          <HBarList items={catStats} />
        </Card>

        {wrong > 0 && (
          <div style={{ marginBottom: "var(--vq-sp-6)" }}>
            <Alert
              tone="ai"
              title="AIからの復習提案"
              actions={<Button size="sm" variant="secondary" icon={<Sparkles size={13} />}>復習セットを作る</Button>}
            >
              正答率が低かった「{[...catStats].sort((a, b) => a.value - b.value)[0]?.label}」を中心に、
              間違えた{wrong}問の復習セット（約{Math.max(2, wrong * 1)}分）を用意できます。
            </Alert>
          </div>
        )}

        <Card pad={false} style={{ marginBottom: "var(--vq-sp-7)" }}>
          <div style={{ padding: "var(--vq-sp-6) var(--vq-sp-6) var(--vq-sp-3)", font: "var(--vq-type-heading-sm)" }}>問題ごとの振り返り</div>
          {quiz.questions.map((q, i) => {
            const a = finalAnswers[i];
            const isOpen = open === i;
            return (
              <div key={q.id} className="qz-review-q">
                <button className="qz-review-q__head" onClick={() => setOpen(isOpen ? null : i)} aria-expanded={isOpen}>
                  <span
                    style={{
                      display: "grid", placeItems: "center", width: 26, height: 26, borderRadius: 8, flex: "0 0 auto",
                      background: a.correct ? "var(--vq-quiz-correct-bg)" : a.correct === false ? "var(--vq-quiz-incorrect-bg)" : "var(--vq-surface-active)",
                      color: a.correct ? "var(--vq-quiz-correct)" : a.correct === false ? "var(--vq-quiz-incorrect)" : "var(--vq-text-tertiary)",
                    }}
                  >
                    {a.correct ? <Check size={14} /> : a.correct === false ? <X size={14} /> : "–"}
                  </span>
                  <span className="vq-grow vq-truncate">Q{i + 1}. {q.prompt.split("\n")[0]}</span>
                  <ChevronDown size={15} style={{ color: "var(--vq-text-tertiary)", transform: isOpen ? "rotate(180deg)" : "none", transition: "transform var(--vq-dur-normal)" }} />
                </button>
                {isOpen && (
                  <div className="qz-review-q__body">
                    <p style={{ whiteSpace: "pre-wrap", font: "var(--vq-type-body-sm)", marginBottom: "var(--vq-sp-4)" }}>{q.prompt}</p>
                    <div style={{ font: "var(--vq-type-body-sm)", marginBottom: "var(--vq-sp-4)" }}>
                      <span style={{ color: "var(--vq-text-tertiary)" }}>あなたの回答: </span>
                      <b>{a.chosen == null ? "（未回答）" : Array.isArray(a.chosen) && q.choices ? (a.chosen as number[]).map((n) => q.choices?.[n] ?? n).join(", ") : String(a.chosen)}</b>
                      {a.correct === false && q.choices && Array.isArray(q.answer) && typeof (q.answer as number[])[0] === "number" && (
                        <> · <span style={{ color: "var(--vq-text-tertiary)" }}>正答: </span><b style={{ color: "var(--vq-quiz-correct)" }}>{(q.answer as number[]).map((n) => q.choices?.[n]).join(", ")}</b></>
                      )}
                    </div>
                    <Alert tone="info" title="解説">{q.explanation}</Alert>
                  </div>
                )}
              </div>
            );
          })}
        </Card>

        <div className="vq-wrap" style={{ gap: "var(--vq-sp-4)", justifyContent: "center" }}>
          <Button size="lg" icon={<RotateCcw size={15} />} onClick={onRetry}>もう一度挑戦</Button>
          <Button size="lg" variant="secondary" disabled={wrong === 0}>間違えた{wrong}問だけ挑戦</Button>
          <Button variant="outline" icon={<Bookmark size={15} />} onClick={() => toast({ title: "結果を保存しました", tone: "success" })}>保存</Button>
          <Button variant="outline" icon={<Share2 size={15} />} onClick={() => toast({ title: "Feedに投稿しました", description: "フォロワーに共有されます", tone: "success" })}>Feedへ投稿</Button>
        </div>
      </div>
    </div>
  );
}

/* 控えめな紙吹雪（高得点時のみ・reduced-motionで消える） */
function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => ({
        left: `${(i * 137.5) % 100}%`,
        delay: `${(i % 9) * 0.11}s`,
        dur: `${2 + (i % 5) * 0.3}s`,
        rot: `${180 + ((i * 97) % 400)}deg`,
        color: `var(--vq-chart-${(i % 6) + 1})`,
      })),
    []
  );
  return (
    <div className="qz-confetti" aria-hidden>
      {pieces.map((p, i) => (
        <i key={i} style={{ left: p.left, background: p.color, ["--delay" as string]: p.delay, ["--dur" as string]: p.dur, ["--rot" as string]: p.rot }} />
      ))}
    </div>
  );
}

/* ═══ PreExam ══════════════════════════════════════════════ */
export function PreExamScreen() {
  return (
    <AppFrame active="preexam" title="PreExam — 試験対策">
      <div className="vq-stack" style={{ gap: "var(--vq-sp-6)" }}>
        <Card style={{ background: "linear-gradient(120deg, var(--vq-accent-subtle), transparent 65%)", borderColor: "color-mix(in srgb, var(--vq-accent) 22%, transparent)" }}>
          <div className="vq-row" style={{ gap: "var(--vq-sp-6)", flexWrap: "wrap" }}>
            <div className="vq-grow" style={{ minWidth: 220 }}>
              <Badge tone="warning" dot>あと9日</Badge>
              <h1 style={{ font: "var(--vq-type-heading-lg)", margin: "var(--vq-sp-3) 0" }}>期末考査 英語コミュニケーションIII</h1>
              <p style={{ font: "var(--vq-type-body-sm)", color: "var(--vq-text-secondary)" }}>範囲: Lesson 5〜7 · 教科書 p.68–112 · 前回 72点</p>
            </div>
            <div style={{ textAlign: "center" }}>
              <Ring value={68} size={84} stroke={7}>68%</Ring>
              <div style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)", marginTop: 6 }}>対策進捗</div>
            </div>
          </div>
          <Divider style={{ margin: "var(--vq-sp-5) 0" }} />
          <div className="vq-wrap" style={{ gap: "var(--vq-sp-4)" }}>
            <Button icon={<Timer size={15} />}>本番形式で模擬試験（60分）</Button>
            <Button variant="secondary" icon={<Zap size={15} />}>今日のおすすめ 15分</Button>
            <Button variant="outline" icon={<Sparkles size={15} />}>教材PDFから問題を生成</Button>
          </div>
        </Card>

        <div className="qz-stat-row" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          <StatCard label="模擬試験 最高点" value="82" unit="/ 100" tone="success" icon={<Trophy size={15} />} />
          <StatCard label="苦手分野" value="整序" unit="正答率45%" tone="warning" icon={<AlertTriangle size={15} />} />
          <StatCard label="対策済み問題" value="312" unit="問" icon={<BookOpen size={15} />} />
        </div>

        <Card pad={false}>
          <div style={{ padding: "var(--vq-sp-6) var(--vq-sp-6) var(--vq-sp-3)", font: "var(--vq-type-heading-sm)" }}>科目別の対策状況</div>
          {[
            { name: "英語コミュニケーションIII", date: "7/31", progress: 68, last: 72 },
            { name: "日本史探究", date: "8/2", progress: 34, last: 64 },
            { name: "数学II", date: "8/2", progress: 51, last: 58 },
            { name: "情報I", date: "8/4", progress: 88, last: 91 },
          ].map((s, i) => (
            <React.Fragment key={s.name}>
              {i > 0 && <Divider />}
              <div className="vq-row" style={{ gap: "var(--vq-sp-5)", padding: "var(--vq-sp-5) var(--vq-sp-6)", flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                  <div className="vq-row" style={{ gap: "var(--vq-sp-3)", marginBottom: 6 }}>
                    <span style={{ font: "var(--vq-type-label)" }} className="vq-truncate">{s.name}</span>
                    <Badge tone="outline">{s.date}</Badge>
                  </div>
                  <Progress value={s.progress} size="sm" label={`${s.name} 対策進捗 ${s.progress}%`} />
                </div>
                <span className="vq-num" style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)", width: 76 }}>前回 {s.last}点</span>
                <Button size="sm" variant="outline">対策する</Button>
              </div>
            </React.Fragment>
          ))}
        </Card>
      </div>
    </AppFrame>
  );
}
