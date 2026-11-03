import type { Metadata } from 'next';
import { cache } from 'react';
import { CategoryChips, Pagination, ProductListing, SortLinks, parsePage, parseSort } from '@/components/Catalog';
import { AppPromoBanner } from '@/components/AppPromoBanner';
import { getAppPromo, listCategories, listProducts } from '@/lib/catalog';
import { HOME_TITLE, homeCanonical, openGraph, SITE_DESCRIPTION } from '@/lib/seo';
import type { ProductSort } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** The listing this URL asks for, read once per request for both the metadata and the page. */
const readListing = cache((page: number, sort: ProductSort) => listProducts({ page, sort }));

/**
 * The store's name and what it sells. Sorting reorders the same products, so
 * the canonical keeps only the catalogue page (`?page=N`).
 */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  const page = parsePage(params.page);
  const canonical = homeCanonical(page);
  const products = await readListing(page, parseSort(params.sort));
  return {
    title: { absolute: HOME_TITLE },
    description: SITE_DESCRIPTION,
    alternates: { canonical },
    // Past the last page there is nothing to show — like an empty category, not a search result.
    ...(products.items.length === 0 ? { robots: { index: false, follow: true } } : {}),
    openGraph: openGraph({ title: HOME_TITLE, description: SITE_DESCRIPTION, url: canonical }),
  };
}

/**
 * The storefront opens directly on the catalog — no welcome or landing page,
 * no hero art. Same categories and products as the app, from the same API.
 * The admin's «download the app» card, when enabled, sits under the heading.
 */
export default async function CatalogPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = parsePage(params.page);
  const sort = parseSort(params.sort);
  const [categories, products, promo] = await Promise.all([listCategories(), readListing(page, sort), getAppPromo()]);
  const extra: Record<string, string> = sort === 'newest' ? {} : { sort };

  return (
    <>
      <h1>كل منتجات الأنمي</h1>
      {promo ? <AppPromoBanner promo={promo} /> : null}
      <CategoryChips categories={categories} />
      <SortLinks basePath="/" active={sort} />
      <section className="section" aria-label="المنتجات">
        <ProductListing result={products} emptyText="لا توجد منتجات متاحة حالياً." />
        <Pagination page={page} hasMore={products.hasMore} basePath="/" extra={extra} />
      </section>
    </>
  );
}
