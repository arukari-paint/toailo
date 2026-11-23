import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { SITE_ROOT } from '../lib/config.mjs';
import { loadSiteModules } from '../lib/site-loader.mjs';
import { readSitePages } from '../lib/site.mjs';

export const siteModules = await loadSiteModules(SITE_ROOT);

export function tempDir(prefix = 'toailo-mgr-') {
  return mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), prefix));
}

export function article(over = {}, body) {
  const d = {
    title: 'テスト用の記事タイトル',
    description: 'これはテスト用の記事の説明文です。四十文字以上になるように、少し長めに書いておきます。',
    slug: 'test-article',
    category: 'general',
    publishedAt: '2026-11-23',
    updatedAt: '2026-11-23',
    relatedApp: 'null',
    draft: 'false',
    ...over,
  };
  const fm = Object.entries(d).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}: ${v}`).join('\n');
  const b = body ?? `導入文です。\n\n> この記事の例は**架空のサンプルデータ**です。\n\n## 一つ目の見出し\n\n本文です。[既存記事](../prioritize-tasks-with-ai/)と[アプリ](../../apps/household/)へのリンク。\n\n### 小見出し\n\n本文です。\n\n## 二つ目の見出し\n\n${'説明の文章です。'.repeat(200)}\n`;
  return `---\n${fm}\n---\n\n${b}`;
}

export function ctx(over = {}) {
  return {
    guideSchema: siteModules.guideSchema,
    categories: siteModules.GUIDE_CATEGORIES,
    siteSlugs: new Set(['analyze-household-budget-with-chatgpt', 'prioritize-tasks-with-ai', 'review-spending-by-reason-and-satisfaction']),
    siteTitles: [
      { slug: 'analyze-household-budget-with-chatgpt', title: 'ChatGPTで家計簿を分析する方法' },
      { slug: 'prioritize-tasks-with-ai', title: 'AIでタスクの優先順位を整理する方法' },
    ],
    managed: [],
    pages: readSitePages(SITE_ROOT),
    companions: [],
    basePath: '/toailo',
    siteUrl: 'https://arukari-paint.github.io',
    ...over,
  };
}

/** 公開フローのテスト用：ローカルの bare リポジトリを origin にした小さなサイト */
export function makeRepo() {
  const root = tempDir('toailo-repo-');
  const remote = join(root, 'remote.git');
  const work = join(root, 'work');
  const git = (args, cwd = work) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote]);
  mkdirSync(join(work, 'src/content/guides'), { recursive: true });
  git(['init', '-q', '-b', 'main'], root.replace(/$/, '/work'));
  git(['config', 'user.email', 'test@example.invalid']);
  git(['config', 'user.name', 'Test']);
  git(['config', 'commit.gpgsign', 'false']);
  writeFileSync(join(work, 'src/content/guides/existing.md'), '---\ntitle: 既存\nslug: existing\ndraft: false\n---\n本文\n');
  writeFileSync(join(work, 'README.md'), 'test\n');
  git(['add', '.']);
  git(['commit', '-q', '-m', 'init']);
  git(['remote', 'add', 'origin', remote]);
  git(['push', '-q', '-u', 'origin', 'main']);
  return { root, remote, work, git, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
