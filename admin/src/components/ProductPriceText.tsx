import { Space, Tag, Typography } from 'antd'
import { formatCurrency } from '../utils/format'

/**
 * سعر المنتج في جداول اللوحة — مصدرٌ واحد لحالتيه الجديدتين.
 *
 * `null` = «السعر يُعلن لاحقاً» (084): يُكتب نصّاً لا «٠ د.ع» — الصفر سعرٌ،
 * و`formatCurrency(null)` كان سيعرضه منتجاً مجانياً. `pairPrice` (085) سطرٌ ثانٍ
 * تحت سعر القطعة.
 */
export default function ProductPriceText({
  price,
  pairPrice,
}: {
  price: number | null
  pairPrice?: number | null
}) {
  if (price === null) return <Tag color="gold">يُعلن لاحقاً</Tag>
  if (pairPrice === null || pairPrice === undefined) return <>{formatCurrency(price)}</>
  return (
    <Space direction="vertical" size={0}>
      <span>{formatCurrency(price)}</span>
      <Typography.Text type="success" style={{ fontSize: 12 }}>
        قطعتان بـ{formatCurrency(pairPrice)}
      </Typography.Text>
    </Space>
  )
}
