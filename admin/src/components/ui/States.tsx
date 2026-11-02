import { Alert, Button, Flex, Spin, Typography } from 'antd'

/** حالة التحميل الموحّدة داخل حاويات المحتوى. */
export function LoadingState({ label = 'جارٍ التحميل…' }: { label?: string }) {
  return (
    <Flex align="center" justify="center" gap={12} style={{ padding: '48px 0' }}>
      <Spin />
      <Typography.Text type="secondary">{label}</Typography.Text>
    </Flex>
  )
}

interface ErrorStateProps {
  message: string
  description?: string
  onRetry?: () => void
}

/** حالة الخطأ الموحّدة مع زر إعادة المحاولة الاختياري. */
export function ErrorState({ message, description, onRetry }: ErrorStateProps) {
  return (
    <Alert
      type="error"
      showIcon
      message={message}
      description={description}
      action={
        onRetry ? (
          <Button size="small" onClick={onRetry}>
            إعادة المحاولة
          </Button>
        ) : undefined
      }
    />
  )
}