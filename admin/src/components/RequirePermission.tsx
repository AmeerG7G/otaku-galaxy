import type { ReactNode } from 'react'
import { Button, Result } from 'antd'
import { Link } from 'react-router-dom'
import { useAdminProfile } from '../hooks/useAdminProfile'
import { firstAllowedPath } from '../layouts/nav'
import { canAccess, type AdminSection } from '../types/adminPermissions'
import PageLoader from './PageLoader'

/**
 * حاجز الصفحة: من لا يملك القسم يرى «لا تملك صلاحية» لا الصفحة.
 *
 * [SECURITY] راحةٌ لا حماية — رابطٌ محفوظ أو مكتوب باليد يصل هنا، والخادم
 * يرفض كل طلبات الصفحة بـ`ADMIN_PERMISSION_DENIED` في كل الأحوال. الحاجز يمنع
 * صفحةً نصف محمّلة مليئة برسائل الرفض.
 */
export default function RequirePermission({
  section,
  children,
}: {
  section: AdminSection
  children: ReactNode
}) {
  const { data: profile, isPending } = useAdminProfile()
  if (isPending) return <PageLoader />
  if (canAccess(profile, section)) return <>{children}</>
  const home = firstAllowedPath(profile)
  return (
    <Result
      status="403"
      title="لا تملك صلاحية هذا القسم"
      subTitle="اطلب الصلاحية من المسؤول الأعلى إن كنت تحتاجها."
      extra={
        home ? (
          <Link to={home}>
            <Button type="primary">الانتقال إلى قسمٍ متاح</Button>
          </Link>
        ) : null
      }
    />
  )
}
