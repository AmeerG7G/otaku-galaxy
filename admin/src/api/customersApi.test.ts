import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('./client', () => ({
  client: { patch: vi.fn() },
  get: vi.fn(),
}))

import { client } from './client'
import { setUserActive } from './customersApi'

/**
 * الحظر والتفعيل على السلك.
 *
 * [CRITICAL] الجسم يحمل الحالة المقصودة. طلبٌ بلا جسم يقلب حالة القاعدة
 * أياً كانت (مسار الخادم يُبقي ذلك لنسخ لوحة أقدم)، فضغطتا «حظر» من شاشتين
 * كانتا تنتهيان بزبونٍ مفعَّل.
 */
describe('واجهة حظر الزبون', () => {
  beforeEach(() => {
    vi.mocked(client.patch).mockResolvedValue({
      data: { success: true, data: { id: 'u1', isActive: false }, message: 'تم' },
    } as never)
  })

  it('«حظر» يرسل isActive=false', async () => {
    await setUserActive({ id: 'u1', isActive: false })
    expect(client.patch).toHaveBeenCalledWith('/admin/users/u1/active', { isActive: false })
  })

  it('«تفعيل» يرسل isActive=true', async () => {
    await setUserActive({ id: 'u1', isActive: true })
    expect(client.patch).toHaveBeenCalledWith('/admin/users/u1/active', { isActive: true })
  })
})
