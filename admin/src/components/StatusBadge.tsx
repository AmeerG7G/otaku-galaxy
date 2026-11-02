import { Tag } from 'antd'
import type { OrderStatus } from '../types/orders'
import { STATUS_COLORS, STATUS_LABELS } from '../constants/orders'

export default function StatusBadge({ status }: { status: OrderStatus }) {
  return <Tag color={STATUS_COLORS[status]}>{STATUS_LABELS[status]}</Tag>
}
