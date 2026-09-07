import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Form, Input, Typography } from 'antd'
import { LockOutlined, PhoneOutlined } from '@ant-design/icons'
import { login } from '../../api/authApi'
import { ApiError } from '../../api/client'
import { useAuthStore } from '../../stores/authStore'
import { brand } from '../../theme'
import { BrandMark } from '../../layouts/AppLayout'

interface LoginFormValues {
  phone: string
  password: string
}

export default function LoginPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const token = useAuthStore((state) => state.token)
  const setSession = useAuthStore((state) => state.setSession)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  if (token) {
    return <Navigate to="/" replace state={{ from: location }} />
  }

  async function handleFinish(values: LoginFormValues) {
    setSubmitting(true)
    setErrorMessage(null)
    try {
      const result = await login(values.phone, values.password)
      if (result.user.role !== 'admin') {
        setErrorMessage(
          'هذا الحساب ليس حساب إدارة — يُسمح بدخول لوحة التحكم للمشرفين فقط.',
        )
        return
      }
      setSession(result.token, result.user)
      navigate('/', { replace: true })
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError ? error.message : 'حدث خطأ غير متوقع',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: 16,
        overflow: 'hidden',
        background:
          'radial-gradient(1200px 700px at 85% -10%, #2A1B52 0%, transparent 60%), radial-gradient(900px 600px at -10% 110%, #3A1360 0%, transparent 55%), linear-gradient(160deg, #180F30 0%, #241743 100%)',
      }}
    >
      {/* هالة لونية مقتضبة — لا زخرفة تُلهي عن تسجيل الدخول. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          width: 420,
          height: 420,
          borderRadius: '50%',
          top: -140,
          right: -120,
          background: 'radial-gradient(circle, rgba(124,92,255,.35) 0%, transparent 70%)',
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'absolute',
          width: 380,
          height: 380,
          borderRadius: '50%',
          bottom: -150,
          left: -100,
          background: 'radial-gradient(circle, rgba(255,61,143,.28) 0%, transparent 70%)',
        }}
      />

      <Card
        style={{
          width: 400,
          maxWidth: '100%',
          boxShadow: '0 24px 70px rgba(0,0,0,.45)',
          borderColor: 'rgba(255,255,255,.08)',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
            marginBottom: 20,
          }}
        >
          <div style={{ marginBottom: 6 }}>
            <BrandMark />
          </div>
          <Typography.Title level={3} style={{ margin: 0, fontWeight: 800 }}>
            مجرات الاوتاكو
          </Typography.Title>
          <Typography.Text style={{ color: brand.textSecondary }}>
            لوحة تحكم الإدارة — سجّل الدخول بحساب المشرف
          </Typography.Text>
        </div>

        {errorMessage && (
          <Alert
            type="error"
            showIcon
            message={errorMessage}
            style={{ marginBottom: 16 }}
          />
        )}
        <Form<LoginFormValues> layout="vertical" requiredMark={false} onFinish={handleFinish}>
          <Form.Item
            name="phone"
            label="رقم الهاتف"
            rules={[
              { required: true, message: 'أدخل رقم الهاتف' },
              { pattern: /^07\d{9}$/, message: 'رقم الهاتف غير صالح' },
            ]}
          >
            <Input
              prefix={<PhoneOutlined />}
              placeholder="07XXXXXXXXX"
              maxLength={11}
              disabled={submitting}
            />
          </Form.Item>
          <Form.Item
            name="password"
            label="كلمة المرور"
            rules={[{ required: true, message: 'أدخل كلمة المرور' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="••••••••"
              disabled={submitting}
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={submitting}>
            تسجيل الدخول
          </Button>
        </Form>
      </Card>
    </div>
  )
}