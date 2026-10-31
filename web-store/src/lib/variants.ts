import type { LineVariant, Product, ProductVariant, VariantKind } from './types';

/**
 * The words for each option kind (090, STEP 77). The labels are the app's
 * `productColor`/`productDesign`/`productSize`; the colour sentences are this
 * store's existing ones, and the other kinds follow them. One option system
 * (an image and a stock per option); only the words change.
 */
export const VARIANT_KIND_TEXT: Record<VariantKind, { label: string; chooseFirst: string; ofThis: string }> = {
  color: { label: 'اللون', chooseFirst: 'اختر لون المنتج', ofThis: 'من هذا اللون' },
  design: { label: 'التصميم', chooseFirst: 'اختر تصميم المنتج', ofThis: 'من هذا التصميم' },
  size: { label: 'المقاس', chooseFirst: 'اختر مقاس المنتج', ofThis: 'من هذا المقاس' },
};

/** An unknown or absent kind (an older API, an older order line) is a colour. */
export function variantKindText(kind: VariantKind | null | undefined) {
  return VARIANT_KIND_TEXT[kind === 'design' || kind === 'size' ? kind : 'color'];
}

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
