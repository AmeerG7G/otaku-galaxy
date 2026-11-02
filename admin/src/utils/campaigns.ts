import { AUDIENCE_SEGMENT_LABELS, type AudienceSegment, type Campaign } from '../types/notifications'
import { formatNumber } from './periods'

/** وصف جمهور الحملة — أعدادٌ وشرائح، لا أسماء ولا أرقام. */
export function audienceLabel(campaign: Pick<Campaign, 'audience'>): string {
  const { audience } = campaign
  if (audience.type === 'all') return 'كل الزبائن'
  if (audience.type === 'users') return `زبائن محدَّدون (${formatNumber(audience.userCount ?? 0)})`
  const segment = AUDIENCE_SEGMENT_LABELS[audience.segment as AudienceSegment] ?? audience.segment ?? '—'
  return audience.windowDays ? `${segment} — ${audience.windowDays} يوماً` : segment
}
