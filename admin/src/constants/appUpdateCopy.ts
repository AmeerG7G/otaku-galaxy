/**
 * نصوص شاشة التحديث وتنبيهه **كما يعرضها التطبيق** بالعربية — لمعاينة «تحديث
 * التطبيق» في اللوحة. المصدر `lib/core/l10n/app_strings.dart`؛ يحرس التطابق
 * `AppUpdatesPage.test.tsx` بقراءة ذلك الملف، فتعديل النصّ هناك يُسقط الاختبار
 * هنا بدل أن تعرض المعاينة نصاً لا يراه أحد.
 */
export const APP_UPDATE_COPY = {
  updateRequiredTitle: 'يلزم تحديث التطبيق',
  updateRequiredMessage:
    'صدرت نسخة جديدة من مجرة الأوتاكو، ولم تعد هذه النسخة مدعومة. حدّث التطبيق لمواصلة التسوّق.',
  updateAvailableTitle: 'نسخة جديدة متوفّرة',
  updateAvailableMessage: 'صدرت نسخة أحدث من مجرة الأوتاكو فيها آخر التحسينات. حدّث الآن أو لاحقاً.',
  updateApp: 'تحديث التطبيق',
  updateLater: 'لاحقاً',
  yourVersion: 'نسختك {version}',
  requiredVersion: 'المطلوبة {version}',
  latestVersion: 'الأحدث {version}',
} as const

export type AppUpdateCopyKey = keyof typeof APP_UPDATE_COPY

export function copy(key: AppUpdateCopyKey, version?: string): string {
  return version === undefined ? APP_UPDATE_COPY[key] : APP_UPDATE_COPY[key].replace('{version}', version)
}
