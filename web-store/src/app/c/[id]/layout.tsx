import { notFound } from 'next/navigation';
import { isUuid, listCategories } from '@/lib/catalog';

type Props = { children: React.ReactNode; params: Promise<{ id: string }> };

/**
 * An unknown or inactive category answers with a real 404 status: checked
 * here, above this segment's `loading.tsx`, before the response starts
 * streaming — see `p/[id]/layout.tsx`. `listCategories` is request-cached.
 */
export default async function CategoryLayout({ children, params }: Props) {
  const { id } = await params;
  if (!isUuid(id) || !(await listCategories()).some((category) => category.id === id)) notFound();
  return children;
}
