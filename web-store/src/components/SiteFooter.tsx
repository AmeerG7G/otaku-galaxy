import Link from '@/components/Link';
import type { SocialLinks } from '@/lib/catalog';
import type { Theme } from '@/lib/theme';
import { ThemeSwitch } from './ThemeSwitch';

const SOCIAL: Array<{ key: keyof SocialLinks; label: string }> = [
  { key: 'whatsapp', label: 'واتساب' },
  { key: 'instagram', label: 'إنستغرام' },
  { key: 'tiktok', label: 'تيك توك' },
];

/**
 * Footer: the store's configured social links (the admin's settings — an
 * unset one is not shown), the Google Play link when the admin set one, and
 * the theme choice, and the always-public privacy policy and account-deletion
 * pages (STEP 78 — the store listing points at both).
 */
export function SiteFooter({ playStore, social, theme }: { playStore: string | null; social: SocialLinks; theme: Theme }) {
  const links = SOCIAL.filter((entry) => social[entry.key]);
  return (
    <footer className="site-footer">
      {links.length > 0 ? (
        <nav className="social-links" aria-label="تابعنا وتواصل معنا">
          {links.map((entry) => (
            <a key={entry.key} className="chip" href={social[entry.key]!} rel="noopener noreferrer" target="_blank">
              {entry.label}
            </a>
          ))}
        </nav>
      ) : null}
      {playStore ? (
        <div className="app-download">
          <a href={playStore} className="app-download__link" rel="noopener noreferrer" target="_blank">
            حمّل تطبيق مجرة الأوتاكو من Google Play
          </a>
        </div>
      ) : null}
      <nav className="footer-links" aria-label="الخصوصية والحساب">
        <Link href="/privacy-policy">سياسة الخصوصية</Link>
        <Link href="/delete-account">حذف الحساب</Link>
      </nav>
      <ThemeSwitch initial={theme} />
    </footer>
  );
}
