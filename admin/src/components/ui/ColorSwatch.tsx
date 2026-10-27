import { HEX_COLOR } from '../variantFields'

/** مربّع اللون — يُرسم من الرمز إن كان صالحاً. */
export function ColorSwatch({ hex, size = 16 }: { hex: string | null | undefined; size?: number }) {
  if (!hex || !HEX_COLOR.test(hex)) return null
  return (
    <span
      aria-hidden
      data-testid="color-swatch"
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: 4,
        background: hex,
        border: '1px solid var(--og-border, #d9d9d9)',
        verticalAlign: 'middle',
        flex: 'none',
      }}
    />
  )
}
