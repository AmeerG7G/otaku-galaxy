import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Spin, Typography } from 'antd'
import { fetchMe } from '../api/authApi'
import { useAuthStore } from '../stores/authStore'

export default function ProtectedRoute() {
  const location = useLocation()
  const token = useAuthStore((state) => state.token)
  const user = useAuthStore((state) => state.user)
  const setUser = useAuthStore((state) => state.setUser)
  const clear = useAuthStore((state) => state.clear)

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
    enabled: Boolean(token) && !user,
    retry: false,
  })

  useEffect(() => {
    if (meQuery.data) {
      setUser(meQuery.data)
    }
  }, [meQuery.data, setUser])

  const isNotAdmin = user !== null && user.role !== 'admin'

  useEffect(() => {
    if (isNotAdmin) {
      clear()
    }
  }, [isNotAdmin, clear])

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (isNotAdmin) {
    return <Navigate to="/login" replace />
  }

  if (!user) {
    if (meQuery.isPending) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16,
            paddingTop: 140,
          }}
        >
          <Spin size="large" />
          <Typography.Text type="secondary">جارٍ استعادة الجلسة…</Typography.Text>
        </div>
      )
    }
    if (meQuery.isError) {
      return (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            paddingTop: 120,
          }}
        >
          <Alert
            type="error"
            showIcon
            message="تعذر استعادة الجلسة"
            description={meQuery.error.message}
            action={
              <Button onClick={() => meQuery.refetch()}>إعادة المحاولة</Button>
            }
          />
        </div>
      )
    }
    return null
  }

  return <Outlet />
}