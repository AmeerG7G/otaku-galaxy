import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // الراوتي تُحمَّل كسرياً (React.lazy) — الحِزمة الأولية صغيرة.
    // حزمة antd المشتركة تبقى كبيرة بطبيعتها ويُسمح بها هنا؛
    // تقسيمها تفصيلياً لا يُحسّن التحميل الأولي عملياً لأن كل الصفحات تستهلكها.
    chunkSizeWarningLimit: 1100,
  },
})