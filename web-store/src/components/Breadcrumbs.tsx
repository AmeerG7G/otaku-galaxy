import Link from '@/components/Link';
import type { Crumb } from '@/lib/seo';

/**
 * Where this page sits in the store. The same crumbs feed the page's
 * BreadcrumbList JSON-LD, so the markup always matches what is shown.
 */
export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav className="breadcrumbs" aria-label="مسار التنقل">
      <ol>
        {crumbs.map((crumb, index) => (
          <li key={`${index}-${crumb.name}`}>
            {crumb.path ? <Link href={crumb.path}>{crumb.name}</Link> : <span aria-current="page">{crumb.name}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
