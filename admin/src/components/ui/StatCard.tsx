import type { ReactNode } from 'react'
import { Card, Flex, Typography } from 'antd'

export type StatTone = 'brand' | 'secondary' | 'cyan' | 'amber' | 'success' | 'error' | 'info'

const TONE_CHIP: Record<StatTone, { bg: string; fg: string }> = {
  brand: { bg: 'rgba(124, 92, 255, 0.12)', fg: 'var(--og-primary)' },
  secondary: { bg: 'rgba(255, 61, 143, 0.12)', fg: 'var(--og-secondary)' },
  cyan: { bg: 'rgba(78, 168, 255, 0.12)', fg: 'var(--og-cyan)' },
  amber: { bg: 'rgba(255, 176, 46, 0.16)', fg: 'var(--og-amber)' },
  success: { bg: 'rgba(34, 176, 125, 0.12)', fg: 'var(--og-success)' },
  error: { bg: 'rgba(255, 90, 122, 0.12)', fg: 'var(--og-error)' },
  info: { bg: 'rgba(43, 121, 194, 0.12)', fg: 'var(--og-info)' },
}

interface StatCardProps {
  title: string
  value: number | string
  icon?: ReactNode
  tone?: StatTone
  hint?: ReactNode
}

/** بطاقة مؤشّر موحّدة — تُستخدم في لوحة الرئىيسية وحسب. */
export function StatCard({ title, value, icon, tone = 'brand', hint }: StatCardProps) {
  const chip = TONE_CHIP[tone]
  return (
    <Card variant="borderless" style={{ height: '100%' }}>
      <Flex align="center" justify="space-between" gap={12} wrap>
        <div style={{ minWidth: 0 }}>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {title}
          </Typography.Text>
          <div style={{ fontWeight: 800, fontSize: 26, lineHeight: 1.3, marginTop: 2 }}>
            <span className="tnum">{value}</span>
          </div>
          {hint && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {hint}
            </Typography.Text>
          )}
        </div>
        {icon && (
          <div
            aria-hidden
            style={{
              width: 46,
              height: 46,
              borderRadius: 14,
              background: chip.bg,
              color: chip.fg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
        )}
      </Flex>
    </Card>
  )
}