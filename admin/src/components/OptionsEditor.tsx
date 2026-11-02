import { Button, Card, Form, Input, Space, Typography } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import type { OptionValueFields } from './optionFields'

const MAX_OPTIONS = 10
const MAX_VALUES_PER_OPTION = 50

export default function OptionsEditor() {
  const form = Form.useFormInstance()

  /**
   * قاعدة «الكل أو لا شيء» تقرأ الصفوف الأخرى، فتغيُّر صفٍّ قد يُسقط خطأً
   * ظاهراً على أخيه — يُعاد فحص ما عليه خطأٌ فقط، فلا يظهر خطأٌ قبل أوانه.
   */
  function revalidateTranslations(optionName: number) {
    const rows = (form.getFieldValue(['options', optionName, 'values']) ?? []) as OptionValueFields[]
    const shown = rows
      .map((_, index) => ['options', optionName, 'values', index, 'ckb'])
      .filter((path) => form.getFieldError(path).length > 0)
    if (shown.length > 0) void form.validateFields(shown).catch(() => undefined)
  }

  return (
    <Form.List name="options">
      {(fields, { add, remove }) => (
        <>
          {fields.length === 0 && (
            <Typography.Text type="secondary">
              لا توجد خيارات (مثل: الحجم، اللون). أضف خياراً إن لزم.
            </Typography.Text>
          )}
          {fields.map((field, index) => (
            <Card
              key={field.key}
              size="small"
              title={`الخيار ${index + 1}`}
              extra={
                <Button
                  danger
                  type="text"
                  icon={<DeleteOutlined />}
                  aria-label="حذف الخيار"
                  onClick={() => remove(field.name)}
                />
              }
              style={{ marginBottom: 8 }}
            >
              <Space wrap align="start" style={{ display: 'flex' }}>
                <Form.Item
                  name={[field.name, 'name']}
                  label="اسم الخيار"
                  rules={[
                    { required: true, message: 'اسم الخيار مطلوب' },
                    { max: 40, message: 'الاسم طويل جداً (40 حرفاً كحد أقصى)' },
                  ]}
                  style={{ minWidth: 220 }}
                >
                  <Input placeholder="مثال: الحجم" />
                </Form.Item>
                <Form.Item
                  name={[field.name, 'nameCkb']}
                  label="اسم الخيار بالكردية (اختياري)"
                  rules={[{ max: 40, message: 'الاسم الكردي طويل جداً (40 حرفاً كحد أقصى)' }]}
                  style={{ minWidth: 220 }}
                >
                  <Input placeholder="نموونە: قەبارە" lang="ckb" />
                </Form.Item>
              </Space>
              <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                الترجمة الكردية للقيم اختيارية، لكنها لكل القيم أو لا شيء — الزبون الكردي
                يرى العربية كاملةً حين تُترك فارغة كلها.
              </Typography.Text>
              <Form.List name={[field.name, 'values']}>
                {(valueFields, { add: addValue, remove: removeValue }) => (
                  <>
                    {valueFields.map((valueField) => (
                      <Space
                        key={valueField.key}
                        align="start"
                        wrap
                        style={{ display: 'flex' }}
                      >
                        <Form.Item
                          name={[valueField.name, 'ar']}
                          rules={[
                            { required: true, whitespace: true, message: 'القيمة مطلوبة' },
                            { max: 80, message: 'القيمة طويلة جداً (80 حرفاً كحد أقصى)' },
                          ]}
                          style={{ flex: 1, minWidth: 200 }}
                        >
                          <Input placeholder="مثال: S, M, L, XL" aria-label="القيمة بالعربية" />
                        </Form.Item>
                        <Form.Item
                          name={[valueField.name, 'ckb']}
                          dependencies={[['options', field.name, 'values']]}
                          rules={[
                            { max: 80, message: 'القيمة الكردية طويلة جداً (80 حرفاً كحد أقصى)' },
                            ({ getFieldValue }) => ({
                              validator(_, value: string | undefined) {
                                const rows = (getFieldValue(['options', field.name, 'values']) ??
                                  []) as OptionValueFields[]
                                const anyTranslated = rows.some((row) => (row?.ckb ?? '').trim() !== '')
                                if (anyTranslated && (value ?? '').trim() === '') {
                                  return Promise.reject(
                                    new Error('ترجم كل قيم الخيار أو اترك ترجمتها فارغة كلها'),
                                  )
                                }
                                return Promise.resolve()
                              },
                            }),
                          ]}
                          style={{ flex: 1, minWidth: 200 }}
                        >
                          <Input
                            placeholder="بالكردية"
                            aria-label="القيمة بالكردية"
                            lang="ckb"
                            onChange={() => setTimeout(() => revalidateTranslations(field.name))}
                          />
                        </Form.Item>
                        <Button
                          danger
                          type="text"
                          icon={<DeleteOutlined />}
                          aria-label="حذف القيمة"
                          disabled={valueFields.length <= 1}
                          onClick={() => removeValue(valueField.name)}
                        />
                      </Space>
                    ))}
                    <Button
                      icon={<PlusOutlined />}
                      size="small"
                      disabled={valueFields.length >= MAX_VALUES_PER_OPTION}
                      onClick={() => addValue({ ar: '', ckb: '' })}
                    >
                      إضافة قيمة ({valueFields.length}/{MAX_VALUES_PER_OPTION})
                    </Button>
                  </>
                )}
              </Form.List>
            </Card>
          ))}
          <Button
            icon={<PlusOutlined />}
            onClick={() => add({ name: '', nameCkb: '', values: [{ ar: '', ckb: '' }] })}
            disabled={fields.length >= MAX_OPTIONS}
          >
            إضافة خيار ({fields.length}/{MAX_OPTIONS})
          </Button>
        </>
      )}
    </Form.List>
  )
}
