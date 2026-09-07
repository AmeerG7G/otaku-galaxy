import { Image } from 'antd'
import { resolveMediaUrl } from '../../utils/media'
import { NO_IMAGE_PLACEHOLDER } from './placeholder'

interface MediaThumbProps {
  /** مرجع الوسائط كما يخزّنه الخادم (نسبي أو مطلق). */
  reference?: string | null
  alt?: string
  /** عرض الصندوق — القيمة الواحدة تجعل الصورة مربعة. */
  size?: number
  width?: number
  height?: number
  objectFit?: 'cover' | 'contain'
  radius?: number
}

/**
 * صورة مصغّرة لصفوف الجداول — يكمل مسار الوسائط من الخادم ويسقط إلى
 * الصورة البديلة الموحّدة عند غيابها أو فشلها. بديلٌ متسق لكتل `Image`
 * المكرّرة مع `resolveMediaUrl` في كل صفحة.
 */
export function MediaThumb({
  reference,
  alt = 'صورة',
  size = 52,
  width,
  height,
  objectFit = 'cover',
  radius = 8,
}: MediaThumbProps) {
  const thumbWidth = width ?? size
  const thumbHeight = height ?? size
  return (
    <Image
      src={resolveMediaUrl(reference) ?? NO_IMAGE_PLACEHOLDER}
      alt={alt}
      width={thumbWidth}
      height={thumbHeight}
      style={{
        objectFit,
        borderRadius: radius,
        border: '1px solid var(--og-border)',
      }}
      preview={false}
      fallback={NO_IMAGE_PLACEHOLDER}
    />
  )
}