'use client';

import Link from '@/components/Link';
import { usePathname } from 'next/navigation';
import { navItems } from './nav-items';

/**
 * The header navigation (from 900px) and the mobile bottom tabs — one list
 * (`nav-items.ts`), so both name a place the same way and mark the same
 * section as current.
 */
export function DesktopNav({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="desktop-nav" aria-label="التنقّل الرئيسي">
      {navItems(signedIn).map((item) => (
        <Link key={item.href} href={item.href} aria-current={item.match(pathname) ? 'page' : undefined}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="bottom-nav" aria-label="التبويبات">
      {navItems(signedIn).map((item) => (
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
