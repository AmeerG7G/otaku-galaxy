import { useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Alert, App, Button, Card, Flex, Form, Input, Radio, Switch, Typography } from 'antd'
import { LinkOutlined, SaveOutlined } from '@ant-design/icons'
import { updateSettings } from '../api/communityApi'
import ImageUploadField from './ImageUploadField'
import { useCan } from '../hooks/useAdminProfile'
import type { StoreSettings, WebAppPromoInput } from '../types/community'
import { canonicalPlayStoreUrl, PRODUCTION_PACKAGE_ID } from '../types/appVersion'

/** النصوص التي يعرضها المتجر حين يُترك الحقل فارغاً (`web-store/src/lib/app-promo.ts`). */
const WEB_APP_PROMO_DEFAULTS = {
  title: 'تطبيق مجرة الأوتاكو على Google Play',
  subtitle: 'تسوّق أسرع، وتابع طلباتك وعروضك من هاتفك.',
  cta: 'حمّل التطبيق الآن',
} as const

const PRODUCTION_PLAY_URL = `https://play.google.com/store/apps/details?id=${PRODUCTION_PACKAGE_ID}`

/** صفحة تطبيق الإنتاج على Google Play وحدها — قاعدة الخادم (`officialPlayStoreUrl`). */
function officialPlayStoreUrl(raw: string): string | null {
  const url = canonicalPlayStoreUrl(raw)
  return url === PRODUCTION_PLAY_URL ? url : null
}

const STYLE_COLOURS = {
  violet: { background: '#6D3BC0', color: '#ffffff' },
  night: { background: '#0F0B24', color: '#ffffff' },
} as const

/**
 * إعلان «حمّل التطبيق» في المتجر الإلكتروني — يُظهره المسؤول ويخفيه بلا حذف؛
 * النصوص والرابط تبقى محفوظة وهو مخفيّ. الوجهة صفحة التطبيق على Google Play
 * وحدها (لا APK ولا متجر آخر)، ولا يُظهَر بلا رابط — الخادم يرفض ذلك أيضاً.
 */
export default function WebAppPromoCard({ settings, loading }: { settings?: StoreSettings; loading: boolean }) {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [form] = Form.useForm<WebAppPromoInput>()
  // الرفع مسار الإدارة نفسه (`POST /admin/uploads`) بحارسه كما هو: المنتجات أو البنرات.
  const canUpload = useCan('products', 'banners')

  useEffect(() => {
    if (!settings) return
    form.setFieldsValue({
      web_app_promo_enabled: settings.web_app_promo_enabled === 'true',
      web_app_promo_title: settings.web_app_promo_title ?? '',
      web_app_promo_subtitle: settings.web_app_promo_subtitle ?? '',
      web_app_promo_cta: settings.web_app_promo_cta ?? '',
      web_app_promo_url: settings.web_app_promo_url ?? '',
      web_app_promo_style: settings.web_app_promo_style === 'night' ? 'night' : 'violet',
      web_app_promo_image: settings.web_app_promo_image ?? '',
    })
  }, [settings, form])

  const save = useMutation({
    mutationFn: (values: WebAppPromoInput) =>
      updateSettings({
        web_app_promo_enabled: Boolean(values.web_app_promo_enabled),
        web_app_promo_title: (values.web_app_promo_title ?? '').trim(),
        web_app_promo_subtitle: (values.web_app_promo_subtitle ?? '').trim(),
        web_app_promo_cta: (values.web_app_promo_cta ?? '').trim(),
        web_app_promo_url: (values.web_app_promo_url ?? '').trim(),
        web_app_promo_style: values.web_app_promo_style === 'night' ? 'night' : 'violet',
        web_app_promo_image: (values.web_app_promo_image ?? '').trim(),
      }),
    onSuccess: async () => {
      message.success('حُفظ إعلان التطبيق')
      await queryClient.invalidateQueries({ queryKey: ['admin-settings'] })
    },
    onError: (error: Error) => {
      message.error(error.message)
    },
  })

  const values = Form.useWatch([], form) as Partial<WebAppPromoInput> | undefined
  const style = STYLE_COLOURS[values?.web_app_promo_style === 'night' ? 'night' : 'violet']

  return (
    <Card variant="outlined" title="إعلان التطبيق في المتجر الإلكتروني" loading={loading}>
      <Form form={form} layout="vertical" style={{ maxWidth: 520 }} onFinish={(input) => save.mutate(input)}>
        <Typography.Paragraph type="secondary">
          بطاقة في الصفحة الرئيسية للمتجر الإلكتروني تدعو الزائر لتحميل التطبيق من Google Play. الإخفاء لا يحذف النصوص ولا الرابط.
        </Typography.Paragraph>

        <Form.Item name="web_app_promo_enabled" label="إظهار الإعلان في المتجر" valuePropName="checked">
          <Switch checkedChildren="ظاهر" unCheckedChildren="مخفيّ" />
        </Form.Item>

        <Form.Item
          name="web_app_promo_url"
          label="رابط التطبيق على Google Play"
          extra={`صفحة تطبيق الإنتاج فقط: ${PRODUCTION_PLAY_URL}`}
          dependencies={['web_app_promo_enabled']}
          rules={[
            ({ getFieldValue }) => ({
              validator: (_rule, value: string) => {
                if (!value?.trim()) {
                  return getFieldValue('web_app_promo_enabled')
                    ? Promise.reject(new Error('أدخل رابط التطبيق على Google Play قبل إظهار الإعلان'))
                    : Promise.resolve()
                }
                return officialPlayStoreUrl(value)
                  ? Promise.resolve()
                  : Promise.reject(new Error('الرابط ليس صفحة تطبيق مجرة الأوتاكو على Google Play'))
              },
            }),
          ]}
        >
          <Input dir="ltr" prefix={<LinkOutlined />} placeholder={PRODUCTION_PLAY_URL} />
        </Form.Item>

        <Form.Item name="web_app_promo_title" label="العنوان" rules={[{ max: 60, message: '60 حرفاً على الأكثر' }]}>
          <Input placeholder={WEB_APP_PROMO_DEFAULTS.title} />
        </Form.Item>
        <Form.Item name="web_app_promo_subtitle" label="الوصف" rules={[{ max: 120, message: '120 حرفاً على الأكثر' }]}>
          <Input placeholder={WEB_APP_PROMO_DEFAULTS.subtitle} />
        </Form.Item>
        <Form.Item name="web_app_promo_cta" label="نص الزر" rules={[{ max: 30, message: '30 حرفاً على الأكثر' }]}>
          <Input placeholder={WEB_APP_PROMO_DEFAULTS.cta} />
        </Form.Item>
        <Form.Item name="web_app_promo_style" label="الشكل">
          <Radio.Group
            optionType="button"
            options={[
              { label: 'بنفسجي', value: 'violet' },
              { label: 'ليلي', value: 'night' },
            ]}
          />
        </Form.Item>

        <Form.Item
          name="web_app_promo_image"
          label="صورة الإعلان (اختيارية)"
          extra={
            canUpload
              ? 'تظهر داخل شاشة الهاتف في الإعلان، وإطار الهاتف ثابت لا يتغيّر. صورة طولية بمقاس شاشة الهاتف (مثل 1080×2340)؛ ما يزيد عنها يُقصّ من الأسفل والجانبين. بلا صورة يعرض المتجر لقطة التطبيق الافتراضية.'
              : 'رفع الصور يتطلّب صلاحية المنتجات أو البنرات.'
          }
          normalize={(value: string | null) => value ?? ''}
        >
          <ImageUploadField purpose="banner" allowClear disabled={!canUpload} />
        </Form.Item>

        <Typography.Text type="secondary">معاينة:</Typography.Text>
        <Flex
          data-testid="web-app-promo-preview"
          vertical
          gap={4}
          style={{ ...style, borderRadius: 12, padding: 16, marginBlock: 8 }}
        >
          <strong>{values?.web_app_promo_title?.trim() || WEB_APP_PROMO_DEFAULTS.title}</strong>
          <span style={{ opacity: 0.85 }}>{values?.web_app_promo_subtitle?.trim() || WEB_APP_PROMO_DEFAULTS.subtitle}</span>
          <span style={{ alignSelf: 'flex-start', background: '#ffffff', color: style.background, borderRadius: 999, padding: '4px 14px', fontWeight: 700 }}>
            {values?.web_app_promo_cta?.trim() || WEB_APP_PROMO_DEFAULTS.cta}
          </span>
        </Flex>
        {!values?.web_app_promo_enabled && (
          <Alert type="info" showIcon style={{ marginBlockEnd: 12 }} message="الإعلان مخفيّ عن زوّار المتجر." />
        )}

        <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={save.isPending}>
          حفظ
        </Button>
      </Form>
    </Card>
  )
}
