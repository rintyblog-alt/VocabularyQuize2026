import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangle, Bell, Check, ChevronDown, ChevronRight, CircleHelp, Copy,
  Database, FileCode2, FileText, Folder, Globe, KeyRound, Languages, Link2,
  Lock, LogOut, Mail, MessageCircle, Mic, Moon, Paintbrush, Paperclip, Pencil,
  Play, Plus, RefreshCw, Send, Shield, Sparkles, Square, Terminal, ThumbsDown,
  ThumbsUp, Trash2, User, X, Zap,
} from "lucide-react";
import {
  Alert, Avatar, Badge, Button, Card, Checkbox, Divider, Field, IconButton,
  ListItem, Modal, PasswordInput, Radio, Select, Spinner, Switch, Tabs,
  Textarea, TextInput, useToast,
} from "../ui/components";
import { AppFrame } from "./shell";

/* ═══ Settings ═════════════════════════════════════════════ */
const SETTING_SECTIONS = [
  { id: "profile", label: "プロフィール", icon: User },
  { id: "account", label: "アカウント", icon: KeyRound },
  { id: "security", label: "セキュリティ", icon: Shield },
  { id: "notifications", label: "通知", icon: Bell },
  { id: "appearance", label: "外観", icon: Paintbrush },
  { id: "language", label: "言語と地域", icon: Languages },
  { id: "ai", label: "AIとデータ", icon: Sparkles },
  { id: "other", label: "ヘルプと情報", icon: CircleHelp },
  { id: "danger", label: "危険な操作", icon: AlertTriangle },
];

/* 行ベースの設定リスト（モバイルアプリの標準形） */
function SetRow({
  icon, label, desc, control, onClick, chevron, tone,
}: {
  icon?: React.ReactNode; label: React.ReactNode; desc?: React.ReactNode;
  control?: React.ReactNode; onClick?: () => void; chevron?: boolean; tone?: "danger";
}) {
  const inner = (
    <>
      {icon && <span className="qz-set-row__icon" style={tone === "danger" ? { background: "var(--vq-danger-bg)", color: "var(--vq-danger-text)" } : undefined}>{icon}</span>}
      <span className="qz-set-row__main">
        <span className="qz-set-row__label" style={tone === "danger" ? { color: "var(--vq-danger-text)" } : undefined}>{label}</span>
        {desc && <span className="qz-set-row__desc">{desc}</span>}
      </span>
      {control}
      {chevron && <ChevronRight size={16} className="qz-set-row__chev" />}
    </>
  );
  return onClick
    ? <button type="button" className="qz-set-row is-tappable" onClick={onClick}>{inner}</button>
    : <div className="qz-set-row">{inner}</div>;
}

function SetGroup({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div>
      {title && <div style={{ font: "var(--vq-type-caption)", fontWeight: 700, color: "var(--vq-text-tertiary)", letterSpacing: "0.05em", padding: "0 var(--vq-sp-3) var(--vq-sp-3)" }}>{title}</div>}
      <Card pad={false}>{children}</Card>
    </div>
  );
}

export function SettingsScreen() {
  const [section, setSection] = useState("profile");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const toast = useToast();
  const noop = () => toast({ title: "デモのため画面遷移は省略しています" });

  return (
    <AppFrame active="settings" title="設定">
      <div style={{ display: "grid", gridTemplateColumns: "220px minmax(0,1fr)", gap: "var(--vq-sp-7)", alignItems: "start" }} className="qz-settings">
        <style>{`@container vq-screen (max-width: 899px) { .qz-settings { grid-template-columns: 1fr !important; } .qz-settings__nav { display: flex; flex-direction: row; overflow-x: auto; gap: 4px; padding-bottom: 4px; scrollbar-width: none; } .qz-settings__nav::-webkit-scrollbar { display: none; } .qz-settings__nav button { flex: 0 0 auto; width: auto; white-space: nowrap; } }`}</style>
        <nav className="vq-stack qz-settings__nav" style={{ gap: 2 }} aria-label="設定セクション">
          {SETTING_SECTIONS.map((s) => (
            <button
              key={s.id}
              className={`qz-nav-item ${section === s.id ? "is-active" : ""}`}
              style={s.id === "danger" && section !== "danger" ? { color: "var(--vq-danger-text)" } : undefined}
              onClick={() => setSection(s.id)}
              aria-current={section === s.id}
            >
              <s.icon size={16} /> {s.label}
            </button>
          ))}
        </nav>

        <div className="vq-stack" style={{ gap: "var(--vq-sp-6)" }}>
          {section === "profile" && (
            <>
              <Card>
                <div className="vq-row" style={{ gap: "var(--vq-sp-6)", flexWrap: "wrap" }}>
                  <Avatar name="あおい" size="xl" />
                  <div className="vq-grow" style={{ minWidth: 180 }}>
                    <div style={{ font: "var(--vq-type-heading-md)" }}>あおい</div>
                    <div style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)" }}>@aoi_eng · 高3</div>
                  </div>
                  <Button size="sm" variant="outline">画像を変更</Button>
                </div>
              </Card>
              <Card>
                <div className="vq-stack" style={{ gap: "var(--vq-sp-5)", maxWidth: 420 }}>
                  <Field label="表示名"><TextInput defaultValue="あおい" aria-label="表示名" /></Field>
                  <Field label="ハンドル" hint="vocabuquiz.com/@aoi_eng">
                    {() => <TextInput addon="@" defaultValue="aoi_eng" aria-label="ハンドル" />}
                  </Field>
                  <Field label="自己紹介" count={{ current: 31, max: 160 }}>
                    {() => <Textarea defaultValue="英語弱者から共通テスト8割を目指す記録。" rows={3} />}
                  </Field>
                  <div><Button onClick={() => toast({ title: "プロフィールを保存しました", tone: "success" })}>保存</Button></div>
                </div>
              </Card>
            </>
          )}

          {section === "account" && (
            <>
              <SetGroup title="基本情報">
                <SetRow
                  icon={<User size={16} />} label="学年" desc="4月に自動で進級します"
                  control={<Select size="sm" defaultValue="h3" aria-label="学年" style={{ width: 90 }}><option value="h1">高1</option><option value="h2">高2</option><option value="h3">高3</option></Select>}
                />
                <SetRow icon={<Mail size={16} />} label="メールアドレス" desc="未登録 — 再設定と週間レポートに使用" onClick={noop} chevron />
                <SetRow icon={<Link2 size={16} />} label="連携サービス" desc="Google · 未連携" onClick={noop} chevron />
              </SetGroup>
              <SetGroup title="セッション">
                <SetRow
                  icon={<LogOut size={16} />} label="ログアウト" desc="この端末からログアウトします。学習データは保持されます"
                  control={<Button size="sm" variant="outline">ログアウト</Button>}
                />
              </SetGroup>
            </>
          )}

          {section === "security" && (
            <>
              <Card>
                <h2 style={{ font: "var(--vq-type-heading-md)", marginBottom: "var(--vq-sp-6)" }}>パスワードの変更</h2>
                <div className="vq-stack" style={{ gap: "var(--vq-sp-5)", maxWidth: 420 }}>
                  <Field label="現在のパスワード"><PasswordInput icon={<Lock size={16} />} aria-label="現在のパスワード" /></Field>
                  <Field label="新しいパスワード" hint="8文字以上"><PasswordInput icon={<Lock size={16} />} aria-label="新しいパスワード" /></Field>
                  <div><Button>パスワードを変更</Button></div>
                </div>
              </Card>
              <SetGroup>
                <SetRow icon={<Shield size={16} />} label="2段階認証" desc="認証アプリでログインを保護" control={<Switch aria-label="2段階認証" />} />
                <SetRow icon={<Bell size={16} />} label="ログイン通知" desc="新しい端末からのログインを通知" control={<Switch defaultChecked aria-label="ログイン通知" />} />
              </SetGroup>
              <Alert tone="info" title="ログイン中の端末: 2台">iPhone (今この端末) · MacBook (3日前) — 覚えのない端末があればパスワードを変更してください。</Alert>
            </>
          )}

          {section === "notifications" && (
            <SetGroup>
              {([
                ["学習リマインダー", "毎日19:00に今日の復習を通知", true],
                ["いいね・コメント", "自分の投稿への反応", true],
                ["フォロー", "新しいフォロワー", true],
                ["Qredit", "獲得・支払いの通知", false],
                ["AIからの提案", "苦手分野の復習セットなど", true],
                ["週間レポート", "メールで学習サマリーを受け取る", false],
              ] as [string, string, boolean][]).map(([label, desc, on]) => (
                <SetRow key={label} label={label} desc={desc} control={<Switch defaultChecked={on} aria-label={label} />} />
              ))}
            </SetGroup>
          )}

          {section === "appearance" && (
            <SetGroup>
              <SetRow
                icon={<Moon size={16} />} label="テーマ"
                control={<Select size="sm" defaultValue="light" aria-label="テーマ" style={{ width: 150 }}><option value="light">ライト</option><option value="dark">ダーク</option><option value="system">システムに合わせる</option></Select>}
              />
              <SetRow label="アニメーションを減らす" desc="視差・演出を最小化（OSの設定にも従います）" control={<Switch aria-label="アニメーションを減らす" />} />
              <SetRow label="コンパクト表示" desc="情報密度を上げる" control={<Switch aria-label="コンパクト表示" />} />
            </SetGroup>
          )}

          {section === "language" && (
            <SetGroup>
              <SetRow
                icon={<Globe size={16} />} label="表示言語"
                control={<Select size="sm" defaultValue="ja" aria-label="表示言語" style={{ width: 120 }}><option value="ja">日本語</option><option value="en">English</option></Select>}
              />
              <SetRow
                label="週の開始日"
                control={<Select size="sm" defaultValue="mon" aria-label="週の開始日" style={{ width: 110 }}><option value="mon">月曜日</option><option value="sun">日曜日</option></Select>}
              />
            </SetGroup>
          )}

          {section === "ai" && (
            <>
              <SetGroup>
                <SetRow icon={<Sparkles size={16} />} label="AIによる出題最適化" desc="解答履歴から苦手を分析して出題を調整" control={<Switch defaultChecked aria-label="AI出題最適化" />} />
                <SetRow label="PDFのAI解析" desc="アップロードした教材は問題生成にのみ使用" control={<Switch defaultChecked aria-label="PDF解析" />} />
                <SetRow icon={<Database size={16} />} label="学習データをエクスポート" desc="CSV / JSON でダウンロード" onClick={noop} chevron />
              </SetGroup>
              <Alert tone="ai" title="データの扱い">学習データは成績向上の分析にのみ使われ、外部に販売されることはありません。エクスポート・削除はいつでも可能です。</Alert>
            </>
          )}

          {section === "other" && (
            <>
              <SetGroup>
                <SetRow icon={<CircleHelp size={16} />} label="ヘルプセンター" onClick={noop} chevron />
                <SetRow icon={<MessageCircle size={16} />} label="お問い合わせ" desc="通常1営業日以内に返信します" onClick={noop} chevron />
              </SetGroup>
              <SetGroup>
                <SetRow label="利用規約" onClick={noop} chevron />
                <SetRow label="プライバシーポリシー" onClick={noop} chevron />
                <SetRow label="バージョン" desc="v26.0 (build 2026.07.22)" />
              </SetGroup>
            </>
          )}

          {section === "danger" && (
            <>
              <Alert tone="warning" title="このセクションの操作は取り消しが難しいものです">実行前に内容をよく確認してください。</Alert>
              <div>
                <div style={{ font: "var(--vq-type-caption)", fontWeight: 700, color: "var(--vq-danger-text)", letterSpacing: "0.05em", padding: "0 var(--vq-sp-3) var(--vq-sp-3)" }}>DANGER ZONE</div>
                <Card pad={false} style={{ borderColor: "color-mix(in srgb, var(--vq-danger) 32%, transparent)" }}>
                  <SetRow
                    tone="danger" icon={<RefreshCw size={16} />} label="学習履歴をリセット"
                    desc="正答率・連続記録が消えます。クイズは残ります"
                    control={<Button size="sm" variant="danger-soft">リセット</Button>}
                  />
                  <SetRow
                    tone="danger" icon={<Trash2 size={16} />} label="アカウントを削除"
                    desc="すべてのデータが14日後に完全削除されます"
                    control={<Button size="sm" variant="danger" onClick={() => setDeleteOpen(true)}>削除する</Button>}
                  />
                </Card>
              </div>
            </>
          )}
        </div>
      </div>

      <Modal
        open={deleteOpen}
        onClose={() => { setDeleteOpen(false); setConfirm(""); }}
        title="アカウントを完全に削除しますか？"
        description="作成したクイズ12件・学習履歴・1,250 Qredit がすべて削除されます。14日以内のログインで取り消せます。"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>キャンセル</Button>
            <Button variant="danger" disabled={confirm !== "削除"} onClick={() => { setDeleteOpen(false); toast({ title: "削除リクエストを受け付けました", description: "14日以内のログインで取り消せます", tone: "danger" }); }}>
              完全に削除する
            </Button>
          </>
        }
      >
        <Field label="確認のため「削除」と入力してください">
          {(a) => <TextInput id={a.id} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="削除" />}
        </Field>
      </Modal>
    </AppFrame>
  );
}

/* ═══ Quick Chat ═══════════════════════════════════════════ */
interface ChatMsg { role: "user" | "ai"; text: string; thinking?: boolean; tool?: string; logs?: string[] }

export function QuickChatScreen() {
  const [msgs, setMsgs] = useState<ChatMsg[]>([
    { role: "user", text: "仮定法過去と仮定法過去完了の違いを、例文つきで簡単に教えて" },
    {
      role: "ai",
      text: "ポイントは「いつの話か」です。\n\n仮定法過去 — 現在の事実に反する仮定\nIf I had time, I would help you.（今、時間があれば）\n\n仮定法過去完了 — 過去の事実に反する仮定\nIf I had had time, I would have helped you.(あのとき、時間があったら)\n\n見分け方: If節が had + 過去分詞 なら過去の話。主節は would have + 過去分詞 とセットになります。この範囲の10問クイズを作りますか？",
      logs: ["文法データベースを検索 (0.4s)", "例文の難易度を高2向けに調整"],
    },
  ]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  const send = () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text }, { role: "ai", text: "", thinking: true }]);
    setStreaming(true);
    const reply = "いい質問です。まず結論から言うと、この範囲は「型」を覚えるのが最短です。関連する例文を3つ用意しました。実際の定期考査の出題パターンに合わせたクイズも生成できます。";
    let i = 0;
    const timer = setInterval(() => {
      i += 3 + Math.floor(Math.random() * 4);
      const slice = reply.slice(0, i);
      setMsgs((m) => m.map((msg, idx) => (idx === m.length - 1 ? { ...msg, text: slice, thinking: false, tool: i < reply.length ? undefined : undefined } : msg)));
      scrollRef.current?.scrollTo({ top: 99999 });
      if (i >= reply.length) { clearInterval(timer); setStreaming(false); }
    }, 60);
  };

  return (
    <AppFrame active="quickchat" title="Quick Chat" noTopbar>
      <style>{`.qz-content { padding: 0 !important; } .qz-content > * { max-width: none !important; }`}</style>
      <div className="qz-chat">
        <aside className="qz-chat__list">
          <Button full size="sm" icon={<Plus size={14} />} style={{ marginBottom: "var(--vq-sp-4)" }}>新しい会話</Button>
          <div className="vq-stack" style={{ gap: 2 }}>
            {["仮定法の違い", "mol計算の解き方", "江戸幕府の要点整理", "共通テスト長文のコツ"].map((c, i) => (
              <button key={c} className={`qz-nav-item ${i === 0 ? "is-active" : ""}`} style={{ fontSize: 12.5 }}>
                <MessageCircle size={14} /> <span className="vq-truncate">{c}</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="qz-chat__main">
          <div className="qz-topbar" style={{ position: "static" }}>
            <span className="vq-row" style={{ gap: "var(--vq-sp-3)" }}>
              <span style={{ display: "grid", placeItems: "center", width: 28, height: 28, borderRadius: 8, background: "var(--vq-ai-bg)", color: "var(--vq-ai)" }}><Sparkles size={15} /></span>
              <span className="qz-topbar__title" style={{ fontSize: 15 }}>仮定法の違い</span>
              <Badge tone="ai">Canopy 5.0</Badge>
            </span>
            <span className="vq-grow" />
            <IconButton label="会話を削除" size="sm"><Trash2 size={16} /></IconButton>
          </div>

          <div className="qz-chat__scroll" ref={scrollRef}>
            {msgs.map((m, i) => (
              <div key={i} className={`qz-msg ${m.role === "user" ? "qz-msg--user" : ""}`}>
                {m.role === "ai" && (
                  <span style={{ display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: 9, background: "var(--vq-ai-bg)", color: "var(--vq-ai)", flex: "0 0 auto" }}>
                    <Sparkles size={14} />
                  </span>
                )}
                <div className="qz-msg__bubble">
                  {m.thinking ? (
                    <span className="qz-thinking" role="status" aria-label="考え中"><i /><i /><i /></span>
                  ) : (
                    <>
                      {m.logs && (
                        <details style={{ marginBottom: "var(--vq-sp-3)" }}>
                          <summary style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)", cursor: "pointer" }}>実行ログ（{m.logs.length}件）</summary>
                          <div style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)", paddingLeft: "var(--vq-sp-5)", marginTop: 4 }}>
                            {m.logs.map((l) => <div key={l}>· {l}</div>)}
                          </div>
                        </details>
                      )}
                      <p style={{ whiteSpace: "pre-wrap" }}>{m.text}{streaming && i === msgs.length - 1 && <span style={{ opacity: 0.5 }}>▍</span>}</p>
                      {m.role === "ai" && !streaming && (
                        <div className="vq-row" style={{ gap: 2, marginTop: "var(--vq-sp-3)" }}>
                          <IconButton size="sm" label="コピー" onClick={() => toast({ title: "コピーしました", tone: "success" })}><Copy size={14} /></IconButton>
                          <IconButton size="sm" label="良い回答"><ThumbsUp size={14} /></IconButton>
                          <IconButton size="sm" label="改善が必要"><ThumbsDown size={14} /></IconButton>
                          <IconButton size="sm" label="再生成"><RefreshCw size={14} /></IconButton>
                          <Button size="sm" variant="secondary" icon={<Zap size={13} />} style={{ marginLeft: "var(--vq-sp-3)" }}>この内容でクイズを作る</Button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="qz-chat__input">
            <Card pad={false} style={{ padding: "var(--vq-sp-3) var(--vq-sp-4)" }}>
              <div className="vq-row" style={{ gap: "var(--vq-sp-2)", alignItems: "flex-end" }}>
                <IconButton label="ファイルを添付" size="sm"><Paperclip size={16} /></IconButton>
                <Textarea
                  placeholder="質問を入力（Shift+Enterで改行）"
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  style={{ border: 0, minHeight: 40, maxHeight: 140, padding: "8px 4px", resize: "none" }}
                  aria-label="メッセージ"
                />
                {streaming ? (
                  <IconButton label="停止" variant="outline" size="sm" onClick={() => setStreaming(false)}><Square size={14} /></IconButton>
                ) : (
                  <IconButton label="送信" variant="primary" size="sm" onClick={send} disabled={!input.trim()}><Send size={15} /></IconButton>
                )}
              </div>
            </Card>
            <p style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)", textAlign: "center", marginTop: "var(--vq-sp-3)" }}>
              AIの回答には誤りが含まれることがあります。テスト前は必ず教科書で確認を。
            </p>
          </div>
        </div>
      </div>
    </AppFrame>
  );
}

/* ═══ Sede ═════════════════════════════════════════════════ */
export function SedeScreen() {
  const [file, setFile] = useState("quiz-widget.tsx");
  const [running, setRunning] = useState(false);
  const files = [
    { name: "quiz-widget.tsx", icon: FileCode2 },
    { name: "styles.css", icon: FileText },
    { name: "data.json", icon: Database },
  ];
  return (
    <AppFrame active="sede" title="Sede" noTopbar>
      <style>{`.qz-content { padding: 0 !important; } .qz-content > * { max-width: none !important; }`}</style>
      <div className="qz-sede">
        <aside className="qz-sede__tree">
          <div className="vq-row" style={{ gap: "var(--vq-sp-3)", padding: "var(--vq-sp-3) var(--vq-sp-4)", marginBottom: "var(--vq-sp-3)" }}>
            <Folder size={14} style={{ color: "var(--vq-text-tertiary)" }} />
            <span style={{ font: "var(--vq-type-label)", fontSize: 12.5 }}>my-quiz-app</span>
            <Badge tone="success" dot>保存済み</Badge>
          </div>
          {files.map((f) => (
            <button key={f.name} className={`qz-sede__tree-item ${file === f.name ? "is-active" : ""}`} onClick={() => setFile(f.name)}>
              <f.icon size={13} /> {f.name}
            </button>
          ))}
        </aside>

        <div className="qz-sede__editor">
          <div className="vq-row" style={{ padding: "var(--vq-sp-3) var(--vq-sp-5)", borderBottom: "1px solid var(--vq-border-subtle)", gap: "var(--vq-sp-4)" }}>
            <span style={{ font: "var(--vq-type-code)", fontSize: 12 }}>{file}</span>
            <Badge tone="warning">未保存の変更</Badge>
            <span className="vq-grow" />
            <Button size="sm" variant={running ? "danger-soft" : "secondary"} icon={running ? <Square size={12} /> : <Play size={12} />} onClick={() => setRunning(!running)}>
              {running ? "停止" : "実行"}
            </Button>
            <Button size="sm" variant="outline">デプロイ</Button>
          </div>
          <div className="qz-sede__code" aria-label="コードエディタ">
            <div><span className="ln">1</span><span style={{ color: "var(--vq-ai)" }}>import</span> {"{ useState }"} <span style={{ color: "var(--vq-ai)" }}>from</span> <span style={{ color: "var(--vq-success-text)" }}>"react"</span>;</div>
            <div><span className="ln">2</span></div>
            <div><span className="ln">3</span><span style={{ color: "var(--vq-ai)" }}>export function</span> <span style={{ color: "var(--vq-accent-text)" }}>QuizWidget</span>() {"{"}</div>
            <div><span className="ln">4</span>  <span style={{ color: "var(--vq-ai)" }}>const</span> [score, setScore] = <span style={{ color: "var(--vq-accent-text)" }}>useState</span>(0);</div>
            <div><span className="ln">5</span>  <span style={{ color: "var(--vq-text-tertiary)" }}>{"// AIの提案: 正解時にアニメーションを追加"}</span></div>
            <div><span className="ln">6</span>  <span style={{ color: "var(--vq-ai)" }}>return</span> {"<div className=\"widget\">スコア: {score}</div>"};</div>
            <div><span className="ln">7</span>{"}"}</div>
          </div>
          <div className="vq-row" style={{ padding: "var(--vq-sp-3) var(--vq-sp-5)", borderTop: "1px solid var(--vq-border-subtle)", gap: "var(--vq-sp-3)" }}>
            <Badge tone="ai"><Sparkles size={11} /> AI変更提案 1件</Badge>
            <span style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-secondary)" }} className="vq-truncate">+ 正解時に vq-pop アニメーションを追加（3行）</span>
            <span className="vq-grow" />
            <Button size="sm" variant="success" icon={<Check size={12} />}>承認</Button>
            <Button size="sm" variant="ghost" icon={<X size={12} />}>却下</Button>
          </div>
        </div>

        <aside className="qz-sede__chat">
          <div style={{ padding: "var(--vq-sp-4) var(--vq-sp-5)", borderBottom: "1px solid var(--vq-border-subtle)", font: "var(--vq-type-label)", fontSize: 13 }}>
            <Sparkles size={13} style={{ color: "var(--vq-ai)", verticalAlign: -2, marginRight: 6 }} />
            Sede AI
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "var(--vq-sp-5)", font: "var(--vq-type-body-sm)" }} className="vq-stack">
            <Card sunken style={{ marginBottom: "var(--vq-sp-4)" }}>
              スコア表示のウィジェットを作りました。次は「正解時のアニメーション」を提案しています。左の差分を確認して承認してください。
            </Card>
            <span style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)" }}>タスク履歴: 3件完了 · セッション 12分</span>
          </div>
          <div style={{ padding: "var(--vq-sp-4)", borderTop: "1px solid var(--vq-border-subtle)" }}>
            <TextInput size="sm" placeholder="Sedeに指示…" aria-label="Sedeへの指示" />
          </div>
        </aside>

        <div className="qz-sede__term">
          <div style={{ opacity: 0.6 }}>$ vite build</div>
          <div>✓ 34 modules transformed — 214ms</div>
          {running && <div>➜ preview: <span style={{ textDecoration: "underline" }}>https://sede.vocabuquiz.dev/aoi/quiz-widget</span></div>}
          <div style={{ opacity: 0.6 }}>$ {running ? "実行中…" : "_"}</div>
        </div>
      </div>
    </AppFrame>
  );
}
