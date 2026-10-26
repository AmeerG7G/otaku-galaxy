import { describe, expect, it } from 'vitest'

/**
 * حارس عرض الهاتف: كل رقمٍ يُرسم في اللوحة يمرّ بـ`PhoneText` أو
 * `formatIraqiPhone`، فيظهر الموبايل العراقي `07…` في كل شاشة.
 *
 * كانت الطلبات تعرض «07…» وتفاصيلها «+9647…» والإشعارات وهدايا المستويات
 * والبثّ «+9647…» — كلٌّ يرسم الحقل الخام بنفسه. الحارس يمنع الأشكال التي
 * عاد بها الرقم الخام: حقلُ هاتف مقحَمٌ في JSX (`{row.phone}`) أو في قالب
 * نصّي (`${customer.phone}`)، ونصُّ نسخٍ مأخوذٌ من الحقل الخام
 * (`copyable={{ text: s.phone }}`).
 *
 * المسموح: تمرير الحقل خاصيّةً (`phone={row.phone}`) — `PhoneText` يعرضه
 * و`WhatsAppButton` يبني منه الرابط الدولي — واستدعاء الدوالّ عليه.
 */

const sources = import.meta.glob<string>(['../**/*.tsx', '!../**/*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

/** حقل هاتف: `phone` كلمةً كاملة أو عضوٌ ينتهي بـ`Phone` (`x.contactPhone`) — لا `formatIraqiPhone`. */
const FIELD = String.raw`[\w?.!]*(?:\bphone|\.\w*Phone)\b`
/** `{x.phone}` و`${x.phone}` و`{x?.phone ?? 'بديل'}` — لا `phone={…}`. */
const RAW_INTERPOLATION = new RegExp(String.raw`(?<!=)\{\s*${FIELD}\s*(?:\?\?[^{}]*)?\}`, 'g')
/** `copyable={{ text: x.phone }}` — ينسخ غير المعروض. */
const RAW_COPY_TEXT = new RegExp(String.raw`\btext:\s*${FIELD}`, 'g')

function offenders(pattern: RegExp) {
  const found: string[] = []
  for (const [path, source] of Object.entries(sources)) {
    for (const match of source.matchAll(pattern)) {
      const line = source.slice(0, match.index).split('\n').length
      found.push(`${path.replace(/^\.\.\//, 'src/')}:${line}  ${match[0]}`)
    }
  }
  return found
}

describe('حارس عرض الهاتف في اللوحة', () => {
  it('الحارس يرى ملفّات اللوحة فعلاً', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(30)
    expect(Object.keys(sources)).toContain('../components/ui/PhoneText.tsx')
  })

  it('لا حقل هاتف خاماً في JSX أو قالب نصّي — PhoneText أو formatIraqiPhone', () => {
    expect(offenders(RAW_INTERPOLATION)).toEqual([])
  })

  it('لا نصّ نسخٍ من الحقل الخام — النسخ ينسخ المعروض', () => {
    expect(offenders(RAW_COPY_TEXT)).toEqual([])
  })

  it('أنماط الحارس تلتقط ما يجب ولا تلتقط المسموح', () => {
    const hits = (pattern: RegExp, text: string) => [...text.matchAll(pattern)].length
    for (const bad of ['{row.phone}', '{ phone }', '${customer.phone}', "{order.customer?.phone ?? 'غير متوفر'}", '{order.contactPhone}']) {
      expect(hits(RAW_INTERPOLATION, bad), bad).toBe(1)
    }
    for (const ok of [
      'phone={row.phone}',
      'phone={order.customer?.phone ?? order.phone}',
      '{formatIraqiPhone(customer.phone)}',
      '${formatIraqiPhone(customer.phone)}',
      '{renderPhone(order)}',
      '{phoneRules}',
      '{ phone: string }',
      '{ ...storedUser, phone: next.phone }',
      "import { formatIraqiPhone } from '../../utils/phone'",
    ]) {
      expect(hits(RAW_INTERPOLATION, ok), ok).toBe(0)
    }
    expect(hits(RAW_COPY_TEXT, 'copyable={{ text: s.phone }}')).toBe(1)
    expect(hits(RAW_COPY_TEXT, 'copyable={{ text: formatIraqiPhone(s.phone) }}')).toBe(0)
  })
})
