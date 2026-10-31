import type { Metadata } from 'next';
import { Pagination, parsePage, ProductListing } from '@/components/Catalog';
import { withMedia } from '@/lib/catalog';
import { requireSession, sessionRead } from '@/lib/page-session';
import type { Paginated, Product } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'المفضلة', robots: { index: false } };

const PAGE_SIZE = 24;

type Props = { searchParams: Promise<{ page?: string | string[] }> };

/** The account's favourites — the same list as the app, on every device. Saved and removed on the product page. */
export default async function FavoritesPage({ searchParams }: Props) {
  const page = parsePage((await searchParams).page);
  const returnTo = page > 1 ? `/favorites?page=${page}` : '/favorites';
  const session = await requireSession(returnTo);
  const result = await sessionRead<Paginated<Product>>(session, '/favorites', returnTo, { query: { page, limit: PAGE_SIZE } });
  const items = result.items.map(withMedia);

  return (
    <>
      <h1>المفضلة</h1>
      {result.total > 0 ? <p className="hint">{result.total.toLocaleString('ar-IQ')} منتج محفوظ</p> : null}
      <ProductListing result={{ ...result, items }} emptyText={page > 1 ? 'لا منتجات في هذه الصفحة.' : 'مفضلتك فارغة — لم تحفظ أي منتج بعد.'} />
      <Pagination page={page} hasMore={result.hasMore} basePath="/favorites" />
    </>
  );
}
