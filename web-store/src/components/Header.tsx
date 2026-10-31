import { Suspense } from 'react';
import Link from '@/components/Link';
import { SearchBox } from './SearchBox';
import { DesktopNav } from './SiteNav';

/**
 * Site header: the store's square mark (the app's own logo file, rounded by
 * CSS only) beside the wordmark, search, desktop navigation. No character art.
 */
export function Header({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link href="/" className="wordmark">
          {/* eslint-disable-next-line @next/next/no-img-element -- a 36px brand mark served from this site */}
          <img className="logo" src="/icon.png" alt="" width={36} height={36} />
          مجرة الأوتاكو
        </Link>
        <Suspense fallback={null}>
          <SearchBox />
        </Suspense>
        <DesktopNav signedIn={signedIn} />
      </div>
    </header>
  );
}
