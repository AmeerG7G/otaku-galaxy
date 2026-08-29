import { resolveMediaUrl } from '../utils/media'
import { useState } from 'react'
import { App, Button, Flex, Image, Input, Space, Typography, Upload } from 'antd'
import { DeleteOutlined, UploadOutlined } from '@ant-design/icons'
import { uploadImage, type UploadPurpose } from '../api/uploadsApi'

const PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72"><rect width="72" height="72" fill="#f0f0f0"/><text x="36" y="40" font-size="11" text-anchor="middle" fill="#999">لا صورة</text></svg>',
  )

/** رابط مطلق أو مسار يخدمه الخادم نفسه تحت /uploads. */
export function isValidImageRef(value: string) {
  return /^https?:\/\/.+/.test(value) || value.startsWith('/uploads/')
}

interface ImageUploadFieldProps {
  /** قيمة الحقل — يمرّرها Form.Item تلقائياً. */
  value?: string | null
  onChange?: (value: string | null) => void
  /** يحدّد مجلد التخزين وصلاحية الرفع على الخادم. */
  purpose: UploadPurpose
  /** يسمح بمسح الصورة (للحقول الاختيارية مثل صورة القسم). */
  allowClear?: boolean
  disabled?: boolean
}

/**
 * حقل صورة واحدة: اختيار ملف من الجهاز ← رفع فعلي للخادم ← حفظ الرابط العائد.
 *
 * إدخال الرابط يدوياً يبقى متاحاً للحالات التي تستضيف فيها الصورة خارجياً،
 * لكنه لم يعد الطريقة الوحيدة — الرفع من الجهاز هو المسار الأساسي.
 */
export default function ImageUploadField({
  value,
  onChange,
  purpose,
  allowClear = false,
  disabled = false,
}: ImageUploadFieldProps) {
  const { message } = App.useApp()
  const [uploading, setUploading] = useState(false)

  async function handleUpload(file: File) {
    setUploading(true)
    try {
      const url = await uploadImage(file, purpose)
      onChange?.(url)
      message.success('رُفعت الصورة')
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'تعذر رفع الصورة')
    } finally {
      setUploading(false)
    }
    // نمنع الرفع التلقائي من AntD لأننا نتولّاه بأنفسنا.
    return false
  }

  return (
    <Space direction="vertical" size={10} style={{ width: '100%' }}>
      <Flex gap={12} align="flex-start" wrap>
        <Image
          src={resolveMediaUrl(value) ?? PLACEHOLDER}
          width={72}
          height={72}
          style={{ objectFit: 'cover', borderRadius: 8 }}
          fallback={PLACEHOLDER}
          preview={Boolean(value)}
        />
        <Space direction="vertical" size={6}>
          <Space wrap>
            <Upload
              accept="image/jpeg,image/png,image/webp"
              showUploadList={false}
              beforeUpload={handleUpload}
              disabled={disabled || uploading}
            >
              <Button
                type="primary"
                icon={<UploadOutlined />}
                loading={uploading}
                disabled={disabled}
              >
                رفع صورة من الجهاز
              </Button>
            </Upload>
            {allowClear && value && (
              <Button
                danger
                icon={<DeleteOutlined />}
                disabled={disabled || uploading}
                onClick={() => onChange?.(null)}
              >
                إزالة
              </Button>
            )}
          </Space>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            JPG أو PNG أو WebP — بحد أقصى ٥ ميغابايت.
          </Typography.Text>
        </Space>
      </Flex>

      <Input
        value={value ?? ''}
        onChange={(event) => onChange?.(event.target.value || null)}
        placeholder="أو ألصق رابط صورة مستضافة خارجياً"
        disabled={disabled || uploading}
      />
    </Space>
  )
}
