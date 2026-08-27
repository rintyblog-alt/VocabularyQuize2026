import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, ArrowRight, Clock, Flame, GraduationCap, Lock, LogIn, Mail,
  ShieldCheck, Sparkles, Trophy, User,
} from "lucide-react";
import {
  Alert, Badge, Button, Card, Checkbox, Divider, Field, OTPInput,
  PasswordInput, Progress, Select, TextInput, useToast,
} from "../ui/components";
import { Illus } from "../ui/illustrations";
import type { IllusName } from "../ui/illustrations";

/* ═══ Welcome ══════════════════════════════════════════════ */
export function WelcomeScreen({ onEnter }: { onEnter?: (mode: "login" | "signup" | "guest") => void }) {
  return (
    <div className="qz-welcome">
      <div className="qz-welcome__bar">
        <span className="qz-logo">VQ</span>
        <span style={{ font: "var(--vq-type-heading-sm)" }}>VocabuQuiz</span>
        <span className="vq-grow" />
        <Badge tone="success" dot>すべてのシステムが正常</Badge>
      </div>

      <div className="qz-welcome__body">
        <div>
          <div className="qz-welcome__mobile-hero"><Illus name="hello" size={200} /></div>
          <Badge tone="ai"><Sparkles size={11} /> AI搭載の学習プラットフォーム</Badge>
          <h1 className="qz-welcome__title">
            テスト勉強を、<br /><em>クイズで楽しく速く。</em>
          </h1>
          <p className="qz-welcome__lede">
            英単語から定期考査まで。あなたの理解度に合わせて出題が変わる、
            高校生のための学習アプリ。
          </p>
          <div className="qz-welcome__actions">
            <Button size="lg" icon={<LogIn size={16} />} onClick={() => onEnter?.("login")}>ログイン</Button>
            <Button size="lg" variant="secondary" onClick={() => onEnter?.("signup")}>アカウントを作成</Button>
            <Button variant="ghost" onClick={() => onEnter?.("guest")}>ゲストとして試してみる</Button>
          </div>
        </div>

        <div className="qz-welcome__hero">
          <Illus name="hello" size={380} />
          <span className="qz-welcome__chip" style={{ top: "4%", left: "-2%" }}>
            <Flame size={14} style={{ color: "var(--vq-favorite)" }} /> 連続学習 18日目
          </span>
          <span className="qz-welcome__chip" style={{ top: "38%", right: "-4%" }}>
            <Sparkles size={14} style={{ color: "var(--vq-ai-text)" }} /> AIが苦手を分析
          </span>
          <span className="qz-welcome__chip" style={{ bottom: "6%", left: "10%" }}>
            <Trophy size={14} style={{ color: "var(--vq-success-text)" }} /> 期末 +14点の見込み
          </span>
        </div>
      </div>

      <div className="qz-welcome__foot">
        <a href="#/screens/welcome" onClick={(e) => e.preventDefault()}>利用規約</a>
        <a href="#/screens/welcome" onClick={(e) => e.preventDefault()}>プライバシーポリシー</a>
        <a href="#/screens/welcome" onClick={(e) => e.preventDefault()}>ヘルプ</a>
        <span className="vq-grow" />
        <span className="vq-num">v26.0 · © 2026 VocabuQuiz</span>
      </div>
    </div>
  );
}

/* ═══ Auth Flow ════════════════════════════════════════════ */
export type AuthView =
  | "login" | "signup" | "reset" | "newPassword" | "verifyEmail" | "otp"
  | "twoFactor" | "locked" | "sessionExpired" | "maintenance" | "networkError";

const QUOTES = [
  { grade: "高3・英語", text: "単語テストの朝、電車の10分だけで間に合うようになった。" },
  { grade: "高2・日本史", text: "友達が作った定期考査対策クイズで、学年順位が30番上がった。" },
];

/* 状態ごとの左パネル用イラスト */
const SIDE_ILLUS: Record<AuthView, IllusName> = {
  login: "login", signup: "signup", reset: "reset", newPassword: "reset",
  verifyEmail: "done", otp: "otp", twoFactor: "otp", locked: "locked",
  sessionExpired: "expired", maintenance: "maintenance", networkError: "error",
};

export function AuthFlow({ initial = "login" }: { initial?: AuthView }) {
  const [view, setViewRaw] = useState<AuthView>(initial);
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const [stack, setStack] = useState<AuthView[]>([]);
  const toast = useToast();

  useEffect(() => setViewRaw(initial), [initial]);

  const go = (v: AuthView) => { setStack((s) => [...s, view]); setDir("fwd"); setViewRaw(v); };
  const back = () => {
    setStack((s) => {
      const prev = s[s.length - 1] ?? "login";
      setDir("back"); setViewRaw(prev);
      return s.slice(0, -1);
    });
  };

  return (
    <div className="qz-auth">
      <div className="qz-auth__side">
        <div className="vq-row" style={{ gap: "var(--vq-sp-4)" }}>
          <span className="qz-logo">VQ</span>
          <span style={{ font: "var(--vq-type-heading-sm)" }}>VocabuQuiz</span>
        </div>
        <div className="qz-auth__side-illus" key={SIDE_ILLUS[view]}>
          <Illus name={SIDE_ILLUS[view]} size={320} />
        </div>
        <div className="qz-auth__quote">
          <p style={{ font: "var(--vq-type-body-lg)", fontWeight: 550, lineHeight: 1.75, marginBottom: "var(--vq-sp-4)" }}>
            “{QUOTES[0].text}”
          </p>
          <span style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)" }}>{QUOTES[0].grade} のユーザー</span>
        </div>
        <div className="vq-row" style={{ gap: "var(--vq-sp-3)", marginTop: "var(--vq-sp-6)", font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)" }}>
          <ShieldCheck size={13} /> 通信は暗号化されています · 学校のメールアドレスは不要
        </div>
      </div>

      <div className="qz-auth__main">
        <div key={view} className={`qz-auth__panel qz-auth__panel--${dir}`}>
          {view === "login" && <LoginPanel onSignup={() => go("signup")} onReset={() => go("reset")} onOtp={() => go("twoFactor")} onLocked={() => go("locked")} />}
          {view === "signup" && <SignupPanel onBack={back} onDone={() => go("verifyEmail")} />}
          {view === "reset" && <ResetPanel onBack={back} onSent={() => go("otp")} />}
          {view === "otp" && <OtpPanel onBack={back} onOk={() => go("newPassword")} title="確認コードを入力" desc="再設定用のコードをメールに送信しました。" />}
          {view === "twoFactor" && <OtpPanel onBack={back} onOk={() => toast({ title: "ログインしました", tone: "success" })} title="2段階認証" desc="認証アプリに表示されている6桁のコードを入力してください。" />}
          {view === "newPassword" && <NewPasswordPanel onDone={() => { toast({ title: "パスワードを変更しました", tone: "success" }); go("login"); }} />}
          {view === "verifyEmail" && <VerifyEmailPanel onBack={() => go("login")} />}
          {view === "locked" && <LockedPanel onBack={() => go("login")} onReset={() => go("reset")} />}
          {view === "sessionExpired" && <SessionExpiredPanel onLogin={() => go("login")} />}
          {view === "maintenance" && <MaintenancePanel />}
          {view === "networkError" && <NetworkErrorPanel onRetry={() => go("login")} />}
        </div>
      </div>
    </div>
  );
}

function AuthHead({ title, sub, onBack, illus }: { title: string; sub?: React.ReactNode; onBack?: () => void; illus?: IllusName }) {
  return (
    <>
      {onBack && (
        <Button variant="ghost" size="sm" icon={<ArrowLeft size={14} />} onClick={onBack} style={{ marginLeft: -10, marginBottom: "var(--vq-sp-4)" }}>
          戻る
        </Button>
      )}
      {illus && <div className="qz-auth__illus"><Illus name={illus} size={132} /></div>}
      <div className="qz-auth__head">
        <h1 className="qz-auth__title">{title}</h1>
        {sub && <p className="qz-auth__sub">{sub}</p>}
      </div>
    </>
  );
}

/* ── Login ── */
function LoginPanel({ onSignup, onReset, onOtp, onLocked }: { onSignup: () => void; onReset: () => void; onOtp: () => void; onLocked: () => void }) {
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [caps, setCaps] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fails, setFails] = useState(0);

  const submit = () => {
    setErr(null);
    if (!id.trim()) { setErr("ログインIDを入力してください"); return; }
    if (!pw) { setErr("パスワードを入力してください"); return; }
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      if (pw === "correct") { onOtp(); return; }
      const n = fails + 1;
      setFails(n);
      if (n >= 3) { onLocked(); return; }
      setErr(`IDまたはパスワードが違います（あと${3 - n}回でロックされます）。デモ: パスワード "correct" で成功`);
    }, 900);
  };

  return (
    <>
      <AuthHead illus="login" title="おかえりなさい" sub="ログインして、昨日の続きから始めましょう。" />
      {err && <div style={{ marginBottom: "var(--vq-sp-5)" }}><Alert tone="danger" title={err} /></div>}
      <form className="vq-stack" style={{ gap: "var(--vq-sp-5)" }} onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field label="学年">
          {(a) => (
            <Select id={a.id} icon={<GraduationCap size={16} />} defaultValue="h3">
              <option value="j1">中1</option><option value="j2">中2</option><option value="j3">中3</option>
              <option value="h1">高1</option><option value="h2">高2</option><option value="h3">高3</option>
            </Select>
          )}
        </Field>
        <Field label="ログインID">
          {(a) => <TextInput id={a.id} icon={<User size={16} />} value={id} onChange={(e) => setId(e.target.value)} placeholder="例: aoi_eng" autoComplete="username" />}
        </Field>
        <Field label="パスワード" error={caps ? "Caps Lock がオンになっています" : undefined}>
          {(a) => (
            <PasswordInput id={a.id} icon={<Lock size={16} />} value={pw} onChange={(e) => setPw(e.target.value)} onCapsLock={setCaps} placeholder="••••••••" invalid={a.invalid} />
          )}
        </Field>
        <div className="vq-row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: "var(--vq-sp-3)" }}>
          <Checkbox label="ログインしたままにする" defaultChecked />
          <Button variant="link" size="sm" type="button" onClick={onReset}>パスワードをお忘れですか？</Button>
        </div>
        <Button size="lg" full loading={busy} type="submit">ログイン</Button>
      </form>
      <Divider label="はじめてですか？" style={{ margin: "var(--vq-sp-7) 0" }} />
      <Button variant="secondary" full onClick={onSignup}>アカウントを作成する</Button>
      <p style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)", textAlign: "center", marginTop: "var(--vq-sp-6)" }}>
        続行すると <a href="#/screens/auth" onClick={(e) => e.preventDefault()}>利用規約</a> と <a href="#/screens/auth" onClick={(e) => e.preventDefault()}>プライバシーポリシー</a> に同意したことになります。
      </p>
    </>
  );
}

/* ── Signup ── */
function SignupPanel({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const idOk = /^[A-Za-z0-9._-]{2,24}$/.test(id);
  const pwLevel = useMemo(() => {
    let l = 0;
    if (pw.length >= 8) l++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) l++;
    if (/\d/.test(pw)) l++;
    if (pw.length >= 12 || /[^A-Za-z0-9]/.test(pw)) l++;
    return l;
  }, [pw]);

  return (
    <>
      <AuthHead
        illus="signup"
        title="アカウントを作成"
        sub={<>ステップ {step + 1} / 2 — {step === 0 ? "ログイン情報を決めましょう" : "学年と規約の確認"}</>}
        onBack={step === 0 ? onBack : () => setStep(0)}
      />
      <Progress value={(step + 1) * 50} size="sm" label={`登録進捗 ${(step + 1) * 50}%`} />
      <div style={{ height: "var(--vq-sp-7)" }} />
      {step === 0 ? (
        <form className="vq-stack" style={{ gap: "var(--vq-sp-5)" }} onSubmit={(e) => { e.preventDefault(); if (idOk && pwLevel >= 2) setStep(1); }}>
          <Field
            label="ログインID"
            hint={!id || idOk ? "英数字と . _ -（2〜24文字）。あとから変更できます" : undefined}
            error={id && !idOk ? "英数字と . _ - のみ、2〜24文字で入力してください" : undefined}
          >
            {(a) => <TextInput id={a.id} icon={<User size={16} />} value={id} onChange={(e) => setId(e.target.value)} invalid={a.invalid} placeholder="例: minato_kb" autoComplete="username" />}
          </Field>
          <Field label="パスワード" hint="8文字以上。大小英字・数字を混ぜると強くなります">
            {(a) => (
              <>
                <PasswordInput id={a.id} icon={<Lock size={16} />} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="8文字以上" autoComplete="new-password" />
                <div className="qz-pwmeter" data-level={pwLevel} aria-label={`パスワード強度 ${pwLevel} / 4`}>
                  <span /><span /><span /><span />
                </div>
              </>
            )}
          </Field>
          <Button size="lg" full type="submit" disabled={!idOk || pwLevel < 2} trailingIcon={<ArrowRight size={15} />}>次へ</Button>
        </form>
      ) : (
        <form className="vq-stack" style={{ gap: "var(--vq-sp-5)" }} onSubmit={(e) => { e.preventDefault(); if (!agree) return; setBusy(true); setTimeout(onDone, 1100); }}>
          <Field label="学年" hint="4月に自動で進級します">
            {(a) => (
              <Select id={a.id} icon={<GraduationCap size={16} />} defaultValue="h1">
                <option value="j1">中1</option><option value="j2">中2</option><option value="j3">中3</option>
                <option value="h1">高1</option><option value="h2">高2</option><option value="h3">高3</option>
              </Select>
            )}
          </Field>
          <Card sunken style={{ maxHeight: 130, overflowY: "auto", font: "var(--vq-type-body-sm)", color: "var(--vq-text-secondary)" }}>
            <b>利用規約（要約）</b><br />
            ・13歳以上が利用できます<br />
            ・作成したクイズの著作権はあなたに帰属します<br />
            ・他者の教材の無断転載は削除対象です<br />
            ・学習データは成績向上の分析にのみ利用されます<br />
            ・Qredit は現実の通貨ではありません
          </Card>
          <Checkbox label={<>利用規約とプライバシーポリシーに同意する</>} checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <Button size="lg" full type="submit" disabled={!agree} loading={busy}>アカウントを作成</Button>
        </form>
      )}
    </>
  );
}

/* ── Reset ── */
function ResetPanel({ onBack, onSent }: { onBack: () => void; onSent: () => void }) {
  const [mail, setMail] = useState("");
  const [busy, setBusy] = useState(false);
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail);
  return (
    <>
      <AuthHead illus="reset" title="パスワードを再設定" sub="登録済みの連絡先に、6桁の確認コードを送ります。" onBack={onBack} />
      <form className="vq-stack" style={{ gap: "var(--vq-sp-5)" }} onSubmit={(e) => { e.preventDefault(); if (!ok) return; setBusy(true); setTimeout(onSent, 900); }}>
        <Field label="メールアドレス" error={mail && !ok ? "メールアドレスの形式が正しくありません" : undefined}>
          {(a) => <TextInput id={a.id} type="email" icon={<Mail size={16} />} value={mail} onChange={(e) => setMail(e.target.value)} invalid={a.invalid} placeholder="you@example.com" />}
        </Field>
        <Button size="lg" full type="submit" disabled={!ok} loading={busy}>確認コードを送信</Button>
        <p style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)" }}>
          メールアドレスを登録していない場合は、現在のパスワードでログイン後に「設定 → セキュリティ」から変更できます。
        </p>
      </form>
    </>
  );
}

/* ── OTP ── */
function OtpPanel({ onBack, onOk, title, desc }: { onBack: () => void; onOk: () => void; title: string; desc: string }) {
  const [code, setCode] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(30);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);
  const submit = () => {
    if (code.length < 6) return;
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      if (code === "123456") onOk();
      else { setInvalid(true); setTimeout(() => setInvalid(false), 600); }
    }, 700);
  };
  return (
    <>
      <AuthHead illus="otp" title={title} sub={<>{desc} デモ: <code>123456</code></>} onBack={onBack} />
      <div className="vq-stack" style={{ gap: "var(--vq-sp-6)", alignItems: "flex-start" }}>
        <OTPInput value={code} onChange={setCode} invalid={invalid} autoFocus />
        <Button size="lg" full loading={busy} disabled={code.length < 6} onClick={submit}>確認する</Button>
        <Button variant="ghost" size="sm" disabled={cooldown > 0} onClick={() => setCooldown(30)}>
          {cooldown > 0 ? `コードを再送信（${cooldown}秒後）` : "コードを再送信"}
        </Button>
      </div>
    </>
  );
}

/* ── New password ── */
function NewPasswordPanel({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const mismatch = pw2.length > 0 && pw !== pw2;
  const ok = pw.length >= 8 && pw === pw2;
  return (
    <>
      <AuthHead illus="reset" title="新しいパスワード" sub="以前のパスワードとは別のものを設定してください。" />
      <form className="vq-stack" style={{ gap: "var(--vq-sp-5)" }} onSubmit={(e) => { e.preventDefault(); if (!ok) return; setBusy(true); setTimeout(onDone, 900); }}>
        <Field label="新しいパスワード" hint="8文字以上">
          {(a) => <PasswordInput id={a.id} icon={<Lock size={16} />} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />}
        </Field>
        <Field label="新しいパスワード（確認）" error={mismatch ? "パスワードが一致しません" : undefined}>
          {(a) => <PasswordInput id={a.id} icon={<Lock size={16} />} value={pw2} onChange={(e) => setPw2(e.target.value)} invalid={a.invalid} autoComplete="new-password" />}
        </Field>
        <Button size="lg" full type="submit" disabled={!ok} loading={busy}>パスワードを変更</Button>
      </form>
    </>
  );
}

/* ── Verify email ── */
function VerifyEmailPanel({ onBack }: { onBack: () => void }) {
  return (
    <>
      <AuthHead illus="done" title="アカウントを作成しました" sub="学習をはじめる準備ができています。メールアドレスを登録すると、パスワード再設定と週間レポートが使えるようになります（あとからでも設定できます）。" />
      <div className="vq-stack" style={{ gap: "var(--vq-sp-4)" }}>
        <Button size="lg" full onClick={onBack}>学習をはじめる</Button>
        <Button variant="ghost" full onClick={onBack}>あとでメールを登録する</Button>
      </div>
    </>
  );
}

/* ── Locked / Expired / Maintenance / Network ── */
function LockedPanel({ onBack, onReset }: { onBack: () => void; onReset: () => void }) {
  return (
    <>
      <AuthHead illus="locked" title="アカウントを一時ロックしました" sub="パスワードの誤りが続いたため、安全のため15分間ログインを制限しています。心当たりがない場合はパスワードを再設定してください。" />
      <div className="vq-stack" style={{ gap: "var(--vq-sp-4)" }}>
        <Button size="lg" full onClick={onReset}>パスワードを再設定する</Button>
        <Button variant="ghost" full icon={<Clock size={15} />} onClick={onBack}>15分待ってからやり直す</Button>
      </div>
    </>
  );
}

function SessionExpiredPanel({ onLogin }: { onLogin: () => void }) {
  return (
    <>
      <AuthHead illus="expired" title="セッションの有効期限が切れました" sub="安全のため自動的にログアウトしました。学習データはすべて保存されています。" />
      <Button size="lg" full onClick={onLogin}>もう一度ログイン</Button>
    </>
  );
}

function MaintenancePanel() {
  return (
    <>
      <AuthHead illus="maintenance" title="メンテナンス中です" sub="7/25(土) 2:00〜4:00 の予定でシステムを更新しています。保存済みのクイズはオフラインでも学習できます。" />
      <Alert tone="info" title="進捗 60%">残り約40分の見込み — 完了次第このページは自動で更新されます。</Alert>
      <div style={{ marginTop: "var(--vq-sp-5)" }}><Progress value={60} label="メンテナンス進捗 60%" /></div>
    </>
  );
}

function NetworkErrorPanel({ onRetry }: { onRetry: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <>
      <AuthHead illus="error" title="接続できません" sub="ネットワークに接続できないため、ログインを完了できませんでした。" />
      <Alert tone="danger" title="NET_ERR — サーバーに到達できません">Wi-Fi またはモバイル通信の状態を確認してください。入力内容はこの端末に保持されています。</Alert>
      <div style={{ marginTop: "var(--vq-sp-6)" }}>
        <Button size="lg" full loading={busy} onClick={() => { setBusy(true); setTimeout(() => { setBusy(false); onRetry(); }, 1000); }}>再試行</Button>
      </div>
    </>
  );
}
