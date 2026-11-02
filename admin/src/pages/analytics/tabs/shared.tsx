import type { ReactNode } from 'react'
import { Col, Row, Typography } from 'antd'
import type { UseQueryResult } from '@tanstack/react-query'
import { ErrorState, LoadingState } from '../../../components/ui/States'
import type { CompareMode, TrackingCoverage } from '../../../types/analytics'

export interface TabProps {
  range: { from: string; to: string }
  compare: CompareMode
}

/** حالة الطلب: تحميل، خطأ بإعادة محاولة، ثم المحتوى. */
export function QueryView<T>({ query, children }: { query: UseQueryResult<T>; children: (data: T) => ReactNode }) {
  if (query.isPending) return <LoadingState />
  if (query.isError || !query.data) {
    return (
      <ErrorState
        message="تعذّر تحميل التحليلات"
        description={query.error instanceof Error ? query.error.message : undefined}
        onRetry={() => void query.refetch()}
      />
    )
  }
  return <>{children(query.data)}</>
}

export function Grid({ children }: { children: ReactNode }) {
  return <Row gutter={[16, 16]}>{children}</Row>
}

export function Cell({ children, span = 6 }: { children: ReactNode; span?: 6 | 8 | 12 | 24 }) {
  return (
    <Col xs={24} sm={span === 24 ? 24 : 12} lg={span}>
      {children}
    </Col>
  )
}

/** «بدأ القياس في …» — أو «لم يُقَس بعد (التتبّع مطفأ)». لا أصفار قبل بدء القياس. */
export function TrackingNote({ tracking }: { tracking: TrackingCoverage }) {
  if (tracking.epochs.length === 0) {
    return <Typography.Text type="secondary">لم يُقَس بعد — التتبّع مطفأ في هذه البيئة.</Typography.Text>
  }
  const first = tracking.epochs[0]!.enabledAt.slice(0, 10)
  return (
    <Typography.Text type="secondary">
      بدأ القياس في {first}
      {tracking.enabledNow ? '' : ' — التتبّع مطفأ الآن'}.
    </Typography.Text>
  )
}
