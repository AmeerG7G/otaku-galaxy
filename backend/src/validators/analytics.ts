import { z } from 'zod';
import { isCalendarDate } from '../services/analytics/calendar.js';

/**
 * مدخلات واجهة التحليلات — نصوص استعلام، فالتحويل صريح هنا (لا `z.coerce` على
 * أجسام JSON — هذه سلاسل URL).
 *
 * المدى محدود: أشهر «YYYY-MM» بحدٍّ أقصى ١٢٠ شهراً، وأيام «YYYY-MM-DD» بحدٍّ أقصى
 * ٤٠٠ يوم — لا مسح تاريخي بلا حدّ.
 */

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const MAX_RANGE_MONTHS = 120;
export const MAX_RANGE_DAYS = 400;

const month = z.string().regex(MONTH_RE, 'الشهر بصيغة YYYY-MM');
const day = z.string().refine(isCalendarDate, 'التاريخ بصيغة YYYY-MM-DD');

function monthIndex(value: string): number {
  const [y, m] = value.split('-').map(Number);
  return y! * 12 + (m! - 1);
}

const monthRange = z
  .object({ from: month, to: month })
  .refine((v) => v.from <= v.to, { message: 'بداية المدى بعد نهايته', path: ['from'] })
  .refine((v) => monthIndex(v.to) - monthIndex(v.from) < MAX_RANGE_MONTHS, {
    message: `المدى أطول من ${MAX_RANGE_MONTHS} شهراً`,
    path: ['to'],
  });

export const analyticsRangeSchema = monthRange;

export const analyticsOverviewSchema = z
  .object({
    from: month,
    to: month,
    compare: z.enum(['none', 'previous', 'year']).default('previous'),
  })
  .superRefine((v, ctx) => {
    const parsed = monthRange.safeParse({ from: v.from, to: v.to });
    if (!parsed.success) for (const issue of parsed.error.issues) ctx.addIssue({ ...issue, code: 'custom' });
  });

export const analyticsSalesSchema = z
  .object({
    granularity: z.enum(['month', 'day']).default('month'),
    from: z.string(),
    to: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.granularity === 'month') {
      const parsed = monthRange.safeParse({ from: v.from, to: v.to });
      if (!parsed.success) for (const issue of parsed.error.issues) ctx.addIssue({ ...issue, code: 'custom' });
      return;
    }
    if (!day.safeParse(v.from).success || !day.safeParse(v.to).success) {
      ctx.addIssue({ code: 'custom', message: 'التاريخ بصيغة YYYY-MM-DD', path: ['from'] });
      return;
    }
    if (v.from > v.to) ctx.addIssue({ code: 'custom', message: 'بداية المدى بعد نهايته', path: ['from'] });
    const days = (Date.parse(`${v.to}T00:00:00Z`) - Date.parse(`${v.from}T00:00:00Z`)) / 86_400_000;
    if (days >= MAX_RANGE_DAYS) ctx.addIssue({ code: 'custom', message: `المدى أطول من ${MAX_RANGE_DAYS} يوماً`, path: ['to'] });
  });

export const analyticsProductsSchema = z
  .object({
    from: month,
    to: month,
    view: z.enum(['top', 'bottom', 'no_sales', 'trending']).default('top'),
    sort: z.enum(['units', 'revenue']).default('units'),
    categoryId: z.string().uuid('معرّف غير صالح').optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .superRefine((v, ctx) => {
    const parsed = monthRange.safeParse({ from: v.from, to: v.to });
    if (!parsed.success) for (const issue of parsed.error.issues) ctx.addIssue({ ...issue, code: 'custom' });
  });

export const analyticsCompareSchema = z.object({ a: month, b: month });
