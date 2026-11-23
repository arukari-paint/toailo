/**
 * 記事プレビュー。公開サイトと同じ Markdown 処理系（Astro 7 の satteri・Shiki github-light）で本文を変換し、
 * サイトの global.css と各コンポーネントのスタイル（.astro ファイルの <style>）をそのまま読み込んで表示する。
 *
 * 安全対策：
 * - 変換結果から script・iframe など危険な要素、on* 属性、javascript: URL を取り除く
 * - 表示は sandbox 属性つき iframe（スクリプト不可）＋ CSP（script-src 'none'）
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { createSatteriMarkdownProcessor } from '@astrojs/markdown-satteri';
import { parseArticle } from './site.mjs';
import { PUBLIC_BASE, articleUrl } from './config.mjs';

let processorPromise;
const getProcessor = () =>
  (processorPromise ??= createSatteriMarkdownProcessor({ syntaxHighlight: 'shiki', shikiConfig: { theme: 'github-light' } }));

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtDate = (iso) => {
  const [y, m, d] = String(iso).split('-').map(Number);
  return y && m && d ? `${y}年${m}月${d}日` : esc(iso);
};

/** 変換後の HTML から危険な要素を除く（取り込み時の検証でも拒否しているが、表示側でも二重に防ぐ） */
export function sanitizeHtml(html) {
  return String(html)
    .replace(/<(script|style|iframe|object|embed|form|template|noscript|svg|math|link|meta|base)\b[\s\S]*?(<\/\1\s*>|$)/gi, '')
    .replace(/<(script|iframe|object|embed|link|meta|base|input|button)\b[^>]*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(href|src|action|formaction|xlink:href)\s*=\s*("|')\s*(javascript|vbscript|data):[^"']*\2/gi, ' $1="#"');
}

/** サイト内の相対リンクを公開URLに直す（プレビューでリンク先を確認しやすくする） */
function absolutizeLinks(html, slug) {
  return html.replace(/<a href="([^"]+)"/g, (_m, href) => {
    if (/^(https?:|mailto:|tel:|#)/.test(href)) return `<a href="${href}" title="${esc(href)}"`;
    try {
      const u = new URL(href, articleUrl(slug));
      return `<a href="${u.href}" title="${esc(u.href)}"`;
    } catch {
      return `<a href="#" title="${esc(href)}"`;
    }
  });
}

/** .astro ファイルの <style> を取り出し、ラッパーのクラスの中だけに効くようにする（CSS のネスト） */
function componentCss(siteRoot) {
  const pick = (rel, wrapper) => {
    const src = readFileSync(join(siteRoot, rel), 'utf8');
    const css = [...src.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
    return `.${wrapper} {\n${css}\n}`;
  };
  return [
    pick('src/components/Breadcrumbs.astro', 'c-breadcrumbs'),
    pick('src/components/Toc.astro', 'c-toc'),
    pick('src/components/FaqList.astro', 'c-faq'),
    pick('src/components/RelatedApp.astro', 'c-related-app'),
    pick('src/components/GuideCard.astro', 'c-guide-card'),
    pick('src/pages/guides/[slug].astro', 'c-article'),
  ].join('\n');
}

const iconCache = new Map();
async function appIconDataUri(siteRoot, appId) {
  if (!iconCache.has(appId)) {
    try {
      const buf = await sharp(join(siteRoot, 'src/assets/apps', `${appId}-icon.png`)).resize(112, 112).webp({ quality: 80 }).toBuffer();
      iconCache.set(appId, `data:image/webp;base64,${buf.toString('base64')}`);
    } catch {
      iconCache.set(appId, '');
    }
  }
  return iconCache.get(appId);
}

/**
 * @returns {Promise<string>} iframe の srcdoc に入れる完全な HTML
 */
export async function renderPreview({ siteRoot, text, siteModules, siteGuides }) {
  const { data, body } = parseArticle(text);
  const slug = String(data.slug ?? 'preview');
  const { APPS, GUIDE_CATEGORIES, relatedGuides } = siteModules;
  const cat = GUIDE_CATEGORIES[data.category] ?? { label: String(data.category ?? '未設定') };
  const toIso = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? ''));
  const publishedAt = toIso(data.publishedAt);
  const updatedAt = toIso(data.updatedAt);

  const processor = await getProcessor();
  const rendered = await processor.render(body);
  const content = absolutizeLinks(sanitizeHtml(rendered.code), slug);
  const headings = rendered.metadata.headings ?? [];

  // 目次（Toc.astro と同じ構造）
  const tree = [];
  for (const h of headings) {
    if (h.depth === 2) tree.push({ h, children: [] });
    else if (h.depth === 3 && tree.length) tree[tree.length - 1].children.push(h);
  }
  const toc = tree.length
    ? `<div class="c-toc"><nav class="toc" aria-labelledby="toc-title"><p id="toc-title" class="toc-title">目次</p><ol>${tree
        .map(
          (n) =>
            `<li><a href="#${esc(n.h.slug)}">${esc(n.h.text)}</a>${
              n.children.length ? `<ul>${n.children.map((c) => `<li><a href="#${esc(c.slug)}">${esc(c.text)}</a></li>`).join('')}</ul>` : ''
            }</li>`,
        )
        .join('')}</ol></nav></div>`
    : '';

  const faq = Array.isArray(data.faq) && data.faq.length
    ? `<section class="article-faq"><h2>よくある質問</h2><div class="c-faq"><div class="faq">${data.faq
        .map((f) => `<section class="faq-item"><h3 class="faq-q"><span class="mark" aria-hidden="true">Q</span>${esc(f.q)}</h3><p class="faq-a">${esc(f.a)}</p></section>`)
        .join('')}</div></div></section>`
    : '';

  const app = data.relatedApp ? APPS[data.relatedApp] : null;
  const appCard = app
    ? `<div class="c-related-app"><aside class="related-app card"><p class="eyebrow">この記事に関連するアプリ</p><div class="head">${
        (await appIconDataUri(siteRoot, app.id)) ? `<img src="${await appIconDataUri(siteRoot, app.id)}" alt="" width="56" height="56" class="icon">` : ''
      }<div><p class="name"><a href="${PUBLIC_BASE}${app.path.slice(1)}">${esc(app.name)}</a></p><p class="small muted meta">${esc(app.platform)}（${esc(app.minimumOs)}）・${esc(app.pricing.price)}</p></div></div><p class="muted">${esc(app.summary)}</p><div class="btn-row"><a class="btn btn-secondary" href="${PUBLIC_BASE}${app.path.slice(1)}">アプリの詳細</a>${
        app.appStoreUrl ? `<a class="btn btn-primary" href="${app.appStoreUrl}">App Storeで見る</a>` : ''
      }</div></aside></div>`
    : '';

  const current = { id: slug, data: { ...data, category: data.category, relatedApp: data.relatedApp ?? null } };
  const related = relatedGuides(current, [current, ...siteGuides.map((g) => ({ id: g.slug, data: g.data, url: g.url }))]);
  const relatedHtml = related.length
    ? `<section class="section section-soft"><div class="container"><h2>関連記事</h2><div class="grid grid-3">${related
        .map(
          (g) =>
            `<div class="c-guide-card"><article class="card guide-card"><p class="guide-meta small"><span class="badge">${esc(
              GUIDE_CATEGORIES[g.data.category]?.label ?? '',
            )}</span><time>${fmtDate(g.data.publishedAt)}</time></p><h3 class="guide-title"><a href="${esc(g.url ?? articleUrl(g.id))}">${esc(
              g.data.title,
            )}</a></h3><p class="muted small">${esc(g.data.description)}</p></article></div>`,
        )
        .join('')}</div></div></section>`
    : '';

  const css = readFileSync(join(siteRoot, 'src/styles/global.css'), 'utf8') + '\n' + componentCss(siteRoot);

  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; script-src 'none'; form-action 'none'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(data.title)}</title>
<style>${css}
.pv-header { position: sticky; top: 0; z-index: 5; background: rgb(255 255 255 / .95); border-bottom: 1px solid var(--border); }
.pv-header .container { display: flex; align-items: center; min-height: 56px; font-weight: 600; letter-spacing: .14em; }
.pv-header span { color: var(--accent); margin-right: .5em; }
.pv-footer { background: var(--bg-soft); border-top: 1px solid var(--border); padding: 24px 0; color: var(--text-tertiary); font-size: .85rem; }
</style></head>
<body>
<header class="pv-header"><div class="container"><span>■</span>TOAILO</div></header>
<main id="main">
<div class="container prose-container"><div class="c-breadcrumbs"><nav aria-label="パンくずリスト" class="breadcrumbs"><ol>
<li><a href="${PUBLIC_BASE}">ホーム</a></li><li><a href="${PUBLIC_BASE}guides/">AI活用ガイド</a></li><li><a href="${PUBLIC_BASE}guides/category/${esc(data.category)}/">${esc(cat.label)}</a></li><li><span aria-current="page">${esc(data.title)}</span></li>
</ol></nav></div></div>
<div class="c-article"><article class="container prose-container article">
<header class="article-head"><p class="meta small"><span class="badge">${esc(cat.label)}</span><span>公開日 <time>${fmtDate(publishedAt)}</time></span>${
    updatedAt && updatedAt !== publishedAt ? `<span>更新日 <time>${fmtDate(updatedAt)}</time></span>` : ''
  }</p><h1>${esc(data.title)}</h1><p class="lead">${esc(data.description)}</p></header>
${toc}
<div class="prose">${content}</div>
${faq}
${appCard}
</article></div>
${relatedHtml}
</main>
<footer class="pv-footer"><div class="container">プレビュー（公開日は Pull Request 作成時の日付に置き換わります）</div></footer>
</body></html>`;
}
