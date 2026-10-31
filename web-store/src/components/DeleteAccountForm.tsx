'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { DELETION_ERRORS_EN, DELETION_UI, type LegalLang } from '@/lib/legal-content';
import { bff } from './client-api';
import { useHydrated } from './use-hydrated';

type Done = { reference: string; retainedOrders: number };

/**
 * The deletion request: password, optional reason, an "I understand" box,
 * then a second, explicit confirmation before anything is sent. The result
 * (reference number) is shown on this page only — never put in a URL.
 *
 * The password goes to the BFF in the request body, which forwards it to the
 * API with the session's token; the API compares it and deletes in one
 * transaction. The browser session is dropped by the BFF on success.
 */
export function DeleteAccountForm({ lang, account }: { lang: LegalLang; account: { username: string; phone: string } }) {
  const ui = DELETION_UI[lang];
  const router = useRouter();
  const hydrated = useHydrated();
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [consent, setConsent] = useState(false);
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const confirmRef = useRef<HTMLHeadingElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const wasConfirming = useRef(false);
  const dir = lang === 'en' ? 'ltr' : 'rtl';

  // Focus follows the step: into the confirmation, and back out of it (to the
  // error when there is one, otherwise to "Continue") so it never falls to <body>.
  useEffect(() => {
    if (step === 'confirm') {
      wasConfirming.current = true;
      confirmRef.current?.focus();
    } else if (wasConfirming.current) {
      wasConfirming.current = false;
      (errorRef.current ?? continueRef.current)?.focus();
    }
  }, [step]);
  useEffect(() => {
    if (done) doneRef.current?.focus();
  }, [done]);

  function review(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password) return setError(ui.missingPassword);
    if (!consent) return setError(ui.missingConsent);
    setError(null);
    setStep('confirm');
  }

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await bff<Done>('/bff/account/delete', {
      method: 'POST',
      body: { password, ...(reason.trim() ? { reason: reason.trim() } : {}) },
    });
    setBusy(false);
    if (result.ok && result.data) {
      setPassword('');
      // No `router.refresh()` here: the session is gone, so a server re-render
      // would swap this component for the sign-in card and the reference number
      // would vanish before it was read. The "back to the store" link below is a
      // full page load, which brings the header up to date.
      setDone(result.data);
      return;
    }
    const code = result.error?.code ?? '';
    const message = lang === 'en' ? (DELETION_ERRORS_EN[code] ?? result.error?.message) : result.error?.message;
    setError(message ?? (lang === 'en' ? 'Something went wrong. Try again.' : 'حدث خطأ — حاول مجدداً'));
    setStep('form');
    if (result.status === 401) router.refresh();
  }

  if (done) {
    return (
      <section className="card stack" lang={lang} dir={dir} aria-labelledby="delete-done-h">
        <h2 id="delete-done-h" ref={doneRef} tabIndex={-1}>
          {ui.doneHeading}
        </h2>
        <p role="status">
          {ui.reference}: <bdi className="ltr deletion-reference">{done.reference}</bdi>
        </p>
        <p className="hint">{ui.referenceHint}</p>
        <p>{ui.retained(done.retainedOrders)}</p>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full load drops the signed-in header */}
        <a className="btn btn-block" href="/">
          {ui.home}
        </a>
      </section>
    );
  }

  return (
    <section className="card stack" lang={lang} dir={dir} aria-labelledby="delete-form-h">
      <h2 id="delete-form-h">{ui.formHeading}</h2>
      <dl className="details">
        <div>
          <dt>{ui.signedInAs}</dt>
          <dd>
            {account.username} — <bdi>{account.phone}</bdi>
          </dd>
        </div>
      </dl>
      {error ? (
        <p className="alert alert-error" role="alert" ref={errorRef} tabIndex={-1}>
          {error}
        </p>
      ) : null}
      {step === 'form' ? (
        <form className="stack" method="post" onSubmit={review} noValidate>
          <div className="field">
            <label htmlFor="delete-password">{ui.password}</label>
            <input
              id="delete-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="delete-reason">{ui.reason}</label>
            <textarea
              id="delete-reason"
              name="reason"
              maxLength={500}
              rows={3}
              aria-describedby="delete-reason-hint"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
            <p id="delete-reason-hint" className="hint">
              {ui.reasonHint}
            </p>
          </div>
          <label className="consent">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            <span>{ui.understand}</span>
          </label>
          <button type="submit" className="btn btn-danger btn-block" disabled={!hydrated} ref={continueRef}>
            {ui.continue}
          </button>
        </form>
      ) : (
        <div className="stack delete-confirm" role="alertdialog" aria-modal="false" aria-labelledby="delete-confirm-h" aria-describedby="delete-confirm-b">
          <h3 id="delete-confirm-h" ref={confirmRef} tabIndex={-1}>
            {ui.confirmHeading}
          </h3>
          <p id="delete-confirm-b">{ui.confirmBody}</p>
          <button type="button" className="btn btn-danger btn-block" onClick={submit} disabled={busy}>
            {busy ? ui.deleting : ui.confirm}
          </button>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => setStep('form')} disabled={busy}>
            {ui.cancel}
          </button>
        </div>
      )}
    </section>
  );
}
