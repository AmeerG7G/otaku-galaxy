'use client';

import Link from '@/components/Link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ProductOption } from '@/lib/types';
import { bff } from './client-api';
import { useHydrated } from './use-hydrated';

/**
 * Add to the server cart. Options are required when the product has them;
 * the chosen values are joined with «، » in the product's option order — the
 * same text the app sends and the admin sees on the order.
 */
export function AddToCart({
  productId,
  stock,
  options,
  signedIn,
}: {
  productId: string;
  stock: number;
  options: ProductOption[];
  signedIn: boolean;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
  const [state, setState] = useState<{ kind: 'idle' | 'busy' | 'done' | 'error'; message?: string }>({ kind: 'idle' });

  if (stock <= 0) {
    return (
      <p className="alert alert-info" role="status">
        نفدت الكمية حالياً.
      </p>
    );
  }

  if (!signedIn) {
    return (
      <div className="sticky-action">
        <Link className="btn btn-primary btn-block" href={`/login?returnTo=${encodeURIComponent(`/p/${productId}`)}`}>
          سجّل الدخول للإضافة إلى السلة
        </Link>
      </div>
    );
  }

  const missingOption = options.some((option) => !selected[option.name]);

  async function add() {
    if (missingOption) {
      setState({ kind: 'error', message: 'اختر كل الخيارات أولاً' });
      return;
    }
    setState({ kind: 'busy' });
    const optionValue = options.length > 0 ? options.map((option) => selected[option.name]).join('، ') : null;
    const result = await bff('/bff/cart', { method: 'POST', body: { productId, quantity, optionValue } });
    if (result.ok) {
      setState({ kind: 'done' });
      router.refresh();
      return;
    }
    if (result.status === 401) {
      router.push(`/login?returnTo=${encodeURIComponent(`/p/${productId}`)}`);
      return;
    }
    setState({ kind: 'error', message: result.error?.message ?? 'تعذّرت الإضافة' });
  }

  return (
    <div>
      {options.map((option) => (
        <div className="field" key={option.name}>
          <label htmlFor={`opt-${option.name}`}>{option.name}</label>
          <select
            id={`opt-${option.name}`}
            value={selected[option.name] ?? ''}
            onChange={(event) => setSelected((prev) => ({ ...prev, [option.name]: event.target.value }))}
          >
            <option value="" disabled>
              اختر {option.name}
            </option>
            {option.values.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      ))}

      <div className="field">
        <span id="qty-label" className="label">
          الكمية
        </span>
        <div className="stepper" role="group" aria-labelledby="qty-label">
          <button type="button" aria-label="إنقاص الكمية" onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={quantity <= 1}>
            −
          </button>
          <output aria-live="polite">{quantity}</output>
          <button
            type="button"
            aria-label="زيادة الكمية"
            onClick={() => setQuantity((q) => Math.min(stock, 100, q + 1))}
            disabled={quantity >= Math.min(stock, 100)}
          >
            +
          </button>
        </div>
      </div>

      {state.kind === 'error' ? (
        <p className="alert alert-error" role="alert">
          {state.message}
        </p>
      ) : null}
      {state.kind === 'done' ? (
        <p className="alert alert-success" role="status">
          أُضيف إلى السلة — <Link href="/cart">عرض السلة</Link>
        </p>
      ) : null}

      <div className="sticky-action">
        <button type="button" className="btn btn-primary btn-block" onClick={add} disabled={state.kind === 'busy' || !hydrated}>
          {state.kind === 'busy' ? 'جارٍ الإضافة…' : 'أضف إلى السلة'}
        </button>
      </div>
    </div>
  );
}
