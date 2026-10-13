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

/**
 * ═══ كل عمليةٍ لجلستها (سباق تبدّل الجلسة) ═══
 *
 * [SECURITY] رمز FCM قد يتأخّر ثوانيَ، وفي أثنائها قد تنتهي جلسة A ويدخل B. كل
 * عمليةٍ تحمل «تذكرة» جلستها (التوكن نفسه + صاحبه + `epoch`)، وتتحقّق منها
 * **بلا انتظارٍ بين التحقّق والأثر** قبل كل تسجيلٍ أو إلغاءٍ أو كتابة سجلّ.
 * تذكرةٌ قديمة ⇒ تتوقّف بلا أثر: العميل يرسل توكن الجلسة **الحالية** عند
 * الإرسال، فطلبٌ متأخّر من A كان يسجّل رمزه بجلسة B ويعيد سجلّه بعد خروجه.
 * `epoch` يتقدّم مع كل فعلٍ صريح (تفعيل، إيقاف، نهاية جلسة) — فالأحدث يغلب
 * ولو في الجلسة نفسها. `setUser` (تحديث الملفّ) لا يمسّ التذكرة.
 */
interface SessionTicket {
  owner: string
  session: string
  epoch: number
}

let epoch = 0

function ticketFor(ownerId: string): SessionTicket | null {
  const { token, user } = useAuthStore.getState()
  if (!token || user?.id !== ownerId) return null
  return { owner: ownerId, session: token, epoch }
}

function current(ticket: SessionTicket): boolean {
  const { token, user } = useAuthStore.getState()
  return token === ticket.session && user?.id === ticket.owner && epoch === ticket.epoch
}

/**
 * ═══ كل تسجيلٍ إمّا مقصود أو مُتتبَّع حتى يُلغى ═══
 *
 * [SECURITY] لا خروج من الخادم: توكن الجلسة يبقى صالحاً حتى انتهائه، فجهازٌ
 * سُجّل ولم يُلغَ يستقبل أسماء الزبائن وأرقامهم أياماً. كل رمزٍ أرسله هذا
 * المتصفّح للتسجيل هو في كل لحظة واحدٌ من: مقصود (السجلّ)، أو تسجيلٌ جارٍ
 * تملكه عملية، أو استولى عليه `disableWebPush`، أو إلغاءٌ جارٍ، أو في قائمة
 * التنظيف المحفوظة لصاحبه. عمليةٌ قديمة تستقرّ متأخّرةً **لا تلغي** رمزاً
 * مقصوداً أو جارياً لغيرها (`isIntended` يُفحص بلا انتظارٍ قبل كل إلغاء).
 *
 * الإلغاء على الخادم مقيَّدٌ بالمسؤول لا بالجلسة، ومتكرّرُه بلا أثر: فإلغاءٌ
 * فشل (شبكة، خطأ خادم، مهلة) يُحفظ ويُعاد عند مزامنة صاحبه التالية — مرّة لكل
 * مزامنة، بلا مؤقّتات ولا حلقات. ما تجاوز الحدّ يبقى محدوداً بانتهاء جلسته (٠٨٢).
 */
interface InflightRegistration {
  token: string
  owner: string
  session: string
  done: Promise<void>
  /** `disableWebPush` تولّى إلغاءه — فلا تلغيه العمليةُ صاحبته مرّةً ثانية. */
  claimed: boolean
}

/** لكل طلب تسجيلٍ جارٍ مدخلٌ يزول حين يستقرّ — لا خانة واحدة يكتب فوقها طلبٌ آخر. */
const inflightRegistrations = new Set<InflightRegistration>()
/** إلغاءٌ جارٍ لكل رمز: تسجيلُ الرمز نفسه ينتظره، فيرى الخادم الإلغاء أولاً. */
const inflightUnregisters = new Map<string, Promise<void>>()

const CLEANUP_KEY = 'otaku-admin-push-cleanup'
const CLEANUP_LIMIT = 16

export interface PendingCleanup {
  owner: string
  token: string
}

function readCleanup(): PendingCleanup[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(CLEANUP_KEY) ?? '[]') as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (entry): entry is PendingCleanup =>
        typeof entry?.owner === 'string' && Boolean(entry.owner) && typeof entry?.token === 'string' && Boolean(entry.token),
    )
  } catch {
    return []
  }
}

function writeCleanup(entries: PendingCleanup[]) {
  try {
    if (entries.length) localStorage.setItem(CLEANUP_KEY, JSON.stringify(entries.slice(-CLEANUP_LIMIT)))
    else localStorage.removeItem(CLEANUP_KEY)
  } catch {
    // تخزينٌ محجوب: يبقى الصفّ محدوداً بانتهاء جلسته على الخادم.
  }
}

function addCleanup(owner: string, token: string) {
  writeCleanup([...readCleanup().filter((e) => e.owner !== owner || e.token !== token), { owner, token }])
}

function dropCleanup(owner: string, token: string) {
  const entries = readCleanup()
  const rest = entries.filter((e) => e.owner !== owner || e.token !== token)
  if (rest.length !== entries.length) writeCleanup(rest)
}

/** إلغاءاتٌ لم تكتمل بعد — تُعاد عند مزامنة صاحبها التالية. */
export function pendingWebPushCleanup(): PendingCleanup[] {
  return readCleanup()
}

/** لا تسجيل ولا إلغاء جارٍ — للاختبارات والتشخيص. */
export function webPushIdle(): boolean {
  return inflightRegistrations.size === 0 && inflightUnregisters.size === 0
}

/** رمزٌ مقصود الآن، أو تسجيلُه جارٍ لعمليةٍ ما — لا يلغيه تنظيف. */
function isIntended(token: string): boolean {
  if (readRecord()?.token === token) return true
  for (const entry of inflightRegistrations) if (entry.token === token) return true
  return false
}

/** إلغاءٌ مُتتبَّع: نجاحه يمحوه من قائمة التنظيف، وفشله يحفظه فيها ثم يُرمى. */
async function unregisterTracked(owner: string | null, token: string): Promise<void> {
  const before = inflightUnregisters.get(token) ?? Promise.resolve()
  const request = before.then(() => unregisterAdminDevice(token))
  const settled = request.then(
    () => undefined,
    () => undefined,
  )
  inflightUnregisters.set(token, settled)
  try {
    await request
    if (owner) dropCleanup(owner, token)
  } catch (error) {
    if (owner) addCleanup(owner, token)
    throw error
  } finally {
    if (inflightUnregisters.get(token) === settled) inflightUnregisters.delete(token)
  }
}

/**
 * تسجيلٌ مُتتبَّع. `true` = العملية ما تزال حاليّة بعد استقراره (فلتكتب السجلّ
 * فوراً). `false` = قديمة: ما سجّلته يُسوّى هنا — لا يُترك نشطاً بلا صاحب.
 */
async function registerTracked(ticket: SessionTicket, token: string): Promise<boolean> {
  const unregistering = inflightUnregisters.get(token)
  if (unregistering) {
    await unregistering
    if (!current(ticket)) return false
  }
  const request = registerAdminDevice(token)
  const entry: InflightRegistration = {
    token,
    owner: ticket.owner,
    session: ticket.session,
    done: request.then(
      () => undefined,
      () => undefined,
    ),
    claimed: false,
  }
  inflightRegistrations.add(entry)
  try {
    await request
  } catch (error) {
    inflightRegistrations.delete(entry)
    // قد يكون بلغ الخادم قبل الفشل (مهلة): يُتتبَّع ما لم يكن مقصوداً.
    if (!entry.claimed && !isIntended(token)) addCleanup(ticket.owner, token)
    throw error
  }
  inflightRegistrations.delete(entry)
  if (current(ticket)) return true
  await settleStaleRegistration(entry)
  return false
}

/** تسجيلٌ استقرّ لعمليةٍ قديمة: يُلغى الآن إن أمكن، وإلا حُفظ لجلسة صاحبه التالية. */
async function settleStaleRegistration(entry: InflightRegistration): Promise<void> {
  if (entry.claimed || isIntended(entry.token)) return
  const { token: session, user } = useAuthStore.getState()
  if (session && user?.id === entry.owner) {
    await unregisterTracked(entry.owner, entry.token).catch(() => undefined)
  } else {
    addCleanup(entry.owner, entry.token)
  }
}

/** إلغاءاتُ هذا المسؤول المعلّقة — محاولةٌ واحدة لكل مزامنة، ولا يُمسّ رمزٌ مقصود. */
async function drainCleanup(ticket: SessionTicket): Promise<void> {
  for (const entry of readCleanup()) {
    if (entry.owner !== ticket.owner) continue
    if (!current(ticket)) return
    if (isIntended(entry.token)) {
      dropCleanup(entry.owner, entry.token)
      continue
    }
    await unregisterTracked(entry.owner, entry.token).catch(() => undefined)
  }
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
  if (!ticketFor(ownerId)) return { ok: false, reason: 'failed', detail: 'no_session' }
  // فعلٌ صريح: مزامنةٌ معلّقة قبله لا تكتب فوقه.
  epoch += 1
  const ticket = ticketFor(ownerId)!
  const sessionChanged = { ok: false, reason: 'failed', detail: 'session_changed' } as const
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    // المتصفّح لا يستقبل: ما كانت المزامنة المُبطَلة ستفعله يُفعل هنا — النيّة تُمحى
    // والجهاز يُلغى على الخادم والمتصفّح، فلا تبقى الواجهة والخادم على حالٍ مضلِّلة.
    const record = readRecord()
    if (record?.owner === ownerId && current(ticket)) {
      writeRecord(null)
      if (record.token) await unregisterTracked(ownerId, record.token).catch(() => undefined)
      if (current(ticket)) await unsubscribeThisBrowser()
    }
    return { ok: false, reason: 'denied' }
  }
  try {
    if (!current(ticket)) return sessionChanged
    const token = await currentToken()
    if (!token) return { ok: false, reason: 'failed', detail: 'no_token' }
    if (!current(ticket)) return sessionChanged
    const previous = readRecord()
    if (!(await registerTracked(ticket, token))) return sessionChanged
    // السجلّ يُكتب فور الاستقرار — بلا انتظارٍ يرى فيه تنظيفٌ قديمٌ الرمزَ بلا صاحب.
    takeLegacyToken()
    writeRecord({ owner: ownerId, token })
    dropCleanup(ownerId, token)
    // رمزه القديم (تبدّل) يُلغى؛ رمز غيره ليس له أن يلغيه (الخادم يقصره على صاحبه).
    if (previous?.owner === ownerId && previous.token && previous.token !== token && !isIntended(previous.token)) {
      await unregisterTracked(ownerId, previous.token).catch(() => undefined)
    }
    return { ok: true, token }
  } catch (error) {
    return { ok: false, reason: 'failed', detail: error instanceof Error ? error.message : String(error) }
  }
}

/** إيقافها على هذا الجهاز: يُعطَّل على الخادم ويُلغى اشتراك المتصفّح، ولا تبقى نيّة. */
export async function disableWebPush(): Promise<void> {
  epoch += 1
  const mine = epoch
  const { token: session, user } = useAuthStore.getState()
  const record = readRecord()
  const recordToken = record?.token ?? takeLegacyToken()
  writeRecord(null)
  takeLegacyToken()
  // كل تسجيلٍ أُرسل بهذه الجلسة ولم يستقرّ يُستولى عليه ويُنتظر **قبل** الإلغاء —
  // وإلا سبقه الإلغاء إلى الخادم فبقي الصفّ نشطاً. تسجيلُ جلسةٍ أخرى ليس لنا.
  const claimed = [...inflightRegistrations].filter((entry) => entry.session === session)
  for (const entry of claimed) entry.claimed = true
  try {
    await Promise.all(claimed.map((entry) => entry.done))
    const targets = new Map<string, string | null>()
    if (recordToken) targets.set(recordToken, record?.owner ?? user?.id ?? null)
    for (const entry of claimed) if (!targets.has(entry.token)) targets.set(entry.token, entry.owner)
    // تفعيلٌ أحدث في أثناء الانتظار جعل رمزاً مقصوداً أو جارياً من جديد: لا يُلغى من تحته.
    for (const token of [...targets.keys()]) if (isIntended(token)) targets.delete(token)
    // كلٌّ مستقلّ: فشلُ واحدٍ لا يُسقط إلغاء غيره، وكلُّ فاشلٍ يبقى في قائمة التنظيف.
    const results = await Promise.allSettled([...targets].map(([token, owner]) => unregisterTracked(owner, token)))
    const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
    if (failure) throw failure.reason
  } finally {
    // تفعيلٌ أحدث بدأ: اشتراك المتصفّح صار له — لا يُلغى من تحته.
    if (epoch === mine) await unsubscribeThisBrowser()
  }
}

/** المزامنة الجارية ومفتاحها (صاحب + جلسة + `epoch`) — لا تنضمّ جلسةٌ إلى مزامنة غيرها. */
let syncing: { key: string; promise: Promise<void> } | null = null

/**
 * بداية جلسة (وبعد تغيير كلمة المرور، وحين يبدّل المتصفّح اشتراكه): يجدّد رمز
 * هذا المتصفّح ويربطه بالجلسة الحالية. فشلُ الشبكة صامت: يُعاد في الجلسة التالية.
 *
 * نداءان بالتذكرة نفسها (StrictMode) عمليةٌ واحدة. تذكرةٌ أخرى تبدأ عمليتها فوراً
 * ولا تنتظر القديمة (قد تعلق في `getToken` أبداً) — القديمة تتوقّف عند حدّها التالي.
 */
export function syncWebPush(ownerId: string | null | undefined): Promise<void> {
  const ticket = ownerId ? ticketFor(ownerId) : null
  if (!ticket) return Promise.resolve()
  const key = `${ticket.owner}\n${ticket.session}\n${ticket.epoch}`
  if (syncing?.key === key) return syncing.promise
  const entry = {
    key,
    promise: runSync(ticket)
      .catch(() => undefined)
      .finally(() => {
        if (syncing === entry) syncing = null
      }),
  }
  syncing = entry
  return entry.promise
}

async function runSync(ticket: SessionTicket): Promise<void> {
  const ownerId = ticket.owner
  // صيغةٌ قديمة بلا صاحب: لا تُنقل لهذا المسؤول — يُعاد التفعيل مرّة.
  if (takeLegacyToken()) await unsubscribeThisBrowser()
  if (!current(ticket)) return
  // ما فشل إلغاؤه سابقاً لهذا المسؤول — قبل كل شيء، ولو لم تبقَ نيّة.
  await drainCleanup(ticket)
  if (!current(ticket)) return

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
    if (record.token && !isIntended(record.token)) {
      await unregisterTracked(ownerId, record.token).catch(() => undefined)
    }
    // جلسةٌ أحدث قد تملك الاشتراك الآن — لا يُلغى من تحتها.
    if (current(ticket)) await unsubscribeThisBrowser()
    return
  }
  try {
    const token = await currentToken()
    if (!token || !current(ticket)) return
    // الجديد أولاً ثم إلغاء القديم — بلا فجوةٍ لا يستقبل فيها المتصفّح شيئاً.
    if (!(await registerTracked(ticket, token))) return
    // السجلّ يُكتب فور الاستقرار — بلا انتظارٍ يرى فيه تنظيفٌ قديمٌ الرمزَ بلا صاحب.
    writeRecord({ owner: ownerId, token })
    dropCleanup(ownerId, token)
    if (record.token && record.token !== token && !isIntended(record.token)) {
      await unregisterTracked(ownerId, record.token).catch(() => undefined)
    }
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
  epoch += 1
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
