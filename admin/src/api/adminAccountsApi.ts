import { get, patch, post, remove } from './client'
import type { Paginated } from '../types/api'
import type {
  AdminProfile,
  AdminPushEvent,
  AdminSection,
  AuditEntry,
  SubAdmin,
} from '../types/adminPermissions'

/** المسؤول الحالي وصلاحياته — تبني منه اللوحة قائمتها وحواجز صفحاتها. */
export function fetchAdminMe(): Promise<AdminProfile> {
  return get<AdminProfile>('/admin/me')
}

export interface UpdateOwnProfileInput {
  username?: string
  phone?: string
  newPassword?: string
  currentPassword?: string
}

/** تعديل الملفّ الشخصي — الردّ يحمل توكناً جديداً إن تغيّرت كلمة المرور. */
export function updateOwnProfile(input: UpdateOwnProfileInput) {
  return patch<{ profile: AdminProfile; token: string | null }>('/admin/me', input)
}

export function listSubAdmins(): Promise<{ items: SubAdmin[] }> {
  return get<{ items: SubAdmin[] }>('/admin/admins')
}

export interface CreateSubAdminInput {
  username: string
  phone: string
  password: string
  permissions: AdminSection[]
}

export function createSubAdmin(input: CreateSubAdminInput): Promise<SubAdmin> {
  return post<SubAdmin>('/admin/admins', input)
}

export interface UpdateSubAdminInput {
  username?: string
  phone?: string
  permissions?: AdminSection[]
  isActive?: boolean
  newPassword?: string
}

export function updateSubAdmin(id: string, input: UpdateSubAdminInput): Promise<SubAdmin> {
  return patch<SubAdmin>(`/admin/admins/${id}`, input)
}

export function deleteSubAdmin(id: string): Promise<null> {
  return remove<null>(`/admin/admins/${id}`)
}

export function listAudit(params: { page: number; limit: number; actorId?: string }) {
  return get<Paginated<AuditEntry>>('/admin/audit', { params })
}

// ── إشعارات هاتف المسؤول ──

export interface AdminPushStatus {
  configured: boolean
  provider: string | null
  devices: number
}

export function fetchPushStatus(): Promise<AdminPushStatus> {
  return get<AdminPushStatus>('/admin/push/status')
}

export function registerAdminDevice(token: string) {
  return post<{ registered: boolean; created: boolean }>('/admin/devices', { token, platform: 'web' })
}

export function unregisterAdminDevice(token: string) {
  return post<{ unregistered: boolean }>('/admin/devices/unregister', { token })
}

export function fetchAdminNotificationPrefs() {
  return get<{ prefs: Record<AdminPushEvent, boolean> }>('/admin/notification-prefs')
}

export function setAdminNotificationPref(key: AdminPushEvent, enabled: boolean) {
  return patch<{ prefs: Record<AdminPushEvent, boolean> }>('/admin/notification-prefs', { key, enabled })
}
