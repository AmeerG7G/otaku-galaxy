import type { LineVariant, Product, ProductVariant } from './types';

const HEX = /^#[0-9A-Fa-f]{6}$/;

/** The colours a customer may see, in the admin's order (contract §2: inactive ones are hidden). */
export function customerVariants(product: Pick<Product, 'variants'>): ProductVariant[] {
  return [...(product.variants ?? [])].filter((variant) => variant.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
}

/** A colour can be chosen only while it has stock. */
export function variantAvailable(variant: Pick<ProductVariant, 'stock' | 'isActive'>): boolean {
  return variant.isActive && variant.stock > 0;
}

/** The colour pre-selected on the product page: the first one in stock, or none. */
export function initialVariantId(variants: readonly ProductVariant[]): string | null {
  return variants.find(variantAvailable)?.id ?? null;
}

/** A swatch colour only when it is a well-formed `#RRGGBB` — never arbitrary CSS from the API. */
export function safeHex(hex: string | null | undefined): string | null {
  return hex && HEX.test(hex) ? hex : null;
}

/**
 * The colour name to show on a line: Kurdish when the page renders Kurdish
 * and a translation exists, otherwise Arabic. The store renders Arabic today.
 */
export function lineColorName(line: LineVariant, language: 'ar' | 'ckb' = 'ar'): string | null {
  if (language === 'ckb' && line.variantColorNameCkb) return line.variantColorNameCkb;
  return line.variantColorName ?? line.variantColorNameAr ?? null;
}

/**
 * The body the BFF forwards to `POST /api/cart`. `variantId` passes as the
 * string the page sent (anything else is `null`); the API validates it
 * (VARIANT_REQUIRED / INVALID_VARIANT) — the BFF never invents or guesses a colour.
 */
export function cartAddBody(body: Record<string, unknown>): {
  productId: unknown;
  quantity: unknown;
  optionValue: unknown;
  variantId: string | null;
} {
  const variantId = typeof body.variantId === 'string' && body.variantId ? body.variantId : null;
  return {
    productId: body.productId,
    quantity: body.quantity,
    optionValue: body.optionValue ?? null,
    variantId,
  };
}
