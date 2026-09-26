import { useQuery } from '@tanstack/react-query'
import { Card, Descriptions, Space, Table, Tag, Typography } from 'antd'
import { getGalaxyPointsRules } from '../api/pointsApi'
import { formatCurrency } from '../utils/format'
import type { GalaxyLevelRule } from '../types/points'

/**
 * قواعد نقاط المجرّة وسلّم المستويات — **للقراءة فقط**.
 *
 * [CRITICAL] لا حقل قابلاً للتحرير هنا، ولا زرّ حفظ. حلّت هذه البطاقة محل
 * «سلّم المستويات» و«إعدادات النقاط والتقييم» اللتين كانتا تسمحان ببناء
 * السلّم وضبط قيم المنح من المتصفح. تلك القيم صارت قراراً تجارياً مثبَّتاً في
 * الخادم (`src/domain/galaxyPoints.ts`) ولا مسار كتابةٍ يصل إليها.
 *
 * وعرضُها ليس تناقضاً مع تثبيتها: المسؤول يُسأل عنها كل يوم من الزبائن،
 * وإخفاؤها كان سيتركه يجيب بالتخمين.
 */
export default function GalaxyRulesCard() {
  const query = useQuery({
    queryKey: ['admin-galaxy-rules'],
    queryFn: getGalaxyPointsRules,
  })

  const rules = query.data

  const columns = [
    {
      title: '#',
      dataIndex: 'number',
      key: 'number',
      width: 50,
    },
    {
      title: 'المستوى',
      key: 'name',
      render: (_: unknown, row: GalaxyLevelRule) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{row.nameMale}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {/* الصيغة المؤنّثة تُعرض حين تختلف فعلاً — «رحّالة» و«أسطورة»
                لا تتغيّران بالجنس، وتكرارهما هنا ضجيج. */}
            {row.nameFemale !== row.nameMale ? `مؤنّث: ${row.nameFemale}` : 'الصيغة نفسها للجنسين'}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'العتبة',
      dataIndex: 'requiredPoints',
      key: 'requiredPoints',
      width: 90,
      render: (value: number) => <Typography.Text strong>{value}</Typography.Text>,
    },
    {
      title: 'المزيّة',
      key: 'reward',
      render: (_: unknown, row: GalaxyLevelRule) => {
        if (row.rewardKind === 'none') {
          return <Typography.Text type="secondary">—</Typography.Text>
        }
        return (
          <Space direction="vertical" size={0}>
            <Tag color={row.rewardKind === 'gift' ? 'gold' : 'blue'}>
              {row.rewardKind === 'gift' ? 'هدية' : 'خصم'}
            </Tag>
            <Typography.Text style={{ fontSize: 12 }}>{row.rewardLabel}</Typography.Text>
          </Space>
        )
      },
    },
    {
      title: 'القيمة',
      key: 'value',
      width: 150,
      render: (_: unknown, row: GalaxyLevelRule) => {
        if (row.rewardKind === 'gift' && row.giftAmount != null) {
          return formatCurrency(row.giftAmount)
        }
        if (row.rewardKind === 'discount' && row.percent != null) {
          return `${row.percent}% — بحد أقصى ${formatCurrency(row.capAmount ?? 0)}`
        }
        return <Typography.Text type="secondary">—</Typography.Text>
      },
    },
  ]

  return (
    <Card title="قواعد نقاط المجرّة" variant="outlined" loading={query.isPending}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {rules && (
          <Descriptions size="small" column={{ xs: 1, sm: 2, md: 4 }} bordered>
            <Descriptions.Item label="نقاط الشراء">
              {rules.purchase.pointsPerStep} نقاط لكل{' '}
              {formatCurrency(rules.purchase.stepIqd)}
            </Descriptions.Item>
            <Descriptions.Item label="تقييم مكتوب">
              {rules.review.commentPoints} نقطة
            </Descriptions.Item>
            <Descriptions.Item label="إرفاق صور">
              {rules.review.photosPoints} نقاط (مقطوعة، حتى {rules.review.maxPhotos} صور)
            </Descriptions.Item>
            <Descriptions.Item label="سقف التقييم لكل طلب">
              {rules.review.capPerOrder} نقطة
            </Descriptions.Item>
          </Descriptions>
        )}

        <Table
          rowKey="key"
          size="small"
          pagination={false}
          columns={columns}
          dataSource={rules?.levels ?? []}
          scroll={{ x: 720 }}
        />

        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          الباقي دون العتبة يُهمَل ولا يُرحَّل: طلبٌ بـ
          {formatCurrency(19_999)} يمنح {rules?.purchase.pointsPerStep ?? 5} نقاط لا أكثر.
          ولكل منتج تقييم واحد من كل زبون مهما تكرّر شراؤه.
        </Typography.Text>
      </Space>
    </Card>
  )
}
