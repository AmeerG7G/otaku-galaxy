import { useThemeMode } from '../../theme/ThemeProvider'

/**
 * ألوان المخطّطات — لوحة المرجع (`dataviz` palette.md)، ثلاث خانات بترتيبٍ ثابت،
 * مُتحقَّق منها على سطحَي اللوحة: الفاتح #FFFFFF والداكن #120C24 (كل الأزواج:
 * CVD ΔE ≥ 9.2، الرؤية العادية ≥ 20.9). الخانة الثالثة في الفاتح دون 3:1 →
 * «قاعدة الإغاثة»: كل مخطّط يحمل وسيلة إيضاح وجدولاً بديلاً.
 *
 * اللون يتبع الكيان لا ترتيبه: «الإيراد» هو الخانة ١ دائماً، «الإجمالي» ٢…
 * والنصوص بألوان النص لا بلون السلسلة.
 */
export interface ChartTheme {
  series: [string, string, string]
  text: string
  textMuted: string
  grid: string
  surface: string
}

const LIGHT: ChartTheme = {
  series: ['#2a78d6', '#eb6834', '#1baf7a'],
  text: '#180F30',
  textMuted: '#6F6690',
  grid: '#ECE8F6',
  surface: '#FFFFFF',
}

const DARK: ChartTheme = {
  series: ['#3987e5', '#d95926', '#199e70'],
  text: '#EDEAF6',
  textMuted: '#8E86B8',
  grid: '#241C3E',
  surface: '#120C24',
}

export function chartTheme(mode: 'light' | 'dark'): ChartTheme {
  return mode === 'dark' ? DARK : LIGHT
}

export function useChartTheme(): ChartTheme {
  return chartTheme(useThemeMode())
}
