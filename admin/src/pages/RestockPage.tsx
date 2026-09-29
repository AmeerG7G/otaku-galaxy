import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, App, Button, Card, DatePicker, Flex, Space, Statistic, Tag, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { listRestockDemand, setRestockAt, type RestockDemandRow } from '../api/restockApi'
import EmptyState from '../components/EmptyState'
import { formatDateTime } from '../utils/format'
import { PageHeader } from '../components/ui/PageHeader'
import { ProductLink } from '../components/ui/ProductLink'
import { ResponsiveTable } from '../components/ui/ResponsiveTable'
import { WhatsAppButton } from '../components/ui/WhatsAppButton'

/**
 * طلبات التوفر — من ينتظر ماذا.
 *
 * الصفحة تقرأ `GET /admin/restock/demand` وتكتب موعد التوفر عبر المسار الضيّق
 * `PATCH /admin/restock/:id/schedule` (STEP 64).
 *
 * [CRITICAL] الإشعار لا يُرسل من هنا. عودة المخزون فوق الصفر هي ما يُطلق
 * إشعار `backInStock` لكل المنتظرين — داخل معاملة تحديث المنتج نفسها، ثم
 * تُفرَّغ الاشتراكات فلا يتكرر التنبيه. موعد التوفر أدناه **معلومة إرشادية
 * للزبون** لا جدولة إرسال؛ لو أرسلنا عند حلوله لأعلَمنا الناس بمنتج قد لا
 * يكون وصل فعلاً.
 *
 * على الهاتف كان الجدول بعمود تاريخٍ عرضه 330 يُقصّ بلا تمرير. الآن بطاقةٌ
 * لكل منتج فيها المنتظرون وأزرار واتساب ومحرّر الموعد.
 */
export default function RestockPage() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<{ productId: string; draft: Dayjs | null } | null>(null)

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
  const savingRow = (productId: string) => save.isPending && save.variables?.productId === productId

  const count = (row: RestockDemandRow) =>
    row.subscriberCount > 0 ? (
      <Tag color="magenta" style={{ marginInlineEnd: 0, flexShrink: 0 }}>
        {row.subscriberCount} ينتظرون
      </Tag>
    ) : (
      <Typography.Text type="secondary">—</Typography.Text>
    )

  /**
   * محرّر الموعد: الاختيار يضع مسودّة، و«حفظ» يرسلها — حفظٌ صريح لا ضمني.
   *
   * كان الحفظ عند «موافق» داخل المنتقي وحده: اختيار تاريخٍ ثم النقر خارجه لا
   * يحفظ شيئاً بلا أي إشارة. والحفظ عند كل تغيير لا يصلح أيضاً: كل حفظ يُشعر
   * المنتظرين، فتغيير اليوم ثم الساعة كان سيرسل إشعارين.
   */
  const scheduleEditor = (row: RestockDemandRow, block = false) => {
    if (editing?.productId !== row.productId) {
      return (
        <Flex gap={8} wrap align="center">
          <Typography.Text type={row.restockAt ? undefined : 'secondary'}>
            {row.restockAt ? formatDateTime(row.restockAt) : 'غير محدّد'}
          </Typography.Text>
          <Button
            size="small"
            onClick={() => setEditing({ productId: row.productId, draft: row.restockAt ? dayjs(row.restockAt) : null })}
          >
            {row.restockAt ? 'تعديل' : 'تحديد'}
          </Button>
          {row.restockAt && (
            <Button
              size="small"
              danger
              loading={savingRow(row.productId)}
              onClick={() => save.mutate({ productId: row.productId, at: null })}
            >
              إلغاء الموعد
            </Button>
          )}
        </Flex>
      )
    }
    return (
      <Flex gap={8} wrap align="center" vertical={block}>
        <DatePicker
          showTime={{ format: 'HH:mm' }}
          format="YYYY-MM-DD HH:mm"
          needConfirm={false}
          value={editing.draft}
          style={block ? { width: '100%' } : undefined}
          // موعدٌ في الماضي وعدٌ فات أوانه: يظهر للزبون تاريخاً مضى
          // فيظنّ المتجر مهملاً. المنع هنا وقائي؛ الخادم يبقى الحكم.
          disabledDate={(current: Dayjs) => current && current < dayjs().startOf('day')}
          onChange={(value) => setEditing({ productId: row.productId, draft: value })}
        />
        <Flex gap={8}>
          <Button
            size="small"
            type="primary"
            disabled={!editing.draft}
            loading={savingRow(row.productId)}
            onClick={() => editing.draft && save.mutate({ productId: row.productId, at: editing.draft.toISOString() })}
          >
            حفظ
          </Button>
          <Button size="small" onClick={() => setEditing(null)}>
            تراجع
          </Button>
        </Flex>
      </Flex>
    )
  }

  const subscribers = (row: RestockDemandRow) => (
    <Flex vertical gap={8}>
      {row.subscribers.map((s, i) => (
        <Flex key={`${row.productId}-${i}`} justify="space-between" align="center" gap={8} wrap>
          <Space direction="vertical" size={0} style={{ minWidth: 0 }}>
            <Typography.Text>{s.username}</Typography.Text>
            <Typography.Text type="secondary" copyable={{ text: s.phone }} style={{ direction: 'ltr' }}>
              {s.phone}
            </Typography.Text>
          </Space>
          {/* نفس زرّ واتساب في الزبائن والطلبات — قاعدة الرقم واحدة. */}
          <WhatsAppButton phone={s.phone} aria-label={`واتساب ${s.username}`} />
        </Flex>
      ))}
    </Flex>
  )

  const columns = [
    {
      title: 'المنتج',
      key: 'name',
      render: (_: unknown, row: RestockDemandRow) => <ProductLink productId={row.productId} name={row.name} />,
    },
    {
      title: 'المنتظرون',
      key: 'count',
      width: 130,
      sorter: (a: RestockDemandRow, b: RestockDemandRow) => a.subscriberCount - b.subscriberCount,
      defaultSortOrder: 'descend' as const,
      render: (_: unknown, row: RestockDemandRow) => count(row),
    },
    {
      title: 'التوفر المتوقّع',
      key: 'restockAt',
      width: 360,
      render: (_: unknown, row: RestockDemandRow) => scheduleEditor(row),
    },
  ]

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader
        title="طلبات التوفر"
        description="المنتجات النافدة ومن ينتظر عودتها"
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => demand.refetch()} loading={demand.isFetching}>
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
        <Card styles={{ body: { padding: 12 } }}>
          <ResponsiveTable<RestockDemandRow>
            rowKey="productId"
            loading={demand.isPending}
            dataSource={[...rows].sort((a, b) => b.subscriberCount - a.subscriberCount)}
            columns={columns}
            pagination={false}
            locale={{ emptyText: <EmptyState description="لا يوجد منتج نافد ينتظره زبون حالياً." /> }}
            expandable={{
              rowExpandable: (row) => row.subscribers.length > 0,
              expandedRowRender: (row) => subscribers(row),
            }}
            renderCard={(row) => (
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Flex justify="space-between" align="flex-start" gap={8}>
                  <ProductLink productId={row.productId} name={row.name} />
                  {count(row)}
                </Flex>
                <div>
                  <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                    التوفر المتوقّع
                  </Typography.Text>
                  {scheduleEditor(row, true)}
                </div>
                {row.subscribers.length > 0 && (
                  <div>
                    <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
                      المنتظرون
                    </Typography.Text>
                    {subscribers(row)}
                  </div>
                )}
              </Space>
            )}
          />
        </Card>
      )}
    </Space>
  )
}
