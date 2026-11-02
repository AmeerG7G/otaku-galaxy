import { describe, expect, it } from 'vitest'

/**
 * حارس استدعاءات `useMutation`: لا يُرجع `onError`/`onSuccess`/`onSettled`/`onMutate`
 * تنبيهاً من أنتديب.
 *
 * React Query ينتظر ما يُرجعه كلٌّ منها قبل أن يُنهي الطلب، و`message.error(...)`
 * (ومثله `modal.confirm(...)`) يُرجع وعداً لا يُحلّ إلا عند إغلاق التنبيه (~3
 * ثوانٍ). فالدالّة السهمية المختصرة `(error) => message.error(error.message)`
 * كانت تُبقي الطلب `isPending` والزرّ يدور ويبتلع النقرات بعد أن فشل الطلب فعلاً.
 * الصحيح جسمٌ بين قوسين لا يُرجع شيئاً:
 *
 *     onError: (error: Error) => {
 *       message.error(error.message)
 *     },
 *
 * السلوك نفسه مثبَتٌ في واجهةٍ حقيقية في `RestockPage.test.tsx`.
 */

const sources = import.meta.glob<string>(['./**/*.{ts,tsx}', '!./**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

/** `onError: (e) => message.error(…)` و`onSuccess: async () =>\n modal.confirm(…)` — لا الجسم بين قوسين. */
const RETURNED_TOAST =
  /\bon(?:Mutate|Success|Error|Settled)\s*:\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>\s*(?:message|modal|notification)\s*\./g

function offenders() {
  const found: string[] = []
  for (const [path, source] of Object.entries(sources)) {
    for (const match of source.matchAll(RETURNED_TOAST)) {
      const line = source.slice(0, match.index).split('\n').length
      found.push(`${path.replace(/^\.\//, 'src/')}:${line}  ${match[0].replace(/\s+/g, ' ')}`)
    }
  }
  return found
}

describe('حارس تنبيهات استدعاءات useMutation', () => {
  it('الحارس يرى ملفّات اللوحة فعلاً', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(30)
    expect(Object.keys(sources)).toContain('./pages/RestockPage.tsx')
  })

  it('لا استدعاء يُرجع وعد تنبيه — جسمٌ بين قوسين', () => {
    expect(offenders()).toEqual([])
  })

  it('نمط الحارس يلتقط ما يجب ولا يلتقط المسموح', () => {
    const hits = (text: string) => [...text.matchAll(RETURNED_TOAST)].length
    for (const bad of [
      'onError: (error: Error) => message.error(error.message),',
      "onError: (error) =>\n      message.error(error instanceof ApiError ? error.message : 'x'),",
      "onSuccess: () => message.success('حُفظ'),",
      'onSettled: async () => modal.info({}),',
      'onError: e => message.error(e.message),',
    ]) {
      expect(hits(bad), bad).toBe(1)
    }
    for (const ok of [
      'onError: (error: Error) => {\n  message.error(error.message)\n},',
      "onSuccess: () => done('أُنشئ المسؤول'),",
      'onSuccess: invalidate,',
      'onError: (error: Error) => setProblem(error.message),',
      "onClick={() => message.info('x')}",
    ]) {
      expect(hits(ok), ok).toBe(0)
    }
  })
})
