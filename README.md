# TOAILO 公式サイト

「記録する。持ち出す。AIで活かす。」— TOAILO シリーズ（家計簿 by TOAILO・ToDoリスト by TOAILO）の公式サイト。
Astro による静的サイトで、GitHub Pages で公開する（サーバー・DB なし、固定費0円）。

- 公開予定URL：https://arukari-paint.github.io/toailo/ （リポジトリ `arukari-paint/toailo` を想定）
- 既存のアプリ別サポートページ（`/kakeibo/`・`/todolist-site/`）は App Store に登録済みのため、そのまま残す。このサイトは別リポジトリで公開する

## コマンド

```bash
npm ci               # 依存関係のインストール
npm run dev          # 開発サーバー http://localhost:4321/toailo/
npm run verify       # 型チェック（astro check）→ ビルド → 内部リンク検証
npm run preview      # ビルド結果の確認
node scripts/make-brand-images.mjs   # ファビコン・OG画像の再生成（Mac で実行）
```

Node.js 22.23.4 以上（開発・CI は Node 24 LTS）。`npm run preview` はバックグラウンドで常駐するので、止めるときは `npx astro preview stop`。

## 記事の追加（TOAILO Manager）

月1回の記事追加は、ローカル管理ツール **TOAILO Manager** で行う。`tools/toailo-manager/TOAILO Manager.command` をダブルクリックで起動。手順は [tools/toailo-manager/README.md](tools/toailo-manager/README.md)。

## 構成

| 場所 | 内容 |
|---|---|
| `src/pages/` | ページ（ファイル＝URL）。`guides/[slug].astro` が記事、`guides/category/[category].astro` がカテゴリ別一覧 |
| `src/content/guides/` | 記事（Markdown）。追加ルールは [docs/CONTENT_GUIDE.md](docs/CONTENT_GUIDE.md) |
| `src/content.config.ts` | 記事のメタデータの型（title・description・slug・category・publishedAt・updatedAt・relatedApp・draft・faq） |
| `src/data/apps.ts` | アプリ情報（確認済みの事実のみ。確認元はファイル冒頭に記載） |
| `src/data/faq.ts` | サイト全体のよくある質問 |
| `src/config/site.ts` | サイト名・メッセージ・連絡先 |
| `src/lib/` | URL（base path 対応）・記事の取得と関連記事・構造化データ |
| `src/components/` | 画面部品（ヘッダー・パンくず・FAQ・アプリ／記事カードなど） |
| `src/assets/apps/` | アプリアイコン・スクリーンショット（各アプリのリポジトリからコピー。ビルド時に WebP に最適化） |
| `public/` | ファビコン・OG画像 |
| `scripts/check-links.mjs` | ビルド結果の内部リンク・アンカー・外部リンクの rel を検証 |
| `tools/toailo-manager/` | 記事管理ツール（ローカル専用。ビルドには含まれない） |
| `.github/workflows/deploy.yml` | PR：型チェック・ビルド・リンク検証 / main：さらに GitHub Pages へデプロイ |

## 公開URLの変更

`astro.config.mjs` は環境変数 `SITE_URL`・`BASE_PATH` を読む（既定 `https://arukari-paint.github.io` + `/toailo`）。
独自ドメインにする場合は、リポジトリの Settings → Secrets and variables → Actions → Variables に
`SITE_URL=https://example.com`・`BASE_PATH=/` を設定し、`public/CNAME` を追加する。

## Google Search Console

1. Search Console で「URL プレフィックス」に `https://arukari-paint.github.io/toailo/` を追加
2. 確認方法「HTMLタグ」で表示される `content` の値を、リポジトリの Variables に `GOOGLE_SITE_VERIFICATION` として登録 → 再デプロイ
3. 確認後、「サイトマップ」に `sitemap-index.xml` を送信

※ プロジェクトサイト（`/toailo/` 配下）では `robots.txt` がドメイン直下にならないため、クローラーには読まれない（ブロックもされない）。サイトマップは Search Console から送信する。
