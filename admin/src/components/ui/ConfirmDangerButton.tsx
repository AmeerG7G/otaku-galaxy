import { Button, Popconfirm } from 'antd'
import type { ButtonProps } from 'antd'

interface ConfirmDangerButtonProps extends ButtonProps {
  title?: string
  description?: string
  confirmText?: string
  cancelText?: string
  onConfirm?: () => void
  confirmLoading?: boolean
}

/**
 * زر حذف خطير مدعوم بتأكيد — كل الإجراءات المدمرة في اللوحة تستخدمه
 * لضمان تأكيدٍ صريح قبل الحذف. النص الافتراضي عربي ومباشر.
 */
export function ConfirmDangerButton({
  title = 'تأكيد الحذف',
  description = 'هذا الإجراء لا يمكن التراجع عنه.',
  confirmText = 'حذف',
  cancelText = 'إلغاء',
  onConfirm,
  confirmLoading,
  children,
  ...rest
}: ConfirmDangerButtonProps) {
  return (
    <Popconfirm
      title={title}
      description={description}
      okText={confirmText}
      cancelText={cancelText}
      okButtonProps={{ danger: true, loading: confirmLoading }}
      onConfirm={onConfirm}
    >
      <Button danger {...rest}>
        {children}
      </Button>
    </Popconfirm>
  )
}