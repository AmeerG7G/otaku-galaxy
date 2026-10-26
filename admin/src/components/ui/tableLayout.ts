import type { TableProps } from 'antd'
import { APP_HEADER_HEIGHT } from '../../layouts/metrics'

/**
 * رأسٌ لاصق تحت شريط اللوحة، وشريطُ تمريرٍ أفقي لاصقٌ أسفل الشاشة.
 *
 * بلا هذا يقع الشريط الأفقي الوحيد للجدول تحت آخر صفّ — ٤٨٤px تحت حافة
 * شاشة ٧٦٨ في «الطلبات» — فيرى المسؤول نصف الجدول ولا شيء يدلّه على البقية.
 * يعمل فقط لأن `main` يقصّ بـ`clip` لا `hidden` (انظر `AppLayout`).
 */
export const STICKY_TABLE = { offsetHeader: APP_HEADER_HEIGHT } as const

/** عمودٌ بلا عرضٍ صريح يُحسب بهذا العرض في ميزانية التمرير. */
const DEFAULT_COLUMN_WIDTH = 160
/** عمود أيقونة التوسيع (`expandable`). */
const EXPAND_COLUMN_WIDTH = 48

type Columns<T> = NonNullable<TableProps<T>['columns']>

/**
 * العرض الطبيعي للجدول = مجموع أعمدته.
 *
 * [CRITICAL] هذا ما يجعل الجدول حاوية تمريرٍ أفقي بذاته. جدولٌ بلا `scroll.x`
 * يُضغط في عرض البطاقة: الأعمدة ذات العرض الثابت تأخذ حصّتها ويُسحق الباقي
 * إلى ٤٠px (الاسم والرقم يتكسّران حرفاً حرفاً)، وما يتبقّى فائضاً يخرج من
 * البطاقة فيقصّه المحتوى — فلا تمرير ولا رؤية («طلبات الحساب»).
 */
export function tableScrollWidth<T>(columns: Columns<T> | undefined, extra: { expandable?: boolean } = {}): number {
  let total = extra.expandable ? EXPAND_COLUMN_WIDTH : 0
  for (const column of columns ?? []) {
    if ('children' in column && column.children) {
      total += tableScrollWidth(column.children as Columns<T>)
    } else if (typeof column.width === 'number') {
      total += column.width
    } else {
      total += DEFAULT_COLUMN_WIDTH
    }
  }
  return total
}
