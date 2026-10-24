import type { Metadata } from 'next';
import Link from '@/components/Link';
import { notFound } from 'next/navigation';
import { CategoryChips, Pagination, ProductListing, SortLinks, parsePage, parseSort } from '@/components/Catalog';
import { isUuid, listCategories, listProducts } from '@/lib/catalog';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const category = isUuid(id) ? (await listCategories()).find((entry) => entry.id === id) : undefined;
  return { title: category?.name ?? 'القسم' };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const query = await searchParams;
  const categories = await listCategories();
  const category = categories.find((entry) => entry.id === id);
  if (!category) notFound();

  const subs = category.subcategories.filter((sub) => sub.isActive);
  const subParam = Array.isArray(query.sub) ? query.sub[0] : query.sub;
  const activeSub = subs.find((sub) => sub.id === subParam);
  const page = parsePage(query.page);
  const sort = parseSort(query.sort);
  const products = await listProducts({ page, sort, categoryId: category.id, subcategoryId: activeSub?.id });

  const basePath = `/c/${category.id}`;
  const keep: Record<string, string> = activeSub ? { sub: activeSub.id } : {};
  return (
    <>
      <h1>{category.name}</h1>
      <CategoryChips categories={categories} activeId={category.id} />
      {subs.length > 0 ? (
        <nav className="chips" aria-label="الأقسام الفرعية">
          <Link className="chip" href={basePath} aria-current={activeSub ? undefined : 'true'}>
            كل {category.name}
          </Link>
          {subs.map((sub) => (
            <Link key={sub.id} className="chip" href={`${basePath}?sub=${sub.id}`} aria-current={activeSub?.id === sub.id ? 'true' : undefined}>
              {sub.name}
            </Link>
          ))}
        </nav>
      ) : null}
      <SortLinks basePath={basePath} active={sort} extra={keep} />
      <section className="section" aria-label="المنتجات">
        <ProductListing result={products} emptyText="لا توجد منتجات في هذا القسم حالياً." />
        <Pagination page={page} hasMore={products.hasMore} basePath={basePath} extra={{ ...keep, ...(sort === 'newest' ? {} : { sort }) }} />
      </section>
    </>
  );
}
