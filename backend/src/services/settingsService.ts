import { config } from '../config/index.js';
import { db } from '../database/pool.js';
import { settingsRepo, type StoreSettings } from '../repositories/settingsRepo.js';
import { AppError } from '../utils/errors.js';
import { officialPlayStoreUrl } from '../utils/playStoreUrl.js';
import { resetAppVersionCache } from './appVersionService.js';

/** شكلا إعلان التطبيق — بنفسجيّ العلامة أو أرضيّة الشعار الليلية. الفارغ = البنفسجي. */
export const WEB_APP_PROMO_STYLES = ['violet', 'night'] as const;
export type WebAppPromoStyle = (typeof WEB_APP_PROMO_STYLES)[number];

/**
 * إعلان «حمّل التطبيق» كما يقرؤه المتجر الإلكتروني، أو `null` فيُخفى.
 *
 * [SECURITY] الرابط يُعاد فحصه عند القراءة لا عند الحفظ وحده: صفٌّ كُتب في
 * القاعدة يدوياً أو بنسخةٍ أقدم لا يصل الجمهورَ إلا وهو صفحة تطبيق الإنتاج
 * على Google Play — لا APK ولا متجر آخر.
 */
export function publicWebAppPromo(settings: StoreSettings) {
  if (settings.web_app_promo_enabled !== 'true') return null;
  const url = officialPlayStoreUrl(settings.web_app_promo_url);
  if (url === null) return null;
  const style: WebAppPromoStyle = (WEB_APP_PROMO_STYLES as readonly string[]).includes(settings.web_app_promo_style)
    ? (settings.web_app_promo_style as WebAppPromoStyle)
    : 'violet';
  return {
    title: settings.web_app_promo_title,
    subtitle: settings.web_app_promo_subtitle,
    cta: settings.web_app_promo_cta,
    url,
    style,
  };
}

export const settingsService = {
  /** إعدادات المتجر العامة — يقرأها تطبيق العميل بلا مصادقة. */
  async publicSettings() {
    const settings = await settingsRepo.getAll(db);
    return {
      social: {
        tiktok: settings.social_tiktok,
        instagram: settings.social_instagram,
        whatsapp: settings.social_whatsapp,
        description: settings.social_description,
      },
      // رابط المتجر في رسالة مشاركة المنتج — فارغٌ = الاسم وحده (STEP 64).
      share: { storeUrl: settings.store_share_url },
      // [D3] التطبيق لا يرسل أي إشارة تتبّع إلا والخادم يقول إنه مُشغَّل.
      tracking: { enabled: config.analytics.trackingEnabled },
      // إعلان التطبيق في المتجر الإلكتروني؛ `null` = مخفيّ. التطبيق لا يقرؤه.
      webAppPromo: publicWebAppPromo(settings),
    };
  },

  async getAll() {
    return settingsRepo.getAll(db);
  },

  async update(values: Partial<StoreSettings>) {
    // التفعيل يُفحص على الإعداد بعد دمج المحفوظ: إرسال `enabled` وحده يكفي
    // ما دام الرابط محفوظاً، وإعلانٌ مفعَّل لا يبقى بلا وجهة. الإخفاء لا يُرفض أبداً.
    const merged = { ...(await settingsRepo.getAll(db)), ...values };
    if (merged.web_app_promo_enabled === 'true' && officialPlayStoreUrl(merged.web_app_promo_url) === null) {
      throw new AppError(400, 'VALIDATION_ERROR', 'أدخل رابط التطبيق على Google Play قبل إظهار الإعلان');
    }
    const saved = await settingsRepo.setMany(db, values);
    // إعدادات النسخة مخبّأة ثلاثين ثانية لأن الوسيط يقرؤها كل طلب؛ إبطالها
    // هنا يجعل تغيير الحدّ الأدنى من اللوحة يسري فوراً لا بعد انتهاء المدة.
    resetAppVersionCache();
    return saved;
  },
};
