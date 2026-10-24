import { db, withTransaction } from '../database/pool.js';
import { adminAuditRepo } from '../repositories/adminAuditRepo.js';
import { settingsRepo, type StoreSettings } from '../repositories/settingsRepo.js';
import { AppError, Errors } from '../utils/errors.js';
import { canonicalPlayStoreUrl } from '../utils/playStoreUrl.js';
import { compareVersionStrings, isBelowMinimum, parseVersion } from '../utils/semver.js';

/**
 * سياسة تحديث التطبيق — يضبطها المسؤول من «تحديث التطبيق» في اللوحة.
 *
 * STEP 64 (هجرة ٠٦٩): مفعَّل؟ الحدّ الأدنى، رابط التحديث.
 * STEP 70 (قرار المالك 2026-10-24): يُضاف «أحدث إصدار» ونوع التحديث:
 * - **إجباري**: النسخ دون الحدّ الأدنى تُحجب (شاشة التحديث + 426 على الخادم)،
 *   والنسخ بين الحدّ وأحدث إصدار ترى تنبيهاً اختيارياً.
 * - **اختياري**: لا حجب؛ النسخ دون أحدث إصدار ترى تنبيهاً يُغلق.
 * لا رسالة مسؤول: النصّ نصّ التطبيق المترجَم.
 *
 * [CRITICAL] «لا حجب عند الشكّ»: الحدّ الفعلي (`minimumSupportedVersion` في
 * الردّ العام) فارغٌ ما لم يكن كل شيء صريحاً صالحاً — السياسة مفعّلة، والنوع
 * إجباري، والحدّ نسخة دلالية، والرابط صفحة تطبيقنا على Google Play. حجبٌ بلا
 * زرٍّ يفتح المتجر الصحيح حبسٌ لا تحديث. وتعذّر قراءة القاعدة = لا حجب.
 */

export type UpdateMode = 'optional' | 'mandatory';

/** ما يقرؤه تطبيق الزبون من `GET /catalog/app-version` — القيم **الفعلية**. */
export interface AppVersionConfig {
  /** `true` ⇔ `minimumSupportedVersion` غير فارغ. حقلٌ تقرؤه نسخ STEP 64. */
  forceUpdateEnabled: boolean;
  /** الحدّ الفعلي — فارغ متى لم يكن الحجب نافذاً. */
  minimumSupportedVersion: string;
  /** أحدث إصدار منشور — فارغ متى لم تكن السياسة نافذة. */
  latestVersion: string;
  /** `none` | `optional` (تنبيه دون أحدث إصدار) | `mandatory` (حجب دون الحدّ). */
  updateMode: 'none' | UpdateMode;
  /** صفحة التطبيق على Google Play بشكلها القانوني، أو فارغ. */
  updateUrl: string;
  /** رقم مراجعة السياسة — يزيد مع كل حفظ. */
  revision: number;
  /**
   * حقول النسخ المثبَّتة قبل STEP 64 (1.0.0): تُشتق من الجديدة فتواصل تلك
   * النسخ العمل. `latestVersion` أعلاه تقرؤه تلك النسخ لسطر «النسخة المطلوبة»
   * في شاشة الحجب وحده.
   */
  androidStoreUrl: string;
  iosStoreUrl: string;
  updateMessage: string;
  updateMessageCkb: string;
}

/** السياسة كما حُفظت — ما تعرضه اللوحة وتحرّره. */
export interface AppUpdatePolicy {
  enabled: boolean;
  /** `null` = قيمةٌ محفوظة لا تُعرف (كُتبت خارج اللوحة) ⇒ لا أثر لها. */
  mode: UpdateMode | null;
  latestVersion: string;
  minimumVersion: string;
  updateUrl: string;
}

export interface AppVersionSettings extends AppUpdatePolicy {
  revision: number;
}

export interface AppUpdateHistoryEntry {
  id: string;
  revision: number | null;
  actorName: string;
  createdAt: string;
  /** لقطة السياسة بعد الحفظ (STEP 70+)؛ `null` لصفوفٍ أقدم تحمل الفروق وحدها. */
  policy: AppUpdatePolicy | null;
  changes: Record<string, { before: string; after: string }>;
}

export interface AppUpdateAdminView extends AppVersionSettings {
  /** ما تراه التطبيقات الآن بالضبط. */
  effective: AppVersionConfig;
  /** لماذا لا تحجب سياسةٌ مفعّلة ولا تنبّه — `null` حين لا مشكلة. */
  problem: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  history: AppUpdateHistoryEntry[];
}

/** حفظٌ من اللوحة: ما غاب يبقى كما حُفظ (فالإيقاف `{enabled:false}` لا يفشل أبداً). */
export interface AppUpdatePolicyInput {
  enabled: boolean;
  mode?: UpdateMode;
  latestVersion?: string;
  minimumVersion?: string;
  updateUrl?: string;
  /** المراجعة التي فُتحت عليها الصفحة — غيرها ⇒ 409. */
  revision: number;
}

export const APP_UPDATE_AUDIT_ACTION = 'settings.app_version_updated';

const EMPTY: AppVersionConfig = {
  forceUpdateEnabled: false,
  minimumSupportedVersion: '',
  latestVersion: '',
  updateMode: 'none',
  updateUrl: '',
  revision: 0,
  androidStoreUrl: '',
  iosStoreUrl: '',
  updateMessage: '',
  updateMessageCkb: '',
};

/** ما قبل STEP 70 لم يُحفظ نوعٌ: «مفعَّل» كان يعني الحجب، فالفارغ إجباري. */
function modeFrom(raw: string): UpdateMode | null {
  const value = raw.trim();
  if (value === '' || value === 'mandatory') return 'mandatory';
  if (value === 'optional') return 'optional';
  return null;
}

function revisionFrom(raw: string): number {
  const value = Number(raw.trim());
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function settingsFrom(settings: StoreSettings): AppVersionSettings {
  return {
    enabled: settings.app_force_update_enabled === 'true',
    mode: modeFrom(settings.app_update_mode),
    latestVersion: settings.app_latest_version.trim(),
    minimumVersion: settings.app_min_supported_version.trim(),
    updateUrl: settings.app_update_url.trim(),
    revision: revisionFrom(settings.app_update_revision),
  };
}

/**
 * لماذا لا تُقبل سياسةٌ مفعّلة — أو `null`. القاعدة نفسها للحفظ (400) ولعرض
 * الحالة في اللوحة؛ الموقوفة مقبولة دائماً: الإيقاف هو طريق التراجع.
 */
export function policyProblem(policy: AppUpdatePolicy): string | null {
  if (!policy.enabled) return null;
  if (policy.mode === null) return 'اختر نوع التحديث: اختياري أو إجباري';
  if (!policy.updateUrl) return 'الصق رابط صفحة التطبيق على Google Play قبل التفعيل';
  if (canonicalPlayStoreUrl(policy.updateUrl) === null) {
    return 'رابط التحديث ليس صفحة تطبيقنا على Google Play — الصق رابط الصفحة كما في المتجر';
  }
  // «أحدث إصدار» شرطٌ للاختياري وحده: سياسةٌ إجبارية حُفظت قبل STEP 70 بلا
  // أحدث إصدار تبقى تحجب كما كانت (اللوحة تطلبه في النوعين).
  if (policy.mode === 'optional' && !policy.latestVersion) return 'أدخل أحدث إصدار منشور على Google Play';
  if (policy.latestVersion && parseVersion(policy.latestVersion) === null) return 'أدخل أحدث إصدار بصيغة 1.2.3';
  if (policy.mode === 'mandatory' && !policy.minimumVersion) {
    return 'أدخل الحدّ الأدنى المدعوم قبل تفعيل التحديث الإجباري';
  }
  if (policy.minimumVersion) {
    if (parseVersion(policy.minimumVersion) === null) return 'أدخل الحدّ الأدنى بصيغة 1.2.3';
    // [CRITICAL] حدٌّ أعلى من أحدث إصدار منشور يحجب **كل** نسخة بلا تحديثٍ
    // يفكّه: لا نسخة على المتجر تبلغه.
    if (policy.latestVersion && (compareVersionStrings(policy.minimumVersion, policy.latestVersion) ?? 1) > 0) {
      return 'الحدّ الأدنى أعلى من أحدث إصدار منشور — لن تستطيع أي نسخة تجاوز شاشة التحديث';
    }
  }
  return null;
}

/** السياسة المحفوظة → ما يراه التطبيق، بقاعدة «لا حجب عند الشكّ». */
export function publicConfigFrom(settings: AppVersionSettings): AppVersionConfig {
  // الرابط يُعرض ولو كانت السياسة موقوفة: الموقع يعرضه رابطَ «Google Play».
  const updateUrl = canonicalPlayStoreUrl(settings.updateUrl) ?? '';
  const base: AppVersionConfig = {
    ...EMPTY,
    updateUrl,
    androidStoreUrl: updateUrl,
    iosStoreUrl: updateUrl,
    revision: settings.revision,
  };
  if (policyProblem(settings) !== null || !settings.enabled) return base;

  const minimum = settings.mode === 'mandatory' ? settings.minimumVersion : '';
  return {
    ...base,
    forceUpdateEnabled: minimum !== '',
    minimumSupportedVersion: minimum,
    latestVersion: settings.latestVersion,
    updateMode: minimum !== '' ? 'mandatory' : settings.latestVersion !== '' ? 'optional' : 'none',
  };
}

/** السياسة → قيم `store_settings`. نوعٌ غير معروف يبقى كما حُفظ. */
function toSettings(policy: AppUpdatePolicy, stored: StoreSettings): Partial<StoreSettings> {
  return {
    app_force_update_enabled: policy.enabled ? 'true' : 'false',
    app_update_mode: policy.mode ?? stored.app_update_mode,
    app_latest_version: policy.latestVersion,
    app_min_supported_version: policy.minimumVersion,
    app_update_url: policy.updateUrl,
  };
}

function historyFrom(entry: { id: string; actorName: string; createdAt: string; details: Record<string, unknown> }): AppUpdateHistoryEntry {
  const details = entry.details;
  const raw = details.policy as Record<string, unknown> | undefined;
  const policy: AppUpdatePolicy | null =
    raw && typeof raw === 'object' && typeof raw.enabled === 'boolean'
      ? {
          enabled: raw.enabled,
          mode: raw.mode === 'optional' || raw.mode === 'mandatory' ? raw.mode : null,
          latestVersion: typeof raw.latestVersion === 'string' ? raw.latestVersion : '',
          minimumVersion: typeof raw.minimumVersion === 'string' ? raw.minimumVersion : '',
          updateUrl: typeof raw.updateUrl === 'string' ? raw.updateUrl : '',
        }
      : null;
  return {
    id: entry.id,
    revision: typeof details.revision === 'number' ? details.revision : null,
    actorName: entry.actorName,
    createdAt: entry.createdAt,
    policy,
    changes: (details.changes as AppUpdateHistoryEntry['changes'] | undefined) ?? {},
  };
}

/**
 * يُخبّأ ثلاثين ثانية: الوسيط يقرؤه في كل طلب محميّ. الحفظ يُبطله في هذه
 * العملية فوراً؛ العمليات الأخرى (أكثر من نسخة API) تلحق خلال ثلاثين ثانية.
 */
const CACHE_TTL_MS = 30_000;
let cached: { value: AppVersionConfig; at: number } | null = null;

export function resetAppVersionCache(): void {
  cached = null;
}

const HISTORY_LIMIT = 10;

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

  /** السياسة كما حُفظت، وما تراه التطبيقات، ومن غيّرها ومتى — للوحة. */
  async adminView(): Promise<AppUpdateAdminView> {
    const [settings, audit] = await Promise.all([
      settingsRepo.getAll(db),
      adminAuditRepo.list(db, { page: 1, limit: HISTORY_LIMIT, action: APP_UPDATE_AUDIT_ACTION }),
    ]);
    const saved = settingsFrom(settings);
    const effective = publicConfigFrom(saved);
    const history = audit.items.map(historyFrom);
    return {
      ...saved,
      effective,
      problem:
        policyProblem(saved) ??
        (saved.enabled && effective.updateMode === 'none' ? 'السياسة مفعّلة لكنها لا تحجب ولا تنبّه أحداً' : null),
      updatedAt: history[0]?.createdAt ?? null,
      updatedBy: history[0]?.actorName ?? null,
      history,
    };
  },

  /**
   * ينشر السياسة: قفلٌ، تحقّقٌ من المراجعة، كتابةٌ، وسجلّ نشاط — في معاملة
   * واحدة. لا سياسةٌ نصف مكتوبة، ولا تغييرٌ بلا سجلّ، ولا يكتب مسؤولٌ فوق
   * تغييرٍ لم يره.
   *
   * [CRITICAL] من يملك هذا يملك حجب التطبيق عن كل مستخدميه بحفظةٍ واحدة —
   * المسار خلف صلاحية «الإعدادات».
   */
  async updatePolicy(actorId: string, input: AppUpdatePolicyInput): Promise<AppUpdateAdminView> {
    try {
      await withTransaction(async (tx) => {
        await tx.query(
          `INSERT INTO store_settings (key, value) VALUES ('app_update_revision', '0') ON CONFLICT (key) DO NOTHING`,
        );
        await tx.query(`SELECT value FROM store_settings WHERE key = 'app_update_revision' FOR UPDATE`);

        const stored = await settingsRepo.getAll(tx);
        const current = settingsFrom(stored);
        if (input.revision !== current.revision) {
          throw Errors.conflict(
            'غيّر مسؤولٌ آخر سياسة التحديث بعد أن فتحتَ الصفحة — أعد تحميلها وراجع القيم',
            'APP_UPDATE_POLICY_CHANGED',
          );
        }

        const next: AppUpdatePolicy = {
          enabled: input.enabled,
          mode: input.mode ?? current.mode,
          latestVersion: input.latestVersion ?? current.latestVersion,
          minimumVersion: input.minimumVersion ?? current.minimumVersion,
          updateUrl: input.updateUrl ?? current.updateUrl,
        };
        const problem = policyProblem(next);
        if (problem) throw new AppError(400, 'VALIDATION_ERROR', problem);

        const values = toSettings(next, stored);
        const changes: AppUpdateHistoryEntry['changes'] = {};
        for (const [key, value] of Object.entries(values)) {
          const before = stored[key as keyof StoreSettings];
          if (before !== value) changes[key] = { before, after: value ?? '' };
        }
        if (Object.keys(changes).length === 0) return;

        const revision = current.revision + 1;
        await settingsRepo.setMany(tx, { ...values, app_update_revision: String(revision) });
        await adminAuditRepo.record(tx, {
          actorId,
          action: APP_UPDATE_AUDIT_ACTION,
          targetType: 'settings',
          details: { changes, revision, policy: next },
        });
      });
    } finally {
      resetAppVersionCache();
    }
    return this.adminView();
  },

  /**
   * هل يجب إجبار هذه النسخة على التحديث؟ `false` في كل حالة شكّ: سياسةٌ
   * موقوفة أو اختيارية، حدّ غير صالح، نسخة عميل غائبة أو فاسدة.
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
