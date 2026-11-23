// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { readdirSync, readFileSync } from 'node:fs';

/**
 * 公開URL。GitHub Pages のプロジェクトサイト（https://<user>.github.io/<repo>/）を前提にする。
 * 独自ドメインに移す場合は SITE_URL と BASE_PATH を変えるだけでよい（BASE_PATH は "/" にする）。
 */
const SITE_URL = process.env.SITE_URL ?? 'https://arukari-paint.github.io';
const BASE_PATH = process.env.BASE_PATH ?? '/toailo';

/** サイトマップの lastmod 用に、記事の updatedAt を読む（下書きは含めない） */
function guideLastmod() {
  const dir = new URL('./src/content/guides/', import.meta.url);
  /** @type {Map<string, string>} */
  const map = new Map();
  for (const file of readdirSync(dir)) {
    if (!/\.mdx?$/.test(file)) continue;
    const text = readFileSync(new URL(file, dir), 'utf8');
    const fm = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
    const pick = (/** @type {string} */ key) => fm.match(new RegExp(`^${key}:\\s*['"]?([^'"\\n]+)`, 'm'))?.[1]?.trim();
    if (pick('draft') === 'true') continue;
    const slug = pick('slug') ?? file.replace(/\.mdx?$/, '');
    const date = pick('updatedAt') ?? pick('publishedAt');
    if (date) map.set(slug, date);
  }
  return map;
}
const lastmods = guideLastmod();

export default defineConfig({
  site: SITE_URL,
  base: BASE_PATH,
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/404'),
      serialize(item) {
        const slug = item.url.match(/\/guides\/([^/]+)\/$/)?.[1];
        const date = slug ? lastmods.get(slug) : undefined;
        if (date) item.lastmod = new Date(date).toISOString();
        return item;
      },
    }),
  ],
  markdown: {
    shikiConfig: { theme: 'github-light' },
  },
});
