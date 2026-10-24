'use client';

import Link from '@/components/Link';
import { usePathname } from 'next/navigation';

/** The app's bottom tabs on mobile (hidden from 900px, where the header nav takes over). */
export function BottomNav({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  const items = [
    { href: '/', label: 'الرئيسية', icon: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z', match: (p: string) => p === '/' },
    { href: '/categories', label: 'الأقسام', icon: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', match: (p: string) => p.startsWith('/categories') || p.startsWith('/c/') },
    { href: '/cart', label: 'السلة', icon: 'M6 7h12l-1 13H7zM9 7a3 3 0 0 1 6 0', match: (p: string) => p.startsWith('/cart') || p.startsWith('/checkout') },
    {
      href: signedIn ? '/account' : '/login',
      label: signedIn ? 'حسابي' : 'الدخول',
      icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
      match: (p: string) => ['/account', '/login', '/register', '/forgot-password', '/orders'].some((prefix) => p.startsWith(prefix)),
    },
  ];
  return (
    <nav className="bottom-nav" aria-label="التبويبات">
      {items.map((item) => (
        <Link key={item.href} href={item.href} aria-current={item.match(pathname) ? 'page' : undefined}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
            <path d={item.icon} />
          </svg>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
