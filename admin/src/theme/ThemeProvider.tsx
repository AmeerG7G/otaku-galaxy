import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ThemeConfig } from 'antd'
import { brand, selectionTokens, themeConfig as lightThemeConfig } from '../theme'

const THEME_STORAGE_KEY = 'otaku-galaxy-admin-theme'

export type ThemeMode = 'light' | 'dark'

interface ThemeContextValue {
  theme: ThemeMode
  toggleTheme: () => void
  setTheme: (theme: ThemeMode) => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

const darkSuccess = '#3EE09F'

const darkThemeConfig: ThemeConfig = {
  token: {
    colorPrimary: brand.primary,
    colorInfo: brand.info,
    colorSuccess: darkSuccess,
    colorWarning: brand.warning,
    colorError: brand.error,
    colorText: '#EDEAF6',
    colorTextSecondary: '#8E86B8',
    colorTextTertiary: '#6B6390',
    colorTextDisabled: '#6B6390',
    colorBgLayout: '#0B0718',
    colorBgContainer: '#120C24',
    colorBgElevated: '#16102E',
    colorBorder: 'rgba(255,255,255,0.12)',
    colorBorderSecondary: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    borderRadiusLG: 16,
    borderRadiusSM: 8,
    fontFamily: "'Tajawal', 'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif",
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
      bodyBg: '#0B0718',
      headerBg: '#120C24',
      siderBg: '#0B0718',
      triggerBg: '#16102E',
      triggerColor: '#EDEAF6',
    },
    Menu: {
      darkItemBg: 'transparent',
      darkItemColor: '#EDEAF6',
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
      headerBg: '#16102E',
      headerColor: '#8E86B8',
      headerSplitColor: 'transparent',
      rowHoverBg: '#16102E',
      borderColor: 'rgba(255,255,255,0.12)',
    },
    Drawer: {
      colorBgElevated: '#0B0718',
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
      // الثيم الداكن لا يستعمل خوارزمية أنتديب الداكنة، فكانت خلفيات التنبيه
      // فاتحةً (أزرق/وردي باهت) كبقعة ضوء في لوحة داكنة. درجاتٌ شفّافة بدلها.
      colorInfoBg: 'rgba(78, 168, 255, 0.10)',
      colorInfoBorder: 'rgba(78, 168, 255, 0.35)',
      colorWarningBg: 'rgba(255, 176, 46, 0.10)',
      colorWarningBorder: 'rgba(255, 176, 46, 0.35)',
      colorErrorBg: 'rgba(255, 90, 122, 0.10)',
      colorErrorBorder: 'rgba(255, 90, 122, 0.40)',
      colorSuccessBg: 'rgba(62, 224, 159, 0.10)',
      colorSuccessBorder: 'rgba(62, 224, 159, 0.35)',
    },
    Result: {
      iconFontSize: 56,
    },
    Input: {
      colorBgContainer: '#16102E',
      colorBorder: 'rgba(255,255,255,0.12)',
      activeBorderColor: brand.primary,
      hoverBorderColor: 'rgba(255,255,255,0.2)',
    },
    Select: {
      colorBgContainer: '#16102E',
      colorBorder: 'rgba(255,255,255,0.12)',
      activeBorderColor: brand.primary,
      optionSelectedColor: 'rgba(124, 92, 255, 0.18)',
      optionActiveBg: 'rgba(124, 92, 255, 0.12)',
    },
    Dropdown: {
      colorBgElevated: '#120C24',
      colorBorder: 'rgba(255,255,255,0.12)',
    },
    Tooltip: {
      colorTextLightSolid: '#EDEAF6',
    },
    Pagination: {
      ...selectionTokens('#B9B2DA', 'rgba(255,255,255,0.06)')!.Pagination,
      colorBorder: 'rgba(255,255,255,0.12)',
      itemBg: 'transparent',
    },
    Segmented: selectionTokens('#B9B2DA', 'rgba(255,255,255,0.06)')!.Segmented,
    Tabs: {
      colorBorderSecondary: 'rgba(255,255,255,0.12)',
      inkBarColor: brand.primary,
    },
    Breadcrumb: {
      colorText: '#8E86B8',
      colorTextLightSolid: '#EDEAF6',
      separatorColor: '#6B6390',
    },
    Steps: {
      colorBorder: 'rgba(255,255,255,0.12)',
    },
    Progress: {
      colorSuccessBg: darkSuccess,
    },
    Slider: {
      trackBg: 'rgba(255,255,255,0.12)',
    },
    Rate: {
      colorBgContainer: '#16102E',
    },
    Tree: {
      colorBgContainer: '#120C24',
    },
    List: {
      colorBorder: 'rgba(255,255,255,0.12)',
    },
    Spin: {
      colorPrimary: brand.primary,
    },
    Skeleton: {
      colorFill: '#16102E',
      colorFillContent: '#241A54',
    },
  },
}

function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'light'
  }
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') {
      return stored
    }
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark'
    }
  } catch {
  }
  return 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => getInitialTheme())
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') {
      setThemeState(stored)
    }
  }, [])

  useEffect(() => {
    if (!mounted) return
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme, mounted])

  const toggleTheme = () => {
    setThemeState((prev) => (prev === 'light' ? 'dark' : 'light'))
  }

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme)
  }

  const value = useMemo(
    () => ({
      theme,
      toggleTheme,
      setTheme,
    }),
    [theme]
  )

  return (
    <ThemeContext.Provider value={value}>
      <div data-theme={theme} className={theme === 'dark' ? 'dark' : ''}>
        {children}
      </div>
    </ThemeContext.Provider>
  )
}

export { lightThemeConfig, darkThemeConfig }
export type { ThemeConfig }