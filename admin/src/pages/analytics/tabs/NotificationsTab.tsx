import { Card, Space, Statistic, Tag } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { fetchAnalyticsNotifications } from '../../../api/analyticsApi'
import { ChartCard } from '../../../components/analytics/ChartCard'
import { DataTable } from '../../../components/analytics/DataTable'
import { StackedBars } from '../../../components/analytics/StackedBars'
import { TrendChart } from '../../../components/analytics/TrendChart'
import { NOTIFICATION_TYPE_LABELS } from '../../../types/notifications'
import { dayLabel, formatNumber } from '../../../utils/periods'
import { Cell, Grid, QueryView, type TabProps } from './shared'

/**
 * الإشعارات: «مقبولة لدى FCM» (لجهازٍ واحد على الأقل) — لا «وصلت». والقراءة
 * والفتح مؤرَّخان بيوم حدوثهما.
 */
export function NotificationsTab({ range }: TabProps) {
  const notifications = useQuery({
    queryKey: ['analytics', 'notifications', range.from, range.to],
    queryFn: () => fetchAnalyticsNotifications(range),
    staleTime: 5 * 60_000,
  })
  return (
    <QueryView query={notifications}>
      {(data) => {
        const customer = data.delivery.filter((d) => d.audience === 'customer')
        const totals = customer.reduce(
          (acc, d) => ({
            created: acc.created + d.created,
            accepted: acc.accepted + d.acceptedByFcm,
            failed: acc.failed + d.failed,
            skipped: acc.skipped + d.skippedNotConfigured + d.skippedPreference + d.skippedNoDevices,
          }),
          { created: 0, accepted: 0, failed: 0, skipped: 0 },
        )
        const engagement = data.engagement.reduce(
          (acc, e) => ({ read: acc.read + e.readInApp, opened: acc.opened + e.openedFromPush }),
          { read: 0, opened: 0 },
        )
        return (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Space wrap>
              <Tag color={data.push.configured ? 'success' : 'warning'}>
                {data.push.configured ? 'الإشعارات الفورية مُعدّة' : 'الإشعارات الفورية غير مُعدّة'}
              </Tag>
              <Tag>{`الحملات في المدى: ${formatNumber(data.campaigns)}`}</Tag>
            </Space>
            <Grid>
              <Cell>
                <Card variant="borderless"><Statistic title="إشعارات أُنشئت (ملخَّصة)" value={totals.created} /></Card>
              </Cell>
              <Cell>
                <Card variant="borderless"><Statistic title="مقبولة لدى FCM" value={totals.accepted} /></Card>
              </Cell>
              <Cell>
                <Card variant="borderless"><Statistic title="فشلت" value={totals.failed} /></Card>
              </Cell>
              <Cell>
                <Card variant="borderless"><Statistic title="تُخطّيت" value={totals.skipped} /></Card>
              </Cell>
              <Cell>
                <Card variant="borderless"><Statistic title="قُرئت داخل التطبيق" value={engagement.read} /></Card>
              </Cell>
              <Cell>
                <Card variant="borderless"><Statistic title="فُتحت بالنقر" value={engagement.opened} /></Card>
              </Cell>
              {data.activeDevices.map((d) => (
                <Cell key={d.platform}>
                  <Card variant="borderless"><Statistic title={`أجهزة نشطة — ${d.platform}`} value={d.count} /></Card>
                </Cell>
              ))}
            </Grid>
            <ChartCard
              title="نتائج الإرسال اليومية (الزبائن)"
              empty={customer.length === 0}
              emptyText="لا أيام ملخَّصة في هذا المدى بعد — يُلخَّص اليوم بعد انقضائه."
              chart={
                <StackedBars
                  data={customer.map((d) => ({
                    date: d.date,
                    accepted: d.acceptedByFcm,
                    failed: d.failed,
                    skipped: d.skippedNotConfigured + d.skippedPreference + d.skippedNoDevices,
                  }))}
                  xKey="date"
                  series={[
                    { key: 'accepted', label: 'مقبولة لدى FCM', slot: 0 },
                    { key: 'failed', label: 'فشلت', slot: 1 },
                    { key: 'skipped', label: 'تُخطّيت', slot: 2 },
                  ]}
                  formatX={dayLabel}
                  formatValue={(v) => formatNumber(v)}
                />
              }
              table={
                <DataTable
                  rows={customer}
                  rowKey={(row) => row.date}
                  columns={[
                    { title: 'اليوم', width: 110, dataIndex: 'date' },
                    { title: 'أُنشئت', width: 90, dataIndex: 'created', render: (v) => formatNumber(Number(v)) },
                    { title: 'مقبولة لدى FCM', width: 130, dataIndex: 'acceptedByFcm', render: (v) => formatNumber(Number(v)) },
                    { title: 'فشلت', width: 80, dataIndex: 'failed', render: (v) => formatNumber(Number(v)) },
                    { title: 'غير مُعدّ', width: 90, dataIndex: 'skippedNotConfigured', render: (v) => formatNumber(Number(v)) },
                    { title: 'أطفأها الزبون', width: 110, dataIndex: 'skippedPreference', render: (v) => formatNumber(Number(v)) },
                    { title: 'بلا جهاز', width: 90, dataIndex: 'skippedNoDevices', render: (v) => formatNumber(Number(v)) },
                    { title: 'أجهزة قبلتها FCM', width: 130, dataIndex: 'devicesAcceptedByFcm', render: (v) => formatNumber(Number(v)) },
                    { title: 'رموز مرفوضة', width: 110, dataIndex: 'devicesInvalid', render: (v) => formatNumber(Number(v)) },
                  ]}
                />
              }
            />
            <ChartCard
              title="القراءة والفتح"
              empty={data.engagement.length === 0}
              chart={
                <TrendChart
                  data={data.engagement.map((e) => ({ date: e.date, readInApp: e.readInApp, openedFromPush: e.openedFromPush }))}
                  xKey="date"
                  series={[
                    { key: 'readInApp', label: 'قُرئت داخل التطبيق', slot: 0 },
                    { key: 'openedFromPush', label: 'فُتحت بالنقر', slot: 1 },
                  ]}
                  formatX={dayLabel}
                  formatValue={(v) => formatNumber(v)}
                />
              }
              table={
                <DataTable
                  rows={data.engagement}
                  rowKey={(row) => row.date}
                  columns={[
                    { title: 'اليوم', width: 110, dataIndex: 'date' },
                    { title: 'قُرئت داخل التطبيق', width: 150, dataIndex: 'readInApp', render: (v) => formatNumber(Number(v)) },
                    { title: 'فُتحت بالنقر', width: 120, dataIndex: 'openedFromPush', render: (v) => formatNumber(Number(v)) },
                  ]}
                />
              }
            />
            {data.byType.length > 0 && (
              <Card variant="borderless" title="حسب النوع">
                <DataTable
                  rows={data.byType}
                  rowKey={(row) => row.type}
                  columns={[
                    {
                      title: 'النوع',
                      width: 180,
                      dataIndex: 'type',
                      render: (v) => NOTIFICATION_TYPE_LABELS[String(v) as keyof typeof NOTIFICATION_TYPE_LABELS] ?? String(v),
                    },
                    { title: 'أُنشئت', width: 100, dataIndex: 'created', render: (v) => formatNumber(Number(v)) },
                    { title: 'مقبولة لدى FCM', width: 130, dataIndex: 'acceptedByFcm', render: (v) => formatNumber(Number(v)) },
                  ]}
                />
              </Card>
            )}
          </Space>
        )
      }}
    </QueryView>
  )
}
