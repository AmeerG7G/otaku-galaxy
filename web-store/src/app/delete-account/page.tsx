import type { Metadata } from 'next';
import Link from '@/components/Link';
import { DeleteAccountForm } from '@/components/DeleteAccountForm';
import { LegalDocument, LegalLanguageSwitch } from '@/components/LegalDocument';
import { localPhone } from '@/lib/format';
import { accountDeletionInfo, DELETION_UI, parseLegalLang } from '@/lib/legal-content';
import { readSession } from '@/lib/server-session';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ lang?: string | string[] }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const lang = parseLegalLang((await searchParams).lang);
  return {
    title: accountDeletionInfo(lang).title,
    alternates: { canonical: '/delete-account', languages: { ar: '/delete-account', en: '/delete-account?lang=en' } },
  };
}

/**
 * Public account-deletion page (STEP 78).
 *
 * Anyone can read what deletion does. Only a signed-in customer sees the
 * form, and the API re-checks the password before it deletes anything. A
 * visitor who is not signed in learns nothing about any account here: the
 * page never takes a phone number, so it cannot reveal whether one exists.
 */
export default async function DeleteAccountPage({ searchParams }: Props) {
  const lang = parseLegalLang((await searchParams).lang);
  const ui = DELETION_UI[lang];
  const session = await readSession();
  const self = lang === 'en' ? '/delete-account?lang=en' : '/delete-account';
  const dir = lang === 'en' ? 'ltr' : 'rtl';

  return (
    <div className="legal-page stack">
      <LegalLanguageSwitch path="/delete-account" lang={lang} label={ui.languageSwitch} />
      <LegalDocument page={accountDeletionInfo(lang)} lang={lang}>
        <p className="legal__link">
          <Link href={lang === 'en' ? '/privacy-policy?lang=en' : '/privacy-policy'}>{ui.privacyLink}</Link>
        </p>
      </LegalDocument>
      {session ? (
        <DeleteAccountForm lang={lang} account={{ username: session.user.username, phone: localPhone(session.user.phone) }} />
      ) : (
        <section className="card stack" lang={lang} dir={dir} aria-labelledby="delete-signin-h">
          <h2 id="delete-signin-h">{ui.signInHeading}</h2>
          <p>{ui.signInBody}</p>
          <Link className="btn btn-primary btn-block" href={`/login?returnTo=${encodeURIComponent(self)}`}>
            {ui.signIn}
          </Link>
          <p className="hint form-links">
            <Link href="/forgot-password">{ui.forgot}</Link>
          </p>
        </section>
      )}
    </div>
  );
}
