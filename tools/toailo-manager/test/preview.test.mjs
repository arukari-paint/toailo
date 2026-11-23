import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPreview, sanitizeHtml } from '../lib/preview.mjs';
import { readLocalGuides } from '../lib/site.mjs';
import { SITE_ROOT } from '../lib/config.mjs';
import { article, siteModules } from './helpers.mjs';

test('危険な要素を取り除く', () => {
  const out = sanitizeHtml('<p onclick="x()">a</p><script>alert(1)</script><iframe src="x"></iframe><a href="javascript:alert(1)">b</a><img src=x onerror=alert(1)>');
  assert.doesNotMatch(out, /<script|<iframe|onclick|onerror|javascript:/i);
  assert.match(out, /<p>a<\/p>/);
});

test('公開サイトに近いプレビューを作る（スクリプトなし・CSPあり）', async () => {
  const html = await renderPreview({
    siteRoot: SITE_ROOT,
    text: article({ relatedApp: 'household', category: 'household', faq: '\n  - q: 質問です\n    a: 回答です' }, '## 見出しA\n\n本文 [リンク](../prioritize-tasks-with-ai/)\n\n### 小見出し\n\n<script>alert(1)</script>\n\n## 見出しB\n\n```text\nコード\n```\n'),
    siteModules,
    siteGuides: readLocalGuides(SITE_ROOT),
  });
  assert.match(html, /Content-Security-Policy[^>]*script-src 'none'/);
  assert.doesNotMatch(html.replace(/script-src 'none'/, ''), /<script/i);
  assert.match(html, /<h1>テスト用の記事タイトル<\/h1>/);
  assert.match(html, /目次/);
  assert.match(html, /id="見出しa"|id="見出しA"/);
  assert.match(html, /href="https:\/\/arukari-paint\.github\.io\/toailo\/guides\/prioritize-tasks-with-ai\/"/);
  assert.match(html, /この記事に関連するアプリ/);
  assert.match(html, /家計簿 by TOAILO/);
  assert.match(html, /関連記事/);
  assert.match(html, /質問です/);
  assert.match(html, /astro-code/, 'Shiki のコードハイライト');
  assert.match(html, /--accent: #42c7c7/, 'サイトの global.css');
});
