import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Flex, Typography } from 'antd'
import { useCan } from '../../hooks/useAdminProfile'
import { MediaThumb } from './MediaThumb'

/**
 * منتجٌ قابل للنقر في أي مكانٍ من اللوحة — يفتح صفحة المنتج القائمة
 * (`/products/:id/edit`)، لا صفحةً ثانية.
 *
 * من لا يملك صلاحية «المنتجات» يرى الاسم والصورة نصاً لا رابطاً: الرابط كان
 * سيقوده إلى صفحة «لا صلاحية».
 */
export function ProductLink({
  productId,
  name,
  image,
  imageSize = 44,
  secondary,
}: {
  productId: string | null | undefined
  name: ReactNode
  /** مرجع الصورة — غيابه (`undefined`) يعني الاسم وحده بلا صورة. */
  image?: string | null
  imageSize?: number
  /** سطرٌ ثانٍ تحت الاسم (الخيار، الكردية…). */
  secondary?: ReactNode
}) {
  const canOpen = useCan('products') && Boolean(productId)
  const body = (
    <Flex align="center" gap={10} style={{ minWidth: 0, maxWidth: '100%' }}>
      {image !== undefined && <MediaThumb reference={image} alt={typeof name === 'string' ? name : 'صورة المنتج'} size={imageSize} />}
      <Flex vertical style={{ minWidth: 0 }}>
        <Typography.Text
          strong
          ellipsis
          style={{ color: canOpen ? 'var(--og-primary, #7C5CFF)' : undefined, overflowWrap: 'anywhere' }}
        >
          {name}
        </Typography.Text>
        {secondary && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }} ellipsis>
            {secondary}
          </Typography.Text>
        )}
      </Flex>
    </Flex>
  )
  // `minWidth: 0` على الغلاف: اسمٌ طويل بلا فواصل يُختصر داخل البطاقة بدل أن
  // يدفع ما بجانبه خارجها (رُصد في بطاقة «طلبات التوفر» على الهاتف).
  const shell = { display: 'flex', minWidth: 0, maxWidth: '100%', flex: '1 1 auto' } as const
  if (!canOpen) return <div style={shell}>{body}</div>
  return (
    <Link
      to={`/products/${productId}/edit`}
      aria-label={typeof name === 'string' ? `فتح المنتج ${name}` : 'فتح المنتج'}
      style={shell}
    >
      {body}
    </Link>
  )
}
