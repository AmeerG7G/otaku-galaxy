import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd'
import { ReloadOutlined, WhatsAppOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { listRestockDemand, setRestockAt, type RestockDemandRow } from '../api/restockApi'
import EmptyState from '../components/EmptyState'
import { formatDateTime } from '../utils/format'
import { whatsappUrl } from '../utils/phone'
import { PageHeader } from '../components/ui/PageHeader'

/**
 * طلبات التوفر — من ينتظر ماذا.
 *
 * الصفحة تقرأ `GET /admin/restock/demand` القائم ولا تُنشئ مساراً جديداً،
 * وتكتب موعد التوفر عبر مسار تعديل المنتج نفسه (`restock_at` عمودٌ فيه).
 *
 * [CRITICAL] الإشعار لا يُرسل من هنا. عودة المخزون فوق الصفر هي ما يُطلق
 * إشعار `backInStock` لكل المنتظرين — داخل معاملة تحديث المنتج نفسها، ثم
 * تُفرَّغ الاشتراكات فلا يتكرر التنبيه. موعد التوفر أدناه **معلومة إرشادية
 * للزبون** لا جدولة إرسال؛ لو أرسلنا عند حلوله لأعلَمنا الناس بمنتج قد لا
 * يكون وصل فعلاً.
 */
export default function RestockPage() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<string | null>(null)

  const demand = useQuery({
    queryKey: ['restock-demand'],
    queryFn: listRestockDemand,
  })

  const save = useMutation({
    mutationFn: ({ productId, at }: { productId: string; at: string | null }) =>
      setRestockAt(productId, at),
    onSuccess: async () => {
      setEditing(null)
      // إعادة الجلب لا التعديل المحلي: الخادم قد يكون غيّر أكثر مما أرسلنا.
      await queryClient.invalidateQueries({ queryKey: ['restock-demand'] })
      message.success('حُفظ موعد التوفر المتوقّع')
    },
    onError: (error: Error) => message.error(error.message),
  })

  const rows = demand.data ?? []
  const waiting = rows.reduce((sum, row) => sum + row.subscriberCount, 0)

  const columns = [
    {
      title: 'المنتج',
      key: 'name',
      render: (_: unknown, row: RestockDemandRow) => (
        <Typography.Text strong>{row.name}</Typography.Text>
      ),
    },
    {
      title: 'المنتظرون',
      key: 'count',
      width: 130,
      sorter: (a: RestockDemandRow, b: RestockDemandRow) =>
        a.subscriberCount - b.subscriberCount,
      defaultSortOrder: 'descend' as const,
      render: (_: unknown, row: RestockDemandRow) =>
        row.subscriberCount > 0 ? (
          <Tag color="magenta">{row.subscriberCount}</Tag>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        ),
    },
    {
      title: 'التوفر المتوقّع',
      key: 'restockAt',
      width: 330,
      render: (_: unknown, row: RestockDemandRow) => {
        if (editing !== row.productId) {
          return (
            <Space>
              <Typography.Text type={row.restockAt ? undefined : 'secondary'}>
                {row.restockAt ? formatDateTime(row.restockAt) : 'غير محدّد'}
              </Typography.Text>
              <Button size="small" onClick={() => setEditing(row.productId)}>
                {row.restockAt ? 'تعديل' : 'تحديد'}
              </Button>
              {row.restockAt && (
                <Button
                  size="small"
                  danger
                  loading={save.isPending}
                  onClick={() => save.mutate({ productId: row.productId, at: null })}
                >
                  إلغاء
                </Button>
              )}
            </Space>
          )
        }
        return (
          <Space>
            <DatePicker
              showTime={{ format: 'HH:mm' }}
              format="YYYY-MM-DD HH:mm"
              defaultValue={row.restockAt ? dayjs(row.restockAt) : undefined}
              // موعدٌ في الماضي وعدٌ فات أوانه: يظهر للزبون تاريخاً مضى
              // فيظنّ المتجر مهملاً. المنع هنا وقائي؛ الخادم يبقى الحكم.
              disabledDate={(current: Dayjs) =>
                current && current < dayjs().startOf('day')
              }
              onOk={(value: Dayjs) =>
                save.mutate({ productId: row.productId, at: value.toISOString() })
              }
            />
            <Button size="small" onClick={() => setEditing(null)}>
              تراجع
            </Button>
          </Space>
        )
      },
    },
  ]

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader
        title="طلبات التوفر"
        description="المنتجات النافدة ومن ينتظر عودتها"
        extra={
          <Button
            icon={<ReloadOutlined />}
            onClick={() => demand.refetch()}
            loading={demand.isFetching}
          >
            تحديث
          </Button>
        }
      />

      <Card>
        <Statistic title="زبائن بانتظار منتجات نافدة" value={waiting} />
      </Card>

      {demand.isError ? (
        <Alert type="error" showIcon message="تعذّر جلب طلبات التوفر" />
      ) : (
        <Card>
          <Table<RestockDemandRow>
            rowKey="productId"
            loading={demand.isPending}
            dataSource={rows}
            columns={columns}
            pagination={false}
            locale={{
              emptyText: (
                <EmptyState description="لا يوجد منتج نافد ينتظره زبون حالياً." />
              ),
            }}
            expandable={{
              rowExpandable: (row) => row.subscribers.length > 0,
              expandedRowRender: (row) => (
                <Space wrap size={[8, 8]}>
                  {row.subscribers.map((s, i) => {
                    // نفس مساعد الواتساب الذي تستعمله شاشة الزبائن — لا
                    // نسخة ثانية من قاعدة تحويل الرقم إلى رابط.
                    const chat = whatsappUrl(s.phone)
                    return (
                      <Tag key={`${row.productId}-${i}`} style={{ marginInlineEnd: 0 }}>
                        <Space size={6}>
                          <span>{s.username}</span>
                          <Typography.Text
                            copyable={{ text: s.phone }}
                            style={{ direction: 'ltr' }}
                          >
                            {s.phone}
                          </Typography.Text>
                          {chat && (
                            <Typography.Link
                              href={chat}
                              target="_blank"
                              rel="noreferrer noopener"
                              aria-label={`واتساب ${s.username}`}
                            >
                              <WhatsAppOutlined />
                            </Typography.Link>
                          )}
                        </Space>
                      </Tag>
                    )
                  })}
                </Space>
              ),
            }}
          />
        </Card>
      )}
    </Space>
  )
}
