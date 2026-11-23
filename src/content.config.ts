/**
 * 記事（AI活用ガイド）の定義。
 *
 * 記事は src/content/guides/<slug>.md に1ファイルずつ置く。ファイル名と frontmatter の slug は同じにする。
 * 追加するだけで、一覧・カテゴリ別一覧・関連記事・サイトマップに反映される。
 * draft: true の記事はビルドに含まれない（URLも作られない）。
 */
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

export const GUIDE_CATEGORIES = {
  household: { label: '家計簿', description: '家計簿の記録をAIで分析・見直す方法' },
  tasks: { label: 'タスク管理', description: 'やることの整理や振り返りにAIを使う方法' },
  general: { label: 'AI活用全般', description: '記録したデータをAIで活かすための基本' },
} as const;

export type GuideCategory = keyof typeof GUIDE_CATEGORIES;

/** frontmatter には YYYY-MM-DD で書く（YAML では日付として読まれるため、文字列 YYYY-MM-DD に戻す） */
const dateString = z
  .union([z.date(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD で書いてください')])
  .transform((v) => (typeof v === 'string' ? v : v.toISOString().slice(0, 10)));

const guides = defineCollection({
  loader: glob({
    pattern: '**/*.{md,mdx}',
    base: './src/content/guides',
    // URL はファイル名で決める（frontmatter の slug と一致しているかはビルド時に検証する）
    generateId: ({ entry }) => entry.replace(/\.mdx?$/, ''),
  }),
  schema: z
    .object({
      title: z.string().min(1).max(60),
      description: z.string().min(40).max(160),
      slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, '半角英小文字・数字・ハイフンのみ'),
      category: z.enum(['household', 'tasks', 'general']),
      publishedAt: dateString,
      updatedAt: dateString,
      relatedApp: z.enum(['household', 'tasks']).nullable(),
      draft: z.boolean(),
      faq: z.array(z.object({ q: z.string(), a: z.string() })).optional(),
    })
    .refine((d) => d.updatedAt >= d.publishedAt, { message: 'updatedAt は publishedAt 以降にしてください' }),
});

export const collections = { guides };
