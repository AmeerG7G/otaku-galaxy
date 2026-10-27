import { useState } from 'react'
import {
  App,
  Button,
  Card,
  ColorPicker,
  Flex,
  Form,
  Image,
  Input,
  InputNumber,
  Space,
  Switch,
  Tag,
  Tooltip,
  Typography,
  Upload,
} from 'antd'
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  PlusOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import { uploadImage } from '../api/uploadsApi'
import { isValidImageRef, resolveMediaUrl } from '../utils/media'
import { NO_IMAGE_PLACEHOLDER } from './ui/placeholder'
import { ColorSwatch } from './ui/ColorSwatch'
import {
  HEX_COLOR,
  MAX_COLOR_NAME,
  MAX_VARIANT_STOCK,
  MAX_VARIANTS,
  colorNameKey,
  emptyVariantFields,
  type VariantFields,
} from './variantFields'

/**
 * صورة لونٍ واحد — رفعٌ من الجهاز أو رابطٌ مستضاف، مع معاينة.
 *
 * [CRITICAL] كل لونٍ يرفع صورته **وحده**: الحالة (`uploading`) لكل صفّ، والرابط
 * العائد يُكتب في الصفّ الذي يحمل `rowKey` نفسه في النموذج **عند انتهاء الرفع** —
 * لا في الموضع الذي بدأ منه. نقلُ صفٍّ أو حذف صفٍّ قبله أثناء الرفع كان سيضع
 * الصورة على لونٍ آخر لو كُتبت بالموضع.
 */
function VariantImageInput({
  value,
  onChange,
  rowKey,
  label,
}: {
  value?: string
  onChange?: (value: string) => void
  rowKey: string
  label: string
}) {
  const { message } = App.useApp()
  const form = Form.useFormInstance()
  const [uploading, setUploading] = useState(false)

  async function handleUpload(file: File) {
    setUploading(true)
    try {
      const url = await uploadImage(file, 'product')
      const rows = (form.getFieldValue('variants') ?? []) as VariantFields[]
      const index = rows.findIndex((row) => row?.rowKey === rowKey)
      if (index < 0) {
        message.warning('حُذف اللون قبل اكتمال رفع صورته — لم تُحفظ الصورة')
      } else {
        form.setFieldValue(['variants', index, 'imageUrl'], url)
        void form.validateFields([['variants', index, 'imageUrl']]).catch(() => undefined)
        message.success('رُفعت الصورة')
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'تعذر رفع الصورة')
    } finally {
      setUploading(false)
    }
    return false
  }

  return (
    <Flex gap={12} align="flex-start" wrap>
      <Image
        src={resolveMediaUrl(value) ?? NO_IMAGE_PLACEHOLDER}
        alt={label}
        width={72}
        height={72}
        style={{ objectFit: 'cover', borderRadius: 8, border: '1px solid var(--og-border)' }}
        fallback={NO_IMAGE_PLACEHOLDER}
        preview={Boolean(value)}
      />
      <Space direction="vertical" size={6} style={{ flex: 1, minWidth: 220 }}>
        <Upload
          accept="image/jpeg,image/png,image/webp"
          showUploadList={false}
          beforeUpload={handleUpload}
          disabled={uploading}
        >
          <Button icon={<UploadOutlined />} loading={uploading} aria-label={`رفع ${label}`}>
            رفع صورة اللون
          </Button>
        </Upload>
        <Input
          value={value ?? ''}
          onChange={(event) => onChange?.(event.target.value)}
          placeholder="أو ألصق رابط صورة مستضافة خارجياً"
          aria-label={`رابط ${label}`}
          disabled={uploading}
        />
      </Space>
    </Flex>
  )
}

/**
 * محرّر ألوان المنتج (STEP 74) — لكل لونٍ اسمه وصورته ومخزونه.
 *
 * `stockBase` مخزون كل لونٍ قائم كما فُتحت عليه الصفحة (يُعرض «المخزون الحالي»).
 */
export default function VariantsEditor({ stockBase = {} }: { stockBase?: Readonly<Record<string, number>> }) {
  const form = Form.useFormInstance()
  const rows = (Form.useWatch('variants', form) ?? []) as VariantFields[]

  /**
   * التكرار يقرأ الصفوف الأخرى: تغيُّر اسمٍ قد يُسقط خطأ «مكرّر» عن أخيه أو
   * يُظهره — يُعاد فحص الأسماء التي عليها خطأٌ ظاهر فقط (كـ`OptionsEditor`)،
   * لا كل الحقول مع كل حرف.
   */
  function revalidateNames(changed: number) {
    const all = (form.getFieldValue('variants') ?? []) as VariantFields[]
    const shown = all
      .map((_, index) => ['variants', index, 'colorName'])
      .filter((path) => path[1] !== changed && form.getFieldError(path).length > 0)
    if (shown.length > 0) void form.validateFields(shown).catch(() => undefined)
  }

  return (
    <Form.List name="variants">
      {(fields, { add, remove, move }) => (
        <>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
            لكل لونٍ صورته ومخزونه — شراء لونٍ ينقص مخزونه وحده. حين يكون للمنتج ألوان يصبح
            مخزونه مجموع مخزون ألوانه النشطة ولا يُعدَّل مباشرةً. حذف لونٍ سبق أن طُلب لا يمحوه:
            يُعطَّل ويبقى في سجل الطلبات؛ واللون الذي لم يُطلب قط يُحذف عند الحفظ.
          </Typography.Paragraph>
          {fields.map((field, index) => {
            const row = rows[field.name]
            const existingId = row?.id
            const opened = existingId ? stockBase[existingId] : undefined
            const label = `صورة اللون ${index + 1}`
            return (
              <Card
                key={field.key}
                size="small"
                data-testid="variant-row"
                title={
                  <Space size={8} wrap>
                    <ColorSwatch hex={row?.colorHex} />
                    <span>{`اللون ${index + 1}`}</span>
                    {row?.colorName?.trim() && (
                      <Typography.Text type="secondary">— {row.colorName.trim()}</Typography.Text>
                    )}
                    {existingId ? (
                      opened !== undefined && <Tag>{`المخزون الحالي: ${opened}`}</Tag>
                    ) : (
                      <Tag color="blue">لون جديد</Tag>
                    )}
                    {row?.isActive === false && <Tag color="default">معطّل</Tag>}
                  </Space>
                }
                extra={
                  <Space size={0}>
                    <Button
                      type="text"
                      icon={<ArrowUpOutlined />}
                      aria-label="نقل اللون للأعلى"
                      disabled={index === 0}
                      onClick={() => move(index, index - 1)}
                    />
                    <Button
                      type="text"
                      icon={<ArrowDownOutlined />}
                      aria-label="نقل اللون للأسفل"
                      disabled={index === fields.length - 1}
                      onClick={() => move(index, index + 1)}
                    />
                    <Tooltip
                      title={
                        existingId
                          ? 'إن سبق أن طُلب هذا اللون يُعطَّل بدل الحذف ويبقى في سجل الطلبات'
                          : undefined
                      }
                    >
                      <Button
                        danger
                        type="text"
                        icon={<DeleteOutlined />}
                        aria-label="حذف اللون"
                        onClick={() => remove(field.name)}
                      />
                    </Tooltip>
                  </Space>
                }
                style={{ marginBottom: 8 }}
              >
                <Form.Item name={[field.name, 'rowKey']} hidden>
                  <Input />
                </Form.Item>
                <Form.Item name={[field.name, 'id']} hidden>
                  <Input />
                </Form.Item>
                <Space wrap align="start" style={{ display: 'flex' }}>
                  <Form.Item
                    name={[field.name, 'colorName']}
                    label="اسم اللون بالعربي"
                    rules={[
                      { required: true, whitespace: true, message: 'اسم اللون مطلوب' },
                      { max: MAX_COLOR_NAME, message: `اسم اللون طويل جداً (${MAX_COLOR_NAME} حرفاً كحد أقصى)` },
                      ({ getFieldValue }) => ({
                        validator(_, value: string | undefined) {
                          const key = colorNameKey(value)
                          if (!key) return Promise.resolve()
                          const all = (getFieldValue('variants') ?? []) as VariantFields[]
                          const duplicate = all.some(
                            (other, otherIndex) => otherIndex !== field.name && colorNameKey(other?.colorName) === key,
                          )
                          return duplicate
                            ? Promise.reject(new Error('اسم اللون مكرّر في هذا المنتج'))
                            : Promise.resolve()
                        },
                      }),
                    ]}
                    style={{ minWidth: 200 }}
                  >
                    <Input
                      lang="ar"
                      dir="rtl"
                      placeholder="مثال: أحمر"
                      onChange={() => setTimeout(() => revalidateNames(field.name))}
                    />
                  </Form.Item>
                  <Form.Item
                    name={[field.name, 'colorNameCkb']}
                    label="اسم اللون بالكردية (اختياري)"
                    rules={[
                      {
                        max: MAX_COLOR_NAME,
                        message: `اسم اللون بالكردية طويل جداً (${MAX_COLOR_NAME} حرفاً كحد أقصى)`,
                      },
                    ]}
                    style={{ minWidth: 200 }}
                  >
                    <Input lang="ckb" dir="rtl" />
                  </Form.Item>
                  <Form.Item
                    label="رمز اللون (اختياري)"
                    tooltip="يظهر مربّعاً بهذا اللون بجانب الاسم. بالصيغة ‎#RRGGBB‎."
                    required={false}
                    style={{ minWidth: 200 }}
                  >
                    <Space.Compact>
                      <Form.Item
                        name={[field.name, 'colorHex']}
                        noStyle
                        rules={[
                          {
                            validator: (_, value: string | undefined) =>
                              !(value ?? '').trim() || HEX_COLOR.test((value ?? '').trim())
                                ? Promise.resolve()
                                : Promise.reject(new Error('رمز اللون بالصيغة ‎#RRGGBB‎ (مثال: ‎#FF0000‎)')),
                          },
                        ]}
                      >
                        <Input
                          dir="ltr"
                          placeholder="#FF0000"
                          aria-label={`رمز اللون ${index + 1}`}
                          style={{ width: 120 }}
                        />
                      </Form.Item>
                      <ColorPicker
                        value={row?.colorHex && HEX_COLOR.test(row.colorHex) ? row.colorHex : undefined}
                        disabledAlpha
                        onChangeComplete={(color) => {
                          form.setFieldValue(['variants', field.name, 'colorHex'], color.toHexString().toUpperCase())
                          void form.validateFields([['variants', field.name, 'colorHex']]).catch(() => undefined)
                        }}
                      />
                    </Space.Compact>
                  </Form.Item>
                </Space>
                <Form.Item
                  name={[field.name, 'imageUrl']}
                  label={label}
                  rules={[
                    { required: true, whitespace: true, message: 'صورة اللون مطلوبة' },
                    {
                      validator: (_, value: string | undefined) =>
                        !(value ?? '').trim() || isValidImageRef((value ?? '').trim())
                          ? Promise.resolve()
                          : Promise.reject(new Error('رابط الصورة غير صالح')),
                    },
                  ]}
                >
                  <VariantImageInput rowKey={row?.rowKey ?? ''} label={label} />
                </Form.Item>
                <Space wrap align="start" size="large">
                  <Form.Item
                    name={[field.name, 'stock']}
                    label="مخزون اللون"
                    rules={[
                      { required: true, message: 'مخزون اللون مطلوب' },
                      {
                        type: 'integer',
                        min: 0,
                        max: MAX_VARIANT_STOCK,
                        message: `المخزون عددٌ صحيح بين ٠ و${MAX_VARIANT_STOCK}`,
                      },
                    ]}
                    style={{ marginBottom: 0 }}
                  >
                    <InputNumber min={0} max={MAX_VARIANT_STOCK} precision={0} style={{ width: 160 }} />
                  </Form.Item>
                  <Form.Item
                    name={[field.name, 'isActive']}
                    label="اللون نشط"
                    valuePropName="checked"
                    tooltip="اللون المعطّل لا يُباع ولا يراه الزبون، ولا يدخل مخزونه في مجموع المنتج."
                    style={{ marginBottom: 0 }}
                  >
                    <Switch />
                  </Form.Item>
                </Space>
              </Card>
            )
          })}
          <Button
            icon={<PlusOutlined />}
            onClick={() => add(emptyVariantFields())}
            disabled={fields.length >= MAX_VARIANTS}
          >
            إضافة لون ({fields.length}/{MAX_VARIANTS})
          </Button>
        </>
      )}
    </Form.List>
  )
}
