import { get, patch } from './client'
import type { AppVersionConfig, AppVersionSettingsPayload } from '../types/appVersion'

export function fetchAppVersionSettings(): Promise<AppVersionConfig> {
  return get<AppVersionConfig>('/admin/settings/app-version')
}

export function updateAppVersionSettings(payload: AppVersionSettingsPayload) {
  return patch<AppVersionConfig>('/admin/settings/app-version', payload)
}
