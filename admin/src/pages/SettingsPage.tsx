import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Card, Form, Input, Space, Switch } from 'antd'
import {
  LinkOutlined,
  SaveOutlined,
  InstagramOutlined,
  TikTokOutlined,
  WhatsAppOutlined,
} from '@ant-design/icons'
import { fetchSettings, updateSettings } from '../api/communityApi'
import { fetchAppVersionSettings, updateAppVersionSettings } from '../api/appVersionApi'
import type { StoreSettings } from '../types/community'
import { SEMVER_PATTERN, compareVersions, type AppVersionSettings } from '../types/appVersion'
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
        description="روابط التواصل، ورابط مشاركة المنتج، وإجبار تحديث التطبيق."
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

      <AppVersionCard />
    </Space>
  )
}

/**
 * إجبار تحديث التطبيق — ثلاثة حقول (STEP 64 §16).
 *
 * [CRITICAL] التفعيل يحجب التطبيق فوراً عن كل من يشغّل نسخةً أقدم من الحدّ —
 * بلا نشر خادم ولا بناء تطبيق. لذلك يُطلب تأكيدٌ صريح عند التفعيل أو رفع الحدّ
 * (بدل صندوق تحذيرٍ دائم)، والخادم يرفض التفعيل بلا حدٍّ صالح أو بلا رابط:
 * حجبٌ بلا زرٍّ يعمل حبسٌ لا تحديث.
 */
function AppVersionCard() {
  const { message, modal } = App.useApp()
  const queryClient = useQueryClient()
  const [form] = Form.useForm<AppVersionSettings>()
  const enabled = Form.useWatch('enabled', form)

  const query = useQuery({
    queryKey: ['admin-app-version'],
    queryFn: fetchAppVersionSettings,
  })

  useEffect(() => {
    if (query.data) form.setFieldsValue(query.data)
  }, [query.data, form])

  const save = useMutation({
    mutationFn: (values: AppVersionSettings) => updateAppVersionSettings(values),
    onSuccess: async () => {
      message.success('حُفظ إجبار التحديث')
      await queryClient.invalidateQueries({ queryKey: ['admin-app-version'] })
    },
    onError: (error: Error) => message.error(error.message),
  })

  /** يطلب التأكيد حين يزيد الحفظُ الحجبَ: تفعيلٌ جديد أو رفعُ الحدّ وهو مفعَّل. */
  function submit(values: AppVersionSettings) {
    const next: AppVersionSettings = {
      enabled: Boolean(values.enabled),
      minimumVersion: (values.minimumVersion ?? '').trim(),
      updateUrl: (values.updateUrl ?? '').trim(),
    }
    const saved = query.data
    const blocksMore =
      next.enabled &&
      (!saved?.enabled ||
        !saved.minimumVersion ||
        (compareVersions(next.minimumVersion, saved.minimumVersion) ?? 1) > 0)
    if (!blocksMore) {
      save.mutate(next)
      return
    }
    modal.confirm({
      title: 'تفعيل إجبار التحديث؟',
      content: `كل من يشغّل نسخةً أقدم من ${next.minimumVersion} سيرى شاشة التحديث فوراً ولن يستطيع استعمال التطبيق حتى يحدّث. تأكّد أن النسخة الجديدة منشورة على الرابط.`,
      okText: 'تفعيل',
      okButtonProps: { danger: true },
      cancelText: 'إلغاء',
      onOk: () => save.mutateAsync(next),
    })
  }

  return (
    <Card variant="outlined" title="إجبار التحديث" loading={query.isPending}>
      <Form
        form={form}
        layout="vertical"
        style={{ maxWidth: 520 }}
        initialValues={{ enabled: false, minimumVersion: '', updateUrl: '' }}
        onFinish={submit}
      >
        <Form.Item name="enabled" label="إجبار التحديث" valuePropName="checked">
          <Switch checkedChildren="مفعَّل" unCheckedChildren="موقوف" />
        </Form.Item>

        <Form.Item
          name="minimumVersion"
          label="الحدّ الأدنى للنسخة"
          dependencies={['enabled']}
          rules={[
            {
              validator: (_rule, value: string) => {
                if (!value) {
                  return form.getFieldValue('enabled')
                    ? Promise.reject(new Error('أدخل الحدّ الأدنى قبل التفعيل'))
                    : Promise.resolve()
                }
                return SEMVER_PATTERN.test(value)
                  ? Promise.resolve()
                  : Promise.reject(new Error('أدخل نسخة بصيغة 1.2.3'))
              },
            },
          ]}
        >
          <Input dir="ltr" placeholder="1.2.0" />
        </Form.Item>

        <Form.Item
          name="updateUrl"
          label="رابط التحديث"
          dependencies={['enabled']}
          rules={[
            {
              validator: (_rule, value: string) => {
                if (!value) {
                  return form.getFieldValue('enabled')
                    ? Promise.reject(new Error('أدخل رابط التحديث قبل التفعيل'))
                    : Promise.resolve()
                }
                return /^https?:\/\/.+/.test(value)
                  ? Promise.resolve()
                  : Promise.reject(new Error('أدخل رابطاً يبدأ بـ http(s)://'))
              },
            },
          ]}
        >
          <Input dir="ltr" prefix={<LinkOutlined />} placeholder="https://play.google.com/store/apps/details?id=com.otakugalaxy.otaku_galaxy" />
        </Form.Item>

        <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={save.isPending} danger={Boolean(enabled)}>
          حفظ
        </Button>
      </Form>
    </Card>
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
