import { useState, type ReactNode } from 'react'
import { Card, Segmented, Typography } from 'antd'
import { BarChartOutlined, TableOutlined } from '@ant-design/icons'

/**
 * بطاقة مخطّط بجدولٍ بديل — كل مخطّط في «التحليلات» يُقرأ جدولاً أيضاً
 * (الوصول، القيم الدقيقة، وقاعدة الإغاثة للتباين).
 */
export function ChartCard({
  title,
  chart,
  table,
  empty,
  emptyText = 'لا بيانات في هذا المدى',
  note,
  extra,
}: {
  title: string
  chart: ReactNode
  table: ReactNode
  empty?: boolean
  emptyText?: string
  note?: ReactNode
  extra?: ReactNode
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  return (
    <Card
      title={title}
      variant="borderless"
      extra={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {extra}
          {!empty && (
            <Segmented
              size="small"
              value={view}
              onChange={(value) => setView(value as 'chart' | 'table')}
              options={[
                { value: 'chart', icon: <BarChartOutlined />, label: 'مخطّط' },
                { value: 'table', icon: <TableOutlined />, label: 'جدول' },
              ]}
              aria-label={`عرض ${title}`}
            />
          )}
        </div>
      }
    >
      {empty ? (
        <Typography.Text type="secondary">{emptyText}</Typography.Text>
      ) : view === 'chart' ? (
        chart
      ) : (
        table
      )}
      {note && (
        <div style={{ marginTop: 8 }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {note}
          </Typography.Text>
        </div>
      )}
    </Card>
  )
}
