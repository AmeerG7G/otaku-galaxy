import { registerAdminDevice, unregisterAdminDevice } from '../api/adminAccountsApi'
import { useAuthStore } from '../stores/authStore'

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
 *
 * ═══ دورة حياة الرمز (FCM Gate 2) ═══
 *
 * [SECURITY] إشعارات المسؤول تحمل اسم الزبون وهاتفه ومبلغ طلبه، فالرمز المحفوظ
 * هنا **لمسؤولٍ بعينه** (`owner`) ولا يُنقل إلى غيره بصمت:
 * - **بداية كل جلسة** (`syncWebPush`): رمزٌ جديد من Firebase (يتبدّل حين يبدّل
 *   المتصفّح اشتراكه أو يمضي أسبوع)، يُسجَّل بهذه الجلسة — فالخادم يربطه بموعد
 *   انتهائها (هجرة ٠٨٢) — ويُلغى القديم إن تبدّل. إذنٌ سُحب من المتصفّح ⇒ يُلغى
 *   الجهاز. رمز مسؤولٍ آخر ⇒ يُمحى ولا يُسجَّل لهذا.
 * - **نهاية الجلسة بأي طريق** (٤٠١، إيقاف، انتهاء — `watchSessionForWebPush`):
 *   يُلغى اشتراك هذا المتصفّح فوراً. لا نداء للخادم (الجلسة سقطت فيرتدّ)؛
 *   الخادم نفسه لا يرسل لجهازٍ جلستُه منتهية. تبقى «نيّة» المسؤول فقط: جلسته
 *   التالية في هذا المتصفّح تستعيد إشعاراته بلا سؤال إن بقي الإذن ممنوحاً.
 * - **الخروج الصريح** (`disableWebPush`): يُلغى على الخادم والجلسة صالحة، ثم
 *   الاشتراك، ولا تبقى نيّة — من يستعمل المتصفّح بعدك لا يرثها.
 */

const env = import.meta.env
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
}
const vapidKey = env.VITE_FIREBASE_VAPID_KEY as string | undefined

/** `{ owner, token }` — `token: null` = نيّةٌ بلا رمز (جلسةٌ انتهت والإشعارات مفعّلة). */
const RECORD_KEY = 'otaku-admin-push'
/** الصيغة القديمة: رمزٌ بلا صاحب — لا يُعرف لمن هو فلا يُنقل لأحد. */
const LEGACY_TOKEN_KEY = 'otaku-admin-push-token'
const SW_URL = '/admin-push-sw.js'
const SW_SCOPE = '/'

interface PushRecord {
  owner: string
  token: string | null
}

function readRecord(): PushRecord | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECORD_KEY) ?? 'null') as Partial<PushRecord> | null
    if (!parsed || typeof parsed.owner !== 'string' || !parsed.owner) return null
    return { owner: parsed.owner, token: typeof parsed.token === 'string' && parsed.token ? parsed.token : null }
  } catch {
    return null
  }
}

function writeRecord(record: PushRecord | null) {
  try {
    if (record) localStorage.setItem(RECORD_KEY, JSON.stringify(record))
    else localStorage.removeItem(RECORD_KEY)
  } catch {
    // تخزينٌ محجوب: التفعيل يعمل، ويُطلب الرمز من جديد في المرة القادمة.
  }
}

function takeLegacyToken(): string | null {
  try {
    const token = localStorage.getItem(LEGACY_TOKEN_KEY)
    localStorage.removeItem(LEGACY_TOKEN_KEY)
    return token
  } catch {
    return null
  }
}

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

/** يستقبل المتصفّح الآن؟ `granted` وحده — `default` (أُعيد إلى «اسأل») و`denied` لا. */
function permissionGranted(): boolean {
  return webPushSupported() && Notification.permission === 'granted'
}

/**
 * هل الإشعارات مفعّلة **فعلاً** لهذا المسؤول على هذا المتصفّح؟ رمزٌ محفوظ له،
 * والمتصفّح ما يزال يملك الإذن — لا تقول الواجهة «مفعّلة» لمتصفّحٍ لا يستقبل.
 */
export function webPushEnabledFor(ownerId: string | null | undefined): boolean {
  const record = readRecord()
  return Boolean(ownerId && record?.owner === ownerId && record.token && permissionGranted())
}

async function messaging() {
  const [{ initializeApp, getApps }, messagingModule] = await Promise.all([
    import('firebase/app'),
    import('firebase/messaging'),
  ])
  const app = getApps()[0] ?? initializeApp(config as Required<typeof config>)
  return { module: messagingModule, instance: messagingModule.getMessaging(app) }
}

/** رمز FCM الحاليّ لهذا المتصفّح — Firebase يجدّده إن تبدّل الاشتراك أو قدُم. */
async function currentToken(): Promise<string | null> {
  const registration = await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE })
  const { module, instance } = await messaging()
  const token = await module.getToken(instance, { vapidKey, serviceWorkerRegistration: registration })
  return token || null
}

/**
 * يُلغي اشتراك Web Push لهذا المتصفّح عند مصدره — فلا يصل شيءٌ حتى لو أرسل أحد.
 *
 * [CRITICAL] لا `deleteToken` من Firebase: في صفحةٍ لم تستدعِ `getToken` بعد
 * (كل تحميلٍ جديد) يسجّل عاملَ خدمته الافتراضي `/firebase-messaging-sw.js` —
 * غير موجودٍ هنا — فيرمي، ويبقى الاشتراك حياً. عاملنا نحن يملك الاشتراك.
 */
async function unsubscribeThisBrowser(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  try {
    const registration = await navigator.serviceWorker.getRegistration(SW_SCOPE)
    const subscription = await registration?.pushManager.getSubscription()
    await subscription?.unsubscribe()
  } catch {
    // لا اشتراك أو رفض المتصفّح: الخادم لا يرسل لجلسةٍ منتهية أصلاً (٠٨٢).
  }
}

export type EnableResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'not_configured' | 'unsupported' | 'denied' | 'failed'; detail?: string }

/**
 * تفعيل الإشعارات على هذا الجهاز: إذن المتصفّح، ثم عامل الخدمة، ثم رمز FCM،
 * ثم تسجيله للمسؤول الحالي على الخادم (`POST /admin/devices`).
 */
export async function enableWebPush(ownerId: string): Promise<EnableResult> {
  if (!webPushConfigured()) return { ok: false, reason: 'not_configured' }
  if (!webPushSupported()) return { ok: false, reason: 'unsupported' }
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { ok: false, reason: 'denied' }
  try {
    const token = await currentToken()
    if (!token) return { ok: false, reason: 'failed', detail: 'no_token' }
    const previous = readRecord()
    await registerAdminDevice(token)
    // رمزه القديم (تبدّل) يُلغى؛ رمز غيره ليس له أن يلغيه (الخادم يقصره على صاحبه).
    if (previous?.owner === ownerId && previous.token && previous.token !== token) {
      await unregisterAdminDevice(previous.token).catch(() => undefined)
    }
    takeLegacyToken()
    writeRecord({ owner: ownerId, token })
    return { ok: true, token }
  } catch (error) {
    return { ok: false, reason: 'failed', detail: error instanceof Error ? error.message : String(error) }
  }
}

/** إيقافها على هذا الجهاز: يُعطَّل على الخادم ويُلغى اشتراك المتصفّح، ولا تبقى نيّة. */
export async function disableWebPush(): Promise<void> {
  const token = readRecord()?.token ?? takeLegacyToken()
  writeRecord(null)
  takeLegacyToken()
  try {
    if (token) await unregisterAdminDevice(token)
  } finally {
    await unsubscribeThisBrowser()
  }
}

let syncing: Promise<void> | null = null

/**
 * بداية جلسة (وبعد تغيير كلمة المرور، وحين يبدّل المتصفّح اشتراكه): يجدّد رمز
 * هذا المتصفّح ويربطه بالجلسة الحالية. فشلُ الشبكة صامت: يُعاد في الجلسة التالية.
 */
export function syncWebPush(ownerId: string | null | undefined): Promise<void> {
  if (!ownerId) return Promise.resolve()
  syncing ??= runSync(ownerId).finally(() => {
    syncing = null
  })
  return syncing
}

async function runSync(ownerId: string): Promise<void> {
  // صيغةٌ قديمة بلا صاحب: لا تُنقل لهذا المسؤول — يُعاد التفعيل مرّة.
  if (takeLegacyToken()) await unsubscribeThisBrowser()

  const record = readRecord()
  if (!record) return
  if (record.owner !== ownerId) {
    // [SECURITY] متصفّح مسؤولٍ آخر: لا يصير متصفّح هذا بصمت. جلسة ذاك هنا انتهت،
    // وجهازه على الخادم لا يستقبل بعد انتهائها (٠٨٢).
    writeRecord(null)
    await unsubscribeThisBrowser()
    return
  }
  if (!webPushConfigured()) return
  if (!permissionGranted()) {
    // سُحب الإذن (أو أُعيد إلى «اسأل»): المتصفّح لا يستقبل — يتوقّف الخادم أيضاً.
    writeRecord(null)
    if (record.token) await unregisterAdminDevice(record.token).catch(() => undefined)
    await unsubscribeThisBrowser()
    return
  }
  try {
    const token = await currentToken()
    if (!token) return
    // الجديد أولاً ثم إلغاء القديم — بلا فجوةٍ لا يستقبل فيها المتصفّح شيئاً.
    await registerAdminDevice(token)
    if (record.token && record.token !== token) {
      await unregisterAdminDevice(record.token).catch(() => undefined)
    }
    writeRecord({ owner: ownerId, token })
  } catch {
    // لا شيء — يُعاد في الجلسة التالية.
  }
}

/**
 * انتهت الجلسة دون خروجٍ صريح (٤٠١، إيقاف، توكن منتهٍ): يُلغى اشتراك المتصفّح
 * فوراً، وتبقى نيّة المسؤول لجلسته التالية.
 *
 * [CRITICAL] الاشتراك يُلغى **قبل** تعديل السجلّ: صفحةٌ تُغادَر في منتصف ذلك
 * (الـ٤٠١ ينقل إلى صفحة الدخول) تُبقي الرمز محفوظاً فيعيد التحميلُ التالي الإلغاء.
 */
export async function endWebPushSession(): Promise<void> {
  const record = readRecord()
  const legacy = takeLegacyToken()
  if (!record?.token && !legacy) return
  await unsubscribeThisBrowser()
  writeRecord(record ? { owner: record.owner, token: null } : null)
}

/**
 * يراقب الجلسة: كل انتقالٍ من «مسجَّل» إلى «لا جلسة» — مهما كان مصدره — ينهي
 * إشعارات هذا المتصفّح. ويُكمل عند الإقلاع تنظيفاً لم يكتمل (جلسةٌ سقطت والصفحة
 * تُغادَر). يُستدعى مرّة في `main.tsx`؛ يعيد دالة إلغاء المراقبة.
 */
export function watchSessionForWebPush(store: typeof useAuthStore = useAuthStore): () => void {
  if (!store.getState().token) void endWebPushSession()
  return store.subscribe((state, previous) => {
    if (previous.token && !state.token) void endWebPushSession()
  })
}

export interface AdminPushData {
  title?: string
  body?: string
  url?: string
  event?: string
}

function onWorkerMessage(type: string, handler: (data: unknown) => void): () => void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return () => {}
  const listener = (event: MessageEvent) => {
    if (event.data?.type === type) handler(event.data.data)
  }
  navigator.serviceWorker.addEventListener('message', listener)
  return () => navigator.serviceWorker.removeEventListener('message', listener)
}

/**
 * رسائل اللوحة المفتوحة: عامل الخدمة يسلّمها للصفحة المرئية بدل إشعار النظام.
 * يعيد دالة إلغاء الاستماع.
 */
export function onForegroundPush(handler: (data: AdminPushData) => void): () => void {
  return onWorkerMessage('admin-push', (data) => handler(data as AdminPushData))
}

/** المتصفّح بدّل اشتراكه (`pushsubscriptionchange` في عامل الخدمة) — أعد المزامنة. */
export function onWebPushResync(handler: () => void): () => void {
  return onWorkerMessage('admin-push-resync', () => handler())
}
