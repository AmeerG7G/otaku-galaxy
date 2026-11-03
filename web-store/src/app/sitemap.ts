import type { MetadataRoute } from 'next';
import { listAllProducts, listCategories } from '@/lib/catalog';
import { siteOrigin } from '@/lib/config';
import { absoluteUrl, categoryCanonical, productCanonical } from '@/lib/seo';

/**
 * sitemap.xml: the canonical URL of every page worth a search result, read
 * from the API on each request so it never lists a product that is gone.
 *
 * - every product the store lists (all pages of the listing);
 * - a category only while it has products (an empty one is `noindex`);
 * - the categories index, the home page and the public legal pages.
 *
 * Never listed: private pages (all `noindex` + robots-disallowed), `/search`,
 * sorted or paged variants (not canonical), and anything off this origin.
 * No `lastModified`: the API sends no modification date, and an invented one
 * would mislead crawlers. If the API cannot be read the request fails (500)
 * rather than serve a partial list.
 */
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin();
  const [categories, products] = await Promise.all([listCategories(), listAllProducts()]);
  const stocked = new Set(products.map((product) => product.categoryId));
  const url = (path: string) => absoluteUrl(origin, path);
  const legal = (path: string) => ({ url: url(path), alternates: { languages: { ar: url(path), en: url(`${path}?lang=en`) } } });

  return [
    // The bare origin: how Next renders the home page's canonical (no trailing slash).
    { url: origin },
    { url: url('/categories') },
    ...categories.filter((category) => stocked.has(category.id)).map((category) => ({ url: url(categoryCanonical(category.id, { page: 1 })) })),
    ...products.map((product) => ({ url: url(productCanonical(product.id)) })),
    legal('/privacy-policy'),
    legal('/delete-account'),
  ];
}
