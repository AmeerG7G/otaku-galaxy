import { useState } from 'react'
import { App, Button, Card, Flex, Input, InputNumber, Popconfirm, Space, Table, Typography } from 'antd'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addProductCost, getProductCosts, type ProductCostEntry } from '../api/productCostsApi'
import { formatCurrency, formatDateTime } from '../utils/format'
import { ErrorState } from './ui/States'

/**
 * تكلفة الشراء (D1) — للمسؤول الأعلى وحده (يقرّر الأبُ عرضها؛ الخادم يفرضها).
 *
 * سجلٌّ يُلحق ولا يُعدَّل: التكلفة الجديدة تسري على الطلبات التي تُقبل من الآن،
 * والطلبات المقبولة سابقاً تحتفظ بالتكلفة التي سُجّلت لها لحظة قبولها.
 */
export default function ProductCostCard({ productId }: { productId: string }) {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [unitCost, setUnitCost] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const costs = useQuery({ queryKey: ['product-costs', productId], queryFn: () => getProductCosts(productId) })
  const add = useMutation({
    mutationFn: () => addProductCost(productId, { unitCost: unitCost!, ...(note.trim() ? { note: note.trim() } : {}) }),
    onSuccess: async () => {
      message.success('سُجّلت تكلفة الشراء')
      setUnitCost(null)
      setNote('')
      await queryClient.invalidateQueries({ queryKey: ['product-costs', productId] })
    },
    onError: (error: Error) => {
      // لا تُعاد قيمة `message.error` (thenable يُحسم عند إغلاق الرسالة): React Query
      // ينتظرها، فيبقى الزرّ «يُحمَّل» ثلاث ثوانٍ بعد فشلٍ انتهى فعلاً.
      message.error(error.message)
    },
  })

  return (
    <Card title="تكلفة الشراء" style={{ marginTop: 16 }} data-testid="product-cost-card">
      {costs.isError ? (
        <ErrorState message="تعذّر تحميل تكلفة الشراء" onRetry={() => void costs.refetch()} />
      ) : (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Text>
            التكلفة الحالية:{' '}
            <strong className="tnum">{costs.data?.current ? formatCurrency(costs.data.current.unitCost) : 'غير مسجّلة'}</strong>
          </Typography.Text>
          <Flex gap={8} wrap align="center">
            <InputNumber<number>
              min={0.01}
              max={1_000_000_000}
              precision={2}
              value={unitCost}
              onChange={(value) => setUnitCost(value)}
              placeholder="تكلفة القطعة (د.ع)"
              style={{ width: 200 }}
              aria-label="تكلفة القطعة"
            />
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              placeholder="ملاحظة (اختياري)"
              style={{ width: 240 }}
              aria-label="ملاحظة"
            />
            <Popconfirm
              title="تسجيل تكلفة الشراء"
              description="تسري على الطلبات التي تُقبل من الآن، ولا تُعدَّل بعد تسجيلها."
              okText="تسجيل"
              cancelText="إلغاء"
              onConfirm={() => add.mutate()}
              disabled={!unitCost}
            >
              <Button type="primary" disabled={!unitCost} loading={add.isPending}>
                إضافة تكلفة
              </Button>
            </Popconfirm>
          </Flex>
          <Table<ProductCostEntry>
            rowKey="id"
            size="small"
            loading={costs.isPending}
            dataSource={costs.data?.entries ?? []}
            pagination={false}
            scroll={{ x: 560 }}
            locale={{ emptyText: 'لا تكاليف مسجّلة' }}
            columns={[
              { title: 'التكلفة', dataIndex: 'unitCost', width: 140, render: (v: number) => formatCurrency(v) },
              { title: 'منذ', dataIndex: 'effectiveFrom', width: 170, render: (v: string) => formatDateTime(v) },
              { title: 'أدخلها', dataIndex: 'enteredByName', width: 140, render: (v: string | null) => v ?? '—' },
              { title: 'ملاحظة', dataIndex: 'note', width: 160, render: (v: string | null) => v ?? '—' },
            ]}
          />
        </Space>
      )}
    </Card>
  )
}
