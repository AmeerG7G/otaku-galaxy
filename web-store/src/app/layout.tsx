import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { BottomNav } from '@/components/BottomNav';
import { Header } from '@/components/Header';
import { readSession } from '@/lib/server-session';
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
  themeColor: '#6D3BC0',
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await readSession();
  return (
    <html lang="ar" dir="rtl" className={`${cairo.variable} ${tajawal.variable}`}>
      <body>
        <a className="skip-link" href="#main">
          تخطَّ إلى المحتوى
        </a>
        <Header signedIn={Boolean(session)} />
        <main id="main" className="page">
          {children}
        </main>
        <BottomNav signedIn={Boolean(session)} />
      </body>
    </html>
  );
}
