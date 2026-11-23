/**
 * 構造化データ（schema.org / JSON-LD）。
 * 架空のレビュー・評価・価格は入れない。価格は App Store で確認できた「無料（0円）」のみ。
 */
import { SITE } from '@/config/site';
import type { AppInfo, FaqItem } from '@/data/apps';
import { absoluteUrl } from '@/lib/url';

export type JsonLd = Record<string, unknown>;

export function organizationLd(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': absoluteUrl('/#organization'),
    name: SITE.name,
    url: absoluteUrl('/'),
    logo: absoluteUrl('/icon-512.png'),
    email: SITE.contactEmail,
  };
}

export function websiteLd(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': absoluteUrl('/#website'),
    name: SITE.name,
    url: absoluteUrl('/'),
    inLanguage: 'ja',
    description: SITE.description,
    publisher: { '@id': absoluteUrl('/#organization') },
  };
}

export function breadcrumbLd(items: { name: string; path: string }[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function faqLd(items: FaqItem[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

/** SoftwareApplication：確認できた情報（名前・OS・カテゴリ・無料・ストアURL）だけを入れる */
export function softwareApplicationLd(app: AppInfo, imageUrl: string): JsonLd {
  const ld: JsonLd = {
    '@context': 'https://schema.org',
    '@type': 'MobileApplication',
    name: app.name,
    description: app.summary,
    applicationCategory: app.schemaCategory,
    operatingSystem: 'iOS 16.4 or later',
    inLanguage: 'ja',
    url: absoluteUrl(app.path),
    image: imageUrl,
    publisher: { '@id': absoluteUrl('/#organization') },
  };
  if (app.status === 'available' && app.appStoreUrl) {
    ld.installUrl = app.appStoreUrl;
    ld.sameAs = app.appStoreUrl;
    ld.datePublished = app.releaseDate;
    ld.offers = { '@type': 'Offer', price: '0', priceCurrency: 'JPY', url: app.appStoreUrl };
  }
  return ld;
}

export function articleLd(input: {
  title: string;
  description: string;
  path: string;
  publishedAt: string;
  updatedAt: string;
  image: string;
}): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: input.title,
    description: input.description,
    url: absoluteUrl(input.path),
    mainEntityOfPage: absoluteUrl(input.path),
    datePublished: input.publishedAt,
    dateModified: input.updatedAt,
    inLanguage: 'ja',
    image: input.image,
    author: { '@id': absoluteUrl('/#organization') },
    publisher: { '@id': absoluteUrl('/#organization') },
  };
}
