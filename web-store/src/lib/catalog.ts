import { cache } from 'react';
import { apiFetch } from './api';
import { playStoreUrl } from './app-link';
import { mediaOrigin } from './config';
import { resolveMediaUrl } from './media';
import type { Category, Governorate, LoyaltyLevel, Paginated, Product, ProductSort, Zone } from './types';

/**
 * Public catalog reads. Like every API call they are made per request with the
 * shopper's signed IP and are not cached (see `apiFetch`), so pages always show
 * the current price and stock. The API re-checks both at cart, quote and
 * submit time regardless.
 *
 * Readers that a page and its `generateMetadata` both need are wrapped in
 * React's `cache`, which shares one result within a single request only.
 */

function withMedia(product: Product): Product {
  const origin = mediaOrigin();
  return {
    ...product,
    images: product.images.map((ref) => resolveMediaUrl(ref, origin)).filter((url): url is string => Boolean(url)),
    ...(product.variants
      ? { variants: product.variants.map((variant) => ({ ...variant, imageUrl: resolveMediaUrl(variant.imageUrl, origin) ?? '' })) }
      : {}),
  };
}

export const listCategories = cache(async (): Promise<Category[]> => {
  const { data } = await apiFetch<{ items: Category[] }>('/catalog/categories');
  return data.items.filter((category) => category.isActive);
});

export async function listProducts(options: {
  page?: number;
  categoryId?: string;
  subcategoryId?: string;
  sort?: ProductSort;
  limit?: number;
}): Promise<Paginated<Product>> {
  const { data } = await apiFetch<Paginated<Product>>('/catalog/products', {
    query: {
      page: options.page ?? 1,
      limit: options.limit ?? 24,
      categoryId: options.categoryId,
      subcategoryId: options.subcategoryId,
      sort: options.sort,
    },
  });
  return { ...data, items: data.items.map(withMedia) };
}

export async function searchProducts(q: string, page = 1): Promise<Paginated<Product>> {
  const { data } = await apiFetch<Paginated<Product>>('/catalog/products/search', { query: { q, page, limit: 24 } });
  return { ...data, items: data.items.map(withMedia) };
}

export const getProduct = cache(async (id: string): Promise<Product> => {
  const { data } = await apiFetch<Product>(`/catalog/products/${encodeURIComponent(id)}`);
  return withMedia(data);
});

export async function listGovernorates(): Promise<Governorate[]> {
  const { data } = await apiFetch<{ items: Governorate[] }>('/catalog/governorates');
  return data.items.filter((governorate) => governorate.isActive);
}

export async function listZones(governorateId: string): Promise<Zone[]> {
  const { data } = await apiFetch<{ items: Zone[] }>(`/catalog/governorates/${encodeURIComponent(governorateId)}/zones`);
  return data.items;
}

export async function listLoyaltyLevels(): Promise<LoyaltyLevel[]> {
  const { data } = await apiFetch<{ items: LoyaltyLevel[] }>('/catalog/loyalty-levels');
  return data.items;
}

/**
 * The Google Play link from the admin's app-update setting, or null. A failure
 * here never breaks a page: the link is simply left out.
 */
export const getPlayStoreLink = cache(async (): Promise<string | null> => {
  try {
    const { data } = await apiFetch<{ androidStoreUrl?: unknown; updateUrl?: unknown }>('/catalog/app-version');
    return playStoreUrl(data.androidStoreUrl) ?? playStoreUrl(data.updateUrl);
  } catch {
    return null;
  }
});

/** UUID check before a path parameter reaches the API (it rejects others with 400). */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
