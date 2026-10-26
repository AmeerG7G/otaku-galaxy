import { Button, Tooltip } from 'antd'
import type { ButtonProps } from 'antd'
import { WhatsAppOutlined } from '@ant-design/icons'
import { whatsappUrl } from '../../utils/phone'

/**
 * زرّ واتساب الموحّد — المفهوم نفسه في الزبائن وطلبات الحساب والطلبات.
 *
 * يفتح محادثةً فارغة مع الرقم الفعلي (مطبَّعاً بقاعدة الموبايل العراقي). رقمٌ
 * غائب أو غير صالح أو مقنَّع ⇒ زرٌّ معطَّل مع سببٍ ظاهر، لا رابطٌ معطوب.
 */
export function WhatsAppButton({
  phone,
  label = 'واتساب',
  ...button
}: { phone: string | null | undefined; label?: string } & Omit<ButtonProps, 'href' | 'icon'>) {
  const url = whatsappUrl(phone)
  const control = (
    <Button
      size="small"
      icon={<WhatsAppOutlined />}
      disabled={!url}
      href={url ?? undefined}
      target="_blank"
      rel="noreferrer noopener"
      {...button}
    >
      {label}
    </Button>
  )
  return url ? control : <Tooltip title="لا رقم واتساب صالح لهذا الزبون">{control}</Tooltip>
}
