import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { cookies } from 'next/headers';
import { Header } from '@/components/Header';
import { BottomNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';
import { getPlayStoreLink, getSocialLinks } from '@/lib/catalog';
import { readSession } from '@/lib/server-session';
import { parseTheme, THEME_COOKIE } from '@/lib/theme';
import './globals.css';

/** The app's typefaces (Cairo body, Tajawal headings), self-hosted — no third-party font host. */
const cairo = localFont({
  src: [
    { path: './fonts/Cairo-Regular.ttf', weight: '400', style: 'normal' },
    { path: './fonts/Cairo-Bold.ttf', weight: '700', style: 'normal' },
  ],
  variable: '--font-body',
  display: 'swap',
});

const tajawal = localFont({
  src: [{ path: './fonts/Tajawal-Bold.ttf', weight: '700', style: 'normal' }],
  variable: '--font-heading',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'مجرة الأوتاكو', template: '%s | مجرة الأوتاكو' },
  description: 'متجر مجرة الأوتاكو — منتجات الأنمي في العراق، الدفع عند الاستلام.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // The browser bar follows the shown theme: the brand violet in light, the logo's night ground in dark.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#6D3BC0' },
    { media: '(prefers-color-scheme: dark)', color: '#0F0B24' },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [session, playStore, social, cookieStore] = await Promise.all([readSession(), getPlayStoreLink(), getSocialLinks(), cookies()]);
  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value);
  return (
    <html lang="ar" dir="rtl" className={`${cairo.variable} ${tajawal.variable}`} data-theme={theme === 'system' ? undefined : theme}>
      <body>
        <a className="skip-link" href="#main">
          تخطَّ إلى المحتوى
        </a>
        <Header signedIn={Boolean(session)} />
        <main id="main" className="page">
          {children}
          <SiteFooter playStore={playStore} social={social} theme={theme} />
        </main>
        <BottomNav signedIn={Boolean(session)} />
      </body>
    </html>
  );
}
