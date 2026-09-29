import type { Key, ReactNode } from 'react'
import { Card, Empty, Grid, List, Table } from 'antd'
import type { TablePaginationConfig, TableProps } from 'antd'

type Props<T> = TableProps<T> & {
  /**
   * بطاقة الصفّ على الهاتف — المعلومات كلها والإجراءات كلها، بلا جدولٍ
   * بعرضٍ ثابت يُقصّ أو يُمرَّر جانبياً.
   */
  renderCard: (row: T, index: number) => ReactNode
  /** يفرض تخطيطاً (للاختبارات والصفحات الضيّقة)؛ الافتراضي حسب الشاشة. */
  layout?: 'auto' | 'table' | 'cards'
}

function keyOf<T>(row: T, index: number, rowKey: TableProps<T>['rowKey']): Key {
  if (typeof rowKey === 'function') return rowKey(row, index)
  if (typeof rowKey === 'string') return (row as Record<string, Key>)[rowKey] ?? index
  return (row as { key?: Key }).key ?? index
}

/**
 * جدولٌ على الشاشة العريضة، وبطاقاتٌ على الهاتف — مكوّنٌ واحد للصفحات التي
 * كانت جداولها تُقصّ على الهاتف (طلبات الحساب، طلبات التوفر، أعياد الميلاد،
 * المسؤولون، سجلّ النشاط).
 *
 * [CRITICAL] البطاقات تستعمل ترقيم الجدول نفسه (`pagination.onChange`)
 * وتحميله ونصّ فراغه، فلا يختلف سلوك الصفحة بين التخطيطين — والإجراءات
 * نفسها (المعالجات نفسها) داخل البطاقة. كل بطاقة تحمل `data-row-key` كصفّ
 * الجدول، فيجد الاختبار الصفّ بالطريقة نفسها في الحالتين.
 */
export function ResponsiveTable<T extends object>({ renderCard, layout = 'auto', ...table }: Props<T>) {
  const screens = Grid.useBreakpoint()
  const cards = layout === 'cards' || (layout === 'auto' && !screens.md)
  if (!cards) return <Table<T> {...table} />

  const pagination = table.pagination === false ? false : (table.pagination as TablePaginationConfig | undefined)
  const emptyText = (table.locale?.emptyText as ReactNode) ?? <Empty />
  const rows = (table.dataSource ?? []) as T[]

  return (
    <List<T>
      className="og-responsive-cards"
      loading={Boolean(table.loading)}
      dataSource={rows}
      locale={{ emptyText }}
      split={false}
      pagination={
        pagination
          ? {
              // ما يلزم الترقيم وحده — مجموعُ الصفوف ومغيّرُ الحجم لا يتّسعان
              // على الهاتف بجانب الأرقام.
              current: pagination.current,
              pageSize: pagination.pageSize,
              total: pagination.total,
              onChange: pagination.onChange,
              disabled: pagination.disabled,
              hideOnSinglePage: pagination.hideOnSinglePage,
              align: 'center',
              size: 'small',
              showSizeChanger: false,
            }
          : false
      }
      renderItem={(row, index) => (
        <List.Item style={{ padding: '0 0 12px', border: 'none' }}>
          <Card
            size="small"
            data-row-key={String(keyOf(row, index, table.rowKey))}
            style={{ width: '100%' }}
            styles={{ body: { padding: 14 } }}
          >
            {renderCard(row, index)}
          </Card>
        </List.Item>
      )}
    />
  )
}
