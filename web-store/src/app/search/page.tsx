import type { Metadata } from 'next';
import { Pagination, ProductListing, parsePage } from '@/components/Catalog';
import { searchProducts } from '@/lib/catalog';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'البحث', robots: { index: false, follow: true } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function SearchPage({ searchParams }: Props) {
  const params = await searchParams;
  const raw = Array.isArray(params.q) ? params.q[0] : params.q;
  const q = (raw ?? '').trim().slice(0, 120);
  const page = parsePage(params.page);

  if (!q) {
    return (
      <>
        <h1>البحث</h1>
        <p className="muted">اكتب اسم المنتج في خانة البحث أعلاه.</p>
      </>
    );
  }

  const results = await searchProducts(q, page);
  return (
    <>
      <h1>نتائج البحث عن «{q}»</h1>
      <p className="muted">{results.total} منتج</p>
      <ProductListing result={results} emptyText="لا توجد نتائج مطابقة — جرّب كلمة أخرى." />
      <Pagination page={page} hasMore={results.hasMore} basePath="/search" extra={{ q }} />
    </>
  );
}
