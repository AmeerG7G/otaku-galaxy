import { resolveMediaUrl } from '../utils/media'
import { useState } from 'react'
import { App, Button, Form, Image, Input, Space, Upload } from 'antd'
import { DeleteOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons'
import { uploadImage, type UploadPurpose } from '../api/uploadsApi'

const MAX_IMAGES = 10

const PLACEHOLDER_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="#f0f0f0"/><text x="24" y="28" font-size="12" text-anchor="middle" fill="#999">صورة</text></svg>',
  )

/** رابط مطلق أو مسار يخدمه الخادم نفسه تحت /uploads. */
function isValidImageRef(value: string) {
  return /^https?:\/\/.+/.test(value) || value.startsWith('/uploads/')
}

export default function ImagesEditor({
  purpose = 'product',
}: {
  purpose?: UploadPurpose
}) {
  const { message } = App.useApp()
  const form = Form.useFormInstance()
  const images: string[] = Form.useWatch('images', form) ?? []
  const [uploading, setUploading] = useState(false)

  /** يرفع الملف للخادم ثم يضيف الرابط الناتج لقائمة الصور. */
  async function handleUpload(file: File) {
    if (images.length >= MAX_IMAGES) {
      message.warning(`الحد الأقصى ${MAX_IMAGES} صور`)
      return false
    }
    setUploading(true)
    try {
      const url = await uploadImage(file, purpose)
      form.setFieldValue('images', [...images, url])
      message.success('رُفعت الصورة')
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'تعذر رفع الصورة')
    } finally {
      setUploading(false)
    }
    // نمنع الرفع التلقائي لأننا نتولّاه بأنفسنا.
    return false
  }

  return (
    <Form.List name="images">
      {(fields, { add, remove }) => (
        <>
          {fields.map((field) => (
            <Space key={field.key} align="start" style={{ display: 'flex' }} wrap>
              <Image
                src={resolveMediaUrl(images[field.name])}
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
                  {
                    validator: (_rule, value: string) =>
                      !value || isValidImageRef(value)
                        ? Promise.resolve()
                        : Promise.reject(new Error('رابط الصورة غير صالح')),
                  },
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
          <Space wrap>
            <Upload
              accept="image/jpeg,image/png,image/webp"
              showUploadList={false}
              beforeUpload={handleUpload}
              disabled={uploading || fields.length >= MAX_IMAGES}
            >
              <Button
                type="primary"
                icon={<UploadOutlined />}
                loading={uploading}
                disabled={fields.length >= MAX_IMAGES}
              >
                رفع صورة من الجهاز
              </Button>
            </Upload>
            <Button
              icon={<PlusOutlined />}
              onClick={() => add('')}
              disabled={fields.length >= MAX_IMAGES}
            >
              إضافة برابط ({fields.length}/{MAX_IMAGES})
            </Button>
          </Space>
        </>
      )}
    </Form.List>
  )
}
