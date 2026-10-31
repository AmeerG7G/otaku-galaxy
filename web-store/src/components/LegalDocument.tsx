import Link from '@/components/Link';
import { LEGAL_UPDATED, type LegalLang, type LegalPage } from '@/lib/legal-content';

/**
 * The privacy policy and the deletion page share one reading layout: a
 * language switch (Arabic / English, by `?lang=`), the title and date, and
 * the sections. The English text is marked `lang="en" dir="ltr"` inside the
 * Arabic site shell, so screen readers and the browser read each correctly.
 */
export function LegalLanguageSwitch({ path, lang, label }: { path: string; lang: LegalLang; label: string }) {
  return (
    <nav className="chips legal-lang" aria-label={label}>
      <Link className="chip" href={path} aria-current={lang === 'ar' ? 'true' : undefined} hrefLang="ar" lang="ar">
        العربية
      </Link>
      <Link className="chip" href={`${path}?lang=en`} aria-current={lang === 'en' ? 'true' : undefined} hrefLang="en" lang="en">
        English
      </Link>
    </nav>
  );
}

export function LegalDocument({ page, lang, children }: { page: LegalPage; lang: LegalLang; children?: React.ReactNode }) {
  return (
    <article className="legal card" lang={lang} dir={lang === 'en' ? 'ltr' : 'rtl'}>
      <header className="legal__head">
        <h1>{page.title}</h1>
        <p className="hint">
          {page.updatedLabel} <bdi dir="ltr">{LEGAL_UPDATED}</bdi>
        </p>
      </header>
      {page.intro.map((text) => (
        <p key={text}>{text}</p>
      ))}
      {page.sections.map((section) => (
        <section key={section.id} id={section.id} aria-labelledby={`${section.id}-h`}>
          <h2 id={`${section.id}-h`}>{section.heading}</h2>
          {section.paragraphs?.map((text) => (
            <p key={text}>{text}</p>
          ))}
          {section.items ? (
            <ul>
              {section.items.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}
      {children}
    </article>
  );
}
