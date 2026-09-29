import { registerAdminDevice, unregisterAdminDevice } from '../api/adminAccountsApi'

/**
 * إشعارات هاتف المسؤول عبر Web Push وFCM (STEP 64 §14) — مجاني، بلا خدمة
 * مدفوعة ولا رسائل SMS.
 *
 * [CRITICAL] إعداد Firebase للويب من متغيّرات البناء (`VITE_FIREBASE_*`) لا من
 * الكود: قيمٌ لكل بيئة (dev/staging/prod) تُضبط حيث تُبنى اللوحة. غيابها يعني
 * «غير مُعدّ» — الزرّ يقول ذلك ولا شيء ينكسر. هذه القيم ليست أسراراً (يراها
 * كل متصفّح يفتح اللوحة)؛ السرّ الوحيد (مفتاح حساب الخدمة) على الخادم وحده.
 *
 * مكتبة Firebase تُحمَّل عند الطلب فقط (`import()`)، فلا تثقل اللوحة لمن لا
 * يفعّل الإشعارات. عامل الخدمة (`/admin-push-sw.js`) لا يحتاجها أصلاً.
 */

const env = import.meta.env
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
}
const vapidKey = env.VITE_FIREBASE_VAPID_KEY as string | undefined

const TOKEN_KEY = 'otaku-admin-push-token'
const SW_URL = '/admin-push-sw.js'

/** هل بُنيت اللوحة بإعداد Firebase للويب؟ */
export function webPushConfigured(): boolean {
  return Boolean(config.apiKey && config.projectId && config.messagingSenderId && config.appId && vapidKey)
}

/**
 * هل يدعم هذا المتصفّح الإشعارات؟ iPhone يدعمها فقط للّوحة المثبّتة على
 * الشاشة الرئيسية (iOS 16.4+) — خارجها لا `PushManager`.
 */
export function webPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function storedToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

function storeToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // تخزينٌ محجوب: التفعيل يعمل، ويُطلب الرمز من جديد في المرة القادمة.
  }
}

async function messaging() {
  const [{ initializeApp, getApps }, messagingModule] = await Promise.all([
    import('firebase/app'),
    import('firebase/messaging'),
  ])
  const app = getApps()[0] ?? initializeApp(config as Required<typeof config>)
  return { module: messagingModule, instance: messagingModule.getMessaging(app) }
}

export type EnableResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'not_configured' | 'unsupported' | 'denied' | 'failed'; detail?: string }

/**
 * تفعيل الإشعارات على هذا الجهاز: إذن المتصفّح، ثم عامل الخدمة، ثم رمز FCM،
 * ثم تسجيله للمسؤول الحالي على الخادم (`POST /admin/devices`).
 */
export async function enableWebPush(): Promise<EnableResult> {
  if (!webPushConfigured()) return { ok: false, reason: 'not_configured' }
  if (!webPushSupported()) return { ok: false, reason: 'unsupported' }
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { ok: false, reason: 'denied' }
  try {
    const registration = await navigator.serviceWorker.register(SW_URL, { scope: '/' })
    const { module, instance } = await messaging()
    const token = await module.getToken(instance, { vapidKey, serviceWorkerRegistration: registration })
    if (!token) return { ok: false, reason: 'failed', detail: 'no_token' }
    await registerAdminDevice(token)
    storeToken(token)
    return { ok: true, token }
  } catch (error) {
    return { ok: false, reason: 'failed', detail: error instanceof Error ? error.message : String(error) }
  }
}

/** إيقافها على هذا الجهاز: يُلغى الرمز عند Firebase ويُعطَّل على الخادم. */
export async function disableWebPush(): Promise<void> {
  const token = storedToken()
  storeToken(null)
  if (!token) return
  try {
    await unregisterAdminDevice(token)
  } finally {
    if (webPushConfigured()) {
      try {
        const { module, instance } = await messaging()
        await module.deleteToken(instance)
      } catch {
        // الخادم عطّل الرمز فعلاً؛ فشلُ الحذف عند Firebase لا يعيد تفعيله.
      }
    }
  }
}

/**
 * يعيد تسجيل رمز هذا المتصفّح المحفوظ مع الجلسة الحالية — عند بدء الجلسة وبعد
 * تغيير كلمة المرور.
 *
 * [SECURITY] الخادم يعطّل أجهزة المسؤول كلّها حين تسقط جلساته (تغيير كلمة
 * المرور، إعادة تعيينها، الإيقاف)، فلا يبقى متصفّحٌ سُجّل بتوكنٍ مسروق يستقبل
 * بيانات الزبائن. المتصفّح الشرعي يستعيد إشعاراته هنا بجلسته الجديدة؛ متصفّحٌ
 * بلا جلسة صالحة لا يستطيع. فشلُ الشبكة صامت: يُعاد في الجلسة التالية.
 */
export async function resyncWebPush(): Promise<void> {
  const token = storedToken()
  if (!token || !webPushConfigured()) return
  try {
    await registerAdminDevice(token)
  } catch {
    // لا شيء — انظر أعلاه.
  }
}

export interface AdminPushData {
  title?: string
  body?: string
  url?: string
  event?: string
}

/**
 * رسائل اللوحة المفتوحة: عامل الخدمة يسلّمها للصفحة المرئية بدل إشعار النظام.
 * يعيد دالة إلغاء الاستماع.
 */
export function onForegroundPush(handler: (data: AdminPushData) => void): () => void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return () => {}
  const listener = (event: MessageEvent) => {
    if (event.data?.type === 'admin-push') handler(event.data.data as AdminPushData)
  }
  navigator.serviceWorker.addEventListener('message', listener)
  return () => navigator.serviceWorker.removeEventListener('message', listener)
}
