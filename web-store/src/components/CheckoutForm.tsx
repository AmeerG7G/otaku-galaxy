'use client';

import Link from '@/components/Link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { formatIqd } from '@/lib/format';
import type { CheckoutQuote, Governorate, QuoteIssue, Zone } from '@/lib/types';
import { bff } from './client-api';

const CART_CONFLICTS = new Set(['PRODUCT_PRICE_CHANGED', 'INSUFFICIENT_STOCK', 'PRODUCT_UNAVAILABLE', 'QUOTE_CHANGED']);

function issueText(issue: QuoteIssue, name: string): string {
  return issue.code === 'INSUFFICIENT_STOCK'
    ? `«${name}»: المتوفر ${issue.available} فقط`
    : `«${name}» لم يعد متاحاً`;
}

/**
 * Checkout (cash on delivery). Every figure comes from the API's quote — the
 * same pricing function the API persists with — and the submit carries the
 * quote's fingerprint, so the order is created exactly as reviewed or not at
 * all (409 QUOTE_CHANGED). The idempotency key is issued once with this page,
 * so every retry of this checkout (double tap, timeout, lost response)
 * resolves to the same single order.
 */
export function CheckoutForm({
  governorates,
  expectedPrices,
  productNames,
  defaultPhone,
  idempotencyKey,
}: {
  governorates: Governorate[];
  expectedPrices: Array<{ productId: string; unitPrice: number }>;
  /** productId → display name, for the reviewed lines (the quote carries ids only). */
  productNames: Record<string, string>;
  defaultPhone: string;
  idempotencyKey: string;
}) {
  const router = useRouter();
  const [governorateId, setGovernorateId] = useState('');
  // Zones are kept with the governorate they belong to, so a stale list from
  // the previous choice is never shown while the new one loads.
  const [zonesFor, setZonesFor] = useState<{ governorateId: string; items: Zone[] } | null>(null);
  const zones = zonesFor?.governorateId === governorateId ? zonesFor.items : null;
  const [zoneId, setZoneId] = useState('');
  const [fullAddress, setFullAddress] = useState('');
  const [phone, setPhone] = useState(defaultPhone);
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const [quoteVersion, setQuoteVersion] = useState(0);

  useEffect(() => {
    if (!governorateId) return;
    let cancelled = false;
    void bff<{ items: Zone[] }>(`/bff/zones?governorateId=${encodeURIComponent(governorateId)}`).then((result) => {
      if (!cancelled) setZonesFor({ governorateId, items: result.ok && result.data ? result.data.items : [] });
    });
    return () => {
      cancelled = true;
    };
  }, [governorateId]);

  const needsZone = (zones?.length ?? 0) > 0;

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (governorateId) params.set('governorateId', governorateId);
    if (governorateId && needsZone && zoneId) params.set('zoneId', zoneId);
    void bff<CheckoutQuote>(`/bff/checkout-quote?${params.toString()}`).then((result) => {
      if (cancelled) return;
      if (result.ok && result.data) {
        setQuote(result.data);
        setQuoteError(null);
      } else {
        setQuote(null);
        setQuoteError(result.error?.message ?? 'تعذّر حساب المبلغ');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [governorateId, zoneId, needsZone, quoteVersion]);

  const addressOk = fullAddress.trim().length >= 5;
  const phoneOk = /^(\+?964|0)?7\d{9}$/.test(phone.replace(/[\s-]/g, ''));
  const nameOf = (productId: string) => productNames[productId] ?? 'منتج';
  // A fingerprint exists only when the quote is submittable: destination
  // priced, cart not empty, nothing the API would refuse.
  const ready = Boolean(governorateId) && (!needsZone || Boolean(zoneId)) && addressOk && phoneOk && Boolean(quote?.fingerprint);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || submitting) return;
    setSubmitting(true);
    setMessage(null);
    const result = await bff<{ id: string; number: string }>('/bff/orders', {
      method: 'POST',
      body: {
        governorateId,
        zoneId: needsZone ? zoneId : null,
        fullAddress: fullAddress.trim(),
        phone: phone.replace(/[\s-]/g, ''),
        expectedPrices,
        expectedQuote: quote!.fingerprint,
        idempotencyKey,
      },
    });
    if (result.ok && result.data) {
      router.replace(`/orders/${result.data.id}?placed=1`);
      router.refresh();
      return;
    }
    setSubmitting(false);
    if (result.error && CART_CONFLICTS.has(result.error.code)) {
      setMessage({ kind: 'error', text: `${result.error.message} — راجع المبالغ المحدَّثة ثم أكّد من جديد.` });
      setQuoteVersion((version) => version + 1);
      router.refresh();
      return;
    }
    if (result.status === 0 || result.status >= 500) {
      // The order may or may not have been created. Retrying with the same
      // key is safe: it returns the existing order instead of a second one.
      setMessage({ kind: 'info', text: 'لم نتأكد من وصول طلبك. اضغط «تأكيد الطلب» مرة أخرى — لن يتكرر الطلب.' });
      return;
    }
    setMessage({ kind: 'error', text: result.error?.message ?? 'تعذّر إرسال الطلب' });
  }

  return (
    <form className="two-col" method="post" onSubmit={submit} noValidate>
      <section className="card" aria-label="بيانات التوصيل">
        <h2>بيانات التوصيل</h2>
        <div className="field">
          <label htmlFor="governorate">المحافظة</label>
          <select
            id="governorate"
            value={governorateId}
            onChange={(event) => {
              setGovernorateId(event.target.value);
              setZoneId('');
            }}
            required
          >
            <option value="" disabled>
              اختر المحافظة
            </option>
            {governorates.map((governorate) => (
              <option key={governorate.id} value={governorate.id}>
                {governorate.name}
              </option>
            ))}
          </select>
        </div>
        {needsZone ? (
          <div className="field">
            <label htmlFor="zone">منطقة التوصيل</label>
            <select id="zone" value={zoneId} onChange={(event) => setZoneId(event.target.value)} required>
              <option value="" disabled>
                اختر المنطقة
              </option>
              {zones!.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="field">
          <label htmlFor="address">العنوان الكامل</label>
          <textarea
            id="address"
            value={fullAddress}
            onChange={(event) => setFullAddress(event.target.value)}
            maxLength={300}
            placeholder="المحلة، الزقاق، أقرب نقطة دالّة"
            required
          />
          {fullAddress && !addressOk ? <span className="hint">العنوان قصير جداً</span> : null}
        </div>
        <div className="field">
          <label htmlFor="phone">رقم الهاتف</label>
          <input
            id="phone"
            className="ltr"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="07XXXXXXXXX"
            required
          />
          {phone && !phoneOk ? <span className="hint">أدخل رقم موبايل عراقي مثل 07XXXXXXXXX</span> : null}
        </div>
      </section>

      <aside className="card summary" aria-label="ملخص الطلب" aria-live="polite">
        <h2>ملخص الطلب</h2>
        {quoteError ? <p className="alert alert-error">{quoteError}</p> : null}
        {quote ? (
          <>
            <ul className="review-lines">
              {quote.lines.map((line) => (
                <li key={`${line.productId}:${line.optionValue ?? ''}`} className="summary-row">
                  <span>
                    {nameOf(line.productId)}
                    {line.optionValue ? ` (${line.optionValue})` : ''} × {line.quantity}
                  </span>
                  <span>{formatIqd(line.lineTotal)}</span>
                </li>
              ))}
            </ul>
            {quote.issues.length > 0 ? (
              <div className="alert alert-error" role="alert">
                <p>عدّل سلتك قبل التأكيد:</p>
                <ul>
                  {quote.issues.map((issue) => (
                    <li key={`${issue.code}:${issue.productId}`}>{issueText(issue, nameOf(issue.productId))}</li>
                  ))}
                </ul>
                <Link href="/cart">الرجوع إلى السلة</Link>
              </div>
            ) : null}
            <div className="summary-row">
              <span>مجموع المنتجات</span>
              <span>{formatIqd(quote.productsTotal)}</span>
            </div>
            {quote.birthdayDiscount > 0 ? (
              <div className="summary-row">
                <span>خصم عيد الميلاد</span>
                <span>−{formatIqd(quote.birthdayDiscount)}</span>
              </div>
            ) : null}
            {quote.loyaltyDiscount > 0 ? (
              <div className="summary-row">
                <span>خصم المستوى</span>
                <span>−{formatIqd(quote.loyaltyDiscount)}</span>
              </div>
            ) : null}
            <div className="summary-row">
              <span>رسوم التوصيل</span>
              <span>{quote.deliveryFee === null ? 'حسب المحافظة' : formatIqd(quote.deliveryFee)}</span>
            </div>
            {quote.deliveryDiscount > 0 ? (
              <div className="summary-row">
                <span>خصم التوصيل</span>
                <span>−{formatIqd(quote.deliveryDiscount)}</span>
              </div>
            ) : null}
            <div className="summary-row summary-row--total">
              <span>الإجمالي</span>
              <span>{quote.total === null ? '—' : formatIqd(quote.total)}</span>
            </div>
          </>
        ) : (
          <p className="muted">جارٍ حساب المبلغ…</p>
        )}
        <p className="hint">الدفع عند الاستلام — ما تدفع شي قبل ما يوصلك الطلب.</p>
        {message ? (
          <p className={`alert ${message.kind === 'error' ? 'alert-error' : 'alert-info'}`} role="alert">
            {message.text}
          </p>
        ) : null}
        <button type="submit" className="btn btn-primary btn-block" disabled={!ready || submitting}>
          {submitting ? 'جارٍ الإرسال…' : 'تأكيد الطلب'}
        </button>
      </aside>
    </form>
  );
}
