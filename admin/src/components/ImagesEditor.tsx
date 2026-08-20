import { Button, Form, Image, Input, Space } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'

const MAX_IMAGES = 10

const PLACEHOLDER_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="#f0f0f0"/><text x="24" y="28" font-size="12" text-anchor="middle" fill="#999">صورة</text></svg>',
  )

export default function ImagesEditor() {
  const form = Form.useFormInstance()
  const images: string[] = Form.useWatch('images', form) ?? []

  return (
    <Form.List name="images">
      {(fields, { add, remove }) => (
        <>
          {fields.map((field) => (
            <Space
              key={field.key}
              align="start"
              style={{ display: 'flex' }}
              wrap
            >
              <Image
                src={images[field.name]}
                width={48}
                height={48}
                style={{ objectFit: 'cover', borderRadius: 4 }}
                preview={false}
                fallback={PLACEHOLDER_IMAGE}
              />
              <Form.Item
                name={field.name}
                rules={[
                  { required: true, message: 'رابط الصورة مطلوب' },
                  { type: 'url', message: 'رابط الصورة غير صالح' },
                ]}
                style={{ flex: 1, minWidth: 260 }}
              >
                <Input placeholder="رابط الصورة" />
              </Form.Item>
              <Button
                danger
                type="text"
                icon={<DeleteOutlined />}
                aria-label="حذف الصورة"
                onClick={() => remove(field.name)}
              />
            </Space>
          ))}
          <div>
            <Button
              icon={<PlusOutlined />}
              onClick={() => add('')}
              disabled={fields.length >= MAX_IMAGES}
            >
              إضافة صورة ({fields.length}/{MAX_IMAGES})
            </Button>
          </div>
        </>
      )}
    </Form.List>
  )
}