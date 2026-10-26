import type { ReactNode } from 'react'
import { Flex, Typography } from 'antd'

interface PageHeaderProps {
  title: string
  description?: ReactNode
  /** أزرار/أدوات القسم العلوي. */
  extra?: ReactNode
}

/** رأس الصفحة الموحّد — العنوان والوصف والأدوات في تسلسل واضح. */
export function PageHeader({ title, description, extra }: PageHeaderProps) {
  return (
    <Flex
      align={description ? 'flex-start' : 'center'}
      justify="space-between"
      wrap
      gap={12}
      style={{ marginBottom: 20 }}
    >
      <div style={{ minWidth: 0 }}>
        <Typography.Title level={3} style={{ margin: 0, fontWeight: 800 }}>
          {title}
        </Typography.Title>
        {description && (
          <Typography.Text type="secondary" style={{ display: 'block', marginTop: 2 }}>
            {description}
          </Typography.Text>
        )}
      </div>
      {extra && (
        <Flex gap={8} wrap align="center">
          {extra}
        </Flex>
      )}
    </Flex>
  )
}