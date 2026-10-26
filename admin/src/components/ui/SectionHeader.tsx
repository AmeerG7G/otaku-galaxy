import { Flex, Typography } from 'antd'
import type { ReactNode } from 'react'

interface SectionHeaderProps {
  title: ReactNode
  description?: ReactNode
  extra?: ReactNode
}

/** عنوان قسم داخل بطاقة/لوحة — مع سطر أكّاد بنفسجي خفيف يميّز التجميع. */
export function SectionHeader({ title, description, extra }: SectionHeaderProps) {
  return (
    <Flex
      align={description ? 'flex-start' : 'center'}
      justify="space-between"
      gap={8}
      wrap
      style={{ marginBottom: 16 }}
    >
      <div
        style={{
          borderInlineStart: '3px solid var(--og-primary)',
          paddingInlineStart: 10,
          minWidth: 0,
        }}
      >
        <Typography.Text strong style={{ fontSize: 15, display: 'block' }}>
          {title}
        </Typography.Text>
        {description && (
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {description}
          </Typography.Text>
        )}
      </div>
      {extra && <Flex gap={8} align="center">{extra}</Flex>}
    </Flex>
  )
}