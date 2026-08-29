import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    /**
     * إعدادات الاختبارات صريحة هنا لا موروثة من `.env`.
     *
     * الرمز الثابت لم يعد يعمل بمجرّد غياب الإعداد، فلا بد أن تطلبه حزمة
     * الاختبارات بنفسها. ووضعه هنا يجعل السويت مستقلاً عن ملف بيئة المطوّر:
     * تعمل كما هي على أي جهاز وفي التكامل المستمر.
     */
    env: {
      NODE_ENV: 'test',
      DEV_OTP_ENABLED: 'true',
      DEV_OTP_CODE: '123456',
      SMS_PROVIDER: 'noop',
    },
    globalSetup: ['./tests/global-setup.ts'],
    testTimeout: 15_000,
    hookTimeout: 30_000,
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});