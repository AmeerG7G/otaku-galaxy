import { describe, expect, it, vi } from 'vitest'
// الملف نفسه الذي يخدمه Vite من `public/` — نصّاً، فيُنفَّذ كما يُنفَّذ في المتصفّح.
import source from '../../public/admin-push-sw.js?raw'

/**
 * عامل خدمة إشعارات المسؤول (`public/admin-push-sw.js`) — يُنفَّذ الملف نفسه
 * على `self` مزدوج.
 *
 * [FCM Gate 2] حين يبدّل المتصفّح اشتراك Web Push يموت رمز FCM الذي يحمله
 * الخادم. عامل الخدمة لا يملك الجلسة، فيطلب من ألواح اللوحة المفتوحة إعادة
 * المزامنة (`onWebPushResync` → `syncWebPush`).
 */

function loadWorker(windows: Array<{ postMessage: ReturnType<typeof vi.fn> }>) {
  const listeners = new Map<string, (event: unknown) => void>()
  const self = {
    addEventListener: (type: string, listener: (event: unknown) => void) => listeners.set(type, listener),
    skipWaiting: vi.fn(),
    clients: { matchAll: vi.fn(async () => windows), claim: vi.fn() },
    registration: { showNotification: vi.fn() },
    location: { origin: 'https://admin.example.test' },
  }
  new Function('self', source)(self)
  return { listeners, self }
}

async function dispatch(listener: (event: unknown) => void) {
  let pending: Promise<unknown> = Promise.resolve()
  listener({ waitUntil: (promise: Promise<unknown>) => (pending = promise) })
  await pending
}

describe('admin-push-sw.js — اشتراكٌ تبدّل', () => {
  it('كل لوحةٍ مفتوحة تُطلب منها إعادة المزامنة', async () => {
    const windows = [{ postMessage: vi.fn() }, { postMessage: vi.fn() }]
    const { listeners, self } = loadWorker(windows)
    const listener = listeners.get('pushsubscriptionchange')
    expect(listener).toBeDefined()
    await dispatch(listener!)
    expect(self.clients.matchAll).toHaveBeenCalledWith({ type: 'window', includeUncontrolled: true })
    for (const w of windows) expect(w.postMessage).toHaveBeenCalledWith({ type: 'admin-push-resync' })
    // لا إشعار نظامٍ لحدثٍ داخلي.
    expect(self.registration.showNotification).not.toHaveBeenCalled()
  })

  it('لا لوحة مفتوحة: لا شيء يُرسل ولا خطأ — الجلسة التالية تجدّد الرمز', async () => {
    const { listeners } = loadWorker([])
    await expect(dispatch(listeners.get('pushsubscriptionchange')!)).resolves.toBeUndefined()
  })
})
