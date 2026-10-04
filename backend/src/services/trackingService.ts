import { config } from '../config/index.js';
import { db } from '../database/pool.js';

/**
 * التتبّع التجميعي (D3، الهجرة ٠٧٩) — **مطفأ افتراضياً في كل بيئة**.
 *
 * [CRITICAL]
 *   • لا يكتب شيئاً ما لم يكن `ANALYTICS_TRACKING_ENABLED=true` حرفياً.
 *   • لا سجلّ أحداث: عدّادات يومية بلا معرّف مستخدم، إلا أيام النشاط (معرّف +
 *     تاريخ + عدد الدخول) لعدّ النشطين المميَّزين، وتُطهَّر بعد ٤٠٠ يوم.
 *   • «نارٌ ثم نسيان»: إشارةٌ فاشلة تُسجَّل ولا تُفشل طلب الزبون أبداً.
 *   • اليوم يوم المتجر (Asia/Baghdad) — يحسمه `Intl` بالمنطقة نفسها التي تحسمها
 *     القاعدة في كل مكان آخر.
 *   • البحث: يُطوى (`search_fold`)، ٢–٦٠ محرفاً، وتُسقط أي عبارةٍ فيها ستة أرقام
 *     متتالية (هاتف) أو بريد — لا تُحفظ معلومةٌ شخصية كتبها الزبون خطأً.
 */

export type ShareResult = 'opened' | 'success' | 'dismissed' | 'unavailable';

/** يوم المتجر الآن «YYYY-MM-DD». */
export function storeDay(now: Date = new Date(), tz: string = config.storeTimezone): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** هل العبارة صالحةٌ للحفظ؟ (قبل الطيّ في القاعدة) */
export function isTrackableSearchTerm(raw: string): boolean {
  const term = raw.trim();
  if (term.length < 2 || term.length > 60) return false;
  if (/\d{6,}/.test(term.replace(/[\s\-.]/g, ''))) return false;
  if (/@/.test(term)) return false;
  return true;
}

/** مفاتيح «نشطٌ اليوم» المكتوبة في هذه العملية — كتابةٌ واحدة لكل زبون في اليوم. */
const activeToday = new Set<string>();
let activeDay = '';

/**
 * [D2] إشارةٌ من حسابٍ معروف لا تُعدّ إن كان مسؤولاً أو حساباً داخلياً. الزائر
 * (بلا حساب) يُعدّ — لا هوية له تُستثنى.
 */
const NOT_EXCLUDED_ACTOR = (param: string) =>
  `AND NOT EXISTS (SELECT 1 FROM users ex WHERE ex.id = ${param}::uuid
                    AND (ex.role <> 'customer' OR ex.is_internal_account))`;

function fireAndForget(label: string, work: () => Promise<unknown>) {
  if (!config.analytics.trackingEnabled) return;
  void work().catch((error) => {
    console.error(`[tracking] ${label} failed`, error instanceof Error ? error.message : error);
  });
}

export const trackingService = {
  isEnabled(): boolean {
    return config.analytics.trackingEnabled;
  },

  productView(productId: string, actorId: string | null) {
    fireAndForget('view', () =>
      db.query(
        `INSERT INTO product_daily_counters (stat_date, product_id, views)
         SELECT $1::date, p.id, 1 FROM products p WHERE p.id = $2 ${NOT_EXCLUDED_ACTOR('$3')}
         ON CONFLICT (stat_date, product_id) DO UPDATE SET views = product_daily_counters.views + 1`,
        [storeDay(), productId, actorId],
      ),
    );
  },

  cartAdd(productId: string, actorId: string) {
    fireAndForget('cart_add', () =>
      db.query(
        `INSERT INTO product_daily_counters (stat_date, product_id, cart_adds)
         SELECT $1::date, p.id, 1 FROM products p WHERE p.id = $2 ${NOT_EXCLUDED_ACTOR('$3')}
         ON CONFLICT (stat_date, product_id) DO UPDATE SET cart_adds = product_daily_counters.cart_adds + 1`,
        [storeDay(), productId, actorId],
      ),
    );
  },

  /** فتح ورقة المشاركة يُعدّ دائماً؛ «مؤكَّدة» فقط حين يقول النظام `success`. */
  share(productId: string, result: ShareResult, actorId: string) {
    const confirmed = result === 'success' ? 1 : 0;
    fireAndForget('share', () =>
      db.query(
        `INSERT INTO product_daily_counters (stat_date, product_id, share_opens, share_confirmed)
         SELECT $1::date, p.id, 1, $3 FROM products p WHERE p.id = $2 ${NOT_EXCLUDED_ACTOR('$4')}
         ON CONFLICT (stat_date, product_id) DO UPDATE
           SET share_opens = product_daily_counters.share_opens + 1,
               share_confirmed = product_daily_counters.share_confirmed + EXCLUDED.share_confirmed`,
        [storeDay(), productId, confirmed, actorId],
      ),
    );
  },

  search(raw: string, resultCount: number, actorId: string | null) {
    if (!isTrackableSearchTerm(raw)) return;
    fireAndForget('search', () =>
      db.query(
        `WITH folded AS (SELECT left(btrim(search_fold($2)), 60) AS term)
         INSERT INTO search_daily_terms (stat_date, term, searches, zero_result)
         SELECT $1::date, term, 1, $3 FROM folded WHERE char_length(term) >= 2 ${NOT_EXCLUDED_ACTOR('$4')}
         ON CONFLICT (stat_date, term) DO UPDATE
           SET searches = search_daily_terms.searches + 1,
               zero_result = search_daily_terms.zero_result + EXCLUDED.zero_result`,
        [storeDay(), raw.trim(), resultCount === 0 ? 1 : 0, actorId],
      ),
    );
  },

  /** زبونٌ نشط اليوم — صفٌّ واحد لكل (زبون، يوم)؛ الكتابة الأولى فقط في العملية. */
  customerActive(userId: string) {
    if (!config.analytics.trackingEnabled) return;
    const day = storeDay();
    if (day !== activeDay) {
      activeDay = day;
      activeToday.clear();
    }
    const key = `${userId}:${day}`;
    if (activeToday.has(key)) return;
    activeToday.add(key);
    fireAndForget('active', () =>
      db.query(
        `INSERT INTO user_daily_activity (user_id, activity_date) VALUES ($1, $2::date)
         ON CONFLICT (user_id, activity_date) DO NOTHING`,
        [userId, day],
      ),
    );
  },

  customerLogin(userId: string) {
    fireAndForget('login', () =>
      db.query(
        `INSERT INTO user_daily_activity (user_id, activity_date, logins) VALUES ($1, $2::date, 1)
         ON CONFLICT (user_id, activity_date) DO UPDATE SET logins = user_daily_activity.logins + 1`,
        [userId, storeDay()],
      ),
    );
  },

  /**
   * حقبة التتبّع لهذه البيئة — تُزامَن عند الإقلاع مع الإعداد: تُفتح حقبةٌ حين
   * يُشغَّل ولا حقبة مفتوحة، وتُغلق المفتوحة حين يُطفأ. هكذا تعرف التحليلات من
   * أيّ يومٍ بدأ القياس، ولا تملأ ما قبله بأصفار.
   */
  async syncEpoch(): Promise<'opened' | 'closed' | 'unchanged'> {
    if (config.analytics.trackingEnabled) {
      const { rowCount } = await db.query(
        `INSERT INTO analytics_tracking_epochs (enabled_at)
         SELECT now() WHERE NOT EXISTS (SELECT 1 FROM analytics_tracking_epochs WHERE disabled_at IS NULL)`,
      );
      return (rowCount ?? 0) > 0 ? 'opened' : 'unchanged';
    }
    const { rowCount } = await db.query(
      'UPDATE analytics_tracking_epochs SET disabled_at = now() WHERE disabled_at IS NULL',
    );
    return (rowCount ?? 0) > 0 ? 'closed' : 'unchanged';
  },
};
