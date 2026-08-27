/* VocabuQuiz モックデータ — 日本の高校生の学習文脈で自然な内容のみ。実在の個人情報は含まない。 */

export interface MockQuiz {
  id: string;
  title: string;
  subject: string;
  grade: string;
  questions: number;
  plays: number;
  accuracy: number;
  author: string;
  official?: boolean;
  favorite?: boolean;
  updated: string;
  difficulty: "基礎" | "標準" | "発展";
  tags: string[];
}

export const SUBJECTS = [
  "英語", "数学", "国語", "日本史", "世界史", "情報", "化学", "物理", "生物", "公共", "保健",
];

export const QUIZZES: MockQuiz[] = [
  { id: "q1", title: "英単語ターゲット1900 §1 基礎英単語 001–100", subject: "英語", grade: "高2", questions: 100, plays: 12840, accuracy: 78, author: "VocabuQuiz公式", official: true, favorite: true, updated: "2日前", difficulty: "基礎", tags: ["英単語", "定期考査"] },
  { id: "q2", title: "日本史探究 江戸幕府の成立と幕藩体制", subject: "日本史", grade: "高2", questions: 42, plays: 3210, accuracy: 64, author: "はるか_study", updated: "5時間前", difficulty: "標準", tags: ["定期考査", "近世"] },
  { id: "q3", title: "情報I 2進数・論理回路 完全対策", subject: "情報", grade: "高1", questions: 35, plays: 8956, accuracy: 71, author: "VocabuQuiz公式", official: true, updated: "1週間前", difficulty: "標準", tags: ["共通テスト"] },
  { id: "q4", title: "古典文法 助動詞の活用と接続 総まとめ", subject: "国語", grade: "高2", questions: 60, plays: 5677, accuracy: 58, author: "みなと", favorite: true, updated: "3日前", difficulty: "発展", tags: ["古典", "文法"] },
  { id: "q5", title: "化学基礎 mol計算 頻出パターン30", subject: "化学", grade: "高1", questions: 30, plays: 15203, accuracy: 62, author: "けんた.m", updated: "昨日", difficulty: "標準", tags: ["計算", "定期考査"] },
  { id: "q6", title: "英語コミュニケーションIII Lesson 7 重要語句", subject: "英語", grade: "高3", questions: 45, plays: 987, accuracy: 82, author: "あおい", updated: "4時間前", difficulty: "基礎", tags: ["教科書", "予習"] },
  { id: "q7", title: "共通テスト英語 リーディング 語彙レベル判定", subject: "英語", grade: "高3", questions: 80, plays: 22450, accuracy: 69, author: "VocabuQuiz公式", official: true, updated: "2週間前", difficulty: "発展", tags: ["共通テスト", "模試"] },
  { id: "q8", title: "公共 基本的人権と日本国憲法", subject: "公共", grade: "高1", questions: 38, plays: 4102, accuracy: 75, author: "sora_22", updated: "6日前", difficulty: "基礎", tags: ["定期考査"] },
  { id: "q9", title: "世界史探究 フランス革命とナポレオン", subject: "世界史", grade: "高2", questions: 55, plays: 6721, accuracy: 61, author: "りく", updated: "1日前", difficulty: "標準", tags: ["近代", "定期考査"] },
  { id: "q10", title: "保健 心身の健康と生活習慣病", subject: "保健", grade: "高1", questions: 25, plays: 1893, accuracy: 88, author: "ひなた", updated: "3週間前", difficulty: "基礎", tags: ["定期考査"] },
  { id: "q11", title: "数学II 三角関数の加法定理 演習", subject: "数学", grade: "高2", questions: 20, plays: 9384, accuracy: 54, author: "VocabuQuiz公式", official: true, updated: "5日前", difficulty: "発展", tags: ["計算", "模試"] },
  { id: "q12", title: "生物基礎 遺伝子とDNA 用語チェック", subject: "生物", grade: "高1", questions: 40, plays: 7245, accuracy: 79, author: "ゆず", favorite: true, updated: "昨日", difficulty: "基礎", tags: ["用語", "定期考査"] },
];

export interface MockUser {
  id: string;
  name: string;
  handle: string;
  grade: string;
  bio?: string;
  followers: number;
  following: number;
  friends?: boolean;
  online?: boolean;
}

export const USERS: MockUser[] = [
  { id: "u1", name: "あおい", handle: "aoi_eng", grade: "高3", bio: "英語弱者から共通テスト8割を目指す記録。単語帳はターゲット派。", followers: 342, following: 128, online: true },
  { id: "u2", name: "はるか_study", handle: "haruka_study", grade: "高2", bio: "日本史探究のクイズを作っています。定期考査対策はお任せください。", followers: 1204, following: 89, friends: true },
  { id: "u3", name: "けんた.m", handle: "kenta_m", grade: "高1", bio: "化学基礎・物理基礎の計算問題を毎週追加中。", followers: 567, following: 234, online: true },
  { id: "u4", name: "みなと", handle: "minato_kb", grade: "高2", bio: "古典文法をゲーム感覚で。助動詞は友達。", followers: 890, following: 456, friends: true },
  { id: "u5", name: "ゆず", handle: "yuzu_bio", grade: "高1", followers: 123, following: 98 },
  { id: "u6", name: "りく", handle: "riku_world", grade: "高2", followers: 445, following: 310 },
];

export interface MockPost {
  id: string;
  user: MockUser;
  time: string;
  text: string;
  quiz?: MockQuiz;
  score?: { correct: number; total: number; time: string };
  likes: number;
  comments: number;
  liked?: boolean;
  saved?: boolean;
}

export const POSTS: MockPost[] = [
  { id: "p1", user: USERS[1], time: "12分前", text: "日本史探究「江戸幕府の成立」のクイズを更新しました。参勤交代と武家諸法度の出題を増やしています。来週の定期考査範囲の人はぜひ。", quiz: QUIZZES[1], likes: 48, comments: 6 },
  { id: "p2", user: USERS[0], time: "1時間前", text: "共通テスト英語の語彙判定、3回目でやっと8割超えた…!! 間違えた単語だけ復習モードが本当に便利。", score: { correct: 64, total: 80, time: "18分42秒" }, quiz: QUIZZES[6], likes: 132, comments: 14, liked: true },
  { id: "p3", user: USERS[2], time: "3時間前", text: "mol計算のコツ: 単位を先に書いてから数字を埋めると事故らない。今日追加した10問は全部このパターンです。", likes: 89, comments: 11, saved: true },
  { id: "p4", user: USERS[3], time: "昨日", text: "「る・らる」の識別が苦手な人へ。直前の音で判定する方法をクイズの解説に書きました。テスト前に30問だけやってみてください。", quiz: QUIZZES[3], likes: 215, comments: 23 },
];

export interface MockNotice {
  id: string;
  type: "like" | "follow" | "comment" | "system" | "qredit" | "ai";
  text: string;
  time: string;
  unread?: boolean;
}

export const NOTICES: MockNotice[] = [
  { id: "n1", type: "like", text: "あおい さんがあなたの投稿にいいねしました", time: "5分前", unread: true },
  { id: "n2", type: "comment", text: "けんた.m さんがコメント:「解説がわかりやすすぎる」", time: "22分前", unread: true },
  { id: "n3", type: "qredit", text: "デイリーミッション達成で 50 Qredit を獲得しました", time: "1時間前", unread: true },
  { id: "n4", type: "follow", text: "りく さんにフォローされました", time: "3時間前" },
  { id: "n5", type: "ai", text: "AIが苦手分野「古典文法・助動詞」の復習セットを作成しました", time: "昨日" },
  { id: "n6", type: "system", text: "7/25(土) 2:00〜4:00 にメンテナンスを実施します", time: "2日前" },
];

export interface QuizQuestion {
  id: number;
  type: "single" | "multi" | "text" | "order" | "cloze" | "bool";
  category: string;
  prompt: string;
  note?: string;
  choices?: string[];
  answer: number[] | string | boolean | string[];
  explanation: string;
}

export const PLAYER_QUIZ = {
  id: "q7",
  title: "共通テスト英語 リーディング 語彙レベル判定",
  subject: "英語",
  timeLimitSec: 300,
  questions: [
    {
      id: 1, type: "single", category: "語彙",
      prompt: "次の英文の下線部 “substantial” に最も近い意味を選びなさい。\n\nThe committee made a substantial contribution to the project.",
      choices: ["わずかな", "相当な", "疑わしい", "一時的な"],
      answer: [1],
      explanation: "substantial は「相当な・かなりの」。substance（実質）から派生し、量や程度が大きいことを表します。",
    },
    {
      id: 2, type: "multi", category: "語彙",
      prompt: "「〜を延期する」という意味を持つ表現をすべて選びなさい。",
      choices: ["put off", "call off", "postpone", "bring up"],
      answer: [0, 2],
      explanation: "put off と postpone が「延期する」。call off は「中止する」、bring up は「話題に出す・育てる」です。",
    },
    {
      id: 3, type: "bool", category: "文法",
      prompt: "“The number of students are increasing.” は文法的に正しい。",
      answer: false,
      explanation: "The number of A は単数扱いのため is increasing が正しい形です。A number of A(複数)との違いに注意。",
    },
    {
      id: 4, type: "text", category: "語彙",
      prompt: "次の日本語に対応する英単語を小文字で入力しなさい。\n\n「環境」(名詞・e から始まる)",
      answer: "environment",
      explanation: "environment。形容詞 environmental、副詞 environmentally も頻出です。",
    },
    {
      id: 5, type: "order", category: "整序",
      prompt: "意味が通るように並べ替えなさい。\n\n「彼女は駅に着くとすぐに電話をくれた」",
      choices: ["as soon as", "she called me", "she arrived", "at the station"],
      answer: ["she called me", "as soon as", "she arrived", "at the station"],
      explanation: "She called me as soon as she arrived at the station. — as soon as 節は主節の後ろでも先頭でも可ですが、この並びが最も自然です。",
    },
    {
      id: 6, type: "cloze", category: "文法",
      prompt: "空欄に入る語を選びなさい。\n\nI wish I ___ more time to prepare for the exam.",
      choices: ["have", "had", "will have", "having"],
      answer: [1],
      explanation: "I wish + 仮定法過去。現在の事実に反する願望は過去形 had を使います。",
    },
  ] as QuizQuestion[],
};

export const QREDIT_HISTORY = [
  { id: "t1", type: "earn", label: "デイリーミッション達成", amount: 50, time: "今日 8:24", status: "完了" },
  { id: "t2", type: "earn", label: "クイズ「mol計算」完走ボーナス", amount: 30, time: "今日 7:58", status: "完了" },
  { id: "t3", type: "spend", label: "AI問題生成 (PDF 12ページ)", amount: -120, time: "昨日 21:03", status: "完了" },
  { id: "t4", type: "earn", label: "QDP 週間報酬", amount: 840, time: "7/20 10:00", status: "完了" },
  { id: "t5", type: "spend", label: "プロフィールフレーム「桜」", amount: -300, time: "7/19 18:44", status: "完了" },
  { id: "t6", type: "earn", label: "友達紹介ボーナス (ゆず)", amount: 200, time: "7/18 12:12", status: "保留中" },
  { id: "t7", type: "spend", label: "AI学習プラン更新", amount: -80, time: "7/16 9:30", status: "返金済み" },
];

export const WEEK_STUDY = {
  labels: ["月", "火", "水", "木", "金", "土", "日"],
  minutes: [42, 58, 31, 66, 45, 84, 12],
  questions: [120, 156, 88, 204, 132, 260, 40],
};

export const QDP_STATS = {
  months: ["2月", "3月", "4月", "5月", "6月", "7月"],
  views: [1240, 2810, 4520, 6104, 8930, 11202],
  completions: [420, 980, 1660, 2450, 3720, 4890],
};
