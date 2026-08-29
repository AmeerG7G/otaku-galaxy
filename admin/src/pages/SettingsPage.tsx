import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, App, Button, Card, Form, Input, Space, Typography } from 'antd'
import BusinessSettingsCard from '../components/BusinessSettingsCard'
import { InstagramOutlined, SaveOutlined, TikTokOutlined, WhatsAppOutlined } from '@ant-design/icons'
import { fetchSettings, updateSettings } from '../api/communityApi'
import type { StoreSettings } from '../types/community'

/**
 * روابط التواصل التي يفتحها تطبيق العميل. الحقل الفارغ يعني «غير مضبوط»،
 * فيُبقي التطبيق سلوكه الآمن الحالي بدل فتح رابط معطّل.
 */
export default function SettingsPage() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [form] = Form.useForm<StoreSettings>()

  const settingsQuery = useQuery({ queryKey: ['admin-settings'], queryFn: fetchSettings })

  useEffect(() => {
    if (settingsQuery.data) form.setFieldsValue(settingsQuery.data)
  }, [settingsQuery.data, form])

  const save = useMutation({
    mutationFn: (values: StoreSettings) => updateSettings(values),
    onSuccess: async () => {
      message.success('حُفظت الإعدادات')
      await queryClient.invalidateQueries({ queryKey: ['admin-settings'] })
    },
    onError: (error: Error) => message.error(error.message),
  })

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div>
        <Typography.Title level={3} style={{ margin: 0 }}>
          إعدادات المتجر
        </Typography.Title>
        <Typography.Text type="secondary">
          روابط التواصل التي تظهر في صفحة الحساب داخل التطبيق.
        </Typography.Text>
      </div>

      <Alert
        type="info"
        showIcon
        message="اترك الحقل فارغاً إذا لم تكن جاهزاً — التطبيق يعرض «الرابط يُضاف لاحقاً» بدل فتح رابط معطّل."
      />

      <Card variant="outlined" loading={settingsQuery.isPending}>
        <Form
          form={form}
          layout="vertical"
          style={{ maxWidth: 520 }}
          onFinish={(values) => save.mutate(values)}
        >
          <Form.Item
            name="social_tiktok"
            label="تيك توك"
            rules={[
              {
                validator: (_rule, value: string) =>
                  !value || /^https?:\/\/.+/.test(value)
                    ? Promise.resolve()
                    : Promise.reject(new Error('أدخل رابطاً يبدأ بـ http(s):// أو اتركه فارغاً')),
              },
            ]}
          >
            <Input prefix={<TikTokOutlined />} placeholder="https://tiktok.com/@otakugalaxy" />
          </Form.Item>

          <Form.Item
            name="social_instagram"
            label="إنستغرام"
            rules={[
              {
                validator: (_rule, value: string) =>
                  !value || /^https?:\/\/.+/.test(value)
                    ? Promise.resolve()
                    : Promise.reject(new Error('أدخل رابطاً يبدأ بـ http(s):// أو اتركه فارغاً')),
              },
            ]}
          >
            <Input prefix={<InstagramOutlined />} placeholder="https://instagram.com/otakugalaxy" />
          </Form.Item>

          <Form.Item
            name="social_whatsapp"
            label="واتساب"
            extra="رابط wa.me أو رقم دولي مثل +9647701234567"
            rules={[
              {
                validator: (_rule, value: string) =>
                  !value || /^https?:\/\/.+/.test(value) || /^\+?\d{8,15}$/.test(value)
                    ? Promise.resolve()
                    : Promise.reject(new Error('أدخل رابطاً أو رقماً صالحاً أو اتركه فارغاً')),
              },
            ]}
          >
            <Input prefix={<WhatsAppOutlined />} placeholder="+9647701234567" />
          </Form.Item>

          <Button
            type="primary"
            htmlType="submit"
            icon={<SaveOutlined />}
            loading={save.isPending}
          >
            حفظ
          </Button>
        </Form>
      </Card>

      <BusinessSettingsCard />
    </Space>
  )
}
