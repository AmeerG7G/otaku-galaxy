import { get, patch } from './client'
import type { AppVersionSettings } from '../types/appVersion'

export function fetchAppVersionSettings(): Promise<AppVersionSettings> {
  return get<AppVersionSettings>('/admin/settings/app-version')
}

/** الحقول الثلاثة كلها في كل حفظ — الخادم يتحقّق من اتّساقها معاً. */
export function updateAppVersionSettings(payload: AppVersionSettings) {
  return patch<AppVersionSettings>('/admin/settings/app-version', payload)
}
