import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildPrompt } from '../lib/prompt.mjs';
import { readLocalGuides, readSitePages } from '../lib/site.mjs';
import { SITE_ROOT } from '../lib/config.mjs';
import { siteModules } from './helpers.mjs';

test('指示文にサイトの情報とルールがすべて入る', () => {
  const guides = readLocalGuides(SITE_ROOT).filter((g) => g.data.draft !== true);
  const prompt = buildPrompt({
    count: 3,
    siteModules,
    guides,
    pending: [{ slug: 'pending-one', title: '作成済みの記事' }],
    pages: readSitePages(SITE_ROOT),
    contentGuide: readFileSync(join(SITE_ROOT, 'docs/CONTENT_GUIDE.md'), 'utf8'),
    date: '2026-12-01',
  });
  assert.doesNotMatch(prompt, /\{\{[A-Z_]+\}\}/, '置き換え漏れ');
  for (const s of [
    '記録する。持ち出す。AIで活かす。', '家計簿 by TOAILO', 'ToDoリスト by TOAILO', 'iOS 16.4', 'https://apps.apple.com/jp/app/id6816685815',
    'ChatGPTで家計簿を分析する方法', 'https://arukari-paint.github.io/toailo/guides/prioritize-tasks-with-ai/', '作成済みの記事',
    '**3本**', '未実装の機能を紹介しない', '架空のレビュー', '架空のサンプルデータ', '公開日を捏造しない', '出典', 'アプリの中でAIを呼び出したり',
    'publishedAt: 2026-12-01', 'relatedApp:', '（AI活用ガイド）の追加ルール', '/guides/category/[category]/',
  ]) assert.ok(prompt.includes(s), `指示文に「${s}」がありません`);
});

test('本数は1〜4本に収める', () => {
  const base = { siteModules, guides: [], pending: [], pages: ['/'], contentGuide: 'x' };
  assert.ok(buildPrompt({ ...base, count: 9 }).includes('**4本**'));
  assert.ok(buildPrompt({ ...base, count: 0 }).includes('**2本**'));
});
