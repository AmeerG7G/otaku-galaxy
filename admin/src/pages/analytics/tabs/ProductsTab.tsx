import { useState } from 'react'
import { Card, Segmented, Space, Statistic, Typography } from 'antd'
import { useQuery } from '@tanstack/react-query'
import {
  fetchAnalyticsBehaviour,
  fetchAnalyticsCategories,
  fetchAnalyticsInventory,
  fetchAnalyticsProducts,
} from '../../../api/analyticsApi'
import { BarRanking } from '../../../components/analytics/BarRanking'
import { ChartCard } from '../../../components/analytics/ChartCard'
import { DataTable } from '../../../components/analytics/DataTable'
import { ProductLink } from '../../../components/ui/ProductLink'
import type { ProductsView, SlowProduct, TopProduct, TrendingProduct } from '../../../types/analytics'
import { formatIqd, formatNumber, formatPercent } from '../../../utils/periods'
import { Cell, Grid, QueryView, TrackingNote, type TabProps } from './shared'

const VIEWS: Array<{ value: ProductsView; label: string }> = [
  { value: 'top', label: 'الأكثر مبيعاً' },
  { value: 'bottom', label: 'الأقل مبيعاً' },
  { value: 'no_sales', label: 'بلا مبيعات' },
  { value: 'trending', label: 'الاتجاه' },
]

const name = (row: { productId: string; name: string | null }) => (
  <ProductLink productId={row.productId} name={row.name ?? 'منتج محذوف'} />
)

function TrendTable({ rows }: { rows: TrendingProduct[] }) {
  return (
    <DataTable
      rows={rows}
      rowKey={(row) => row.productId}
      columns={[
        { title: 'المنتج', width: 220, render: (_, row) => name(row) },
        { title: 'هذه الفترة', width: 110, dataIndex: 'currentUnits', render: (v) => formatNumber(Number(v)) },
        { title: 'السابقة', width: 110, dataIndex: 'previousUnits', render: (v) => formatNumber(Number(v)) },
        { title: 'الفرق', width: 100, dataIndex: 'delta', render: (v) => formatNumber(Number(v)) },
        { title: 'النسبة', width: 100, dataIndex: 'percent', render: (v) => formatPercent(v as number | null) },
      ]}
    />
  )
}

export function ProductsTab({ range }: TabProps) {
  const [view, setView] = useState<ProductsView>('top')
  const [sort, setSort] = useState<'units' | 'revenue'>('units')
  const products = useQuery({
    queryKey: ['analytics', 'products', range.from, range.to, view, sort],
    queryFn: () => fetchAnalyticsProducts({ ...range, view, sort, limit: 20 }),
    staleTime: 5 * 60_000,
  })
  const categories = useQuery({
    queryKey: ['analytics', 'categories', range.from, range.to],
    queryFn: () => fetchAnalyticsCategories(range),
    staleTime: 5 * 60_000,
  })
  const inventory = useQuery({
    queryKey: ['analytics', 'inventory', range.from, range.to],
    queryFn: () => fetchAnalyticsInventory(range),
    staleTime: 5 * 60_000,
  })
  const behaviour = useQuery({
    queryKey: ['analytics', 'behaviour', range.from, range.to],
    queryFn: () => fetchAnalyticsBehaviour(range),
    staleTime: 5 * 60_000,
  })

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space wrap>
        <Segmented className="og-segmented-wrap" value={view} onChange={(v) => setView(v as ProductsView)} options={VIEWS} aria-label="عرض المنتجات" />
        {view !== 'trending' && (
          <Segmented
            value={sort}
            onChange={(v) => setSort(v as 'units' | 'revenue')}
            options={[
              { value: 'units', label: 'بالقطع' },
              { value: 'revenue', label: 'بالقيمة' },
            ]}
            aria-label="الترتيب"
          />
        )}
      </Space>
      <QueryView query={products}>
        {(data) => {
          if (data.view === 'trending') {
            return (
              <Grid>
                <Cell span={12}>
                  <Card variant="borderless" title="مبيعات تتزايد">
                    {data.increasing.length ? <TrendTable rows={data.increasing} /> : <Typography.Text type="secondary">لا شيء في هذا المدى</Typography.Text>}
                  </Card>
                </Cell>
                <Cell span={12}>
                  <Card variant="borderless" title="مبيعات تتناقص">
                    {data.decreasing.length ? <TrendTable rows={data.decreasing} /> : <Typography.Text type="secondary">لا شيء في هذا المدى</Typography.Text>}
                  </Card>
                </Cell>
              </Grid>
            )
          }
          if (data.view === 'top') {
            const rows = data.items as TopProduct[]
            const showMargin = rows.some((r) => r.marginBeforeOrderDiscounts !== undefined)
            return (
              <ChartCard
                title={sort === 'units' ? 'الأكثر مبيعاً بالقطع' : 'الأكثر مبيعاً بالقيمة'}
                empty={rows.length === 0}
                chart={
                  <BarRanking
                    data={rows.slice(0, 10).map((r) => ({ label: r.name ?? 'منتج محذوف', value: sort === 'units' ? r.units : r.grossValue }))}
                    formatValue={sort === 'units' ? (v) => formatNumber(v) : formatIqd}
                    valueLabel={sort === 'units' ? 'القطع' : 'القيمة'}
                  />
                }
                table={
                  <DataTable
                    rows={rows}
                    rowKey={(row) => row.productId}
                    columns={[
                      { title: 'المنتج', width: 240, render: (_, row) => name(row) },
                      { title: 'القطع', width: 90, dataIndex: 'units', render: (v) => formatNumber(Number(v)) },
                      { title: 'القيمة قبل خصومات الطلب', width: 170, dataIndex: 'grossValue', render: (v) => formatIqd(Number(v)) },
                      { title: 'الطلبات', width: 90, dataIndex: 'orders', render: (v) => formatNumber(Number(v)) },
                      ...(showMargin
                        ? [
                            {
                              title: 'الهامش قبل خصومات الطلب',
                              width: 180,
                              render: (_: unknown, row: TopProduct) =>
                                row.marginBeforeOrderDiscounts === null || row.marginBeforeOrderDiscounts === undefined
                                  ? 'غير متاح'
                                  : formatIqd(row.marginBeforeOrderDiscounts),
                            },
                          ]
                        : []),
                    ]}
                  />
                }
              />
            )
          }
          const rows = data.items as SlowProduct[]
          return (
            <Card variant="borderless" title={`${view === 'bottom' ? 'الأقل مبيعاً' : 'بلا مبيعات'} (${formatNumber(data.total)})`}>
              {rows.length === 0 ? (
                <Typography.Text type="secondary">لا شيء في هذا المدى</Typography.Text>
              ) : (
                <DataTable
                  rows={rows}
                  rowKey={(row) => row.productId}
                  columns={[
                    { title: 'المنتج', width: 240, render: (_, row) => name(row) },
                    { title: 'القطع', width: 90, dataIndex: 'units', render: (v) => formatNumber(Number(v)) },
                    { title: 'القيمة', width: 140, dataIndex: 'grossValue', render: (v) => formatIqd(Number(v)) },
                    { title: 'المخزون الحالي', width: 120, dataIndex: 'stock', render: (v) => formatNumber(Number(v)) },
                  ]}
                />
              )}
            </Card>
          )
        }}
      </QueryView>
      <QueryView query={categories}>
        {(data) => (
          <ChartCard
            title="أداء الأقسام"
            empty={data.items.length === 0}
            note={
              data.items.some((c) => c.basis.currentCategoryLines > 0)
                ? 'بنود ما قبل لقطة القسم تُنسب إلى القسم الحالي للمنتج.'
                : undefined
            }
            chart={
              <BarRanking
                data={data.items.map((c) => ({ label: c.name ?? 'قسم محذوف', value: c.grossValue }))}
                formatValue={formatIqd}
                valueLabel="القيمة"
              />
            }
            table={
              <DataTable
                rows={data.items}
                rowKey={(row) => row.categoryId}
                columns={[
                  { title: 'القسم', width: 180, dataIndex: 'name', render: (v) => String(v ?? 'قسم محذوف') },
                  { title: 'القطع', width: 90, dataIndex: 'units', render: (v) => formatNumber(Number(v)) },
                  { title: 'القيمة', width: 140, dataIndex: 'grossValue', render: (v) => formatIqd(Number(v)) },
                  { title: 'الحصّة', width: 90, dataIndex: 'sharePercent', render: (v) => (v === null ? '—' : `${formatNumber(Number(v), true)}%`) },
                  { title: 'الطلبات', width: 90, dataIndex: 'orders', render: (v) => formatNumber(Number(v)) },
                ]}
              />
            }
          />
        )}
      </QueryView>
      <QueryView query={inventory}>
        {(data) => (
          <Card variant="borderless" title="المخزون">
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Space size={32} wrap>
                <Statistic title="نفد مخزونها الآن" value={data.current.outOfStock} />
                <Statistic title={`قاربت النفاد (≤ ${data.current.lowStockThreshold})`} value={data.current.lowStock} />
              </Space>
              {data.history.available ? (
                <DataTable
                  rows={data.history.items}
                  rowKey={(row) => row.productId}
                  columns={[
                    { title: 'المنتج', width: 220, render: (_, row) => name(row) },
                    { title: 'أيام النفاد', width: 100, dataIndex: 'stockoutDays', render: (v) => formatNumber(Number(v)) },
                    { title: 'القطع المباعة', width: 110, dataIndex: 'unitsSold', render: (v) => formatNumber(Number(v)) },
                    { title: 'متوسط المخزون', width: 120, dataIndex: 'averageStock', render: (v) => formatNumber(Number(v), true) },
                    { title: 'دوران المخزون', width: 120, dataIndex: 'turnover', render: (v) => (v === null ? '—' : formatNumber(Number(v), true)) },
                  ]}
                />
              ) : (
                <Typography.Text type="secondary">
                  تاريخ المخزون غير متاح لهذا المدى
                  {data.history.measuredSince ? ` — بدأت اللقطات اليومية في ${data.history.measuredSince}.` : '.'}
                </Typography.Text>
              )}
            </Space>
          </Card>
        )}
      </QueryView>
      <QueryView query={behaviour}>
        {(data) => (
          <Card variant="borderless" title="سلوك التصفّح">
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <TrackingNote tracking={data.tracking} />
              {data.tracking.epochs.length > 0 && (
                <>
                  <Grid>
                    <Cell>
                      <Statistic title="مرات فتح صفحة المنتج" value={data.totals.productViews} />
                    </Cell>
                    <Cell>
                      <Statistic title="إضافات إلى السلة" value={data.totals.cartAdds} />
                    </Cell>
                    <Cell>
                      <Statistic title="مرات فتح المشاركة" value={data.totals.shareOpens} />
                    </Cell>
                    <Cell>
                      <Statistic title="مشاركات مؤكَّدة" value={data.totals.shareConfirmed} />
                    </Cell>
                  </Grid>
                  {data.topProducts.length > 0 && (
                    <DataTable
                      rows={data.topProducts}
                      rowKey={(row) => row.productId}
                      columns={[
                        { title: 'المنتج', width: 240, render: (_, row) => name(row) },
                        { title: 'فتح الصفحة', width: 110, dataIndex: 'views', render: (v) => formatNumber(Number(v)) },
                        { title: 'إضافات للسلة', width: 120, dataIndex: 'cartAdds', render: (v) => formatNumber(Number(v)) },
                      ]}
                    />
                  )}
                </>
              )}
            </Space>
          </Card>
        )}
      </QueryView>
    </Space>
  )
}
