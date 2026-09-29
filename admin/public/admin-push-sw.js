/*
 * عامل خدمة إشعارات هاتف المسؤول (STEP 64 §14).
 *
 * FCM يوصل رسائل الويب عبر Web Push القياسي، فلا حاجة هنا لمكتبة Firebase ولا
 * لتحميل سكربتات من خارج اللوحة. الخادم يرسل للمسؤول رسائل **بيانات**
 * (`dataOnly`): العنوان والنصّ ومسار اللوحة داخل `data`.
 *
 * - اللوحة مفتوحة ومرئية: تُسلَّم الرسالة للصفحة (تعرضها بتنبيهٍ داخلها) ولا
 *   يُكرَّر إشعار النظام فوقها.
 * - غير ذلك (خلفية، شاشة مقفلة، اللوحة مغلقة): إشعار نظام، والنقر يفتح مسار
 *   الحدث في اللوحة (الطلب، طلبات الحساب، طلبات التوفر).
 */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

function readPayload(event) {
  try {
    const json = event.data ? event.data.json() : {}
    return json.data || json
  } catch (_) {
    return {}
  }
}

/** مسارٌ داخل اللوحة فقط — لا رابط خارجي يُفتح من إشعار. */
function safePath(url) {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : '/'
}

self.addEventListener('push', (event) => {
  const data = readPayload(event)
  const title = data.title || 'لوحة مجرة الأوتاكو'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const visible = windows.filter((w) => w.visibilityState === 'visible')
      if (visible.length > 0) {
        visible.forEach((w) => w.postMessage({ type: 'admin-push', data }))
        return undefined
      }
      return self.registration.showNotification(title, {
        body: data.body || '',
        icon: '/otaku-square-mark.png',
        badge: '/otaku-square-mark.png',
        dir: 'rtl',
        lang: 'ar',
        tag: data.event ? `${data.event}:${data.orderId || data.requestId || data.productId || ''}` : undefined,
        data: { url: safePath(data.url) },
      })
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(safePath(event.notification.data && event.notification.data.url), self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if (w.url.startsWith(self.location.origin)) {
          return w.focus().then(() => w.navigate(target))
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})
