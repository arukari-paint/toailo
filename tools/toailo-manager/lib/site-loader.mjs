/**
 * 既存サイトの TypeScript モジュール（src/data/apps.ts・src/content.config.ts など）を
 * Node.js から直接読み込むためのフック。サイト側のファイルは一切変更しない。
 *
 * - `@/xxx`        → src/xxx（tsconfig の paths と同じ）
 * - `astro:content` → defineCollection などの最小スタブ（Astro の外では実体がないため）
 * - `astro/loaders` → glob のスタブ（スキーマだけ使う）
 * - `*.png` などの画像 → { src, width, height, format } のスタブ
 * TypeScript は Node.js 24 の型の除去（type stripping）で実行する。
 */
import { registerHooks } from 'node:module';
import { existsSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

let registered = false;

export function registerSiteLoader(siteRoot) {
  if (registered) return;
  registered = true;
  const src = join(siteRoot, 'src');
  const stub = (code) => `data:text/javascript,${encodeURIComponent(code)}`;
  const ASTRO_CONTENT = stub(
    'export const defineCollection = (c) => c; export const getCollection = async () => []; export const render = async () => ({});',
  );
  const ASTRO_LOADERS = stub('export const glob = (o) => o; export const file = (o) => o;');

  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === 'astro:content') return { url: ASTRO_CONTENT, shortCircuit: true };
      if (specifier === 'astro/loaders') return { url: ASTRO_LOADERS, shortCircuit: true };
      if (specifier.startsWith('@/')) {
        const base = join(src, specifier.slice(2));
        const candidates = [base, `${base}.ts`, `${base}.mjs`, `${base}.js`, join(base, "index.ts")];
        for (const candidate of candidates) {
          if (existsSync(candidate) && statSync(candidate).isFile()) return { url: pathToFileURL(candidate).href, shortCircuit: true };
        }
      }
      return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
      if (/\.(png|jpe?g|webp|gif|avif|svg)$/i.test(url)) {
        const format = url.split('.').pop().toLowerCase();
        return {
          format: 'module',
          source: `export default ${JSON.stringify({ src: url, width: 0, height: 0, format })};`,
          shortCircuit: true,
        };
      }
      return nextLoad(url, context);
    },
  });
}

/** サイトのモジュールを読み込む（apps.ts・content.config.ts・site.ts・lib/guides.ts） */
export async function loadSiteModules(siteRoot) {
  registerSiteLoader(siteRoot);
  const u = (p) => pathToFileURL(join(siteRoot, p)).href;
  const [apps, contentConfig, site, guides] = await Promise.all([
    import(u('src/data/apps.ts')),
    import(u('src/content.config.ts')),
    import(u('src/config/site.ts')),
    import(u('src/lib/guides.ts')),
  ]);
  return {
    APPS: apps.APPS,
    APP_LIST: apps.APP_LIST,
    GUIDE_CATEGORIES: contentConfig.GUIDE_CATEGORIES,
    guideSchema: contentConfig.collections.guides.schema,
    SITE: site.SITE,
    relatedGuides: guides.relatedGuides,
  };
}
