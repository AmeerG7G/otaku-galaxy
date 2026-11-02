import { CategoryChips, Pagination, ProductListing, SortLinks, parsePage, parseSort } from '@/components/Catalog';
import { listCategories, listProducts } from '@/lib/catalog';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * The storefront opens directly on the catalog — no welcome or landing page,
 * no hero art. Same categories and products as the app, from the same API.
 */
export default async function CatalogPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = parsePage(params.page);
  const sort = parseSort(params.sort);
  const [categories, products] = await Promise.all([listCategories(), listProducts({ page, sort })]);
  const extra: Record<string, string> = sort === 'newest' ? {} : { sort };

  return (
    <>
      <h1>كل المنتجات</h1>
      <CategoryChips categories={categories} />
      <SortLinks basePath="/" active={sort} />
      <section className="section" aria-label="المنتجات">
        <ProductListing result={products} emptyText="لا توجد منتجات متاحة حالياً." />
        <Pagination page={page} hasMore={products.hasMore} basePath="/" extra={extra} />
      </section>
    </>
  );
}
