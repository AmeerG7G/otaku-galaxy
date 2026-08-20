import { Tag } from 'antd'
import type { OrderStatus } from '../types/orders'
import { STATUS_LABELS } from '../constants/orders'

const STATUS_COLORS: Record<OrderStatus, string> = {
  PENDING_ADMIN_CONFIRMATION: 'warning',
  CONFIRMED: 'blue',
  PREPARING: 'geekblue',
  OUT_FOR_DELIVERY: 'cyan',
  COMPLETED: 'green',
  REJECTED: 'red',
}

export default function StatusBadge({ status }: { status: OrderStatus }) {
  return <Tag color={STATUS_COLORS[status]}>{STATUS_LABELS[status]}</Tag>
}