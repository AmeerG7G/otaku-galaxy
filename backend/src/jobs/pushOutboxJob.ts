import { config, isTest } from '../config/index.js';
import { db } from '../database/pool.js';
import { notificationPrefsRepo, type NotificationPrefKey } from '../repositories/notificationPrefsRepo.js';
import {
  CLAIM_LEASE_SECONDS,
  pushOutboxRepo,
  type DeviceCounts,
  type OutboxRow,
} from '../repositories/pushOutboxRepo.js';
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
/** رمز زبونٍ صامتٌ هذه المدّة يُعطَّل؛ «جهازٌ نشط» في التحليلات = رأيناه خلال ٣٠ يوماً. */
export const STALE_TOKEN_DAYS = 60;

export function retryDelaySeconds(attempts: number): number {
  return RETRY_DELAYS_SECONDS[Math.min(attempts, RETRY_DELAYS_SECONDS.length) - 1] ?? 600;
}

export interface DispatchSummary {
  claimed: number;
  sent: number;
  skipped: number;
  retried: number;
  failed: number;
  /** حسمٌ رُفض لأن عاملاً آخر التقط الصفّ بعد انتهاء الحجز — لا يُعدّ مرتين. */
  stale: number;
  /** صفوفٌ أُعيدت بلا معالجة لانقضاء ميزانية الدور (بلا استهلاك محاولة). */
  released: number;
}

/** ميزانية الدور: نصف مهلة الحجز — لا يطول دورٌ حتى يلتقط غيرُه صفوفه. */
export const DISPATCH_BUDGET_MS = (CLAIM_LEASE_SECONDS * 1000) / 2;

/** القيم نصّية في FCM `data` — والأرقام/القيم الفارغة تُهمَل. */
function stringData(data: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string' && value) out[key] = value;
    else if (typeof value === 'number' || typeof value === 'boolean') out[key] = String(value);
  }
  return out;
}

/**
 * نصّ الخطأ كما يُحفظ في `last_error`: مقتطعٌ، وأي سلسلةٍ بطول رمز جهاز أو مفتاح
 * تُحجب — لا رمز ولا سرّ في القاعدة أو السجلّ أبداً.
 */
export function scrubPushError(message: string): string {
  return message.replace(/[A-Za-z0-9_:\-]{60,}/g, '[redacted]').slice(0, 300);
}

async function allowedByCustomerPrefs(row: OutboxRow): Promise<boolean> {
  const type = typeof row.data.type === 'string' ? row.data.type : '';
  const key = PREF_FOR_TYPE[type];
  if (!key) return true;
  const prefs = await notificationPrefsRepo.getAll(db, row.user_id);
  return prefs[key];
}

type Outcome = 'sent' | 'skipped' | 'retried' | 'failed';

async function settle(summary: DispatchSummary, outcome: Outcome, applied: Promise<boolean>) {
  if (await applied) summary[outcome] += 1;
  else summary.stale += 1;
}

async function deliver(row: OutboxRow, provider: PushProvider, summary: DispatchSummary) {
  const isAdmin = row.audience === 'admin';
  if (!isAdmin && !(await allowedByCustomerPrefs(row))) {
    await settle(summary, 'skipped', pushOutboxRepo.markSkipped(db, row, 'pref_disabled'));
    return;
  }

  const tokens = isAdmin
    ? await pushOutboxRepo.adminTokens(db, row.user_id)
    : await pushOutboxRepo.customerTokens(db, row.user_id);
  if (tokens.length === 0) {
    await settle(summary, 'skipped', pushOutboxRepo.markSkipped(db, row, 'no_devices'));
    return;
  }

  const retryOrFail = async (reason: string, devices?: DeviceCounts, retryAfterSeconds?: number) => {
    if (row.attempts >= MAX_PUSH_ATTEMPTS) {
      await settle(summary, 'failed', pushOutboxRepo.markFailed(db, row, reason, devices));
    } else {
      const delay = Math.max(retryDelaySeconds(row.attempts), retryAfterSeconds ?? 0);
      await settle(summary, 'retried', pushOutboxRepo.scheduleRetry(db, row, delay, reason));
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
    await retryOrFail(scrubPushError(error instanceof Error ? error.message : 'push_error'));
    return;
  }

  if (result.invalidTokens.length > 0) {
    if (isAdmin) await pushOutboxRepo.deactivateAdminTokens(db, result.invalidTokens);
    else await pushOutboxRepo.deactivateCustomerTokens(db, result.invalidTokens);
  }

  const transient = result.transientFailures ?? 0;
  const devices: DeviceCounts = { accepted: result.sent, invalid: result.invalidTokens.length, transient };
  if (result.sent === 0 && transient > 0) {
    await retryOrFail(`transient_failures:${transient}`, devices, result.retryAfterSeconds);
    return;
  }
  if (result.sent === 0 && result.invalidTokens.length === tokens.length) {
    await settle(summary, 'failed', pushOutboxRepo.markFailed(db, row, 'all_tokens_invalid', devices));
    return;
  }
  // إرسالٌ جزئي لا يُعاد: إعادتُه تكرّر الإشعار على الأجهزة التي قبلتها FCM.
  // «sent» = قبلتها FCM لجهازٍ واحدٍ على الأقل — لا «وصلت» ولا «عُرضت».
  await settle(summary, 'sent', pushOutboxRepo.markSent(db, row, devices, transient > 0 ? `partial:${transient}` : null));
}

/**
 * دورة واحدة: التقاط دفعة، ثم إرسالها خارج أي معاملة.
 *
 * `provider` يُمرَّر في الاختبارات؛ في التشغيل يُبنى من الإعداد، وغيابه
 * يعني `skipped: push_not_configured` لكل صفّ. ما لم يُعالَج قبل انقضاء
 * `budgetMs` يُعاد إلى الصندوق بلا استهلاك محاولة.
 */
export async function dispatchPushOutbox(
  options: { provider?: PushProvider | null; batchSize?: number; budgetMs?: number; now?: () => number } = {},
): Promise<DispatchSummary> {
  const summary: DispatchSummary = { claimed: 0, sent: 0, skipped: 0, retried: 0, failed: 0, stale: 0, released: 0 };
  const rows = await pushOutboxRepo.claimDue(db, options.batchSize ?? config.push.outboxBatchSize);
  summary.claimed = rows.length;
  if (rows.length === 0) return summary;

  const now = options.now ?? Date.now;
  const started = now();
  const budget = options.budgetMs ?? DISPATCH_BUDGET_MS;
  const provider = options.provider !== undefined ? options.provider : pushStatus().provider;
  for (let index = 0; index < rows.length; index += 1) {
    if (now() - started > budget) {
      summary.released += await pushOutboxRepo.releaseClaim(db, rows.slice(index));
      break;
    }
    const row = rows[index]!;
    if (!provider) {
      await settle(summary, 'skipped', pushOutboxRepo.markSkipped(db, row, 'push_not_configured'));
      continue;
    }
    try {
      await deliver(row, provider, summary);
    } catch (error) {
      // عطلٌ في القاعدة لصفٍّ واحد لا يوقف البقية؛ الصفّ يعود مستحقاً بعد الحجز.
      console.error('[push-outbox] row failed', { id: row.id, audience: row.audience, error: scrubPushError(String(error)) });
    }
  }
  if (!isTest) {
    // سجلٌّ منظَّم بلا رموز ولا محتوى: أعدادٌ فقط.
    console.info('[push-outbox] dispatch', summary);
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
      if (ticks % 720 === 0) {
        await pushOutboxRepo.purgeFinished(db, RETENTION_DAYS);
        await pushOutboxRepo.deactivateStaleCustomerTokens(db, STALE_TOKEN_DAYS);
      }
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
