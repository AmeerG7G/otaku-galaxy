import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Form, Input, Typography } from 'antd'
import { LockOutlined, PhoneOutlined } from '@ant-design/icons'
import { login } from '../../api/authApi'
import { ApiError } from '../../api/client'
import { useAuthStore } from '../../stores/authStore'

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
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        padding: 16,
      }}
    >
      <Card style={{ width: 380 }}>
        <Typography.Title level={3} style={{ textAlign: 'center' }}>
          لوحة تحكم مجرات الاوتاكو
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ textAlign: 'center' }}>
          سجّل الدخول بحساب المشرف
        </Typography.Paragraph>
        {errorMessage && (
          <Alert
            type="error"
            showIcon
            message={errorMessage}
            style={{ marginBottom: 16 }}
          />
        )}
        <Form<LoginFormValues>
          layout="vertical"
          requiredMark={false}
          onFinish={handleFinish}
        >
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