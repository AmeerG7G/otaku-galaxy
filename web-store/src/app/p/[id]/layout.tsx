import { notFound } from 'next/navigation';
import { loadProduct } from './load';

type Props = { children: React.ReactNode; params: Promise<{ id: string }> };

/**
 * A product that does not exist answers with a real 404 status.
 *
 * [CRITICAL] The status code is fixed when the response starts streaming, and
 * it starts as soon as a `loading.tsx` fallback renders (Next.js docs,
 * loading.js → "Status codes"). `notFound()` in the page runs under this
 * segment's loading boundary, so it could only ever send a 200 with a
 * `noindex` tag — a "soft 404". This layout sits above that boundary (and no
 * root `loading.tsx` wraps it — the home skeleton lives in `(home)/`), so the
 * check runs before anything streams. The read is the page's own, cached.
 */
export default async function ProductLayout({ children, params }: Props) {
  if (!(await loadProduct((await params).id))) notFound();
  return children;
}
