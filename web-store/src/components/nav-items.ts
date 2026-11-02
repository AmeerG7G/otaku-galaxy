/**
 * The site's main destinations — one list for the desktop header and the
 * mobile bottom tabs, so both name a place the same way and mark the same
 * section as current.
 */
export interface NavItem {
  href: string;
  label: string;
  /** SVG path (24×24, stroked) for the bottom tabs. */
  icon: string;
  match: (pathname: string) => boolean;
}

export function navItems(signedIn: boolean): NavItem[] {
  return [
    { href: '/', label: 'الرئيسية', icon: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z', match: (p) => p === '/' },
    {
      href: '/categories',
      label: 'الأقسام',
      icon: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
      match: (p) => p.startsWith('/categories') || p.startsWith('/c/'),
    },
    {
      href: '/cart',
      label: 'السلة',
      icon: 'M6 7h12l-1 13H7zM9 7a3 3 0 0 1 6 0',
      match: (p) => p.startsWith('/cart') || p.startsWith('/checkout'),
    },
    {
      href: signedIn ? '/account' : '/login',
      label: signedIn ? 'حسابي' : 'تسجيل الدخول',
      icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
      match: (p) =>
        ['/account', '/login', '/register', '/forgot-password', '/orders', '/favorites', '/points', '/notifications', '/alerts', '/reviews'].some(
          (prefix) => p.startsWith(prefix),
        ),
    },
  ];
}
