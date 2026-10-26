import { Card, Flex } from 'antd'
import type { ReactNode } from 'react'

interface DataTableCardProps {
  /** عنوان البطاقة (اختياري — بعض الجداول تُدار بالتبويبات). */
  title?: ReactNode
  /** أدوات علوية مثل فلاتر وأزرار تحديث. */
  toolbar?: ReactNode
  children: ReactNode
  style?: React.CSSProperties
}

/** بطاقة جدول موحّدة — Card + شريط أدوات علوي + محتوى، بهوامش ثابتة. */
export function DataTableCard({ title, toolbar, children, style }: DataTableCardProps) {
  return (
    <Card variant="borderless" style={style}>
      {(title || toolbar) && (
        <Flex
          align="center"
          justify="space-between"
          gap={12}
          wrap
          style={{ marginBottom: 16 }}
        >
          {title && <div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div>}
          {toolbar && <Flex gap={8} wrap align="center">{toolbar}</Flex>}
        </Flex>
      )}
      {children}
    </Card>
  )
}