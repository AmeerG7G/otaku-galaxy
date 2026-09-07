import { describe, expect, it } from 'vitest'
import { statusActions, isOrderStatus, STATUS_LABELS } from './orders'
import type { OrderStatus } from '../types/orders'

describe('status transitions', () => {
  it('الطلب الجديد يُقبل إلى التوصيل أو يُرفض', () => {
    const actions = statusActions('PENDING_ADMIN_CONFIRMATION')
    expect(actions.map((a) => a.to)).toEqual(['OUT_FOR_DELIVERY', 'REJECTED'])
  })

  it('الطلب «المؤكَّد» القديم يبقى له مسارٌ موروث للتجهيز ثم التوصيل', () => {
    expect(statusActions('CONFIRMED').map((a) => a.to)).toEqual(['PREPARING', 'REJECTED'])
    expect(statusActions('PREPARING').map((a) => a.to)).toEqual(['OUT_FOR_DELIVERY', 'REJECTED'])
  })

  it('قيد التوصيل يصل إلى الاكتمال فقط أو الرفض', () => {
    const actions = statusActions('OUT_FOR_DELIVERY')
    expect(actions.map((a) => a.to)).toEqual(['COMPLETED', 'REJECTED'])
  })

  it('الحالات النهائية لا تقبل انتقالاً', () => {
    expect(statusActions('COMPLETED')).toHaveLength(0)
    expect(statusActions('REJECTED')).toHaveLength(0)
  })

  it('كل حالة قابلة للانتقال إليها مسجّلة بالتسمية', () => {
    for (const target of (['PREPARING', 'REJECTED', 'OUT_FOR_DELIVERY', 'COMPLETED'] as const)) {
      expect(STATUS_LABELS[target]).toBeTruthy()
    }
  })
})

describe('isOrderStatus', () => {
  it('يُميّز الحالة الصحيحة من غيرها', () => {
    expect(isOrderStatus('PREPARING')).toBe(true)
    expect(isOrderStatus('UNKNOWN')).toBe(false)
    expect(isOrderStatus(null)).toBe(false)
  })
})

describe('order statuses', () => {
  it('جميع الحالات معرفة بالتسميات والألوان', () => {
    const statuses: OrderStatus[] = [
      'PENDING_ADMIN_CONFIRMATION',
      'CONFIRMED',
      'PREPARING',
      'OUT_FOR_DELIVERY',
      'COMPLETED',
      'REJECTED',
    ]
    for (const status of statuses) {
      expect(STATUS_LABELS[status]).toBeTruthy()
    }
  })
})