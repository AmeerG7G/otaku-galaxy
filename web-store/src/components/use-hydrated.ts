'use client';

import { useSyncExternalStore } from 'react';

const noSubscription = () => () => {};

/**
 * False in the server HTML and during hydration, true once React owns the
 * page. Buttons that act through JavaScript stay disabled until then: a tap
 * on a phone that has not hydrated yet would otherwise do nothing, and a form
 * submitted natively would send its fields to the server as a plain request.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(noSubscription, () => true, () => false);
}
