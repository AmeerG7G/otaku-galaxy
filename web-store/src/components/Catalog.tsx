import Link from 'next/link';
import type { Category, Paginated, Product, ProductSort } from '@/lib/types';
import { ProductGrid } from './ProductCard';

const SORT_LABELS: Record<ProductSort, string> = {
  newest: 'الأحدث',
  price_asc: 'السعر: من الأقل',
  price_desc: 'السعر: من الأعلى',
  rating: 'الأعلى تقييماً',
};

export function CategoryChips({ categories, activeId }: { categories: Category[]; activeId?: string }) {
  return (
    <nav className="chips" aria-label="الأقسام">
      <Link className="chip" href="/" aria-current={activeId ? undefined : 'true'}>
        الكل
      </Link>
      {categories.map((category) => (
        <Link key={category.id} className="chip" href={`/c/${category.id}`} aria-current={activeId === category.id ? 'true' : undefined}>
          {category.name}
        </Link>
      ))}
    </nav>
  );
}

export function SortLinks({ basePath, active, extra = {} }: { basePath: string; active: ProductSort; extra?: Record<string, string> }) {
  return (
    <nav className="chips" aria-label="الترتيب">
      {(Object.keys(SORT_LABELS) as ProductSort[]).map((sort) => {
        const params = new URLSearchParams({ ...extra, ...(sort === 'newest' ? {} : { sort }) });
        const query = params.toString();
        return (
          <Link key={sort} className="chip" href={query ? `${basePath}?${query}` : basePath} aria-current={active === sort ? 'true' : undefined}>
            {SORT_LABELS[sort]}
          </Link>
        );
      })}
    </nav>
  );
}

export function Pagination({ page, hasMore, basePath, extra = {} }: { page: number; hasMore: boolean; basePath: string; extra?: Record<string, string> }) {
  if (page <= 1 && !hasMore) return null;
  const href = (target: number) => {
    const params = new URLSearchParams({ ...extra, ...(target > 1 ? { page: String(target) } : {}) });
    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
  };
  return (
    <nav className="pagination" aria-label="الصفحات">
      {page > 1 ? (
        <Link className="btn" href={href(page - 1)} rel="prev">
          السابق
        </Link>
      ) : null}
      <span className="btn" aria-current="page">
        صفحة {page}
      </span>
      {hasMore ? (
        <Link className="btn" href={href(page + 1)} rel="next">
          التالي
        </Link>
      ) : null}
    </nav>
  );
}

export function ProductListing({ result, emptyText }: { result: Paginated<Product>; emptyText: string }) {
  if (result.items.length === 0) {
    return (
      <div className="empty card">
        <p>{emptyText}</p>
        <Link className="btn" href="/">
          تصفّح كل المنتجات
        </Link>
      </div>
    );
  }
  return <ProductGrid products={result.items} />;
}

export function parsePage(value: string | string[] | undefined): number {
  const page = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(page) && page >= 1 && page <= 1000 ? page : 1;
}

export function parseSort(value: string | string[] | undefined): ProductSort {
  const sort = Array.isArray(value) ? value[0] : value;
  // Own keys only: `in` would also accept `constructor`, `toString`, ….
  return sort && Object.hasOwn(SORT_LABELS, sort) ? (sort as ProductSort) : 'newest';
}
