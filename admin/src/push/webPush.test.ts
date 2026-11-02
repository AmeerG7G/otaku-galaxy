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

import { ApiError, client } from '../api/client'
import { useAuthStore } from '../stores/authStore'
import {
  disableWebPush,
  enableWebPush,
  endWebPushSession,
  pendingWebPushCleanup,
  syncWebPush,
  watchSessionForWebPush,
  webPushEnabledFor,
  webPushIdle,
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
    useAuthStore.setState({ token: 'session-a2', user: { id: 'a2' } as never })
    await syncWebPush('a2')
    expect(api.registerAdminDevice).not.toHaveBeenCalled()
    expect(record()).toBeNull()

    saveRecord('a1', null)
    useAuthStore.setState({ token: 'session-a1', user: { id: 'a1' } as never })
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

describe('[SECURITY] جلسةٌ تتبدّل والمزامنة معلّقة', () => {
  /**
   * عملية جلسةٍ لا تمسّ جلسةً بعدها: لا طلب بتوكن غيرها، ولا سجلّ يعود بعد
   * خروجٍ أو إيقاف، ومزامنة الجلسة الجديدة تجري فعلاً لا تُدمج في القديمة.
   * كل نداءٍ يُسجَّل مع توكن الجلسة لحظة إرساله — هو ما يرسله العميل
   * (`client.ts` يقرؤه عند الإرسال).
   */
  const calls: string[] = []
  const session = () => useAuthStore.getState().token
  const signIn = (id: string, token = `session-${id}`) => useAuthStore.setState({ token, user: { id } as never })
  const signOut = () => useAuthStore.setState({ token: null, user: null })
  const deviceCalls = () => calls.filter((c) => !c.startsWith('unsubscribe'))

  function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((r) => (resolve = r))
    return { promise, resolve }
  }

  /** ما بقي معلّقاً يُحرَّر بعد كل حالة — عمليةٌ عالقة من حالةٍ فاشلة لا تُفسد التالية. */
  const releases: Array<() => void> = []

  /** أول `getToken` يبقى معلّقاً حتى يُحرَّر؛ ما بعده يعود فوراً. */
  function holdGetToken() {
    const held = deferred<string>()
    fcm.getToken.mockImplementationOnce(() => held.promise)
    releases.push(() => held.resolve('token-abandoned'))
    return held
  }

  afterEach(async () => {
    releases.splice(0).forEach((release) => release())
    await flush()
  })

  beforeEach(() => {
    calls.length = 0
    api.registerAdminDevice.mockImplementation(async (token: string) => {
      calls.push(`register:${token}@${session()}`)
      return { registered: true, created: true }
    })
    api.unregisterAdminDevice.mockImplementation(async (token: string) => {
      calls.push(`unregister:${token}@${session()}`)
      return { unregistered: true }
    })
    subscription!.unsubscribe.mockImplementation(async () => {
      calls.push(`unsubscribe@${session()}`)
      return true
    })
  })

  it('A تنتهي جلسته (٤٠١) ثم يدخل B: مزامنة B تجري، وعملية A المتأخّرة لا ترسل شيئاً ولا تعيد السجلّ', async () => {
    saveRecord('a1', 'token-a1')
    const stop = watchSessionForWebPush()
    try {
      const held = holdGetToken()
      const pA = syncWebPush('a1')
      await flush()
      signOut()
      await flush()
      expect(record()).toEqual({ owner: 'a1', token: null })

      signIn('b2')
      const pB = syncWebPush('b2')
      expect(pB).not.toBe(pA)
      await pB
      expect(record()).toBeNull() // مزامنة B جرت: سجلّ مسؤولٍ آخر يُمحى

      held.resolve('token-late')
      await pA
      await flush()
      expect(deviceCalls()).toEqual([])
      expect(record()).toBeNull()
    } finally {
      stop()
    }
  })

  it('A يوقف الإشعارات ويخرج ثم يدخل B: لا يعود سجلّ A ولا طلبٌ بجلسة B', async () => {
    saveRecord('a1', 'token-a1')
    const held = holdGetToken()
    const pA = syncWebPush('a1')
    await flush()
    await disableWebPush()
    signOut()
    signIn('b2')
    const pB = syncWebPush('b2')
    expect(pB).not.toBe(pA)
    await pB

    held.resolve('token-late')
    await pA
    await flush()
    expect(calls).toEqual(['unregister:token-a1@session-a1', 'unsubscribe@session-a1'])
    expect(record()).toBeNull()
  })

  it('A → B مباشرةً و`getToken` معلّق: مزامنة B لا تُدمج في مزامنة A، ولا شيء من A بتوكن B', async () => {
    saveRecord('a1', 'token-a1')
    const held = holdGetToken()
    const pA = syncWebPush('a1')
    await flush()
    signIn('b2')
    const pB = syncWebPush('b2')
    expect(pB).not.toBe(pA)
    await pB
    expect(calls).toEqual(['unsubscribe@session-b2'])
    expect(record()).toBeNull()

    held.resolve('token-late')
    await pA
    await flush()
    expect(deviceCalls()).toEqual([])
    expect(record()).toBeNull()
  })

  it('المسؤول نفسه بجلسةٍ جديدة (تغيير كلمة المرور): المزامنة الجديدة تجري، والقديمة لا ترسل شيئاً', async () => {
    saveRecord('a1', 'token-a1')
    const held = holdGetToken()
    const pOld = syncWebPush('a1')
    await flush()
    signIn('a1', 'session-a1-renewed')
    const pNew = syncWebPush('a1')
    expect(pNew).not.toBe(pOld)
    await pNew
    const expected = ['register:token-current@session-a1-renewed', 'unregister:token-a1@session-a1-renewed']
    expect(calls).toEqual(expected)
    expect(record()).toEqual({ owner: 'a1', token: 'token-current' })

    held.resolve('token-late')
    await pOld
    await flush()
    expect(calls).toEqual(expected)
    expect(record()).toEqual({ owner: 'a1', token: 'token-current' })
  })

  it('الجلسة نفسها: نداءان متزامنان عمليةٌ واحدة، ونداءٌ بعد انتهائها يجري من جديد', async () => {
    saveRecord('a1', 'token-current')
    const first = syncWebPush('a1')
    expect(syncWebPush('a1')).toBe(first)
    await first
    expect(fcm.getToken).toHaveBeenCalledTimes(1)
    await syncWebPush('a1')
    expect(fcm.getToken).toHaveBeenCalledTimes(2)
  })

  it('تسجيلٌ أُرسل قبل الإيقاف: الإيقاف ينتظره ثم يلغيه بالجلسة نفسها — لا يبقى صفٌّ نشط على الخادم', async () => {
    saveRecord('a1', 'token-a1')
    const registered = deferred<{ registered: boolean; created: boolean }>()
    releases.push(() => registered.resolve({ registered: true, created: true }))
    api.registerAdminDevice.mockImplementationOnce((token: string) => {
      calls.push(`register:${token}@${session()}`)
      return registered.promise
    })
    const pA = syncWebPush('a1')
    await flush()
    expect(calls).toEqual(['register:token-current@session-a1'])

    const disabling = disableWebPush()
    await flush()
    // لا إلغاء قبل أن يستقرّ التسجيل — وإلا سبقه الإلغاء إلى الخادم فبقي الصفّ نشطاً.
    expect(calls).toEqual(['register:token-current@session-a1'])

    registered.resolve({ registered: true, created: true })
    await disabling
    await pA
    await flush()
    expect(calls).toEqual([
      'register:token-current@session-a1',
      'unregister:token-a1@session-a1',
      'unregister:token-current@session-a1',
      'unsubscribe@session-a1',
    ])
    expect(record()).toBeNull()
  })

  it('إيقافٌ والجلسة قائمة ومزامنةٌ معلّقة: لا تعيد المزامنةُ التفعيل', async () => {
    saveRecord('a1', 'token-a1')
    const held = holdGetToken()
    const pA = syncWebPush('a1')
    await flush()
    await disableWebPush()

    held.resolve('token-late')
    await pA
    await flush()
    expect(calls).toEqual(['unregister:token-a1@session-a1', 'unsubscribe@session-a1'])
    expect(record()).toBeNull()
  })

  it('التفعيل وتبدّلت الجلسة قبل الرمز: لا تسجيل ولا سجلّ', async () => {
    const held = holdGetToken()
    const pending = enableWebPush('a1')
    await flush()
    signIn('b2')
    held.resolve('token-late')
    expect(await pending).toEqual({ ok: false, reason: 'failed', detail: 'session_changed' })
    expect(calls).toEqual([])
    expect(record()).toBeNull()
  })

  it('التفعيل بلا جلسة: لا سؤال إذن ولا تسجيل', async () => {
    signOut()
    expect(await enableWebPush('a1')).toEqual({ ok: false, reason: 'failed', detail: 'no_session' })
    expect(requestPermission).not.toHaveBeenCalled()
    expect(calls).toEqual([])
  })

  it('التفعيل يُبطل مزامنةً معلّقة: لا تكتب فوقه ولا تلغي رمزه', async () => {
    saveRecord('a1', 'token-a1')
    const held = holdGetToken()
    const pA = syncWebPush('a1')
    await flush()
    expect(await enableWebPush('a1')).toEqual({ ok: true, token: 'token-current' })

    held.resolve('token-late')
    await pA
    await flush()
    expect(calls).toEqual(['register:token-current@session-a1', 'unregister:token-a1@session-a1'])
    expect(record()).toEqual({ owner: 'a1', token: 'token-current' })
  })
})

describe('[SECURITY] كل تسجيلٍ إمّا مقصود أو مُتتبَّع حتى يُلغى', () => {
  /**
   * الخادم مُنمذَج: التسجيل يُفعّل الرمز لصاحب الجلسة، والإلغاء الناجح يعطّل صفّ
   * صاحبه وحده، والإلغاء الفاشل لا يغيّر شيئاً. فالحكم على الحالة النهائية — ما
   * بقي نشطاً على الخادم، وما ينتظر التنظيف، وما تقوله الواجهة — لا على النداءات وحدها.
   */
  const calls: string[] = []
  const server = new Map<string, string>()
  const session = () => useAuthStore.getState().token
  const owner = () => useAuthStore.getState().user?.id ?? null
  const active = () => [...server.keys()].sort()
  const signIn = (id: string, token = `session-${id}`) => useAuthStore.setState({ token, user: { id } as never })
  const signOut = () => useAuthStore.setState({ token: null, user: null })
  const OK = { registered: true, created: true }
  const releases: Array<() => void> = []
  const unhandled: unknown[] = []
  const onUnhandled = (reason: unknown) => unhandled.push(reason)
  // `process` خارج أنواع اللوحة (متصفّح) — الاختبارات تعمل تحت Node.
  const nodeProcess = (globalThis as unknown as {
    process: { on(event: string, fn: (reason: unknown) => void): void; off(event: string, fn: (reason: unknown) => void): void }
  }).process

  function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((r) => (resolve = r))
    return { promise, resolve }
  }

  function holdGetToken() {
    const held = deferred<string>()
    fcm.getToken.mockImplementationOnce(() => held.promise)
    releases.push(() => held.resolve('token-abandoned'))
    return held
  }

  /** التسجيل التالي يُطبَّق على الخادم عند وصوله، ويتأخّر ردّه حتى يُحرَّر. */
  function holdRegister() {
    const held = deferred<typeof OK>()
    api.registerAdminDevice.mockImplementationOnce((token: string) => {
      calls.push(`register:${token}@${session()}`)
      server.set(token, owner()!)
      return held.promise
    })
    releases.push(() => held.resolve(OK))
    return held
  }

  /** الإلغاء التالي لا يُطبَّق ولا يُردّ عليه حتى يُحرَّر. */
  function holdUnregister() {
    const held = deferred<void>()
    api.unregisterAdminDevice.mockImplementationOnce(async (token: string) => {
      calls.push(`unregister:${token}@${session()}`)
      const who = owner()
      await held.promise
      if (server.get(token) === who) server.delete(token)
      return { unregistered: true }
    })
    releases.push(() => held.resolve())
    return held
  }

  function failUnregisterOnce(error: Error) {
    api.unregisterAdminDevice.mockImplementationOnce(async (token: string) => {
      calls.push(`unregister-failed:${token}@${session()}`)
      throw error
    })
  }

  beforeEach(() => {
    calls.length = 0
    server.clear()
    unhandled.length = 0
    nodeProcess.on('unhandledRejection', onUnhandled)
    api.registerAdminDevice.mockImplementation(async (token: string) => {
      calls.push(`register:${token}@${session()}`)
      server.set(token, owner()!)
      return OK
    })
    api.unregisterAdminDevice.mockImplementation(async (token: string) => {
      calls.push(`unregister:${token}@${session()}`)
      if (server.get(token) === owner()) server.delete(token)
      return { unregistered: true }
    })
    subscription!.unsubscribe.mockImplementation(async () => {
      calls.push(`unsubscribe@${session()}`)
      return true
    })
  })

  afterEach(async () => {
    releases.splice(0).forEach((release) => release())
    await flush()
    await flush()
    nodeProcess.off('unhandledRejection', onUnhandled)
    // لا عمل معلّق بعد الاستقرار — لا تسجيل ولا إلغاء يبقى بلا صاحب.
    expect(webPushIdle()).toBe(true)
    expect(unhandled).toEqual([])
  })

  it('تسجيلٌ ثم خروج: لا يبقى رمزٌ نشط ولا تنظيفٌ معلّق', async () => {
    saveRecord('a1', 'token-a1')
    server.set('token-a1', 'a1')
    await disableWebPush()
    expect(active()).toEqual([])
    expect(pendingWebPushCleanup()).toEqual([])
    expect(record()).toBeNull()
    expect(calls).toEqual(['unregister:token-a1@session-a1', 'unsubscribe@session-a1'])
    expect(webPushEnabledFor('a1')).toBe(false)
  })

  it.each([
    ['خطأ شبكة', new ApiError('تعذّر الاتصال', 0)],
    ['خطأ HTTP', new ApiError('خطأ في الخادم', 500, 'INTERNAL')],
    ['انتهاء المهلة (طلبٌ أُجهض)', new ApiError('انتهت مهلة الاتصال بالخادم — أعد المحاولة', 0)],
  ])('فشل أول إلغاءٍ عند الخروج (%s): الفشل ظاهر، والرمز يبقى مُتتبَّعاً، وجلسة صاحبه التالية تنظّفه', async (_label, error) => {
    saveRecord('a1', 'token-a1')
    server.set('token-a1', 'a1')
    const registered = holdRegister()
    const pA = syncWebPush('a1')
    await flush()
    expect(active()).toEqual(['token-a1', 'token-current'])

    failUnregisterOnce(error)
    const disabling = disableWebPush()
    registered.resolve(OK)
    await expect(disabling).rejects.toBe(error)
    await pA
    await flush()
    // الرمز الذي سُجّل لحظتها أُلغي؛ الذي فشل إلغاؤه باقٍ نشطاً — لكنه مُتتبَّع لا منسيّ.
    expect(active()).toEqual(['token-a1'])
    expect(pendingWebPushCleanup()).toEqual([{ owner: 'a1', token: 'token-a1' }])
    expect(record()).toBeNull()
    expect(calls).toContain('unsubscribe@session-a1')
    expect(webPushEnabledFor('a1')).toBe(false)

    // جلسة المسؤول نفسه التالية: التنظيف أولاً، ولا نيّة تُستعاد بعد خروجٍ صريح.
    signIn('a1', 'session-a1-next')
    await syncWebPush('a1')
    expect(active()).toEqual([])
    expect(pendingWebPushCleanup()).toEqual([])
    expect(calls.at(-1)).toBe('unregister:token-a1@session-a1-next')
    expect(calls.filter((c) => c.startsWith('register:'))).toEqual(['register:token-current@session-a1'])
  })

  it('التنظيف لا يتكرّر بلا حدّ: محاولةٌ واحدة لكل مزامنة، والفشل يُبقيه معلّقاً', async () => {
    saveRecord('a1', 'token-a1')
    server.set('token-a1', 'a1')
    failUnregisterOnce(new ApiError('offline', 0))
    await expect(disableWebPush()).rejects.toBeInstanceOf(ApiError)
    failUnregisterOnce(new ApiError('offline', 0))
    await syncWebPush('a1')
    expect(calls.filter((c) => c.includes('token-a1'))).toEqual([
      'unregister-failed:token-a1@session-a1',
      'unregister-failed:token-a1@session-a1',
    ])
    expect(pendingWebPushCleanup()).toEqual([{ owner: 'a1', token: 'token-a1' }])
    await syncWebPush('a1')
    expect(pendingWebPushCleanup()).toEqual([])
    expect(active()).toEqual([])
  })

  it('رمزٌ ينتظر التنظيف ثم صار مقصوداً من جديد: لا يُلغى من تحت النيّة الأحدث', async () => {
    saveRecord('a1', 'token-current')
    server.set('token-current', 'a1')
    failUnregisterOnce(new ApiError('offline', 0))
    await expect(disableWebPush()).rejects.toBeInstanceOf(ApiError)
    expect(pendingWebPushCleanup()).toEqual([{ owner: 'a1', token: 'token-current' }])

    // المتصفّح أعاد الرمز نفسه (الاشتراك لم يُلغَ عند مصدره): التفعيل يجعله مقصوداً.
    expect(await enableWebPush('a1')).toEqual({ ok: true, token: 'token-current' })
    expect(pendingWebPushCleanup()).toEqual([])
    await syncWebPush('a1')
    expect(calls.filter((c) => c.startsWith('unregister:token-current'))).toEqual([])
    expect(active()).toEqual(['token-current'])
    expect(record()).toEqual({ owner: 'a1', token: 'token-current' })
  })

  it('إيقافٌ يتأخّر إلغاؤه ثم تفعيلٌ للرمز نفسه: الخادم يرى الإلغاء أولاً، والاشتراك لا يُلغى من تحت التفعيل', async () => {
    saveRecord('a1', 'token-current')
    server.set('token-current', 'a1')
    const unregistered = holdUnregister()
    const disabling = disableWebPush()
    await flush()
    const enabling = enableWebPush('a1')
    await flush()
    // التسجيل ينتظر الإلغاء الجاري للرمز نفسه — وإلا عطّله الإلغاءُ المتأخّر.
    expect(calls).toEqual(['unregister:token-current@session-a1'])

    unregistered.resolve()
    await disabling
    expect(await enabling).toEqual({ ok: true, token: 'token-current' })
    expect(calls).toEqual(['unregister:token-current@session-a1', 'register:token-current@session-a1'])
    expect(active()).toEqual(['token-current'])
    expect(record()).toEqual({ owner: 'a1', token: 'token-current' })
    expect(webPushEnabledFor('a1')).toBe(true)
  })

  it('إيقافٌ ينتظر تسجيلاً جارياً وتفعيلٌ أحدث يكتمل في أثنائه: الإيقاف القديم لا يلغي الرمز المقصود الآن', async () => {
    saveRecord('a1', 'token-current')
    server.set('token-current', 'a1')
    const syncRegister = holdRegister()
    const pSync = syncWebPush('a1')
    await flush()
    const disabling = disableWebPush() // يستولي على تسجيل المزامنة وينتظره
    await flush()
    expect(await enableWebPush('a1')).toEqual({ ok: true, token: 'token-current' })

    syncRegister.resolve(OK)
    await disabling
    await pSync
    await flush()
    expect(calls.filter((c) => c.startsWith('unregister:'))).toEqual([])
    expect(calls).not.toContain('unsubscribe@session-a1')
    expect(active()).toEqual(['token-current'])
    expect(record()).toEqual({ owner: 'a1', token: 'token-current' })
    expect(webPushEnabledFor('a1')).toBe(true)
  })

  it.each(['T1 أولاً', 'T2 أولاً'])('تسجيلان متداخلان برمزين مختلفين (%s): يبقى المقصود وحده، والآخر يُلغى مرّة', async (order) => {
    saveRecord('a1', null)
    fcm.getToken.mockResolvedValueOnce('token-T1').mockResolvedValueOnce('token-T2')
    const first = holdRegister()
    const pSync = syncWebPush('a1')
    await flush()
    const second = holdRegister()
    const pEnable = enableWebPush('a1')
    await flush()
    expect(active()).toEqual(['token-T1', 'token-T2'])

    const [a, b] = order === 'T1 أولاً' ? [first, second] : [second, first]
    a.resolve(OK)
    await flush()
    b.resolve(OK)
    await pSync
    expect(await pEnable).toEqual({ ok: true, token: 'token-T2' })
    await flush()
    expect(active()).toEqual(['token-T2'])
    expect(record()).toEqual({ owner: 'a1', token: 'token-T2' })
    expect(calls.filter((c) => c.startsWith('unregister:'))).toEqual(['unregister:token-T1@session-a1'])
    expect(pendingWebPushCleanup()).toEqual([])
  })

  it.each(['المزامنة أولاً', 'التفعيل أولاً'])('تسجيلان متداخلان للرمز نفسه (%s): لا يُلغي أحدهما الآخر', async (order) => {
    saveRecord('a1', null)
    const first = holdRegister()
    const pSync = syncWebPush('a1')
    await flush()
    const second = holdRegister()
    const pEnable = enableWebPush('a1')
    await flush()

    const [a, b] = order === 'المزامنة أولاً' ? [first, second] : [second, first]
    a.resolve(OK)
    await flush()
    b.resolve(OK)
    await pSync
    expect(await pEnable).toEqual({ ok: true, token: 'token-current' })
    await flush()
    expect(calls.filter((c) => c.startsWith('unregister:'))).toEqual([])
    expect(active()).toEqual(['token-current'])
    expect(record()).toEqual({ owner: 'a1', token: 'token-current' })
  })

  it('تبدّل الرمز وجلسةٌ جديدة للمسؤول نفسه والتسجيل القديم معلّق: القديم يُلغى حين يستقرّ، والجديد يبقى', async () => {
    saveRecord('a1', 'token-old')
    server.set('token-old', 'a1')
    fcm.getToken.mockResolvedValueOnce('token-T1').mockResolvedValueOnce('token-T2')
    const late = holdRegister()
    const pOld = syncWebPush('a1')
    await flush()
    signIn('a1', 'session-a1-renewed')
    await syncWebPush('a1')
    expect(record()).toEqual({ owner: 'a1', token: 'token-T2' })

    late.resolve(OK)
    await pOld
    await flush()
    expect(active()).toEqual(['token-T2'])
    expect(calls.filter((c) => c.startsWith('unregister:'))).toEqual([
      'unregister:token-old@session-a1-renewed',
      'unregister:token-T1@session-a1-renewed',
    ])
    expect(record()).toEqual({ owner: 'a1', token: 'token-T2' })
  })

  it('إذنٌ سُحب وتسجيلُ الرمز نفسه جارٍ لعمليةٍ أقدم: إلغاءٌ واحد بعد استقرار التسجيل، لا سباق معه', async () => {
    saveRecord('a1', 'token-current')
    server.set('token-current', 'a1')
    const registered = holdRegister()
    const pOld = syncWebPush('a1')
    await flush()
    permission = 'denied'
    signIn('a1', 'session-a1-renewed')
    await syncWebPush('a1')
    expect(record()).toBeNull()
    // لا إلغاء والتسجيل في الطريق — وإلا وصل الخادمَ قبله فبقي الرمز نشطاً.
    expect(calls.filter((c) => c.startsWith('unregister:'))).toEqual([])

    registered.resolve(OK)
    await pOld
    await flush()
    expect(calls.filter((c) => c.startsWith('unregister:'))).toEqual(['unregister:token-current@session-a1-renewed'])
    expect(active()).toEqual([])
  })

  it('رفض الإذن والمزامنة تنتظر الرمز: لا نجاح مُدّعى، والجهاز يُلغى على الخادم والمتصفّح', async () => {
    saveRecord('a1', 'token-a1')
    server.set('token-a1', 'a1')
    const held = holdGetToken()
    const pSync = syncWebPush('a1')
    await flush()
    permission = 'denied'
    expect(await enableWebPush('a1')).toEqual({ ok: false, reason: 'denied' })
    expect(record()).toBeNull()
    expect(active()).toEqual([])
    expect(calls).toEqual(['unregister:token-a1@session-a1', 'unsubscribe@session-a1'])
    expect(webPushEnabledFor('a1')).toBe(false)

    held.resolve('token-late')
    await pSync
    await flush()
    expect(calls.filter((c) => c.startsWith('register:'))).toEqual([])
    expect(record()).toBeNull()
  })

  it('رفض الإذن وتسجيل المزامنة معلّق: الرمزان لا يبقيان نشطين', async () => {
    saveRecord('a1', 'token-a1')
    server.set('token-a1', 'a1')
    const registered = holdRegister()
    const pSync = syncWebPush('a1')
    await flush()
    permission = 'denied'
    expect(await enableWebPush('a1')).toEqual({ ok: false, reason: 'denied' })
    registered.resolve(OK)
    await pSync
    await flush()
    expect(active()).toEqual([])
    expect(record()).toBeNull()
    expect(pendingWebPushCleanup()).toEqual([])
  })

  it('الجلسة تنتهي (٤٠١) والتسجيل معلّق: لا نداء بلا جلسة، والرمز يُتتبَّع لجلسة صاحبه التالية', async () => {
    saveRecord('a1', 'token-a1')
    server.set('token-a1', 'a1')
    const stop = watchSessionForWebPush()
    try {
      fcm.getToken.mockResolvedValueOnce('token-T1')
      const registered = holdRegister()
      const pA = syncWebPush('a1')
      await flush()
      signOut()
      await flush()
      registered.resolve(OK)
      await pA
      await flush()
      expect(calls.filter((c) => c.endsWith('@null') && !c.startsWith('unsubscribe'))).toEqual([])
      expect(pendingWebPushCleanup()).toEqual([{ owner: 'a1', token: 'token-T1' }])
      expect(record()).toEqual({ owner: 'a1', token: null })

      signIn('a1', 'session-a1-next')
      await syncWebPush('a1')
      expect(pendingWebPushCleanup()).toEqual([])
      // token-T1 (التسجيل المعلّق) أُلغي. token-a1 لم يُلغَ: انتهت جلسته بلا خروجٍ صريح فلا
      // نداء ممكن — والخادم يقصره على انتهاء تلك الجلسة (٠٨٢)؛ حدٌّ معروف لا تنظيفٌ منسيّ.
      expect(active()).toEqual(['token-a1', 'token-current'])
      expect(record()).toEqual({ owner: 'a1', token: 'token-current' })
    } finally {
      stop()
    }
  })

  it('تنظيفٌ معلّق لمسؤولٍ آخر لا يُرسَل بجلسة غيره', async () => {
    saveRecord('a1', 'token-a1')
    server.set('token-a1', 'a1')
    failUnregisterOnce(new ApiError('offline', 0))
    await expect(disableWebPush()).rejects.toBeInstanceOf(ApiError)
    signIn('b2')
    await syncWebPush('b2')
    expect(calls.filter((c) => c.endsWith('@session-b2'))).toEqual([])
    expect(pendingWebPushCleanup()).toEqual([{ owner: 'a1', token: 'token-a1' }])
  })

  it('إيقافان متتاليان أو متزامنان: لا خطأ، ولا يبقى شيء', async () => {
    saveRecord('a1', 'token-a1')
    server.set('token-a1', 'a1')
    await Promise.all([disableWebPush(), disableWebPush()])
    await disableWebPush()
    expect(active()).toEqual([])
    expect(pendingWebPushCleanup()).toEqual([])
    expect(record()).toBeNull()
  })
})
