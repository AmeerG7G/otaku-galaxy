import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('./client', () => ({
  get: vi.fn(),
  patch: vi.fn(),
}))

import { get, patch } from './client'
import { listRestockDemand, setRestockAt } from './restockApi'

/**
 * موعد التوفر المتوقَّع من جهة اللوحة.
 *
 * [CRITICAL] لا مسار خاص بالتاريخ. `restock_at` عمودٌ في `products`، ومسار
 * تعديل المنتج يقبله سلفاً؛ مسارٌ ثانٍ كان سيعني مصدرين للتحقق والصلاحية —
 * ونسختين تتباعدان أول مرة يُشدَّد أحدهما.
 */
describe('واجهة موعد التوفر', () => {
  beforeEach(() => {
    vi.mocked(patch).mockResolvedValue(undefined as never)
    vi.mocked(get).mockResolvedValue([] as never)
  })

  it('التحديد يمرّ عبر مسار تعديل المنتج', async () => {
    await setRestockAt('p1', '2026-09-15T09:00:00.000Z')
    expect(patch).toHaveBeenCalledWith('/admin/products/p1', {
      restockAt: '2026-09-15T09:00:00.000Z',
    })
  })

  it('التعديل يستعمل نفس المسار بقيمة جديدة', async () => {
    await setRestockAt('p1', '2026-09-20T09:00:00.000Z')
    expect(patch).toHaveBeenCalledWith('/admin/products/p1', {
      restockAt: '2026-09-20T09:00:00.000Z',
    })
  })

  it('[CRITICAL] الإلغاء يرسل null صراحةً لا يحذف الحقل', async () => {
    // الحقل الغائب يعني «لا تغيّر» في مسار التعديل؛ المسح يحتاج null صريحة.
    await setRestockAt('p1', null)
    expect(patch).toHaveBeenCalledWith('/admin/products/p1', { restockAt: null })
  })

  it('قائمة الطلبات تُقرأ من مسار الإدارة', async () => {
    await listRestockDemand()
    expect(get).toHaveBeenCalledWith('/admin/restock/demand')
  })

  it('خطأ الخادم يصل المستدعي ولا يُبتلع', async () => {
    vi.mocked(patch).mockRejectedValue(new Error('تاريخ توفر غير صالح'))
    await expect(setRestockAt('p1', 'bad')).rejects.toThrow('تاريخ توفر غير صالح')
  })
})
