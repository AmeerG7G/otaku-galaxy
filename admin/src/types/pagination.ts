/** نوع الاستجابة المفهرس الموحّد — كل قوائم الإدارة تتبناه بدل إعادة تعريفه. */
export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  limit: number
  hasMore?: boolean
  pages?: number
}

/** قراءة رقم صفحة من معامل رابط بأمان. */
export function readPage(value: string | null): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1
}