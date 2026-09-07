import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, App, Button, Card, Form, Input, Space } from 'antd'
import {
  SaveOutlined,
  InstagramOutlined,
  TikTokOutlined,
  WhatsAppOutlined,
  AndroidOutlined,
  AppleOutlined,
  CloudDownloadOutlined,
} from '@ant-design/icons'
import { fetchSettings, updateSettings } from '../api/communityApi'
import { fetchAppVersionSettings, updateAppVersionSettings } from '../api/appVersionApi'
import type { StoreSettings } from '../types/community'
import type { AppVersionSettingsPayload } from '../types/appVersion'
import { SEMVER_PATTERN, compareVersions } from '../types/appVersion'
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
        description="روابط التواصل ووصف الحساب التي تظهر في التطبيق، وإعدادات نسخة التطبيق."
      />

      <Alert
        type="info"
        showIcon
        message="اترك الحقل فارغاً إذا لم تكن جاهزاً — التطبيق يعرض «الرابط يُضاف لاحقاً» بدل فتح رابط معطّل."
      />

      {/*
        الأيقونة والرابط يُضبطان في مكانين مختلفين لأنهما شيئان مختلفان:
        الرابط نصٌّ في إعدادات المتجر، والأيقونة صورةٌ مرفوعة تديرها منظومة
        الفتحات البصرية نفسها التي تدير بقية رسوم التطبيق. نسخُ رفع الصور
        إلى هنا كان سيصنع منظومة رفعٍ ثانية موازية. ما ينقص هو الإشارة —
        فمن يبحث عن أيقونة تيك توك لا يخطر له أنها تحت «رسوم الشخصيات».
      */}
      <Alert
        type="info"
        showIcon
        message="أيقونات تيك توك وإنستغرام وواتساب تُرفع من صفحة «رسوم الشخصيات»"
        description={
          <>
            هذه الصفحة تضبط <b>الروابط</b>. أمّا <b>صور الأيقونات</b> فتُرفع من{' '}
            <Link to="/visuals">رسوم الشخصيات → مجموعة «الحساب»</Link> (فتحات:
            أيقونة تيك توك، أيقونة إنستغرام، أيقونة واتساب). ما دامت الأيقونة غير
            مرفوعة يعرض التطبيق أيقونته الافتراضية، والرابط يعمل كالمعتاد.
          </>
        }
      />

      <Card variant="outlined" loading={settingsQuery.isPending}>
        <Form
          form={form}
          layout="vertical"
          style={{ maxWidth: 520 }}
          onFinish={(values) => save.mutate(values)}
        >
          <Form.Item
            name="social_description"
            label="وصف الحساب"
            extra="سطرٌ قصير يظهر أسفل اسم المتجر في صفحة الحساب داخل التطبيق — 60 حرفاً كحد أقصى."
            rules={[{ max: 60 }]}
          >
            <Input.TextArea
              rows={2}
              showCount
              maxLength={60}
              placeholder="متجر أقيم عالمياً… شحن سريع بكل المحافظات"
            />
          </Form.Item>
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

      <AppVersionCard />
    </Space>
  )
}

/**
 * إجبار تحديث التطبيق.
 *
 * [CRITICAL] رفعُ «الحدّ الأدنى» يحجب التطبيق فوراً عن كل من يشغّل نسخةً
 * أقدم — بلا نشر خادم ولا بناء تطبيق. لذلك: تحقّقٌ من الصيغة قبل الحفظ،
 * وتحذيرٌ صريح حين يتجاوز الحدُّ أحدثَ نسخةٍ معلنة (وهي الحالة التي تحجب
 * الجميع بلا استثناء لأن لا أحد يملك نسخةً تكفي).
 */
function AppVersionCard() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [form] = Form.useForm<AppVersionSettingsPayload>()

  const query = useQuery({
    queryKey: ['admin-app-version'],
    queryFn: fetchAppVersionSettings,
  })

  useEffect(() => {
    if (!query.data) return
    form.setFieldsValue({
      app_min_supported_version: query.data.minimumSupportedVersion,
      app_latest_version: query.data.latestVersion,
      app_android_store_url: query.data.androidStoreUrl,
      app_ios_store_url: query.data.iosStoreUrl,
      app_update_message: query.data.updateMessage,
    })
  }, [query.data, form])

  const save = useMutation({
    mutationFn: (values: AppVersionSettingsPayload) => updateAppVersionSettings(values),
    onSuccess: async () => {
      message.success('حُفظت إعدادات النسخة')
      await queryClient.invalidateQueries({ queryKey: ['admin-app-version'] })
    },
    onError: (error: Error) => message.error(error.message),
  })

  const semverRule = {
    validator: (_rule: unknown, value: string) =>
      !value || SEMVER_PATTERN.test(value)
        ? Promise.resolve()
        : Promise.reject(new Error('أدخل نسخة بصيغة 1.2.3 أو اتركها فارغة')),
  }

  const urlRule = {
    validator: (_rule: unknown, value: string) =>
      !value || /^https?:\/\/.+/.test(value)
        ? Promise.resolve()
        : Promise.reject(new Error('أدخل رابطاً يبدأ بـ http(s):// أو اتركه فارغاً')),
  }

  return (
    <Card
      variant="outlined"
      title="نسخة التطبيق وإجبار التحديث"
      loading={query.isPending}
    >
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message="رفع «الحدّ الأدنى» يحجب التطبيق فوراً عن كل من يشغّل نسخة أقدم."
        description="اتركه فارغاً ما لم تكن النسخة الجديدة منشورة فعلاً في المتجر — الحقل الفارغ يعني «بلا إجبار»."
      />
      <Form
        form={form}
        layout="vertical"
        style={{ maxWidth: 520 }}
        onFinish={(values) => save.mutate(values)}
      >
        <Form.Item
          name="app_min_supported_version"
          label="الحدّ الأدنى المدعوم"
          extra="أي نسخة أقدم من هذه ترى شاشة تحديث إجبارية ولا تستطيع استعمال التطبيق."
          rules={[
            semverRule,
            {
              // المقارنة رقمية لا نصّية: `1.10.0` أحدث من `1.9.0`.
              validator: (_rule, value: string) => {
                const latest = form.getFieldValue('app_latest_version') as string
                if (!value || !latest) return Promise.resolve()
                const order = compareVersions(value, latest)
                return order === 1
                  ? Promise.reject(
                      new Error('الحدّ الأدنى أعلى من أحدث نسخة — سيُحجب كل المستخدمين'),
                    )
                  : Promise.resolve()
              },
            },
          ]}
        >
          <Input placeholder="1.2.0" />
        </Form.Item>

        <Form.Item
          name="app_latest_version"
          label="أحدث نسخة متوفّرة"
          extra="تُعرض للمستخدم في شاشة التحديث."
          rules={[semverRule]}
        >
          <Input prefix={<CloudDownloadOutlined />} placeholder="1.3.0" />
        </Form.Item>

        <Form.Item name="app_android_store_url" label="رابط متجر أندرويد" rules={[urlRule]}>
          <Input
            prefix={<AndroidOutlined />}
            placeholder="https://play.google.com/store/apps/details?id=com.otakugalaxy.otaku_galaxy"
          />
        </Form.Item>

        <Form.Item name="app_ios_store_url" label="رابط متجر آبل" rules={[urlRule]}>
          <Input prefix={<AppleOutlined />} placeholder="https://apps.apple.com/app/id000000000" />
        </Form.Item>

        <Form.Item
          name="app_update_message"
          label="رسالة التحديث"
          extra="اتركها فارغة لاستعمال الرسالة الافتراضية داخل التطبيق."
          rules={[{ max: 300 }]}
        >
          <Input.TextArea rows={2} showCount maxLength={300} />
        </Form.Item>

        <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={save.isPending}>
          حفظ إعدادات النسخة
        </Button>
      </Form>
    </Card>
  )
}
