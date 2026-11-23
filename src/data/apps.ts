/**
 * アプリ情報。ここに書くのは「確認できた事実」だけにする。
 *
 * 確認元（2026-11-23 時点）
 * - App Store：iTunes Search API（bundleId・trackId・価格「無料」・最低OS・配信開始日・ジャンル）
 * - 機能・Free/Pro・広告：各アプリのリポジトリ（README・機能定義・App Store 掲載文・サポートページ）
 *
 * 価格（TOAILO Pro の金額）は App Store の表示価格を使う方針のため、ここには書かない。
 * 新しいアプリは、公開前は status: 'coming' とし、appStoreUrl を入れない（架空のリンクを作らない）。
 */
import householdIcon from '@/assets/apps/household-icon.png';
import tasksIcon from '@/assets/apps/tasks-icon.png';
import householdAi from '@/assets/apps/household-1-ai.png';
import householdPreview from '@/assets/apps/household-2-ai-preview.png';
import householdHome from '@/assets/apps/household-3-home.png';
import householdReport from '@/assets/apps/household-5-report.png';
import tasksAi from '@/assets/apps/tasks-1-ai.png';
import tasksPreview from '@/assets/apps/tasks-2-ai-preview.png';
import tasksToday from '@/assets/apps/tasks-3-today.png';
import tasksReview from '@/assets/apps/tasks-6-review.png';
import type { ImageMetadata } from 'astro';

export type AppId = 'household' | 'tasks';

export type FaqItem = { q: string; a: string };

export type AppInfo = {
  id: AppId;
  /** App Store 上の正式名 */
  name: string;
  /** 一言での説明 */
  shortName: string;
  tagline: string;
  summary: string;
  path: string;
  status: 'available' | 'coming';
  appStoreUrl?: string;
  appStoreId?: string;
  bundleId: string;
  /** schema.org の applicationCategory */
  schemaCategory: string;
  appStoreGenre: string;
  platform: string;
  minimumOs: string;
  releaseDate: string;
  icon: ImageMetadata;
  screenshots: { src: ImageMetadata; alt: string }[];
  features: { title: string; body: string }[];
  aiExport: {
    lead: string;
    purposes: { title: string; body: string }[];
    points: string[];
  };
  flow: { title: string; body: string }[];
  pricing: {
    price: string;
    free: string[];
    pro: string[];
    ads: string;
    note: string;
  };
  faq: FaqItem[];
};

const PRO_NOTE =
  'TOAILO Pro は任意の自動更新サブスクリプション（月額・年額）です。価格は App Store のアプリ内課金の表示をご確認ください。解約しても記録したデータは消えません。';

export const APPS: Record<AppId, AppInfo> = {
  household: {
    id: 'household',
    name: '家計簿 by TOAILO',
    shortName: '家計簿',
    tagline: '家計簿を、AIに相談できる形に。',
    summary:
      '支出・収入に「購入理由」と「満足度」を添えて記録し、その家計データをChatGPT・Claude・Geminiなど好きなAIへ持ち出して分析できる家計簿アプリです。',
    path: '/apps/household/',
    status: 'available',
    appStoreUrl: 'https://apps.apple.com/jp/app/id6816685815',
    appStoreId: '6816685815',
    bundleId: 'com.toailo.kakeibo',
    schemaCategory: 'FinanceApplication',
    appStoreGenre: 'ファイナンス',
    platform: 'iPhone',
    minimumOs: 'iOS 16.4 以降',
    releaseDate: '2026-11-12',
    icon: householdIcon,
    screenshots: [
      { src: householdAi, alt: '「AIへ」画面。期間と6つの分析目的から選び、AI用データを作成する' },
      { src: householdPreview, alt: 'AIに渡す内容のプレビュー画面。含める項目を選び、データをコピーする' },
      { src: householdHome, alt: 'ホーム画面のスクリーンショット' },
      { src: householdReport, alt: '月間集計画面のスクリーンショット' },
    ],
    features: [
      { title: 'すばやく記録', body: '日付・金額・カテゴリ・店名や内容・メモで支出と収入を記録。購入理由はチップ、満足度は1〜5をワンタップで選べます。' },
      { title: '購入理由と満足度', body: '「必要だった」「欲しかった」「楽しみ・ご褒美」「衝動買い」「付き合い」「便利になる」「なんとなく」から購入理由を選び、満足度とあわせて残せます。' },
      { title: '履歴と月間集計', body: '履歴の検索・絞り込みと、カテゴリ別・購入理由別・満足度の月間集計で、お金の使い方を振り返れます。' },
      { title: 'カテゴリ管理', body: 'カテゴリの追加・編集・削除・並べ替えができます。カテゴリを削除しても記録は消えず「未分類」になります。' },
      { title: '書き出し・読み込み', body: 'CSV・JSONで書き出せます。他の家計簿アプリからの乗り換え用に、CSV・JSONの読み込みにも対応しています（形式の違うデータはAIで変換する手順つき）。' },
      { title: 'iCloud バックアップ（任意）', body: 'オンにすると、ご自身の iCloud Drive にバックアップを保存します。初期状態はオフです。' },
    ],
    aiExport: {
      lead: '「AIへ」の画面で期間と分析の目的を選ぶと、AIに渡しやすい形のテキストを作ります。アプリからAIへデータを送ることはなく、コピーしたテキストをご自身で好きなAIに貼り付けて使います。',
      purposes: [
        { title: '総合分析', body: 'カテゴリ・購入理由・満足度からお金の使い方の特徴を分析' },
        { title: '節約', body: '満足度をなるべく下げずに減らせそうな支出を探す' },
        { title: '満足度', body: '満足しやすいもの・後悔しやすいものの傾向' },
        { title: '衝動買い', body: '衝動買いしやすいカテゴリ・金額帯・頻度' },
        { title: '支出傾向', body: '多いカテゴリ・回数・目立つパターンを整理' },
        { title: '自由に質問', body: '聞きたいことを自分で入力' },
      ],
      points: [
        '合計や平均などの集計はアプリが計算してから渡すので、AIに計算を任せません。',
        '含める項目（収入・支出・カテゴリ・店名・購入理由・満足度・メモ）を選べます。メモは初期状態ではオフです。',
        '「集計のみ」と「集計＋明細」を切り替えられ、渡す前にプレビューで内容を確認できます。',
        '追加の質問を書き添えることもできます。',
      ],
    },
    flow: [
      { title: '記録する', body: '支出・収入を、購入理由や満足度とあわせて記録します。' },
      { title: 'AI用データを作る', body: '「AIへ」で期間・分析目的・含める項目を選び、「AI用データを作成」を押します。' },
      { title: 'コピーしてAIへ', body: 'プレビューを確認して「データをコピー」。ChatGPT・Claude・Geminiなど、使いたいAIに貼り付けます。' },
    ],
    pricing: {
      price: '無料（アプリ内課金あり）',
      free: [
        '記録・履歴・月間集計・カテゴリ管理・読み込み・書き出し',
        'AIへ：すべての分析目的・追加質問・集計のみ／集計＋明細',
        'AIへ：期間は今月・前月',
      ],
      pro: ['AIへ：過去3か月・6か月・1年・全期間・カスタム期間', '広告の非表示'],
      ads: '無料版では、ホーム・履歴・月間集計の下部と、AI用データを作るとき（2回に1回まで）に広告（Google AdMob）を表示します。記録した家計簿の内容が広告のために送信されることはありません。',
      note: PRO_NOTE,
    },
    faq: [
      { q: '記録したデータはどこに保存されますか？', a: 'お使いの iPhone の中に保存されます。開発者のサーバーなどに送信されることはありません。「iCloud バックアップ」をオンにした場合は、ご自身の iCloud Drive にもバックアップが保存されます。' },
      { q: 'アプリがAIにデータを送ることはありますか？', a: 'ありません。「AIへ」の画面で作ったテキストを、ご自身でコピーして使いたいAIに貼り付ける仕組みです。AIに渡す前に、内容（特にメモ）を確認してください。' },
      { q: 'どのAIで使えますか？', a: 'テキストを貼り付けられるAIであれば使えます。ChatGPT・Claude・Gemini などを想定しています。AIに渡したデータの取り扱いは、利用するAIサービスの規約に従います。' },
      { q: '会員登録は必要ですか？', a: '必要ありません。ダウンロードしてすぐに使えます。' },
      { q: 'Android版はありますか？', a: '現在は iPhone 版（App Store）のみ提供しています。' },
      { q: '投資やお金の使い方についてアドバイスしてくれますか？', a: 'いいえ。家計簿 by TOAILO は、投資・融資などの金融商品をすすめたり、お金の使い方の良し悪しを判断したりするアプリではありません。AIの分析結果は参考としてご利用ください。' },
    ],
  },
  tasks: {
    id: 'tasks',
    name: 'ToDoリスト by TOAILO',
    shortName: 'ToDoリスト',
    tagline: 'やることを、AIに相談できる形に。',
    summary:
      'やることを記録・整理・完了し、自動で残る履歴をChatGPT・Claude・Geminiなど好きなAIへ持ち出して振り返れるToDoリストアプリです。',
    path: '/apps/tasks/',
    status: 'available',
    appStoreUrl: 'https://apps.apple.com/jp/app/id6818832782',
    appStoreId: '6818832782',
    bundleId: 'com.toailo.todolist',
    schemaCategory: 'BusinessApplication',
    appStoreGenre: '仕事効率化',
    platform: 'iPhone',
    minimumOs: 'iOS 16.4 以降',
    releaseDate: '2026-11-16',
    icon: tasksIcon,
    screenshots: [
      { src: tasksAi, alt: '「AIへ」画面。期間と分析目的を選び、AI用データを作成する' },
      { src: tasksPreview, alt: 'AIに渡す内容のプレビュー画面' },
      { src: tasksToday, alt: '「今日」画面のスクリーンショット' },
      { src: tasksReview, alt: '振り返り画面のスクリーンショット' },
    ],
    features: [
      { title: 'かんたんに記録', body: 'タスク名を入力するだけで追加できます。期限・時刻・カテゴリ・優先度（高・中・低）・メモ・チェックリストは必要なときだけ。登録したときの気持ちもタップで残せます。' },
      { title: '履歴が自動で残る', body: '作成、期限の設定と変更、完了、取りやめ、「今日やる」への追加を日時つきで自動記録します。' },
      { title: '「今日」の画面', body: '今日やるもの・期限を過ぎているもの・前日からの持ち越しを分けて表示します。' },
      { title: '振り返り', body: '期間ごとの作成・完了の件数、期限に対する完了、期限の後ろ倒し、持ち越しからの選び直しを確認できます。' },
      { title: '通知（任意）', body: '期限の通知を設定できます。初期設定はオフで、通知の本文には初期設定ではタスク名を表示しません。' },
      { title: '書き出し・読み込み', body: 'CSV・JSONで書き出せます。他のToDoアプリからの読み込みにも対応しています（形式の違うデータはAIで変換する手順つき）。' },
    ],
    aiExport: {
      lead: '「AIへ」の画面で期間と分析の目的を選ぶと、AIに渡しやすい形のテキストを作ります。アプリからAIへデータを送ることはなく、コピーしたテキストをご自身で好きなAIに貼り付けて使います。',
      purposes: [
        { title: '総合分析', body: 'タスクの進み方を全体から見て、気づきと工夫を教えてもらう' },
        { title: '期限・持ち越しの傾向', body: '期限の変更や持ち越しのパターンから、期限の付け方を考える' },
        { title: '気持ちと進め方', body: '登録時の気持ちと、完了までの進み方の関係を見る' },
        { title: 'タスクの分け方', body: 'チェックリストの有無や進み方から、タスクの大きさを考える' },
        { title: '優先順位の見直し', body: '優先度の付け方と、実際の進み方を見比べる' },
      ],
      points: [
        '期間は「作成日」で選びます。選んだ期間に作成したタスクが対象です。',
        'タスク名・メモ・カテゴリ名は初期状態では含めません。含めるかどうかはご自身で選べます。',
        'チェックリストは項目の本文を含めず、件数だけを渡します。',
        '期限の変更回数や「今日やる」に選んだ回数など、自動で残った履歴をもとにした項目を渡せます。',
      ],
    },
    flow: [
      { title: '記録する', body: 'やることを追加し、進めたら完了にします。履歴は自動で残ります。' },
      { title: 'AI用データを作る', body: '「AIへ」で期間・分析目的・含める項目を選び、「AI用データを作成」を押します。' },
      { title: 'コピーしてAIへ', body: '内容を確認してコピーし、ChatGPT・Claude・Geminiなど、使いたいAIに貼り付けます。' },
    ],
    pricing: {
      price: '無料（アプリ内課金あり）',
      free: ['記録・振り返り・読み込み・書き出し', 'AIへ：すべての分析目的', 'AIへ：期間は今月・前月'],
      pro: ['AIへ：過去3か月・6か月・1年・全期間・カスタム期間', '広告の非表示'],
      ads: '無料版では、一覧・振り返りの下部と、AI用データを作るとき（2回に1回まで）に広告（Google AdMob）を表示します。記録したタスクの内容が広告のために送信されることはありません。',
      note: PRO_NOTE,
    },
    faq: [
      { q: '記録したデータはどこに保存されますか？', a: 'お使いの端末の中に保存されます。開発者のサーバーなどに送信されることはありません。' },
      { q: 'アプリがAIにデータを送ることはありますか？', a: 'ありません。「AIへ」の画面で作ったテキストを、ご自身でコピーして使いたいAIに貼り付ける仕組みです。タスク名・メモ・カテゴリ名は初期状態では含まれません。' },
      { q: 'アプリを削除した場合、データは戻せますか？', a: '「設定」から書き出したファイルがあれば、アプリを入れ直したあとに読み込めます（履歴も含まれます）。書き出したファイルがない場合、開発者が復元することはできません。' },
      { q: '会員登録は必要ですか？', a: '必要ありません。ダウンロードしてすぐに使えます。' },
      { q: 'Android版はありますか？', a: '現在は iPhone 版（App Store）のみ提供しています。' },
      { q: '気持ちの記録は何に使いますか？', a: '登録したときの気持ち（5段階）を、振り返りやAIでの分析の材料にします。自己申告の目安で、心理状態の診断ではありません。' },
    ],
  },
};

export const APP_LIST: AppInfo[] = [APPS.household, APPS.tasks];
