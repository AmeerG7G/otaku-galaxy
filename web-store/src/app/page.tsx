import { CategoryChips, Pagination, ProductListing, SortLinks, parsePage, parseSort } from '@/components/Catalog';
import { AppPromoBanner } from '@/components/AppPromoBanner';
import { getAppPromo, listCategories, listProducts } from '@/lib/catalog';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * The storefront opens directly on the catalog — no welcome or landing page,
 * no hero art. Same categories and products as the app, from the same API.
 * The admin's «download the app» card, when enabled, sits under the heading.
 */
export default async function CatalogPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = parsePage(params.page);
  const sort = parseSort(params.sort);
  const [categories, products, promo] = await Promise.all([listCategories(), listProducts({ page, sort }), getAppPromo()]);
  const extra: Record<string, string> = sort === 'newest' ? {} : { sort };

  return (
    <>
      <h1>كل المنتجات</h1>
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
