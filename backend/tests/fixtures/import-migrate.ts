/**
 * يستورد مُشغّل الهجرات ولا يستدعي منه شيئاً — يُشغَّل في عملية منفصلة.
 *
 * هذا حرفياً ما يفعله `tests/global-setup.ts` و`scripts/seed.ts`: استيرادُ
 * `runMigrations` لاستعمالٍ لاحق. الاختبار يراقب ما يصيب القاعدة أثناء
 * الاستيراد **وحده**، فلو طُرق بابها هنا فالذنب ذنب الوحدة لا المستورِد.
 *
 * عملية مستقلة لا استيراد داخل الاختبار: الوحدة تُقيَّم مرة واحدة في كل
 * عملية، و`config` الذي تعتمد عليه يُقرأ عند الاستيراد، فلا سبيل إلى توجيه
 * `DATABASE_URL` نحو الطُّعم إلا ببيئة عمليةٍ جديدة.
 */
async function main() {
  const mod = await import('../../scripts/migrate.js');
  console.log(JSON.stringify({ exports: Object.keys(mod).sort() }));
}

main().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exit(1);
});
