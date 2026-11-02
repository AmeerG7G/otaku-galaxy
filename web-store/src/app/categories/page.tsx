import type { Metadata } from 'next';
import Link from '@/components/Link';
import { listCategories } from '@/lib/catalog';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'الأقسام' };

export default async function CategoriesPage() {
  const categories = await listCategories();
  return (
    <>
      <h1>الأقسام</h1>
      <ul className="order-list">
        {categories.map((category) => (
          <li key={category.id} className="card">
            <h2>
              <Link href={`/c/${category.id}`}>{category.name}</Link>
            </h2>
            {category.subcategories.some((sub) => sub.isActive) ? (
              <nav className="chips" aria-label={`أقسام ${category.name} الفرعية`}>
                {category.subcategories
                  .filter((sub) => sub.isActive)
                  .map((sub) => (
                    <Link key={sub.id} className="chip" href={`/c/${category.id}?sub=${sub.id}`}>
                      {sub.name}
                    </Link>
                  ))}
              </nav>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}
