import React, { useState } from "react";
import {
  Bell, BookOpen, Bookmark, Coins, Flag, Heart, Image as ImageIcon,
  MessageCircle, MoreHorizontal, Pencil, Plus, Share2, Sparkles, Star,
  Trophy, UserPlus, Users,
} from "lucide-react";
import {
  Avatar, Badge, Button, Card, Chip, Divider, Dropdown, EmptyState, IconButton,
  ListItem, Modal, Progress, Segmented, Tabs, Textarea, useToast,
} from "../ui/components";
import { AppFrame } from "./shell";
import { NOTICES, POSTS, QUIZZES, USERS } from "../mocks/data";
import type { MockPost } from "../mocks/data";

/* ═══ Feed ═════════════════════════════════════════════════ */
export function FeedScreen() {
  const [tab, setTab] = useState("all");
  const [composer, setComposer] = useState(false);
  const [detail, setDetail] = useState<MockPost | null>(null);
  const toast = useToast();

  return (
    <AppFrame
      active="feed"
      title="Feed"
      fab={
        <button className="qz-fab" aria-label="投稿を作成" onClick={() => setComposer(true)}>
          <Plus size={22} />
        </button>
      }
    >
      <div className="qz-feed">
        <div>
          <div className="vq-row" style={{ justifyContent: "space-between", marginBottom: "var(--vq-sp-5)", gap: "var(--vq-sp-4)", flexWrap: "wrap" }}>
            <Tabs
              ariaLabel="フィードの種類"
              value={tab}
              onChange={setTab}
              items={[
                { id: "all", label: "すべて" },
                { id: "following", label: "フォロー中" },
                { id: "quiz", label: "クイズ共有" },
                { id: "score", label: "スコア" },
              ]}
            />
            <Button icon={<Pencil size={14} />} onClick={() => setComposer(true)}>投稿する</Button>
          </div>

          {POSTS.filter((p) => tab === "all" || (tab === "quiz" && p.quiz && !p.score) || (tab === "score" && p.score) || (tab === "following" && p.user.friends)).map((p) => (
            <PostCard key={p.id} post={p} onOpen={() => setDetail(p)} />
          ))}
        </div>

        <aside className="qz-feed__aside vq-stack" style={{ gap: "var(--vq-sp-5)" }}>
          <Card>
            <h2 style={{ font: "var(--vq-type-heading-sm)", marginBottom: "var(--vq-sp-4)" }}>おすすめユーザー</h2>
            <div className="vq-stack" style={{ gap: "var(--vq-sp-4)" }}>
              {USERS.slice(0, 3).map((u) => (
                <div key={u.id} className="vq-row" style={{ gap: "var(--vq-sp-4)" }}>
                  <Avatar name={u.name} size="sm" online={u.online} />
                  <span className="vq-stack vq-grow" style={{ minWidth: 0 }}>
                    <span className="vq-truncate" style={{ font: "var(--vq-type-label)", fontSize: 13 }}>{u.name}</span>
                    <span className="vq-truncate" style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)" }}>@{u.handle}</span>
                  </span>
                  <Button size="sm" variant="outline" icon={<UserPlus size={13} />}>フォロー</Button>
                </div>
              ))}
            </div>
          </Card>
          <Card sunken>
            <div style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-secondary)", lineHeight: 1.8 }}>
              Feedは学習コミュニティです。誹謗中傷・教材の無断転載・答案の丸写し依頼は
              <a href="#/screens/feed" onClick={(e) => e.preventDefault()}> ガイドライン</a> により削除されます。
            </div>
          </Card>
        </aside>
      </div>

      {/* 投稿作成 */}
      <Modal
        open={composer}
        onClose={() => setComposer(false)}
        title="投稿を作成"
        size="lg"
        footerBetween
        footer={
          <>
            <span className="vq-row" style={{ gap: 2 }}>
              <IconButton label="画像を添付"><ImageIcon size={17} /></IconButton>
              <IconButton label="クイズを添付"><BookOpen size={17} /></IconButton>
              <IconButton label="スコアを共有"><Trophy size={17} /></IconButton>
            </span>
            <span className="vq-row" style={{ gap: "var(--vq-sp-4)" }}>
              <Button variant="ghost" onClick={() => setComposer(false)}>下書き保存</Button>
              <Button onClick={() => { setComposer(false); toast({ title: "投稿しました", tone: "success" }); }}>投稿</Button>
            </span>
          </>
        }
      >
        <div className="vq-row" style={{ gap: "var(--vq-sp-4)", alignItems: "flex-start" }}>
          <Avatar name="あおい" size="sm" />
          <Textarea placeholder="学習の記録・気づき・クイズの紹介など" rows={4} style={{ border: 0, padding: 0, minHeight: 120 }} autoFocus aria-label="投稿本文" />
        </div>
        <Divider style={{ margin: "var(--vq-sp-4) 0" }} />
        <div className="vq-row" style={{ gap: "var(--vq-sp-3)", flexWrap: "wrap" }}>
          <Chip selected>全体に公開</Chip>
          <Chip>フォロワーのみ</Chip>
        </div>
      </Modal>

      {/* 投稿詳細（コメントスレッド） */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title="投稿" size="lg">
        {detail && (
          <>
            <PostCard post={detail} flat />
            <Divider label={`コメント ${detail.comments}件`} style={{ margin: "var(--vq-sp-5) 0" }} />
            <div className="vq-stack" style={{ gap: "var(--vq-sp-5)" }}>
              {[
                { u: USERS[2], t: "5分前", text: "ちょうど探してた範囲！テスト前に助かります" },
                { u: USERS[4], t: "18分前", text: "参勤交代の問題、ひっかけが良問すぎる" },
              ].map((c, i) => (
                <div key={i} className="vq-row" style={{ gap: "var(--vq-sp-4)", alignItems: "flex-start" }}>
                  <Avatar name={c.u.name} size="sm" />
                  <div className="vq-grow" style={{ minWidth: 0 }}>
                    <span style={{ font: "var(--vq-type-caption)" }}>
                      <b style={{ color: "var(--vq-text)" }}>{c.u.name}</b>
                      <span style={{ color: "var(--vq-text-tertiary)" }}> · {c.t}</span>
                    </span>
                    <p style={{ font: "var(--vq-type-body-sm)", marginTop: 2 }}>{c.text}</p>
                  </div>
                  <IconButton size="sm" label="いいね"><Heart size={14} /></IconButton>
                </div>
              ))}
              <div className="vq-row" style={{ gap: "var(--vq-sp-4)", alignItems: "flex-start" }}>
                <Avatar name="あおい" size="sm" />
                <Textarea placeholder="コメントを追加" rows={2} style={{ minHeight: 60 }} aria-label="コメント" />
              </div>
            </div>
          </>
        )}
      </Modal>
    </AppFrame>
  );
}

export function PostCard({ post, onOpen, flat }: { post: MockPost; onOpen?: () => void; flat?: boolean }) {
  const [liked, setLiked] = useState(!!post.liked);
  const [saved, setSaved] = useState(!!post.saved);
  const toast = useToast();
  const inner = (
    <>
      <div className="qz-post__head">
        <Avatar name={post.user.name} size="sm" online={post.user.online} />
        <span className="vq-stack vq-grow" style={{ minWidth: 0, gap: 0 }}>
          <span className="vq-row" style={{ gap: "var(--vq-sp-3)" }}>
            <b className="vq-truncate" style={{ font: "var(--vq-type-label)", fontSize: 13.5 }}>{post.user.name}</b>
            {post.user.friends && <Badge tone="accent">友達</Badge>}
          </span>
          <span className="vq-truncate" style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)" }}>@{post.user.handle} · {post.time}</span>
        </span>
        <Dropdown
          align="end"
          label="投稿メニュー"
          trigger={<IconButton size="sm" label="その他"><MoreHorizontal size={16} /></IconButton>}
          items={[
            { id: "follow", icon: <UserPlus size={14} />, label: `@${post.user.handle} をフォロー` },
            { id: "report", icon: <Flag size={14} />, label: "投稿を報告", danger: true, separatorAbove: true },
          ]}
        />
      </div>
      <p className="qz-post__text">{post.text}</p>

      {post.score && (
        <Card sunken style={{ marginBottom: "var(--vq-sp-5)" }}>
          <div className="vq-row" style={{ gap: "var(--vq-sp-5)" }}>
            <span style={{ display: "grid", placeItems: "center", width: 44, height: 44, borderRadius: "var(--vq-r-md)", background: "var(--vq-success-bg)", color: "var(--vq-success)" }}>
              <Trophy size={20} />
            </span>
            <div className="vq-grow">
              <div className="vq-num" style={{ font: "var(--vq-type-heading-md)" }}>{post.score.correct} / {post.score.total} 問正解（{Math.round((post.score.correct / post.score.total) * 100)}%）</div>
              <div style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)" }}>所要 {post.score.time}</div>
            </div>
          </div>
        </Card>
      )}

      {post.quiz && (
        <Card style={{ marginBottom: "var(--vq-sp-5)", cursor: "pointer" }} hover>
          <div className="vq-row" style={{ gap: "var(--vq-sp-4)" }}>
            <span style={{ display: "grid", placeItems: "center", width: 40, height: 40, borderRadius: "var(--vq-r-md)", background: "var(--vq-accent-subtle)", color: "var(--vq-accent-text)", flex: "0 0 auto" }}>
              <BookOpen size={18} />
            </span>
            <div className="vq-grow" style={{ minWidth: 0 }}>
              <div className="vq-truncate" style={{ font: "var(--vq-type-label)", fontSize: 13.5 }}>{post.quiz.title}</div>
              <div style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)" }} className="vq-num">
                {post.quiz.subject} · {post.quiz.questions}問 · {post.quiz.plays.toLocaleString()}回プレイ
              </div>
            </div>
            <Button size="sm" variant="secondary">挑戦</Button>
          </div>
        </Card>
      )}

      <div className="qz-post__actions">
        <button className={`qz-post__action ${liked ? "is-liked" : ""}`} onClick={() => setLiked(!liked)} aria-pressed={liked} aria-label="いいね">
          <Heart size={15} fill={liked ? "currentColor" : "none"} /> <span className="vq-num">{post.likes + (liked && !post.liked ? 1 : 0)}</span>
        </button>
        <button className="qz-post__action" onClick={onOpen} aria-label={`コメント ${post.comments}件`}>
          <MessageCircle size={15} /> <span className="vq-num">{post.comments}</span>
        </button>
        <button className={`qz-post__action ${saved ? "is-saved" : ""}`} onClick={() => setSaved(!saved)} aria-pressed={saved} aria-label="保存">
          <Bookmark size={15} fill={saved ? "currentColor" : "none"} /> 保存
        </button>
        <button className="qz-post__action" onClick={() => toast({ title: "リンクをコピーしました", tone: "success" })} aria-label="共有">
          <Share2 size={15} /> 共有
        </button>
      </div>
    </>
  );
  if (flat) return <div>{inner}</div>;
  return <Card className="qz-post" as="article">{inner}</Card>;
}

/* ═══ Profile ══════════════════════════════════════════════ */
export function ProfileScreen() {
  const [tab, setTab] = useState("quizzes");
  const [followers, setFollowers] = useState<"followers" | "following" | null>(null);
  const me = USERS[1];
  return (
    <AppFrame active="profile" title="プロフィール">
      <div>
        <div className="qz-profile__cover" />
        <div className="qz-profile__head">
          <Avatar name={me.name} size="xl" />
          <div className="vq-grow" style={{ paddingBottom: 6, minWidth: 200 }}>
            <div className="vq-row" style={{ gap: "var(--vq-sp-3)", flexWrap: "wrap" }}>
              <h1 style={{ font: "var(--vq-type-heading-lg)" }}>{me.name}</h1>
              <Badge tone="accent">QDPクリエイター</Badge>
            </div>
            <div style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)" }}>@{me.handle} · {me.grade}</div>
          </div>
          <div className="vq-row" style={{ gap: "var(--vq-sp-3)", paddingBottom: 6 }}>
            <Button variant="outline" icon={<Pencil size={14} />}>編集</Button>
            <Button variant="outline" icon={<Share2 size={14} />}>共有</Button>
          </div>
        </div>

        <div style={{ padding: "var(--vq-sp-5) var(--vq-sp-6) 0" }}>
          <p style={{ font: "var(--vq-type-body-md)", maxWidth: 560, marginBottom: "var(--vq-sp-5)" }}>{me.bio}</p>
          <div className="qz-profile__stats" style={{ marginBottom: "var(--vq-sp-6)" }}>
            <button className="qz-profile__stat" onClick={() => setFollowers("following")}>
              <b className="vq-num" style={{ font: "var(--vq-type-heading-md)" }}>{me.following}</b>
              <span style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)", marginLeft: 5 }}>フォロー中</span>
            </button>
            <button className="qz-profile__stat" onClick={() => setFollowers("followers")}>
              <b className="vq-num" style={{ font: "var(--vq-type-heading-md)" }}>{me.followers.toLocaleString()}</b>
              <span style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)", marginLeft: 5 }}>フォロワー</span>
            </button>
            <div className="qz-profile__stat" style={{ cursor: "default" }}>
              <b className="vq-num" style={{ font: "var(--vq-type-heading-md)" }}>26</b>
              <span style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)", marginLeft: 5 }}>友達</span>
            </div>
          </div>

          <div className="vq-wrap" style={{ gap: "var(--vq-sp-3)", marginBottom: "var(--vq-sp-6)" }}>
            {["連続学習30日", "日本史マスター", "クイズ職人", "初投稿"].map((b) => (
              <Badge key={b} tone="outline"><Trophy size={11} /> {b}</Badge>
            ))}
          </div>

          <Tabs
            ariaLabel="プロフィールコンテンツ"
            value={tab}
            onChange={setTab}
            items={[
              { id: "quizzes", label: "作成したクイズ", count: 12 },
              { id: "posts", label: "投稿", count: 34 },
              { id: "saved", label: "保存済み", count: 8 },
              { id: "record", label: "学習記録" },
            ]}
          />
          <div style={{ height: "var(--vq-sp-6)" }} />

          {tab === "quizzes" && (
            <div className="qz-lib__grid">
              {[...new Map([...QUIZZES.filter((q) => q.author === me.name), ...QUIZZES.slice(0, 2)].map((q) => [q.id, q])).values()].map((q) => (
                <Card key={q.id} hover className="qz-quizcard">
                  <Badge tone="outline" className="qz-quizcard__subject">{q.subject}</Badge>
                  <h3 className="qz-quizcard__title vq-clamp-2">{q.title}</h3>
                  <div className="qz-quizcard__meta vq-num">{q.plays.toLocaleString()}回 · 正答率{q.accuracy}%</div>
                </Card>
              ))}
            </div>
          )}
          {tab === "posts" && POSTS.filter((p) => p.user.id === me.id).map((p) => <PostCard key={p.id} post={p} />)}
          {tab === "saved" && (
            <Card pad={false}>
              <EmptyState icon={<Bookmark size={22} />} title="保存済みは非公開です" description="保存したクイズや投稿は自分だけが見られます。" />
            </Card>
          )}
          {tab === "record" && (
            <Card>
              <div className="vq-row" style={{ justifyContent: "space-between", marginBottom: "var(--vq-sp-4)" }}>
                <h2 style={{ font: "var(--vq-type-heading-sm)" }}>今月の学習</h2>
                <Badge tone="success" dot>目標達成ペース</Badge>
              </div>
              <Progress value={72} label="今月の目標progress 72%" />
              <p style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)", marginTop: "var(--vq-sp-4)" }} className="vq-num">
                21.6時間 / 目標30時間 · 連続18日 · 3,204問
              </p>
            </Card>
          )}
        </div>
      </div>

      <Modal
        open={!!followers}
        onClose={() => setFollowers(null)}
        title={followers === "followers" ? `フォロワー ${me.followers}人` : `フォロー中 ${me.following}人`}
        sheetGrab
      >
        <div className="vq-stack" style={{ gap: 0 }}>
          {USERS.filter((u) => u.id !== me.id).map((u) => (
            <ListItem
              key={u.id}
              leading={<Avatar name={u.name} size="sm" online={u.online} />}
              title={u.name}
              description={`@${u.handle} · ${u.grade}`}
              trailing={<Button size="sm" variant={u.friends ? "secondary" : "outline"}>{u.friends ? "友達" : "フォロー"}</Button>}
              onClick={() => {}}
            />
          ))}
        </div>
      </Modal>
    </AppFrame>
  );
}

/* ═══ Notifications ════════════════════════════════════════ */
export function NotificationsScreen() {
  const [filter, setFilter] = useState("all");
  const icons: Record<string, { icon: React.ReactNode; bg: string; fg: string }> = {
    like: { icon: <Heart size={15} />, bg: "var(--vq-danger-bg)", fg: "var(--vq-social)" },
    comment: { icon: <MessageCircle size={15} />, bg: "var(--vq-accent-subtle)", fg: "var(--vq-accent-text)" },
    follow: { icon: <UserPlus size={15} />, bg: "var(--vq-accent-subtle)", fg: "var(--vq-accent-text)" },
    system: { icon: <Bell size={15} />, bg: "var(--vq-surface-active)", fg: "var(--vq-text-secondary)" },
    qredit: { icon: <Coins size={15} />, bg: "var(--vq-qredit-bg)", fg: "var(--vq-qredit)" },
    ai: { icon: <Sparkles size={15} />, bg: "var(--vq-ai-bg)", fg: "var(--vq-ai)" },
  };
  const filtered = NOTICES.filter((n) => filter === "all" || (filter === "unread" ? n.unread : n.type === filter));
  return (
    <AppFrame active="notifications" title="通知" topExtra={<Button size="sm" variant="ghost">すべて既読にする</Button>}>
      <div style={{ maxWidth: 640 }}>
        <div style={{ marginBottom: "var(--vq-sp-5)" }}>
          <Segmented
            ariaLabel="通知の絞り込み"
            value={filter}
            onChange={setFilter}
            items={[
              { id: "all", label: "すべて" }, { id: "unread", label: "未読" },
              { id: "system", label: "システム" }, { id: "qredit", label: "Qredit" },
            ]}
          />
        </div>
        <Card pad={false}>
          {filtered.length === 0 ? (
            <EmptyState icon={<Bell size={22} />} title="通知はありません" description="新しい通知が届くとここに表示されます。" />
          ) : (
            filtered.map((n) => (
              <div key={n.id} className={`qz-notice ${n.unread ? "is-unread" : ""}`}>
                <span className="qz-notice__icon" style={{ background: icons[n.type].bg, color: icons[n.type].fg }}>{icons[n.type].icon}</span>
                <div className="vq-grow" style={{ minWidth: 0 }}>
                  <p style={{ font: "var(--vq-type-body-sm)", fontWeight: n.unread ? 600 : 450 }}>{n.text}</p>
                  <span style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)" }}>{n.time}</span>
                </div>
              </div>
            ))
          )}
        </Card>
      </div>
    </AppFrame>
  );
}
