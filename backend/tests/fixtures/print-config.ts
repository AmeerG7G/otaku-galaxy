/**
 * يطبع خلاصة الإعدادات كـJSON — يُشغَّل في عملية منفصلة.
 *
 * وحدة الإعدادات تُقيَّم مرة واحدة عند الاستيراد، فاختبار «ماذا يحدث لو نقص
 * JWT_SECRET في الإنتاج؟» لا يمكن أن يجري داخل عملية الاختبارات نفسها.
 * عملية مستقلة لكل حالة هي الطريقة الصادقة الوحيدة لفحص سلوك الإقلاع.
 */
async function main() {
  const { config } = await import('../../src/config/index.js');
  console.log(
    JSON.stringify({
      nodeEnv: config.nodeEnv,
      appEnv: config.appEnv,
      isProduction: config.isProduction,
      devOtpEnabled: config.verification.devOtpEnabled,
      jwtSecretLength: config.jwtSecret.length,
      databaseUrl: config.databaseUrl,
      smsProvider: config.sms.provider,
    }),
  );
}

main().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exit(1);
});
