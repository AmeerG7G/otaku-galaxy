import Link from '@/components/Link';

/** Site header: text wordmark (no character artwork), search, desktop navigation. */
export function Header({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link href="/" className="wordmark">
          مجرة الأوتاكو
        </Link>
        <form className="search-form" action="/search" method="get" role="search">
          <label htmlFor="site-search" className="visually-hidden">
            ابحث عن منتج
          </label>
          <input id="site-search" name="q" type="search" placeholder="دوّر على أي منتج…" maxLength={120} />
          <button type="submit" className="btn">
            بحث
          </button>
        </form>
        <nav className="desktop-nav" aria-label="التنقّل الرئيسي">
          <Link href="/">الرئيسية</Link>
          <Link href="/categories">الأقسام</Link>
          <Link href="/cart">السلة</Link>
          <Link href={signedIn ? '/account' : '/login'}>{signedIn ? 'حسابي' : 'تسجيل الدخول'}</Link>
        </nav>
      </div>
    </header>
  );
}
