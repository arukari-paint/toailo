import type { APIRoute } from 'astro';

/**
 * 検索エンジン・AI検索のクローラーをブロックしない。
 * 注意：GitHub Pages のプロジェクトサイト（/<repo>/ 配下）では、この robots.txt はドメイン直下ではないため
 * クローラーには読まれない。独自ドメインやユーザーサイトに移したときに有効になる。サイトマップは Search Console から送信する。
 */
export const GET: APIRoute = ({ site }) => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const sitemap = new URL(`${base}/sitemap-index.xml`, site).toString();
  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${sitemap}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
