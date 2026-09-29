import { config } from '../config/index.js';
import { db } from '../database/pool.js';
import { notificationPrefsRepo, type NotificationPrefKey } from '../repositories/notificationPrefsRepo.js';
import { pushOutboxRepo, type OutboxRow } from '../repositories/pushOutboxRepo.js';
import { pushStatus, type PushProvider } from '../services/push/index.js';

/**
 * مهمّة الدفع — ترسل صفوف `push_outbox` المستحقّة خارج الطلبات.
 *
 * [CRITICAL] لكل صفٍّ مصيرٌ صريح، ولا صفّ يبقى معلَّقاً إلى الأبد:
 *   sent     — وصل جهازاً واحداً على الأقل (أو المزوّد لم يرفض شيئاً).
 *   skipped  — لا يُرسَل أصلاً: الدفع غير مضبوط (`push_not_configured`)،
 *              أو أطفأه الزبون (`pref_disabled`)، أو لا جهاز (`no_devices`).
 *   failed   — كل الرموز رفضها المزوّد، أو نفدت المحاولات.
 *   pending  — عطلٌ عابر (شبكة، مهلة، 5xx، تبادل رمز الوصول) ⇒ محاولةٌ لاحقة
 *              بتباعد: ٣٠ث ثم دقيقتان ثم عشر دقائق، ثم `failed`.
 *
 * «غير مضبوط» ليس خطأً يُعاد: بيئةٌ بلا اعتماد FCM تُسجّل السبب وتمضي، ويبقى
 * الإشعار داخل التطبيق كاملاً. ولا مزوّد وهمي يدّعي الإرسال.
 */

/** نوع إشعار التطبيق → مفتاح التفضيل الذي يحكمه (هجرة ٠٣٦). */
const PREF_FOR_TYPE: Record<string, NotificationPrefKey> = {
  orderAccepted: 'orders',
  orderRejected: 'orders',
  deliveryUpdate: 'orders',
  receiptReminder: 'orders',
  reviewApproved: 'reviews',
  reviewRejected: 'reviews',
  backInStock: 'stock',
  restockScheduled: 'stock',
  promotion: 'offers',
  rewardClaimed: 'points',
};

export const MAX_PUSH_ATTEMPTS = 3;
const RETRY_DELAYS_SECONDS = [30, 120, 600];
const RETENTION_DAYS = 30;

export function retryDelaySeconds(attempts: number): number {
  return RETRY_DELAYS_SECONDS[Math.min(attempts, RETRY_DELAYS_SECONDS.length) - 1] ?? 600;
}

export interface DispatchSummary {
  claimed: number;
  sent: number;
  skipped: number;
  retried: number;
  failed: number;
}

/** القيم نصّية في FCM `data` — والأرقام/القيم الفارغة تُهمَل. */
function stringData(data: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string' && value) out[key] = value;
    else if (typeof value === 'number' || typeof value === 'boolean') out[key] = String(value);
  }
  return out;
}

async function allowedByCustomerPrefs(row: OutboxRow): Promise<boolean> {
  const type = typeof row.data.type === 'string' ? row.data.type : '';
  const key = PREF_FOR_TYPE[type];
  if (!key) return true;
  const prefs = await notificationPrefsRepo.getAll(db, row.user_id);
  return prefs[key];
}

async function deliver(row: OutboxRow, provider: PushProvider, summary: DispatchSummary) {
  const isAdmin = row.audience === 'admin';
  if (!isAdmin && !(await allowedByCustomerPrefs(row))) {
    await pushOutboxRepo.markSkipped(db, row.id, 'pref_disabled');
    summary.skipped += 1;
    return;
  }

  const tokens = isAdmin
    ? await pushOutboxRepo.adminTokens(db, row.user_id)
    : await pushOutboxRepo.customerTokens(db, row.user_id);
  if (tokens.length === 0) {
    await pushOutboxRepo.markSkipped(db, row.id, 'no_devices');
    summary.skipped += 1;
    return;
  }

  const retryOrFail = async (reason: string) => {
    if (row.attempts >= MAX_PUSH_ATTEMPTS) {
      await pushOutboxRepo.markFailed(db, row.id, reason);
      summary.failed += 1;
    } else {
      await pushOutboxRepo.scheduleRetry(db, row.id, retryDelaySeconds(row.attempts), reason);
      summary.retried += 1;
    }
  };

  let result;
  try {
    result = await provider.send({
      tokens,
      title: row.title,
      body: row.body,
      data: stringData(row.data),
      // المسؤول على المتصفّح: رسالة بيانات يعرضها عامل الخدمة بنفسه (فيضبط
      // رابط النقر). الزبون على أندرويد: إشعارٌ يعرضه النظام ولو كان التطبيق
      // مغلقاً تماماً.
      dataOnly: isAdmin,
    });
  } catch (error) {
    await retryOrFail(error instanceof Error ? error.message.slice(0, 300) : 'push_error');
    return;
  }

  if (result.invalidTokens.length > 0) {
    if (isAdmin) await pushOutboxRepo.deactivateAdminTokens(db, result.invalidTokens);
    else await pushOutboxRepo.deactivateCustomerTokens(db, result.invalidTokens);
  }

  const transient = result.transientFailures ?? 0;
  if (result.sent === 0 && transient > 0) {
    await retryOrFail(`transient_failures:${transient}`);
    return;
  }
  if (result.sent === 0 && result.invalidTokens.length === tokens.length) {
    await pushOutboxRepo.markFailed(db, row.id, 'all_tokens_invalid');
    summary.failed += 1;
    return;
  }
  // إرسالٌ جزئي لا يُعاد: إعادتُه تكرّر الإشعار على الأجهزة التي وصلها.
  await pushOutboxRepo.markSent(db, row.id, transient > 0 ? `partial:${transient}` : null);
  summary.sent += 1;
}

/**
 * دورة واحدة: التقاط دفعة، ثم إرسالها خارج أي معاملة.
 *
 * `provider` يُمرَّر في الاختبارات؛ في التشغيل يُبنى من الإعداد، وغيابه
 * يعني `skipped: push_not_configured` لكل صفّ.
 */
export async function dispatchPushOutbox(
  options: { provider?: PushProvider | null; batchSize?: number } = {},
): Promise<DispatchSummary> {
  const summary: DispatchSummary = { claimed: 0, sent: 0, skipped: 0, retried: 0, failed: 0 };
  const rows = await pushOutboxRepo.claimDue(db, options.batchSize ?? config.push.outboxBatchSize);
  summary.claimed = rows.length;
  if (rows.length === 0) return summary;

  const provider = options.provider !== undefined ? options.provider : pushStatus().provider;
  for (const row of rows) {
    if (!provider) {
      await pushOutboxRepo.markSkipped(db, row.id, 'push_not_configured');
      summary.skipped += 1;
      continue;
    }
    try {
      await deliver(row, provider, summary);
    } catch (error) {
      // عطلٌ في القاعدة لصفٍّ واحد لا يوقف البقية؛ الصفّ يعود مستحقاً بعد الحجز.
      console.error('[push-outbox] row failed', { id: row.id, error });
    }
  }
  return summary;
}

/** جدولة المهمّة مع الخادم — تعيد دالة إيقافٍ لإغلاقٍ منظَّم. */
export function startPushOutboxScheduler(): () => void {
  const status = pushStatus();
  if (!status.configured) {
    console.warn(`[push] الدفع غير مضبوط (${status.reason}) — الإشعارات داخل التطبيق تعمل، والدفع يُسجَّل skipped.`);
  }
  let running = false;
  let ticks = 0;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await dispatchPushOutbox();
      ticks += 1;
      if (ticks % 720 === 0) await pushOutboxRepo.purgeFinished(db, RETENTION_DAYS);
    } catch (error) {
      console.error('[push-outbox] dispatch failed', error);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), config.push.outboxIntervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
