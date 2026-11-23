import { getCollection, type CollectionEntry } from 'astro:content';
import type { GuideCategory } from '@/content.config';

export type Guide = CollectionEntry<'guides'>;

/** 公開中の記事（下書きを除く）を新着順で返す。slug とファイル名の不一致はビルドエラーにする。 */
export async function getPublishedGuides(): Promise<Guide[]> {
  const all = await getCollection('guides', ({ data }) => !data.draft);
  for (const g of all) {
    if (g.data.slug !== g.id) {
      throw new Error(`記事 ${g.id}: frontmatter の slug（${g.data.slug}）をファイル名と同じにしてください`);
    }
  }
  return all.sort((a, b) =>
    b.data.publishedAt === a.data.publishedAt
      ? b.data.updatedAt.localeCompare(a.data.updatedAt)
      : b.data.publishedAt.localeCompare(a.data.publishedAt),
  );
}

export async function getGuidesByCategory(category: GuideCategory): Promise<Guide[]> {
  return (await getPublishedGuides()).filter((g) => g.data.category === category);
}

/** 関連記事：同じカテゴリ → 同じ関連アプリ → その他新着 の順に最大 limit 件 */
export function relatedGuides(current: Guide, all: Guide[], limit = 3): Guide[] {
  const others = all.filter((g) => g.id !== current.id);
  const score = (g: Guide) =>
    (g.data.category === current.data.category ? 2 : 0) +
    (current.data.relatedApp && g.data.relatedApp === current.data.relatedApp ? 1 : 0);
  return others
    .map((g, i) => ({ g, s: score(g), i }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.g);
}
