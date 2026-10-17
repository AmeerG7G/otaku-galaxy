import { apiFetch } from './api';
import { mediaOrigin } from './config';
import { resolveMediaUrl } from './media';
import type { Category, Governorate, LoyaltyLevel, Paginated, Product, ProductSort, Zone } from './types';

/**
 * Public catalog reads. They carry no Authorization header, so a short reuse
 * window is safe; stock and prices are re-checked by the API at cart, quote
 * and submit time regardless.
 */
const CATALOG_REVALIDATE_SECONDS = 30;

function withMedia(product: Product): Product {
  const origin = mediaOrigin();
  return {
    ...product,
    images: product.images.map((ref) => resolveMediaUrl(ref, origin)).filter((url): url is string => Boolean(url)),
  };
}

export async function listCategories(): Promise<Category[]> {
  const { data } = await apiFetch<{ items: Category[] }>('/catalog/categories', { revalidate: CATALOG_REVALIDATE_SECONDS });
  return data.items.filter((category) => category.isActive);
}

export async function listProducts(options: {
  page?: number;
  categoryId?: string;
  subcategoryId?: string;
  sort?: ProductSort;
  limit?: number;
}): Promise<Paginated<Product>> {
  const { data } = await apiFetch<Paginated<Product>>('/catalog/products', {
    revalidate: CATALOG_REVALIDATE_SECONDS,
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
  const { data } = await apiFetch<Paginated<Product>>('/catalog/products/search', {
    revalidate: CATALOG_REVALIDATE_SECONDS,
    query: { q, page, limit: 24 },
  });
  return { ...data, items: data.items.map(withMedia) };
}

export async function getProduct(id: string): Promise<Product> {
  const { data } = await apiFetch<Product>(`/catalog/products/${encodeURIComponent(id)}`, { revalidate: CATALOG_REVALIDATE_SECONDS });
  return withMedia(data);
}

export async function listGovernorates(): Promise<Governorate[]> {
  const { data } = await apiFetch<{ items: Governorate[] }>('/catalog/governorates', { revalidate: CATALOG_REVALIDATE_SECONDS });
  return data.items.filter((governorate) => governorate.isActive);
}

export async function listZones(governorateId: string): Promise<Zone[]> {
  const { data } = await apiFetch<{ items: Zone[] }>(`/catalog/governorates/${encodeURIComponent(governorateId)}/zones`, {
    revalidate: CATALOG_REVALIDATE_SECONDS,
  });
  return data.items;
}

export async function listLoyaltyLevels(): Promise<LoyaltyLevel[]> {
  const { data } = await apiFetch<{ items: LoyaltyLevel[] }>('/catalog/loyalty-levels', { revalidate: 300 });
  return data.items;
}

/** UUID check before a path parameter reaches the API (it rejects others with 400). */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
