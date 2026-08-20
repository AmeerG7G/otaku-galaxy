import { Button, Card, Result } from 'antd'
import { LogoutOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

export default function DashboardPage() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const clear = useAuthStore((state) => state.clear)

  function handleLogout() {
    clear()
    navigate('/login', { replace: true })
  }

  return (
    <Card style={{ margin: 48 }}>
      <Result
        status="info"
        title="لوحة تحكم مجرات الاوتاكو"
        subTitle={
          user
            ? `مرحباً ${user.username} — بقية الصفحات قيد الإنشاء في المراحل القادمة.`
            : undefined
        }
        extra={
          <Button danger icon={<LogoutOutlined />} onClick={handleLogout}>
            تسجيل الخروج
          </Button>
        }
      />
    </Card>
  )
}