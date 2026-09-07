import { useSearchParams } from 'react-router-dom'
import { readPage } from '../types/pagination'

/**
 * حالة جدول/قائمة متزامنة مع رابط الصفحة — مسؤولو الإدارة يتنقلون بالأسهم
 * وبالرجوع/التقدّم، فالحالة الفعلية (الرقم والفلاتر) يجب أن تعيش في URL.
 */
export function useTableState() {
  const [searchParams, setSearchParams] = useSearchParams()

  const page = readPage(searchParams.get('page'))

  function setPage(next: number) {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('page', String(next))
    setSearchParams(nextParams)
  }

  /** قيمة معامل نصي، أو undefined إن لم يُضبط. */
  function value(key: string): string | undefined {
    return searchParams.get(key) ?? undefined
  }

  /** ضبط/إزالة معامل نصي (القيمة null تُحذف المعامل). */
  function setValue(key: string, next: string | null | undefined) {
    const nextParams = new URLSearchParams(searchParams)
    if (next == null || next === '') {
      nextParams.delete(key)
    } else {
      nextParams.set(key, next)
    }
    setSearchParams(nextParams)
  }

  return { page, setPage, value, setValue, searchParams, setSearchParams }
}