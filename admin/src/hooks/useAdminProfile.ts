import { useQuery } from '@tanstack/react-query'
import { fetchAdminMe } from '../api/adminAccountsApi'
import { useAuthStore } from '../stores/authStore'
import { canAccess, type AdminSection } from '../types/adminPermissions'

export const ADMIN_ME_QUERY_KEY = ['admin-me'] as const

/**
 * ملفّ المسؤول الحالي من الخادم — لا يُحفظ في المتصفح.
 *
 * الصلاحيات تتغيّر من طرف المسؤول الأعلى في أي لحظة، فتُقرأ مع كل جلسة
 * وتُحدَّث بعد دقيقة أو عند العودة إلى النافذة. الخادم يفرضها على كل طلب
 * أصلاً؛ هذا لبناء القائمة وحجب الصفحات فقط.
 */
export function useAdminProfile() {
  const token = useAuthStore((state) => state.token)
  return useQuery({
    queryKey: ADMIN_ME_QUERY_KEY,
    queryFn: fetchAdminMe,
    enabled: Boolean(token),
    staleTime: 60_000,
    retry: false,
  })
}

/** هل يملك المسؤول الحالي أحد الأقسام؟ `false` ما دام الملفّ لم يصل. */
export function useCan(...sections: AdminSection[]): boolean {
  const { data } = useAdminProfile()
  return canAccess(data, ...sections)
}
