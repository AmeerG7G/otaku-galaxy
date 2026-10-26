import { describe, expect, it } from 'vitest'
import { SEMVER_PATTERN, compareVersions } from './appVersion'

/**
 * تحذير اللوحة قبل حفظ حدٍّ أدنى يحجب الجميع.
 *
 * الحكم الملزِم في الخادم؛ هذا يمنع الخطأ الشائع في الواجهة: مقارنةُ نسختين
 * كنصّين، فيبدو `1.10.0` أقدم من `1.9.0` ولا يظهر التحذير حيث يجب.
 */
describe('مقارنة النسخ في اللوحة', () => {
  it('[CRITICAL] 1.10.0 أحدث من 1.9.0 — لا مقارنة نصّية', () => {
    // المقارنة عبر متغيّرين لا حرفَين: القيمتان الحرفيتان تجعلان المقارنة
    // ثابتةً يحسبها المدقّق ويحذّر منها، والمقصود إظهار سلوك المقارنة نفسه.
    const older = '1.10.0'
    const newer = '1.9.0'
    expect(older < newer).toBe(true) // خطأ النصّ، للتوضيح
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1)
    expect(compareVersions('1.9.0', '1.10.0')).toBe(-1)
  })

  it('المتساويتان متساويتان، والترتيب يمرّ على الأجزاء الثلاثة', () => {
    expect(compareVersions('2.3.4', '2.3.4')).toBe(0)
    expect(compareVersions('1.0.1', '1.1.0')).toBe(-1)
    expect(compareVersions('2.0.0', '1.99.99')).toBe(1)
  })

  it('المدخل الفاسد يعيد null فلا يُبنى تحذير على قيمة لم تُفهم', () => {
    expect(compareVersions('v1.2', '1.2.0')).toBeNull()
    expect(compareVersions('', '1.2.0')).toBeNull()
  })

  it('نمط التحقق يقبل الصيغ الصالحة ويرفض غيرها', () => {
    for (const good of ['1.2.3', '0.0.1', '10.20.30', '1.2.3-beta.1', '1.0.0+5']) {
      expect(SEMVER_PATTERN.test(good), good).toBe(true)
    }
    for (const bad of ['1.2', 'v1.2.3', '1.2.3.4', 'abc', '']) {
      expect(SEMVER_PATTERN.test(bad), bad).toBe(false)
    }
  })
})
