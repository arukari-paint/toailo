import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateArticle, splitArticles } from '../lib/validate.mjs';
import { article, ctx } from './helpers.mjs';

const errs = (text, c = ctx()) => validateArticle(text, c).errors;
const has = (list, re) => assert.ok(list.some((e) => re.test(e)), `期待したエラーがありません: ${re}\n実際: ${list.join('\n')}`);

test('正しい記事は通る', () => {
  const v = validateArticle(article(), ctx());
  assert.equal(v.ok, true, v.errors.join('\n'));
  assert.equal(v.data.publishedAt, '2026-11-23');
});

test('必須メタデータの欠落を日本語で拒否する', () => {
  const e = errs(article({ title: undefined, description: undefined, draft: undefined }));
  has(e, /タイトル（title）がありません/);
  has(e, /説明（description）がありません/);
  has(e, /下書きフラグ（draft）がありません/);
});

test('frontmatter がない・YAML が壊れている', () => {
  has(errs('# 見出し\n本文'), /frontmatter/);
  has(errs('---\ntitle: [壊れた\n---\n本文'), /YAML|frontmatter/);
});

test('slug・日付・カテゴリ・関連アプリの形式', () => {
  has(errs(article({ slug: 'Bad_Slug' })), /スラッグ（slug）：半角英小文字/);
  has(errs(article({ publishedAt: '2026/11/23' })), /公開日（publishedAt）：YYYY-MM-DD/);
  has(errs(article({ updatedAt: '2026-11-01' })), /updatedAt は publishedAt 以降/);
  has(errs(article({ category: 'money' })), /カテゴリ（category）は次のいずれか/);
  has(errs(article({ relatedApp: 'calendar' })), /関連アプリ（relatedApp）は次のいずれか/);
  has(errs(article({ description: '短い説明' })), /説明（description）が短すぎます/);
});

test('既存記事との slug・タイトルの重複を拒否する', () => {
  has(errs(article({ slug: 'prioritize-tasks-with-ai', title: '別のタイトルです' })), /既存記事と重複/);
  has(errs(article({ title: 'ChatGPT で家計簿を分析する方法' })), /タイトルがサイトの既存記事/);
  const c = ctx({ managed: [{ slug: 'test-article', title: '取り込み済み', status: 'draft' }] });
  has(errs(article(), c), /すでに取り込み済み/);
  assert.equal(validateArticle(article(), { ...c, replaceSlug: 'test-article' }).ok, true);
});

test('危険な HTML・スクリプト・イベント属性を拒否する', () => {
  has(errs(article({}, '## a\n\n<script>alert(1)</script>\n\n## b\n')), /危険なHTMLタグ.*script/);
  has(errs(article({}, '## a\n\n<iframe src="x"></iframe>\n\n## b\n')), /危険なHTMLタグ.*iframe/);
  has(errs(article({}, '## a\n\n<div>テキスト</div>\n\n## b\n')), /HTMLタグ（<div>）/);
  has(errs(article({}, '## a\n\n[x](javascript:alert(1))\n\n## b\n')), /使えないリンク先/);
  // コードブロックの中は例として許可
  assert.equal(errs(article({}, `## a\n\n${'文'.repeat(1600)}\n\n\`\`\`text\n<script>例</script>\n\`\`\`\n\n## b\n`)).length, 0);
});

test('Markdown の構造（h1・見出し不足・階層飛び）', () => {
  has(errs(article({}, '# タイトル\n\n## a\n\n## b\n')), /h1/);
  has(errs(article({}, '## a だけ\n\n本文\n')), /## 見出しが2つ未満/);
  has(errs(article({}, '## a\n\n#### いきなり h4\n\n## b\n')), /階層が飛んで/);
});

test('内部リンクの検証', () => {
  has(errs(article({}, '## a\n\n[x](../no-such-article/)\n\n## b\n')), /リンク先の記事が存在しません/);
  has(errs(article({}, '## a\n\n[x](/guides/prioritize-tasks-with-ai/)\n\n## b\n')), /base path/);
  has(errs(article({}, '## a\n\n[x](../../apps/unknown/)\n\n## b\n')), /リンク先のページが存在しません/);
  has(errs(article({}, '## a\n\n![図](./a.png)\n\n## b\n')), /画像/);
  const ok = validateArticle(article({}, `## a\n\n[x](https://arukari-paint.github.io/toailo/faq/) [y](../../guides/category/tasks/) [z](https://example.com/)\n\n## b\n${'文'.repeat(1600)}`), ctx());
  assert.equal(ok.ok, true, ok.errors.join('\n'));
  assert.ok(ok.warnings.some((w) => /外部リンク/.test(w)));
  // 同時に公開する記事へのリンクは許可
  assert.equal(validateArticle(article({}, `## a\n\n[x](../other-new/)\n\n## b\n${'文'.repeat(1600)}`), ctx({ companions: ['other-new'] })).ok, true);
});

test('複数記事の分割（```markdown の囲み／そのまま連結）', () => {
  const a = article({ slug: 'first-one' });
  const b = article({ slug: 'second-one', title: '二本目' });
  assert.equal(splitArticles(`説明\n\n\`\`\`markdown\n${a}\`\`\`\n\n説明\n\n\`\`\`markdown\n${b}\`\`\`\n`).length, 2);
  const parts = splitArticles(`${a}\n${b}`);
  assert.equal(parts.length, 2);
  assert.match(parts[1], /slug: second-one/);
  assert.equal(splitArticles('').length, 0);
});
