import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    restoreMocks: true,
    // ميزانية وقتٍ لا تخفيف تحقّق: صفحات antd تحت jsdom تأخذ ~٣ ثوانٍ للاختبار
    // وحدها، والحدّ الافتراضي (٥ ثوانٍ) كان يُسقط ١٠–١٢ اختباراً سليماً حين
    // تتزاحم العمّال على الأنوية — تمرّ كلها منفردة. مثل `testTimeout` الخادم.
    testTimeout: 20_000,
  },
})