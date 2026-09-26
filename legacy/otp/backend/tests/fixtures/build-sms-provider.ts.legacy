/**
 * يبني مزوّد الرسائل من البيئة ويطبع النتيجة — عملية منفصلة لنفس سبب
 * `print-config.ts` (الإعدادات تُقرأ عند الاستيراد).
 */
async function main() {
  const { createSmsProvider } = await import('../../src/services/sms/index.js');
  const provider = createSmsProvider();
  console.log(JSON.stringify({ name: provider.name }));
}

main().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exit(1);
});
