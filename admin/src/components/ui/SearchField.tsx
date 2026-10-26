import { Input } from 'antd'
import type { InputProps } from 'antd'
import { SearchOutlined } from '@ant-design/icons'

/**
 * حقل البحث الموحّد في اللوحة (STEP 64).
 *
 * كان لكل صفحة حقلها: `Input` بعرض 360 ثابت في المنتجات، و`Input.Search` بعرض
 * 260 وزرٍّ ملتصق في طلبات الحساب — ارتفاعان وحشوتان مختلفتان في لوحة واحدة.
 * هنا: ارتفاع عناصر التحكّم نفسه (`controlHeight`)، أيقونة في البداية (يمين
 * RTL)، زرّ مسح، ويتمدّد في صفّ الأدوات (`flex: 1 1 240px`) حتى 420 ثم يلتفّ —
 * على الهاتف يأخذ السطر كاملاً بلا فيضٍ أفقي.
 */
export function SearchField({ style, ...props }: Omit<InputProps, 'prefix' | 'allowClear'>) {
  return (
    <Input
      allowClear
      prefix={<SearchOutlined style={{ color: 'var(--og-text-secondary, inherit)' }} />}
      style={{ flex: '1 1 240px', minWidth: 0, maxWidth: 420, ...style }}
      {...props}
    />
  )
}
