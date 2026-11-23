/**
 * ChatGPT 用の指示文を作る。共通部分は prompt-template.md（変更は data/prompt-template.md に保存）。
 * 差し込む情報はすべてサイトの実ファイル（apps.ts・記事・CONTENT_GUIDE.md・src/pages）から読む。
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { MANAGER_ROOT, DATA_DIR, PUBLIC_BASE, today } from './config.mjs';

export const DEFAULT_TEMPLATE_PATH = join(MANAGER_ROOT, 'prompt-template.md');
export const CUSTOM_TEMPLATE_PATH = join(DATA_DIR, 'prompt-template.md');

export function loadTemplate() {
  if (existsSync(CUSTOM_TEMPLATE_PATH)) return { text: readFileSync(CUSTOM_TEMPLATE_PATH, 'utf8'), custom: true };
  return { text: readFileSync(DEFAULT_TEMPLATE_PATH, 'utf8'), custom: false };
}

function appsSection(APP_LIST) {
  return APP_LIST.map((a) => {
    const lines = [
      `## ${a.name}`,
      `- サイトのページ：${PUBLIC_BASE}${a.path.replace(/^\//, '')}（記事からの相対パス：../..${a.path}）`,
      `- 提供状況：${a.status === 'available' ? `App Store で配信中（${a.appStoreUrl}）` : '準備中（未公開。公開済みとして書かない）'}`,
      `- 対応：${a.platform}（${a.minimumOs}）／ App Store のカテゴリ：${a.appStoreGenre}`,
      `- 概要：${a.summary}`,
      `- 主な機能：`,
      ...a.features.map((f) => `  - ${f.title}：${f.body}`),
      `- AI出力機能（AIへ）：${a.aiExport.lead}`,
      `  - 選べる分析の目的：${a.aiExport.purposes.map((p) => `${p.title}（${p.body}）`).join('、')}`,
      ...a.aiExport.points.map((p) => `  - ${p}`),
      `- 料金：${a.pricing.price}`,
      `  - 無料版：${a.pricing.free.join('／')}`,
      `  - TOAILO Pro：${a.pricing.pro.join('／')}`,
      `  - ${a.pricing.note}`,
      `- 広告：${a.pricing.ads}`,
    ];
    return lines.join('\n');
  }).join('\n\n');
}

function articlesSection(guides, pending, categories) {
  const lines = guides.map(
    (g) => `- 「${g.data.title}」\n  - URL：${g.url}\n  - slug：${g.slug}／カテゴリ：${categories[g.data.category]?.label ?? g.data.category}\n  - 概要：${g.data.description}`,
  );
  const out = [`公開済み（${guides.length}本）：`, lines.join('\n') || '- なし'];
  if (pending.length) {
    out.push('', `作成済み・未公開（${pending.length}本。これらとも重複させない）：`);
    out.push(pending.map((p) => `- 「${p.title}」（slug：${p.slug}）`).join('\n'));
  }
  return out.join('\n');
}

function pagesSection(pages, categories) {
  const desc = {
    '/': 'トップページ',
    '/about/': 'TOAILOについて',
    '/faq/': 'よくある質問',
    '/privacy/': 'サイトのプライバシー',
    '/guides/': 'AI活用ガイド一覧',
    '/guides/[slug]/': 'AI活用ガイドの各記事（記事はここに追加される）',
    '/guides/category/[category]/': `カテゴリ別一覧（${Object.entries(categories).map(([k, v]) => `${k}=${v.label}`).join('、')}）`,
    '/apps/household/': '家計簿 by TOAILO のページ',
    '/apps/tasks/': 'ToDoリスト by TOAILO のページ',
  };
  return pages.map((p) => `- ${p}：${desc[p] ?? ''}`).join('\n');
}

function frontmatterExample(date) {
  return [
    '---',
    'title: 記事タイトル（60文字以内）',
    'description: 検索結果と一覧に表示する説明（40〜160文字）',
    'slug: example-article-slug',
    'category: household',
    `publishedAt: ${date}`,
    `updatedAt: ${date}`,
    'relatedApp: household',
    'draft: false',
    'faq:',
    '  - q: よくある質問1',
    '    a: 回答1',
    '  - q: よくある質問2',
    '    a: 回答2',
    '---',
    '',
    '導入文（見出しなし）……',
    '',
    '> この記事に登場する〇〇の例は、説明のために作成した**架空のサンプルデータ**です。',
    '',
    '## 最初の見出し',
    '',
    '本文……',
  ].join('\n');
}

export function buildPrompt({ count = 2, siteModules, guides, pending, pages, contentGuide, date = today() }) {
  const n = Math.min(4, Math.max(1, Number(count) || 2));
  const { text } = loadTemplate();
  const values = {
    COUNT: String(n),
    TODAY: date,
    PUBLIC_BASE,
    APPS: appsSection(siteModules.APP_LIST),
    PAGES: pagesSection(pages, siteModules.GUIDE_CATEGORIES),
    ARTICLES: articlesSection(guides, pending, siteModules.GUIDE_CATEGORIES),
    CONTENT_GUIDE: contentGuide.trim(),
    FRONTMATTER: frontmatterExample(date),
  };
  return text.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => (k in values ? values[k] : m));
}
