import React, { useState } from "react";
import {
  Bookmark, ChevronDown, Download, GraduationCap, LayoutGrid, List, Lock,
  Mail, Pencil, Play, Plus, Rows3, Search as SearchIcon, Trash2, User,
} from "lucide-react";
import { Demo, DocPage, LONG_JA, Section, SpecTable, UsageNotes } from "./lib/Doc";
import {
  Button, ButtonGroup, Checkbox, Field, IconButton, OTPInput, PasswordInput,
  Radio, SearchInput, Segmented, Select, Slider, Switch, Tabs, Textarea, TextInput,
} from "../ui/components";

/* ═══ Buttons ══════════════════════════════════════════════ */
export function CButtons() {
  const [loading, setLoading] = useState(false);
  return (
    <DocPage
      kicker="Components"
      title="Buttons"
      lede="操作の重要度を variant で示す。1画面に primary は原則1つ。並べるときは primary → outline → ghost の順で重要度を下げる。"
    >
      <UsageNotes
        use={["フォーム送信・画面遷移・作成などの明示的アクション", "モーダルの確定/キャンセル", "空状態からの主要導線"]}
        avoid={["ナビゲーション項目（→ サイドバー/タブを使う）", "テキスト内のリンク（→ link variant か <a>）", "選択状態の切り替え（→ Chip / Segmented を使う）"]}
      />

      <Section title="Variants">
        <Demo>
          <Button>ログイン</Button>
          <Button variant="secondary">下書きを保存</Button>
          <Button variant="outline">キャンセル</Button>
          <Button variant="ghost">あとで</Button>
          <Button variant="danger">アカウントを削除</Button>
          <Button variant="danger-soft">投稿を報告</Button>
          <Button variant="success">採点する</Button>
          <Button variant="link">利用規約を読む</Button>
        </Demo>
      </Section>

      <Section title="Sizes">
        <Demo>
          <Button size="sm">小 (32px)</Button>
          <Button>中 (42px)</Button>
          <Button size="lg">大 (50px)</Button>
          <Button full style={{ maxWidth: 320 }}>幅いっぱい（モバイル主要CTA）</Button>
        </Demo>
      </Section>

      <Section title="States" desc="Loading 中はテキストを隠してスピナーを重ね、幅を保つ（ガタつき防止）。">
        <Demo>
          <Button>Default</Button>
          <Button disabled>Disabled</Button>
          <Button loading>送信中</Button>
          <Button
            loading={loading}
            onClick={() => { setLoading(true); setTimeout(() => setLoading(false), 1600); }}
          >
            クリックでLoading
          </Button>
        </Demo>
      </Section>

      <Section title="アイコン付き / アイコンのみ" desc="アイコンのみのボタンは aria-label が必須（IconButton は必須引数として強制）。">
        <Demo>
          <Button icon={<Play size={15} />}>クイズを開始</Button>
          <Button variant="outline" icon={<Download size={15} />}>PDFを取り込む</Button>
          <Button variant="secondary" trailingIcon={<ChevronDown size={15} />}>並び順</Button>
          <IconButton label="編集"><Pencil size={17} /></IconButton>
          <IconButton label="保存" variant="outline"><Bookmark size={17} /></IconButton>
          <IconButton label="新規作成" variant="primary"><Plus size={18} /></IconButton>
          <IconButton label="削除" size="sm"><Trash2 size={15} /></IconButton>
        </Demo>
      </Section>

      <Section title="Button Group / Split">
        <Demo>
          <ButtonGroup>
            <Button variant="outline" icon={<LayoutGrid size={14} />}>グリッド</Button>
            <Button variant="outline" icon={<List size={14} />}>リスト</Button>
            <Button variant="outline" icon={<Rows3 size={14} />}>コンパクト</Button>
          </ButtonGroup>
          <ButtonGroup>
            <Button>保存して公開</Button>
            <Button aria-label="公開オプション" style={{ paddingInline: 10 }}><ChevronDown size={15} /></Button>
          </ButtonGroup>
        </Demo>
      </Section>

      <Section title="日本語長文" desc="ボタン内テキストは折り返さず、収まらない文言はそもそも短くする。やむを得ない場合のみ2行を許容。">
        <Demo>
          <Button style={{ maxWidth: 280, whiteSpace: "normal", height: "auto", minHeight: "var(--vq-control-h-md)", paddingBlock: 8 }}>
            間違えた問題だけをもう一度復習する
          </Button>
          <Button variant="outline" style={{ maxWidth: 220 }}>
            <span className="vq-truncate">{LONG_JA}</span>
          </Button>
        </Demo>
      </Section>

      <Section title="仕様">
        <SpecTable
          head={["Prop", "型", "既定", "説明"]}
          rows={[
            [<code>variant</code>, "primary | secondary | outline | ghost | danger | danger-soft | success | link", "primary", "重要度と意味"],
            [<code>size</code>, "sm | md | lg", "md", "高さ 32/42/50px"],
            [<code>loading</code>, "boolean", "false", "スピナー表示＋操作無効"],
            [<code>icon / trailingIcon</code>, "ReactNode", "-", "先頭／末尾アイコン"],
            [<code>full</code>, "boolean", "false", "幅100%"],
          ]}
        />
      </Section>
    </DocPage>
  );
}

/* ═══ Inputs ═══════════════════════════════════════════════ */
export function CInputs() {
  const [pw, setPw] = useState("");
  const [caps, setCaps] = useState(false);
  const [search, setSearch] = useState("");
  const [otp, setOtp] = useState("");
  const [bio, setBio] = useState("英単語と日本史のクイズを作っています。");
  return (
    <DocPage
      kicker="Components"
      title="Inputs"
      lede="すべての入力欄は Field でラップし、ラベル・ヒント・エラーを統一構造にする。placeholder をラベルの代わりに使わない。"
    >
      <UsageNotes
        use={["フォームでの自由入力", "検索", "認証情報の入力"]}
        avoid={["選択肢が有限（→ Select / Radio / Chip）", "ON/OFF（→ Switch / Checkbox）"]}
      />

      <Section title="基本構造" desc="ラベル＋入力＋ヒント。エラー時はヒントがエラー文に置き換わり role=alert で通知される。">
        <Demo col style={{ maxWidth: 420 }}>
          <Field label="ログインID" hint="英数字と . _ - が使えます（2〜24文字）" required>
            {(a) => <TextInput id={a.id} aria-describedby={a.describedBy} placeholder="例: aoi_eng" icon={<User size={16} />} />}
          </Field>
          <Field label="メールアドレス" error="メールアドレスの形式が正しくありません">
            {(a) => <TextInput id={a.id} aria-describedby={a.describedBy} invalid={a.invalid} defaultValue="aoi@example" icon={<Mail size={16} />} />}
          </Field>
        </Demo>
      </Section>

      <Section title="Sizes / States">
        <Demo col style={{ maxWidth: 420 }}>
          <TextInput size="sm" placeholder="小 (32px)" aria-label="小" />
          <TextInput placeholder="中 (42px) — 標準" aria-label="中" />
          <TextInput size="lg" placeholder="大 (50px) — 認証画面など" aria-label="大" />
          <TextInput placeholder="Disabled" disabled aria-label="無効" />
          <TextInput defaultValue="入力済みの値" aria-label="入力済み" />
          <TextInput addon="vocabuquiz.com/" placeholder="ハンドル" aria-label="ハンドル" />
        </Demo>
      </Section>

      <Section title="Password" desc="表示切替＋CapsLock警告つき。強度表示は Auth Flow パターンを参照。">
        <Demo col style={{ maxWidth: 420 }}>
          <Field label="パスワード" hint={caps ? undefined : "8文字以上"} error={caps ? "Caps Lock がオンになっています" : undefined}>
            {(a) => (
              <PasswordInput
                id={a.id} aria-describedby={a.describedBy}
                icon={<Lock size={16} />}
                value={pw} onChange={(e) => setPw(e.target.value)}
                onCapsLock={setCaps}
                placeholder="••••••••"
              />
            )}
          </Field>
        </Demo>
      </Section>

      <Section title="Search / Textarea / OTP">
        <Demo col style={{ maxWidth: 420 }}>
          <SearchInput value={search} onChange={setSearch} placeholder="クイズ・ユーザーを検索" aria-label="検索" />
          <Field label="自己紹介" count={{ current: bio.length, max: 160 }}>
            {(a) => <Textarea id={a.id} value={bio} onChange={(e) => setBio(e.target.value)} rows={3} />}
          </Field>
          <Field label="確認コード" hint="メールに届いた6桁の数字（ペースト可）">
            {() => <OTPInput value={otp} onChange={setOtp} />}
          </Field>
        </Demo>
      </Section>

      <Section title="Select">
        <Demo col style={{ maxWidth: 420 }}>
          <Field label="学年">
            {(a) => (
              <Select id={a.id} icon={<GraduationCap size={16} />} defaultValue="h2">
                <option value="j1">中1</option><option value="j2">中2</option><option value="j3">中3</option>
                <option value="h1">高1</option><option value="h2">高2</option><option value="h3">高3</option>
              </Select>
            )}
          </Field>
          <Field label="並び順（disabled）">
            {(a) => <Select id={a.id} disabled><option>人気順</option></Select>}
          </Field>
        </Demo>
      </Section>

      <Section title="日本語長文">
        <Demo col style={{ maxWidth: 420 }}>
          <Field label="クイズ名" hint="長い名前は入力欄内で自然にスクロールする">
            {(a) => <TextInput id={a.id} defaultValue={LONG_JA} />}
          </Field>
        </Demo>
      </Section>
    </DocPage>
  );
}

/* ═══ Selection Controls ═══════════════════════════════════ */
export function CSelection() {
  const [vol, setVol] = useState(60);
  const [plan, setPlan] = useState("standard");
  return (
    <DocPage
      kicker="Components"
      title="Selection Controls"
      lede="Checkbox は複数選択、Radio は排他選択、Switch は即時反映のON/OFF。「保存ボタンを押すまで反映されないON/OFF」はSwitchではなくCheckboxにする。"
    >
      <Section title="Checkbox">
        <Demo col>
          <Checkbox label="利用規約に同意する" />
          <Checkbox label="学習リマインダーを受け取る（毎日 19:00）" defaultChecked />
          <Checkbox label="全選択" indeterminate />
          <Checkbox label="この端末を記憶する（共有端末では使わない）" />
          <Checkbox label="無効の選択肢" disabled />
          <Checkbox label="無効かつ選択済み" disabled defaultChecked />
        </Demo>
      </Section>

      <Section title="Radio">
        <Demo col>
          <div role="radiogroup" aria-label="公開範囲" className="vq-stack" style={{ gap: "var(--vq-sp-4)" }}>
            {[
              ["public", "全体に公開", "すべてのユーザーが検索・プレイできます"],
              ["followers", "フォロワーのみ", "あなたをフォローしている人だけが見られます"],
              ["private", "非公開", "自分だけが利用できます"],
            ].map(([v, label, desc]) => (
              <Radio
                key={v} name="visibility" value={v} defaultChecked={v === "public"}
                label={<span className="vq-stack" style={{ gap: 2 }}><b style={{ fontWeight: 600 }}>{label}</b><span style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)" }}>{desc}</span></span>}
              />
            ))}
          </div>
        </Demo>
      </Section>

      <Section title="Switch" desc="切り替えた瞬間に反映されるものだけに使う。">
        <Demo col>
          <Switch label="ダークモード" />
          <Switch label="学習中の通知をミュート" defaultChecked />
          <Switch label="効果音" size="sm" defaultChecked />
          <Switch label="実験的機能（無効）" disabled />
        </Demo>
      </Section>

      <Section title="Slider">
        <Demo col style={{ maxWidth: 420 }}>
          <div>
            <div className="vq-row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ font: "var(--vq-type-label)" }}>出題数</span>
              <span className="vq-num" style={{ font: "var(--vq-type-label)", color: "var(--vq-accent-text)" }}>{vol}問</span>
            </div>
            <Slider value={vol} min={10} max={100} step={5} onChange={(e) => setVol(Number(e.target.value))} aria-label="出題数" />
          </div>
        </Demo>
      </Section>

      <Section title="カード型の排他選択" desc="選択肢に説明が必要なときは、Radioの拡張としてカード選択を使う。">
        <Demo>
          {[
            ["light", "ライト", "10問 / 約5分"],
            ["standard", "スタンダード", "30問 / 約15分"],
            ["exam", "本番形式", "80問 / 60分・時間制限あり"],
          ].map(([v, label, desc]) => (
            <button
              key={v}
              type="button"
              className={`vq-card vq-card--pad vq-card--hover ${plan === v ? "vq-card--selected" : ""}`}
              onClick={() => setPlan(v)}
              aria-pressed={plan === v}
              style={{ cursor: "pointer", textAlign: "left", font: "inherit", color: "inherit", minWidth: 170 }}
            >
              <div style={{ font: "var(--vq-type-heading-sm)", marginBottom: 4 }}>{label}</div>
              <div style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)" }}>{desc}</div>
            </button>
          ))}
        </Demo>
      </Section>
    </DocPage>
  );
}

/* ═══ Tabs & Segmented ═════════════════════════════════════ */
export function CTabs() {
  const [tab, setTab] = useState("all");
  const [view, setView] = useState("grid");
  const [range, setRange] = useState("week");
  return (
    <DocPage
      kicker="Components"
      title="Tabs & Segmented"
      lede="Tabs はページ内のコンテンツ切り替え（URLに近い概念）。Segmented は同じデータの表示方法や範囲の切り替え。"
    >
      <Section title="Tabs" desc="矢印キーで移動できる。件数バッジは省略可能。">
        <Demo col>
          <Tabs
            ariaLabel="クイズの種類"
            value={tab}
            onChange={setTab}
            items={[
              { id: "all", label: "すべて", count: 128 },
              { id: "official", label: "公式", count: 24 },
              { id: "mine", label: "自作クイズ", count: 7 },
              { id: "fav", label: "お気に入り", count: 12 },
              { id: "archived", label: "アーカイブ", disabled: true },
            ]}
          />
          <div style={{ font: "var(--vq-type-body-sm)", color: "var(--vq-text-secondary)" }}>
            選択中: <b>{tab}</b> — タブ切替でコンテンツが変わる。タブ自体は状態を持たず、選択IDだけを返す。
          </div>
        </Demo>
      </Section>

      <Section title="Segmented">
        <Demo>
          <Segmented
            ariaLabel="表示形式"
            value={view}
            onChange={setView}
            items={[
              { id: "grid", label: "グリッド", icon: <LayoutGrid size={14} /> },
              { id: "list", label: "リスト", icon: <List size={14} /> },
              { id: "compact", label: "コンパクト", icon: <Rows3 size={14} /> },
            ]}
          />
          <Segmented
            ariaLabel="期間"
            value={range}
            onChange={setRange}
            items={[
              { id: "week", label: "週" }, { id: "month", label: "月" }, { id: "all", label: "全期間" },
            ]}
          />
        </Demo>
      </Section>

      <Section title="使い分け">
        <SpecTable
          head={["状況", "使うもの"]}
          rows={[
            ["内容そのものが変わる（概要／レビュー／設定）", "Tabs"],
            ["同じ一覧の見た目だけ変わる（グリッド／リスト）", "Segmented"],
            ["フィルタの絞り込み（科目・難易度）", "Chip（複数選択可）"],
            ["ページをまたぐ移動", "サイドバー / Bottom Navigation"],
          ]}
        />
      </Section>
    </DocPage>
  );
}
