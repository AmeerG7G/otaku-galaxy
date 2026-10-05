import { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// إعداد Firebase للويب يُقرأ عند تحميل الوحدة — قبل أي استيراد.
vi.hoisted(() => {
  vi.stubEnv('VITE_FIREBASE_API_KEY', 'test-api-key')
  vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'test-project')
  vi.stubEnv('VITE_FIREBASE_MESSAGING_SENDER_ID', '1234567890')
  vi.stubEnv('VITE_FIREBASE_APP_ID', '1:1234567890:web:abc')
  vi.stubEnv('VITE_FIREBASE_VAPID_KEY', 'test-vapid-key')
})

const api = vi.hoisted(() => ({
  registerAdminDevice: vi.fn(),
  unregisterAdminDevice: vi.fn(),
}))
const fcm = vi.hoisted(() => ({ getToken: vi.fn() }))

vi.mock('../api/adminAccountsApi', () => api)
vi.mock('firebase/app', () => ({ initializeApp: () => ({}), getApps: () => [] }))
vi.mock('firebase/messaging', () => ({ getMessaging: () => ({}), getToken: fcm.getToken }))

import { client } from '../api/client'
import { useAuthStore } from '../stores/authStore'
import {
  disableWebPush,
  enableWebPush,
  endWebPushSession,
  syncWebPush,
  watchSessionForWebPush,
  webPushEnabledFor,
} from './webPush'

/**
 * دورة حياة إشعارات المسؤول على المتصفّح (FCM Gate 2).
 *
 * [SECURITY] إشعارات المسؤول تحمل اسم الزبون وهاتفه ومبلغ طلبه. هذه الاختبارات
 * تثبت: نهاية الجلسة بأي طريق تُلغي اشتراك المتصفّح فوراً؛ رمز مسؤولٍ لا يصير
 * رمز غيره بصمت؛ الرمز يتجدّد ويُستبدل؛ وإذنٌ مسحوب يوقف الخادم أيضاً. المتصفّح
 * وFirebase هنا مزدوجان — هذا ليس إيصالاً حقيقياً (يحتاج مشروع Firebase ومتصفّحاً).
 */

const RECORD_KEY = 'otaku-admin-push'
const LEGACY_KEY = 'otaku-admin-push-token'

let permission: NotificationPermission
let subscription: { unsubscribe: ReturnType<typeof vi.fn> } | null
const requestPermission = vi.fn(async () => permission)
const register = vi.fn()

function installBrowser() {
  permission = 'granted'
  subscription = { unsubscribe: vi.fn(async () => true) }
  const registration = { pushManager: { getSubscription: vi.fn(async () => subscription) } }
  register.mockResolvedValue(registration)
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
  Object.defineProperty(window, 'PushManager', { value: class {}, configurable: true })
  const NotificationStub = { get permission() { return permission }, requestPermission }
  Object.defineProperty(window, 'Notification', { value: NotificationStub, configurable: true })
  Object.defineProperty(globalThis, 'Notification', { value: NotificationStub, configurable: true })
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      register,
      getRegistration: vi.fn(async () => registration),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  })
}

const record = () => JSON.parse(localStorage.getItem(RECORD_KEY) ?? 'null') as { owner: string; token: string | null } | null
const saveRecord = (owner: string, token: string | null) => localStorage.setItem(RECORD_KEY, JSON.stringify({ owner, token }))
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  installBrowser()
  api.registerAdminDevice.mockResolvedValue({ registered: true, created: true })
  api.unregisterAdminDevice.mockResolvedValue({ unregistered: true })
  fcm.getToken.mockResolvedValue('token-current')
  useAuthStore.setState({ token: 'session-a1', user: { id: 'a1' } as never })
  window.history.replaceState({}, '', '/login')
})

afterEach(() => {
  useAuthStore.setState({ token: null, user: null })
})

describe('نهاية الجلسة تُلغي إشعارات هذا المتصفّح', () => {
  /** طلبٌ حقيقي عبر عميل اللوحة يرتدّ بالحالة المعطاة. */
  async function requestRejectedWith(status: number, code?: string) {
    const adapter = async (config: InternalAxiosRequestConfig) => {
      throw new AxiosError('rejected', 'ERR_BAD_RESPONSE', config, null, {
        status,
        statusText: '',
        headers: {},
        config,
        data: code ? { success: false, message: 'x', error: { code } } : {},
      })
    }
    await client.get('/admin/orders', { adapter }).catch(() => undefined)
  }

  it.each([
    ['401 (انتهاء الجلسة أو إبطالها)', 401, undefined],
    ['403 ACCOUNT_SUSPENDED (إيقاف الحساب)', 403, 'ACCOUNT_SUSPENDED'],
  ])('[SECURITY] %s: الاشتراك يُلغى فوراً، والرمز يُنسى، ولا نداء للخادم بجلسةٍ ساقطة', async (_label, status, code) => {
    saveRecord('a1', 'token-a1')
    const stop = watchSessionForWebPush()
    try {
      await requestRejectedWith(status, code)
      await flush()
      expect(useAuthStore.getState().token).toBeNull()
      expect(subscription!.unsubscribe).toHaveBeenCalledTimes(1)
      expect(record()).toEqual({ owner: 'a1', token: null })
      // الإلغاء على الخادم كان سيرتدّ بـ401؛ الخادم نفسه لا يرسل لجلسةٍ منتهية (٠٨٢).
      expect(api.unregisterAdminDevice).not.toHaveBeenCalled()
    } finally {
      stop()
    }
  })

  it('[SECURITY] 403 لنقص صلاحية قسم ليس نهاية جلسة — الإشعارات باقية', async () => {
    saveRecord('a1', 'token-a1')
    const stop = watchSessionForWebPush()
    try {
      await requestRejectedWith(403, 'ADMIN_PERMISSION_DENIED')
      await flush()
      expect(useAuthStore.getState().token).toBe('session-a1')
      expect(subscription!.unsubscribe).not.toHaveBeenCalled()
      expect(record()).toEqual({ owner: 'a1', token: 'token-a1' })
    } finally {
      stop()
    }
  })

  it('[SECURITY] تحميلٌ بلا جلسة ورمزٌ محفوظ (التنظيف لم يكتمل قبل مغادرة الصفحة) — يكتمل عند الإقلاع', async () => {
    saveRecord('a1', 'token-a1')
    useAuthStore.setState({ token: null, user: null })
    const stop = watchSessionForWebPush()
    try {
      await flush()
      expect(subscription!.unsubscribe).toHaveBeenCalledTimes(1)
      expect(record()).toEqual({ owner: 'a1', token: null })
    } finally {
      stop()
    }
  })

  it('[CRITICAL] السجلّ لا يتغيّر قبل إلغاء الاشتراك — صفحةٌ تُغادَر في المنتصف تُعيد الإلغاء', async () => {
    saveRecord('a1', 'token-a1')
    let release!: () => void
    subscription!.unsubscribe.mockImplementation(() => new Promise<boolean>((resolve) => (release = () => resolve(true))))
    const pending = endWebPushSession()
    await flush()
    expect(record()).toEqual({ owner: 'a1', token: 'token-a1' })
    release()
    await pending
    expect(record()).toEqual({ owner: 'a1', token: null })
  })

  it('الخروج الصريح: إلغاءٌ على الخادم والجلسة صالحة، ثم الاشتراك، ولا تبقى نيّة', async () => {
    saveRecord('a1', 'token-a1')
    await disableWebPush()
    expect(api.unregisterAdminDevice).toHaveBeenCalledWith('token-a1')
    expect(subscription!.unsubscribe).toHaveBeenCalledTimes(1)
    expect(record()).toBeNull()
  })

  it('[CRITICAL] الإيقاف لا يمرّ بـdeleteToken من Firebase (يسجّل عامل خدمةٍ غير موجود فيرمي)', async () => {
    saveRecord('a1', 'token-a1')
    await disableWebPush()
    expect(register).not.toHaveBeenCalled()
    expect(fcm.getToken).not.toHaveBeenCalled()
  })
})

describe('تجديد الرمز وربطه بالجلسة', () => {
  it('الرمز نفسه: يُعاد تسجيله (يُربط بهذه الجلسة) ولا يُلغى شيء', async () => {
    saveRecord('a1', 'token-current')
    await syncWebPush('a1')
    expect(api.registerAdminDevice).toHaveBeenCalledWith('token-current')
    expect(api.unregisterAdminDevice).not.toHaveBeenCalled()
    expect(record()).toEqual({ owner: 'a1', token: 'token-current' })
  })

  it('رمزٌ تبدّل: الجديد يُسجَّل قبل إلغاء القديم، والسجلّ يحمل الجديد', async () => {
    saveRecord('a1', 'token-old')
    const order: string[] = []
    api.registerAdminDevice.mockImplementation(async (token: string) => order.push(`register:${token}`))
    api.unregisterAdminDevice.mockImplementation(async (token: string) => order.push(`unregister:${token}`))
    await syncWebPush('a1')
    expect(order).toEqual(['register:token-current', 'unregister:token-old'])
    expect(record()).toEqual({ owner: 'a1', token: 'token-current' })
  })

  it('[SECURITY] إذنٌ سُحب لاحقاً: يُلغى على الخادم، ويُلغى الاشتراك، ولا يُطلب رمز', async () => {
    saveRecord('a1', 'token-a1')
    permission = 'denied'
    await syncWebPush('a1')
    expect(api.unregisterAdminDevice).toHaveBeenCalledWith('token-a1')
    expect(subscription!.unsubscribe).toHaveBeenCalledTimes(1)
    expect(fcm.getToken).not.toHaveBeenCalled()
    expect(api.registerAdminDevice).not.toHaveBeenCalled()
    expect(record()).toBeNull()
  })

  it('[SECURITY] رمز مسؤولٍ آخر في هذا المتصفّح لا يُنقل بصمت', async () => {
    saveRecord('a2', 'token-a2')
    await syncWebPush('a1')
    expect(api.registerAdminDevice).not.toHaveBeenCalled()
    expect(fcm.getToken).not.toHaveBeenCalled()
    expect(subscription!.unsubscribe).toHaveBeenCalledTimes(1)
    expect(record()).toBeNull()
  })

  it('[SECURITY] الصيغة القديمة (رمزٌ بلا صاحب) تُمحى ولا تُسجَّل لأحد', async () => {
    localStorage.setItem(LEGACY_KEY, 'token-legacy')
    await syncWebPush('a1')
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull()
    expect(api.registerAdminDevice).not.toHaveBeenCalled()
    expect(subscription!.unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('بعد جلسةٍ انتهت: جلسة المسؤول نفسه التالية تستعيد إشعاراته بلا سؤال', async () => {
    saveRecord('a1', null)
    await syncWebPush('a1')
    expect(requestPermission).not.toHaveBeenCalled()
    expect(api.registerAdminDevice).toHaveBeenCalledWith('token-current')
    expect(record()).toEqual({ owner: 'a1', token: 'token-current' })
  })

  it('[SECURITY] …ولا تستعيدها جلسة مسؤولٍ آخر، ولا متصفّحٌ صار إذنه «اسأل»', async () => {
    saveRecord('a1', null)
    await syncWebPush('a2')
    expect(api.registerAdminDevice).not.toHaveBeenCalled()
    expect(record()).toBeNull()

    saveRecord('a1', null)
    permission = 'default'
    await syncWebPush('a1')
    expect(requestPermission).not.toHaveBeenCalled()
    expect(api.registerAdminDevice).not.toHaveBeenCalled()
    expect(record()).toBeNull()
  })

  it('فشل الشبكة لا يمحو السجلّ — يُعاد في الجلسة التالية', async () => {
    saveRecord('a1', 'token-old')
    api.registerAdminDevice.mockRejectedValue(new Error('offline'))
    await syncWebPush('a1')
    expect(api.unregisterAdminDevice).not.toHaveBeenCalled()
    expect(record()).toEqual({ owner: 'a1', token: 'token-old' })
  })

  it('مزامنتان متزامنتان (StrictMode) تصيران واحدة', async () => {
    saveRecord('a1', 'token-current')
    await Promise.all([syncWebPush('a1'), syncWebPush('a1')])
    expect(fcm.getToken).toHaveBeenCalledTimes(1)
  })
})

describe('التفعيل وحالة الواجهة', () => {
  it('التفعيل يحفظ الرمز لصاحبه', async () => {
    const result = await enableWebPush('a1')
    expect(result).toEqual({ ok: true, token: 'token-current' })
    expect(api.registerAdminDevice).toHaveBeenCalledWith('token-current')
    expect(record()).toEqual({ owner: 'a1', token: 'token-current' })
  })

  it('رفض الإذن: لا رمز ولا تسجيل', async () => {
    permission = 'denied'
    expect(await enableWebPush('a1')).toEqual({ ok: false, reason: 'denied' })
    expect(api.registerAdminDevice).not.toHaveBeenCalled()
    expect(record()).toBeNull()
  })

  it('[SECURITY] «مفعّلة» فقط لصاحب الرمز ومع إذنٍ قائم — لا تدّعي الواجهة ما لا يستقبله المتصفّح', () => {
    saveRecord('a1', 'token-a1')
    expect(webPushEnabledFor('a1')).toBe(true)
    expect(webPushEnabledFor('a2')).toBe(false)
    expect(webPushEnabledFor(null)).toBe(false)
    permission = 'denied'
    expect(webPushEnabledFor('a1')).toBe(false)
    permission = 'granted'
    saveRecord('a1', null)
    expect(webPushEnabledFor('a1')).toBe(false)
  })
})
