import type { ThemeConfig } from 'antd'

/** لوحة المجرّة (مطابقة لتوكنات تطبيق الزبائن في lib/core/design_system). */
export const brand = {
  primary: '#7C5CFF',
  primaryHover: '#9377FF',
  primaryActive: '#6A47F5',
  secondary: '#FF3D8F',
  secondaryHover: '#FF5FA0',
  cyan: '#4EA8FF',
  amber: '#FFB02E',
  success: '#22B07D',
  warning: '#C77A12',
  error: '#FF5A7A',
  info: '#2B79C2',
  aubergine: '#180F30',
  aubergineSoft: '#241743',
  surface: '#FFFFFF',
  surfaceVariant: '#F6F2FE',
  background: '#F7F5FC',
  backgroundSecondary: '#EFE9FB',
  border: 'rgba(24, 15, 48, 0.12)',
  textPrimary: '#180F30',
  textSecondary: '#6F6690',
  textDisabled: '#9C94B8',
  gradient: 'linear-gradient(135deg, #FF3D8F 0%, #7C5CFF 100%)',
  sidebarText: '#E9E4F8',
  sidebarTextMuted: '#9C94B8',
} as const

/**
 * نسق أنتديب بعلامة المجرّة — يُمرَّر لـ ConfigProvider فوق اتجاه RTL الحالي.
 * كل الألوان تُشتق من توكنات التطبيق نفسه حتى تبقى لوحة الإدارة امتداداً بصرياً واحداً.
 */
export const themeConfig: ThemeConfig = {
  token: {
    colorPrimary: brand.primary,
    colorInfo: brand.info,
    colorSuccess: brand.success,
    colorWarning: brand.warning,
    colorError: brand.error,
    colorText: brand.textPrimary,
    colorTextSecondary: brand.textSecondary,
    colorTextTertiary: brand.textDisabled,
    colorTextDisabled: brand.textDisabled,
    colorBgLayout: brand.background,
    colorBgContainer: brand.surface,
    colorBgElevated: brand.surface,
    colorBorder: brand.border,
    colorBorderSecondary: brand.border,
    borderRadius: 10,
    borderRadiusLG: 16,
    borderRadiusSM: 8,
    fontFamily:
      "'Tajawal', 'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif",
    fontSize: 14,
    controlHeight: 38,
    controlHeightSM: 32,
    controlHeightLG: 44,
    lineWidth: 1,
    paddingContentHorizontal: 20,
    paddingContentVertical: 16,
    colorLink: brand.primary,
    colorLinkHover: brand.primaryHover,
  },
  components: {
    Layout: {
      bodyBg: brand.background,
      headerBg: brand.surface,
      siderBg: brand.aubergine,
      triggerBg: brand.aubergineSoft,
      triggerColor: brand.sidebarText,
    },
    Menu: {
      darkItemBg: 'transparent',
      darkItemColor: brand.sidebarText,
      darkItemSelectedBg: brand.primary,
      darkItemHoverBg: 'rgba(124, 92, 255, 0.18)',
      darkSubMenuItemBg: 'transparent',
      itemBorderRadius: 12,
      subMenuItemBorderRadius: 12,
      itemMarginInline: 8,
    },
    Button: {
      fontWeight: 600,
      primaryShadow: '0 6px 18px rgba(124, 92, 255, 0.28)',
      defaultShadow: 'none',
      dangerShadow: 'none',
    },
    Card: {
      borderRadiusLG: 16,
      headerBg: 'transparent',
      paddingLG: 20,
    },
    Table: {
      headerBg: brand.backgroundSecondary,
      headerColor: brand.textSecondary,
      headerSplitColor: 'transparent',
      rowHoverBg: brand.backgroundSecondary,
      borderColor: brand.border,
    },
    Drawer: {
      colorBgElevated: brand.aubergine,
    },
    Modal: {
      borderRadiusLG: 18,
    },
    Statistic: {
      contentFontSize: 28,
    },
    Tag: {
      borderRadiusSM: 8,
    },
    Alert: {
      borderRadiusLG: 12,
    },
    Result: {
      iconFontSize: 56,
    },
  },
}

export { themeConfig as lightThemeConfig }