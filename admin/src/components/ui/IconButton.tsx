import { Button, Tooltip } from 'antd'
import type { ButtonProps } from 'antd'
import type { ReactNode } from 'react'

interface IconButtonProps extends Omit<ButtonProps, 'icon'> {
  icon: ReactNode
  /** وصف تلميح وأريا — هذا هو العنوان الظاهر هندسياً. */
  tooltip: string
  danger?: boolean
}

/**
 * زر أيقونية قياسية الحجم مع تلميح إلزامي واسم وصولي،
 * بدل الأزرار المصغّرة عديمة التسمية المنتشرة سابقاً.
 */
export function IconButton({ icon, tooltip, danger, size = 'middle', ...rest }: IconButtonProps) {
  return (
    <Tooltip title={tooltip}>
      <Button
        type="text"
        icon={icon}
        danger={danger}
        size={size}
        aria-label={tooltip}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        {...rest}
      />
    </Tooltip>
  )
}