import { Button, Card, Form, Input, Space, Typography } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'

const MAX_OPTIONS = 10
const MAX_VALUES_PER_OPTION = 50

export default function OptionsEditor() {
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
              <Form.Item
                name={[field.name, 'name']}
                label="اسم الخيار"
                rules={[
                  { required: true, message: 'اسم الخيار مطلوب' },
                  { max: 40, message: 'الاسم طويل جداً (40 حرفاً كحد أقصى)' },
                ]}
              >
                <Input placeholder="مثال: الحجم" />
              </Form.Item>
              <Form.List name={[field.name, 'values']}>
                {(valueFields, { add: addValue, remove: removeValue }) => (
                  <>
                    {valueFields.map((valueField) => (
                      <Space
                        key={valueField.key}
                        align="start"
                        style={{ display: 'flex' }}
                      >
                        <Form.Item
                          name={valueField.name}
                          rules={[
                            { required: true, message: 'القيمة مطلوبة' },
                            { max: 80, message: 'القيمة طويلة جداً (80 حرفاً كحد أقصى)' },
                          ]}
                          style={{ flex: 1, minWidth: 220 }}
                        >
                          <Input placeholder="مثال: S, M, L, XL" />
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
                      onClick={() => addValue('')}
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
            onClick={() => add({ name: '', values: [''] })}
            disabled={fields.length >= MAX_OPTIONS}
          >
            إضافة خيار ({fields.length}/{MAX_OPTIONS})
          </Button>
        </>
      )}
    </Form.List>
  )
}