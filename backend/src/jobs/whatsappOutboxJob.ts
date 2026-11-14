import { config } from '../config/index.js';
import { db, withTransaction } from '../database/pool.js';
import { WHATSAPP_SIGNUP_TEXTS } from '../domain/whatsappSignupTexts.js';
import type { AppLocale } from '../utils/locale.js';
import { WhatsAppSendError, whatsappProvider, type OutboundMessage } from '../services/whatsapp/provider.js';

/**
 * ردود واتساب الصادرة للتحقق التلقائي + تنظيف البيانات القديمة.
 *
 * الويبهوك لا ينتظر Meta: يكتب صفّاً في `whatsapp_outbox` ويردّ فوراً، وهذه
 * المهمّة ترسل. محاولةٌ ثم ٣٠ث ثم دقيقتان، ثلاث مرّات ثم `failed`. الوضع `off`
 * لا يرسل شيئاً (الصفوف المنتظرة تصير `skipped`)، والتنظيف يجري في الوضعين.
 *
 * [SECURITY] السجلّ لا يحمل رقماً ولا معرّفاً ولا نصّاً — رمز الخطأ وحده.
 */

const BACKOFF_SECONDS = [30, 120];
const MAX_ATTEMPTS = 3;
const BATCH = 20;
/** مهلة «الحجز»: صفٌّ أُخذ للإرسال لا يأخذه دورٌ آخر قبلها. */
const CLAIM_SECONDS = 60;
const CLEANUP_EVERY_MS = 60 * 60 * 1000;

interface ClaimedRow {
  id: string;
  kind: 'contact_request' | 'confirmation';
  attempts: number;
  phone: string;
  sender_ref: string | null;
  locale: AppLocale;
  session_status: string;
}

export async function runWhatsAppOutboxOnce(): Promise<{ sent: number; failed: number; skipped: number }> {
  const counts = { sent: 0, failed: 0, skipped: 0 };
  if (config.whatsapp.mode !== 'auto') {
    const { rowCount } = await db.query(`UPDATE whatsapp_outbox SET status = 'skipped' WHERE status = 'queued'`);
    counts.skipped = rowCount ?? 0;
    return counts;
  }

  const claimed = await withTransaction(async (tx) => {
    const { rows } = await tx.query<ClaimedRow>(
      `SELECT o.id, o.kind, o.attempts, s.phone, s.sender_ref, s.locale, s.status AS session_status
         FROM whatsapp_outbox o
         JOIN whatsapp_signup_sessions s ON s.id = o.session_id
        WHERE o.status = 'queued' AND o.next_attempt_at <= now()
        ORDER BY o.id
        LIMIT $1
        FOR UPDATE OF o SKIP LOCKED`,
      [BATCH],
    );
    if (rows.length > 0) {
      await tx.query(
        `UPDATE whatsapp_outbox SET next_attempt_at = now() + make_interval(secs => $2) WHERE id = ANY($1::bigint[])`,
        [rows.map((r) => r.id), CLAIM_SECONDS],
      );
    }
    return rows;
  });

  const provider = whatsappProvider();
  for (const row of claimed) {
    // طلب مشاركة الرقم لجلسةٍ لم تعد تنتظره (تحقّقت، ماتت) لا يُرسل.
    if (row.kind === 'contact_request' && (row.session_status !== 'awaiting_contact' || !row.sender_ref)) {
      await db.query(`UPDATE whatsapp_outbox SET status = 'skipped' WHERE id = $1`, [row.id]);
      counts.skipped++;
      continue;
    }
    const texts = WHATSAPP_SIGNUP_TEXTS[row.locale] ?? WHATSAPP_SIGNUP_TEXTS.ar;
    const recipient = row.sender_ref ? { bsuid: row.sender_ref } : { phone: row.phone };
    const message: OutboundMessage =
      row.kind === 'contact_request'
        ? { kind: 'contact_request', recipient, bodyText: texts.contactRequest }
        : { kind: 'confirmation', recipient, bodyText: texts.confirmation };
    try {
      const { providerMessageId } = await provider.send(message);
      await db.query(
        `UPDATE whatsapp_outbox
            SET status = 'sent', sent_at = now(), attempts = attempts + 1,
                provider_message_id = $2, last_error_code = NULL
          WHERE id = $1`,
        [row.id, providerMessageId.slice(0, 256)],
      );
      counts.sent++;
    } catch (error) {
      const code = error instanceof WhatsAppSendError ? error.code : 'unexpected';
      const retryable = error instanceof WhatsAppSendError ? error.retryable : false;
      const attempts = row.attempts + 1;
      const giveUp = !retryable || attempts >= MAX_ATTEMPTS;
      await db.query(
        `UPDATE whatsapp_outbox
            SET attempts = $2, last_error_code = $3,
                status = CASE WHEN $4 THEN 'failed' ELSE 'queued' END,
                next_attempt_at = now() + make_interval(secs => $5)
          WHERE id = $1`,
        [row.id, attempts, code.slice(0, 64), giveUp, BACKOFF_SECONDS[Math.min(attempts - 1, BACKOFF_SECONDS.length - 1)]],
      );
      console.warn(`[whatsapp-outbox] send failed kind=${row.kind} code=${code} attempt=${attempts}${giveUp ? ' (gave up)' : ''}`);
      if (giveUp) counts.failed++;
    }
  }
  return counts;
}

/**
 * حفظ البيانات: الجلسات ٣٠ يوماً (المكتملة ٩٠ — أثر «فُعِّل عبر واتساب»)،
 * وأحداث الويبهوك ١٤ يوماً (Meta تعيد الإرسال حتى ٧ أيام). الردود تُحذف مع
 * جلستها (`ON DELETE CASCADE`).
 */
export async function purgeExpiredWhatsAppData(): Promise<{ sessions: number; events: number }> {
  const sessions = await db.query(
    `DELETE FROM whatsapp_signup_sessions
      WHERE (status <> 'completed' AND created_at < now() - interval '30 days')
         OR created_at < now() - interval '90 days'`,
  );
  const events = await db.query(
    `DELETE FROM whatsapp_webhook_events WHERE received_at < now() - interval '14 days'`,
  );
  return { sessions: sessions.rowCount ?? 0, events: events.rowCount ?? 0 };
}

export function startWhatsAppOutboxScheduler(): () => void {
  let running = false;
  let lastCleanup = 0;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runWhatsAppOutboxOnce();
      if (Date.now() - lastCleanup >= CLEANUP_EVERY_MS) {
        lastCleanup = Date.now();
        await purgeExpiredWhatsAppData();
      }
    } catch (error) {
      console.error('[whatsapp-outbox] tick failed:', (error as Error).message);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), config.whatsapp.outboxIntervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
