import type pg from 'pg';

/**
 * المفاتيح المسموح بها — يمنع كتابة مفاتيح عشوائية من الواجهة.
 *
 * القائمة مقسومة قصداً: روابط تواصل (نصّية) وإعدادات أعمال (رقمية). الفصل
 * ليس تجميلاً — المعالج الرقمي يتحقق من المدى ويستبدل القيمة الفاسدة
 * بالافتراضي، والنصّي لا يفعل، فخلطهما يفتح باب حفظ «نقاط = abc».
 */
export const SOCIAL_SETTING_KEYS = [
  'social_tiktok',
  'social_instagram',
  'social_whatsapp',
] as const;

/**
 * إعدادات الأعمال الرقمية.
 *
 * [CRITICAL] هذه إعدادات **تجارية** لا أمنية. أي ثابت أمني (دورات bcrypt،
 * عمر الـJWT، عمر رمز التحقق، حدود المعدّل، سقف حجم الرفع) يبقى في الكود
 * والبيئة عمداً: تحويله إلى إعداد يُحرّره المسؤول من المتصفح يجعل ضعف
 * المنظومة الأمني قابلاً للضبط بنقرة، وهو ما لا يجوز أن يكون ممكناً أصلاً.
 */
export const BUSINESS_SETTING_KEYS = [
  'points_order_received',
  'points_review_approved',
  'points_review_with_photo',
  'birthday_discount_percent',
  'order_rating_delay_hours',
] as const;

export const SETTING_KEYS = [
  ...SOCIAL_SETTING_KEYS,
  ...BUSINESS_SETTING_KEYS,
] as const;

export type SocialSettingKey = (typeof SOCIAL_SETTING_KEYS)[number];
export type BusinessSettingKey = (typeof BUSINESS_SETTING_KEYS)[number];
export type SettingKey = (typeof SETTING_KEYS)[number];

export type StoreSettings = Record<SettingKey, string>;

/**
 * القيمة الفارغة تعني «غير مضبوط» لا «صفر».
 *
 * هذا ما يجعل النشر آمناً: ما دام الصفّ فارغاً يقرأ المعالج الافتراضيَّ
 * المخبوز في الكود، فسلوك المنظومة بعد الترقية مطابق تماماً لما قبلها حتى
 * يقرّر المسؤول تغييره بنفسه.
 */
const EMPTY_SETTINGS: StoreSettings = {
  social_tiktok: '',
  social_instagram: '',
  social_whatsapp: '',
  points_order_received: '',
  points_review_approved: '',
  points_review_with_photo: '',
  birthday_discount_percent: '',
  order_rating_delay_hours: '',
};

export const settingsRepo = {
  async getAll(db: pg.Pool | pg.PoolClient): Promise<StoreSettings> {
    const { rows } = await db.query<{ key: string; value: string }>(
      'SELECT key, value FROM store_settings',
    );
    const settings = { ...EMPTY_SETTINGS };
    for (const row of rows) {
      if ((SETTING_KEYS as readonly string[]).includes(row.key)) {
        settings[row.key as SettingKey] = row.value;
      }
    }
    return settings;
  },

  async setMany(db: pg.Pool | pg.PoolClient, values: Partial<StoreSettings>) {
    const entries = Object.entries(values).filter(([key]) =>
      (SETTING_KEYS as readonly string[]).includes(key),
    );
    for (const [key, value] of entries) {
      await db.query(
        `INSERT INTO store_settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, value ?? ''],
      );
    }
    return this.getAll(db);
  },
};
