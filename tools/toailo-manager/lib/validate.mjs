/**
 * 取り込んだ記事の検証。メタデータはサイトの src/content.config.ts のスキーマ（zod）でそのまま検証する。
 * エラー（errors）が1件でもある記事は保存・承認・公開できない。warnings は確認を促すだけ。
 */
import { parseArticle } from './site.mjs';

const FIELD_LABELS = {
  title: 'タイトル（title）',
  description: '説明（description）',
  slug: 'スラッグ（slug）',
  category: 'カテゴリ（category）',
  publishedAt: '公開日（publishedAt）',
  updatedAt: '更新日（updatedAt）',
  relatedApp: '関連アプリ（relatedApp）',
  draft: '下書きフラグ（draft）',
  faq: 'よくある質問（faq）',
};
const REQUIRED = ['title', 'description', 'slug', 'category', 'publishedAt', 'updatedAt', 'relatedApp', 'draft'];

/** 貼り付けたテキストを記事ごとに分ける（```markdown の囲みにも対応） */
export function splitArticles(text) {
  let src = String(text ?? '').replace(/\r\n?/g, '\n').replace(/^﻿/, '');
  const fenced = [...src.matchAll(/^(`{3,}|~{3,})[ \t]*(?:markdown|md)?[ \t]*\n(---\n[\s\S]*?)\n\1[ \t]*$/gm)];
  if (fenced.length > 0) return fenced.map((m) => m[2].trim() + '\n');

  const lines = src.split('\n');
  const starts = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== '---') continue;
    // 記事の開始 = '---' のあと 20 行以内に閉じの '---' があり、その間に slug: と title: がある
    let close = -1;
    for (let j = i + 1; j < Math.min(lines.length, i + 40); j++) {
      if (lines[j].trim() === '---') { close = j; break; }
    }
    if (close < 0) continue;
    const head = lines.slice(i + 1, close).join('\n');
    if (/^slug:/m.test(head) && /^title:/m.test(head)) {
      starts.push(i);
      i = close;
    }
  }
  if (starts.length === 0) return src.trim() ? [src.trim() + '\n'] : [];
  return starts.map((s, k) => lines.slice(s, starts[k + 1] ?? lines.length).join('\n').trim() + '\n');
}

/** zod の問題を日本語の文に */
function issueToJa(issue) {
  const key = String(issue.path?.[0] ?? '');
  const label = FIELD_LABELS[key] ?? (key || '記事');
  if (key === 'publishedAt' || key === 'updatedAt') return `${label}：YYYY-MM-DD の形式で書いてください（例：2026-12-01）`;
  if (/[぀-ヿ一-鿿]/.test(issue.message)) return `${label}：${issue.message}`;
  switch (issue.code) {
    case 'invalid_type':
      return issue.input === undefined ? `${label}がありません（必須）` : `${label}の型が正しくありません`;
    case 'too_small':
      return issue.origin === 'array' ? `${label}が少なすぎます` : `${label}が短すぎます（${issue.minimum}文字以上）`;
    case 'too_big':
      return `${label}が長すぎます（${issue.maximum}文字以内）`;
    case 'invalid_value':
      return `${label}は次のいずれかにしてください：${(issue.values ?? []).map((v) => (v === null ? 'null' : v)).join(' / ')}`;
    case 'invalid_format':
      return `${label}の形式が正しくありません`;
    default:
      return `${label}：内容が正しくありません`;
  }
}

/** コードブロック・インラインコードを除いた本文（HTMLやリンクの検査用） */
function stripCode(body) {
  return body.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\1[ \t]*$/gm, '').replace(/`[^`\n]*`/g, '');
}

/** 見出し（コードブロックの中は除く） */
export function extractHeadings(body) {
  const out = [];
  let fence = null;
  for (const line of body.split('\n')) {
    const f = line.match(/^(`{3,}|~{3,})/);
    if (f) { fence = fence ? (line.startsWith(fence) ? null : fence) : f[1]; continue; }
    if (fence) continue;
    const m = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (m) out.push({ depth: m[1].length, text: m[2] });
  }
  return out;
}

const normTitle = (t) => String(t).replace(/[\s　、。・「」『』（）()！!？?：:]/g, '').toLowerCase();

/**
 * @param {string} text 記事1本分の Markdown
 * @param {object} ctx
 *   guideSchema, categories, apps（id の配列）
 *   siteSlugs: Set<string>, siteTitles: {slug,title}[]
 *   managed: {slug,title,status}[]（管理ツールで管理中の記事）
 *   pages: string[]（サイト内パス）
 *   companions: string[]（同じPRで一緒に公開する記事の slug）
 *   replaceSlug?: string（この slug の未公開原稿は置き換えてよい）
 *   basePath: string（例 /toailo）
 */
export function validateArticle(text, ctx) {
  const errors = [];
  const warnings = [];
  let data = {};
  let body = '';

  if (!/^---\n[\s\S]*?\n---/.test(String(text).trimStart())) {
    errors.push('先頭に frontmatter（--- で囲んだメタデータ）がありません');
    return { ok: false, errors, warnings, data, body };
  }
  try {
    ({ data, body } = parseArticle(String(text).trimStart()));
  } catch (e) {
    errors.push(`frontmatter（YAML）を読み取れません：${String(e.message).split('\n')[0]}`);
    return { ok: false, errors, warnings, data, body };
  }
  if (!data || typeof data !== 'object') data = {};

  // 1. スキーマ（サイトと同じ定義）
  for (const k of REQUIRED) if (!(k in data)) errors.push(`${FIELD_LABELS[k]}がありません（必須）`);
  const parsed = ctx.guideSchema.safeParse(data);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const k = String(issue.path?.[0] ?? '');
      if (REQUIRED.includes(k) && !(k in data)) continue; // 「ありません」で報告済み
      const msg = issueToJa(issue);
      if (!errors.includes(msg)) errors.push(msg);
    }
  }
  const known = new Set([...REQUIRED, 'faq']);
  const extra = Object.keys(data).filter((k) => !known.has(k));
  if (extra.length) warnings.push(`サイトで使われない項目があります（公開時もそのまま残ります）：${extra.join(', ')}`);

  // 2. 重複
  const slug = typeof data.slug === 'string' ? data.slug : '';
  if (slug) {
    if (ctx.siteSlugs.has(slug)) errors.push(`スラッグ「${slug}」はサイトの既存記事と重複しています`);
    const m = ctx.managed.find((a) => a.slug === slug);
    if (m && ctx.replaceSlug !== slug) errors.push(`スラッグ「${slug}」の記事はすでに取り込み済みです（${m.title}）`);
    if (m && ctx.replaceSlug === slug && m.status === 'published') errors.push(`スラッグ「${slug}」は公開済みのため置き換えできません`);
  }
  if (typeof data.title === 'string' && data.title) {
    const t = normTitle(data.title);
    const dupSite = ctx.siteTitles.find((x) => normTitle(x.title) === t && x.slug !== slug);
    if (dupSite) errors.push(`タイトルがサイトの既存記事「${dupSite.title}」と重複しています`);
    const dupManaged = ctx.managed.find((x) => normTitle(x.title) === t && x.slug !== slug && x.slug !== ctx.replaceSlug);
    if (dupManaged) errors.push(`タイトルが取り込み済みの記事「${dupManaged.title}」と重複しています`);
  }

  // 3. Markdown の構造
  const headings = extractHeadings(body);
  if (headings.some((h) => h.depth === 1)) errors.push('本文に h1（# 見出し）があります。見出しは ## から始めてください（タイトルは自動で h1 になります）');
  const h2 = headings.filter((h) => h.depth === 2).length;
  if (h2 < 2) errors.push('本文の ## 見出しが2つ未満です。目次が作れる構成にしてください');
  let prev = 1;
  for (const h of headings) {
    if (h.depth > prev + 1) { errors.push(`見出しの階層が飛んでいます：「${h.text}」（h${prev} の次に h${h.depth}）`); break; }
    prev = h.depth;
  }
  const plain = stripCode(body).replace(/\s/g, '');
  if (plain.length < 1500) warnings.push(`本文が短めです（約${plain.length}文字）。読者の疑問に十分答えているか確認してください`);
  if (/[0-9０-９][0-9,，]*円|\|.*\|/.test(body) && !/サンプル|架空/.test(body)) {
    warnings.push('金額や表がありますが「架空のサンプル」である旨の記載が見つかりません');
  }

  // 4. 危険な HTML・スクリプト（本文では生の HTML を使わない）
  const code = stripCode(body);
  const htmlTags = [...code.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9-]*)(\s[^>]*)?\/?>/g)].map((m) => m[1].toLowerCase());
  const danger = htmlTags.filter((t) => ['script', 'iframe', 'object', 'embed', 'style', 'link', 'meta', 'form', 'input', 'button', 'svg', 'base'].includes(t));
  if (danger.length) errors.push(`危険なHTMLタグが含まれています：<${[...new Set(danger)].join('>, <')}>`);
  else if (htmlTags.length) errors.push(`本文にHTMLタグ（<${[...new Set(htmlTags)].join('>, <')}>）があります。Markdown だけで書いてください`);
  if (/\son[a-z]+\s*=/i.test(code.replace(/\[[^\]]*\]\([^)]*\)/g, ''))) errors.push('イベント属性（onclick など）が含まれています');
  if (/<!--/.test(code)) warnings.push('HTMLコメント（<!-- -->）があります。公開前に不要なメモが残っていないか確認してください');

  // 5. リンク・画像
  const links = [...code.matchAll(/(!?)\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)].map((m) => ({ image: m[1] === '!', text: m[2], href: m[3] }));
  const refDefs = [...code.matchAll(/^\s*\[[^\]]+\]:\s*(\S+)/gm)].map((m) => ({ image: false, text: '', href: m[1] }));
  const allLinks = [...links, ...refDefs];
  const externals = new Set();
  const knownSlugs = new Set([...ctx.siteSlugs, ...(ctx.companions ?? []), slug].filter(Boolean));
  const pageSet = new Set(ctx.pages.filter((p) => !p.includes('[')));
  for (const c of Object.keys(ctx.categories)) pageSet.add(`/guides/category/${c}/`);
  for (const l of allLinks) {
    const href = l.href;
    if (/^(javascript|data|vbscript|file):/i.test(href)) { errors.push(`使えないリンク先です：${href}`); continue; }
    if (l.image) { errors.push(`画像（${href}）は現在の取り込み機能では扱えません。画像なしで書いてください`); continue; }
    if (/^mailto:|^tel:/i.test(href)) { warnings.push(`メール・電話のリンクがあります：${href}`); continue; }
    if (href.startsWith('#')) continue;
    let sitePath = null;
    if (/^https?:\/\//i.test(href)) {
      const prefix = new URL(ctx.basePath + '/', ctx.siteUrl).href;
      if (href.startsWith(prefix)) sitePath = '/' + href.slice(prefix.length);
      else { externals.add(href); if (/^http:\/\//i.test(href)) warnings.push(`https ではない外部リンクです：${href}`); continue; }
    } else if (href.startsWith(ctx.basePath + '/')) sitePath = href.slice(ctx.basePath.length);
    else if (href.startsWith('/')) { errors.push(`サイト内リンク「${href}」に base path（${ctx.basePath}）がありません。相対パス（例：../${'記事のslug'}/）で書いてください`); continue; }
    else {
      // 記事ページ（/guides/<slug>/）からの相対パスとして解決する
      sitePath = new URL(href, `https://x.invalid/guides/${slug || 'new'}/`).pathname;
    }
    sitePath = sitePath.split('#')[0].split('?')[0];
    if (!sitePath.endsWith('/')) { errors.push(`サイト内リンク「${href}」の末尾に / がありません`); continue; }
    const m = sitePath.match(/^\/guides\/([^/]+)\/$/);
    if (m && !pageSet.has(sitePath)) {
      if (!knownSlugs.has(m[1])) errors.push(`リンク先の記事が存在しません：${href}`);
    } else if (!pageSet.has(sitePath)) errors.push(`リンク先のページが存在しません：${href}`);
  }
  if (externals.size) warnings.push(`外部リンクが ${externals.size} 件あります。リンク先と出典の内容を確認してください：${[...externals].join(' , ')}`);

  // 6. 内容の注意（自動では判定しきれないもの）
  if (data.category && data.relatedApp && ((data.category === 'household' && data.relatedApp === 'tasks') || (data.category === 'tasks' && data.relatedApp === 'household'))) {
    warnings.push('カテゴリと関連アプリの組み合わせを確認してください');
  }
  if (/(アプリ(内|の中)で|アプリが)(AI|ＡＩ)(が|で)?(分析|解析|回答)/.test(body)) {
    warnings.push('「アプリ内でAIが分析する」と読める表現があります。TOAILO はデータを外部AIへ持ち出す方式です');
  }
  if (/(ダウンロード数|利用者数|ユーザー数|レビュー|★|星\d|評価\s*\d)/.test(body)) {
    warnings.push('利用実績・レビュー・評価に関する記述があります。架空の実績になっていないか確認してください');
  }

  return { ok: errors.length === 0, errors, warnings, data: parsed.success ? parsed.data : data, body, headings };
}
