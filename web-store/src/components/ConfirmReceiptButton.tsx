'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { bff } from './client-api';
import { useHydrated } from './use-hydrated';

/** «استلمت طلبي» — the same confirmation the app asks for once an order is out for delivery. */
export function ConfirmReceiptButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="card stack">
      <p>وصلك الطلب؟ أكّد الاستلام بعد ما تدفع للمندوب.</p>
      {error ? (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        className="btn btn-primary btn-block"
        disabled={busy || !hydrated}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const result = await bff(`/bff/orders/${orderId}/confirm-receipt`, { method: 'POST' });
          setBusy(false);
          if (!result.ok) setError(result.error?.message ?? 'تعذّر تأكيد الاستلام');
          router.refresh();
        }}
      >
        {busy ? 'جارٍ التأكيد…' : 'استلمت طلبي'}
      </button>
    </div>
  );
}
