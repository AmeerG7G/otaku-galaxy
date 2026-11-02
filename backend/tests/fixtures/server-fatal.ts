/**
 * يُقلع الخادم ثم يفتعل رفضاً غير معالَج.
 *
 * الغرض: إثبات أن العملية **تموت** بدل أن تواصل الخدمة بحالة مجهولة.
 * تُستعمل من `tests/process-lifecycle.test.ts`.
 */
import '../../src/server.js';

setTimeout(() => {
  void Promise.reject(new Error('اختبار: رفض غير معالَج'));
}, 400);
