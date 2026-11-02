/**
 * حقلٌ كرديٌّ اختياري في طلب تعديل (المالك، 2026-10-26: الكردية لا تمنع حفظاً).
 *
 * - نصٌّ مكتوب ← يُرسَل مقصوصاً.
 * - فُرِّغ بعد أن كان محفوظاً ← `null`: يمسح الترجمة على الخادم، فيرى الزبون
 *   الكردي العربية.
 * - فارغٌ من البداية ← لا يُرسَل (الغائب لا يُمسّ على الخادم).
 *
 * لا نسخ من العربية ولا ترجمة آلية: الكردية يكتبها المسؤول أو تبقى ناقصة.
 */
export function kurdishPatch<K extends string>(
  key: K,
  value: string | null | undefined,
  saved: string | null | undefined,
): Partial<Record<K, string | null>> {
  const text = (value ?? '').trim()
  if (text) return { [key]: text } as Record<K, string>
  if ((saved ?? '').trim()) return { [key]: null } as Record<K, null>
  return {}
}

/** الكردية عند الإنشاء: نصٌّ مقصوص أو `null` («لا ترجمة»). */
export function kurdishOrNull(value: string | null | undefined): string | null {
  const text = (value ?? '').trim()
  return text ? text : null
}
