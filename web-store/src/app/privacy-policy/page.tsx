import type { Metadata } from 'next';
import Link from '@/components/Link';
import { LegalDocument, LegalLanguageSwitch } from '@/components/LegalDocument';
import { DELETION_UI, parseLegalLang, privacyPolicy } from '@/lib/legal-content';

type Props = { searchParams: Promise<{ lang?: string | string[] }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const lang = parseLegalLang((await searchParams).lang);
  return {
    title: privacyPolicy(lang).title,
    alternates: { canonical: '/privacy-policy', languages: { ar: '/privacy-policy', en: '/privacy-policy?lang=en' } },
  };
}

/** Public — no session is read, so it renders the same for every visitor. */
export default async function PrivacyPolicyPage({ searchParams }: Props) {
  const lang = parseLegalLang((await searchParams).lang);
  const ui = DELETION_UI[lang];
  const deletionHref = lang === 'en' ? '/delete-account?lang=en' : '/delete-account';
  return (
    <div className="legal-page stack">
      <LegalLanguageSwitch path="/privacy-policy" lang={lang} label={ui.languageSwitch} />
      <LegalDocument page={privacyPolicy(lang)} lang={lang}>
        <p className="legal__link">
          <Link href={deletionHref}>{lang === 'en' ? 'Delete your account' : 'حذف الحساب'}</Link>
        </p>
      </LegalDocument>
    </div>
  );
}
