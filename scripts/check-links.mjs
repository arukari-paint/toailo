/**
 * ビルド結果（dist/）の内部リンク・画像・アンカーを検証する。外部リンクには rel="noopener" が付いているかも確認する。
 * 実行：npm run check:links（先に npm run build）
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const DIST = resolve('dist');
const BASE = (process.env.BASE_PATH ?? '/toailo').replace(/\/$/, '');
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.html')) files.push(p);
  }
})(DIST);

const idsCache = new Map();
const idsOf = (file) => {
  if (!idsCache.has(file)) {
    const html = readFileSync(file, 'utf8');
    idsCache.set(file, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  }
  return idsCache.get(file);
};

/** サイト内パス → dist 内のファイル */
function resolveTarget(pathname) {
  if (!pathname.startsWith(BASE + '/') && pathname !== BASE) return { error: `base path（${BASE}）の外を指している` };
  const rel = decodeURIComponent(pathname.slice(BASE.length)) || '/';
  const candidates = rel.endsWith('/') ? [join(DIST, rel, 'index.html')] : [join(DIST, rel), join(DIST, rel, 'index.html')];
  const hit = candidates.find((c) => existsSync(c) && statSync(c).isFile());
  return hit ? { file: hit } : { error: 'ファイルがない' };
}

const errors = [];
let checked = 0;
for (const file of files) {
  const html = readFileSync(file, 'utf8');
  const pageUrl = new URL('https://example.invalid' + BASE + '/' + relative(DIST, file).replace(/index\.html$/, ''));
  const refs = [...html.matchAll(/<(a|link|img|script|source)\b[^>]*?\s(href|src|srcset)="([^"]+)"[^>]*>/g)];
  for (const [tag, el, attr, raw] of refs) {
    const values = attr === 'srcset' ? raw.split(',').map((s) => s.trim().split(/\s+/)[0]) : [raw];
    for (const v of values) {
      if (/^(mailto:|tel:|data:|javascript:)/.test(v)) continue;
      if (/^https?:\/\//.test(v)) {
        if (el === 'a' && /target="_blank"/.test(tag) && !/rel="[^"]*noopener/.test(tag)) errors.push(`${relative(DIST, file)}: target=_blank に rel=noopener がない → ${v}`);
        continue;
      }
      checked++;
      const url = new URL(v, pageUrl);
      const target = url.pathname === pageUrl.pathname && v.startsWith('#') ? { file } : resolveTarget(url.pathname);
      if (target.error) { errors.push(`${relative(DIST, file)}: ${v}（${target.error}）`); continue; }
      if (url.hash && target.file.endsWith('.html')) {
        const id = decodeURIComponent(url.hash.slice(1));
        if (!idsOf(target.file).has(id)) errors.push(`${relative(DIST, file)}: ${v}（アンカー #${id} がない）`);
      }
    }
  }
}

if (errors.length) {
  console.error(`内部リンクの問題が ${errors.length} 件あります:\n` + errors.map((e) => '  - ' + e).join('\n'));
  process.exit(1);
}
console.log(`OK: ${files.length} ページ・${checked} 件の内部リンクを確認しました`);
