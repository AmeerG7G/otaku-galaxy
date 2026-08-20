import { Button, Empty, type EmptyProps } from 'antd'

interface EmptyStateProps extends EmptyProps {
  description?: string
  actionLabel?: string
  onAction?: () => void
}

export default function EmptyState({
  description = 'لا توجد بيانات',
  actionLabel,
  onAction,
  ...rest
}: EmptyStateProps) {
  return (
    <Empty
      description={description}
      {...rest}
      style={{ padding: '24px 0', ...rest.style }}
    >
      {actionLabel && onAction && (
        <Button type="primary" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </Empty>
  )
}