'use client';

import { useState } from 'react';
import Link from '@/components/Link';
import { bff } from './client-api';
import { useHydrated } from './use-hydrated';
import { Swatch } from './VariantSelection';

/**
 * «أعلمني عند توفره» for the whole product and for each sold-out colour
 * (migration 088). The API sends one in-site notification when it is
 * available again and then drops the alert; it refuses an alert for something
 * in stock. State comes from the product read (`viewer`), never guessed.
 */
export interface SoldOutColor {
  id: string;
  name: string;
  hex: string | null;
}

function useAlertToggle(productId: string, variantId: string | null, initial: boolean) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  async function toggle() {
    setBusy(true);
    setMessage(null);
    const result = on
      ? await bff(`/bff/restock/${productId}${variantId ? `?variantId=${variantId}` : ''}`, { method: 'DELETE' })
      : await bff('/bff/restock', { method: 'POST', body: { productId, variantId } });
    setBusy(false);
    if (!result.ok) {
      setMessage({ kind: 'error', text: result.error?.message ?? 'تعذّر إتمام العملية، حاول مرة أخرى' });
      return;
    }
    setOn(!on);
    setMessage({ kind: 'ok', text: on ? 'أُلغي التنبيه' : 'سنُعلمك فور توفّره 🔔' });
  }
  return { on, busy, message, toggle };
}

function AlertMessage({ message }: { message: { kind: 'ok' | 'error'; text: string } | null }) {
  if (!message) return null;
  return (
    <p className={`alert ${message.kind === 'ok' ? 'alert-success' : 'alert-error'}`} role={message.kind === 'ok' ? 'status' : 'alert'}>
      {message.text}
    </p>
  );
}

export function ProductRestockButton({ productId, initial }: { productId: string; initial: boolean }) {
  const hydrated = useHydrated();
  const alert = useAlertToggle(productId, null, initial);
  return (
    <div className="stack restock">
      <button type="button" className="btn btn-block" aria-pressed={alert.on} disabled={alert.busy || !hydrated} onClick={alert.toggle}>
        {alert.on ? 'بانتظار التوفر — إلغاء التنبيه' : 'أعلمني عند توفره'}
      </button>
      <AlertMessage message={alert.message} />
    </div>
  );
}

function ColorRestockRow({ productId, color, initial }: { productId: string; color: SoldOutColor; initial: boolean }) {
  const hydrated = useHydrated();
  const alert = useAlertToggle(productId, color.id, initial);
  return (
    <li className="restock-color">
      <span className="restock-color__name">
        <Swatch hex={color.hex} />
        {color.name}
      </span>
      <button type="button" className="btn btn-small" aria-pressed={alert.on} disabled={alert.busy || !hydrated} onClick={alert.toggle}>
        {alert.on ? 'إلغاء التنبيه' : 'أعلمني عند توفره'}
      </button>
      <AlertMessage message={alert.message} />
    </li>
  );
}

export function ColorRestockList({ productId, colors, subscribedIds }: { productId: string; colors: SoldOutColor[]; subscribedIds: string[] }) {
  if (colors.length === 0) return null;
  return (
    <section className="card stack" aria-labelledby="color-alerts">
      <h2 id="color-alerts" className="h3">
        ألوان نفدت
      </h2>
      <ul className="restock-colors">
        {colors.map((color) => (
          <ColorRestockRow key={color.id} productId={productId} color={color} initial={subscribedIds.includes(color.id)} />
        ))}
      </ul>
    </section>
  );
}

export function RestockLoginPrompt({ productId }: { productId: string }) {
  return (
    <p className="hint">
      لنعلمك عند توفر المنتج نحتاج حسابك في مجرة الأوتاكو.{' '}
      <Link href={`/login?returnTo=${encodeURIComponent(`/p/${productId}`)}`}>تسجيل الدخول</Link>
    </p>
  );
}
