import { ApiError } from '@/lib/api';
import { getProduct, isUuid } from '@/lib/catalog';
import { readSession } from '@/lib/server-session';
import type { Product } from '@/lib/types';

/**
 * The product as this visitor sees it: with a customer's session the API adds
 * their own state (`viewer`). The layout, `generateMetadata` and the page all
 * call this; `getProduct` is request-cached, so the API is read once.
 */
export async function loadProduct(id: string): Promise<Product | null> {
  if (!isUuid(id)) return null;
  const session = await readSession();
  try {
    return await getProduct(id, session?.token);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) return null;
    throw error;
  }
}
