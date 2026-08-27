import React, { useState } from "react";
import {
  Activity, AlertTriangle, ArrowLeft, Ban, BookOpen, Check, CloudOff, Coins,
  FileWarning, Flag, Home, Lock, RefreshCw, Search, Shield, Users, Wrench, X,
} from "lucide-react";
import {
  Alert, Avatar, Badge, Banner, Button, Card, DataTable, Divider, EmptyState,
  IconButton, LineChart, Modal, Progress, Segmented, StatCard, Tabs, useToast,
} from "../ui/components";
import { AppFrame } from "./shell";
import { Illus } from "../ui/illustrations";
import { QDP_STATS } from "../mocks/data";

/* ═══ Admin ════════════════════════════════════════════════ */
export function AdminScreen() {
  const [tab, setTab] = useState("dashboard");
  const [review, setReview] = useState<null | { id: string; type: string; target: string; reason: string; reporter: string; time: string }>(null);
  const toast = useToast();

  const reports = [
    { id: "R-2841", type: "投稿", target: "「テスト答案そのまま載せます」", reason: "不正行為の助長", reporter: "3件の報告", time: "8分前" },
    { id: "R-2840", type: "クイズ", target: "「〇〇塾テキスト完全コピー」", reason: "著作権侵害の疑い", reporter: "教材出版社", time: "1時間前" },
    { id: "R-2839", type: "ユーザー", target: "@spam_acct_22", reason: "スパム投稿の連続", reporter: "自動検知", time: "2時間前" },
  ];

  return (
    <AppFrame active="admin" title="管理コンソール" showAdmin>
      <div className="vq-stack" style={{ gap: "var(--vq-sp-6)" }}>
        <Banner tone="warning" actions={<Button size="sm" variant="outline">設定</Button>}>
          <Shield size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
          管理者モードで操作しています — すべての操作は監査ログに記録されます
        </Banner>

        <Tabs
          ariaLabel="管理メニュー"
          value={tab}
          onChange={setTab}
          items={[
            { id: "dashboard", label: "Dashboard" },
            { id: "moderation", label: "モデレーション", count: 3 },
            { id: "users", label: "ユーザー" },
            { id: "system", label: "システム" },
          ]}
        />

        {tab === "dashboard" && (
          <>
            <div className="qz-admin__grid">
              <StatCard label="DAU" value="8,412" delta={6} deltaLabel="前日比" tone="accent" icon={<Users size={15} />} />
              <StatCard label="本日の新規登録" value="164" delta={12} deltaLabel="前日比" icon={<Users size={15} />} />
              <StatCard label="未処理レポート" value="3" tone="warning" icon={<Flag size={15} />} />
              <StatCard label="API応答 p95" value="142" unit="ms" tone="success" icon={<Activity size={15} />} />
            </div>
            <Card>
              <h2 style={{ font: "var(--vq-type-heading-sm)", marginBottom: "var(--vq-sp-5)" }}>月間アクティブの推移</h2>
              <LineChart labels={QDP_STATS.months} series={[{ name: "MAU", values: [18200, 21400, 26800, 31200, 38400, 42100] }]} height={180} area />
            </Card>
          </>
        )}

        {tab === "moderation" && (
          <Card pad={false}>
            <div style={{ padding: "var(--vq-sp-6) var(--vq-sp-6) var(--vq-sp-4)", font: "var(--vq-type-heading-sm)" }}>モデレーションキュー（3件）</div>
            <DataTable
              caption="レポート一覧"
              columns={[
                { key: "id", header: "ID", render: (r) => <code style={{ font: "var(--vq-type-code)", fontSize: 12 }}>{r.id}</code>, width: 90 },
                { key: "type", header: "種別", render: (r) => <Badge tone={r.type === "ユーザー" ? "danger" : r.type === "クイズ" ? "warning" : "neutral"}>{r.type}</Badge>, width: 90 },
                { key: "target", header: "対象", render: (r) => <span className="vq-truncate" style={{ maxWidth: 260, display: "inline-block", fontWeight: 550 }}>{r.target}</span> },
                { key: "reason", header: "理由" },
                { key: "time", header: "受付", render: (r) => <span style={{ color: "var(--vq-text-tertiary)" }}>{r.time}</span> },
                {
                  key: "act", header: "操作", width: 120,
                  render: (r) => <Button size="sm" variant="outline" onClick={() => setReview(r)}>審査する</Button>,
                },
              ]}
              rows={reports}
            />
          </Card>
        )}

        {tab === "users" && (
          <Card pad={false}>
            <DataTable
              caption="ユーザー一覧"
              columns={[
                {
                  key: "name", header: "ユーザー",
                  render: (r) => (
                    <span className="vq-row" style={{ gap: "var(--vq-sp-4)" }}>
                      <Avatar name={r.name} size="sm" />
                      <span className="vq-stack">
                        <b>{r.name}</b>
                        <span style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)" }}>@{r.handle}</span>
                      </span>
                    </span>
                  ),
                },
                { key: "grade", header: "学年", width: 70 },
                { key: "quizzes", header: "クイズ", numeric: true, sortable: true, sortValue: (r) => r.quizzes },
                { key: "reports", header: "被報告", numeric: true, sortable: true, sortValue: (r) => r.reports, render: (r) => r.reports > 0 ? <b style={{ color: "var(--vq-danger-text)" }}>{r.reports}</b> : "0" },
                {
                  key: "status", header: "状態",
                  render: (r) => <Badge tone={r.status === "有効" ? "success" : r.status === "警告" ? "warning" : "danger"} dot>{r.status}</Badge>,
                },
              ]}
              rows={[
                { id: 1, name: "あおい", handle: "aoi_eng", grade: "高3", quizzes: 12, reports: 0, status: "有効" },
                { id: 2, name: "はるか_study", handle: "haruka_study", grade: "高2", quizzes: 31, reports: 0, status: "有効" },
                { id: 3, name: "spam_acct_22", handle: "spam_acct_22", grade: "高1", quizzes: 84, reports: 12, status: "凍結" },
                { id: 4, name: "けんた.m", handle: "kenta_m", grade: "高1", quizzes: 18, reports: 1, status: "警告" },
              ]}
            />
          </Card>
        )}

        {tab === "system" && (
          <>
            <div className="qz-admin__grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
              <StatCard label="API" value="正常" tone="success" icon={<Check size={15} />} />
              <StatCard label="DB (D1)" value="正常" tone="success" icon={<Check size={15} />} />
              <StatCard label="AI Gateway" value="遅延" tone="warning" icon={<AlertTriangle size={15} />} />
            </div>
            <Card>
              <div className="vq-row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: "var(--vq-sp-4)" }}>
                <div>
                  <div style={{ font: "var(--vq-type-label)" }}>メンテナンスモード</div>
                  <div style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)" }}>有効にすると全ユーザーにメンテナンス画面が表示されます</div>
                </div>
                <Button variant="danger-soft" icon={<Wrench size={14} />} onClick={() => toast({ title: "メンテナンスモードは予約制です", description: "7/25 2:00に予約済み", tone: "warning" })}>
                  予約を管理
                </Button>
              </div>
            </Card>
            <Card sunken>
              <div style={{ font: "var(--vq-type-label)", marginBottom: "var(--vq-sp-4)" }}>監査ログ（直近）</div>
              <div className="vq-stack" style={{ gap: "var(--vq-sp-3)", font: "var(--vq-type-code)", fontSize: 12, color: "var(--vq-text-secondary)" }}>
                <div>01:12 admin@luna — R-2838 を承認（コンテンツ削除）</div>
                <div>00:48 admin@luna — @spam_acct_22 を凍結（スパム）</div>
                <div>昨日 23:30 system — QDP週間報酬を 214人に支払い</div>
              </div>
            </Card>
          </>
        )}
      </div>

      <Modal
        open={!!review}
        onClose={() => setReview(null)}
        title={`レポート ${review?.id} の審査`}
        description={`${review?.type}: ${review?.target} — ${review?.reason}（${review?.reporter}）`}
        footerBetween
        footer={
          <>
            <Button variant="ghost" onClick={() => setReview(null)}>あとで</Button>
            <span className="vq-row" style={{ gap: "var(--vq-sp-3)" }}>
              <Button variant="outline" icon={<X size={14} />} onClick={() => { setReview(null); toast({ title: "問題なしとして完了しました", tone: "success" }); }}>問題なし</Button>
              <Button variant="danger" icon={<Ban size={14} />} onClick={() => { setReview(null); toast({ title: "コンテンツを削除し、作成者に警告しました", tone: "danger" }); }}>削除して警告</Button>
            </span>
          </>
        }
      >
        <Alert tone="warning" title="判断基準">
          学習コミュニティとして「答案の共有・丸写しの依頼・教材の複製」は削除対象。判断に迷う場合は「あとで」でシニアモデレーターへ回せます。
        </Alert>
      </Modal>
    </AppFrame>
  );
}

/* ═══ System States（404/500/Offline/Maintenance/Permission/Suspended） ═══ */
export function SystemStatesView() {
  const [state, setState] = useState("404");
  const toast = useToast();
  return (
    <div style={{ background: "var(--vq-bg)", minHeight: "100%" }}>
      <div style={{ display: "flex", justifyContent: "center", padding: "var(--vq-sp-6) var(--vq-sp-5) 0" }}>
        <Segmented
          ariaLabel="システム状態"
          value={state}
          onChange={setState}
          items={[
            { id: "404", label: "404" }, { id: "500", label: "500" }, { id: "offline", label: "Offline" },
            { id: "maintenance", label: "メンテ" }, { id: "permission", label: "権限" }, { id: "suspended", label: "凍結" },
          ]}
        />
      </div>
      <div className="qz-syspage" style={{ minHeight: 500 }}>
        {state === "404" && (
          <div>
            <div style={{ display: "grid", justifyItems: "center" }}><Illus name="notfound" size={190} /></div>
            <div className="qz-syspage__code">404</div>
            <h1 style={{ font: "var(--vq-type-heading-lg)", margin: "var(--vq-sp-5) 0 var(--vq-sp-3)" }}>ページが見つかりません</h1>
            <p style={{ color: "var(--vq-text-secondary)", maxWidth: 400, margin: "0 auto var(--vq-sp-7)" }}>
              URLが変更されたか、クイズが削除された可能性があります。
            </p>
            <div className="vq-row" style={{ gap: "var(--vq-sp-4)", justifyContent: "center", flexWrap: "wrap" }}>
              <Button icon={<Home size={15} />}>ホームへ戻る</Button>
              <Button variant="outline" icon={<Search size={15} />}>クイズを検索</Button>
            </div>
          </div>
        )}
        {state === "500" && (
          <div>
            <div style={{ display: "grid", justifyItems: "center" }}><Illus name="error" size={190} /></div>
            <div className="qz-syspage__code">500</div>
            <h1 style={{ font: "var(--vq-type-heading-lg)", margin: "var(--vq-sp-5) 0 var(--vq-sp-3)" }}>サーバーエラーが発生しました</h1>
            <p style={{ color: "var(--vq-text-secondary)", maxWidth: 420, margin: "0 auto var(--vq-sp-7)" }}>
              こちら側の問題です。学習データは安全に保存されています。復旧状況はステータスページで確認できます。
            </p>
            <div className="vq-row" style={{ gap: "var(--vq-sp-4)", justifyContent: "center" }}>
              <Button icon={<RefreshCw size={15} />} onClick={() => toast({ title: "再読み込みしました", tone: "success" })}>再読み込み</Button>
              <Button variant="outline">システム状態</Button>
            </div>
            <p style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)", marginTop: "var(--vq-sp-6)" }}>
              エラーID: <code>err_5f82c-20260722</code>（お問い合わせ時にお伝えください）
            </p>
          </div>
        )}
        {state === "offline" && (
          <div>
            <div style={{ display: "grid", justifyItems: "center", marginBottom: "var(--vq-sp-5)" }}><Illus name="offline" size={190} /></div>
            <h1 style={{ font: "var(--vq-type-heading-lg)", marginBottom: "var(--vq-sp-3)" }}>オフラインです</h1>
            <p style={{ color: "var(--vq-text-secondary)", maxWidth: 400, margin: "0 auto var(--vq-sp-7)" }}>
              接続が回復すると自動的に同期します。保存済みの3つのクイズはオフラインでも学習できます。
            </p>
            <Button variant="outline" icon={<BookOpen size={15} />}>保存済みクイズを開く</Button>
          </div>
        )}
        {state === "maintenance" && (
          <div style={{ width: "min(440px, 100%)" }}>
            <div style={{ display: "grid", justifyItems: "center", marginBottom: "var(--vq-sp-5)" }}><Illus name="maintenance" size={190} /></div>
            <h1 style={{ font: "var(--vq-type-heading-lg)", marginBottom: "var(--vq-sp-3)" }}>メンテナンス中です</h1>
            <p style={{ color: "var(--vq-text-secondary)", marginBottom: "var(--vq-sp-6)" }}>
              7/25(土) 2:00〜4:00 — より快適な夏休みの学習のため、サーバーを増強しています。
            </p>
            <Progress value={60} label="メンテナンス進捗 60%" />
            <p style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)", marginTop: "var(--vq-sp-4)" }} className="vq-num">
              進捗 60% · 残り約40分 · 完了後は自動で再開します
            </p>
          </div>
        )}
        {state === "permission" && (
          <div>
            <div style={{ display: "grid", justifyItems: "center", marginBottom: "var(--vq-sp-5)" }}><Illus name="locked" size={190} /></div>
            <h1 style={{ font: "var(--vq-type-heading-lg)", marginBottom: "var(--vq-sp-3)" }}>このページを表示する権限がありません</h1>
            <p style={{ color: "var(--vq-text-secondary)", maxWidth: 420, margin: "0 auto var(--vq-sp-7)" }}>
              管理コンソールは運営メンバー専用です。リンクの共有ミスの可能性があります。
            </p>
            <Button icon={<ArrowLeft size={15} />}>前のページへ戻る</Button>
          </div>
        )}
        {state === "suspended" && (
          <div style={{ width: "min(480px, 100%)" }}>
            <div style={{ display: "grid", justifyItems: "center", marginBottom: "var(--vq-sp-5)" }}><Illus name="expired" size={190} /></div>
            <h1 style={{ font: "var(--vq-type-heading-lg)", marginBottom: "var(--vq-sp-3)" }}>アカウントが一時停止されています</h1>
            <p style={{ color: "var(--vq-text-secondary)", marginBottom: "var(--vq-sp-5)" }}>
              ガイドライン違反（教材の無断転載）の報告により、7/29まで投稿とクイズ公開を制限しています。学習機能は引き続き利用できます。
            </p>
            <Alert tone="info" title="異議申し立て">
              心当たりがない場合は審査を申請できます。通常2営業日以内に返答します。
            </Alert>
            <div className="vq-row" style={{ gap: "var(--vq-sp-4)", justifyContent: "center", marginTop: "var(--vq-sp-6)" }}>
              <Button variant="outline">異議を申し立てる</Button>
              <Button variant="ghost">ガイドラインを読む</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══ Onboarding ═══════════════════════════════════════════ */
export function OnboardingView() {
  const [step, setStep] = useState(0);
  const [grade, setGrade] = useState("h1");
  const [goals, setGoals] = useState<string[]>(["定期考査"]);
  const [minutes, setMinutes] = useState("15");
  const toast = useToast();
  const steps = ["学年", "目標", "学習時間"];
  return (
    <div className="qz-auth" style={{ gridTemplateColumns: "1fr" }}>
      <div className="qz-auth__main">
        <div className="qz-auth__panel" key={step}>
          <div style={{ marginBottom: "var(--vq-sp-7)" }}>
            <Progress value={((step + 1) / 3) * 100} size="sm" label={`設定 ${step + 1} / 3`} />
          </div>
          {step === 0 && (
            <>
              <h1 className="qz-auth__title">はじめまして！<br />学年を教えてください</h1>
              <p className="qz-auth__sub" style={{ marginBottom: "var(--vq-sp-6)" }}>出題される問題のレベルと教科が変わります。</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--vq-sp-4)", marginBottom: "var(--vq-sp-7)" }}>
                {[["j1", "中1"], ["j2", "中2"], ["j3", "中3"], ["h1", "高1"], ["h2", "高2"], ["h3", "高3"]].map(([v, label]) => (
                  <button
                    key={v}
                    className={`vq-card vq-card--pad vq-card--hover ${grade === v ? "vq-card--selected" : ""}`}
                    style={{ cursor: "pointer", font: "var(--vq-type-heading-sm)", textAlign: "center", color: "inherit" }}
                    aria-pressed={grade === v}
                    onClick={() => setGrade(v)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
          {step === 1 && (
            <>
              <h1 className="qz-auth__title">いま一番がんばりたいことは？</h1>
              <p className="qz-auth__sub" style={{ marginBottom: "var(--vq-sp-6)" }}>複数選べます。ホーム画面のおすすめが変わります。</p>
              <div className="vq-stack" style={{ gap: "var(--vq-sp-4)", marginBottom: "var(--vq-sp-7)" }}>
                {["定期考査", "英単語・語彙", "共通テスト対策", "苦手の克服", "毎日の学習習慣"].map((g) => (
                  <button
                    key={g}
                    className={`vq-card vq-card--pad vq-card--hover ${goals.includes(g) ? "vq-card--selected" : ""}`}
                    style={{ cursor: "pointer", textAlign: "left", color: "inherit", display: "flex", alignItems: "center", gap: "var(--vq-sp-4)", font: "var(--vq-type-body-md)", fontWeight: 550 }}
                    aria-pressed={goals.includes(g)}
                    onClick={() => setGoals((gs) => (gs.includes(g) ? gs.filter((x) => x !== g) : [...gs, g]))}
                  >
                    <span style={{ width: 20, height: 20, borderRadius: 6, border: goals.includes(g) ? "none" : "1.5px solid var(--vq-border-strong)", background: goals.includes(g) ? "var(--vq-accent)" : "transparent", display: "grid", placeItems: "center", color: "var(--vq-accent-contrast)", flex: "0 0 auto" }}>
                      {goals.includes(g) && <Check size={13} strokeWidth={3} />}
                    </span>
                    {g}
                  </button>
                ))}
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <h1 className="qz-auth__title">1日の目標時間は？</h1>
              <p className="qz-auth__sub" style={{ marginBottom: "var(--vq-sp-6)" }}>短くてOK。続けることが一番大事です。あとから変更できます。</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "var(--vq-sp-4)", marginBottom: "var(--vq-sp-7)" }}>
                {[["10", "10分", "スキマ時間に"], ["15", "15分", "おすすめ"], ["30", "30分", "テスト前モード"]].map(([v, label, desc]) => (
                  <button
                    key={v}
                    className={`vq-card vq-card--pad vq-card--hover ${minutes === v ? "vq-card--selected" : ""}`}
                    style={{ cursor: "pointer", textAlign: "center", color: "inherit" }}
                    aria-pressed={minutes === v}
                    onClick={() => setMinutes(v)}
                  >
                    <div style={{ font: "var(--vq-type-heading-md)" }}>{label}</div>
                    <div style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)", marginTop: 4 }}>{desc}</div>
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="vq-row" style={{ gap: "var(--vq-sp-4)" }}>
            {step > 0 && <Button variant="ghost" onClick={() => setStep(step - 1)}>戻る</Button>}
            <span className="vq-grow" />
            <Button variant="ghost" onClick={() => toast({ title: "設定はあとから変更できます" })}>スキップ</Button>
            <Button
              size="lg"
              onClick={() => {
                if (step < 2) setStep(step + 1);
                else toast({ title: "設定が完了しました！", description: "あなた専用のホーム画面を用意しました", tone: "success" });
              }}
            >
              {step < 2 ? "次へ" : "はじめる"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
