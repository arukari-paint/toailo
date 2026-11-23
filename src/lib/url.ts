/** base path（GitHub Pages のリポジトリ名）を付けたサイト内パスを返す。 */
export function path(p: string = '/'): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const clean = p.startsWith('/') ? p : `/${p}`;
  return `${base}${clean}`;
}

/** 絶対URL（canonical・OG・構造化データ用） */
export function absoluteUrl(p: string = '/'): string {
  return new URL(path(p), import.meta.env.SITE).toString();
}

/** 2026-11-23 → 2026年11月23日 */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}年${m}月${d}日`;
}
