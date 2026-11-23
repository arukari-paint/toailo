# 記事（AI活用ガイド）の追加ルール

人・AI どちらが書く場合も、このルールに沿って **1記事＝1ファイル** を Pull Request で追加する。
通常は TOAILO Manager（tools/toailo-manager）で取り込み・検証・承認・PR 作成を行う。自動生成・自動承認の仕組みはない。PR は必ず人が確認してからマージする。

## 置き場所とファイル名

- `src/content/guides/<slug>.md`（MDX が必要な場合のみ `.mdx`）
- `<slug>` は半角英小文字・数字・ハイフン（例：`compare-monthly-spending-with-ai`）。frontmatter の `slug` と同じにする
- 画像を使う場合は `src/assets/guides/<slug>/` に置き、Markdown から相対パスで参照する

## frontmatter（すべて必須。`faq` のみ任意）

```yaml
---
title: 記事タイトル（60文字以内）
description: 検索結果・一覧に出る説明（40〜160文字）
slug: compare-monthly-spending-with-ai
category: household   # household（家計簿）/ tasks（タスク管理）/ general（AI活用全般）
publishedAt: 2026-12-01
updatedAt: 2026-12-01 # 内容を直したら更新する（publishedAt 以降）
relatedApp: household # household / tasks / null
draft: false          # true の間はページもURLも作られない
faq:                  # 任意
  - q: 質問
    a: 回答
---
```

型と値は `src/content.config.ts` で検証され、違反するとビルドが失敗する（CI で検出される）。

## 自動で反映されるもの

記事ファイルを追加するだけで、次に反映される。ページ側の編集は不要。

- `/guides/` の一覧（新着順）・カテゴリ別一覧 `/guides/category/<category>/`
- トップページの新着記事（最新3件）・関連アプリのページの記事欄
- 他の記事の「関連記事」（同じカテゴリ → 同じ関連アプリの順）
- サイトマップ（`lastmod` は `updatedAt`）
- 構造化データ（Article・BreadcrumbList、`faq` があれば FAQPage）

## 本文のルール

- 見出しは `##`（h2）から始める（h1 はタイトルから自動で出る）。目次は h2・h3 から自動生成
- 読者の疑問を解決する内容にし、アプリの紹介は記事の後半で自然な文脈にとどめる
- 分析例・金額・タスク例は**架空のサンプルデータ**を使い、冒頭の引用ブロックでサンプルであることを明記する
- アプリの機能は、`src/data/apps.ts` に書かれている確認済みの事実だけを書く。書かれていない機能は書かない
- TOAILO のAI連携は「アプリ内でAIを動かす」のではなく「データを外部AIへ持ち出す」方式。アプリがAIへ送信すると誤解される表現にしない
- 他の記事へのリンクは相対パス（例：`../prioritize-tasks-with-ai/`）で書く（base path が変わっても壊れない）
- 金融・投資の助言、医療・心理の診断にあたる内容は書かない

## 確認

```bash
npm run verify   # 型チェック → ビルド → 内部リンク検証
npm run dev      # http://localhost:4321/toailo/ で表示確認
```
