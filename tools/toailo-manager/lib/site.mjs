/**
 * サイト側の記事・ページ構成の読み取り。
 * 公開済み記事は GitHub（origin/main）の内容を正とする。取得できない場合は手元のファイルを使う。
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseFrontmatter } from '@astrojs/internal-helpers/frontmatter';
import { GUIDES_DIR_REL, REMOTE, DEFAULT_BRANCH, articleUrl } from './config.mjs';
import { run } from './exec.mjs';

const toDate = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? null : String(v));

export function parseArticle(text) {
  const { frontmatter, content } = parseFrontmatter(text);
  return { data: frontmatter, body: content };
}

function summarize(file, text, source) {
  const { data } = parseArticle(text);
  const slug = file.replace(/\.mdx?$/, '');
  return {
    id: slug,
    slug: data.slug ?? slug,
    file,
    source,
    data: { ...data, publishedAt: toDate(data.publishedAt), updatedAt: toDate(data.updatedAt) },
    url: articleUrl(data.slug ?? slug),
  };
}

/** origin/main 上の記事一覧（下書き含む）。ref が無ければ null */
export async function readRemoteGuides(siteRoot, ref = `${REMOTE}/${DEFAULT_BRANCH}`) {
  const ls = await run('git', ['ls-tree', '--name-only', `${ref}:${GUIDES_DIR_REL}`], { cwd: siteRoot });
  if (!ls.ok) return null;
  const out = [];
  for (const file of ls.stdout.split('\n').filter((f) => /\.mdx?$/.test(f))) {
    const show = await run('git', ['show', `${ref}:${GUIDES_DIR_REL}/${file}`], { cwd: siteRoot });
    if (show.ok) out.push(summarize(file, show.stdout, 'remote'));
  }
  return out;
}

export function readLocalGuides(siteRoot) {
  const dir = join(siteRoot, GUIDES_DIR_REL);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /\.mdx?$/.test(f))
    .map((f) => summarize(f, readFileSync(join(dir, f), 'utf8'), 'local'));
}

/** 公開中の記事（draft: false）を新着順で。source は 'remote'（GitHub）か 'local' */
export async function readPublishedGuides(siteRoot) {
  const remote = await readRemoteGuides(siteRoot);
  const all = remote ?? readLocalGuides(siteRoot);
  return {
    source: remote ? 'remote' : 'local',
    guides: all
      .filter((g) => g.data.draft !== true)
      .sort((a, b) => String(b.data.publishedAt).localeCompare(String(a.data.publishedAt))),
    allSlugs: new Set([...all.map((g) => g.slug), ...readLocalGuides(siteRoot).map((g) => g.slug)]),
    allTitles: [...all, ...readLocalGuides(siteRoot)].map((g) => ({ slug: g.slug, title: String(g.data.title ?? '') })),
  };
}

/** src/pages から公開サイトのページ構成（サイト内パス）を作る */
export function readSitePages(siteRoot) {
  const pagesDir = join(siteRoot, 'src', 'pages');
  const out = [];
  (function walk(dir) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(astro|md)$/.test(name)) {
        let route = '/' + relative(pagesDir, p).replace(/\.(astro|md)$/, '').replace(/(^|\/)index$/, '');
        if (route.endsWith('/404')) continue;
        route = route.replace(/\/$/, '') + '/';
        out.push(route.replace(/^\/\//, '/'));
      }
    }
  })(pagesDir);
  return out.sort();
}
