import type { ProductVariantDraft, ProductVariantInput } from '../types/products'

/** سقف العقد (§5) — الخادم يرفض ما فوقه. */
export const MAX_VARIANTS = 20
export const MAX_COLOR_NAME = 40
export const MAX_VARIANT_STOCK = 100000

/** `#RRGGBB` — يقبل الأحرف الصغيرة في الحقل ويُرسَل بالكبيرة. */
export const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/

/**
 * لونٌ في النموذج.
 *
 * [CRITICAL] `rowKey` هوية الصفّ في المتصفّح وحده (لا تُرسَل): رفعُ صورةٍ
 * يستغرق ثوانيَ، والمسؤول قد يحذف صفاً أو ينقله خلالها — فالصورة تُكتب في
 * الصفّ الذي يحمل المفتاح نفسه **الآن**، لا في الموضع الذي بدأ منه الرفع.
 */
export interface VariantFields {
  rowKey: string
  id?: string
  colorName: string
  colorNameCkb: string
  colorHex: string
  imageUrl: string
  stock: number | null
  isActive: boolean
}

let rowSeq = 0
export function newRowKey(): string {
  rowSeq += 1
  return `variant-row-${Date.now().toString(36)}-${rowSeq}`
}

export function emptyVariantFields(): VariantFields {
  return {
    rowKey: newRowKey(),
    colorName: '',
    colorNameCkb: '',
    colorHex: '',
    imageUrl: '',
    stock: null,
    isActive: true,
  }
}

/** من الخادم إلى النموذج: الكردية/اللون الناقصان حقولٌ فارغة. */
export function variantsToFields(variants: readonly ProductVariantDraft[]): VariantFields[] {
  return variants.map((variant) => ({
    rowKey: variant.id ?? newRowKey(),
    id: variant.id,
    colorName: variant.colorName,
    colorNameCkb: variant.colorNameCkb ?? '',
    colorHex: variant.colorHex ?? '',
    imageUrl: variant.imageUrl,
    stock: variant.stock,
    isActive: variant.isActive,
  }))
}

/** من النموذج: قصٌّ كما يقصّ الخادم، والفارغ الاختياري `null`، واللون بأحرف كبيرة. */
export function variantsFromFields(fields: readonly VariantFields[]): ProductVariantDraft[] {
  return fields.map((row) => {
    const hex = (row.colorHex ?? '').trim()
    return {
      ...(row.id ? { id: row.id } : {}),
      colorName: (row.colorName ?? '').trim(),
      colorNameCkb: (row.colorNameCkb ?? '').trim() || null,
      colorHex: hex ? hex.toUpperCase() : null,
      imageUrl: (row.imageUrl ?? '').trim(),
      stock: Number(row.stock ?? 0),
      isActive: row.isActive !== false,
    }
  })
}

/** مفتاح المقارنة في التكرار — قصٌّ وتجاهل حالة الأحرف كما على الخادم. */
export function colorNameKey(name: string | null | undefined): string {
  return (name ?? '').trim().toLocaleLowerCase()
}

/** مجموع مخزون الألوان **النشطة** — قاعدة الخادم لمخزون المنتج المشتق (§1). */
export function derivedStock(variants: ReadonlyArray<Pick<VariantFields, 'stock' | 'isActive'>>): number {
  return variants.reduce(
    (sum, row) => (row && row.isActive !== false ? sum + Math.max(0, Number(row.stock ?? 0)) : sum),
    0,
  )
}

function sameVariant(a: ProductVariantDraft, b: ProductVariantDraft): boolean {
  return (
    (a.id ?? null) === (b.id ?? null) &&
    a.colorName === b.colorName &&
    a.colorNameCkb === b.colorNameCkb &&
    a.colorHex === b.colorHex &&
    a.imageUrl === b.imageUrl &&
    a.stock === b.stock &&
    a.isActive === b.isActive
  )
}

/** هل تغيّرت الألوان (القيم أو الترتيب أو العدد) عن الأساس؟ */
export function variantsChanged(
  next: readonly ProductVariantDraft[],
  base: readonly ProductVariantDraft[],
): boolean {
  if (next.length !== base.length) return true
  return next.some((variant, index) => !sameVariant(variant, base[index]!))
}

/**
 * القائمة الكاملة لـ`PATCH` — كل لونٍ قائم يحمل `expectedStock`: المخزون الذي
 * فُتحت عليه الصفحة (أو آخر ما قُرئ بعد `STOCK_CHANGED`).
 *
 * [CRITICAL] كل لونٍ قائم يُرسَل بمخزونه، فبلا `expectedStock` كان تعديلُ اسمِ
 * لونٍ بعد قبول طلبٍ على لونٍ آخر يُرجع قطعه المستهلكة إلى البيع.
 */
export function variantsPatch(
  variants: readonly ProductVariantDraft[],
  expectedStock: Readonly<Record<string, number>>,
): ProductVariantInput[] {
  return variants.map((variant) => ({
    ...(variant.id ? { id: variant.id } : {}),
    colorName: variant.colorName,
    colorNameCkb: variant.colorNameCkb,
    colorHex: variant.colorHex,
    imageUrl: variant.imageUrl,
    stock: variant.stock,
    ...(variant.id && expectedStock[variant.id] !== undefined
      ? { expectedStock: expectedStock[variant.id] }
      : {}),
    isActive: variant.isActive,
  }))
}

/** للإنشاء: لا `id` ولا `expectedStock`. */
export function variantsCreate(variants: readonly ProductVariantDraft[]): ProductVariantInput[] {
  return variants.map((variant) => ({
    colorName: variant.colorName,
    colorNameCkb: variant.colorNameCkb,
    colorHex: variant.colorHex,
    imageUrl: variant.imageUrl,
    stock: variant.stock,
    isActive: variant.isActive,
  }))
}

/**
 * شرحٌ بالعربية لرموز أخطاء الألوان (§5) — يظهر ثابتاً فوق زرّ الحفظ مع
 * رسالة الخادم نفسها، فلا يضيع بعد اختفاء الإشعار.
 */
export function variantErrorHint(code: string | null | undefined): string | null {
  switch (code) {
    case 'INVALID_VARIANT':
      return 'أحد الألوان لم يعد موجوداً لهذا المنتج أو بياناته غير صالحة (الاسم، الصورة، المخزون). أعد فتح المنتج ثم عدّل.'
    case 'DUPLICATE_VARIANT_COLOR':
      return 'اسم لونٍ مكرّر — لكل لونٍ اسمٌ عربي مختلف (لا فرق بين الأحرف الكبيرة والصغيرة).'
    case 'STOCK_CHANGED':
      return 'تغيّر مخزون لونٍ أو أكثر منذ فتح الصفحة (قُبل طلبٌ مثلاً). وُضع المخزون الحالي في الحقول — راجعه ثم احفظ من جديد.'
    case 'STOCK_PER_VARIANT':
      return 'المنتج الملوَّن يُدار مخزونه لكل لونٍ على حدة — لا يُرسَل مخزون المنتج.'
    case 'PRODUCT_HAS_OPEN_ORDERS':
      return 'لا تُضاف أول الألوان لمنتجٍ عليه طلبات مفتوحة (بانتظار التأكيد، مؤكَّد، قيد التجهيز، خرج للتوصيل). أكمل تلك الطلبات أو ارفضها أولاً.'
    default:
      return null
  }
}
