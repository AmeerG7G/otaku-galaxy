import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { App as AntApp, ConfigProvider } from 'antd'
import arEG from 'antd/locale/ar_EG'
import App from './App'
import { createQueryClient } from './queryClient'
import { lightThemeConfig } from './theme'
import { darkThemeConfig } from './theme/ThemeProvider'
import { ThemeProvider } from './theme/ThemeProvider'
import { useTheme } from './theme/ThemeProvider'
import './index.css'

const queryClient = createQueryClient()

function ThemedApp() {
  const { theme } = useTheme()
  const antdTheme = theme === 'dark' ? darkThemeConfig : lightThemeConfig
  return (
    <ConfigProvider direction="rtl" locale={arEG} theme={antdTheme}>
      <AntApp>
        <App />
      </AntApp>
    </ConfigProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ThemedApp />
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
)
