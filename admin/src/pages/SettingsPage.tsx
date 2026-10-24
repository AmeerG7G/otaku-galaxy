import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Card, Form, Input, Space } from 'antd'
import {
  LinkOutlined,
  SaveOutlined,
  InstagramOutlined,
  TikTokOutlined,
  WhatsAppOutlined,
} from '@ant-design/icons'
import { fetchSettings, updateSettings } from '../api/communityApi'
import type { StoreSettings } from '../types/community'
import { PageHeader } from '../components/ui/PageHeader'

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
      <PageHeader
        title="إعدادات المتجر"
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

      {/* [NOTE] حُذفت بطاقة «إعدادات المتجر» الرقمية بالكامل. كانت تضبط نسبة
          خصم الميلاد ومهلة فتح التقييم؛ الأولى صارت قاعدة ثابتة (٥٪) والثانية
          أُلغيت — التقييم يُفتح بتأكيد الاستلام. لم يبقَ إعداد أعمال رقمي
          واحد، فلا بطاقة له. */}

      <ShareUrlCard settings={settingsQuery.data} loading={settingsQuery.isPending} />

      {/* [NOTE] إجبار التحديث انتقل إلى صفحته «تحديث التطبيق» (STEP 70). */}
    </Space>
  )
}

/**
 * رابط المتجر في رسالة مشاركة المنتج (STEP 64 §19) — يُقرأ في التطبيق من
 * `GET /catalog/settings` فيتغيّر بلا إصدار. الرسالة: اسم المنتج ثم الرابط،
 * بلا سعر. فارغٌ = الاسم وحده.
 */
function ShareUrlCard({ settings, loading }: { settings?: StoreSettings; loading: boolean }) {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [form] = Form.useForm<Pick<StoreSettings, 'store_share_url'>>()

  useEffect(() => {
    if (settings) form.setFieldsValue({ store_share_url: settings.store_share_url ?? '' })
  }, [settings, form])

  const save = useMutation({
    mutationFn: (values: Pick<StoreSettings, 'store_share_url'>) =>
      updateSettings({ store_share_url: (values.store_share_url ?? '').trim() }),
    onSuccess: async () => {
      message.success('حُفظ رابط المشاركة')
      await queryClient.invalidateQueries({ queryKey: ['admin-settings'] })
    },
    onError: (error: Error) => message.error(error.message),
  })

  return (
    <Card variant="outlined" title="مشاركة المنتج" loading={loading}>
      <Form form={form} layout="vertical" style={{ maxWidth: 520 }} onFinish={(values) => save.mutate(values)}>
        <Form.Item
          name="store_share_url"
          label="رابط المتجر للمشاركة"
          rules={[
            {
              validator: (_rule, value: string) =>
                !value || /^https?:\/\/.+/.test(value)
                  ? Promise.resolve()
                  : Promise.reject(new Error('أدخل رابطاً يبدأ بـ http(s):// أو اتركه فارغاً')),
            },
          ]}
        >
          <Input dir="ltr" prefix={<LinkOutlined />} placeholder="https://otakugalaxystore.com" />
        </Form.Item>
        <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={save.isPending}>
          حفظ
        </Button>
      </Form>
    </Card>
  )
}
