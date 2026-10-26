import { useState } from 'react'
import { Button, Card, Descriptions, Drawer, Tag, Typography } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { getCampaign, listCampaigns } from '../api/notificationsApi'
import type { Campaign } from '../types/notifications'
import { audienceLabel } from '../utils/campaigns'
import { formatDateTime } from '../utils/format'
import { formatNumber } from '../utils/periods'
import { ResponsiveTable } from './ui/ResponsiveTable'
import { ErrorState } from './ui/States'

/**
 * سجلّ الحملات (٠٧٤) — كل بثٍّ أو إشعارٍ يدوي هوية واحدة بأعدادها.
 *
 * [CRITICAL] «مقبولة لدى FCM» = قبلتها FCM لجهازٍ واحد على الأقل — لا «وصلت».
 * «قُرئت داخل التطبيق» و«فُتحت بالنقر» هما المقيس من جهة الزبون. لا أسماء
 * مستلمين ولا أرقامهم في أي موضع.
 */
const skipped = (c: Campaign) => c.push.skippedNotConfigured + c.push.skippedPreference + c.push.skippedNoDevices

function CampaignDetail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const detail = useQuery({
    queryKey: ['admin-campaign', id],
    queryFn: () => getCampaign(id!),
    enabled: Boolean(id),
  })
  const c = detail.data
  return (
    <Drawer open={Boolean(id)} onClose={onClose} title={c?.title ?? 'الحملة'} width={480} destroyOnHidden>
      {detail.isError && <ErrorState message="تعذّر تحميل الحملة" onRetry={() => void detail.refetch()} />}
      {c && (
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label="النوع">{c.kind === 'broadcast' ? 'بثّ' : 'إشعار يدوي'}</Descriptions.Item>
          <Descriptions.Item label="الجمهور">{audienceLabel(c)}</Descriptions.Item>
          <Descriptions.Item label="المستلمون">{formatNumber(c.recipients)}</Descriptions.Item>
          <Descriptions.Item label="بانتظار الإرسال">{formatNumber(c.push.pending)}</Descriptions.Item>
          <Descriptions.Item label="مقبولة لدى FCM">{formatNumber(c.push.acceptedByFcm)}</Descriptions.Item>
          <Descriptions.Item label="أجهزة قبلتها FCM">{formatNumber(c.push.devicesAcceptedByFcm)}</Descriptions.Item>
          <Descriptions.Item label="رموز أجهزة مرفوضة">{formatNumber(c.push.devicesInvalid)}</Descriptions.Item>
          <Descriptions.Item label="فشلت">{formatNumber(c.push.failed)}</Descriptions.Item>
          <Descriptions.Item label="تُخطّيت — الإشعارات غير مُعدّة">{formatNumber(c.push.skippedNotConfigured)}</Descriptions.Item>
          <Descriptions.Item label="تُخطّيت — أطفأها الزبون">{formatNumber(c.push.skippedPreference)}</Descriptions.Item>
          <Descriptions.Item label="تُخطّيت — بلا جهاز">{formatNumber(c.push.skippedNoDevices)}</Descriptions.Item>
          <Descriptions.Item label="قُرئت داخل التطبيق">{formatNumber(c.readInApp)}</Descriptions.Item>
          <Descriptions.Item label="فُتحت بالنقر">{formatNumber(c.openedFromPush)}</Descriptions.Item>
          <Descriptions.Item label="أنشأها">{c.createdByName ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="الوقت">{formatDateTime(c.createdAt)}</Descriptions.Item>
          <Descriptions.Item label="الأعداد">{c.frozen ? 'نهائية (مجمَّدة)' : 'تتحدّث'}</Descriptions.Item>
        </Descriptions>
      )}
    </Drawer>
  )
}

export default function NotificationCampaigns() {
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<string | null>(null)
  const campaigns = useQuery({
    queryKey: ['admin-campaigns', page],
    queryFn: () => listCampaigns({ page, limit: 10 }),
  })

  return (
    <Card title="الحملات">
      {campaigns.isError ? (
        <ErrorState message="تعذّر تحميل الحملات" onRetry={() => void campaigns.refetch()} />
      ) : (
        <ResponsiveTable<Campaign>
          rowKey="id"
          loading={campaigns.isPending}
          dataSource={campaigns.data?.items ?? []}
          locale={{ emptyText: 'لا حملات بعد' }}
          pagination={{
            current: page,
            pageSize: 10,
            total: campaigns.data?.total ?? 0,
            onChange: setPage,
            hideOnSinglePage: true,
          }}
          columns={[
            { title: 'العنوان', dataIndex: 'title', width: 200 },
            {
              title: 'النوع',
              dataIndex: 'kind',
              width: 100,
              render: (kind: Campaign['kind']) => <Tag>{kind === 'broadcast' ? 'بثّ' : 'يدوي'}</Tag>,
            },
            { title: 'الجمهور', width: 200, render: (_, c) => audienceLabel(c) },
            { title: 'المستلمون', dataIndex: 'recipients', width: 100, render: (v: number) => formatNumber(v) },
            { title: 'مقبولة لدى FCM', width: 130, render: (_, c) => formatNumber(c.push.acceptedByFcm) },
            { title: 'فشلت', width: 80, render: (_, c) => formatNumber(c.push.failed) },
            { title: 'تُخطّيت', width: 90, render: (_, c) => formatNumber(skipped(c)) },
            { title: 'قُرئت', width: 80, dataIndex: 'readInApp', render: (v: number) => formatNumber(v) },
            { title: 'فُتحت بالنقر', width: 110, dataIndex: 'openedFromPush', render: (v: number) => formatNumber(v) },
            { title: 'الوقت', dataIndex: 'createdAt', width: 170, render: (v: string) => formatDateTime(v) },
            {
              title: '',
              key: 'actions',
              width: 90,
              fixed: 'end',
              render: (_, c) => (
                <Button size="small" onClick={() => setSelected(c.id)}>
                  التفاصيل
                </Button>
              ),
            },
          ]}
          renderCard={(c) => (
            <Card size="small" style={{ width: '100%' }} onClick={() => setSelected(c.id)}>
              <Typography.Text strong>{c.title}</Typography.Text>
              <div>
                <Typography.Text type="secondary">{audienceLabel(c)}</Typography.Text>
              </div>
              <div className="tnum">
                مقبولة لدى FCM {formatNumber(c.push.acceptedByFcm)} · فشلت {formatNumber(c.push.failed)} · تُخطّيت{' '}
                {formatNumber(skipped(c))} · قُرئت {formatNumber(c.readInApp)}
              </div>
            </Card>
          )}
        />
      )}
      <CampaignDetail id={selected} onClose={() => setSelected(null)} />
    </Card>
  )
}
