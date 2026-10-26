/** صف بنر كما يحتاجه إعادة الترقيم (من استعلام القفل أو التطبيق). */
export interface PlacementRow {
  id: string;
  sortOrder: number;
  createdAt: Date | string;
}

/** نتيجة إعادة الترقيم — أوامر نهائية بلا تكرار داخل الموضع. */
export interface AssignedOrder {
  id: string;
  sortOrder: number;
}

/**
 * ترقيم كثيف (0..n-1) لبنرات موضع واحد بعد تثبيت بنرٍ عند ترتيب مطلوب.
 *
 * الدلالة: «الترتيب المطلوب 0 = البنر الأساسي». إخراج أي بنر من مكانه
 * يزيح ما بعده خطوة واحدة (تثبيت عند 0 يجعل الأولَ التالي 1 والثاني 2…).
 * تثبيت عند رقم أكبر من حجم القائمة يعني «في النهاية» — لا فجوات بعد اليوم
 * (فجوةُ كانت تجعل «شفرة» ترتيب تتسرب إلى الترتيب الفعلي).
 *
 * دالة خالصة بلا قرص ولا وقت: يُحاك في الاختبارات كلُّ حالات النقل بلا
 * اعتماد على قاعدة بيانات.
 */
export function renumberPlacement(
  rows: PlacementRow[],
  movedId: string,
  targetOrder: number,
): AssignedOrder[] {
  const stamp = (r: PlacementRow) =>
    r.createdAt instanceof Date ? r.createdAt.getTime() : new Date(r.createdAt).getTime();

  // الترتيب ثم أقدم إنشاءً ثم أقدم معرّفاً — حتمي حتى لو تساوى الترتيب والتاريخ.
  const sorted = [...rows].sort((a, b) => {
    const byOrder = a.sortOrder - b.sortOrder;
    if (byOrder !== 0) return byOrder;
    const byDate = stamp(a) - stamp(b);
    if (byDate !== 0) return byDate;
    return a.id.localeCompare(b.id);
  });

  const moved = sorted.find((row) => row.id === movedId);
  const others = sorted.filter((row) => row.id !== movedId);
  const insertAt = Math.max(0, Math.min(targetOrder, others.length));

  const finalList = moved
    ? [...others.slice(0, insertAt), moved, ...others.slice(insertAt)]
    : others;

  return finalList.map((row, index) => ({ id: row.id, sortOrder: index }));
}