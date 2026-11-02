'use client';

import { useState } from 'react';
import { bff } from './client-api';
import { useHydrated } from './use-hydrated';

/**
 * Save / unsave on the product page (D5: the only place besides the favourites
 * page that knows the state — it comes with the product read, `viewer`). The
 * list is the account's, so the app on any device shows the same.
 */
export function FavoriteButton({ productId, initial }: { productId: string; initial: boolean }) {
  const hydrated = useHydrated();
  const [favorite, setFavorite] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    const result = favorite
      ? await bff<{ favorite: boolean }>(`/bff/favorites/${productId}`, { method: 'DELETE' })
      : await bff<{ favorite: boolean }>('/bff/favorites', { method: 'POST', body: { productId } });
    setBusy(false);
    if (result.ok) setFavorite(!favorite);
    else setError(result.error?.message ?? 'تعذّر إتمام العملية، حاول مرة أخرى');
  }

  return (
    <div className="favorite">
      <button
        type="button"
        className={`btn btn-ghost favorite__button${favorite ? ' favorite__button--on' : ''}`}
        aria-pressed={favorite}
        disabled={busy || !hydrated}
        onClick={toggle}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
        </svg>
        {favorite ? 'في المفضلة' : 'أضف إلى المفضلة'}
      </button>
      {error ? (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
