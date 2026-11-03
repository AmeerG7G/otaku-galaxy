import type { Metadata } from 'next';
import { cache } from 'react';
import Link from '@/components/Link';
import { notFound } from 'next/navigation';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { CategoryChips, Pagination, ProductListing, SortLinks, parsePage, parseSort } from '@/components/Catalog';
import { cspNonce, JsonLd } from '@/components/JsonLd';
import { isUuid, listCategories, listProducts } from '@/lib/catalog';
import { siteOrigin } from '@/lib/config';
import { breadcrumbJsonLd, CATEGORIES_LABEL, categoryCanonical, categoryDescription, categoryTitle, HOME_LABEL, openGraph, type Crumb } from '@/lib/seo';
import type { Category, ProductSort } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** The category and the listing this URL asks for, read once per request for both the metadata and the page. */
const readCategoryPage = cache(async (id: string, subParam: string | undefined, page: number, sort: ProductSort) => {
  if (!isUuid(id)) return null;
  const categories = await listCategories();
  const category = categories.find((entry) => entry.id === id);
  if (!category) return null;
  const subs = category.subcategories.filter((sub) => sub.isActive);
  const activeSub = subs.find((sub) => sub.id === subParam);
  const products = await listProducts({ page, sort, categoryId: category.id, subcategoryId: activeSub?.id });
  return { categories, category, subs, activeSub, products };
});

async function read({ params, searchParams }: Props) {
  const { id } = await params;
  const query = await searchParams;
  const subParam = Array.isArray(query.sub) ? query.sub[0] : query.sub;
  const page = parsePage(query.page);
  const sort = parseSort(query.sort);
  return { page, sort, data: await readCategoryPage(id, subParam, page, sort) };
}

function crumbsFor(category: Category, activeSub: { name: string } | undefined): Crumb[] {
  return [
    { name: HOME_LABEL, path: '/' },
    { name: CATEGORIES_LABEL, path: '/categories' },
    activeSub ? { name: category.name, path: `/c/${category.id}` } : { name: category.name },
    ...(activeSub ? [{ name: activeSub.name }] : []),
  ];
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { page, data } = await read(props);
  if (!data) return { title: 'القسم' };
  const { category, activeSub, products } = data;
  const named = activeSub ? { name: `${activeSub.name} — ${category.name}` } : category;
  const title = categoryTitle(named);
  const description = categoryDescription(named);
  const canonical = categoryCanonical(category.id, { subcategoryId: activeSub?.id, page });
  return {
    title,
    description,
    alternates: { canonical },
    // An empty listing (no products yet, or past the last page) is not worth a search result; its links still lead on.
    ...(products.items.length === 0 ? { robots: { index: false, follow: true } } : {}),
    openGraph: openGraph({ title, description, url: canonical }),
  };
}

export default async function CategoryPage(props: Props) {
  const { page, sort, data } = await read(props);
  if (!data) notFound();
  const { categories, category, subs, activeSub, products } = data;

  const basePath = `/c/${category.id}`;
  const keep: Record<string, string> = activeSub ? { sub: activeSub.id } : {};
  const crumbs = crumbsFor(category, activeSub);
  const origin = siteOrigin();
  const nonce = await cspNonce();
  return (
    <>
      <JsonLd nonce={nonce} data={breadcrumbJsonLd(origin, crumbs, categoryCanonical(category.id, { subcategoryId: activeSub?.id, page: 1 }))} />
      <Breadcrumbs crumbs={crumbs} />
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
