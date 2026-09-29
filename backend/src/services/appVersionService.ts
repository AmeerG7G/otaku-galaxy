import { db } from '../database/pool.js';
import { settingsRepo, type StoreSettings } from '../repositories/settingsRepo.js';
import { parseVersion, isBelowMinimum } from '../utils/semver.js';

/**
 * إجبار التحديث — ثلاثة إعدادات يضبطها المسؤول (STEP 64، هجرة ٠٦٩):
 * مفعَّل؟ والحدّ الأدنى، ورابط التحديث.
 *
 * [CRITICAL] «الحدّ الفعلي» (`minimumSupportedVersion` في الردّ العامّ) فارغٌ
 * في كل حالة شكّ: الإجبار موقوف، أو الحدّ فارغ، أو ليس نسخةً دلالية صالحة، أو
 * تعذّرت قراءة القاعدة. الفارغ = لا حجب، في الخادم (426) وفي التطبيق معاً.
 * الحجب قرارٌ لا رجعة منه داخل التطبيق، فلا يُتّخذ إلا على إعدادٍ صريح صالح.
 */

/** ما يقرؤه تطبيق الزبون من `GET /catalog/app-version`. */
export interface AppVersionConfig {
  forceUpdateEnabled: boolean;
  /** الحدّ الفعلي — فارغ متى لم يكن الإجبار نافذاً. */
  minimumSupportedVersion: string;
  /** الرابط الذي يفتحه زرّ «حدّث» — فارغ = غير مضبوط. */
  updateUrl: string;
  /**
   * حقول النسخ المثبَّتة قبل التبسيط (1.0.0): تقرأ رابطاً لكل منصّة ورسالةً
   * ونسخةً أحدث. تُشتقّ هنا من الإعدادات الجديدة فتواصل تلك النسخ العمل —
   * زرّها يفتح الرابط نفسه، ونصّها الافتراضي يظهر بدل رسالةٍ لم تعد موجودة.
   */
  latestVersion: string;
  androidStoreUrl: string;
  iosStoreUrl: string;
  updateMessage: string;
  updateMessageCkb: string;
}

/** ما تعرضه اللوحة وتحرّره — القيم كما حُفظت، لا الفعلية. */
export interface AppVersionSettings {
  enabled: boolean;
  minimumVersion: string;
  updateUrl: string;
}

const EMPTY: AppVersionConfig = {
  forceUpdateEnabled: false,
  minimumSupportedVersion: '',
  updateUrl: '',
  latestVersion: '',
  androidStoreUrl: '',
  iosStoreUrl: '',
  updateMessage: '',
  updateMessageCkb: '',
};

export function settingsFrom(settings: StoreSettings): AppVersionSettings {
  return {
    enabled: settings.app_force_update_enabled === 'true',
    minimumVersion: settings.app_min_supported_version.trim(),
    updateUrl: settings.app_update_url.trim(),
  };
}

/** الإعداد المحفوظ → ما يراه التطبيق، بقاعدة «لا حجب عند الشكّ». */
export function publicConfigFrom(settings: AppVersionSettings): AppVersionConfig {
  const effective =
    settings.enabled && parseVersion(settings.minimumVersion) !== null ? settings.minimumVersion : '';
  return {
    ...EMPTY,
    forceUpdateEnabled: effective !== '',
    minimumSupportedVersion: effective,
    updateUrl: settings.updateUrl,
    androidStoreUrl: settings.updateUrl,
    iosStoreUrl: settings.updateUrl,
  };
}

/**
 * يُخبّأ ثلاثين ثانية: الوسيط يقرؤه في كل طلب محميّ. `settingsService.update`
 * يُبطله عند الحفظ، فتغيير اللوحة يسري فوراً.
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
      value = publicConfigFrom(settingsFrom(await settingsRepo.getAll(db)));
    } catch {
      // [CRITICAL] تعذّر قراءة الإعداد ليس سبباً لحجب أحد: انقطاعُ القاعدة
      // يجب ألّا يقفل التطبيق على كل مستخدميه.
      value = EMPTY;
    }

    cached = { value, at: now };
    return value;
  },

  /** الإعداد كما حُفظ — للوحة. */
  async settings(): Promise<AppVersionSettings> {
    return settingsFrom(await settingsRepo.getAll(db));
  },

  /**
   * هل يجب إجبار هذه النسخة على التحديث؟ `false` في كل حالة شكّ: إجبارٌ
   * موقوف، حدّ غير صالح، نسخة عميل غائبة أو فاسدة.
   */
  async isUpdateRequired(clientVersion: unknown): Promise<boolean> {
    const { minimumSupportedVersion } = await this.config();
    if (!minimumSupportedVersion) return false;
    return isBelowMinimum(clientVersion, minimumSupportedVersion) === true;
  },
};

export function isValidVersionString(value: string): boolean {
  return parseVersion(value) !== null;
}
