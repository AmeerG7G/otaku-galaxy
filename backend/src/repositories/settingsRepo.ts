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
  'social_description',
] as const;

/**
 * [NOTE] `BUSINESS_SETTING_KEYS` حُذفت بالكامل.
 *
 * كانت تحمل خمسة مفاتيح: ثلاثة لقيم نقاط المجرّة (صارت قواعد ثابتة)، ونسبة
 * خصم الميلاد (صارت ثابتة في `domain/birthday.ts`)، ومهلة فتح التقييم (أُلغيت
 * أصلاً — التقييم يُفتح بالاستلام). لم يبقَ إعداد أعمال رقمي واحد، فبقاءُ
 * القائمة فارغةً مع خدمتها ونقطتها في الـAPI يترك باباً مفتوحاً بلا غرفة
 * خلفه.
 *
 * ما بقي في `store_settings` بياناتٌ نصّية لا قيم أعمال: روابط التواصل
 * وإعدادات نسخة التطبيق.
 */

/**
 * إعدادات نسخة التطبيق — يضبطها المسؤول من لوحة التحكم.
 *
 * [CRITICAL] وجودها في القاعدة لا في الكود هو كل الفائدة: رفعُ الحدّ الأدنى
 * المدعوم بعد نشر نسخة جديدة يصير تغييرَ حقلٍ في اللوحة، لا بناءَ خادم
 * ونشرَه. لو كانت ثابتاً في الكود لاحتاج كل إجبارِ تحديثٍ إصدارَ خادم.
 *
 * نصّية لا رقمية: النسخة `1.10.0` ليست رقماً، والرابط ليس رقماً.
 */
export const APP_VERSION_SETTING_KEYS = [
  'app_min_supported_version',
  'app_latest_version',
  'app_android_store_url',
  'app_ios_store_url',
  'app_update_message',
  // الرسالة نفسها بالكردية — فارغةً يعرض التطبيق نصّه الكردي الافتراضي لا
  // الرسالة العربية (2026-09-27).
  'app_update_message_ckb',
] as const;

export const SETTING_KEYS = [
  ...SOCIAL_SETTING_KEYS,
  ...APP_VERSION_SETTING_KEYS,
] as const;

export type SocialSettingKey = (typeof SOCIAL_SETTING_KEYS)[number];
export type AppVersionSettingKey = (typeof APP_VERSION_SETTING_KEYS)[number];
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
  social_description: '',
  app_min_supported_version: '',
  app_latest_version: '',
  app_android_store_url: '',
  app_ios_store_url: '',
  app_update_message: '',
  app_update_message_ckb: '',
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
