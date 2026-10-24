import { get, patch } from './client'
import type { AppUpdateAdminView, AppUpdatePolicyInput } from '../types/appVersion'

/** السياسة المحفوظة، وما تراه التطبيقات، ومن غيّرها، وآخر عشر لقطات. */
export function fetchAppVersionSettings(): Promise<AppUpdateAdminView> {
  return get<AppUpdateAdminView>('/admin/settings/app-version')
}

/**
 * «إرسال التحديث»: ينشر السياسة إلى الخادم — لا يرفع شيئاً إلى Google Play.
 * يحمل المراجعة التي فُتحت عليها الصفحة؛ غيرها ⇒ 409 فيُعاد التحميل.
 */
export function updateAppVersionSettings(payload: AppUpdatePolicyInput) {
  return patch<AppUpdateAdminView>('/admin/settings/app-version', payload)
}
