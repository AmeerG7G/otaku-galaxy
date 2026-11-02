import type { Metadata } from 'next';
import type { SocialLinks } from './social-links';
import type { Category, Product } from './types';

/**
 * Search metadata and structured data for the public catalogue: canonical
 * paths, Open Graph defaults and schema.org JSON-LD.
 *
 * [CRITICAL] Everything here describes what the page itself shows, from the
 * same API object the page renders. Nothing is invented: no rating without
 * approved reviews, no Offer without an announced price, no delivery or stock
 * claim the page does not make, no modification date the API does not send.
 */

export const SITE_NAME = 'مجرة الأوتاكو';
/** The brand's Latin name, so "Otaku Galaxy" resolves to this store. */
export const SITE_ALTERNATE_NAME = 'Otaku Galaxy';
/** The live default description since launch — unchanged wording. */
export const SITE_DESCRIPTION = 'متجر مجرة الأوتاكو — منتجات الأنمي في العراق، الدفع عند الاستلام.';
export const HOME_TITLE = 'مجرة الأوتاكو | متجر منتجات الأنمي في العراق';
export const CATEGORIES_DESCRIPTION = 'أقسام متجر مجرة الأوتاكو لمنتجات الأنمي في العراق.';
/** The square brand mark (`app/icon.png`, 512×512) — the only site image that is ours to share. */
export const DEFAULT_SHARE_IMAGE = { url: '/icon.png', width: 512, height: 512, alt: SITE_NAME };

export const HOME_LABEL = 'الرئيسية';
export const CATEGORIES_LABEL = 'الأقسام';

export function categoryTitle(category: Pick<Category, 'name'>): string {
  return `${category.name} — منتجات الأنمي`;
}

export function categoryDescription(category: Pick<Category, 'name'>): string {
  return `تصفّح ${category.name} في مجرة الأوتاكو، متجر منتجات الأنمي في العراق.`;
}

/** The product's own description (first 160 characters), else its name and the store's. */
export function productDescription(product: Pick<Product, 'name' | 'description'>): string {
  const own = product.description.trim();
  // By code point, so an emoji at the cut is never split into half a surrogate pair.
  return own ? Array.from(own).slice(0, 160).join('') : `${product.name} — ${SITE_NAME}`;
}

/**
 * Open Graph for a page. Next replaces a parent's `openGraph` object instead
 * of merging it, so every page that sets its own passes through here to keep
 * the site name, locale and a share image.
 */
export function openGraph(extra: { title?: string; description?: string; url?: string; images?: { url: string }[]; type?: 'website' } = {}): NonNullable<Metadata['openGraph']> {
  return {
    siteName: SITE_NAME,
    locale: 'ar_IQ',
    type: extra.type ?? 'website',
    ...(extra.title ? { title: extra.title } : {}),
    ...(extra.description ? { description: extra.description } : {}),
    ...(extra.url ? { url: extra.url } : {}),
    images: extra.images && extra.images.length > 0 ? extra.images : [DEFAULT_SHARE_IMAGE],
  };
}

// ── Canonical paths ──
//
// A canonical URL names the page that holds this content. Sorting only
// reorders the same products, and `?reviews=N` pages through the reviews of
// the same product, so both are dropped. A later catalogue page (`page`) and
// a subcategory (`sub`) list different products, so both are kept.

function withQuery(path: string, query: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `${path}?${text}` : path;
}

const pageParam = (page: number) => (page > 1 ? String(page) : undefined);

export function homeCanonical(page: number): string {
  return withQuery('/', { page: pageParam(page) });
}

export function categoryCanonical(categoryId: string, options: { subcategoryId?: string; page: number }): string {
  return withQuery(`/c/${categoryId}`, { sub: options.subcategoryId, page: pageParam(options.page) });
}

export function productCanonical(productId: string): string {
  return `/p/${productId}`;
}

export function absoluteUrl(origin: string, path: string): string {
  return new URL(path, origin).toString();
}

// ── JSON-LD ──

type JsonLd = Record<string, unknown>;

const SCHEMA = 'https://schema.org';

export function organizationJsonLd(origin: string, social: SocialLinks): JsonLd {
  // Profiles only: a WhatsApp chat link is a contact, not the store's profile.
  const sameAs = [social.instagram, social.tiktok].filter((url): url is string => Boolean(url));
  return {
    '@context': SCHEMA,
    '@type': 'Organization',
    '@id': `${absoluteUrl(origin, '/')}#organization`,
    name: SITE_NAME,
    alternateName: SITE_ALTERNATE_NAME,
    url: absoluteUrl(origin, '/'),
    logo: absoluteUrl(origin, DEFAULT_SHARE_IMAGE.url),
    ...(sameAs.length > 0 ? { sameAs } : {}),
  };
}

export function websiteJsonLd(origin: string): JsonLd {
  return {
    '@context': SCHEMA,
    '@type': 'WebSite',
    '@id': `${absoluteUrl(origin, '/')}#website`,
    name: SITE_NAME,
    alternateName: SITE_ALTERNATE_NAME,
    url: absoluteUrl(origin, '/'),
    inLanguage: 'ar',
    publisher: { '@id': `${absoluteUrl(origin, '/')}#organization` },
  };
}

export interface Crumb {
  name: string;
  /** Absent for the current page, which is the last crumb and not a link. */
  path?: string;
}

export function breadcrumbJsonLd(origin: string, crumbs: Crumb[], currentPath: string): JsonLd {
  return {
    '@context': SCHEMA,
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(origin, crumb.path ?? currentPath),
    })),
  };
}

/**
 * The page's own stock state: in stock while anything is left to add to the
 * cart, otherwise out of stock — also when a restock date is announced, since
 * nothing can be ordered until then.
 */
export function productAvailability(product: Pick<Product, 'stock'>): string {
  return product.stock > 0 ? `${SCHEMA}/InStock` : `${SCHEMA}/OutOfStock`;
}

export function productJsonLd(origin: string, product: Product, category?: Pick<Category, 'name'>): JsonLd {
  const url = absoluteUrl(origin, productCanonical(product.id));
  const description = product.description.trim();
  const reviewCount = product.reviewCount ?? 0;
  return {
    '@context': SCHEMA,
    '@type': 'Product',
    '@id': `${url}#product`,
    name: product.name,
    url,
    ...(description ? { description } : {}),
    ...(product.images.length > 0 ? { image: product.images } : {}),
    ...(category ? { category: category.name } : {}),
    // Price not announced yet («السعر قريباً»): the page sells nothing, so no Offer.
    ...(product.price !== null
      ? {
          offers: {
            '@type': 'Offer',
            url,
            price: String(product.price),
            priceCurrency: 'IQD',
            availability: productAvailability(product),
            seller: { '@id': `${absoluteUrl(origin, '/')}#organization` },
          },
        }
      : {}),
    // Only from approved reviews the page shows; none yet means no rating at all.
    ...(reviewCount > 0 && typeof product.rating === 'number'
      ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: String(product.rating), reviewCount: String(reviewCount), bestRating: '5', worstRating: '1' } }
      : {}),
  };
}

/**
 * JSON for an inline `<script>`: `<` is escaped so a product name or
 * description can never close the script element.
 */
export function serializeJsonLd(data: JsonLd | JsonLd[]): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
