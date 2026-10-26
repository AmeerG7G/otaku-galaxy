const NUMBER_FORMATTER = new Intl.NumberFormat('ar-IQ-u-nu-latn', {
  maximumFractionDigits: 0,
})

export function formatCurrency(value: number): string {
  return `${NUMBER_FORMATTER.format(value)} د.ع`
}

/** عدد منتجات الطلب بتمييزه العربي — «١ منتجات» كانت تظهر في كل صفّ. */
export function productCountLabel(count: number): string {
  if (count === 1) return 'منتج واحد'
  if (count === 2) return 'منتجان'
  if (count >= 3 && count <= 10) return `${count} منتجات`
  if (count >= 11 && count <= 99) return `${count} منتجاً`
  return `${count} منتج`
}



export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('ar', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}