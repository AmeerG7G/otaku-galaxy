import { db } from '../database/pool.js';
import { settingsRepo } from '../repositories/settingsRepo.js';
import { parseVersion, isBelowMinimum } from '../utils/semver.js';

/**
 * إعدادات نسخة التطبيق كما يقرؤها العميل.
 *
 * القيمة الفارغة تعني «غير مضبوط» لا «صفر» — نفس عقد بقية `store_settings`.
 * ما دام `minimumSupportedVersion` فارغاً لا يُحجب أحد، فنشرُ هذه الترقية
 * لا يغيّر سلوك أي مستخدم حتى يقرّر المسؤول ذلك بنفسه.
 */
export interface AppVersionConfig {
  minimumSupportedVersion: string;
  latestVersion: string;
  androidStoreUrl: string;
  iosStoreUrl: string;
  updateMessage: string;
  /** رسالة التحديث بالكردية — يختار التطبيق بين الاثنتين بلغة واجهته. */
  updateMessageCkb: string;
}

const EMPTY: AppVersionConfig = {
  minimumSupportedVersion: '',
  latestVersion: '',
  androidStoreUrl: '',
  iosStoreUrl: '',
  updateMessage: '',
  updateMessageCkb: '',
};

/**
 * ذاكرة قصيرة الأجل — لأن الوسيط يقرأ هذه الإعدادات في **كل** طلب محميّ.
 *
 * بلا تخبئة يصير كل نداء API استعلامَ قاعدةٍ إضافياً لقراءة خمس قيم لا
 * تتغيّر إلا حين يحرّرها المسؤول. المدة قصيرة عمداً: رفعُ الحدّ الأدنى يسري
 * خلال نصف دقيقة بلا إعادة تشغيل.
 */
const CACHE_TTL_MS = 30_000;
let cached: { value: AppVersionConfig; at: number } | null = null;

export function resetAppVersionCache(): void {
  cached = null;
}

export const appVersionService = {
  async config(): Promise<AppVersionConfig> {
    const now = Date.now();
    if (cached && now - cached.at < CACHE_TTL_MS) return cached.value;

    let value: AppVersionConfig;
    try {
      const settings = await settingsRepo.getAll(db);
      value = {
        minimumSupportedVersion: settings.app_min_supported_version,
        latestVersion: settings.app_latest_version,
        androidStoreUrl: settings.app_android_store_url,
        iosStoreUrl: settings.app_ios_store_url,
        updateMessage: settings.app_update_message,
        updateMessageCkb: settings.app_update_message_ckb,
      };
    } catch {
      // [CRITICAL] تعذّر قراءة الإعداد ليس سبباً لحجب أحد. الإعداد الفارغ
      // = «لا حدّ أدنى» = لا حجب. انقطاعُ القاعدة يجب ألّا يقفل التطبيق
      // على كل مستخدميه.
      value = EMPTY;
    }

    cached = { value, at: now };
    return value;
  },

  /**
   * هل يجب إجبار هذه النسخة على التحديث؟
   *
   * تُعيد `false` في كل حالة شكّ: حدّ غير مضبوط، حدّ فاسد، نسخة عميل غائبة
   * أو غير صالحة. الحجب قرارٌ لا رجعة فيه من داخل التطبيق، فلا يُتّخذ إلا
   * على مقارنةٍ صريحة بين نسختين صالحتين.
   */
  async isUpdateRequired(clientVersion: unknown): Promise<boolean> {
    const { minimumSupportedVersion } = await this.config();
    if (!minimumSupportedVersion) return false;
    return isBelowMinimum(clientVersion, minimumSupportedVersion) === true;
  },

  /** الرابط الموافق للمنصّة، مع الرجوع إلى الآخر إن لم يُضبط إلا واحد. */
  storeUrlFor(platform: string | undefined, config: AppVersionConfig): string {
    const ios = platform === 'ios';
    const preferred = ios ? config.iosStoreUrl : config.androidStoreUrl;
    if (preferred) return preferred;
    return ios ? config.androidStoreUrl : config.iosStoreUrl;
  },
};

/** يتحقق أن نصّاً صالح كنسخة دلالية — تستعمله طبقة التحقق في اللوحة. */
export function isValidVersionString(value: string): boolean {
  return parseVersion(value) !== null;
}
