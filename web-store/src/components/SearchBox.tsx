'use client';

import { usePathname, useSearchParams } from 'next/navigation';

/**
 * The header search. On the results page it keeps the query the shopper
 * searched for, so refining it does not start from an empty field.
 */
export function SearchBox() {
  const pathname = usePathname();
  const params = useSearchParams();
  const current = pathname === '/search' ? (params.get('q') ?? '') : '';
  return (
    <form className="search-form" action="/search" method="get" role="search">
      <label htmlFor="site-search" className="visually-hidden">
        ابحث عن منتج
      </label>
      <input key={current} id="site-search" name="q" type="search" placeholder="دوّر على أي منتج…" maxLength={120} defaultValue={current} />
      <button type="submit" className="btn">
        بحث
      </button>
    </form>
  );
}
