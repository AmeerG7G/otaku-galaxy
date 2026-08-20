const NUMBER_FORMATTER = new Intl.NumberFormat('ar-IQ-u-nu-latn', {
  maximumFractionDigits: 0,
})

export function formatCurrency(value: number): string {
  return `${NUMBER_FORMATTER.format(value)} د.ع`
}

export function formatNumber(value: number): string {
  return NUMBER_FORMATTER.format(value)
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