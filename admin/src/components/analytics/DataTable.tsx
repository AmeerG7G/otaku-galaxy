import type { ReactNode } from 'react'
import { Card, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ResponsiveTable } from '../ui/ResponsiveTable'

/**
 * جدول تحليلات — `ResponsiveTable` (عقد الجداول العريضة، STEP 66) بعرضٍ لكل عمود،
 * وبطاقةٌ تُشتقّ من الأعمدة نفسها على الهاتف فلا تتباعد القيم بين الشكلين.
 */
export interface AnalyticsColumn<T> {
  key?: string
  title: string
  width: number
  dataIndex?: string
  align?: 'left' | 'right' | 'center'
  fixed?: 'start' | 'end'
  render?: (value: unknown, row: T, index: number) => ReactNode
}

export function DataTable<T extends object>({
  rows,
  columns,
  rowKey,
}: {
  rows: T[]
  columns: Array<AnalyticsColumn<T>>
  rowKey: (row: T) => string
}) {
  const cell = (column: AnalyticsColumn<T>, row: T, index: number): ReactNode => {
    const raw = column.dataIndex ? (row as Record<string, unknown>)[column.dataIndex] : undefined
    return column.render ? column.render(raw, row, index) : (raw as ReactNode)
  }
  return (
    <ResponsiveTable<T>
      rowKey={rowKey}
      columns={columns as unknown as ColumnsType<T>}
      dataSource={rows}
      pagination={false}
      size="small"
      renderCard={(row, index) => (
        <Card size="small" style={{ width: '100%' }}>
          {columns.map((column) => (
            <div key={column.title} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '2px 0' }}>
              <Typography.Text type="secondary">{column.title}</Typography.Text>
              <span className="tnum">{cell(column, row, index)}</span>
            </div>
          ))}
        </Card>
      )}
    />
  )
}
