import { describe, expect, it } from 'vitest'
import { currentMonth, formatPercent, isMonth, monthLabel, presetRange, shiftMonth, storeToday } from './periods'

describe('فترات التحليلات', () => {
  it('[CRITICAL] «اليوم» بتوقيت بغداد لا بتوقيت المتصفّح', () => {
    // ٢٠:٥٩:٥٩Z = ٢٣:٥٩:٥٩ بغداد؛ ٢١:٠٠Z = منتصف ليل اليوم التالي.
    expect(storeToday(new Date('2026-09-30T20:59:59Z'))).toBe('2026-09-30')
    expect(storeToday(new Date('2026-09-30T21:00:00Z'))).toBe('2026-10-01')
    expect(currentMonth(new Date('2026-09-30T21:00:00Z'))).toBe('2026-10')
  })

  it('الإزاحة والاختيارات الجاهزة', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-11', 3)).toBe('2027-02')
    const now = new Date('2026-10-04T09:00:00Z')
    expect(presetRange('current', now)).toEqual({ from: '2026-10', to: '2026-10' })
    expect(presetRange('previous', now)).toEqual({ from: '2026-09', to: '2026-09' })
    expect(presetRange('last3', now)).toEqual({ from: '2026-08', to: '2026-10' })
    expect(presetRange('last6', now)).toEqual({ from: '2026-05', to: '2026-10' })
    expect(presetRange('year', now)).toEqual({ from: '2026-01', to: '2026-10' })
    expect(presetRange('prevYear', now)).toEqual({ from: '2025-01', to: '2025-12' })
    expect(presetRange('all', now, '2026-07')).toEqual({ from: '2026-07', to: '2026-10' })
    expect(presetRange('all', now)).toEqual({ from: '2026-10', to: '2026-10' })
  })

  it('أسماء الأشهر العراقية بأرقامٍ لاتينية', () => {
    expect(monthLabel('2026-09')).toContain('أيلول')
    expect(monthLabel('2026-09')).toContain('2026')
    expect(isMonth('2026-13')).toBe(false)
    expect(isMonth('2026-09')).toBe(true)
  })

  it('[CRITICAL] النسبة «—» حين لا تصلح (أساسٌ صفري)', () => {
    expect(formatPercent(null)).toBe('—')
    expect(formatPercent(55.3)).toBe('+55.3%')
    expect(formatPercent(-12)).toBe('−12%')
  })
})
